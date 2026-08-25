# Column Stacking and Resizable Panes

Status: done
Owner: Yusuf

Two additions to the column system built in
[horizontal-pane-layout.md](./horizontal-pane-layout.md) and polished in
[pane-polish.md](./pane-polish.md), both previously listed there as
explicitly out of scope:

1. **Stacking** — panes scrolled past collapse into a thin, unlabeled sliver
   at the left edge instead of disappearing off-canvas, with a drop shadow
   marking the pane currently doing the covering, in the spirit of Andy
   Matuschak's [notes](https://notes.andymatuschak.org/About_these_notes).
2. **Resize** — drag a pane's divider to resize it, with a hover hint.

## 1. Stacking

### The mechanism: CSS `position: sticky`, not scroll-position JS

The visual effect — panes pile up as thin strips at the left edge as later
panes scroll into view, each covering the one before it except for a sliver
— is a well-known pure-CSS technique, not a scroll-tracking effect to
recreate by hand:

- Every pane gets `position: sticky; left: 0; z-index: <index>` — the _same_
  `left` for every pane, only `z-index` increases. Later panes (higher
  index, higher z-index) paint over earlier ones as the row scrolls. Once a
  pane's natural (un-stuck) position would carry it further left than `0`,
  it sticks there — pinned flush against the container's edge — while
  later panes continue sliding in from the right and pinning at that same
  `0`, covering progressively more of it. A chain of _n_ stuck panes ends
  up perfectly flush with each other, not staggered by a fixed width — see
  "Second follow-up" below for why this isn't `index * SPINE_WIDTH`, which
  is what shipped first.
- This needs no scroll listener to _produce_ the visual. `scrollWidth` is
  unaffected too — sticky doesn't remove an element from flow, so the row's
  scrollable extent is still the sum of every pane's full width, unchanged
  from today.

### What still needs JS: knowing when a pane is covered

Even though the covering itself is free, two things still need to know
_which_ panes are currently covered down to their sliver: the click-to-expand
scroll logic below, and the drop shadow on whichever pane is doing the
covering (see Rules). Rather than re-deriving what the browser's sticky
layout already knows from pane widths (which, being CSS `calc()`
expressions, aren't plain numbers available in JS — doubly so once resize
overrides are in the mix), read it directly off geometry, the same way
`useScrollFocusedPaneIntoView` already reads pane rects reactively at event
time rather than owning a parallel model of where things are:

```
collapsed[i] = i is not the last pane
            && nextPaneRect.left - paneRect[i].left <= tolerance
```

A pane is collapsed exactly when the _next_ pane's sticky-stuck left edge has
advanced to (essentially) the same position as this pane's own left edge —
zero gap, fully hidden, not merely "within some floor." This self-corrects
under resize drags, window resizes, and pane-count changes with no separate
width bookkeeping.

Implementation: a small co-located hook, `use-pane-stacking.ts` next to
`column-panes.tsx`, reads every `[data-pane]` child's `getBoundingClientRect()`
in one batch and writes `data-collapsed="true"|"false"` directly onto each
element — an imperative DOM write, not React state, so a 20-pane row
scrolling doesn't cause 20 re-renders per frame. Re-runs on: a `scroll`
listener on the row (passive, rAF-throttled), a `ResizeObserver` on the row
(window resize, resize-drag), and once on mount/pane-count change.

**Revised after follow-up feedback: no label in the sliver.** The first cut
had a `PaneSpine` overlay showing the tab's title as vertical text
(`writing-mode: vertical-rl`) in the visible sliver, clickable to expand.
Asked to remove it — screenshot showed it read as a column of "vertical
tabs," not a stack of cards. `PaneSpine` (and its CSS file) is deleted; a
collapsed pane's sliver is just whatever's naturally at the left edge of its
real content, same as it would be without any of this machinery. Nothing
else changes: `PaneFrame`'s existing `onPointerDown` already covers the
whole pane box including that sliver, so click-to-expand still works with no
dedicated element to click.

### Expanding a collapsed pane

Clicking a collapsed pane's visible sliver calls the same
`setActiveTab(tab.id)` `PaneFrame` already wires on `onPointerDown` for the
whole pane box — no dedicated click target, no new click handler needed. The
existing
`useScrollFocusedPaneIntoView` effect (triggered on `activeTabId` change)
already scrolls the newly-focused pane into view; it needs two additions:

