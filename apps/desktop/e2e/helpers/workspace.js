import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const SIDEBAR_TOGGLE = 'button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]';

export async function invoke(cmd, args) {
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

export async function waitForMount() {
  await $(SIDEBAR_TOGGLE).waitForExist({ timeout: 15_000 });
}

// The sidebar toggle also renders in the empty state, so its presence does not mean a
// workspace is open. open_workspace is idempotent; the file tree is the real signal.
export async function ensureWorkspace() {
  await waitForMount();
  await invoke("open_workspace", { path: E2E_WORKSPACE });
  await $("[data-tree-path]").waitForExist({ timeout: 15_000 });
}

// Cmd-T is inert while no tab is open, so panes cannot be bootstrapped from an empty
// session by keyboard alone -- open one file from the tree first.
export async function ensureOneOpenFile() {
  await ensureWorkspace();
  if ((await $$("[data-tab-id]")).length > 0) return;
  // Exact match: a suffix match on "/README.md" also hits apps/desktop/e2e/README.md.
  const row = await $(`[data-tree-path="${E2E_WORKSPACE}/README.md"]`);
  await row.waitForExist({ timeout: 10_000 });
  await row.click();
  await $("[data-tab-id]").waitForExist({ timeout: 10_000 });
}

// Tabs are persisted, so a spec that opens extra ones leaks them into whichever spec runs
// next. Seeding sessions.json underneath a running app does not stick -- the app writes its
// own session back -- so close them through the palette and let the app persist the result.
export async function closeAllTabs() {
  const { runPaletteCommand } = await import("./command-palette.js");
  if ((await $$("[data-tab-id]")).length === 0) return;
  await runPaletteCommand("close-all");
  await browser.waitUntil(async () => (await $$("[data-tab-id]")).length === 0, {
    timeout: 10_000,
    timeoutMsg: "tabs were not closed",
  });
}
