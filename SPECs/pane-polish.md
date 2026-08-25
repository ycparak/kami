# Pane & Column Polish

Status: done
Owner: Yusuf

Five interface fixes to the pane/column system built in
[horizontal-pane-layout.md](./horizontal-pane-layout.md): a chrome glitch, a
settings-UI mismatch, a width contract to verify, a content-inset floor, and a
cross-mode inconsistency in how links and the command palette open new panes.
Each is independent and should land as its own commit per
[docs/workflows/agent-loop.md](../docs/workflows/agent-loop.md).

## 1. Pane divider must not cross the tab strip

**Problem.** The 1px divider between columns is visible cutting through the
tab strip (see the reported screenshot). Root cause: `EditorTabs` is
absolutely positioned (`app-layout.tsx`, `top: 0`, `z-40`) _over_ the pane
row, which starts at the same `y: 0` and renders a full-height
`border-l border-[var(--line-subtle)]` per pane
(`column-panes.tsx`'s `PANE` constant). The tab strip has transparent gaps
(between pills, around the drag region), so the divider shows through them.

**Fix.** The divider should start below the tab strip and fade in, mirroring
how pane _content_ fades at the top (`EditorScrollContainer`'s
`ProgressiveBlur` + mask, and the tab strip's own horizontal `ScrollFade`).

- Tab strip height is `calc(var(--chrome-control-height) + var(--chrome-control-padding) * 2)`
  — already computed identically in `editor-tabs.tsx:159`. Reuse that
  expression (or a shared constant) as the divider's `top` offset.
- Replace the `border-l` utility with a positioned 1px element (or a
  `background-image` gradient) so a `mask-image` can be applied — CSS borders
  can't fade. A short fade-in (24–40px, matching `ScrollFade`'s default
  `fadeSize` of 24px) is enough; it doesn't need to match the 120px
  `FADE_DISTANCE` used for scrolled content, since the divider's fade is
  anchored to a fixed position, not to scroll offset.
- Scope: `stacked-panes.tsx` shows one pane at a time and has no dividers —
  this only touches `column-panes.tsx` (and `pane-frame.tsx` if the divider
  moves into the shared frame).

**Files:** `apps/desktop/src/components/editor-area/column-panes.tsx`,
`apps/desktop/src/components/editor-area/pane-frame.tsx`.

## 2. Layout-mode dropdown → "Column Layout" switch

**Problem.** `appearance.layout-mode` is an `enum` (`columns` \| `tabs`),
rendered as a `<select>` via `SelectControl`. The settings schema already has
a native `boolean` control (`BooleanControl` in `setting-control.tsx`, used
elsewhere) that renders as a switch — no new widget is needed.

**Fix.** Add a new boolean key and retire the enum one:

| Key                        | Type      | Default | Label           |
| -------------------------- | --------- | ------- | --------------- |
| `appearance.column-layout` | `boolean` | `true`  | `Column Layout` |

**Why a new key instead of retyping `appearance.layout-mode` in place:** a
persisted string value (`"columns"` or `"tabs"`) is truthy either way in JS,
so flipping the schema `type` on the same key would make an existing `"tabs"`
value silently evaluate as "on." A fresh key avoids that trap. The one-time
cost — a user who had explicitly chosen `tabs` sees `appearance.column-layout`
default back to `true` (columns) once, since the old key is no longer read —
is acceptable for a local single-user settings file; this is not a system that
needs a migration layer (per `docs/consolidation.md`, no dual-read shims).

`hooks/use-pane-layout.ts`'s `readLayoutMode` / `useLayoutMode` /
`getLayoutMode()` should read the new boolean key and keep mapping to the
internal `LayoutMode = "columns" | "tabs"` union, so `editor-store.ts`,
`column-panes.tsx`, `stacked-panes.tsx`, etc. need no changes beyond the read.

**Files:** `apps/desktop/shared/settings.schema.json`,
`apps/desktop/src/hooks/use-pane-layout.ts`.

## 3. Pane width: fixed at the setting, expand only to fill

**Requested rule.** A column's width is fixed at `appearance.pane-width` and
does not change as the window resizes — _except_ when the combined fixed
width of every open pane is less than the row's width, in which case panes
grow evenly to fill it (no dead gutter).

**Before writing any code:** `column-panes.tsx`'s existing `paneWidthStyle`
already appears to implement exactly this rule:

```
min(100%, max(<pane-width>px, calc(100% / <pane count>)))
```

Walk it through: let `W` = the setting, `n` = pane count, `row` = the row's
visible width (≈ window width). `calc(100% / n)` is `row / n`.

- If `row > W * n` (window bigger than the panes' combined fixed width): then
  `row / n > W`, so `max()` picks `row / n` — panes expand evenly to exactly
  fill `row`. This is the requested exception.
- If `row <= W * n`: then `row / n <= W`, so `max()` picks `W` — panes sit at
  the fixed setting value and the row scrolls. This holds for _every_ `row`
  width in that range, so panes do not resize as the window resizes within
  it.

These two branches are the requested rule verbatim, for any `n` and any
window width — there is no window size at which the formula's choice differs
from the rule above.

**Task:** verify this empirically before changing anything — open 1, 2, and 3
panes and resize the window across the `row = W * n` boundary using the
`apps/desktop:verify` skill or a manual run, and confirm the observed sizing
matches the rule. If it does, this task is a regression spec only (lock the
current formula in with an e2e test — none currently covers a live resize,
per `docs/pane-layout.md`'s "E2E gotchas"). If a real discrepancy turns up,
log the exact failing case (pane count, window width, expected vs. actual
width) before touching `paneWidthStyle`, per this repo's rule on iterating
from evidence, not guesses.

Note: the settings label "Minimum Pane Width" already correctly describes
`appearance.pane-width` as a floor, which matches this rule — no relabeling
needed here (separate from item 2's relabel of the layout-mode key).

**Files:** `apps/desktop/src/components/editor-area/column-panes.tsx` (only
if a real discrepancy is found), a new `specs/pane-width-resize.spec.js`.

## 4. 40px minimum gap between pane edge and content

**Problem.** Content sits too close to a pane's edge, including the hanging
heading-hash markers (`#`, `##`, …) that appear while the caret is on a
heading line (see the reported screenshot).

**Root cause.** `--kami-editor-side-padding: clamp(1.5rem, 4vw, 4rem)`
(`App.css`) floors at `1.5rem` = 24px, below the requested 40px. This one
variable already drives every relevant inset:

- `.cm-content`'s own padding (`prosemark-theme.css`).
- The frontmatter panel's padding (`editor-pane.tsx`).
- `--kami-text-col-inset`, the scroller's `clip-path` inset
  (`prosemark-theme.css`).
- The heading-hash markers (`.cm-heading-hash`, `prosemark-theme.css`
  ~L253–261): they hang left of the text column via `right: 100%`, inside
  this same side-padding gutter.

**Fix — revised after live measurement.** Raising the floor to exactly 40px
(`2.5rem`) is not enough on its own: the hash mark is laid out (`opacity: 0`
when inactive, never `display: none` — see the comment above
`.cm-heading-hash` on why) and its own rendered width eats into the gutter.
Measured live at a 40px floor with two panes at the `pane-width` floor: an
H1's `"# "` hash cleared the pane edge by only ~20px, and H2's `"## "` (wider,
more characters at the same font size) by even less. The floor needs to be
`40px + the hash's own width`, and hash width scales with heading depth.

Landed on `clamp(1.5rem, 4vw, 4rem)` → `clamp(5.5rem, 4vw, 6.5rem)` (88px
floor, 104px ceiling), verified live to clear 40px for both H1 (~60px
clearance) and H2 (~48px). Deeper headings (H3+) were not verified — nesting
that deep is uncommon and wasn't the reported case — and may have a reduced
margin in the narrowest pane state. If that turns out to matter in practice,
the real fix is decoupling the hash's gutter from `--kami-editor-side-padding`
(which also drives body-text margins, so it can't grow without bound just to
fit deep headings) rather than raising the shared variable further.

**Files:** `apps/desktop/src/App.css`.

**Verification:** live e2e measurement (not committed) with two panes at the
720px floor — `pane-polish.md`'s H1 and H2 headings both clear 40px from the
pane's left edge with comfortable margin; `column-panes.spec.js` re-run clean
afterward (this change doesn't touch pane width, only inner content inset).

## 5. Standardise cmd/ctrl+click and cmd/ctrl+Enter on "open in new pane"

**Root cause.** Reading `resolveOpenPlacement` in `editor-store.ts` shows the
"what does a modifier do" question is currently answered per **layout mode**,
not per **surface** — which is why it feels inconsistent:

- **Stacked mode already matches what's being asked for:** `"navigate"` (a
  plain link click) and `"open"` (sidebar/palette/recents, unmodified) both
  reuse the focused tab in place; only the explicit `"new-pane"` intent
  (cmd/ctrl) inserts a new tab.
- **Columns mode does not.** `"navigate"` _always_ inserts a new pane to the
  right of the source and truncates everything past it — regardless of
  whether cmd/ctrl was held — and `"open"` _always_ appends a new pane at the
  end. The modifier is only consulted for the already-explicit `"new-pane"`
  intent, which both of the unmodified intents already behave as if implied.

So: in columns mode a plain link click already opens a new pane, making
cmd+click look like a no-op; in stacked mode nothing opens a new pane without
the modifier, making cmd+click look load-bearing. Both are true — the two
modes just disagree.

**Decision — revised while implementing.** The layout-mode branch is retired
for `"navigate"` and `"new-pane"` only, not for `"open"`:

- `"navigate"` (a link click, or the command palette's default selection) →
  navigate the source pane in place, unless `"new-pane"` was requested
  instead (cmd/ctrl), which inserts a new pane immediately after the source
  (or at the end, if there's no source pane) — never truncating. Same rule,
  both layout modes.
- `"open"` (sidebar, recents) still branches on layout mode exactly as
  before: stacked mode reuses the focused file tab, columns mode appends.
  Unifying this too was the original plan, but `"open"` has no originating
  pane and, for the sidebar specifically, no modifier available to request a
  new one — see the non-goal below. Making it always navigate in place would
  have silently removed the sidebar's only way to open a second pane in
  columns mode. The command palette sidesteps this by sending `"navigate"`
  intent for its own default selection instead of `"open"` (see below) — it
  has a modifier available, so it can participate in the unified rule.
- Existing tie-breakers are unchanged: an already-open path always wins and
  is focused, never duplicated; a launcher pane is replaced rather than
  stranded.

**Consequence — this supersedes part of the prior design.** Columns mode's
"sliding panes" truncate-on-navigate behavior (the `closeFrom` row in
`SPECs/horizontal-pane-layout.md`'s placement table) is retired by this
change: a plain link click no longer discards panes to the right of where it
was clicked, in favor of familiar browser-tab semantics (click = in place,
cmd+click = new tab). Do not rewrite `horizontal-pane-layout.md`'s design
record — it's a historical record of what was decided and why, and the
rationale for the row-as-reading-trail model is still worth keeping visible.
Add a short note there pointing at this spec instead. **Do** update
`docs/pane-layout.md` — the doc that must always describe current behavior —
since its "One resolver decides where an opened file lands" section
describes the placement table this retires.

**Command palette needed one call swapped, not new plumbing.**
`handleSelect(path, newTab)` in `command-palette/index.tsx` already wired
cmd+Enter (the dialog's `onKeyDown`) and cmd+click (`onMouseDown` capturing
the modifier ahead of `onSelect`) through to `openFileInNewTab` — that
layer needed no changes. Its _unmodified_ branch called `openFile(path)`
(`"open"` intent), which — per the revised decision above — still branches
on layout mode. Swapped it to `navigateToFile(path)` (`"navigate"` intent,
a new `useNavigateToFile` hook) instead, so palette selection participates
in the unified rule the same way a link click does.

**Explicit non-goal.** The sidebar file tree's cmd/ctrl+click is already
bound to multi-select (`file-tree.tsx`'s `onRowPointerDown` / `onRowClick`,
used for bulk drag/rename/delete). Do not repurpose it for "open in new
tab" — that would silently break an existing, unrelated feature. This task
covers link clicks (the wiki-link extension) and the command palette only,
matching what was actually requested; the sidebar stays single-click-open.

**Files:** `apps/desktop/src/stores/editor-store.ts` (`resolveOpenPlacement`),
`apps/desktop/src/hooks/use-tabs.ts` (new `useNavigateToFile`),
`apps/desktop/src/components/command-palette/index.tsx`,
`docs/pane-layout.md`, `SPECs/horizontal-pane-layout.md` (pointer note only),
`tests/stores.test.ts` (placement-table unit cases updated for the new rule).
`e2e/specs/pane-placement.spec.js` needed no changes beyond item 2's key
rename — it only exercises sidebar (`"open"` intent) placement, which is
unchanged.

## Out of scope

- Any change to the sidebar file tree's click/multi-select behavior (see
  item 5).
- Resizing individual panes, pane reordering, or virtualized mounting — still
  out of scope per `horizontal-pane-layout.md`.
- Per-pane customization of `appearance.pane-width` or
  `appearance.editor-width` — both remain global settings.

## Task breakdown

Tracked in [TODOS.md](../TODOS.md) as `Pane polish` items 1–5. Each is one
commit and leaves the app working.

1. Divider fades under the tab strip
2. `appearance.column-layout` boolean switch
3. Verify (and if needed, fix) the fixed/expand pane-width contract
4. 40px minimum content gap
5. Standardise open-in-new-pane across link clicks and the command palette

## Verification

- `vp check`, `vp test` for the frontend.
- `cargo test`, `cargo clippy`, `cargo fmt --check` from `src-tauri/` — only
  item 2 touches anything Rust-adjacent (the schema file Rust reads via
  `include_str!`), and only as a value change, not a shape change.
- Runtime GUI behavior via the `apps/desktop:verify` skill, especially for
  items 1, 3, and 4, which are visual/geometric.
- Store placement rules (item 5) get unit tests in `tests/stores.test.ts`,
  mirroring the existing placement-table coverage.
