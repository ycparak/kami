# Changelog

User-visible changes, newest first.

## Unreleased

### Changed

- **Empty-state wallpaper cycles daily.** The full-bleed photograph behind an
  empty workspace now changes once a day instead of being re-randomized every
  time the empty state appears — it advances through all nine wallpapers in
  order, one per calendar day.

### Fixed

- **Command palette keyboard navigation.** Arrow keys now move the highlight
  one item per press, every press. Previously, as soon as the highlight
  reached the edge of the list, scrolling the next item into view made the
  selection jump back to whatever row the mouse pointer happened to be resting
  over — so holding ↑ crawled through the list a few items at a time and the
  list scrolled in fits and starts. Hovering with the mouse still selects, but
  only when the mouse actually moves. The palette also now starts on the first
  item every time it opens, instead of resuming wherever the last session left
  off, and the selection no longer strands itself on a result that a new query
  has removed.

## 0.1.0 - 2026-08-25

### Added

- **Empty-state wallpaper.** With nothing open, Kami now shows a full-bleed
  photograph instead of a blank pane. The tab strip hides itself, one of nine
  wallpapers is picked at random, and **Create new note** and **Search** move
  to the top-right corner. ⌘T does nothing while you are here. The whole thing
  fades and unblurs into place when the state opens, and honours **Reduce
  Motion**. When the window is not the active one, the icon and both actions
  grey out alongside the traffic lights.
- **Horizontal pane layout.** Open tabs now render as columns in one
  horizontally-scrollable row instead of one at a time. Each pane has its own
  scroll position, section rail, and word count, with a divider between panes
  that fades in below the tab strip instead of crossing it. Toggle **Column
  Layout** off in Preferences for the previous one-at-a-time behaviour.
- **Minimum Pane Width** setting. Panes are always equal width and share the
  window between them, shrinking no further than this floor — below that they
  keep their width and the row scrolls. A single open pane fills the window.
- **Column stacking.** Panes scrolled past collapse behind the next one at
  the left edge instead of disappearing off-canvas. Click a collapsed pane
  to bring it back.
- **Resizable panes.** Drag a pane's divider to resize it; hovering shows a
  resize cursor and highlights the divider. Double-click a divider to reset
  that pane back to its automatic width.

### Changed

- A file is now open in at most one pane. Opening a file that is already open
  focuses its pane instead of adding a second copy, in both layouts. "Open in new
  tab" no longer forces a duplicate.
- Clicking a link, or selecting a note from the command palette, now
  navigates the pane you're in, the same in both layouts. ⌘-click (or
  ⌘-Enter in the palette) opens it in a new pane instead of navigating.
- Markdown stays folded in panes that do not have focus, so only the pane you are
  working in shows its heading markers and link syntax.
- The find panel is anchored to the pane it searches rather than the corner of
  the editor area.
- Body text, frontmatter, and hanging markdown markers (like a heading's `#`)
  now keep at least 40px clear of a pane's edge.
- In column layout, a document starts closer to the tab strip — an 88px gap
  instead of 124px. Single-document windows and the one-at-a-time layout are
  unchanged.

### Fixed

- **Command palette keyboard navigation.** Arrow keys move exactly one item per
  press. Previously, if the pointer happened to rest over the list, any press
  that scrolled the list handed the selection back to whatever item slid under
  the cursor — so the highlight bounced between the same few rows and the list
  appeared to scroll on its own. Hovering still selects, but only when the mouse
  actually moves.
- The command palette now opens on its first item with the list scrolled to the
  top, instead of restoring whatever was selected the last time it was open.
- A slow search response for an earlier query can no longer replace the results
  for what you have since typed.
- A new note created and written to in quick succession (the normal
  create-a-note-and-start-typing flow) could fail to appear in the sidebar
  until the workspace was reopened.
