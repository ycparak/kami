# Pane Layout Notes

Rules for the two-mode pane system in `apps/desktop/src/components/editor-area/`.
Each one cost real time to learn. Apply them when extending or reviewing pane,
placement, or unfurl code. The design record and its rationale live in
[SPECs/horizontal-pane-layout.md](../SPECs/horizontal-pane-layout.md).

## The shape

`appearance.column-layout` picks a renderer, and both wrap every tab in the same
`PaneFrame`:

- `ColumnPanes` — every tab is a column in one horizontally-scrollable row.
- `StackedPanes` — one tab at a time; the rest are overlaid and hidden.
- `PaneFrame` — a page-kind body plus its footer chrome, in a box the caller
  positions.

Panes _are_ tabs. `editor-store.ts` already models `tabs: Tab[]` with per-tab
location and history, so there is no parallel pane list to keep in sync.

## Positioning belongs to the renderer, never the body

`EditorPane` and `SettingsPanel` each used to hardcode
`isActive ? "relative z-10 h-full" : "absolute inset-0 invisible …"`. A row of
columns cannot express that, and adding the case would have meant editing both
bodies — the `docs/consolidation.md` smell.

Bodies are now plain `relative h-full` and fill whatever box they are given.
`PaneFrame` takes `className`/`style` from the renderer. If you add a page kind,
it inherits both layouts for free; if you find yourself branching on layout mode
inside a body, the responsibility has leaked.

## "Focused pane" is not "editor has DOM focus"

The distinction has caused two separate bugs. Chrome _inside_ a pane
legitimately takes DOM focus away from its editor — opening ⌘F moves focus into
the find input — while the pane remains the focused one.

