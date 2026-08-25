import { syntaxTree } from "@codemirror/language";
import {
  type ChangeSpec,
  EditorSelection,
  EditorState,
  type Extension,
  Prec,
  type Range,
  type SelectionRange,
  StateField,
  type StateCommand,
  type TransactionSpec,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap } from "@codemirror/view";
import { eventHandlersWithClass } from "../utils";

const LIST_UNIT_CH = 3;
const LIST_INDENT_SPACES = 2;

const PREV_LIST_LOOKBACK = 256;

const listPrefixDecoration = (depth: number, kind: "bullet" | "task", checked = false) => {
  const prefixCh = (depth + 1) * LIST_UNIT_CH;
  const markerOffsetCh = depth * LIST_UNIT_CH;
  const classes = ["cm-list-prefix", `cm-list-prefix-${kind}`];
  if (checked) classes.push("cm-list-prefix-task-checked");
  return Decoration.mark({
    class: classes.join(" "),
    attributes: {
      style: [
        `width: ${prefixCh.toString()}ch`,
        `--cm-list-marker-offset: ${markerOffsetCh.toString()}ch`,
        `--cm-list-marker-width: ${LIST_UNIT_CH.toString()}ch`,
      ].join("; "),
    },
  });
};

const listIndentVisualDecoration = (depth: number) =>
  Decoration.mark({
    class: "cm-list-indent-visual",
    attributes: { style: `width: ${(depth * LIST_UNIT_CH).toString()}ch` },
  });

const listPrefixMarkerDecoration = Decoration.mark({});

const listBodyDecoration = Decoration.mark({ class: "cm-list-body" });

const isBulletMarkChar = (ch: string): boolean => ch === "-" || ch === "+" || ch === "*";

const ORDERED_MARKER_RE = /^\d+[.)]$/;
const isOrderedMarkText = (s: string): boolean => ORDERED_MARKER_RE.test(s);

const orderedLineDecoration = Decoration.line({
  attributes: {
    style: `padding-inline-start: ${LIST_UNIT_CH.toString()}ch; text-indent: -3.4ch;`,
  },
});
const orderedMarkerDecoration = Decoration.mark({
  class: "cm-list-ordered-marker",
  attributes: { style: `min-width: ${LIST_UNIT_CH.toString()}ch;` },
});

const isMarkerTrailingChar = (ch: string): boolean => ch === " " || ch === "\t";

interface ParsedBulletTaskLine {
  lineFrom: number;
  markerFrom: number;
  bodyFrom: number;
  indentLen: number;
  markerLen: number;
  isTask: boolean;
}

const BULLET_TASK_LINE_RE = /^([ \t]*)([-+*]) (\[[ xX]\] )?/;

function parseBulletTaskLine(line: { from: number; text: string }): ParsedBulletTaskLine | null {
  const match = BULLET_TASK_LINE_RE.exec(line.text);
  if (!match) return null;
  const indentLen = match[1]?.length ?? 0;
  const markerLen = match[0].length - indentLen;
  return {
    lineFrom: line.from,
    markerFrom: line.from + indentLen,
    bodyFrom: line.from + match[0].length,
    indentLen,
    markerLen,
    isTask: match[3] !== undefined,
  };
}

interface ListDecorations {
  all: DecorationSet;
  atomic: DecorationSet;
  marker: DecorationSet;
}

