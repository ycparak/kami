import { ok, strictEqual } from "node:assert/strict";
import { openCommandPalette } from "../helpers/command-palette.js";

const PALETTE_ITEM = "[cmdk-item]";

function selectedValue() {
  return browser.execute(
    () =>
      document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute("data-value") ??
      null,
  );
}

function itemValues() {
  return browser.execute(() =>
    Array.from(document.querySelectorAll("[cmdk-item]")).map((item) =>
      item.getAttribute("data-value"),
    ),
  );
}

function listScrollTop() {
  return browser.execute(() => document.querySelector("[cmdk-list]")?.scrollTop ?? null);
}

function listPoint(fromBottom) {
  return browser.execute((offset) => {
    const rect = document.querySelector("[cmdk-list]").getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.bottom - offset) };
  }, fromBottom);
}

function pressKey(key) {
  return browser.execute((name) => {
    document
      .querySelector("[cmdk-input]")
      .dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  }, key);
}

function movePointer(x, y) {
  return browser.execute(
    (px, py) => {
      const target = document.elementFromPoint(px, py);
      if (!target) return null;
      target.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: px,
          clientY: py,
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
        }),
      );
      return target.closest("[cmdk-item]")?.getAttribute("data-value") ?? null;
    },
    x,
    y,
  );
}

async function settle() {
  await browser.pause(120);
}

async function resetSelection() {
  await pressKey("Home");
  await browser.waitUntil(async () => (await listScrollTop()) === 0, {
    timeout: 3_000,
    timeoutMsg: "Home did not scroll the list back to the top",
  });
  const values = await itemValues();
  strictEqual(await selectedValue(), values[0]);
  return values;
}

async function closePalette() {
  await pressKey("Escape");
  await browser.waitUntil(async () => (await $$(PALETTE_ITEM)).length === 0, {
    timeout: 5_000,
    timeoutMsg: "palette did not close",
  });
}

describe("command palette keyboard navigation", () => {
  afterEach(async () => {
    if ((await $$(PALETTE_ITEM)).length > 0) await closePalette();
  });

  it("opens with the first item selected and the list scrolled to the top", async () => {
    await openCommandPalette();
    const values = await itemValues();
    ok(values.length > 1, "palette should list more than one command");
    strictEqual(await selectedValue(), values[0]);
    strictEqual(await listScrollTop(), 0);
  });

  it("re-opens on the first item after the selection was moved", async () => {
    await openCommandPalette();
    const values = await resetSelection();
    await pressKey("ArrowDown");
    await pressKey("ArrowDown");
    await settle();
    strictEqual(await selectedValue(), values[2]);

    await closePalette();
    await openCommandPalette();
    strictEqual(await selectedValue(), values[0]);
    strictEqual(await listScrollTop(), 0);
  });

  it("moves one item per arrow press all the way down and back up", async () => {
    await openCommandPalette();
    const values = await resetSelection();

    const down = [];
    for (let step = 1; step < values.length; step++) {
      await pressKey("ArrowDown");
      await settle();
      down.push(await selectedValue());
    }
    strictEqual(down.join(","), values.slice(1).join(","));
    ok((await listScrollTop()) > 0, "walking to the last item should have scrolled the list");

    const up = [];
    for (let step = 1; step < values.length; step++) {
      await pressKey("ArrowUp");
      await settle();
      up.push(await selectedValue());
    }
    strictEqual(up.join(","), values.slice(0, -1).reverse().join(","));
    strictEqual(await listScrollTop(), 0);
  });

  // Regression: keyboard navigation scrolls the list, which slides a different item under a
  // stationary cursor. WebKit answers that with a synthetic mousemove at the unchanged
  // coordinates, and cmdk's hover selection used to act on it — snapping the selection back
  // to whatever landed under the pointer, so arrow keys appeared to stop working.
  it("ignores the mouse move WebKit fires after a keyboard scroll", async () => {
    await openCommandPalette();
    const values = await resetSelection();

    await pressKey("End");
    await settle();
    strictEqual(await selectedValue(), values[values.length - 1]);
    ok((await listScrollTop()) > 0, "the last item should sit below the fold");

    const point = await listPoint(30);
    ok(await movePointer(point.x, point.y), "cursor should be parked over an item");
    await movePointer(point.x, point.y - 1);
    await settle();
    ok(await selectedValue(), "a real mouse move should still select the item under the cursor");
    await pressKey("End");
    await settle();

    let scrolls = 0;
    for (let step = 1; step < values.length; step++) {
      const scrollBefore = await listScrollTop();
      const expected = values[values.length - 1 - step];
      await pressKey("ArrowUp");
      await settle();
      strictEqual(await selectedValue(), expected, `ArrowUp did not advance at step ${step}`);
      if ((await listScrollTop()) === scrollBefore) continue;
      scrolls++;
      await movePointer(point.x, point.y - 1);
      await settle();
      strictEqual(
        await selectedValue(),
        expected,
        `the post-scroll mouse move stole the selection at step ${step}`,
      );
    }
    ok(scrolls > 0, "walking back up the list should have scrolled it at least once");
    strictEqual(await selectedValue(), values[0]);
  });

  it("still follows the pointer when the mouse actually moves", async () => {
    await openCommandPalette();
    const values = await resetSelection();
    const target = await browser.execute((value) => {
      const item = document.querySelector(`[cmdk-item][data-value="${value}"]`);
      if (!item) return null;
      const rect = item.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    }, values[2]);
    ok(target, "third command should be on screen");

    await movePointer(target.x, target.y - 4);
    await settle();
    await movePointer(target.x, target.y);
    await settle();
    strictEqual(await selectedValue(), values[2]);
  });
});
