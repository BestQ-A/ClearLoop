import { Loader2 } from "lucide-react";
import StreamingView from "../../components/HomePage/StreamingView";
import { useTraycerApp } from "../TraycerAppContext";

export default function LoadingView() {
  const { activeWorkflow, isStreaming, streamEvents, cancelStream } = useTraycerApp();

  if (isStreaming) {
    return (
      <StreamingView
        events={streamEvents}
        isStreaming={isStreaming}
        onCancel={cancelStream}
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-[var(--vscode-descriptionForeground)]">
        <Loader2 className="size-6 animate-spin" />
        <div className="text-xs font-semibold text-[var(--vscode-foreground)]">
          Starting {activeWorkflow} workflow
        </div>
        <div className="text-[11px]">
          Waiting for the local Traycer backend to return the first plan event.
        </div>
      </div>
    </div>
  );
}