- Its "is this pane clipped" check currently only compares the pane's rect
  against the row's edges, which a _stuck_ pane always passes (sticky keeps
  it inside the row's bounds by construction, so the existing check would
  wrongly treat a collapsed pane as "already visible"). Added condition:
  also clipped when `pane.dataset.collapsed === "true"` — reading the same
  attribute `use-pane-stacking.ts` already maintains, rather than
  re-deriving collapse from geometry a second time.
- The existing delta-based scroll target (nudge past whichever edge was
  clipped) doesn't apply to a collapsed pane: its rect is at its _sticky_
  position, not a position a fixed nudge would usefully escape. Scroll to
  the pane's natural, un-stuck offset instead — reading it from
  `data-natural-left`, a second attribute `use-pane-stacking.ts` writes
  alongside `data-collapsed`.

  **Revised after live testing:** the natural first idea — `pane.offsetLeft`,
  which the CSSOM spec says should already be a sticky element's static
  position — does not work here. WebKit's WKWebView (this app's runtime)
  returns the element's _current stuck_ position instead once it's stuck, not
  the static one. Verified live: for a collapsed pane, `offsetLeft` came back
  equal to `scrollLeft + <its sticky left>` — so "scroll to offsetLeft" was
  scrolling to (approximately) wherever the row already was, and clicking a
  spine did almost nothing.

  Fixed by computing the natural offset in `use-pane-stacking.ts` instead,
  from data it already has: `position: sticky` repositions an element
  without changing its size, so a stuck pane's `getBoundingClientRect().width`
  is still its true rendered width. A running sum of every pane's width,
  left to right, reconstructs each one's natural flow offset regardless of
  which ones are currently stuck — no `offsetLeft` involved, so no WebKit
  quirk to work around. Written as `data-natural-left` in the same batched
  rect-read pass that already computes `data-collapsed`.

### Rules

- Panes need an opaque background once stacking is in play — found live,
  not guessable from reading the code. z-index only orders _painted_
  pixels; a pane's own box (mostly empty space around centered text) has no
  fill of its own, so with no background a covering pane doesn't actually
  hide what's behind it — an earlier "covered" pane's text showed straight
  through.

  **Revised after follow-up feedback: opaque, not translucent.** The first
  fix used `bg-[var(--bg)]` — the app's usual background, which is
  intentionally translucent (`color-mix` with `--bg-opacity`) so OS vibrancy
  shows through. That was enough to stop literal double-exposed text but
  still let a covered pane bleed through faintly, visible in a follow-up
  screenshot. Asked for the pane to be fully opaque instead: `ColumnPanes`'
  `PANE` class now carries `bg-surface-primary` (`--surface-primary`, the
  same `--bg-base` color with no transparency mixed in at all — already
  registered as a Tailwind theme color in `App.css`, just not previously
  used as a pane background). Neither version contradicts `App.css`'s note
  that editor/settings pages skip their own background layer to avoid
  multiplying translucency — that reasoning held only because no two panes
  ever shared a pixel before; stacking makes that no longer true, so
  occluding a pixel two panes now genuinely share is a new requirement, not
  a violation of the old one.

- ~~**A drop shadow on the pane doing the covering**, not just an opaque
  background — the depth cue that makes the stack read as physically
  layered cards rather than a lucky z-order.~~ **Removed** — see "Fourth
  follow-up" below. The second and third follow-ups below are the history
  of building it; none of that ships anymore.
- Only `ColumnPanes` stacks. `StackedPanes` shows one pane at a time; there
  is nothing to pile up.
- Every pane sticks at the _same_ `left: 0` (see "Second follow-up" below)
  — there is no per-pane spine-width constant anymore; a deep stack can
  end up perfectly flush.
- The pane divider from `pane-polish.md` item 1 stays; a collapsed pane
  keeps its own left-edge divider (still fading below the tab strip), so
  the stack still reads as discrete panes even without a spine label.
- A pane's own footer (word count etc.) and search overlay live inside the
  same DOM subtree; when collapsed they're covered along with everything
  else, same as ordinary scroll-clipping today — no special-casing.

### Second follow-up: true zero-gap stacking, and the shadow trigger

Three more asks, from watching the shadow (previous section) run against
real content:

1. **The shadow should show the instant any overlap begins**, not just once
   a pane is fully collapsed. The trigger was `data-overlapping = (previous
pane's data-collapsed)` — collapsed meaning _fully_ covered down to its
   spine — so nothing showed during the (visually obvious, screenshot-
   confirmed) partial-overlap period beforehand.
2. **A pane should be able to fully stack on another with zero gap** — no
   permanent minimum reveal. The `SPINE_WIDTH`-per-index sticky offset (`left:
index * SPINE_WIDTH`) guaranteed every collapsed pane a permanent
   44px-minimum sliver that persisted no matter how far you scrolled — a
   floor that made true full coverage structurally impossible.
