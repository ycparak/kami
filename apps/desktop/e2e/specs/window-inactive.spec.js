import { ok, strictEqual } from "node:assert/strict";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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
  before(async () => {
    writeFileSync(SESSION_FILE, JSON.stringify({}));
    await waitForMount();
    await browser.execute(() => window.location.reload());
    await waitForMount();
    if (await $('button[aria-label="Hide sidebar"]').isExisting()) {
      await $('button[aria-label="Hide sidebar"]').click();
      await browser.pause(400);
    }
  });

  it("tracks real window activation", async () => {
    activate('id "com.kami.e2e"');
    await browser.pause(1200);
    const active = await readChrome();
    strictEqual(active.hasFocus, true, "app should be focused");
    strictEqual(active.inactiveAttr, false, "no inactive attribute while focused");

    activate('"Finder"');
    await browser.pause(1200);
    const inactive = await readChrome();
    strictEqual(inactive.hasFocus, false, "app should have lost focus");
    strictEqual(inactive.inactiveAttr, true, "inactive attribute while unfocused");

    activate('id "com.kami.e2e"');
    await browser.pause(1200);
    strictEqual((await readChrome()).inactiveAttr, false, "attribute clears on refocus");
  });

  it("dims icon, label and shortcut to one flat colour", async () => {
    activate('"Finder"');
    await browser.pause(1200);
    const s = await readChrome();

    ok(s.toggleColor, "toggle should be styled");
    strictEqual(s.toggleColor, s.actionColor, "icon and label must match");
    strictEqual(s.actionColor, s.chipColor, "label and shortcut must match");
    ok(
      /rgba?\(255,\s*255,\s*255/.test(s.actionColor),
      `expected a translucent white, got ${s.actionColor}`,
    );
    ok(s.chipBg !== "rgba(0, 0, 0, 0)", "chip keeps a (dimmed) surface");

    activate('id "com.kami.e2e"');
    await browser.pause(1000);
    const back = await readChrome();
    ok(back.toggleColor !== s.toggleColor, "colour returns on refocus");
  });
});
