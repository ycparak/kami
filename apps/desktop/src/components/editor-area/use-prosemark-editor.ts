import { useRef, useCallback, useEffect } from "react";
import { EditorView, ViewPlugin, type ViewUpdate, drawSelection, keymap } from "@codemirror/view";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Extension,
  Prec,
  StateField,
  Transaction,
  type StateCommand,
} from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  forceParsing,
  syntaxHighlighting,
  syntaxTree,
  syntaxTreeAvailable,
} from "@codemirror/language";
import { search } from "@codemirror/search";
import {
  closeEditorSearch,
  findNextMatch,
  findPreviousMatch,
  openEditorSearch,
  useEditorSearchStore,
} from "./editor-search-store";
import { EDITOR_SAFE_SCROLL_MARGIN } from "./editor-scroll-container";

function invisibleSearchPanel() {
  const dom = document.createElement("div");
  dom.style.display = "none";
  return { dom };
}
import { tags } from "@lezer/highlight";
import { GFM } from "@lezer/markdown";
import { languages } from "@codemirror/language-data";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";
import { buildEditorBodyMenuItemsSpec, showNativeContextMenu } from "./editor-context-menu";
import {
  prosemarkBasicSetup,
  prosemarkBaseThemeSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@/lib/prosemark-core/main";
import { tableDecorations } from "./table-decorations";
import { htmlBlockDecorations, htmlBlockParserExtension } from "./html-block-decorations";
import { mermaidDecorations } from "./mermaid-decorations";
import { mathDecorations } from "./math-decorations";
import { dragFreezeExtensions } from "./drag-selection-gate";
import { clampSelectionToHeadings, headingDecorations } from "./heading-decorations";
import { imageSrcResolver } from "./image-src-resolver";
import { wikiLinkExtension } from "./wiki-link-extension";
import {
  markdownFormatting,
  formattingCommands,
  clearInlineFormatting,
  toggleFencedCodeBlock,
  insertTable,
  insertHorizontalRule,
  insertToday,
  insertNow,
} from "./markdown-formatting";
import * as editorApi from "@/hooks/editor-api";
import { useReloadVersion } from "@/hooks/use-tabs";
import { getWorkspaceRoot } from "@/hooks/workspace-api";
import { buildSlugIndex, parseDocumentHeadings } from "@/hooks/use-document-headings";
import type { DocumentHeading } from "@/hooks/use-document-headings";
import { parseDocument, parseFrontmatter } from "@/lib/frontmatter";
import {
  formatMarkdownDestination,
  getFileName,
  normalizeMarkdownDestination,
  resolveLinkTarget,
} from "@/lib/paths";
import { consumePendingAnchor, setPendingAnchor } from "@/lib/pending-anchor";
import { logTimeline, mark } from "@/lib/startup-metrics";
import * as tauri from "@/lib/tauri";
import { showAnchorWarning } from "./anchor-warning-store";
import { paneFocusUnfurl, setPaneFocused } from "./pane-focus-unfurl";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const VIEWPORT_OVERSHOOT = 2000;
const VIEWPORT_PARSE_BUDGET_MS = 50;
const IDLE_PARSE_BUDGET_MS = 50;
const IDLE_PARSE_TIMEOUT_MS = 2000;

function findScrollContainer(root: HTMLElement) {
  let node: HTMLElement | null = root.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

function findOuterScroller(view: EditorView): HTMLElement | null {
  let el: HTMLElement | null = view.dom.parentElement;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

const searchScrollIntent = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => {
    if (!tr.selection && !tr.docChanged) return value;
    return tr.isUserEvent("select.search") || tr.isUserEvent("input.replace");
  },
});

function resolveScrollContainer(root: HTMLElement, getScrollContainer?: () => HTMLElement | null) {
  return getScrollContainer?.() ?? findScrollContainer(root);
}

function restoreCursorPosition(view: EditorView, cursorPos: number) {
  let pos: number;
  if (cursorPos > 0) {
    pos = Math.min(cursorPos, view.state.doc.length);
  } else if (view.state.doc.toString() === "# ") {
    pos = 2;
  } else {
    pos = 0;
  }
  view.dispatch({ selection: { anchor: pos } });
}

function restoreScrollPosition(
  scrollContainer: HTMLElement,
  scrollPos: number,
  isDisposed: () => boolean,
) {
  requestAnimationFrame(() => {
    if (isDisposed()) return;

    scrollContainer.scrollTo(0, Math.max(0, scrollPos));
  });
}

function advanceViewportParse(view: EditorView, isDisposed: () => boolean) {
  const viewport = view.viewport;
  const target = Math.min(view.state.doc.length, viewport.to + VIEWPORT_OVERSHOOT);
  forceParsing(view, target, VIEWPORT_PARSE_BUDGET_MS);

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(
      () => {
        if (isDisposed()) return;
        forceParsing(view, view.state.doc.length, IDLE_PARSE_BUDGET_MS);
      },
      { timeout: IDLE_PARSE_TIMEOUT_MS },
    );
  }
}

