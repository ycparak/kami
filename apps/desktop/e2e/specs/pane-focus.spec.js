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

async function paneStates() {
  return browser.execute(() => {
    const panes = Array.from(document.querySelectorAll("[data-pane]"));
    return panes.map((p, i) => {
      const editor = p.querySelector(".cm-editor");
      const hashes = Array.from(p.querySelectorAll(".cm-heading-hash"));
      return {
        index: i,
        hasEditor: Boolean(editor),
        focused: editor?.getAttribute("data-pane-focused") === "true",
        holdsActiveElement: p.contains(document.activeElement),
        totalHashes: hashes.length,
        visibleHashes: hashes.filter((el) => !el.querySelector(".cm-hidden-token")).length,
      };
    });
  });
}

describe("pane focus", function () {
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

  it("unfurls markdown only in the focused pane", async function () {
    const states = await paneStates();
    const withEditors = states.filter((s) => s.hasEditor);
    console.log(`\n[focus] ${JSON.stringify(states)}\n`);

    ok(withEditors.length >= 2, `need at least 2 editor panes, got ${withEditors.length}`);

    const focused = withEditors.filter((s) => s.focused);
    strictEqual(focused.length, 1, "exactly one pane should hold editor focus");

    for (const pane of withEditors) {
      if (pane.focused) continue;
      ok(pane.totalHashes > 0, `pane ${pane.index} has no headings to check`);
      strictEqual(
        pane.visibleHashes,
        0,
        `unfocused pane ${pane.index} should hide its heading markers`,
      );
    }
  });

  it("moves focus and unfurling to the pane that is clicked", async function () {
    const before = await paneStates();
    const target = before.findIndex((s) => s.hasEditor && !s.focused);
    ok(target !== -1, "expected an unfocused editor pane to click");

    await browser.execute((i) => {
      const pane = document.querySelectorAll("[data-pane]")[i];
      const content = pane.querySelector(".cm-editor .cm-content");
      content.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }));
      content.focus();
    }, target);
    await browser.pause(800);

    const after = await paneStates();
    ok(after[target].focused, `pane ${target} should hold focus after being clicked`);
    strictEqual(
      after.filter((s) => s.hasEditor && s.focused).length,
      1,
      "focus must not be shared between panes",
    );

    const previous = before.findIndex((s) => s.focused);
    if (previous !== -1 && previous !== target) {
      strictEqual(
        after[previous].visibleHashes,
        0,
        "the pane that lost focus should re-hide its markers",
      );
    }
  });

  it("captures a screenshot", async function () {
    await browser.pause(500);
    writeFileSync(
      process.env.SHOT_OUT ?? "/tmp/focus.png",
      Buffer.from(await browser.takeScreenshot(), "base64"),
    );
  });
});
