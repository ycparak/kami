# Tasks

## In Progress

-

## Up Next

- **`window-inactive` e2e is focus-race sensitive.** Passes in isolation; can still fail
  inside a full suite run on `icon and label must match` / `colour returns on refocus`.
  It drives real macOS activation with `osascript`, and `activateAndWait` now blocks on
  both `document.hasFocus()` and `data-window-inactive` instead of a fixed pause — but
  nothing in the test can stop another process taking focus between that wait and the
  colour sample. Needs either a way to assert the attribute without real activation, or
  acceptance that it is only meaningful on an idle machine.

- **`latex-math` e2e: clicking a math widget does not unfold it.** Left failing on
  purpose rather than contorted into passing. `selectAllDecorationsOnSelectExtension`
  ("cm-math-widget") is wired and `eventHandlersWithClass` matches via `composedPath`, so
  the mousedown handler does fire; its guard only acts on a collapsed caret
  (`fold/core.ts:112`). In columns mode the seeded document is not the first pane, so its
  pane starts unfocused and `unfurlSuppressFacet` renders it folded. Focusing the pane
  first, clicking twice, and polling for up to 5s all failed to unfold it reliably — one
  instrumented run passed, later identical runs did not. Needs a decision on the intended
  UX (should one click on an unfocused pane's widget both focus and unfold?) before either
  the spec or `math-decorations.ts` is changed.

## Done

- **README images on GitHub.** The app icon and screenshot now use GitHub's
  current `/refs/heads/master/` raw-content URLs instead of the legacy
  `/raw/master/` route, which was returning broken images for the README.

- **Daily wallpaper cycling + `--wallpaper` dev flag.** The empty-state
  wallpaper (`wallpapers.ts`) no longer re-rolls at random on every mount —
  `dailyWallpaper()` indexes into the registry by local calendar day, so it
  only changes once a day, cycling through all nine in order. Added
  `vp run desktop#dev --wallpaper <id>` to force a specific one during
  development, following the same argv-passthrough pattern as the existing
  `--w`/`--h` window-size flags: `dev_arg()` (extracted from
  `dev_window_size_override` in `lib.rs`) reads it from process args
  (debug-only), it rides on `StartupState.dev_wallpaper` to the frontend, and
  `resolveStartup` applies it via `setDevWallpaperOverride()` before the
  window is shown. Verified live: `empty-state.spec.js`'s wallpaper assertion
  still passes against the new picker (build + e2e run), and `cargo
build`/`cargo clippy`/`vp check` are all clean.
  Spec: [SPECs/empty-state-wallpaper.md](./SPECs/empty-state-wallpaper.md)

- **E2E suite: made runnable again and de-flaked.** The bundled `Kami.app` was the 0.1.0
  release build with no embedded WebDriver server, so all 14 specs died at
  `POST /session` before running an assertion; rebuilt with `--features e2e`. Then fixed
  four real failures: cross-run state pollution (`empty-state` and `window-inactive` seed
  an empty `sessions.json`, and `window-inactive` collapses the sidebar — neither restored
  it, breaking whichever spec ran first next time), `column-panes` bootstrapping panes with
  `Cmd-T` from an empty session where it is inert, `pane-scroll` picking a collapsed pane
  as "already visible" when `useScrollFocusedPaneIntoView` still scrolls those back to
  their natural position, and `window-inactive` racing Tauri's focus event with a fixed
  pause. Extracted `helpers/workspace.js` so the setup steps have one owner.

- **Command palette keyboard navigation.** Arrow keys sometimes failed to move
  the highlight, and the list scrolled erratically. Root cause: WebKit fires a
  synthetic `mousemove` at the last cursor position after a scroll, and cmdk
  selects on `onPointerMove` — so every keyboard-driven scroll handed the
  selection to whatever row the resting pointer covered. Reproduced against
  real cmdk in a browser harness (five clean steps, then a snap back to the
  hovered row — matching the recording frame for frame) and re-run to confirm
  the fix. Suppressed with a capture-phase `pointermove` filter on
  `[cmdk-list]` that only lets an event through once the cursor coordinates
  actually change. Also: selection now resets on open and re-anchors when its
  item leaves the list, `useFuzzySearch` cancels in-flight requests so stale
  results cannot overwrite newer ones, and the path highlighter emits one span
  per run instead of one per character.

- **Command palette keyboard navigation.** Arrow keys stalled and the list
  scroll jumped: `cmdk` selects on hover, and WKWebView answers a scroll with a
  synthetic `mousemove` at the unchanged cursor position, so every press that
  scrolled the list had its selection stolen by whatever item slid under a
  stationary pointer. Fixed with a capture-phase `pointermove` filter on
  `CommandList` that drops moves which did not move, plus a single effect that
  anchors the selection to a value that is actually in the list — which also
  fixes the palette reopening on the previously selected item. `useFuzzySearch`
  now cancels in-flight requests, and `HighlightedPath` emits one span per run
  instead of per character. Verified against the real app: the new spec fails on
  the pre-fix build with "the post-scroll mouse move stole the selection at step
  5" and passes after.
  Spec: [SPECs/command-palette-keyboard-navigation.md](./SPECs/command-palette-keyboard-navigation.md)

- **Comment strip and dead-code purge.** Removed every explanatory comment
  from TS/TSX/JS, Rust, CSS, and shell sources (2,676 in total), preserving
  functional directives — `eslint-disable` pragmas, `@ts-expect-error`,
  `/// <reference>`, and `/*! */` CSS markers. Stripping was done with the
  TypeScript scanner and hand-written Rust/CSS tokenizers rather than regex,
  so comment-like text inside strings, template literals, regex literals, raw
  strings, and JSX text survived intact. Then purged unused code: the orphan
  `use-popover-dismiss.ts`, eight dead exports, the unused `lightTheme` (the
  editor themes through CSS variables via `prosemarkBaseThemeSetup`, so the
  CodeMirror light theme had no consumer), and the `restore_workspace` Tauri
  command — dead on both sides, since its only JS caller was itself unused.
  `cli_status` / `install_cli` / `uninstall_cli` stay registered: they look
  uninvoked from JS but the native menu handlers in `lib.rs` call them.

- **Empty-state wallpaper.** An empty workspace now shows a full-bleed random
  wallpaper behind a per-image scrim: tab strip hidden, actions moved to the
  top-right, sidebar toggle switched to its light variant while the sidebar is
  hidden, and a fade+blur entrance measured frame-by-frame off the reference
  recording (1970ms, `cubic-bezier(0.228, 0.153, 0.227, 1)`, blur 36px→0, no
  scale, 985ms after halving). ⌘T is inert here. The actions live in
  `AppLayout`, not the pane — the pane is a `z-10` stacking context sealed
  under the window's `z-30` drag region, so buttons there render but cannot be
  clicked. Opacity and blur ride separate layers so the blurred image can
  overhang its clipping frame, which is what keeps its soft edge from showing
  as a pale fringe. Chrome greys out with the traffic lights when the window
  is inactive, driven by an attribute from Tauri's focus event — WebKit's
  `:window-inactive` is unusable in WKWebView, where it matches even when the
  window is active. Covered by `specs/empty-state.spec.js` and
  `specs/window-inactive.spec.js`.
  Spec: [SPECs/empty-state-wallpaper.md](./SPECs/empty-state-wallpaper.md)

- **Horizontal pane layout 1 — spec + settings contract.** Wrote the spec; added
  `appearance.layout-mode` and `appearance.pane-width` to the settings schema;
  added `hooks/use-pane-layout.ts` accessors. No visible layout change yet.
  Spec: [SPECs/horizontal-pane-layout.md](./SPECs/horizontal-pane-layout.md)
- **Horizontal pane layout 2 — thread `tabId` through the pane tree.** View
  registry → `EditorPane` → `ProseMarkEditor` → link handlers;
  `navigateToFile(path, { fromTabId })` falling back to the focused tab. Fixes
  the latent stacked-mode race where an async link-follow navigated whichever
  tab became active mid-await. No visible change.
- **Horizontal pane layout 3 — extract `StackedPanes`.** Split `EditorArea`'s
  tab map into `StackedPanes` + a shared `PaneFrame`; moved pane positioning
  from the bodies to the renderer and `DocumentFooter` inside the pane; added
  the `setActiveTab` bail-out per [docs/zustand.md](./docs/zustand.md). No
  visible change — verified by an A/B geometry capture against the parent
  commit (zero difference) plus `specs/pane-frame.spec.js`.
- **Horizontal pane layout 4 — `ColumnPanes` renderer.** Horizontal scroll row,
  per-pane width from `appearance.pane-width`, dividers, per-pane footers,
  `EditorArea` switching on layout mode with compact-file windows pinned to
  stacked. Covered by `specs/column-panes.spec.js`.
- **Horizontal pane layout 5 — focus-driven focused pane.** Interacting with a
  pane focuses it; becoming focused moves DOM focus into that pane's editor,
  replacing `focusOnRevealExtension`'s `.invisible` MutationObserver (which
  cannot fire when panes are never hidden). Adds `unfurlSuppressFacet` so
  unfocused panes render folded instead of every visible pane unfurling its
  markdown at once. Covered by `specs/pane-focus.spec.js`.
