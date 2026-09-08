# Empty-State Wallpaper

Status: done
Owner: Yusuf

When the workspace has nothing open, Kami shows a blank pane with two centred
text buttons under a normal tab strip. This spec replaces that with a
full-bleed wallpaper: chrome hidden, a random wallpaper behind a per-image
scrim, the two actions moved to the top-right, and a fade-and-blur entrance
matched to a reference recording.

## The empty state

"Empty" means **exactly one tab open and it is a launcher**, in a normal
workspace window. Not "the active tab is a launcher" — a launcher opened with
⌘T alongside real documents must keep its tab strip, or there is no way back
to the other tabs. Compact-file windows are excluded; they always hold a
document and run their own layout.

A launcher that is _not_ the whole workspace keeps today's plain centred
treatment. The wallpaper belongs to the empty workspace, not to the launcher
page kind.

## 1. Hide the chrome

Hide the whole tab strip in this state — tabs, the `+` button, and the back /
forward buttons. `EditorTabs` is mounted once, absolutely positioned over the
pane row in `app-layout.tsx`; hiding it there is a single conditional and
leaves the pane row untouched (the strip never occupied layout space).

The window drag region and the sidebar toggle stay — the window must still be
movable and the sidebar still reachable.

## 2. Daily wallpaper

Nine images live in `apps/desktop/public/wallpapers/` (`1.webp` … `9.webp`),
served from the Vite public root at `/wallpapers/<n>.webp`.

The wallpaper is chosen deterministically from the local calendar date —
`dailyWallpaper()` in `wallpapers.ts` indexes into the registry by the number
of days since the epoch (computed from local Y/M/D, so it advances at local
midnight regardless of timezone), cycling through all nine in order and
wrapping back to the first. It is **not** re-picked on every mount; it only
changes once a day. The launcher page kind is not `keepAlive`, so it unmounts
when it stops being active — mounting is exactly "the state became active",
which is also when the entrance animation should run. The entrance animation
therefore still keys off mount, with no effect or watcher; only the wallpaper
choice itself moved from per-mount randomness to per-day determinism.

For development, `vp run desktop#dev --wallpaper <id>` forces a specific
wallpaper regardless of date. The flag reaches the frontend the same way
`--w`/`--h` (window size) do: `tauri dev -- --` forwards it through to the
app binary's argv, `dev_arg("--wallpaper")` in `src-tauri/src/lib.rs` reads
it (compiled out via `#[cfg(debug_assertions)]` in release builds), it rides
along on `StartupState.dev_wallpaper` (`commands/startup.rs`) to
`getStartupState()`, and `resolveStartup` (`use-open-drop.ts`) calls
`setDevWallpaperOverride()` before the window is shown, so `dailyWallpaper()`
picks it up with no extra render.

Each wallpaper carries its own scrim, all of the form:

```
linear-gradient(180deg, rgba(0,0,0,T), rgba(0,0,0,0), rgba(0,0,0,0.35))
```

Only the top stop `T` varies, so the registry stores `T` and builds the
gradient from it — adding a wallpaper is one row, not one row plus a branch
(see [docs/consolidation.md](../docs/consolidation.md)).

| Wallpaper         | Top stop `T` |
| ----------------- | ------------ |
| `1.webp`          | 0.65         |
| `2, 6, 8, 9.webp` | 0.5          |
| `3, 5.webp`       | 0.4          |
| `4.webp`          | 0.6          |
| `7.webp`          | 0.2          |

There must be **no** top/bottom progressive blur in this state. `NewTabPage`
does not use `EditorScrollContainer` (which owns the two `ProgressiveBlur`
bars), so none is inherited today — the constraint is to not add one. The
scrim above is the only overlay.

## 3. Actions to the top-right

`Create new note ⌘N` and `Search ⌘O` move from the centre of the pane to the
top-right corner, on the same baseline as the sidebar toggle. Styling reads
off the reference frame:

- Label: `#FFF` at 80%, hover 100%.
- Shortcut chip: background `#FFF` at 15%, text `#FFF`, `backdrop-filter:
blur(4px)`.

## 4. Sidebar toggle over the wallpaper

When the empty state is active **and the sidebar is hidden**, the toggle sits
on the wallpaper and needs the light treatment, applied immediately with no
transition:

- Icon `#DCDCDC`, hover `#FFFFFF`.
- Hover background `#FFF` at 15% with `backdrop-filter: blur(4px)`.

With the sidebar open the toggle sits over the sidebar, not the wallpaper, and
keeps its normal theme styling. The variant is therefore driven by
`emptyState && sidebarHidden`, not by the empty state alone.

## 5. Entrance animation

