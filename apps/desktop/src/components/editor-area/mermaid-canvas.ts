import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import DOMPurify from "dompurify";
import { baseSyntaxHighlights, generalSyntaxHighlights } from "@/lib/prosemark-core/main";

export const MERMAID_CANVAS_HEIGHT = 480;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const BUTTON_ZOOM_FACTOR = 1.2;
const KEY_ZOOM_FACTOR = 1.15;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const PINCH_ZOOM_SENSITIVITY = 0.01;
const KEY_PAN_STEP = 24;
const FIT_MARGIN_PX = 16;
const SOURCE_CHANGE_DEBOUNCE_MS = 150;
const SVG_NS = "http://www.w3.org/2000/svg";

const CODE_ICON_PATHS = ["m16 18 6-6-6-6", "m8 6-6 6 6 6", "m13 4-2 16"] as const;
const RESET_ICON_PATHS = ["M3 12a9 9 0 1 0 2.64-6.36L3 8", "M3 3v5h5"] as const;

export type MermaidCanvasOptions = {
  svgHtml: string;
  ariaLabel: string;
  source?: string;
  onSourceChange?: (next: string) => void;
  onExpand?: () => void;
  onClose?: () => void;
};

export type MermaidCanvasHandle = {
  updateSource(svgHtml: string, sourceText: string, error?: string): void;
  destroy(): void;
};