- **Horizontal pane layout 6 — scroll focused pane into view.** Horizontal
  counterpart of `useScrollActiveTabIntoView`: nearest-edge semantics, skipped
  when the pane is already visible, instant on session restore and animated
  after. Covered by `specs/pane-scroll.spec.js`.
- **Horizontal pane layout 7 — sliding-panes open policy + uniqueness.** One
  `resolveOpenPlacement` resolver behind a single `openPath` write path; global
  one-file-one-pane; `restoreSession` dedup; `openFiles` pruned on truncation.
  Compact windows carry `isSingleDocumentWindow` so they navigate in place
  whatever the layout setting says. Unit tests per placement-table row, plus
  `specs/pane-placement.spec.js`.
- **Horizontal pane layout 8 — chrome reconciliation.** Search panel anchors to
  the pane it searches instead of the editor area's corner; unfurl suppression
  keys on the focused _pane_ rather than `view.hasFocus`, so opening ⌘F no
  longer re-folds the document being searched. Launcher and settings panes
  verified as ordinary columns. Covered by `specs/pane-chrome.spec.js`.
- **Horizontal pane layout 9 — polish + docs.** Verified the narrow-window
  clamp, added [docs/pane-layout.md](./docs/pane-layout.md) and its index entry,
  noted the columns behaviour in
  [docs/keyboard-shortcuts.md](./docs/keyboard-shortcuts.md), and wrote the
  CHANGELOG entry. Spec closed.
