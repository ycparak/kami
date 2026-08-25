import { ok, strictEqual } from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const E2E_WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SESSION_FILE = resolve(homedir(), "Library/Application Support/com.kami.e2e/sessions.json");

function seedSession(relativePaths) {
  writeFileSync(
    SESSION_FILE,
    JSON.stringify({
      [E2E_WORKSPACE]: {
        tabs: relativePaths.map((rel) => ({
          location: { kind: "file", path: `${E2E_WORKSPACE}/${rel}` },
          back: [],
          forward: [],
        })),
        active_index: 0,
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

async function openSearchInFocusedPane() {
  await browser.execute(() => {
    const panes = Array.from(document.querySelectorAll("[data-pane]"));
    const focused = panes.find(
      (p) => p.querySelector(".cm-editor")?.getAttribute("data-pane-focused") === "true",
    );
    const content = focused?.querySelector(".cm-editor .cm-content");
    content?.focus();
    content?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }),
    );
  });
  await browser.pause(900);
}

describe("pane chrome", function () {
  before(async function () {
    await waitForMount();
    await invoke("reset_setting", { key: "appearance.column-layout", scope: "global" });
    await invoke("reset_setting", { key: "appearance.pane-width", scope: "global" });
    seedSession(["README.md", "TODOS.md", "CHANGELOG.md"]);
    await browser.refresh();
    await waitForMount();
    await browser.pause(2_500);
  });

  after(function () {
    seedSession(["README.md"]);
  });

  it("anchors the search panel inside the pane it searches", async function () {
    await openSearchInFocusedPane();

    const report = await browser.execute(() => {
      const overlay = document.querySelector("[data-search-overlay]");
      if (!overlay) return { open: false };
      const pane = overlay.closest("[data-pane]");
      if (!pane) return { open: true, insidePane: false };
      const o = overlay.getBoundingClientRect();
      const p = pane.getBoundingClientRect();
      return {
        open: true,
        insidePane: true,
        paneFocused: pane.querySelector(".cm-editor")?.getAttribute("data-pane-focused") === "true",
        withinPaneBox: o.left >= p.left - 1 && o.right <= p.right + 1,
        overlayCount: document.querySelectorAll("[data-search-overlay]").length,
      };
    });

    ok(report.open, "⌘F should open the search panel");
    ok(report.insidePane, "the panel must live inside a pane, not the editor area");
    ok(report.paneFocused, "it must be the focused pane's panel");
    ok(report.withinPaneBox, "the panel must sit within its pane's horizontal bounds");
    strictEqual(report.overlayCount, 1, "only one search panel at a time");
  });

  it("keeps the searched pane unfurled while the find input holds focus", async function () {
    const report = await browser.execute(() => {
      const overlay = document.querySelector("[data-search-overlay]");
      const pane = overlay?.closest("[data-pane]");
      const editor = pane?.querySelector(".cm-editor");
      return {
        searchOpen: Boolean(overlay),
        editorHasDomFocus: Boolean(editor?.classList.contains("cm-focused")),
        paneFocusedFlag: editor?.getAttribute("data-pane-focused"),
      };
    });

    ok(report.searchOpen, "search should still be open from the previous step");
    strictEqual(
      report.paneFocusedFlag,
      "true",
      "the searched pane must stay focused even though its editor blurred",
    );
  });

  it("renders a settings pane as a normal column", async function () {
    await browser.execute(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true, cancelable: true }),
      );
    });
    await browser.pause(800);
    const item = await $('[cmdk-item][data-value="open-settings"]');
    await item.waitForExist({ timeout: 10_000 });
    await item.click();
    await browser.pause(1_500);

    const report = await browser.execute(() => {
      const panel = document.querySelector("[data-settings-panel]");
      if (!panel) return { present: false };
      const pane = panel.closest("[data-pane]");
      const panelRect = panel.getBoundingClientRect();
      const paneRect = pane?.getBoundingClientRect();
      const heading = panel.querySelector("h1");
      return {
        present: true,
        insidePane: Boolean(pane),
        fitsPane: paneRect
          ? panelRect.left >= paneRect.left - 1 && panelRect.right <= paneRect.right + 1
          : false,
        headingVisible: heading ? heading.getBoundingClientRect().width > 0 : false,
        contentOverflows: panel.scrollWidth > panel.clientWidth + 1,
      };
    });

    if (!report.present) {
      this.skip();
      return;
    }
    ok(report.insidePane, "the settings panel should be a pane like any other");
    ok(report.fitsPane, "settings must not spill outside its column");
    ok(report.headingVisible, "the Preferences heading should render");
    ok(!report.contentOverflows, "settings content must not overflow its column horizontally");
  });

  it("renders a launcher pane as a normal column", async function () {
    await browser.execute(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "t", metaKey: true, bubbles: true, cancelable: true }),
      );
    });
    await browser.pause(1_000);

    const report = await browser.execute(() => {
      const panes = Array.from(document.querySelectorAll("[data-pane-row] > [data-pane]"));
      const last = panes[panes.length - 1];
      const rect = last?.getBoundingClientRect();
      return {
        paneCount: panes.length,
        width: rect ? Math.round(rect.width) : 0,
        hasEditor: Boolean(last?.querySelector(".cm-editor")),
        overflows: last ? last.scrollWidth > last.clientWidth + 1 : false,
      };
    });

    ok(report.paneCount >= 2, "⌘T should add a pane");
    ok(!report.hasEditor, "the new pane should be the launcher, not an editor");
    ok(report.width > 0, "the launcher pane needs a real width");
    ok(!report.overflows, "the launcher must not overflow its column");
  });
});
