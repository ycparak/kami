# Horizontal Pane Layout

Status: done
Owner: Yusuf

Implemented across nine commits, `5dd3aa5`..`HEAD`. This file is the design
record — the rationale behind each decision, kept because the alternatives it
rules out still look reasonable. The working rules for extending the pane system
live in [docs/pane-layout.md](../docs/pane-layout.md).

Make the default editor layout a row of horizontally-scrollable columns — one
column per open tab — with the current one-tab-at-a-time behavior kept behind a
setting.

## Motivation

Kami targets writers working in linked vaults. Following a wiki-link today
replaces what you were reading; the link trail lives only in per-tab back/forward
history, which you cannot see. Rendering every open tab as a column turns that
trail into something spatial: the row itself is the reading context, and moving
between related notes is a scroll rather than a mode switch.

## Terminology

- **Pane** — one column in the row. Backed 1:1 by an existing `Tab` in
  `editor-store.ts`. "Tab" and "pane" name the same record; which word is used
  depends on which layout mode is rendering it.
- **Pane row** — the horizontally-scrollable container holding every pane.
- **Focused pane** — the pane that owns `activeTabId`. Drives the tab-strip
  highlight, ⌘W, ⌘F, back/forward, and sidebar highlighting.
- **Stacked mode / columns mode** — the two values of `appearance.layout-mode`.

## Design decisions

These were settled before implementation; the rationale matters more than the
rule, because each one closes off an alternative that looks reasonable in
isolation.

### Panes are tabs, not a parallel structure

`editor-store.ts` already models `tabs: Tab[]` with a per-tab `location` and
per-tab back/forward stacks. That is exactly a pane row. Introducing a separate
pane list would duplicate the session format, the file-pruning logic
(`maybePruneFiles`), the rename/delete rewrite paths, and every keyboard
shortcut. Columns mode changes only **how the list renders** and **how opens
mutate the list** — never what the list is.

### All panes are already mounted

`fileKind.keepAlive === true`, so `EditorArea` mounts every file tab today and
hides the inactive ones with `absolute inset-0 invisible`. Columns mode makes the
same already-mounted panes visible side by side. This is not a new mount cost and
does not need virtualization up front. If a very wide row with many panes proves
slow, viewport-windowed mounting is a follow-up, not a prerequisite.

### One file, one pane (global invariant)

A path is open in at most one tab, in **both** layout modes.

Enforcing it only in columns mode would require a dedup pass on every mode
switch — plus a rule for which duplicate survives — and two code paths in every
open action. Global uniqueness costs one behavior change instead:
`openFileInNewTab` loses its current "always create a fresh tab for `path`, even
if another tab already shows it" guarantee.

The invariant applies to a location's `primaryPath` when non-null. Kinds with no
path (`launcher`) are still free to appear more than once; `settings` remains a
singleton through its existing `openOrFocus` path.

### Sliding panes: opens are relative to their source

**Superseded.** The "link click inside pane N" and "⌘-click" rows below —
the columns-mode-only behavior where a plain link click truncated panes to
its right — were retired by [SPECs/pane-polish.md](./pane-polish.md) item 5,
in favor of the same modifier-driven rule in both layout modes (unmodified
navigates in place, modified opens a new pane). Kept here as the record of
what was originally decided and why; see [docs/pane-layout.md](../docs/pane-layout.md)
for the current rule.

In columns mode (as originally shipped):

| Action                                      | Result                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| Sidebar / palette / recents click           | Focus the pane if already open, else append at the far right  |
| Link click inside pane _N_                  | Truncate panes right of _N_, insert target at _N+1_, focus it |
| ⌘-click / "Open in new tab" inside pane _N_ | Insert at _N+1_, **no** truncation                            |
| Target already open in any pane             | Focus and scroll to that pane. No truncation, no reordering   |
| Back / forward (⌥←, ⌥→, arrows)             | In-place on the focused pane, unchanged from today            |

"Target already open" wins over every other row. Following a link never destroys
a pane showing the file you asked for, and back-links — which point leftward —
behave the same as forward ones. The cost is that the row stops reading as a
strict left-to-right trail once you revisit; that is preferred over a rule where
one click can silently close panes to the right and yank a pane out of a position
being used as an anchor.

Stacked mode keeps today's behavior exactly, except that the uniqueness invariant
now applies to it too.

### Focus, not scroll, decides the focused pane

The focused pane changes when you click into a pane, click its tab, or use
⌘1–9 / ⌃Tab. Horizontal scrolling never changes it.

Scroll-driven focus would mean scrolling to peek at a neighbour silently
retargets ⌘W, ⌘F, and back/forward. Peeking must not repoint destructive actions.

### Link navigation carries its source pane

`navigateToFile(path)` currently acts on whatever tab is active **when the await
resolves**. Sliding panes need the source pane's identity to place the new pane,
so a `fromTabId` is threaded from the pane down to the CodeMirror instance.

This also fixes a latent bug in stacked mode: switch tabs during an async
link-follow today and the wrong tab navigates.

### The footer lives inside the pane

`DocumentFooter` moves from "rendered once for the focused tab by `EditorArea`"
to inside the pane wrapper, in **both** modes. In stacked mode the pane is
`absolute inset-0`, so an absolutely-positioned footer lands exactly where it
does today. One render path, and the per-pane word counts the columns design
needs come out for free.

## Settings