- **Fixed: creating a file and writing it in the same breath hid it from the
  sidebar.** The watcher's per-path event loop gated its entire pipeline —
  index bookkeeping and the sidebar directory-refresh emit, not just the
  content-reload notification — behind `is_self_write`. FSEvents coalesces a
  Create and a Modify for one path into the same 300ms debounce batch, so a
  `create_file` immediately followed by an autosave `write_file` (the app's
  actual new-note flow) let the write's self-write record swallow the
  genuine Create event too, and the new file never entered the index.
  Self-write suppression now only gates the content-reload notification;
  membership-change bookkeeping and the parent-directory refresh run
  unconditionally off live disk state. `latex-math.spec.js`'s seeding
  workaround (wait for the sidebar row between `create_file` and
  `write_file`) is no longer needed and was removed. New regression:
  `e2e/specs/file-watcher-race.spec.js` — confirmed it fails against the old
  code and passes against the fix.
- **Pane polish 1 — divider fades under the tab strip.** The column divider
  moved off `border-l` onto a masked absolutely-positioned rule in
  `PaneFrame`, offset below the tab-strip height
  (`calc(var(--chrome-control-height) + var(--chrome-control-padding) * 2)`)
  and fading in over 32px — `ColumnPanes` passes `showDivider` per pane index,
  `StackedPanes` never renders one. `column-panes.spec.js`'s divider
  assertion now checks for `[data-pane-divider]` instead of
  `border-left-width`. Spec: [SPECs/pane-polish.md](./SPECs/pane-polish.md)