- Drive pane-scoped behavior from `isActive` (the store's `activeTabId`),
  supplied from React.
- Use `view.hasFocus` only to decide whether to _call_ `view.focus()`, never to
  decide what a pane should render.

Keying unfurl suppression on `view.hasFocus` re-folded the document being
searched the instant the find panel opened. `setPaneFocused` in
`pane-focus-unfurl.ts` is the one writer.

## Suppress ≠ freeze

Two facets gate unfurling, and picking the wrong one produces a plausible-looking
bug:

- `unfurlFreezeFacet` — pin decorations to their **last computed** shape. For
  pointer drags, so text does not reflow under the cursor.
- `unfurlSuppressFacet` — compute as if the document had **no selection**, so
  everything renders folded. For panes that are visible but not focused.

Both `hide/core.ts` and `fold/core.ts` read their selection through
`unfurlSelectionRanges(state)`, so every widget built on the fold facet — tables,
mermaid, math, wiki links — inherits suppression without its own case. A focus
change alters neither the doc nor the selection, so `unfurlSuppressChanged(tr)`
is a required rebuild trigger alongside `tr.docChanged || tr.selection`.

## One resolver decides where an opened file lands

`resolveOpenPlacement` is pure and total: uniqueness check, then intent
(`open` / `navigate` / `new-pane`). `openPath` is the only write path;
`openFile`, `navigateToFile`, and `openFileInNewTab` just declare intent.

Add placement rules there, not in the actions. The invariant that outranks
everything: **one file, one pane**, in both modes — a path already open is
focused, never duplicated.

Only `open` still branches on layout mode. `navigate` (a link click, or the
command palette's default selection) and `new-pane` (⌘-click, ⌘-Enter) do
not — they behave the same in stacked and columns mode: unmodified navigates
the source pane in place, modified inserts a new pane beside it, same as an
ordinary browser tab. `open` (sidebar, recents) still differs by mode —
stacked mode reuses the focused tab, columns mode appends — because a
sidebar click has no originating pane to reuse in place and no modifier
available to ask for a new one (cmd/ctrl-click there is multi-select, not
"open in new tab").

This retired columns mode's earlier "sliding panes" behavior, where an
unmodified link click inserted a new pane and truncated everything to its
right. See [SPECs/pane-polish.md](../SPECs/pane-polish.md) item 5 for why,
and [SPECs/horizontal-pane-layout.md](../SPECs/horizontal-pane-layout.md) for
the original design record.

## Pane width is CSS, not measurement — for the _auto_ width

`min(100%, max(<floor>px, calc((100% - <reserved>px) / <auto-count>)))`.
Percentages resolve against the row's _visible_ width, not its scroll extent,
so equal-width panes that fill the row and then overflow need no measurement
for their own sizing. `<reserved>` is the sum of any drag-resized panes' fixed
widths (0 if none) — auto panes divide whatever's left, not the whole row.

This rule is about the _width formula_ specifically, not everything pane-
related: `use-pane-stacking.ts` does read `getBoundingClientRect()` on a
`ResizeObserver`/scroll cadence, for a different question — not "how wide
should this pane be" (still pure CSS) but "is this pane currently fully
covered," which is unavoidably a live-geometry question once stacking is
involved. Don't read that as license to reach for measurement for width
itself; it stayed CSS.

## Columns set their own gap below the tab strip

Columns mode puts a document's first line exactly **88px** below the tab
strip; stacked mode and compact-file windows keep the historical padding
(`8rem`, `9rem` at Tailwind's `md`). One value can't serve both, and
`EditorPane` cannot ask which renderer placed it — it is reached through the
page-kind view registry, and compact windows pin `"tabs"` via a prop rather
than the setting, so reading `useLayoutMode()` there would be wrong for
them. So the renderer decides, matching the rule that positioning belongs to
the renderer: `--kami-editor-top-pad` has its default in `App.css` and is
overridden on `ColumnPanes`' row, where every pane inherits it.
`editor-pane.tsx` consumes it as an inline style, so the row's override wins
without a specificity fight against a `pt-*` utility.

The padding is not the gap. Two fixed blocks sit between a pane's top edge
and its first line, and the constant in `column-panes.tsx` discounts both:
`EditorScrollContainer`'s 12px transparent top border, and the frontmatter
wrapper's own 24px `pb-6`. That bottom padding reads as part of the gap
whenever a document has no frontmatter — which is the case the 88px targets;
a document _with_ frontmatter shows the panel 24px higher, as before. Both
offsets were measured live against the built app rather than derived, and
they are the reason a plain `padding-top: 88px` would land 36px low.

## Stacking: `position: sticky`, not scroll-position JS

Panes scrolled past collapse fully behind the next one — zero gap, no
permanent minimum reveal — instead of disappearing off-canvas. The stacking
_visual_ is pure CSS — every pane is `position: sticky; left: 0; z-index:
<index>`, set by `ColumnPanes`. The _same_ `left: 0` for every pane, not a
per-index offset: each pane slides in from the right and pins flush against
whatever's already stuck at the row's edge, so a whole chain of stuck panes
ends up perfectly flush with each other, not staggered. (An earlier version
used `left: index * SPINE_WIDTH`, guaranteeing every collapsed pane a
permanent width-sized sliver that could never fully close — asked to
remove that floor entirely, so this is gone along with the `SPINE_WIDTH`
constant.) No scroll listener produces any of this — it's what sticky does.

What isn't pure CSS: knowing _when_ a pane is fully covered (zero gap).
`use-pane-stacking.ts` answers that from geometry (`nextPaneRect.left -
paneRect.left <= tolerance`), written as `data-collapsed` directly on the
DOM — not React state, so a wide row scrolling doesn't re-render every pane
every frame. One thing consumes it: the click-to-expand scroll logic below.
There is no spine label — a `PaneSpine` overlay showing the tab's title as
vertical text was tried and removed; it read as a column of sideways tabs,
not a stack of cards, and `PaneFrame`'s existing `onPointerDown` already
covers the whole pane including its sliver, so nothing else needed to change
to keep click-to-expand working.

**There is no overlap shadow.** A depth cue on the pane currently sliding
over the one behind it (a `data-overlapping` attribute driving a
`drop-shadow()` on a dedicated child element) was built and then removed by
request — the separation reads well enough from the divider and the opaque
background alone. If it ever comes back, note what the original attempt
established live: WebKit (this app's WKWebView runtime) renders neither
`box-shadow` nor `filter: drop-shadow()` on an element that also has
`mask-image`, so a shadow that fades out at the top cannot simply be masked.

**A pane needs its own _opaque_ background once panes can overlap.** z-index
only orders _painted_ pixels; a covering pane with no background of its own
is mostly empty space around centered content, so it doesn't actually hide
an earlier pane behind it. `ColumnPanes`' pane class carries
`bg-surface-primary` for exactly this reason — found live (a screenshot
showed bleed-through), not guessable from the code. `--surface-primary` was
chosen over the app's usual `--bg` deliberately: `--bg` is intentionally
translucent (OS vibrancy shows through), which was tried first and still let
a covered pane bleed through faintly. This doesn't reopen the "don't
multiply translucency across layers" reasoning elsewhere in the app: that
held only while no two panes ever shared a pixel, which stacking ends.

**WebKit gotcha:** don't reach for `pane.offsetLeft` to find a sticky
element's natural (un-stuck) position. The CSSOM spec says `offsetLeft`
should already be the static position, but WebKit's WKWebView (this app's
runtime) returns the _current stuck_ one instead once an element sticks —
confirmed live, not a guess. `use-pane-stacking.ts` computes the natural
offset itself instead, as a running sum of preceding panes'
`getBoundingClientRect().width` (sticky repositions without resizing, so
width stays trustworthy regardless of stuck state) — written as
`data-natural-left` alongside `data-collapsed`.

See [SPECs/pane-stacking-and-resize.md](../SPECs/pane-stacking-and-resize.md).

## Resize is a width override, not a redistributing split

Dragging a divider (`use-pane-resize.ts`) sets a fixed px width for the pane
to its _left_ — the column whose right edge the divider is, Finder's column
view — in an in-memory-only store (`stores/pane-width-store.ts`). It does not
shrink the neighbor to compensate. Every pane _without_ an override keeps
dividing whatever's left per the auto-width formula above.

Not persisted anywhere (not `sessions.json`, not settings): resizing is a
reading-session action. Restarting the app resets every pane to auto-width.

Dragging bails at pointerdown if the target pane is currently a collapsed
spine, read directly off `data-collapsed` — not gated at render time, since
that attribute is deliberately not React state (above).

## Compact windows are single-document by construction

A standalone window must never grow a second pane, whatever
`appearance.column-layout` says. The editor store carries
`isSingleDocumentWindow`, set by `openCompactFile` — the only way such a window
is populated.

It does **not** read chrome mode from the workspace store: that store already
imports the editor store, and reaching back would close an import cycle.

## E2E gotchas

`vite.config.ts` sets `environment: "node"`, so there is no DOM in the unit
suite — pane structure is only reachable from `e2e/specs/pane-*.spec.js`.

- **Seed your own session.** Specs share one app data dir. A spec that inherits
  whatever tabs the previous one left is a spec that fails in suite order but
  passes alone. Seed in `before`, restore a single-tab session in `after`.
- **A hidden marker is a DOM shape, not a style.** A hidden heading hash is
  `.cm-heading-hash > .cm-hidden-token`. The hash element does not carry the hide
  class, its `getBoundingClientRect()` is fixed-width because it is a hanging
  marker, and the inner element's computed `font-size` is `16px` — the theme's
  `0px` is deliberately overridden (see `prosemark-theme.css`). Assert on the
  nesting.
- **`.cm-focused` is unreliable** — the driven window often lacks OS focus. Read
  the `data-pane-focused` attribute instead.
- **Tab clicks need the inner button.** The handler is on the `role="button"`
  inside `[data-tab-id]`, not the wrapper.
- **`Cmd+,` is a native menu accelerator**, so a synthetic keydown will not open
  Preferences. Go through the command palette's `open-settings` item.
- Geometry is not comparable across a cold and a warm start: CodeMirror estimates
  heights for lines the viewport never measured, so a cold launch reports a
  taller document than a warm restore of the same build.

## File map

- `pane-frame.tsx` — the shared pane box; owns `data-pane`/`data-pane-id`.
- `column-panes.tsx` — the row, the width expression, the sticky
  `left`/`z-index` per pane, and columns' `--kami-editor-top-pad` override.
- `stacked-panes.tsx` — the overlay, and the `keepAlive` gate.
- `pane-focus-unfurl.ts` — the focused-pane flag and its facet wiring.
- `use-scroll-focused-pane-into-view.ts` — nearest-edge horizontal scroll;
  also un-collapses a stacked pane on focus.
- `use-pane-stacking.ts` — `data-collapsed` / `data-natural-left`, the only
  source of truth for which panes are currently covered.
- `use-pane-resize.ts` — drag-to-resize a divider.
- `stores/pane-width-store.ts` — in-memory drag-resize overrides.
- `stores/editor-store.ts` — `resolveOpenPlacement`, `openPath`, placement.