function buildListDecorations(state: EditorState): ListDecorations {
  const allRanges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];
  const markerRanges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "ListMark") return;

      if (!isMarkerTrailingChar(state.doc.sliceString(node.to, node.to + 1))) return;

      const markText = state.doc.sliceString(node.from, node.to);
      if (isOrderedMarkText(markText)) {
        const line = state.doc.lineAt(node.from);
        const prefixEnd = node.to + 1;
        allRanges.push(orderedMarkerDecoration.range(node.from, node.to));
        if (prefixEnd < line.to) {
          allRanges.push(listBodyDecoration.range(prefixEnd, line.to));
        }
        allRanges.push(orderedLineDecoration.range(line.from));
        return;
      }

      if (markText.length !== 1 || !isBulletMarkChar(markText)) return;

      let depth = -1;
      for (let p = node.node.parent; p; p = p.parent) {
        if (p.name === "ListItem") depth++;
      }
      if (depth < 0) depth = 0;

      const line = state.doc.lineAt(node.from);
      const leadingFrom = line.from;
      const leadingTo = node.from;
      const leadingLen = leadingTo - leadingFrom;
      if (depth >= 1 && leadingLen >= depth) {
        allRanges.push(listIndentVisualDecoration(depth).range(leadingFrom, leadingTo));
        const step = Math.floor(leadingLen / depth);
        for (let i = 0; i < depth; i++) {
          const subFrom = leadingFrom + i * step;
          const subTo = i === depth - 1 ? leadingTo : leadingFrom + (i + 1) * step;
          if (subTo <= subFrom) break;
          atomicRanges.push(listPrefixMarkerDecoration.range(subFrom, subTo));
        }
      }

      const cursor = node.node.cursor();
      let prefixEnd = -1;
      let prefixKind: "bullet" | "task" = "bullet";
      let checked = false;
      if (cursor.nextSibling() && cursor.name === "Task") {
        const taskCursor = cursor.node.cursor();
        if (
          taskCursor.firstChild() &&
          taskCursor.name === "TaskMarker" &&
          isMarkerTrailingChar(state.doc.sliceString(taskCursor.to, taskCursor.to + 1))
        ) {
          checked =
            state.doc.sliceString(taskCursor.from + 1, taskCursor.to - 1).toLowerCase() === "x";
          prefixEnd = taskCursor.to + 1;
          prefixKind = "task";
        }
      }
      if (prefixEnd < 0) {
        prefixEnd = node.to + 1;
      }
      allRanges.push(listPrefixDecoration(depth, prefixKind, checked).range(line.from, prefixEnd));
      markerRanges.push(listPrefixMarkerDecoration.range(node.from, prefixEnd));
      atomicRanges.push(listPrefixMarkerDecoration.range(node.from, prefixEnd));

      if (prefixEnd < line.to) {
        allRanges.push(listBodyDecoration.range(prefixEnd, line.to));
      }

      const prefixCh = (depth + 1) * LIST_UNIT_CH;
      const lineStyle = `padding-inline-start: ${prefixCh.toString()}ch; text-indent: -${prefixCh.toString()}ch;`;
      allRanges.push(Decoration.line({ attributes: { style: lineStyle } }).range(line.from));
    },
  });

  return {
    all: Decoration.set(allRanges, true),
    atomic: Decoration.set(atomicRanges, true),
    marker: Decoration.set(markerRanges, true),
  };
}

const listDecorationsField = StateField.define<ListDecorations>({
  create(state) {
    return buildListDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return buildListDecorations(tr.state);
    }
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (v) => v.all),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
  ],
});

const findPrevListItemIndent = (
  state: EditorState,
  lineNumber: number,
  predicate: (indent: number) => boolean,
): number => {
  const stop = Math.max(1, lineNumber - PREV_LIST_LOOKBACK);
  for (let i = lineNumber - 1; i >= stop; i--) {
    const prev = state.doc.line(i);
    const text = prev.text;
    if (text.trim() === "") return -1;
    const m = /^([ \t]*)[-+*] /.exec(text);
    if (m && predicate(m[1].length)) return m[1].length;
  }
  return -1;
};

const currentLineIndentLen = (lineText: string): number =>
  /^[ \t]*/.exec(lineText)?.[0].length ?? 0;

const isOnListLine = (state: EditorState, pos: number): boolean => {
  const line = state.doc.lineAt(pos);
  let found = false;
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter: (node) => {
      if (node.name === "ListMark" || node.name === "TaskMarker") {
        found = true;
        return false;
      }
      return undefined;
    },
  });
  return found;
};

function parseBulletTaskLineAt(state: EditorState, pos: number): ParsedBulletTaskLine | null {
  const line = state.doc.lineAt(pos);
  const parsed = parseBulletTaskLine(line);
  if (!parsed) return null;
  if (pos > line.to) return null;
  return parsed;
}

function clampCollapsedListPrefixRange(state: EditorState, range: SelectionRange): SelectionRange {
  if (!range.empty) return range;
  const parsed = parseBulletTaskLineAt(state, range.head);
  if (!parsed) return range;

  let pos = range.head;
  if (pos > parsed.lineFrom && pos < parsed.markerFrom) {
    pos = parsed.markerFrom;
  } else if (pos > parsed.markerFrom && pos < parsed.bodyFrom) {
    pos = parsed.bodyFrom;
  } else {
    return range;
  }
  return EditorSelection.cursor(pos);
}