Both keys live in `apps/desktop/shared/settings.schema.json`, the single source
of truth read by Rust (`include_str!` in `config.rs`) and by the frontend
(`lib/settings-schema.ts`). Per `docs/consolidation.md`, defaults are declared
nowhere else.

| Key                      | Type                     | Default   | Meaning                                                           |
| ------------------------ | ------------------------ | --------- | ----------------------------------------------------------------- |
| `appearance.layout-mode` | enum `columns` \| `tabs` | `columns` | Render open tabs as a scrollable row of columns, or one at a time |
| `appearance.pane-width`  | number                   | `720`     | _Minimum_ width of a column in px (see below)                     |

Read them through `hooks/use-pane-layout.ts` — `useLayoutMode()` /
`usePaneWidth()` for components, `getLayoutMode()` for store actions that decide
placement at action time.

Known wart: `appearance.pane-width` renders in Preferences even in stacked mode,
where it does nothing. The settings panel has no conditional-visibility
mechanism and existing keys already behave this way (sidebar keys show in
compact-file mode). Adding conditional visibility is out of scope here.

## Layout and chrome

- **Pane row** — `overflow-x: auto`, no scroll snapping (explicitly normal
  scrolling), scrollbar hidden, `overscroll-behavior-x: contain`.
- **Pane** — full height, its own `EditorScrollContainer` owning vertical
  scroll, and a 1px `var(--line-subtle)` divider from its left neighbour.

  Width is `min(100%, max(<pane-width>px, calc(100% / <pane count>)))`. Panes
  are always **equal width and together fill the row when they can**:
  `appearance.pane-width` is a floor, not a fixed size, so one open pane fills
  the window and panes only stop shrinking — and the row only starts
  scrolling — once an even split would take them below that floor. Percentages
  resolve against the row's visible width, so no measurement or
  `ResizeObserver` is involved. The outer `min(100%, …)` covers the sole case
  where a pane may be narrower than the floor: a window narrower than one pane.

  The alternative — a fixed width that never grows — leaves a dead gutter beside
  a lone pane, which is the most common state.

- **Sidebar and tab strip** — unchanged. The tab strip stays a 1:1 mirror of the
  pane row; clicking a tab focuses its pane and scrolls it into view.
- **Focused-pane scroll-into-view** — the horizontal analogue of
  `useScrollActiveTabIntoView`, using `inline: "nearest"` so it no-ops when the
  pane is already fully visible. Smooth scrolling, behind a constant.
- **Compact-file mode** — the standalone single-file window
  (`CompactFileLayout`) always renders stacked, regardless of the setting.
- **Search overlay** — `EditorSearchOverlay` stays a single floating panel;
  `EditorSearchOverview` (the scrollbar match rail) renders for the pane that
  owns the search view rather than simply the focused one.

## CSS notes

`prosemark-theme.css` derives `--kami-text-col-inset` from
`(100% - var(--kami-editor-outer-width)) / 2`. Inside a column, `100%` resolves to
the pane width, so the text column centres per pane with no change needed.

## Out of scope

- Virtualized/windowed pane mounting.
- Pane reordering by drag.
- Collapsing scrolled-past panes into a spine (the Andy Matuschak stacking
  affordance). Panes simply scroll off.
- Conditional visibility of settings by layout mode.
- Resizing individual panes.

## Task breakdown

Tracked in [TODOS.md](../TODOS.md) as `Horizontal pane layout` items 1–9. Each is
one commit and leaves the app working.

1. Spec + settings contract
2. Thread `tabId` through the pane tree
3. Extract `StackedPanes`
4. `ColumnPanes` renderer
5. Focus-driven focused pane
6. Scroll focused pane into view
7. Sliding-panes open policy + uniqueness invariant
8. Chrome reconciliation
9. Polish + docs

## Verification

- `vp check`, `vp test` for the frontend; `cargo test`, `cargo clippy`,
  `cargo fmt --check` from `src-tauri/`.
- Store placement rules get unit tests (`tests/stores.test.ts`): uniqueness,
  truncate-and-insert, focus-existing, and no-truncation for "open in new tab".
- Runtime GUI behavior via the `apps/desktop:verify` skill (WebDriver harness).

`specs/pane-frame.spec.js` locks the structural contract the unit suite cannot
reach (`vite.config.ts` sets `environment: "node"`, so there is no DOM test
environment): `data-pane` and the `invisible` class stay on the same element,
and the footer sits inside the pane flush with its bottom edge.

### Harness gotchas

- The skill's `cargo tauri build …` does not work here — `cargo-tauri` is not
  installed. Use the npm CLI: `apps/desktop/node_modules/.bin/tauri build …`
  with the same flags.
- **Document height is not comparable across a cold and a warm start.**
  CodeMirror estimates heights for lines the viewport never measured, so a cold
  launch (no `sessions.json`, ~45 lines rendered) reports a taller `.cm-editor`
  than a warm restore (~15 lines) — 2126.55px vs 2106.55px on the same build.
  Wipe or preserve `~/Library/Application Support/com.kami.e2e/sessions.json`
  consistently before comparing geometry between two builds, or the confound
  reads as a layout regression.
- `specs/latex-math.spec.js` fails all 4 of its cases against the repo-root
  workspace, on this commit and on its parent alike — pre-existing, unrelated
  to pane work. Tracked in [TODOS.md](../TODOS.md) backlog.