3. **The shadow should clear once a pane is fully stacked (zero gap)** —
   nothing left to cast it on.

All three came from the same fix. Every pane's sticky `left` changed from
`index * SPINE_WIDTH` to a flat `0` — every pane slides in from the right
and pins flush against whatever's already stuck at the row's left edge, so
a chain of _n_ stuck panes ends up perfectly flush (not staggered by
`SPINE_WIDTH` each), reachable by scrolling far enough. `SPINE_WIDTH` itself
is gone — nothing uses it anymore.

With that geometry change, `use-pane-stacking.ts`'s two attributes split
cleanly along the transition:

```
collapsed[i]   = nextRect.left - rect[i].left <= TOLERANCE        // fully flush, zero gap
overlapping[i] = rect[i].left < prevRect.right - TOLERANCE        // any real overlap at all
              && !collapsed[i-1]                                   // …but not yet fully flush
```

`overlapping[i]` — the shadow trigger — is true for exactly the transition
window: some overlap, but not so much that the previous pane is completely
hidden. `collapsed[i]` still means "fully flush," just with `TOLERANCE`
(≈0) as the threshold instead of `SPINE_WIDTH + TOLERANCE`, since there's
no more permanent floor to measure against.

### Third follow-up: the shadow wasn't actually visible — a WebKit bug

Even with the trigger firing correctly (`data-overlapping="true"`,
`opacity: 1` confirmed in computed style), a pixel probe across the
boundary found **zero darkening** — pure white on both sides except the 1px
divider line. The shadow was computing as "on" but not painting anything.

Root cause, confirmed live rather than guessed at: WebKit (this app's
WKWebView runtime) does not render `box-shadow` on an element that also has
`mask-image` — the mask silently discards the shadow entirely, not just
its fade. Tried `filter: drop-shadow()` instead (a filter effect rather
than a box decoration) on the theory that it would compose with masking
correctly; confirmed live that WebKit breaks that combination too — an
intentionally loud, unmasked, bright-red `drop-shadow()` rendered exactly
as expected, and simply adding `mask-image` back (no other change) made it
vanish again.

