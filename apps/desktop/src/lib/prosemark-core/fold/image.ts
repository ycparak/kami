import { Decoration, type EditorView, WidgetType } from "@codemirror/view";
import { normalizeMarkdownDestination } from "@/lib/paths";
import { foldableSyntaxFacet, selectAllDecorationsOnSelectExtension } from "./core";
import { iterChildren } from "../utils";

const imageHeightCache = new Map<string, number>();

export function attachStableImageHeight(
  image: HTMLImageElement,
  container: HTMLElement,
  cacheKey: string,
  view: EditorView,
): void {
  const cached = imageHeightCache.get(cacheKey);
  if (cached !== undefined) {
    image.style.height = `${cached}px`;
  }
  image.addEventListener("load", () => {
    image.style.height = "";
    const height = container.getBoundingClientRect().height;
    if (height > 0) {
      imageHeightCache.set(cacheKey, height);
    }
    view.requestMeasure();
  });
  image.addEventListener("error", () => {
    image.style.height = "";
    view.requestMeasure();
  });
}

class ImageWidget extends WidgetType {
  constructor(
    public url: string,
    public block?: boolean,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return this.url === other.url && this.block === other.block;
  }

  get estimatedHeight(): number {
    return imageHeightCache.get(this.url) ?? -1;
  }

  toDOM(view: EditorView) {
    const elem = document.createElement(this.block ? "div" : "span");
    elem.className = "cm-image";
    if (this.block) {
      elem.className += " cm-image-block";
    }
    const image = document.createElement("img");
    attachStableImageHeight(image, elem, this.url, view);
    image.src = this.url;
    elem.appendChild(image);
    return elem;
  }

  ignoreEvent(_event: Event) {
    return false;
  }
}

export const imageExtension = [
  foldableSyntaxFacet.of({
    nodePath: "Image",
    keepDecorationOnUnfold: true,
    buildDecorations: (state, node, selectionTouchesRange) => {
      let imageUrl: string | undefined;
      iterChildren(node.node.cursor(), (node) => {
        if (node.name === "URL") {
          imageUrl = normalizeMarkdownDestination(state.doc.sliceString(node.from, node.to));
        }

        return undefined;
      });

      if (imageUrl) {
        const line = state.doc.lineAt(node.from);
        const block = node.from == line.from && node.to == line.to;
        const widget = new ImageWidget(imageUrl, block);

        if (selectionTouchesRange) {
          return Decoration.widget({
            widget,
            block,
          }).range(node.to, node.to);
        } else {
          return Decoration.replace({
            widget,
            block,
          }).range(node.from, node.to);
        }
      }
    },
  }),
  selectAllDecorationsOnSelectExtension("cm-image"),
];

export const __testImage = {
  imageHeightCache,
};