const listPrefixSelectionGuard = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection) return tr;
  let changed = false;
  const ranges = tr.newSelection.ranges.map((range) => {
    const clamped = clampCollapsedListPrefixRange(tr.state, range);
    if (clamped !== range) changed = true;
    return clamped;
  });
  if (!changed) return tr;
  return [tr, { selection: EditorSelection.create(ranges, tr.newSelection.mainIndex) }];
});

function selectedLineNumbers(state: EditorState): number[] {
  const numbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    const endPos = range.empty ? range.to : Math.max(range.from, range.to - 1);
    const toLine = state.doc.lineAt(endPos);
    for (let line = fromLine.number; line <= toLine.number; line++) {
      numbers.add(line);
    }
  }
  return [...numbers].sort((a, b) => a - b);
}

const listIndentSelection: StateCommand = ({ state, dispatch }) => {
  const changes: ChangeSpec[] = [];
  let sawListLine = false;

  for (const lineNumber of selectedLineNumbers(state)) {
    const line = state.doc.line(lineNumber);
    const parsed = parseBulletTaskLine(line);
    if (!parsed) continue;
    sawListLine = true;

    const prevIndent = findPrevListItemIndent(
      state,
      line.number,
      (indent) => indent <= parsed.indentLen,
    );
    if (prevIndent < 0) continue;

    const targetIndent = prevIndent + LIST_INDENT_SPACES;
    if (parsed.indentLen >= targetIndent) continue;

    changes.push({ from: line.from, insert: " ".repeat(targetIndent - parsed.indentLen) });
  }

  if (!sawListLine) return false;
  if (changes.length > 0) {
    dispatch(state.update({ changes, userEvent: "input.indent" }));
  }
  return true;
};

const listOutdentSelection: StateCommand = ({ state, dispatch }) => {
  const changes: ChangeSpec[] = [];
  let sawListLine = false;

  for (const lineNumber of selectedLineNumbers(state)) {
    const line = state.doc.line(lineNumber);
    const parsed = parseBulletTaskLine(line);
    if (!parsed) continue;
    sawListLine = true;
    if (parsed.indentLen === 0) continue;

    const removeLen = Math.min(LIST_INDENT_SPACES, parsed.indentLen);
    changes.push({ from: line.from, to: line.from + removeLen });
  }

  if (!sawListLine) return false;
  if (changes.length > 0) {
    dispatch(state.update({ changes, userEvent: "delete.outdent" }));
  }
  return true;
};

function listPrefixBoundaryMove(state: EditorState, direction: "left" | "right"): number | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const parsed = parseBulletTaskLineAt(state, sel.head);
  if (!parsed) return null;
  if (direction === "left") {
    if (sel.head === parsed.bodyFrom) return parsed.markerFrom;
    if (parsed.markerFrom > parsed.lineFrom && sel.head === parsed.markerFrom) {
      return parsed.lineFrom;
    }
  } else {
    if (sel.head === parsed.lineFrom) {
      return parsed.markerFrom > parsed.lineFrom ? parsed.markerFrom : parsed.bodyFrom;
    }
    if (parsed.markerFrom > parsed.lineFrom && sel.head === parsed.markerFrom) {
      return parsed.bodyFrom;
    }
  }
  return null;
}

function markerColumnWidthPx(target: HTMLElement): number {
  const style = getComputedStyle(target);
  const raw = style.getPropertyValue("--cm-list-marker-width").trim();
  if (!raw.endsWith("ch")) return 0;
  const ch = Number(raw.slice(0, -2));
  if (!Number.isFinite(ch) || ch <= 0) return 0;

  const probe = document.createElement("span");
  probe.textContent = "0";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.font = style.font;
  target.appendChild(probe);
  const chWidth = probe.getBoundingClientRect().width;
  probe.remove();
  return ch * chWidth;
}

function listPrefixClickPosition(view: EditorView, event: MouseEvent): number | null {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return null;
  const prefix = target.closest<HTMLElement>(".cm-list-prefix");
  if (!prefix) return null;

  const pos = view.posAtDOM(prefix);
  const parsed = parseBulletTaskLineAt(view.state, pos);
  if (!parsed) return null;

  const rect = prefix.getBoundingClientRect();
  if (rect.width <= 0) return parsed.bodyFrom;

  const markerWidth = markerColumnWidthPx(prefix) || rect.width;
  const markerStartX = Math.max(rect.left, rect.right - markerWidth);
  const x = event.clientX;

  if (x < markerStartX) {
    return x - rect.left < markerStartX - x ? parsed.lineFrom : parsed.markerFrom;
  }
  return x - markerStartX < rect.right - x ? parsed.markerFrom : parsed.bodyFrom;
}