Given neither primitive survives being masked on this runtime, and that
reproducing a true gradient fade without `mask-image` (e.g. several
discrete opacity bands) would add real complexity for a purely cosmetic
nicety, the shipped version drops the smooth fade: `.pane-overlap-shadow`
uses `filter: drop-shadow(0px 0px 15px rgba(0, 0, 0, 0.1))` with **no**
mask, and its box starts at `top-strip height + the divider's own 32px
fade distance` (`pane-frame.tsx`'s `DIVIDER_FADE_DISTANCE`) instead of
right at the tab strip. That means the shadow has a hard top edge, but it
starts exactly where the divider has _already_ finished fading in, so
there's no window where a hard-edged shadow overlaps a still-fading
divider — the two don't visually clash, even though only one of them
actually fades.

`filter: drop-shadow()` needs an actual opaque shape to cast a shadow from
— a fully transparent element casts nothing — so `.pane-overlap-shadow`
carries `background: var(--surface-primary)` (the pane's own fill) and is
rendered as the pane's _first_ child, before its real content, so that
content paints over this flat fill wherever it exists; where it doesn't
(padding, gaps), it's the same color the pane already shows there, so
nothing changes visually except the shadow bleeding out past the pane's
edge.

**Follow-up opportunity, not pursued here:** a real smooth fade via
several stacked bands at decreasing opacity, each avoiding `mask-image`
individually. Left for later if the hard edge turns out to matter more
than it looked in testing.

### Fourth follow-up: the shadow is removed

Asked to drop the overlap shadow entirely, along with the code that decided
when to show it. The `.pane-overlap-shadow` element and its stylesheet, the
`data-overlapping` attribute, and the `overlapping[i]` half of
`use-pane-stacking.ts`'s recompute are all gone; the shadow's `top` offset
was the only thing outside `pane-frame.tsx` that cared about
`DIVIDER_FADE_DISTANCE`, which stays as the divider's own fade.

The rest of the stacking work is untouched: sticky `left: 0` per pane, the
opaque `bg-surface-primary`, `collapsed[i]`, `data-natural-left`, and the
click-to-expand scroll all behave exactly as before. Depth now reads from
the divider and the opaque background alone. The two follow-ups above are
kept as a record of what was learned live — chiefly that on this WebKit
runtime neither `box-shadow` nor `filter: drop-shadow()` renders on a
masked element — so a future attempt doesn't re-derive it.

### Out of scope

- Reordering panes by dragging a spine.
- Persisting stack state across a session restore — it's a function of
  `scrollLeft`, recomputed fresh each time the row mounts, same as today's
  scroll position isn't restored either.
- Touch/trackpad-specific tuning beyond the browser's native momentum
  scrolling.

## 2. Resizable panes with hover hinting

### Model: per-pane width override, not a redistributing split view

Dragging divider _i_ (the divider between pane _i-1_ and pane _i_, added in
`pane-polish.md` item 1) resizes pane _i-1_ — the column whose right edge it
is, matching Finder's column view. This is deliberately **not** a
redistributing split (dragging doesn't shrink the neighbor to compensate):
an overridden pane gets a fixed px width; every pane _without_ an override
keeps dividing the remaining space per the existing floor/expand formula
from `pane-polish.md` item 3, now computed against `100% - sum(overrides)`
instead of `100%`, among the non-overridden panes.

- New store, `stores/pane-width-store.ts`: `Record<tabId, number>`,
  in-memory only — not persisted to `sessions.json` or settings. Resizing is
  a reading-session action, not a permanent property of the file; restarting
  the app resets every pane to auto-width. (`appearance.pane-width` stays
  what it's always been: the floor for auto-sized panes.)
- Domain hooks in `hooks/use-pane-layout.ts` — `usePaneWidthOverrides()`
  (the whole map; `ColumnPanes` needs every entry to compute the remaining
  space, not just one pane's), `useSetPaneWidthOverride()`,
  `useClearPaneWidthOverride()` — per `docs/react-guidelines.md`, components
  never import the store directly.
- Clamped to `[appearance.pane-width, 70vw]` while dragging, so a pane can't
  be dragged narrower than the floor everyone else respects, or wide enough
  to strand every other pane at the floor.
- Double-clicking a divider clears that pane's override, snapping it back to
  auto-width.
- Dragging bails at pointerdown if the target pane is currently a collapsed
  spine (`data-collapsed`, read directly off the DOM) — resizing one makes
  no sense. Not gated at render time: collapse state deliberately isn't
  React state (see item 1), so the divider's cursor/hover affordance doesn't
  know in advance whether the drag will be a no-op; a minor, accepted v1
  imperfection rather than adding a parallel reactive collapse signal just
  for this.

### Hover hinting

Mirrors the sidebar resize handle already in `app-layout.tsx`
(`hover:after:bg-[var(--line-subtle)]`, `data-[dragging]:after:bg-[var(--border-color)]`,
a wider invisible hit-target than the visible 1px line via a `before:` pseudo
element): on hover, `cursor: col-resize` and the divider's line brightens;
while dragging, it stays brightened regardless of pointer position (same
`data-dragging` attribute pattern).

### Files

`apps/desktop/src/components/editor-area/column-panes.tsx` (sticky
positioning, opaque background), `apps/desktop/src/components/editor-area/pane-frame.tsx`
(resize handle; no longer renders a spine label),
`apps/desktop/src/components/editor-area/use-pane-stacking.ts`
(new — `data-collapsed`, `data-natural-left`),
`apps/desktop/src/components/editor-area/use-pane-resize.ts` (new),
`apps/desktop/src/stores/pane-width-store.ts` (new),
`apps/desktop/src/hooks/use-pane-layout.ts`,
`apps/desktop/src/components/editor-area/use-scroll-focused-pane-into-view.ts`.
`pane-spine.tsx` / `pane-spine.css` and `pane-overlap-shadow.css` each
existed briefly and were deleted (see above).

## Verification

`vp check`, `vp test` (534 passing, no regressions). Live e2e verification
via a built e2e app + WebdriverIO (this is an inherently visual,
scroll-driven feature — screenshots and geometry assertions, not just unit
coverage of the pure `collapsed[i]` formula, are what caught both bugs
above): collapse-on-scroll confirmed via `data-collapsed` across a 5-pane
row, spine click confirmed un-collapsing via `data-collapsed` flipping back
to `false` and `scrollLeft` landing exactly at the pane's natural offset,
drag-to-resize and double-click-reset confirmed via measured pane widths,
plus a screenshot pass for the visual occlusion fix. Two WebDriver-level
false leads along the way, not app bugs: `element.click()` /
`element.doubleClick()` were unreliable through this experimental
tauri-webdriver plugin — dispatching raw `PointerEvent`/`MouseEvent`s
directly worked; and reading a post-dispatch DOM state in the same
synchronous `browser.execute()` call raced React's flush — a short pause
after dispatch fixed it.
