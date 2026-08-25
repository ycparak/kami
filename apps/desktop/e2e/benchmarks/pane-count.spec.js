import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const E2E_WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SESSION_FILE = resolve(homedir(), "Library/Application Support/com.kami.e2e/sessions.json");

const ALL = [
  "README.md",
  "TODOS.md",
  "CHANGELOG.md",
  "AGENTS.md",
  "SPECs/horizontal-pane-layout.md",
  "docs/website-deploy.md",
  "docs/zustand.md",
  "docs/releasing.md",
  "docs/keyboard-shortcuts.md",
  "docs/pane-layout.md",
  "docs/vite-plus.md",
  "docs/editor.md",
  "docs/open-flow.md",
  "docs/react-guidelines.md",
  "docs/consolidation.md",
  "docs/workflows/worktrees.md",
  "docs/workflows/agent-loop.md",
  "docs/workflows/agent-review.md",
  "apps/desktop/README.md",
  "apps/desktop/e2e/README.md",
];

function seed(n) {
  writeFileSync(
    SESSION_FILE,
    JSON.stringify({
      [E2E_WORKSPACE]: {
        tabs: ALL.slice(0, n).map((rel) => ({
          location: { kind: "file", path: `${E2E_WORKSPACE}/${rel}` },
          back: [],
          forward: [],
        })),
        active_index: 0,
      },
    }),
  );
}

async function waitForMount() {
  await $('button[aria-label="Hide sidebar"]').waitForExist({ timeout: 30_000 });
}

async function measure(n) {
  seed(n);
  const started = Date.now();
  await browser.refresh();
  await waitForMount();
  await browser.waitUntil(
    async () =>
      browser.execute(
        (count) => document.querySelectorAll("[data-pane-row] > [data-pane]").length >= count,
        n,
      ),
    { timeout: 30_000, timeoutMsg: `only some of ${n} panes mounted` },
  );
  const mountedMs = Date.now() - started;
  await browser.pause(2_000);

  const stats = await browser.execute(() => {
    const row = document.querySelector("[data-pane-row]");
    return {
      panes: row?.querySelectorAll(":scope > [data-pane]").length ?? 0,
      editors: document.querySelectorAll(".cm-editor").length,
      domNodes: document.querySelectorAll("*").length,
      scrollWidth: row?.scrollWidth ?? 0,
    };
  });

  const clickStart = Date.now();
  await browser.execute((i) => {
    const wrapper = document.querySelectorAll("[data-tab-id]")[i];
    wrapper
      ?.querySelector('[role="button"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, n - 1);
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const panes = Array.from(document.querySelectorAll("[data-pane]"));
        const last = panes[panes.length - 1];
        return last?.querySelector(".cm-editor")?.getAttribute("data-pane-focused") === "true";
      }),
    { timeout: 15_000, timeoutMsg: "focus never moved" },
  );
  const focusMs = Date.now() - clickStart;

  const scrollMs = await browser.execute(() => {
    const row = document.querySelector("[data-pane-row]");
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) row.scrollLeft = i * 40;
    row.getBoundingClientRect();
    return Math.round(performance.now() - t0);
  });

  return { n, mountedMs, focusMs, scrollMs, ...stats };
}

describe("pane count benchmark", function () {
  it("measures 3 vs 20 panes", async function () {
    await waitForMount();
    const results = [];
    for (const n of [3, 10, 20]) {
      results.push(await measure(n));
    }
    console.log(`\n[bench] ${JSON.stringify(results, null, 1)}\n`);
    seed(1);
  });
});