Measured frame-by-frame from the reference recording (`5.mp4`, 85 frames at
30fps, 2.83s). Method and full numbers in
[Appendix: how the animation was measured](#appendix-how-the-animation-was-measured).

**Background layer** (wallpaper + scrim, animated as one unit):

| Property  | From         | To        |
| --------- | ------------ | --------- |
| `opacity` | 0            | 1         |
| `filter`  | `blur(36px)` | `blur(0)` |

- Duration **985ms** — the reference's measured 1970ms, halved — easing
  **`cubic-bezier(0.228, 0.153, 0.227, 1)`**, `animation-fill-mode: both`.
- **No scale, no zoom.** Tested explicitly and ruled out (see appendix).

The easing is heavily weighted to the front — 82% of the way through at half
the duration — so it settles well before the nominal end and trails off in a
tail nobody sees.

**Opacity and blur ride different elements.** A blurred element's edges fall
off to transparent, so a single blurred layer shows the app background as a
pale fringe around all four sides for the length of the entrance. The
reference does this too; it is not wanted here. Instead:

- the outer frame carries the **opacity** animation and `overflow: hidden`;
- the image layer inside carries the **blur** animation and overhangs the
  frame by `2 × blur` on every side, so the falloff is clipped rather than
  seen. At 2σ the visible edge still sits at 97.7% alpha.
- the scrim is a third layer at `inset: 0`, unblurred, so its stops land
  exactly where the design puts them.

The cost is a fixed, motionless crop of the wallpaper — no scale animation is
introduced.

**Foreground** (top-right actions): plain `opacity` fade, no blur, delayed
until the background has largely resolved. In the reference the foreground
caption starts at ~1150ms and takes ~650ms, and is never blurred — blurring
small text at 36px would smear it into nothing. Use the same shape.

The **sidebar toggle** is the exception: it is continuous chrome that was
already on screen before the state opened, so fading it in from nothing would
be wrong. Only its colour changes, and it changes immediately — at this speed
the wallpaper resolves behind it fast enough that holding the old colour reads
as lag rather than as care.

`prefers-reduced-motion: reduce` skips every one of these animations.

## 6. ⌘T is inert here

A second launcher would only bring the tab strip back to show two identical
"New tab" tabs. The predicate is shared with the hook rather than restated:
`use-empty-workspace.ts` exports a non-reactive `isEmptyWorkspace(tabs,
isCompactFileMode)` for the shortcut handler, which reads store state at event
time rather than subscribing.

## 7. Inactive window

macOS greys its traffic lights out when the window stops being key, and chrome
left at full white beside them reads as a mistake. The sidebar toggle icon, the
action labels and the shortcut text all drop to a single flat
`--chrome-inactive-fg`, the way the three buttons drop to one grey; the
shortcut chip's surface dims with them so it does not out-shout the label it
belongs to. Hover states are suppressed — nothing should light up under a
pointer the window is not accepting.

Scoped to the wallpaper chrome. Ordinary themed chrome is unaffected.

WebKit's `:window-inactive` looks like the answer here and even passes
`CSS.supports("selector(:window-inactive)")`, but inside WKWebView it matches
unconditionally, active or not — verified by probe, so it cannot be used.
`use-window-active.ts` listens to Tauri's focus event instead, which is the
same native signal AppKit uses to grey the buttons, and mirrors it onto
`<html data-window-inactive>`. Writing an attribute rather than React state
keeps focus changes out of the render path entirely: they repaint via CSS and
cause no re-render.

## 8. One-pixel nudges

The sidebar toggle's glyph sits low in its own box, so centring the box leaves
it looking low next to the traffic lights. It is shifted up 1px **globally**,
in both variants. The empty state's top-right actions are shifted up 1px too,
so they sit on the same optical line. Note that Tailwind v4 emits these as the
separate `translate` property, not `transform`.

## Files

- `apps/desktop/src/components/editor-area/wallpapers.ts` — registry of
  wallpaper source + scrim top stop; `dailyWallpaper()` picker (cycles daily
  by local calendar date) and `setDevWallpaperOverride()` for the dev flag.
- `apps/desktop/src/hooks/use-open-drop.ts` — `resolveStartup` calls
  `setDevWallpaperOverride(startup.dev_wallpaper)` before showing the window.
- `apps/desktop/src/lib/tauri.ts` — `StartupState.dev_wallpaper`.
- `apps/desktop/src-tauri/src/lib.rs` — `dev_arg()`, the shared `--<flag>
<value>` process-args reader used by both `--w`/`--h` and `--wallpaper`.
- `apps/desktop/src-tauri/src/commands/startup.rs` —
  `StartupState.dev_wallpaper`, populated from `dev_arg("--wallpaper")` in
  debug builds only.
- `apps/desktop/src/hooks/use-empty-workspace.ts` — new. `useIsEmptyWorkspace()`.
- `apps/desktop/src/components/editor-area/new-tab-page.tsx` — wallpaper and
  scrim; plain centred fallback when not the empty state.
- `apps/desktop/src/components/empty-state-actions.tsx` — new. The shared
  action list plus the top-right chrome. Rendered by `AppLayout` rather than
  by the pane: a pane is a `z-10` stacking context sealed under the window's
  `z-30` drag region, so buttons inside it paint correctly but never receive
  clicks.
- `apps/desktop/src/hooks/use-keyboard-shortcuts.ts` — ⌘T inert here.
- `apps/desktop/src/hooks/use-window-active.ts` — new. Mirrors window focus
  onto `<html data-window-inactive>`; registered in `App.tsx`.
- `apps/desktop/e2e/specs/window-inactive.spec.js` — new. Drives real window
  activation with `osascript` and checks the three colours converge.
- `apps/desktop/e2e/specs/empty-state.spec.js` — new. Covers every point above,
  including the overhang that kills the fringe and ⌘T being ignored.
- `apps/desktop/src/App.css` — keyframes and the over-wallpaper control
  styling. They live here rather than in a component CSS file because the
  sidebar toggle is in a different component directory and would otherwise
  depend on a stylesheet imported by `new-tab-page.tsx`.
- `apps/desktop/src/components/app-layout.tsx` — hide `EditorTabs`; pass the
  toggle variant.
- `apps/desktop/src/components/sidebar/sidebar-toggle-button.tsx` —
  `onWallpaper` variant.

## Tasks

- [x] 1. Wallpaper registry + `useIsEmptyWorkspace` hook.
- [x] 2. Hide the tab strip in the empty state.
- [x] 3. `NewTabPage`: wallpaper + scrim; actions in `EmptyStateActions`.
- [x] 4. Sidebar toggle `onWallpaper` variant.
- [x] 5. Entrance animation + reduced-motion.
- [x] 6. Validated; `vp check`, `vp test`, CHANGELOG.
- [x] 7. Revisions: halved duration, ⌘T inert, 1px nudges, immediate toggle
     colour, blur fringe clipped.

Covered by `apps/desktop/e2e/specs/empty-state.spec.js`. The animation was
checked against the measurement by pausing the live keyframes and reading
computed style at each sampled time — opacity within 0.002 and blur within
0.1px of the reference at every point (remembering the recording starts 68ms
into the animation). After halving, each sampled time reproduces exactly what
the reference showed at twice that time. Columns layout was checked
separately: one launcher column resolves to `100%`, so the wallpaper fills the
window there too.

The fringe fix was measured, not eyeballed: freezing several points of one
page load (so the wallpaper stays constant) and differencing each against the
settled frame cancels image content out. Left and right edges went from
+14/+13 brightness over the interior to ±1. Top and bottom read positive on
that probe only because it straddles the scrim's own vertical gradient; the
vertical profile down from the top edge is smooth and _gentlest_ at y=0,
whereas an unclipped blur is steepest exactly there.

---

## Appendix: how the animation was measured

The recording is a screen capture of a different app's empty state, used only
as an animation reference. Frames were extracted at native resolution and each
frame fitted against the settled final frame under a forward model:

```
frame = α · gaussian_blur(final, σ) + (1 − α) · background
```

α and σ were solved per frame (α in closed form by least squares, σ by grid
search), giving smooth monotonic trajectories with fit rms ≈ 0.0015 on α.

**Device pixel ratio.** Measured glyph heights in the capture: nav ascender
18px, caption cap height 37px. At DPR 2 that is a 12px nav and a 26px caption
— a sensible pairing; at DPR 1 it would be 24px and 52px, which is not. So the
2560×1442 capture is a 1280×721 CSS viewport, and measured pixel values are
halved to CSS px.

**No scale.** Scale was fitted as a third free parameter. Wherever the blur is
small enough for scale to be constrained, the rms minimum is razor-sharp at
exactly 1.000 (e.g. frame 60: rms 0.71 at 1.000 vs 11.9 at 0.99). On the
early heavily-blurred frames the landscape is flat to within 0.5%, i.e.
unconstrained rather than non-unity. There is no zoom component — the apparent
"growth" when skimming frames is the blur receding.

**Edge behaviour.** Compared two blur models at the frame border: edge-extended
(`mode="nearest"`) vs bleeding to the page background. Bleeding wins decisively
(edge rms ≈ 5–8 vs 20–32), so the reference uses a plain unfixed
`filter: blur()`.

**Shared easing.** Fitting opacity alone gives
`cubic-bezier(0.228, 0.153, 0.227, 1)` over 1968ms at rms 0.0015. Locking that
curve and solving one blur amplitude against it gives σ₀ = 35.9 CSS px with a
worst-case error of 1.9px, and under 1.2px after the first 300ms. One easing
driving both properties is therefore within measurement noise of the
reference, and is what the implementation uses.

Measured trajectory (CSS px, α from the model fit):

| t (ms) | α     | blur σ |
| ------ | ----- | ------ |
| 0      | 0.030 | 34.9   |
| 200    | 0.203 | 28.6   |
| 400    | 0.439 | 20.1   |
| 600    | 0.633 | 13.2   |
| 800    | 0.768 | 8.4    |
| 1000   | 0.859 | 5.0    |
| 1200   | 0.921 | 2.8    |
| 1400   | 0.965 | 1.3    |
| 1600   | 0.990 | 0.4    |
| 1800   | 0.998 | 0.05   |
| 1970   | 1.000 | 0      |