const viewportParsePlugin = ViewPlugin.fromClass(
  class {
    private timeout = -1;

    update(update: ViewUpdate) {
      if (!update.viewportChanged || this.timeout >= 0) return;
      const view = update.view;
      const target = Math.min(view.state.doc.length, view.viewport.to + VIEWPORT_OVERSHOOT);
      if (syntaxTreeAvailable(view.state, target)) return;
      this.timeout = window.setTimeout(() => {
        this.timeout = -1;
        const upto = Math.min(view.state.doc.length, view.viewport.to + VIEWPORT_OVERSHOOT);
        if (!syntaxTreeAvailable(view.state, upto)) {
          forceParsing(view, upto, VIEWPORT_PARSE_BUDGET_MS);
        }
      }, 0);
    }

    destroy() {
      if (this.timeout >= 0) window.clearTimeout(this.timeout);
    }
  },
);

async function handleImagePaste(
  file: File,
  view: EditorView,
  filePath: string,
  isDisposed: () => boolean,
) {
  const buffer = await file.arrayBuffer();
  if (isDisposed()) return;
  if (buffer.byteLength > MAX_IMAGE_SIZE) return;

  const imageData = Array.from(new Uint8Array(buffer));
  const format = file.type.split("/")[1] || "png";
  const result = await tauri.saveClipboardImage(filePath, imageData, format);
  if (isDisposed()) return;
  const imageMarkdown = `![${file.name}](${formatMarkdownDestination(result.relative_path)})`;
  const cursor = view.state.selection.main.head;
  view.dispatch({ changes: { from: cursor, insert: imageMarkdown } });
}

function handleFrontmatterPaste(event: ClipboardEvent, view: EditorView, filePath: string) {
  const text = event.clipboardData?.getData("text/plain");
  if (!text) return false;

  const parsedFrontmatter = parseFrontmatter(text);
  if (parsedFrontmatter.frontmatter === null) return false;

  const parsedDocument = parseDocument(text);

  const file = editorApi.getOpenFile(filePath);
  if (!file || file.frontmatter !== null) return false;

  event.preventDefault();
  editorApi.updateFrontmatter(filePath, parsedFrontmatter.frontmatter);
  if (parsedDocument.body) {
    view.dispatch(view.state.replaceSelection(parsedDocument.body));
  }
  return true;
}

function handleFrontmatterStart(event: KeyboardEvent, view: EditorView, filePath: string) {
  if (event.key !== "-") return false;

  const { doc, selection } = view.state;
  const pos = selection.main.head;
  const firstLine = doc.line(1);

  if (pos !== firstLine.from + 2) return false;
  if (firstLine.text !== "--") return false;

  const file = editorApi.getOpenFile(filePath);
  if (!file || file.frontmatter !== null) return false;

  editorApi.updateFrontmatter(filePath, "");
  view.dispatch({
    changes: { from: firstLine.from, to: firstLine.from + 2 },
  });
  event.preventDefault();
  return true;
}

