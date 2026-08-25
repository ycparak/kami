import { Decoration, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { foldableSyntaxFacet } from "@/lib/prosemark-core/main";
import { renderMermaid } from "./mermaid-renderer";
import { MERMAID_CANVAS_HEIGHT, MermaidCanvasHandle, mountMermaidCanvas } from "./mermaid-canvas";
import { openMermaidFullscreen } from "./mermaid-fullscreen";
import "./mermaid-canvas.css";

const WIDGET_VERTICAL_PADDING = 16;

const widgetHandles = new WeakMap<HTMLElement, MermaidCanvasHandle>();

class MermaidWidget extends WidgetType {
  constructor(
    readonly body: string,
    readonly fenceText: string,
  ) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return this.body === other.body && this.fenceText === other.fenceText;
  }

  get estimatedHeight(): number {
    return MERMAID_CANVAS_HEIGHT + WIDGET_VERTICAL_PADDING;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-mermaid-widget";
    wrapper.contentEditable = "false";

    const host = document.createElement("div");
    host.className = "cm-mermaid-canvas";
    host.tabIndex = 0;
    wrapper.append(host);

    const ariaLabel = `Mermaid diagram: ${this.body.split("\n")[0]}`;
    const onExpand = () => openMermaidFullscreen(this.body, ariaLabel);
    const onSourceChange = (next: string) => writeFenceText(view, host, next);

    const result = renderMermaid(this.body);
    const handle = mountMermaidCanvas(host, {
      svgHtml: result.svg ?? "",
      ariaLabel,
      source: this.fenceText,
      onSourceChange,
      onExpand,
    });
    if (result.error) handle.updateSource("", this.fenceText, result.error);
    widgetHandles.set(wrapper, handle);

    return wrapper;
  }

  updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    const handle = widgetHandles.get(dom);
    if (!handle) return false;
    const result = renderMermaid(this.body);
    handle.updateSource(result.svg ?? "", this.fenceText, result.error);
    return true;
  }

  destroy(dom: HTMLElement): void {
    const handle = widgetHandles.get(dom);
    handle?.destroy();
    widgetHandles.delete(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function findEnclosingFencedCode(view: EditorView, host: HTMLElement) {
  const pos = view.posAtDOM(host);
  const tree = syntaxTree(view.state);
  for (const side of [-1, 1] as const) {
    let node = tree.resolveInner(pos, side);
    while (node.name !== "FencedCode" && node.parent) node = node.parent;
    if (node.name === "FencedCode") return node;
  }
  return null;
}

function writeFenceText(view: EditorView, host: HTMLElement, next: string): void {
  const fence = findEnclosingFencedCode(view, host);
  if (!fence) return;
  if (view.state.doc.sliceString(fence.from, fence.to) === next) return;
  view.dispatch({
    changes: { from: fence.from, to: fence.to, insert: next },
  });
}

function parseFencedCode(
  state: { doc: { sliceString(from: number, to: number): string } },
  node: {
    node: {
      firstChild: {
        name: string;
        from: number;
        to: number;
        nextSibling: typeof node.node.firstChild;
      } | null;
    };
  },
): { info: string; source: string } | undefined {
  let info = "";
  let source = "";

  let child = node.node.firstChild;
  while (child) {
    if (child.name === "CodeInfo") {
      info = state.doc.sliceString(child.from, child.to);
    } else if (child.name === "CodeText") {
      source += state.doc.sliceString(child.from, child.to);
    }
    child = child.nextSibling;
  }

  if (!info) return undefined;
  return { info, source };
}

const mermaidFoldExtension = foldableSyntaxFacet.of({
  nodePath: "FencedCode",
  keepDecorationOnUnfold: true,
  buildDecorations: (state, node) => {
    const parsed = parseFencedCode(state, node);
    if (!parsed) return undefined;

    if (!parsed.info.trim().toLowerCase().startsWith("mermaid")) return undefined;

    const body = parsed.source.trim();
    if (!body) return undefined;

    const fenceText = state.doc.sliceString(node.from, node.to);
    const widget = new MermaidWidget(body, fenceText);
    return Decoration.replace({ widget, block: true, inclusiveStart: true }).range(
      node.from,
      node.to,
    );
  },
});

const foldTreeSync = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      if (!update.docChanged && syntaxTree(update.state) !== syntaxTree(update.startState)) {
        setTimeout(() => {
          update.view.dispatch({ selection: update.view.state.selection });
        });
      }
    }
  },
);

export function mermaidDecorations() {
  return [mermaidFoldExtension, foldTreeSync];
}
