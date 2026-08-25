import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  type ViewUpdate,
  ViewPlugin,
} from "@codemirror/view";
import {
  EditorSelection,
  EditorState,
  type Extension,
  Prec,
  type SelectionRange,
} from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

const ATX_HEADING_RE = /^ATXHeading([1-6])$/;
const SETEXT_HEADING_RE = /^SetextHeading([1-2])$/;

const MAX_HEADING_HASH_PREFIX = 7;

const hashMark = Decoration.mark({ class: "cm-heading-hash" });

const lineDecos: Record<number, Decoration> = {};
for (let level = 1; level <= 6; level++) {
  lineDecos[level] = Decoration.line({
    attributes: { class: `cm-markdown-heading cm-heading-line cm-heading-line-${level}` },
  });
}

function getMarkdownHeadingLevel(name: string): number | null {
  const atx = ATX_HEADING_RE.exec(name);
  if (atx) return Number(atx[1]);

  const setext = SETEXT_HEADING_RE.exec(name);
  if (setext) return Number(setext[1]);

  return null;
}

function findHeadingHashEnd(node: SyntaxNode): number | null {
  const cursor = node.cursor();
  if (!cursor.firstChild() || cursor.name !== "HeaderMark") return null;
  return Math.min(cursor.to + 1, node.to);
}

interface NoGoZone {
  from: number;
  to: number;
}

function collectHeadingNoGoZones(state: EditorState, force = false): NoGoZone[] {
  if (force) ensureSyntaxTree(state, state.doc.length, 50);
  const zones: NoGoZone[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (!ATX_HEADING_RE.test(node.name)) return undefined;
      const hashEnd = findHeadingHashEnd(node.node);
      if (hashEnd === null) return false;
      const lineFrom = state.doc.lineAt(node.from).from;
      zones.push({ from: lineFrom, to: hashEnd });
      return false;
    },
  });
  return zones;
}

function couldBeInZone(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  return pos - line.from <= MAX_HEADING_HASH_PREFIX;
}

function anySelectionEndpointCouldBeInZone(
  state: EditorState,
  selection: EditorSelection,
): boolean {
  for (const r of selection.ranges) {
    if (couldBeInZone(state, r.anchor)) return true;
    if (couldBeInZone(state, r.head)) return true;
  }
  return false;
}

function clampRangesToZones(
  ranges: readonly SelectionRange[],
  zones: readonly NoGoZone[],
): { changed: boolean; ranges: SelectionRange[] } {
  let changed = false;
  const fixed = ranges.map((r) => {
    let { anchor, head } = r;
    for (const { from, to } of zones) {
      if (anchor >= from && anchor < to) {
        anchor = to;
        changed = true;
      }
      if (head >= from && head < to) {
        head = to;
        changed = true;
      }
    }
    return EditorSelection.range(anchor, head);
  });
  return { changed, ranges: fixed };
}

function buildDecorations(view: EditorView): DecorationSet {
  const decos: { from: number; to: number; deco: Decoration }[] = [];
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const level = getMarkdownHeadingLevel(node.name);
        if (level === null) return undefined;

        const lineFrom = view.state.doc.lineAt(node.from).from;
        decos.push({ from: lineFrom, to: lineFrom, deco: lineDecos[level]! });

        if (!ATX_HEADING_RE.test(node.name)) return false;

        const hashEnd = findHeadingHashEnd(node.node);
        if (hashEnd !== null) {
          decos.push({ from: node.from, to: hashEnd, deco: hashMark });
        }
        return false;
      },
    });
  }

  decos.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(
    decos.map(({ from, to, deco }) => deco.range(from, to)),
    true,
  );
}

const headingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const marginClickHandler = Prec.highest(
  EditorView.domEventHandlers({
    mousedown(event, view) {
      const target = event.target;
      if (!(target instanceof Element)) return false;
      if (!target.closest(".cm-heading-hash")) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const tree = syntaxTree(view.state);
      let hashEnd: number | null = null;
      for (const side of [-1, 1] as const) {
        let node = tree.resolveInner(pos, side);
        while (!ATX_HEADING_RE.test(node.name) && node.parent) node = node.parent;
        if (ATX_HEADING_RE.test(node.name)) {
          hashEnd = findHeadingHashEnd(node);
          break;
        }
      }
      if (hashEnd === null) return false;

      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: { anchor: hashEnd } });
      view.focus();
      return true;
    },
  }),
);

const headingSelectionGuard = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection) return tr;
  if (!anySelectionEndpointCouldBeInZone(tr.state, tr.newSelection)) return tr;

  const zones = collectHeadingNoGoZones(tr.state, tr.docChanged);
  if (zones.length === 0) return tr;

  const { changed, ranges } = clampRangesToZones(tr.newSelection.ranges, zones);
  if (!changed) return tr;
  return [tr, { selection: EditorSelection.create(ranges, tr.newSelection.mainIndex) }];
});

function findZoneEndingAt(state: EditorState, pos: number): NoGoZone | null {
  const line = state.doc.lineAt(pos);
  if (pos - line.from > MAX_HEADING_HASH_PREFIX) return null;
  for (const zone of collectHeadingNoGoZones(state)) {
    if (zone.to === pos) return zone;
  }
  return null;
}

const escapeHashLeft = Prec.highest(
  keymap.of([
    {
      key: "ArrowLeft",
      run: (view) => {
        const sel = view.state.selection.main;
        if (!sel.empty) return false;
        const zone = findZoneEndingAt(view.state, sel.head);
        if (zone === null) return false;
        view.dispatch({
          selection: { anchor: Math.max(0, zone.from - 1) },
          scrollIntoView: true,
          userEvent: "select",
        });
        return true;
      },
    },
    {
      key: "Shift-ArrowLeft",
      run: (view) => {
        const sel = view.state.selection.main;
        const zone = findZoneEndingAt(view.state, sel.head);
        if (zone === null) return false;
        view.dispatch({
          selection: EditorSelection.range(sel.anchor, Math.max(0, zone.from - 1)),
          scrollIntoView: true,
          userEvent: "select.extend",
        });
        return true;
      },
    },
  ]),
);

export function clampSelectionToHeadings(view: EditorView): void {
  const sel = view.state.selection;
  if (!anySelectionEndpointCouldBeInZone(view.state, sel)) return;

  const zones = collectHeadingNoGoZones(view.state, true);
  if (zones.length === 0) return;

  const { changed, ranges } = clampRangesToZones(sel.ranges, zones);
  if (!changed) return;
  view.dispatch({
    selection: EditorSelection.create(ranges, sel.mainIndex),
    userEvent: "select",
  });
}

export const headingDecorations: Extension = [
  headingPlugin,
  marginClickHandler,
  headingSelectionGuard,
  escapeHashLeft,
];

export const __test = {
  MAX_HEADING_HASH_PREFIX,
  collectHeadingNoGoZones,
  clampRangesToZones,
  couldBeInZone,
  anySelectionEndpointCouldBeInZone,
  getMarkdownHeadingLevel,
};
