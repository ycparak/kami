import type { EditorView } from "@codemirror/view";
import { useProsemarkEditor } from "./use-prosemark-editor";
import "./prosemark-theme.css";

interface ProseMarkEditorProps {
  filePath: string;
  tabId: string;
  getScrollContainer?: () => HTMLElement | null;
  autoFocus?: boolean;
  onViewChange?: (view: EditorView | null) => void;
}

export function ProseMarkEditor({
  filePath,
  tabId,
  getScrollContainer,
  autoFocus,
  onViewChange,
}: ProseMarkEditorProps) {
  const editorRef = useProsemarkEditor(
    filePath,
    tabId,
    getScrollContainer,
    autoFocus ?? false,
    onViewChange,
  );
  return <div ref={editorRef} className="h-full" />;
}
