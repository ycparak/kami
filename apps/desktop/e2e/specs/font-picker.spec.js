import { ok, strictEqual } from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPreferences } from "../helpers/command-palette.js";

const E2E_WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const INITIAL_STACK = 'Custom Primary, Georgia, "Times New Roman", serif';
const SELECTED_STACK = 'Menlo, Georgia, "Times New Roman", serif';

describe("Settings font selects", function () {
  before(async function () {
    const workspaceRestored = await $('button[aria-label="Hide sidebar"]')
      .waitForExist({ timeout: 3_000 })
      .catch(() => false);
    if (!workspaceRestored) {
      await browser.executeAsync((path, done) => {
        window.__TAURI_INTERNALS__
          .invoke("open_workspace", { path })
          .then(() => done(null))
          .catch((error) => done(error && error.message ? error.message : String(error)));
      }, E2E_WORKSPACE);
    }

    await browser.executeAsync((value, done) => {
      window.__TAURI_INTERNALS__
        .invoke("set_setting", { key: "fonts.mono", value, scope: "global" })
        .then(() => done(null))
        .catch((error) => done(error && error.message ? error.message : String(error)));
    }, INITIAL_STACK);
    await browser.refresh();
    await $('button[aria-label="Hide sidebar"]').waitForExist({ timeout: 15_000 });
  });

  it("opens settings via the command palette", async function () {
    await openPreferences();
  });

  it("renders one Typography section with ordinary installed-font selects", async function () {
    const typography = await $('//section[.//h2[normalize-space()="Typography"]]');
    await typography.waitForExist({ timeout: 5_000 });
    strictEqual((await $$('//section[.//h2[normalize-space()="Typography"]]')).length, 1);
    strictEqual((await $$('//section[.//h2[normalize-space()="Fonts"]]')).length, 0);

    const labels = ["UI font", "Editor font", "Code font"];
    let optionCounts;
    await browser.waitUntil(
      async () => {
        optionCounts = await browser.execute(
          (fontLabels) =>
            fontLabels.map((label) => {
              const select = document.querySelector(`select[aria-label="${label}"]`);
              if (!(select instanceof HTMLSelectElement) || select.disabled) return 0;
              return select.options.length;
            }),
          labels,
        );
        return optionCounts.every((count) => count > 20);
      },
      { timeout: 10_000, timeoutMsg: "installed font options did not load" },
    );
    labels.forEach((label, index) => {
      ok((optionCounts?.[index] ?? 0) > 20, `${label} should list installed families`);
    });

    strictEqual(await typography.$("input").isExisting(), false);
    strictEqual(await typography.$('button[aria-label^="Show Fonts"]').isExisting(), false);
    strictEqual(await $('[role="dialog"][aria-label="Installed fonts"]').isExisting(), false);
  });

  it("changes the primary family while preserving the stored fallback tail", async function () {
    const initialFamily = await browser.execute(() => {
      const fontSelect = document.querySelector('select[aria-label="Code font"]');
      return fontSelect instanceof HTMLSelectElement ? fontSelect.value : null;
    });
    strictEqual(initialFamily, "Custom Primary");
    await browser.execute(() => {
      const fontSelect = document.querySelector('select[aria-label="Code font"]');
      if (!(fontSelect instanceof HTMLSelectElement)) throw new Error("font select missing");
      fontSelect.value = "Menlo";
      fontSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    let cssVariable;
    await browser.waitUntil(
      async () => {
        cssVariable = await browser.execute(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--mono-font"),
        );
        return cssVariable.includes("Menlo");
      },
      { timeout: 5_000, timeoutMsg: "--mono-font did not update to Menlo" },
    );

    let persisted;
    await browser.waitUntil(
      async () => {
        persisted = await browser.executeAsync((key, done) => {
          window.__TAURI_INTERNALS__
            .invoke("get_setting", { key })
            .then((value) => done(value))
            .catch((error) =>
              done(`ERROR: ${error && error.message ? error.message : String(error)}`),
            );
        }, "fonts.mono");
        return persisted === SELECTED_STACK;
      },
      { timeout: 5_000, timeoutMsg: `font setting did not persist: ${persisted}` },
    );
    const selectedFamily = await browser.execute(() => {
      const fontSelect = document.querySelector('select[aria-label="Code font"]');
      return fontSelect instanceof HTMLSelectElement ? fontSelect.value : null;
    });
    strictEqual(selectedFamily, "Menlo");
  });
});