const listPrefixMouseHandler = Prec.highest(
  EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false;
      const pos = listPrefixClickPosition(view, event);
      if (pos === null) return false;
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true, userEvent: "select" });
      view.focus();
      return true;
    },
  }),
);

const listPrefixArrowKeymap = Prec.highest(
  keymap.of([
    {
      key: "ArrowLeft",
      run: (view) => {
        const pos = listPrefixBoundaryMove(view.state, "left");
        if (pos === null) return false;
        view.dispatch({
          selection: { anchor: pos },
          scrollIntoView: true,
          userEvent: "select",
        });
        return true;
      },
    },
    {
      key: "ArrowRight",
      run: (view) => {
        const pos = listPrefixBoundaryMove(view.state, "right");
        if (pos === null) return false;
        view.dispatch({
          selection: { anchor: pos },
          scrollIntoView: true,
          userEvent: "select",
        });
        return true;
      },
    },
    {
      key: "Shift-ArrowLeft",
      run: (view) => {
        const pos = listPrefixBoundaryMove(view.state, "left");
        if (pos === null) return false;
        const sel = view.state.selection.main;
        view.dispatch({
          selection: EditorSelection.range(sel.anchor, pos),
          scrollIntoView: true,
          userEvent: "select.extend",
        });
        return true;
      },
    },
    {
      key: "Shift-ArrowRight",
      run: (view) => {
        const pos = listPrefixBoundaryMove(view.state, "right");
        if (pos === null) return false;
        const sel = view.state.selection.main;
        view.dispatch({
          selection: EditorSelection.range(sel.anchor, pos),
          scrollIntoView: true,
          userEvent: "select.extend",
        });
        return true;
      },
    },
  ]),
);

const listIndent: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return listIndentSelection({ state, dispatch });
  }
  const sel = state.selection.main;
  if (!isOnListLine(state, sel.head)) return false;

  const line = state.doc.lineAt(sel.head);
  const currentIndent = currentLineIndentLen(line.text);

  const prevIndent = findPrevListItemIndent(state, line.number, (i) => i <= currentIndent);
  if (prevIndent < 0) return true;
  const targetIndent = prevIndent + LIST_INDENT_SPACES;
  if (currentIndent >= targetIndent) return true;

  const insertLen = targetIndent - currentIndent;
  dispatch(
    state.update({
      changes: { from: line.from, insert: " ".repeat(insertLen) },
      selection: { anchor: sel.head + insertLen },
      userEvent: "input.indent",
    }),
  );
  return true;
};

const listOutdent: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return listOutdentSelection({ state, dispatch });
  }
  const sel = state.selection.main;
  if (!isOnListLine(state, sel.head)) return false;

  const line = state.doc.lineAt(sel.head);
  const currentIndent = currentLineIndentLen(line.text);
  if (currentIndent === 0) return true;

  const prevIndent = findPrevListItemIndent(state, line.number, (i) => i < currentIndent);
  const targetIndent = Math.max(0, prevIndent);

  const removeLen = currentIndent - targetIndent;
  if (removeLen <= 0) return true;

  const cursorOffsetInLine = sel.head - line.from;
  const newHead = line.from + Math.max(targetIndent, cursorOffsetInLine - removeLen);
  dispatch(
    state.update({
      changes: { from: line.from, to: line.from + removeLen },
      selection: { anchor: newHead },
      userEvent: "delete.outdent",
    }),
  );
  return true;
};

const EMPTY_LIST_LINE_RE = /^[ \t]*[-+*] (\[.\] )?$/;

const LIST_LINE_PREFIX_RE = /^([ \t]*)([-+*]) (\[.\] )?/;

