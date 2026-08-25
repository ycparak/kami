import { mountMermaidCanvas } from "./mermaid-canvas";
import { renderMermaid } from "./mermaid-renderer";

export function openMermaidFullscreen(source: string, ariaLabel: string): void {
  const result = renderMermaid(source);
  if (!result.svg) return;

  const overlay = document.createElement("div");
  overlay.className = "cm-mermaid-fullscreen";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.tabIndex = -1;

  const host = document.createElement("div");
  host.className = "cm-mermaid-canvas cm-mermaid-fullscreen-canvas";
  host.tabIndex = 0;
  overlay.append(host);

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown, true);
    previouslyFocused?.focus({ preventScroll: true });

    overlay.classList.remove("is-open");
    let removed = false;
    const finalize = () => {
      if (removed) return;
      removed = true;
      overlay.remove();
    };
    host.addEventListener("transitionend", finalize, { once: true });
    setTimeout(finalize, 240);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKeyDown, true);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  mountMermaidCanvas(host, {
    svgHtml: result.svg,
    ariaLabel,
    onClose: close,
  });

  document.body.append(overlay);
  host.focus();

  void overlay.getBoundingClientRect();
  requestAnimationFrame(() => overlay.classList.add("is-open"));
}
