import { ok, strictEqual } from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const E2E_WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SESSION_FILE = resolve(homedir(), "Library/Application Support/com.kami.e2e/sessions.json");

function seedSession(relativePaths, activeIndex = 0) {
  writeFileSync(
    SESSION_FILE,
    JSON.stringify({
      [E2E_WORKSPACE]: {
        tabs: relativePaths.map((rel) => ({
          location: { kind: "file", path: `${E2E_WORKSPACE}/${rel}` },
          back: [],
          forward: [],
        })),
        active_index: activeIndex,
      },
    }),
  );
}

async function invoke(cmd, args) {
  const result = await browser.executeAsync(
    (cmdName, cmdArgs, done) => {
      window.__TAURI_INTERNALS__
        .invoke(cmdName, cmdArgs)
        .then((value) => done({ ok: true, value }))
        .catch((error) =>
          done({ ok: false, error: error && error.message ? error.message : String(error) }),
        );
    },
    cmd,
    args,
  );
  if (!result.ok) throw new Error(`${cmd} failed: ${result.error}`);
  return result.value;
}

async function waitForMount() {
  await $('button[aria-label="Hide sidebar"]').waitForExist({ timeout: 15_000 });
}

async function rowState() {
  return browser.execute(() => {
    const row = document.querySelector("[data-pane-row]");
    if (!row) return null;
    const rowRect = row.getBoundingClientRect();
    const panes = Array.from(row.querySelectorAll(":scope > [data-pane]"));
    return {
      scrollLeft: Math.round(row.scrollLeft),
      scrollWidth: row.scrollWidth,
      clientWidth: row.clientWidth,
      panes: panes.map((p) => {
        const r = p.getBoundingClientRect();
        return {
          id: p.getAttribute("data-pane-id"),
          fullyVisible: r.left >= rowRect.left - 1 && r.right <= rowRect.right + 1,
        };
      }),
    };
  });
}

async function clickTab(index) {
  const clicked = await browser.execute((i) => {
    const wrapper = document.querySelectorAll("[data-tab-id]")[i];
    const button = wrapper?.querySelector('[role="button"]');
    if (!button) return false;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }, index);
  if (!clicked) throw new Error(`no tab button at index ${index}`);
  await browser.pause(1_500);
}

describe("focused pane scrolling", function () {
  before(async function () {
    await waitForMount();
    await invoke("reset_setting", { key: "appearance.column-layout", scope: "global" });
    await invoke("reset_setting", { key: "appearance.pane-width", scope: "global" });
    seedSession(["README.md", "TODOS.md", "CHANGELOG.md", "docs/editor.md", "docs/zustand.md"]);
    await browser.refresh();
    await waitForMount();
    await browser.pause(2_500);
  });

  after(function () {
    seedSession(["README.md"]);
  });

  it("starts at the restored session's focused pane without animating", async function () {
    const state = await rowState();
    ok(state, "expected a pane row");
    ok(state.scrollWidth > state.clientWidth, "row should overflow for this test to mean anything");
    strictEqual(state.scrollLeft, 0, "restore should not scroll away from the focused pane");
    ok(state.panes[0].fullyVisible, "the focused pane must be fully visible after restore");
  });

  it("brings an off-screen pane into view when its tab is focused", async function () {
    const before = await rowState();
    const lastIndex = before.panes.length - 1;
    ok(!before.panes[lastIndex].fullyVisible, "last pane should start off screen");

    await clickTab(lastIndex);

    const after = await rowState();
    ok(after.scrollLeft > before.scrollLeft, "row should have scrolled right");
    ok(after.panes[lastIndex].fullyVisible, "the focused pane must end up fully visible");
  });

  it("does not scroll when the focused pane is already visible", async function () {
    const before = await rowState();
    const visibleIndex = before.panes.findIndex((p) => p.fullyVisible);
    ok(visibleIndex !== -1, "expected at least one fully visible pane");

    await clickTab(visibleIndex);

    const after = await rowState();
    strictEqual(after.scrollLeft, before.scrollLeft, "a visible pane should not move the row");
  });

  it("scrolls back left for an earlier pane", async function () {
    const before = await rowState();
    ok(before.scrollLeft > 0, "should still be scrolled right from the earlier step");

    await clickTab(0);

    const after = await rowState();
    ok(after.scrollLeft < before.scrollLeft, "row should have scrolled back toward the start");
    ok(after.panes[0].fullyVisible, "the first pane must be fully visible");
  });
});
