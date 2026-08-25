import { ok } from "node:assert/strict";

describe("file watcher: create-then-write race", function () {
  const FILE_STEM = "file-watcher-race-e2e";
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
    ok(root, "no workspace root to create the race-condition file into");
    filePath = `${root}/${FILE_STEM}.md`;
  });

  beforeEach(function () {
    if (!workspaceRestored) this.skip();
  });

  after(async function () {
    if (filePath) await invoke("delete_entry", { path: filePath });
  });

  it("shows a freshly created-and-written file in the sidebar without a workspace reopen", async function () {
    const created = await invoke("create_file", { path: filePath });
    ok(created.ok, `create_file failed: ${created.error}`);
    const written = await invoke("write_file", { path: filePath, content: "# Race check\n" });
    ok(written.ok, `write_file failed: ${written.error}`);

    const row = await $(`[data-tree-path$="/${FILE_STEM}.md"]`);
    await row.waitForExist({
      timeout: 5_000,
      timeoutMsg: "created-then-written file never appeared in the sidebar",
    });
  });
});