function getLinkHref(view: EditorView, pos: number) {
  let href: string | undefined;
  syntaxTree(view.state).iterate({
    from: pos,
    to: pos,
    enter(node) {
      if (node.name !== "Link") return;

      const cursor = node.node.cursor();
      if (!cursor.firstChild()) return false;

      do {
        if (cursor.name === "URL") {
          href = normalizeMarkdownDestination(view.state.doc.sliceString(cursor.from, cursor.to));
          return false;
        }
      } while (cursor.nextSibling());

      return false;
    },
  });
  return href;
}

function getRawUrl(view: EditorView, pos: number) {
  let href: string | undefined;
  syntaxTree(view.state).iterate({
    from: pos,
    to: pos,
    enter(node) {
      if (node.name !== "URL") return;
      if (node.node.parent?.name === "Link") return false;
      href = normalizeMarkdownDestination(view.state.doc.sliceString(node.from, node.to));
      return false;
    },
  });
  return href;
}

function findHeadingBySlug(content: string, slug: string): DocumentHeading | undefined {
  return buildSlugIndex(parseDocumentHeadings(content, { maxDepth: 6, slugDepth: 6 })).get(slug);
}

function scrollHeadingIntoView(
  view: EditorView,
  scroller: HTMLElement,
  heading: DocumentHeading,
  behavior: ScrollBehavior,
) {
  const pos = Math.min(heading.pos, view.state.doc.length);
  const block = view.lineBlockAt(pos);
  const screenY = view.documentTop + block.top;
  const scrollerRect = scroller.getBoundingClientRect();
  const delta = screenY - scrollerRect.top - EDITOR_SAFE_SCROLL_MARGIN;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const next = Math.max(0, Math.min(scroller.scrollTop + delta, max));
  scroller.scrollTo({ top: next, behavior });
}

function scrollSameDocAnchor(view: EditorView, filePath: string, anchor: string) {
  const file = editorApi.getOpenFile(filePath);
  const content = file?.content ?? view.state.doc.toString();
  const heading = findHeadingBySlug(content, anchor);
  if (!heading) {
    showAnchorWarning(`Heading "#${anchor}" not found in this document`);
    return;
  }
  const scroller = findOuterScroller(view);
  if (!scroller) return;
  scrollHeadingIntoView(view, scroller, heading, "smooth");
}

async function followLink(href: string | null, view: EditorView, filePath: string, tabId: string) {
  if (!href) return;

  const target = await resolveLinkTarget(href, filePath, getWorkspaceRoot(), (path) =>
    tauri.fileExists(path),
  );
  if (!target) return;

  if (target.kind === "same-doc-anchor") {
    scrollSameDocAnchor(view, filePath, target.anchor);
    return;
  }

  if (target.kind === "internal") {
    if (target.anchor && target.path === filePath) {
      scrollSameDocAnchor(view, filePath, target.anchor);
      return;
    }
    if (target.anchor) setPendingAnchor(target.path, target.anchor);
    await editorApi.navigateToFile(target.path, { fromTabId: tabId });
    return;
  }

  if (target.kind === "external-url") {
    await openUrl(target.url);
    return;
  }

  await openPath(target.path);
}

function linkHrefAt(event: MouseEvent, view: EditorView): string | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;

  const htmlAnchor = target.closest(".cm-html-block-widget a");
  if (htmlAnchor instanceof HTMLAnchorElement) {
    return htmlAnchor.getAttribute("href");
  }

  const renderedLink = target.closest(".cm-rendered-link");
  const isRenderedLink = renderedLink !== null;
  const isRawUrl = target.closest(".cm-url") !== null;
  if (!isRenderedLink && !isRawUrl) return null;

  if (renderedLink instanceof HTMLElement && renderedLink.dataset.href) {
    return renderedLink.dataset.href;
  }
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return null;
  return (isRenderedLink ? getLinkHref(view, pos) : getRawUrl(view, pos)) ?? null;
}

function linkNavigationExtension(
  getFilePath: () => string,
  getTabId: () => string,
  isDisposed: () => boolean,
): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (linkHrefAt(event, view) === null) return false;
        event.preventDefault();
        event.stopPropagation();
        return true;
      },
      click(event, view) {
        const href = linkHrefAt(event, view);
        if (href === null) return false;
        event.preventDefault();
        event.stopPropagation();
        void followLink(href, view, getFilePath(), getTabId()).catch((error) => {
          if (!isDisposed()) console.error("[editor] Failed to open link:", error);
        });
        return true;
      },
    }),
  );
}

