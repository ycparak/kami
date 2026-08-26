import { ok, strictEqual } from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { closeAllTabs, ensureOneOpenFile, invoke, waitForMount } from "../helpers/workspace.js";

const SHOT = process.env.SHOT_OUT ?? "/tmp/columns.png";

async function pressNewTab() {
  await browser.execute(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", metaKey: true, bubbles: true, cancelable: true }),
    );
  });
  await browser.pause(300);
}

async function ensurePanes(n) {
  for (let i = 0; i < 12; i++) {
    const { paneCount } = await paneReport();
    if (paneCount >= n) return paneCount;
    await pressNewTab();
  }
  throw new Error(`could not reach ${n} panes`);
}

async function paneReport() {
  return browser.execute(() => {
    const row = document.querySelector("[data-pane-row]");
    if (!row) return { row: false };
    const panes = Array.from(row.querySelectorAll(":scope > [data-pane]"));
    const cs = getComputedStyle(row);
    return {
      row: true,
      overflowX: cs.overflowX,
      scrollSnapType: cs.scrollSnapType,
      clientWidth: row.clientWidth,
      scrollWidth: row.scrollWidth,
      scrollLeft: row.scrollLeft,
      paneCount: panes.length,
      widths: panes.map((p) => Math.round(p.getBoundingClientRect().width)),
      tops: panes.map((p) => Math.round(p.getBoundingClientRect().top)),
      lefts: panes.map((p) => Math.round(p.getBoundingClientRect().left)),
      visible: panes.filter((p) => getComputedStyle(p).visibility === "visible").length,
      footers: document.querySelectorAll("[data-pane-row] [data-document-footer]").length,
      dividers: panes.map((p) => Boolean(p.querySelector(":scope > [data-pane-divider]"))),
    };
  });
}

describe("columns layout", function () {
  before(async function () {
    await ensureOneOpenFile();
    await invoke("reset_setting", { key: "appearance.column-layout", scope: "global" });
    await invoke("reset_setting", { key: "appearance.pane-width", scope: "global" });
    await browser.refresh();
    await waitForMount();
    await browser.pause(2_000);
    await ensureOneOpenFile();
    await ensurePanes(3);
    // Opening tabs focuses the newest pane and scrolls the row right, which collapses the
    // earlier panes onto a shared left edge. Start from the row's origin so the geometry
    // assertions see every pane at its natural position.
    await browser.execute(() => {
      document.querySelector("[data-pane-row]")?.scrollTo({ left: 0, behavior: "auto" });
    });
    await browser.pause(600);
  });

  after(async function () {
    await closeAllTabs();
  });

  it("lays every open tab out as a column in one scrollable row", async function () {
    const r = await paneReport();
    console.log(`\n[columns] ${JSON.stringify(r, null, 2)}\n`);

    ok(r.row, "expected a [data-pane-row]");
    ok(r.paneCount >= 3, `expected at least 3 panes, got ${r.paneCount}`);
    strictEqual(r.visible, r.paneCount, "every pane should be visible in columns mode");
    strictEqual(r.overflowX, "auto");
    ok(
      r.scrollSnapType === "none" || !r.scrollSnapType,
      `expected no scroll snapping, got ${r.scrollSnapType}`,
    );
    ok(r.scrollWidth > r.clientWidth, "row should overflow and scroll");

    strictEqual(new Set(r.tops).size, 1, "all panes share a top edge");
    ok(
      r.lefts.every((l, i) => i === 0 || l > r.lefts[i - 1]),
      "panes advance left to right",
    );

    const expected = Math.min(r.clientWidth, Math.max(720, r.clientWidth / r.paneCount));
    ok(
      r.widths.every((w) => Math.abs(w - expected) <= 1),
      `panes should be ${expected}px wide, got ${r.widths}`,
    );
    strictEqual(new Set(r.widths).size, 1, "all panes must be equal width");

    ok(r.footers >= 1, "expected at least one per-pane footer");
    strictEqual(r.dividers[0], false, "first pane has no left divider");
    ok(
      r.dividers.slice(1).every((d) => d === true),
      `subsequent panes need a divider, got ${r.dividers}`,
    );
  });

  it("scrolls horizontally without snapping", async function () {
    await browser.execute(() => {
      document.querySelector("[data-pane-row]").scrollLeft = 300;
    });
    await browser.pause(500);
    const after = await paneReport();
    strictEqual(after.scrollLeft, 300, "free scroll position should be preserved");
  });

  it("grows panes to fill the row when an even split clears the floor", async function () {
    await invoke("set_setting", { key: "appearance.pane-width", value: 100, scope: "global" });
    await browser.refresh();
    await waitForMount();
    await browser.pause(1_500);
    await ensurePanes(3);

    const r = await paneReport();
    const even = r.clientWidth / r.paneCount;
    ok(
      r.widths.every((w) => Math.abs(w - even) <= 1),
      `expected an even ${even}px split, got ${r.widths}`,
    );
    ok(
      r.scrollWidth - r.clientWidth <= 1,
      `row should not overflow when panes fit: ${r.scrollWidth} vs ${r.clientWidth}`,
    );

    await invoke("reset_setting", { key: "appearance.pane-width", scope: "global" });
    await browser.refresh();
    await waitForMount();
    await browser.pause(1_500);
  });

  it("respects appearance.pane-width as a floor", async function () {
    await invoke("set_setting", { key: "appearance.pane-width", value: 420, scope: "global" });
    await browser.refresh();
    await waitForMount();
    await browser.pause(1_500);
    await ensurePanes(3);
    const r = await paneReport();
    ok(
      r.widths.every((w) => Math.abs(w - 420) <= 1),
      `expected 420px panes, got ${r.widths}`,
    );
    await invoke("reset_setting", { key: "appearance.pane-width", scope: "global" });
    await browser.refresh();
    await waitForMount();
    await browser.pause(1_500);
  });

  it("clamps a pane to the row when the floor exceeds the available width", async function () {
    await invoke("set_setting", { key: "appearance.pane-width", value: 4000, scope: "global" });
    await browser.refresh();
    await waitForMount();
    await browser.pause(1_500);
    await ensurePanes(2);

    const r = await paneReport();
    ok(
      r.widths.every((w) => Math.abs(w - r.clientWidth) <= 1),
      `panes should clamp to the row's ${r.clientWidth}px, got ${r.widths}`,
    );

    await invoke("reset_setting", { key: "appearance.pane-width", scope: "global" });
    await browser.refresh();
    await waitForMount();
    await browser.pause(1_500);
  });

  it("captures a screenshot", async function () {
    await browser.execute(() => {
      document.querySelector("[data-pane-row]").scrollLeft = 0;
    });
    await browser.pause(600);
    const png = await browser.takeScreenshot();
    writeFileSync(SHOT, Buffer.from(png, "base64"));
    console.log(`\n[columns] screenshot -> ${SHOT}\n`);
  });
});
