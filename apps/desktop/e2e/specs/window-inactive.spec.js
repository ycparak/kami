import { ok, strictEqual } from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const SESSION_FILE = resolve(homedir(), "Library/Application Support/com.kami.e2e/sessions.json");

async function waitForMount() {
  await $('button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]').waitForExist({
    timeout: 15_000,
  });
}

function activate(target) {
  execSync(`osascript -e 'tell application ${target} to activate'`);
}

// Activation by bundle id is asynchronous and the app is launched straight out of a build
// directory, so a fixed pause races the real focus change. Wait for the state instead.
async function activateAndWait(target, focused) {
  activate(target);
  // document.hasFocus() flips before Tauri's focus event lands, and it is that event -- not
  // the DOM -- that drives data-window-inactive and therefore the dimmed chrome colours.
  // Wait for both so the assertions do not race the attribute.
  await browser
    .waitUntil(
      async () => {
        const state = await browser.execute(() => ({
          hasFocus: document.hasFocus(),
          inactive: document.documentElement.hasAttribute("data-window-inactive"),
        }));
        return state.hasFocus === focused && state.inactive === !focused;
      },
      {
        timeout: 10_000,
        interval: 200,
        timeoutMsg: `window never became ${focused ? "focused" : "unfocused"}`,
      },
    )
    .catch(() => {});
  await browser.pause(400);
}

function readChrome() {
  return browser.execute(() => {
    const toggle = document.querySelector(
      'button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]',
    );
    const action = document.querySelector(".empty-state-action");
    const chip = document.querySelector(".empty-state-shortcut");
    return {
      inactiveAttr: document.documentElement.hasAttribute("data-window-inactive"),
      hasFocus: document.hasFocus(),
      toggleColor: toggle ? getComputedStyle(toggle).color : null,
      actionColor: action ? getComputedStyle(action).color : null,
      chipColor: chip ? getComputedStyle(chip).color : null,
      chipBg: chip ? getComputedStyle(chip).backgroundColor : null,
    };
  });
}

describe("inactive window chrome", () => {
  let savedSession = null;

  before(async () => {
    savedSession = existsSync(SESSION_FILE) ? readFileSync(SESSION_FILE, "utf8") : null;
    writeFileSync(SESSION_FILE, JSON.stringify({}));
    await waitForMount();
    await browser.execute(() => window.location.reload());
    await waitForMount();
    if (await $('button[aria-label="Hide sidebar"]').isExisting()) {
      await $('button[aria-label="Hide sidebar"]').click();
      await browser.pause(400);
    }
  });

  // This spec seeds an empty session and collapses the sidebar to reach the empty state.
  // Both are persisted, so leaving them behind breaks whichever spec runs first next time.
  after(async () => {
    if (await $('button[aria-label="Show sidebar"]').isExisting()) {
      await $('button[aria-label="Show sidebar"]').click();
      await browser.pause(400);
    }
    if (savedSession !== null) writeFileSync(SESSION_FILE, savedSession);
  });

  it("tracks real window activation", async () => {
    await activateAndWait('id "com.kami.e2e"', true);
    const active = await readChrome();
    strictEqual(active.hasFocus, true, "app should be focused");
    strictEqual(active.inactiveAttr, false, "no inactive attribute while focused");

    await activateAndWait('"Finder"', false);
    const inactive = await readChrome();
    strictEqual(inactive.hasFocus, false, "app should have lost focus");
    strictEqual(inactive.inactiveAttr, true, "inactive attribute while unfocused");

    await activateAndWait('id "com.kami.e2e"', true);
    strictEqual((await readChrome()).inactiveAttr, false, "attribute clears on refocus");
  });

  it("dims icon, label and shortcut to one flat colour", async () => {
    await activateAndWait('"Finder"', false);
    const s = await readChrome();

    ok(s.toggleColor, "toggle should be styled");
    strictEqual(s.toggleColor, s.actionColor, "icon and label must match");
    strictEqual(s.actionColor, s.chipColor, "label and shortcut must match");
    ok(
      /rgba?\(255,\s*255,\s*255/.test(s.actionColor),
      `expected a translucent white, got ${s.actionColor}`,
    );
    ok(s.chipBg !== "rgba(0, 0, 0, 0)", "chip keeps a (dimmed) surface");

    await activateAndWait('id "com.kami.e2e"', true);
    const back = await readChrome();
    ok(back.toggleColor !== s.toggleColor, "colour returns on refocus");
  });
});
