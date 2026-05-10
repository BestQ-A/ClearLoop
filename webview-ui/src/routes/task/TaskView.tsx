import ConversationView from "../../components/HomePage/ConversationView";
import PlanView from "../../components/HomePage/PlanView";
import StreamingView from "../../components/HomePage/StreamingView";
import { useTraycerApp } from "../TraycerAppContext";

export default function TaskView() {
  const {
    conversation,
    isStreaming,
    streamEvents,
    planResult,
    isLoading,
    handleValidate,
    handleGenerate,
    selectedAgent,
    cancelStream,
  } = useTraycerApp();

  if (isStreaming) {
    return (
      <StreamingView
        events={streamEvents}
        isStreaming={isStreaming}
        onCancel={cancelStream}
      />
    );
  }

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

  if (planResult) {
    return (
      <PlanView
        plan={planResult}
        isLoading={isLoading}
        onValidate={handleValidate}
        onGenerate={() => handleGenerate(selectedAgent)}
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--vscode-descriptionForeground)]">
      Start a task from the composer below to generate a Traycer plan.
    </div>
  );
}