function editorBodyContextMenuExtension(
  getFilePath: () => string,
  getTabId: () => string,
  isDisposed: () => boolean,
): Extension {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      event.preventDefault();

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      let linkHref: string | null = null;
      if (pos !== null) {
        linkHref = getLinkHref(view, pos) ?? getRawUrl(view, pos) ?? null;
      }

      const hasLink = linkHref !== null;
      const filePath = getFilePath();
      const tabId = getTabId();

      void showNativeContextMenu(
        buildEditorBodyMenuItemsSpec(
          {
            onCut: () => {
              const { from, to } = view.state.selection.main;
              if (from === to) return;
              void writeText(view.state.sliceDoc(from, to));
              view.dispatch({ changes: { from, to } });
            },
            onCopy: () => {
              const { from, to } = view.state.selection.main;
              if (from === to) return;
              void writeText(view.state.sliceDoc(from, to));
            },
            onPaste: () => {
              void readText().then((text) => {
                if (!text || isDisposed()) return;
                view.dispatch(view.state.replaceSelection(text));
              });
            },
            onPastePlain: () => {
              void readText().then((text) => {
                if (!text || isDisposed()) return;
                view.dispatch(view.state.replaceSelection(text));
              });
            },
            onSelectAll: () => {
              view.dispatch({
                selection: { anchor: 0, head: view.state.doc.length },
              });
            },
            onOpenLink: hasLink
              ? () => {
                  void followLink(linkHref, view, filePath, tabId);
                }
              : undefined,
            onCopyLink: hasLink
              ? () => {
                  void writeText(linkHref!);
                }
              : undefined,
            onRunCommand: (id: string) => {
              view.focus();
              const extraCommands: Record<string, StateCommand> = {
                clearInlineFormatting,
                toggleFencedCodeBlock,
                insertTable,
                insertHorizontalRule,
                insertToday,
                insertNow,
              };
              const registered = formattingCommands[id as keyof typeof formattingCommands];
              const cmd: StateCommand | undefined = registered ? registered.run : extraCommands[id];
              if (cmd) {
                cmd({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
              }
            },
          },
          hasLink,
        ),
      );

      return true;
    },
  });
}

