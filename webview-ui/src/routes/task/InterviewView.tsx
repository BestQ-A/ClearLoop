import ConversationView from "../../components/HomePage/ConversationView";
import { useTraycerApp } from "../TraycerAppContext";

export default function InterviewView() {
  const {
    activeWorkflow,
    activeEntryStep,
    conversation,
    isStreaming,
    streamEvents,
    handleValidate,
    handleGenerate,
  } = useTraycerApp();

  if (conversation.length > 0) {
    return (
      <ConversationView
        turns={conversation}
        isStreaming={isStreaming}
        streamEvents={streamEvents}
        onValidate={handleValidate}
        onGenerate={handleGenerate}
      />
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-2xl rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] p-4">
        <div className="text-sm font-semibold text-[var(--vscode-foreground)]">
          Clarify the task
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          The composer below is ready for the {activeWorkflow} workflow
          {activeEntryStep ? ` at ${activeEntryStep}` : ""}. Add the outcome,
          constraints, and files to inspect before starting.
        </p>
      </div>
    </div>
  );
}
