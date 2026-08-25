import { strictEqual } from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Kami app", function () {
  it("mounts the React app", async function () {
    await $("#root > *").waitForExist({ timeout: 15_000 });
  });

  it("creates a file and writes hello world via the Tauri IPC bridge", async function () {
    await $("#root > *").waitForExist({ timeout: 15_000 });

    const workspace = mkdtempSync(join(tmpdir(), "kami-e2e-"));
    const filePath = join(workspace, "hello.md");
    const expectedContent = "hello world";

    try {
      const error = await browser.executeAsync(
        (path, content, done) => {
          void (async () => {
            try {
              const { invoke } = window.__TAURI_INTERNALS__;
              await invoke("create_file", { path });
              await invoke("write_file", { path, content });
              done(null);
            } catch (e) {
              done(e && e.message ? e.message : String(e));
            }
          })();
        },
        filePath,
        expectedContent,
      );

      strictEqual(error, null, `IPC invoke failed: ${error}`);

      strictEqual(readFileSync(filePath, "utf-8"), expectedContent);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
