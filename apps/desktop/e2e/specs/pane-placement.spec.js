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

async function tabTitles() {
  return browser.execute(() =>
    Array.from(document.querySelectorAll("[data-tab-id]")).map((el) => el.textContent.trim()),
  );
}

async function activeTabTitle() {
  return browser.execute(() => {
    const active = Array.from(document.querySelectorAll("[data-tab-id]")).find((el) =>
      el.querySelector('[role="button"]')?.className.includes("tab-active-bg"),
    );
    return active?.textContent.trim() ?? null;
  });
}

async function clickSidebarFile(suffix) {
  const row = await $(`[data-tree-path$="${suffix}"]`);
  await row.waitForExist({ timeout: 10_000 });
  await row.click();
  await browser.pause(1_200);
}

describe("pane placement", function () {
  before(async function () {
    await waitForMount();
    await invoke("reset_setting", { key: "appearance.column-layout", scope: "global" });
    await invoke("reset_setting", { key: "appearance.pane-width", scope: "global" });
    seedSession(["README.md"]);
    await browser.refresh();
    await waitForMount();
    await browser.pause(2_000);
  });

  after(function () {
    seedSession(["README.md"]);
  });

  it("appends a pane when a file is opened from the sidebar", async function () {
    const before = await tabTitles();
    strictEqual(before.length, 1, "should start from the single seeded pane");

    await clickSidebarFile("/TODOS.md");

    const after = await tabTitles();
    strictEqual(after.length, 2, `expected a second pane, got ${JSON.stringify(after)}`);
    strictEqual(after[0], before[0], "the existing pane must stay put");
  });

  it("focuses the existing pane instead of opening a file twice", async function () {
    const before = await tabTitles();
    ok(before.length >= 2, "need at least two panes for this to mean anything");

    await clickSidebarFile("/README.md");

    const after = await tabTitles();
    strictEqual(
      after.length,
      before.length,
      `one file means one pane, got ${JSON.stringify(after)}`,
    );
    strictEqual(after[0], before[0]);
  });

  it("keeps one pane per file across many opens", async function () {
    await clickSidebarFile("/CHANGELOG.md");
    await clickSidebarFile("/TODOS.md");
    await clickSidebarFile("/CHANGELOG.md");
    await clickSidebarFile("/README.md");

    const titles = await tabTitles();
    const unique = new Set(titles);
    strictEqual(unique.size, titles.length, `duplicate panes: ${JSON.stringify(titles)}`);
  });
});
