import { ok, strictEqual } from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const E2E_WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

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
  await $('button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]').waitForExist({
    timeout: 15_000,
  });
}

describe("pane frame structure", function () {
  before(async function () {
    const restored = await $('button[aria-label="Hide sidebar"]')
      .waitForExist({ timeout: 15_000 })
      .catch(() => false);
    if (!restored) {
      await invoke("open_workspace", { path: E2E_WORKSPACE });
    }
    await waitForMount();
    await invoke("set_setting", {
      key: "appearance.column-layout",
      value: false,
      scope: "global",
    });
    await browser.refresh();
    await waitForMount();

    const row = await $('[data-tree-path$="/README.md"]');
    await row.waitForExist({ timeout: 10_000 });
    await row.click();
    await $("[data-document-footer]").waitForExist({ timeout: 10_000 });
  });

  after(async function () {
    await invoke("reset_setting", { key: "appearance.column-layout", scope: "global" }).catch(
      () => {},
    );
  });

  it("keeps the hidden-pane class on the element carrying data-pane", async function () {
    const report = await browser.execute(() => {
      const panes = Array.from(document.querySelectorAll("[data-pane]"));
      return {
        total: panes.length,
        visible: panes.filter((p) => getComputedStyle(p).visibility === "visible").length,
        hiddenAgree: panes.every(
          (p) =>
            (getComputedStyle(p).visibility === "hidden") === p.classList.contains("invisible"),
        ),
      };
    });

    ok(report.total >= 1, "expected at least one pane");
    strictEqual(report.visible, 1, "stacked mode should show exactly one pane");
    ok(report.hiddenAgree, "`invisible` class must match computed visibility on [data-pane]");
  });

  it("renders the footer inside the visible pane, flush with its bottom edge", async function () {
    const report = await browser.execute(() => {
      const footers = Array.from(document.querySelectorAll("[data-document-footer]"));
      const footer = footers.find((f) => f.getBoundingClientRect().height > 0);
      if (!footer) return { footer: false };
      const pane = footer.closest("[data-pane]");
      if (!pane) return { footer: true, insidePane: false };
      const f = footer.getBoundingClientRect();
      const p = pane.getBoundingClientRect();
      return {
        footer: true,
        insidePane: true,
        bottomDelta: Math.abs(f.bottom - p.bottom),
        widthDelta: Math.abs(f.width - p.width),
      };
    });

    ok(report.footer, "expected a rendered footer");
    ok(report.insidePane, "footer must live inside a [data-pane]");
    ok(report.bottomDelta <= 1, `footer bottom off by ${report.bottomDelta}px`);
    ok(report.widthDelta <= 1, `footer width off by ${report.widthDelta}px`);
  });

  it("puts focus inside the visible pane's editor", async function () {
    const focused = await browser.execute(() => {
      const panes = Array.from(document.querySelectorAll("[data-pane]"));
      const visible = panes.find((p) => getComputedStyle(p).visibility === "visible");
      const content = visible?.querySelector(".cm-editor .cm-content");
      content?.focus();
      return Boolean(visible && visible.contains(document.activeElement));
    });

    ok(focused, "focus should land inside the visible pane");
  });
});
