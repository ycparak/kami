const ATTEMPTS = 10;
const ATTEMPT_PAUSE_MS = 400;

async function paletteItemCount() {
  return browser.execute(() => document.querySelectorAll("[cmdk-item]").length);
}

export async function openCommandPalette() {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if ((await paletteItemCount()) > 0) return;
    await browser.execute(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true, cancelable: true }),
      );
    });
    await browser.pause(ATTEMPT_PAUSE_MS);
  }
  throw new Error(`command palette did not open after ${ATTEMPTS} attempts`);
}

export async function runPaletteCommand(commandId) {
  await openCommandPalette();
  const item = await $(`[cmdk-item][data-value="${commandId}"]`);
  await item.waitForExist({ timeout: 5_000 });
  await item.click();
}

export async function openPreferences() {
  await runPaletteCommand("open-settings");
  await $("[data-settings-panel]").waitForExist({ timeout: 10_000 });
}
