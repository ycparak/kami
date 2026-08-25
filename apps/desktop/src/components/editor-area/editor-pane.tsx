import type { EditorView } from "@codemirror/view";
import { ProseMarkEditor } from "./prosemark-editor";
import { FrontmatterPanel } from "./frontmatter-panel";
import { EditorScrollContainer } from "./editor-scroll-container";
import { EditorSearchOverview } from "./editor-search-overview";
import { SectionRail } from "./section-rail";
import { useCloseEditorSearchWhenInactive } from "./use-close-editor-search-when-inactive";
import { useEditorSettingsRef } from "./use-editor-settings";
import { useIsFileLoading } from "@/hooks/use-tabs";
import { memo, useCallback, useEffect, useRef, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function AsciiSpinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return <span>{SPINNER_FRAMES[frame]}</span>;
}

interface EditorPaneProps {
  path: string;
  isActive: boolean;
  tabId: string;
}

export const EditorPane = memo(function EditorPane({ path, isActive, tabId }: EditorPaneProps) {
  const isLoading = useIsFileLoading(path);
  const editorSettingsRef = useEditorSettingsRef();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  useCloseEditorSearchWhenInactive(isActive);

  const getScrollContainer = useCallback(() => scrollContainerRef.current, []);

  if (isLoading) {
    return (
      <div className="relative h-full">
        <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-muted)]">
          <AsciiSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <EditorScrollContainer ref={scrollContainerRef}>
        <div
          className="mx-auto w-full pb-6"
          style={{
            maxWidth: "var(--kami-editor-outer-width)",
            boxSizing: "border-box",
            paddingTop: "var(--kami-editor-top-pad)",
            paddingLeft: "var(--kami-editor-side-padding)",
            paddingRight: "var(--kami-editor-side-padding)",
          }}
        >
          <FrontmatterPanel filePath={path} />
        </div>
        <div ref={editorSettingsRef}>
          <ProseMarkEditor
            filePath={path}
            tabId={tabId}
            getScrollContainer={getScrollContainer}
            autoFocus={isActive}
            onViewChange={setEditorView}
          />
        </div>
      </EditorScrollContainer>
      <SectionRail filePath={path} view={editorView} scrollContainerRef={scrollContainerRef} />
      {isActive && <EditorSearchOverview scrollContainerRef={scrollContainerRef} />}
    </div>
  );
});