function createEditorExtensions(
  getFilePath: () => string,
  getTabId: () => string,
  isDisposed: () => boolean,
  setupCompartment: Compartment,
): Extension[] {
  return [
    markdown({
      codeLanguages: languages,
      extensions: [GFM, prosemarkMarkdownSyntaxExtensions, htmlBlockParserExtension],
    }),
    linkNavigationExtension(getFilePath, getTabId, isDisposed),
    editorBodyContextMenuExtension(getFilePath, getTabId, isDisposed),
    setupCompartment.of(prosemarkBasicSetup()),
    dragFreezeExtensions,
    drawSelection(),
    prosemarkBaseThemeSetup(),
    search({ literal: true, createPanel: invisibleSearchPanel }),
    searchScrollIntent,
    EditorView.scrollHandler.of((view, range) => {
      if (!view.state.field(searchScrollIntent, false)) return false;
      const scroller = findOuterScroller(view);
      if (!scroller) return false;
      const block = view.lineBlockAt(range.head);
      const matchTop = view.documentTop + block.top;
      const matchBottom = view.documentTop + block.bottom;
      const scrollerRect = scroller.getBoundingClientRect();
      const contentTop = scrollerRect.top + scroller.clientTop;
      const safeTop = contentTop + EDITOR_SAFE_SCROLL_MARGIN;
      const safeBottom = contentTop + scroller.clientHeight - EDITOR_SAFE_SCROLL_MARGIN;
      let delta = 0;
      if (matchTop < safeTop) {
        delta = matchTop - safeTop;
      } else if (matchBottom > safeBottom && block.height <= safeBottom - safeTop) {
        delta = matchBottom - safeBottom;
      } else {
        return true;
      }
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const next = Math.max(0, Math.min(scroller.scrollTop + delta, max));
      if (Math.abs(scroller.scrollTop - next) < 1) return true;
      scroller.scrollTo({ top: next, behavior: "auto" });
      return true;
    }),
    Prec.highest(
      keymap.of([
        {
          key: "Mod-f",
          run: (view) => {
            openEditorSearch(view);
            return true;
          },
        },
        {
          key: "Mod-g",
          preventDefault: true,
          run: (view) => {
            if (!useEditorSearchStore.getState().isOpen) {
              openEditorSearch(view);
              return true;
            }
            return findNextMatch(view);
          },
          shift: (view) => {
            if (!useEditorSearchStore.getState().isOpen) {
              openEditorSearch(view);
              return true;
            }
            return findPreviousMatch(view);
          },
        },
      ]),
    ),
    Prec.highest(
      syntaxHighlighting(
        HighlightStyle.define([
          { tag: tags.strong, fontWeight: "600" },
          { tag: tags.heading, fontWeight: "600" },
          { tag: tags.heading1, fontWeight: "600" },
          { tag: tags.heading2, fontWeight: "600" },
          { tag: tags.heading3, fontWeight: "600" },
          { tag: tags.heading4, fontWeight: "600" },
          { tag: tags.heading5, fontWeight: "600" },
          { tag: tags.heading6, fontWeight: "600" },
        ]),
      ),
    ),
    viewportParsePlugin,
    tableDecorations(),
    htmlBlockDecorations(),
    mermaidDecorations(),
    mathDecorations(),
    headingDecorations,
    imageSrcResolver(getFilePath),
    wikiLinkExtension(getFilePath, getTabId, isDisposed),
    markdownFormatting,

    EditorView.updateListener.of((update) => {
      const isSwap = update.transactions.some((tr) => tr.isUserEvent("kami"));
      if (update.docChanged && !isSwap) {
        editorApi.updateContent(getFilePath(), update.state.doc.toString());
      }
      if (update.selectionSet && !isSwap) {
        editorApi.updateCursorPos(getFilePath(), update.state.selection.main.head);
      }
      if (update.docChanged || update.selectionSet) {
        useEditorSearchStore.getState().bumpDocVersion(update.view);
      }
    }),

    EditorView.domEventHandlers({
      paste(event, view) {
        if (handleFrontmatterPaste(event, view, getFilePath())) return true;

        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (!item.type.startsWith("image/")) continue;
          const imageFile = item.getAsFile();
          if (!imageFile) continue;

          event.preventDefault();
          void handleImagePaste(imageFile, view, getFilePath(), isDisposed).catch((error) => {
            console.error("[editor] Failed to paste image:", error);
          });
          return true;
        }

        return false;
      },
      keydown(event, view) {
        return handleFrontmatterStart(event, view, getFilePath());
      },
    }),

    paneFocusUnfurl,
  ];
}