export function mountMermaidCanvas(
  host: HTMLElement,
  opts: MermaidCanvasOptions,
): MermaidCanvasHandle {
  host.replaceChildren();
  host.classList.add("cm-mermaid-canvas");
  host.tabIndex = 0;

  const editingEnabled = !!(opts.source !== undefined && opts.onSourceChange);

  const editorPanel = document.createElement("div");
  editorPanel.className = "cm-mermaid-canvas-editor";

  const viewport = document.createElement("div");
  viewport.className = "cm-mermaid-canvas-viewport";

  const stage = document.createElement("div");
  stage.className = "cm-mermaid-canvas-stage";
  stage.innerHTML = sanitizeSvgHtml(opts.svgHtml);
  stage.style.opacity = "0";

  let svg = stage.querySelector("svg") as SVGSVGElement | null;
  decorateSvg(svg, opts.ariaLabel);

  viewport.append(stage);
  if (editingEnabled) host.append(editorPanel);
  host.append(viewport);

  const topCluster = document.createElement("div");
  topCluster.className = "cm-mermaid-canvas-top";

  let editing = false;
  let innerView: EditorView | null = null;
  let currentSource = opts.source ?? "";
  let sourceChangeTimer: ReturnType<typeof setTimeout> | null = null;
  let editButton: HTMLButtonElement | null = null;

  const updateEditButton = (): void => {
    if (!editButton) return;
    const title = editing ? "Preview" : "Edit code";
    setCodeButtonIcon(editButton);
    editButton.title = title;
    editButton.setAttribute("aria-label", title);
    editButton.setAttribute("aria-pressed", String(editing));
    editButton.classList.toggle("is-active", editing);
  };

  const flushSourceChange = (): void => {
    sourceChangeTimer = null;
    if (!innerView || !opts.onSourceChange) return;
    const next = innerView.state.doc.toString();
    if (next === currentSource) return;
    currentSource = next;
    opts.onSourceChange(next);
  };

  const scheduleSourceChange = (): void => {
    if (sourceChangeTimer) clearTimeout(sourceChangeTimer);
    sourceChangeTimer = setTimeout(flushSourceChange, SOURCE_CHANGE_DEBOUNCE_MS);
  };

  const setEditing = (next: boolean): void => {
    if (editing === next) return;
    editing = next;
    host.classList.toggle("is-editing", editing);
    if (editing && !innerView && editingEnabled) {
      innerView = createInnerEditor(editorPanel, currentSource, scheduleSourceChange);
    }
    updateEditButton();
    requestAnimationFrame(fitToViewport);
    if (editing && innerView) innerView.focus();
    else host.focus();
  };

  if (editingEnabled) {
    editButton = makeButton("", "Edit code");
    editButton.classList.add("cm-mermaid-canvas-edit", "cm-mermaid-canvas-icon-btn");
    updateEditButton();
    editButton.addEventListener("click", () => setEditing(!editing));
    topCluster.append(editButton);
  }

  if (opts.onClose) {
    const closeButton = makeButton("✕", "Close fullscreen");
    closeButton.classList.add("cm-mermaid-canvas-icon-btn");
    closeButton.addEventListener("click", () => opts.onClose?.());
    topCluster.append(closeButton);
  }

  const zoomCluster = document.createElement("div");
  zoomCluster.className = "cm-mermaid-canvas-zoom";

  if (opts.onExpand) {
    const expandButton = makeButton("⛶", "Open in fullscreen");
    expandButton.classList.add("cm-mermaid-canvas-zoom-btn");
    expandButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      host.focus();
      opts.onExpand?.();
    });
    zoomCluster.append(expandButton);
  }

  const resetButton = makeButton("", "Reset zoom and pan");
  const zoomInButton = makeButton("+", "Zoom in");
  const zoomOutButton = makeButton("−", "Zoom out");
  resetButton.classList.add("cm-mermaid-canvas-zoom-btn");
  setResetButtonIcon(resetButton);
  zoomInButton.classList.add("cm-mermaid-canvas-zoom-btn");
  zoomOutButton.classList.add("cm-mermaid-canvas-zoom-btn");
  zoomCluster.append(resetButton, zoomInButton, zoomOutButton);

  host.append(topCluster, zoomCluster);

  const state = { zoom: 1, panX: 0, panY: 0 };
  let naturalW = 0;
  let naturalH = 0;

  function measureNatural(): void {
    if (!svg || naturalW > 0) return;
    const vb = svg.viewBox.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      naturalW = vb.width;
      naturalH = vb.height;
      return;
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      naturalW = rect.width;
      naturalH = rect.height;
    }
  }

  function applyTransform(): void {
    if (svg && naturalW > 0) {
      svg.style.width = `${naturalW * state.zoom}px`;
      svg.style.height = `${naturalH * state.zoom}px`;
    }
    stage.style.transform = `translate(${state.panX}px, ${state.panY}px)`;
  }

  function clampZoom(z: number): number {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  }

  function fitToViewport(): void {
    measureNatural();
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (naturalW <= 0 || naturalH <= 0 || vw <= 0 || vh <= 0) {
      applyTransform();
      return;
    }
    const fit = Math.min((vw - FIT_MARGIN_PX * 2) / naturalW, (vh - FIT_MARGIN_PX * 2) / naturalH);
    state.zoom = clampZoom(fit);
    state.panX = (vw - naturalW * state.zoom) / 2;
    state.panY = (vh - naturalH * state.zoom) / 2;
    applyTransform();
  }

  function zoomAt(clientX: number, clientY: number, factor: number): void {
    measureNatural();
    const rect = viewport.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const stageX = (localX - state.panX) / state.zoom;
    const stageY = (localY - state.panY) / state.zoom;
    const next = clampZoom(state.zoom * factor);
    if (next === state.zoom) return;
    state.zoom = next;
    state.panX = localX - stageX * next;
    state.panY = localY - stageY * next;
    applyTransform();
  }

  function zoomAtCenter(factor: number): void {
    const rect = viewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  resetButton.addEventListener("click", () => {
    fitToViewport();
    host.focus();
  });
  zoomInButton.addEventListener("click", () => {
    zoomAtCenter(BUTTON_ZOOM_FACTOR);
    host.focus();
  });
  zoomOutButton.addEventListener("click", () => {
    zoomAtCenter(1 / BUTTON_ZOOM_FACTOR);
    host.focus();
  });

  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = state.panX;
    dragStartPanY = state.panY;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("is-dragging");
    host.focus();
    e.preventDefault();
  });

  viewport.addEventListener("pointermove", (e) => {
    if (dragPointerId !== e.pointerId) return;
    state.panX = dragStartPanX + (e.clientX - dragStartX);
    state.panY = dragStartPanY + (e.clientY - dragStartY);
    applyTransform();
  });

  const endDrag = (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId) return;
    dragPointerId = null;
    viewport.classList.remove("is-dragging");
    if (viewport.hasPointerCapture(e.pointerId)) {
      viewport.releasePointerCapture(e.pointerId);
    }
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  // eslint-disable-next-line react-doctor/client-passive-event-listeners
  viewport.addEventListener(
    "wheel",
    (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      const sensitivity = e.ctrlKey && !e.metaKey ? PINCH_ZOOM_SENSITIVITY : WHEEL_ZOOM_SENSITIVITY;
      const factor = Math.exp(-e.deltaY * sensitivity);
      zoomAt(e.clientX, e.clientY, factor);
    },
    { passive: false },
  );

  host.addEventListener("keydown", (e) => {
    if (editing && editorPanel.contains(e.target as Node)) return;
    if (e.target instanceof HTMLButtonElement) return;
    let handled = true;
    switch (e.key) {
      case "ArrowUp":
        state.panY += KEY_PAN_STEP;
        applyTransform();
        break;
      case "ArrowDown":
        state.panY -= KEY_PAN_STEP;
        applyTransform();
        break;
      case "ArrowLeft":
        state.panX += KEY_PAN_STEP;
        applyTransform();
        break;
      case "ArrowRight":
        state.panX -= KEY_PAN_STEP;
        applyTransform();
        break;
      case "+":
      case "=":
        zoomAtCenter(KEY_ZOOM_FACTOR);
        break;
      case "-":
      case "_":
        zoomAtCenter(1 / KEY_ZOOM_FACTOR);
        break;
      case "0":
        fitToViewport();
        break;
      case "Enter":
        if (editingEnabled) setEditing(!editing);
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  requestAnimationFrame(() => {
    fitToViewport();
    stage.style.opacity = "1";
  });

  function showError(message: string): void {
    stage.innerHTML = "";
    stage.style.transform = "none";
    stage.style.opacity = "1";
    stage.style.width = "100%";
    stage.style.height = "100%";
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    const errEl = document.createElement("div");
    errEl.className = "cm-mermaid-canvas-error-msg";
    errEl.textContent = `Diagram error: ${message}`;
    stage.append(errEl);
    svg = null;
    naturalW = 0;
    naturalH = 0;
  }

  function updateSource(svgHtml: string, sourceText: string, error?: string): void {
    if (innerView && innerView.state.doc.toString() !== sourceText) {
      if (sourceChangeTimer) {
        clearTimeout(sourceChangeTimer);
        sourceChangeTimer = null;
      }
      innerView.dispatch({
        changes: { from: 0, to: innerView.state.doc.length, insert: sourceText },
      });
    }
    currentSource = sourceText;

    if (error) {
      showError(error);
      return;
    }

    stage.style.width = "";
    stage.style.height = "";
    stage.innerHTML = sanitizeSvgHtml(svgHtml);
    svg = stage.querySelector("svg") as SVGSVGElement | null;
    decorateSvg(svg, opts.ariaLabel);
    naturalW = 0;
    naturalH = 0;
    requestAnimationFrame(() => {
      fitToViewport();
      stage.style.opacity = "1";
    });
  }

  function destroy(): void {
    if (sourceChangeTimer) {
      clearTimeout(sourceChangeTimer);
      sourceChangeTimer = null;
    }
    innerView?.destroy();
    innerView = null;
  }

  return { updateSource, destroy };
}

function sanitizeSvgHtml(svgHtml: string): string {
  return DOMPurify.sanitize(svgHtml, { USE_PROFILES: { svg: true, svgFilters: true } });
}

function decorateSvg(svg: SVGSVGElement | null, ariaLabel: string): void {
  if (!svg) return;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ariaLabel);
}

function setCodeButtonIcon(button: HTMLButtonElement): void {
  setButtonIcon(button, CODE_ICON_PATHS);
}

function setResetButtonIcon(button: HTMLButtonElement): void {
  setButtonIcon(button, RESET_ICON_PATHS);
}

function setButtonIcon(button: HTMLButtonElement, paths: readonly string[]): void {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "cm-mermaid-canvas-button-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }

  button.replaceChildren(svg);
}

const MERMAID_KEYWORDS = new Set<string>([
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "gantt",
  "pie",
  "journey",
  "gitGraph",
  "mindmap",
  "timeline",
  "quadrantChart",
  "requirementDiagram",
  "xychart-beta",
  "xychart",
  "sankey-beta",
  "sankey",
  "block-beta",
  "block",
  "TD",
  "TB",
  "BT",
  "RL",
  "LR",
  "subgraph",
  "end",
  "direction",
  "class",
  "classDef",
  "click",
  "style",
  "linkStyle",
  "participant",
  "actor",
  "note",
  "loop",
  "alt",
  "else",
  "opt",
  "par",
  "critical",
  "break",
  "rect",
  "over",
  "autonumber",
  "activate",
  "deactivate",
  "title",
  "dateFormat",
  "axisFormat",
  "section",
]);

const mermaidStreamLang = StreamLanguage.define<Record<string, never>>({
  name: "mermaid",
  startState() {
    return {};
  },
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("%%")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^"[^"]*"/)) return "string";
    if (stream.match(/^(-->|---|-\.->|-\.-|==>|==|->|<-{1,2}|o--o?|x--x?)/)) return "operator";
    if (stream.match(/^[{}[\]()|]/)) return "punctuation";
    if (stream.match(/^[:;,]/)) return "punctuation";
    if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^[A-Za-z_][\w-]*/)) {
      const cur = stream.current();
      return MERMAID_KEYWORDS.has(cur) ? "keyword" : "variableName";
    }
    stream.next();
    return null;
  },
});

function createInnerEditor(
  panel: HTMLElement,
  initialSource: string,
  onChange: () => void,
): EditorView {
  return new EditorView({
    parent: panel,
    state: EditorState.create({
      doc: initialSource,
      extensions: [
        markdown({
          extensions: [GFM],
          codeLanguages: (info) =>
            info.trim().toLowerCase().startsWith("mermaid") ? mermaidStreamLang : null,
        }),
        baseSyntaxHighlights,
        generalSyntaxHighlights,
        drawSelection(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": {
            fontFamily:
              'var(--pm-code-font, var(--mono-font, "SF Mono", Menlo, Monaco, Consolas, monospace))',
          },
          "&.cm-focused": { outline: "none" },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange();
        }),
        EditorView.domEventHandlers({
          mousedown: (e) => {
            e.stopPropagation();
          },
          pointerdown: (e) => {
            e.stopPropagation();
          },
          keydown: (e) => {
            e.stopPropagation();
          },
        }),
      ],
    }),
  });
}

function makeButton(label: string, title: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  return b;
}
