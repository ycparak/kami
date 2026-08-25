# Command Palette Keyboard Navigation

Status: done
Owner: Yusuf

Arrow-key navigation in the command palette stalls: pressing Up or Down often
leaves the highlight where it was, and the list scroll jumps around. Reported
with a screen recording; this spec records the root cause and the fix, because
the mechanism is a WKWebView behaviour that is easy to reintroduce.

## Symptom

From the recording, walking up a nine-command list with the pointer resting
over the list produces a five-step cycle that never gets anywhere:

```
Settings -> Toggle Dark Mode -> Close Workspace -> Open Workspace -> Close All Tabs
         -> Settings   (back to where it started)
```

Five presses move the selection; the sixth throws it back to the bottom. The
list creeps upward by one row per cycle, so the palette _looks_ like it is
scrolling erratically while the highlight refuses to travel.

A second, independent defect: reopening the palette restored whichever item was
selected last time, with the list still scrolled to it, instead of starting at
the top.

## Root cause

### 1. WebKit's post-scroll mouse move

`cmdk` selects on hover: every `Command.Item` carries an `onPointerMove` that
sets the item as the active value. Keyboard navigation that reaches the edge of
the viewport calls `scrollIntoView`, which slides a different item under a
pointer that never moved — and WebKit answers a scroll with a synthetic
`mousemove` at the unchanged coordinates
(`EventHandler::dispatchFakeMouseMoveEventSoon`). `cmdk` cannot tell that move
from a real one, so it re-selects whatever landed under the cursor.

That is the whole cycle: presses that do not scroll behave normally, and the
first press that _does_ scroll gets undone by the synthetic move. Chromium does
not fire the same event, which is why this only reproduces in the app.

### 2. Selection state outlived the palette

`CommandPalette` renders a Radix dialog, so the component stays mounted while
the palette is closed and `selectedValue` survived across open/close. The reset
effect keyed off `[search, intent, firstValue]` — none of which change when the
palette is merely reopened.

## Fix

- **Ignore pointer moves that did not move the pointer.** A capture-phase
  `onPointerMoveCapture` on `CommandList` records the last client coordinates
  and calls `stopPropagation()` when the new event repeats them, so the event
  never reaches `cmdk`'s item handler. Real movement (different coordinates)
  passes through and hover selection works as before. The first move after the
  palette opens or the query changes is treated as a probe and suppressed, so a
  cursor that happens to rest over the list cannot claim the selection.
- **Anchor the selection to a value that exists.** `visibleValues` is the flat,
  in-DOM-order list of item values. One effect keeps `selectedValue` pointing at
  a member of it, resetting to the first item and scrolling the list to the top
  when the palette opens, when the query or intent changes, or when the selected
  item disappears from the results. A `resetKey` of `null` while closed is what
  makes reopening a reset.
- **Drop stale search results.** `useFuzzySearch` cancels in-flight requests on
  query change, so a slow response for an old query can no longer overwrite a
  newer one — which used to swap the result list, and therefore the selection,
  out from under the user.
- **Fewer DOM nodes per result.** `HighlightedPath` emits one span per
  contiguous matched/unmatched run instead of one per character, and is
  memoised. Every arrow press re-renders the list; a 50-character path went from
  50 spans to about 5.
- **Scroll padding.** `[cmdk-list]` gets `scroll-padding-block: 6px` so
  `scrollIntoView({ block: "nearest" })` stops with the list's padding visible
  instead of cutting the row flush to the edge, plus `overscroll-behavior:
contain` so a flick inside the list does not chain to the window.

## Coverage

`apps/desktop/e2e/specs/command-palette-keyboard.spec.js`. The WebDriver plugin
cannot inject real key or pointer input, so the spec dispatches the same events
WebKit does — including a `pointermove` at unchanged coordinates after each
keyboard scroll — against the real component in the real WKWebView. Verified to
fail on the pre-fix build with `the post-scroll mouse move stole the selection
at step 5`, matching the recording, and to pass after.