export function useProsemarkEditor(
  filePath: string,
  tabId: string,
  getScrollContainer?: () => HTMLElement | null,
  autoFocus = false,
  onViewChange?: (view: EditorView | null) => void,
) {
  const viewRef = useRef<EditorView | null>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const disposedRef = useRef(false);
  const filePathRef = useRef(filePath);
  const tabIdRef = useRef(tabId);
  // eslint-disable-next-line react-doctor/no-event-handler
  const getScrollContainerRef = useRef(getScrollContainer);
  const autoFocusRef = useRef(autoFocus);
  const onViewChangeRef = useRef(onViewChange);
  const prevPathRef = useRef<string | null>(null);
  const prevReloadVersionRef = useRef<number>(0);
  const setupCompartmentRef = useRef<Compartment | null>(null);
  if (!setupCompartmentRef.current) setupCompartmentRef.current = new Compartment();

  const reloadVersion = useReloadVersion(filePath);

  filePathRef.current = filePath;
  tabIdRef.current = tabId;
  getScrollContainerRef.current = getScrollContainer;
  autoFocusRef.current = autoFocus;
  onViewChangeRef.current = onViewChange;

  const mountRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) {
      disposedRef.current = true;
      scrollCleanupRef.current?.();
      scrollCleanupRef.current = null;
      const view = viewRef.current;
      if (view) {
        closeEditorSearch({ view });
        view.destroy();
      }
      viewRef.current = null;
      onViewChangeRef.current?.(null);
      return;
    }

    if (viewRef.current) return;

    disposedRef.current = false;

    const currentPath = filePathRef.current;
    const file = editorApi.getOpenFile(currentPath);
    const initialContent = file?.content ?? "";

    const view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: initialContent,
        extensions: createEditorExtensions(
          () => filePathRef.current,
          () => tabIdRef.current,
          () => disposedRef.current,
          setupCompartmentRef.current!,
        ),
      }),
    });

    viewRef.current = view;
    prevPathRef.current = currentPath;
    prevReloadVersionRef.current = file?.reloadVersion ?? 0;
    onViewChangeRef.current?.(view);

    mark("editor-ready");
    logTimeline();

    advanceViewportParse(view, () => disposedRef.current);

    restoreCursorPosition(view, file?.cursorPos ?? 0);
    clampSelectionToHeadings(view);

    const scrollContainer = resolveScrollContainer(el, getScrollContainerRef.current);
    if (scrollContainer) {
      restoreScrollPosition(scrollContainer, file?.scrollPos ?? 0, () => disposedRef.current);

      const handleScroll = () => {
        editorApi.updateScrollPos(filePathRef.current, scrollContainer.scrollTop);
      };
      scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
      scrollCleanupRef.current = () => scrollContainer.removeEventListener("scroll", handleScroll);
    }

    if (autoFocusRef.current) view.focus();
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || disposedRef.current) return;
    setPaneFocused(view, autoFocus);
    if (autoFocus && !view.hasFocus) view.focus();
  }, [autoFocus]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || disposedRef.current) return;

    // eslint-disable-next-line react-doctor/no-event-handler
    const pathChanged = filePath !== prevPathRef.current;
    const reloaded = !pathChanged && reloadVersion !== prevReloadVersionRef.current;

    if (!pathChanged && !reloaded) return;

    prevPathRef.current = filePath;
    prevReloadVersionRef.current = reloadVersion;

    const file = editorApi.getOpenFile(filePath);
    const content = file?.content ?? "";

    const cursorPos = pathChanged
      ? Math.min(file?.cursorPos ?? 0, content.length)
      : Math.min(view.state.selection.main.head, content.length);

    if (pathChanged) {
      const setupCompartment = setupCompartmentRef.current!;
      view.dispatch({ effects: setupCompartment.reconfigure([]) });
      view.dispatch({ effects: setupCompartment.reconfigure(prosemarkBasicSetup()) });
    }

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      selection: EditorSelection.cursor(cursorPos),
      annotations: Transaction.addToHistory.of(false),
      userEvent: pathChanged ? "kami.swap" : "kami.reload",
      scrollIntoView: false,
    });

    if (pathChanged) {
      const scrollContainer = resolveScrollContainer(
        view.dom.parentElement!,
        getScrollContainerRef.current,
      );
      if (scrollContainer) {
        const pendingAnchor = consumePendingAnchor(filePath);
        if (pendingAnchor !== undefined) {
          const heading = findHeadingBySlug(content, pendingAnchor);
          if (heading) {
            requestAnimationFrame(() => {
              if (disposedRef.current) return;
              scrollHeadingIntoView(view, scrollContainer, heading, "auto");
            });
          } else {
            scrollContainer.scrollTo({ top: 0, behavior: "auto" });
            showAnchorWarning(`Heading "#${pendingAnchor}" not found in ${getFileName(filePath)}`);
          }
        } else {
          restoreScrollPosition(scrollContainer, file?.scrollPos ?? 0, () => disposedRef.current);
        }
      }
    }

    advanceViewportParse(view, () => disposedRef.current);
    clampSelectionToHeadings(view);
  }, [filePath, reloadVersion]);

  return mountRef;
}
