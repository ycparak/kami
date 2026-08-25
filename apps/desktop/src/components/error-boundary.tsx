import { Component, type ErrorInfo, type ReactNode } from "react";
import * as editorApi from "@/hooks/editor-api";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    const activeFilePath = editorApi.getActiveFilePath();
    if (activeFilePath) editorApi.closeActiveTab();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-[#ff6b6b] bg-[#1e1e1e] font-mono text-[13px] h-screen overflow-auto">
          <h2 className="mb-4">Something went wrong</h2>
          <pre className="whitespace-pre-wrap break-words">{this.state.error.message}</pre>
          <pre className="whitespace-pre-wrap break-words mt-4 text-[#888] text-[13px]">
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-6 py-2 px-4 bg-[#333] text-[#ccc] border border-[#555] rounded"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
