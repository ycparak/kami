import { ok, strictEqual } from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const E2E_WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SESSION_FILE = resolve(homedir(), "Library/Application Support/com.kami.e2e/sessions.json");

function seedEmptySession() {
  writeFileSync(SESSION_FILE, JSON.stringify({}));
}

async function waitForMount() {
  await $('button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]').waitForExist({
    timeout: 15_000,
  });
}

async function reload() {
  await browser.execute(() => window.location.reload());
  await waitForMount();
  await browser.pause(600);
}

function readEmptyState() {
  return browser.execute(() => {
    const backdrop = document.querySelector(".empty-state-backdrop");
    const image = document.querySelector(".empty-state-image");
    const foreground = document.querySelector(".empty-state-foreground");
    const toggle = document.querySelector(
      'button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]',
    );
    const buttons = foreground ? Array.from(foreground.querySelectorAll("button")) : [];
    return {
      hasBackdrop: Boolean(backdrop),
      backgroundImage: image ? getComputedStyle(image).backgroundImage : null,
      scrimImage: backdrop?.lastElementChild
        ? getComputedStyle(backdrop.lastElementChild).backgroundImage
        : null,
      imageOverhang:
        backdrop && image
          ? {
              left: backdrop.getBoundingClientRect().left - image.getBoundingClientRect().left,
              top: backdrop.getBoundingClientRect().top - image.getBoundingClientRect().top,
              right: image.getBoundingClientRect().right - backdrop.getBoundingClientRect().right,
              bottom:
                image.getBoundingClientRect().bottom - backdrop.getBoundingClientRect().bottom,
            }
          : null,
      backdropOverflow: backdrop ? getComputedStyle(backdrop).overflow : null,
      blurPx: backdrop
        ? getComputedStyle(document.documentElement).getPropertyValue("--empty-state-blur").trim()
        : null,
      hasTabStrip: Boolean(document.querySelector("[data-tab-strip]")),
      hasNewTabButton: Boolean(document.querySelector('button[aria-label="New tab"]')),
      hasBackButton: Boolean(document.querySelector('button[aria-label="Back"]')),
      hasForwardButton: Boolean(document.querySelector('button[aria-label="Forward"]')),
      labels: buttons.map((b) => b.textContent.trim()),
      foregroundRect: foreground ? foreground.getBoundingClientRect().toJSON() : null,
      toggleOnWallpaper: toggle ? toggle.classList.contains("sidebar-toggle-on-wallpaper") : null,
      viewportWidth: window.innerWidth,
      progressiveBlurCount: document.querySelectorAll('[class*="backdrop-filter:blur(3px)"]')
        .length,
    };
  });
}

describe("empty-state wallpaper", () => {
  let savedSession = null;

  before(async () => {
    savedSession = existsSync(SESSION_FILE) ? readFileSync(SESSION_FILE, "utf8") : null;
    seedEmptySession();
    await waitForMount();
    await reload();
  });

  // The seeded empty session is persisted, so restore whatever was there before.
  after(() => {
    if (savedSession !== null) writeFileSync(SESSION_FILE, savedSession);
  });

  it("hides the whole tab strip", async () => {
    const state = await readEmptyState();
    strictEqual(state.hasTabStrip, false, "tab strip should be gone");
    strictEqual(state.hasNewTabButton, false, "+ button should be gone");
    strictEqual(state.hasBackButton, false, "back button should be gone");
    strictEqual(state.hasForwardButton, false, "forward button should be gone");
  });

  it("fills the pane with a wallpaper behind its scrim", async () => {
    const state = await readEmptyState();
    ok(state.hasBackdrop, "wallpaper layer should exist");
    ok(
      /\/wallpapers\/[1-9]\.webp/.test(state.backgroundImage),
      `expected a wallpaper url, got: ${state.backgroundImage}`,
    );
    ok(
      state.scrimImage.includes("linear-gradient"),
      `expected a scrim gradient, got: ${state.scrimImage}`,
    );
    strictEqual(state.progressiveBlurCount, 0, "no top/bottom progressive blur in this state");
  });

  it("clips the blur's falloff instead of showing it as a fringe", async () => {
    const state = await readEmptyState();
    strictEqual(state.backdropOverflow, "hidden", "the frame must clip the blurred layer");

    const blur = Number.parseFloat(state.blurPx);
    ok(blur > 0, `expected a blur radius, got: ${state.blurPx}`);
    for (const [side, px] of Object.entries(state.imageOverhang)) {
      const overhang = Number(px);
      ok(
        overhang >= blur * 2 - 0.5,
        `image should overhang ${side} by >= ${blur * 2}px, got ${overhang}px`,
      );
    }
  });

  it("puts both actions in the top-right corner", async () => {
    const state = await readEmptyState();
    strictEqual(state.labels.length, 2);
    ok(state.labels[0].startsWith("Create new note"), state.labels[0]);
    ok(state.labels[1].startsWith("Search"), state.labels[1]);
    const rect = state.foregroundRect;
    ok(rect.top < 8, `actions should sit at the top, got top=${rect.top}`);
    ok(
      state.viewportWidth - rect.right < 24,
      `actions should hug the right edge, got right=${rect.right} of ${state.viewportWidth}`,
    );
  });

  it("restyles the sidebar toggle only while the sidebar is hidden", async () => {
    const toggle = () => $('button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]');

    if (await $('button[aria-label="Hide sidebar"]').isExisting()) {
      await toggle().click();
      await browser.pause(400);
    }
    strictEqual((await readEmptyState()).toggleOnWallpaper, true, "hidden → wallpaper styling");

    await toggle().click();
    await browser.pause(400);
    strictEqual((await readEmptyState()).toggleOnWallpaper, false, "shown → normal styling");
  });

  it("ignores ⌘T", async () => {
    await browser.execute(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "t", metaKey: true, bubbles: true, cancelable: true }),
      );
    });
    await browser.pause(600);

    const state = await readEmptyState();
    strictEqual(state.hasTabStrip, false, "⌘T must not bring the tab strip back");
    strictEqual(state.hasBackdrop, true, "⌘T must not replace the wallpaper");
  });

  it("restores the tab strip once a document is open", async () => {
    writeFileSync(
      SESSION_FILE,
      JSON.stringify({
        [E2E_WORKSPACE]: {
          tabs: [
            {
              location: { kind: "file", path: `${E2E_WORKSPACE}/README.md` },
              back: [],
              forward: [],
            },
          ],
          active_index: 0,
        },
      }),
    );
    await reload();

    const state = await readEmptyState();
    strictEqual(state.hasBackdrop, false, "wallpaper is gone with a document open");
    strictEqual(state.hasTabStrip, true, "tab strip returns with a document open");
  });
});
