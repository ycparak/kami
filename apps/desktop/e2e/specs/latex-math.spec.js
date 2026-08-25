import { ok } from "node:assert/strict";

describe("LaTeX math rendering", function () {
  const FILE_STEM = "latex-math-e2e";
  const DOC = [
    "# Math check",
    "",
    "Euler: $e^{i\\pi} + 1 = 0$ inline.",
    "",
    "$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$",
    "",
    "I paid $5 and $10 more.",
    "",
  ].join("\n");

  let workspaceRestored = false;
  let filePath = null;

  async function invoke(cmd, args) {
    return browser.executeAsync(
      (c, a, done) => {
        window.__TAURI_INTERNALS__
          .invoke(c, a)
          .then((v) => done({ ok: true, value: v }))
          .catch((e) => done({ ok: false, error: e && e.message ? e.message : String(e) }));
      },
      cmd,
      args,
    );
  }

  before(async function () {
    workspaceRestored = await $('button[aria-label="Hide sidebar"]')
      .waitForExist({ timeout: 15_000 })
      .catch(() => false);
    if (!workspaceRestored) return;

    const recents = await invoke("get_recent_workspaces", {});
    const root = recents.ok && Array.isArray(recents.value) ? recents.value[0] : null;
    ok(root, "no workspace root to seed the math document into");

    filePath = `${root}/${FILE_STEM}.md`;

    await invoke("create_file", { path: filePath }).catch(() => {});
    const wrote = await invoke("write_file", { path: filePath, content: DOC });
    ok(wrote.ok, `failed to seed ${filePath}: ${wrote.error}`);
  });

  beforeEach(function () {
    if (!workspaceRestored) this.skip();
  });

  after(async function () {
    if (filePath) await invoke("delete_entry", { path: filePath });
  });

  async function mathPaneText() {
    return browser.execute(() => {
      const widget = document.querySelector(".cm-math-widget");
      const editor = widget?.closest(".cm-editor") ?? document.querySelector(".cm-editor");
      return editor?.querySelector(".cm-content")?.textContent ?? "";
    });
  }

  it("opens the seeded document from the sidebar", async function () {
    const row = await $(`[data-tree-path$="/${FILE_STEM}.md"]`);
    await row.waitForExist({ timeout: 15_000 });
    await row.click();

    await browser.waitUntil(async () => (await $$(".cm-content")).length > 0, {
      timeout: 10_000,
      timeoutMsg: "editor never mounted",
    });
  });

  it("renders inline and display math as KaTeX widgets when the caret is elsewhere", async function () {
    const inline = await $(".cm-math-widget:not(.cm-math-display) .katex");
    await inline.waitForExist({ timeout: 10_000 });

    const display = await $(".cm-math-widget.cm-math-display .katex-display");
    await display.waitForExist({ timeout: 10_000 });

    if (process.env.VERIFY_SHOT_DIR) {
      await browser.saveScreenshot(`${process.env.VERIFY_SHOT_DIR}/latex-math-rendered.png`);
    }
  });

  it("leaves currency prose as plain text", async function () {
    const widgets = await $$(".cm-math-widget");
    ok(widgets.length === 2, `expected 2 math widgets, got ${widgets.length}`);
    const content = await mathPaneText();
    ok(content.includes("I paid $5 and $10 more."), "currency sentence should stay literal");
  });

  it("unfolds to raw source when the widget is clicked", async function () {
    const inline = await $(".cm-math-widget:not(.cm-math-display)");
    await inline.click();

    await browser.waitUntil(
      async () => {
        const text = await mathPaneText();
        return text.includes("$e^{i\\pi} + 1 = 0$");
      },
      { timeout: 5_000, timeoutMsg: "inline math never unfolded to source" },
    );

    if (process.env.VERIFY_SHOT_DIR) {
      await browser.saveScreenshot(`${process.env.VERIFY_SHOT_DIR}/latex-math-unfolded.png`);
    }
  });
});