const listEnter: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return false;
  const sel = state.selection.main;
  if (!isOnListLine(state, sel.head)) return false;

  const line = state.doc.lineAt(sel.head);

  if (EMPTY_LIST_LINE_RE.test(line.text)) {
    dispatch(
      state.update({
        changes: { from: line.from, to: line.to },
        selection: { anchor: line.from },
        userEvent: "delete.empty-list-marker",
      }),
    );
    return true;
  }

  const match = LIST_LINE_PREFIX_RE.exec(line.text);
  if (!match) return false;
  const indent = match[1] ?? "";
  const marker = match[2] ?? "-";
  const isTask = match[3] !== undefined;

  const cursorOffsetInLine = sel.head - line.from;
  const prefixLen = match[0].length;
  if (cursorOffsetInLine < prefixLen) return false;

  const continuation = isTask ? `${indent}${marker} [ ] ` : `${indent}${marker} `;
  dispatch(
    state.update({
      changes: { from: sel.head, insert: `\n${continuation}` },
      selection: { anchor: sel.head + 1 + continuation.length },
      userEvent: "input.list-continue",
    }),
  );
  return true;
};

const listBackspace: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  if (!range.empty) return false;

  const head = range.head;
  const parsed = parseBulletTaskLineAt(state, head);
  if (!parsed) return false;

  let effectiveHead = head;
  if (head > parsed.lineFrom && head < parsed.markerFrom) {
    effectiveHead = parsed.markerFrom;
  } else if (head > parsed.markerFrom && head < parsed.bodyFrom) {
    effectiveHead = parsed.bodyFrom;
  }

  if (effectiveHead === parsed.lineFrom) return false;

  if (effectiveHead === parsed.markerFrom) {
    if (parsed.indentLen === 0) return false;
    const from = parsed.markerFrom - Math.min(LIST_INDENT_SPACES, parsed.indentLen);
    dispatch(
      state.update({
        changes: { from, to: parsed.markerFrom },
        selection: { anchor: from },
        userEvent: "delete.list",
      }),
    );
    return true;
  }

  if (effectiveHead === parsed.bodyFrom) {
    const from =
      parsed.indentLen > 0
        ? parsed.markerFrom - Math.min(LIST_INDENT_SPACES, parsed.indentLen)
        : parsed.markerFrom;
    dispatch(
      state.update({
        changes: { from, to: parsed.bodyFrom },
        selection: { anchor: from },
        userEvent: "delete.list",
      }),
    );
    return true;
  }

  return false;
};

export const computeCheckboxToggle = (
  state: EditorState,
  widgetStartPos: number,
): TransactionSpec | null => {
  const slice = state.doc.sliceString(widgetStartPos, widgetStartPos + 8);
  const m = /^[-+*] \[([ xX])\][ \t]/.exec(slice);
  if (!m) return null;
  const innerCharPos = widgetStartPos + 3;
  const currentlyChecked = m[1]?.toLowerCase() === "x";
  return {
    changes: {
      from: innerCharPos,
      to: innerCharPos + 1,
      insert: currentlyChecked ? " " : "x",
    },
    userEvent: "input.toggle-checkbox",
  };
};

const computeCheckboxToggleFromLine = (state: EditorState, pos: number): TransactionSpec | null => {
  const line = state.doc.lineAt(pos);
  const match = /^([ \t]*)[-+*] \[[ xX]\][ \t]/.exec(line.text);
  if (!match) return null;
  const indentLen = match[1]?.length ?? 0;
  return computeCheckboxToggle(state, line.from + indentLen);
};

const checkboxClickHandler = EditorView.domEventHandlers(
  eventHandlersWithClass({
    click: {
      "cm-list-prefix-task": (ev, view) => {
        const pos = view.posAtDOM(ev.target as HTMLElement);
        const spec =
          computeCheckboxToggleFromLine(view.state, pos) ?? computeCheckboxToggle(view.state, pos);
        if (!spec) return false;
        view.dispatch(spec);
        return true;
      },
    },
  }),
);

export const listExtension: Extension = [
  listDecorationsField,
  listPrefixSelectionGuard,
  listPrefixMouseHandler,
  listPrefixArrowKeymap,
  Prec.highest(
    keymap.of([
      { key: "Backspace", run: listBackspace },
      { key: "Enter", run: listEnter },
      { key: "Tab", run: listIndent },
      { key: "Shift-Tab", run: listOutdent },
    ]),
  ),
  checkboxClickHandler,
];

export const __test = {
  buildListDecorations,
  clampCollapsedListPrefixRange,
  computeCheckboxToggleFromLine,
  isOnListLine,
  listPrefixBoundaryMove,
  parseBulletTaskLine,
  findPrevListItemIndent,
  currentLineIndentLen,
  listEnter,
  listBackspace,
  listIndent,
  listOutdent,
  EMPTY_LIST_LINE_RE,
  LIST_LINE_PREFIX_RE,
  LIST_UNIT_CH,
  listDecorationsField,
};