- **Pane polish 2 — `appearance.column-layout` boolean switch.** Retired the
  `appearance.layout-mode` enum in favor of a new boolean key (a persisted
  `"tabs"`/`"columns"` string would have been truthy either way, so the type
  couldn't safely flip in place); `hooks/use-pane-layout.ts` maps the boolean
  to the existing internal `LayoutMode` union so nothing downstream changed.
  Updated the e2e specs and unit tests that pinned the old key.
  Spec: [SPECs/pane-polish.md](./SPECs/pane-polish.md)
- **Pane polish 3 — verified the fixed/expand pane-width contract; no code
  change.** Proved algebraically that `column-panes.tsx`'s existing
  `min(100%, max(floor, 100%/count))` is exactly the requested rule for every
  window width and pane count, then confirmed it live: built the e2e app and
  ran `specs/column-panes.spec.js`, whose floor/expand/clamp cases already
  exercise the formula against real computed geometry at `appearance.pane-width`
  values of 720, 100, 420, and 4000 — all passed. Also visually confirmed
  item 1's divider fade with a one-off screenshot (not committed).
  Spec: [SPECs/pane-polish.md](./SPECs/pane-polish.md)
- **Pane polish 4 — 40px minimum content gap.** The simple version of this
  (raise `--kami-editor-side-padding`'s floor to 40px) wasn't enough: measured
  live, the hanging heading-hash mark (`.cm-heading-hash`, laid out even while
  hidden) itself eats into that gutter — at a 40px floor an H1's "# " hash
  cleared the pane edge by only ~20px, and H2's "## " by less. Raised the
  floor to `5.5rem` (88px; ceiling `6.5rem`) instead, verified live against
  both H1 and H2 (48px+ clearance each) via a one-off e2e measurement (not
  committed) — H3+ headings in the narrowest pane state weren't checked
  (not the reported case, and markdown rarely nests that deep) and may have a
  reduced margin. Spec: [SPECs/pane-polish.md](./SPECs/pane-polish.md)
- **Pane polish 5 — standardise open-in-new-pane.** `resolveOpenPlacement`'s
  `"navigate"` and `"new-pane"` intents no longer branch on layout mode —
  unmodified navigates the source pane in place, cmd/ctrl inserts a new pane,
  the same in both. `"open"` (sidebar/recents) still branches, since it has
  no originating pane and the sidebar's cmd/ctrl+click is already multi-select.
  Command palette's default selection now sends `"navigate"` intent (a new
  `useNavigateToFile` hook) instead of `"open"`, so it participates in the
  unified rule; its existing cmd+click/cmd+Enter UI plumbing needed no
  changes. Retires columns mode's truncate-on-navigate ("sliding panes")
  behavior — noted as superseded in `SPECs/horizontal-pane-layout.md` rather
  than rewritten, with the current rule in `docs/pane-layout.md`. Verified
  live via the e2e harness: plain link click, cmd+click, palette Enter, and
  palette cmd+Enter all landed correctly. Spec closed — all five items done:
  [SPECs/pane-polish.md](./SPECs/pane-polish.md)
- **Column stacking + resizable panes.** Panes scrolled past now collapse
  into a left-edge sliver instead of scrolling off-canvas, in the spirit of
  Andy Matuschak's notes. Pure CSS (`position: sticky` + increasing
  `z-index` per pane) drives the visual; `use-pane-stacking.ts` only tracks
  which panes are currently covered (`data-collapsed`, an imperative DOM
  write, not React state) and which pane is doing the covering
  (`data-overlapping`, for a drop-shadow depth cue — since removed, see the
  last Done entry). Dividers are now
  draggable too — resizes the pane to its left (Finder's column view, not a
  redistributing split), hover brightens the divider and shows a resize
  cursor, double-click resets to auto-width. Width overrides live in a new
  in-memory-only store (`stores/pane-width-store.ts`) — not persisted, a
  reading-session action rather than a file property.

  Two bugs found only by testing live in the actual WKWebView runtime, not
  guessable from reading the code:
  - WebKit's `offsetLeft` on a `position: sticky` element returns its
    _current stuck_ position, not the CSSOM-spec static one Chromium/Firefox
    give — so "scroll a collapsed pane back to `offsetLeft`" was scrolling
    to roughly where the row already was. Fixed by having
    `use-pane-stacking.ts` compute each pane's natural offset itself, from a
    running sum of preceding panes' `getBoundingClientRect().width` (sticky
    doesn't change size, only position) — no `offsetLeft` involved.
  - Collapsed panes' content bled through each other: z-index only orders
    _painted_ pixels, and a pane with no background is mostly empty space
    around its centered text, so an earlier "covered" pane's text showed
    straight through a later one.

  Follow-up feedback (same task) changed two more things, both confirmed
  live: the covering pane's background moved from the translucent `--bg`
  (the first fix above — stopped literal double-exposure but still bled
  through faintly) to fully-opaque `--surface-primary`; and the collapsed
  pane's vertical-text title label (`PaneSpine`, shown while covered) was
  removed entirely — it read as a column of sideways tabs rather than a
  stack of cards — leaving the drop shadow alone as the "this is a stack"
  cue. `pane-spine.tsx` / `pane-spine.css` deleted; click-to-expand kept
  working with no changes, since `PaneFrame`'s existing `onPointerDown`
  already covered the whole pane including its sliver.

  A third round of feedback, watching the shadow run against real content,
  changed three more things (`SPECs/pane-stacking-and-resize.md`'s "Second
  follow-up" and "Third follow-up" sections have the full account):
  - The shadow now shows the instant any overlap begins, not just once a
    pane is fully covered — the old trigger was keyed on full collapse.
  - Panes can now fully stack with zero gap. The sticky offset changed from
    `index * SPINE_WIDTH` (a permanent per-pane floor that made true full
    coverage structurally impossible) to a flat `left: 0` for every pane;
    `SPINE_WIDTH` itself is gone. `use-pane-stacking.ts`'s two attributes
    split cleanly along the transition: `data-collapsed` = fully flush
    (zero gap), `data-overlapping` = some overlap but not yet flush (the
    shadow window) — clearing the shadow again once nothing's left to cast
    it on.
  - The shadow wasn't actually visible at all, despite the trigger firing
    correctly — a pixel probe found zero darkening. Root cause, confirmed
    live: WebKit doesn't render `box-shadow` on an element that also has
    `mask-image`. Switched to `filter: drop-shadow()` (a filter effect
    rather than a box decoration) on the theory it would compose with
    masking correctly — confirmed live that WebKit breaks _that_
    combination too (an unmasked, intentionally loud red `drop-shadow()`
    rendered fine; adding the mask back made it vanish, no other change).
    Given neither primitive survives a mask on this runtime, the shipped
    version drops the smooth fade entirely: the shadow has a hard top edge,
    positioned to start exactly where the divider's own fade _finishes_, so
    the two never visually clash even though only one of them fades. A real
    fade (e.g. stacked opacity bands, each unmasked) is a known follow-up,
    not implemented.

  Verified live via the e2e harness at each step: collapse-on-scroll,
  click-to-expand, drag-to-resize, double-click-to-reset, opaque background,
  no spine elements, immediate shadow-on-overlap, true zero-gap collapse,
  shadow clearing once flush, and (via direct pixel sampling of screenshots,
  not just computed-style assertions) the shadow actually painting — plus
  screenshot passes throughout. Spec:
  [SPECs/pane-stacking-and-resize.md](./SPECs/pane-stacking-and-resize.md)

- **Remove the overlap shadow.** The depth cue on the pane sliding over the
  one behind it is gone, along with everything that decided when to show it:
  `pane-overlap-shadow.css` and the element `PaneFrame` rendered for it, the
  `data-overlapping` attribute, and the `overlapping[i]` half of
  `use-pane-stacking.ts`'s recompute (which no longer needs to track the
  previous pane's rect or collapse state at all). Stacking itself is
  unchanged — sticky `left: 0`, opaque `bg-surface-primary`,
  `data-collapsed`, `data-natural-left`, click-to-expand — so depth now
  reads from the divider and the opaque background alone. The WebKit
  `mask-image` findings are kept in the spec as history so a future attempt
  doesn't re-derive them. Spec:
  [SPECs/pane-stacking-and-resize.md](./SPECs/pane-stacking-and-resize.md)
- **88px gap below the tab strip, columns only.** Was 124px, measured live —
  12px scroll-container border + 144px (`md:pt-[9rem]`) + 24px `pb-6` put the
  first line at 180px against a strip ending at 56px. That padding is shared
  by all three renderers and `EditorPane` can't tell which one placed it (page-
  kind registry; compact windows pin `"tabs"` via a prop, not the setting), so
  the renderer decides instead: `--kami-editor-top-pad` defaults in `App.css`
  (`8rem`, `9rem` at `md` — the old responsive step, preserved) and
  `ColumnPanes` overrides it on the row. Consumed as an inline style so the
  override doesn't fight a `pt-*` utility for specificity. The constant
  discounts the two fixed blocks between the pane's top and the first line
  rather than hard-coding 88px, so a chrome-height change stays correct.
  Verified live: 88px per pane in columns, 124px still in stacked, both
  asserted across a layout toggle. Doc: [docs/pane-layout.md](./docs/pane-layout.md)

## Backlog

Previously-triaged work organized by phase. Pull into `Up Next` as capacity opens.

- **Math widgets do not unfold on click.** `latex-math.spec.js`'s last case
  fails: clicking an inline `.cm-math-widget` should range-select the node and
  drop the fold, exposing `$…$` source. It does not. Established while fixing
  the rest of that spec:
  - Not pane-layout fallout — reproduces identically with
    `appearance.layout-mode: tabs`.
  - Not a driver limitation — a hand-dispatched
    `pointerdown`/`mousedown`/`mouseup`/`click` with real coordinates does not
    unfold it either.
  - Not unfurl suppression — the pane reports `data-pane-focused="true"`
    throughout, so suppression is off.
    Next step is `selectAllDecorationsOnSelectExtension` in
    `prosemark-core/fold/core.ts`: check whether the collapsed-selection guard
    or `view.posAtDOM(target)` is the one bailing.
