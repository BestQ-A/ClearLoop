import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import WorkflowSelector from "../components/HomePage/WorkflowSelector";
import { useTraycerApp } from "./TraycerAppContext";
import type { WorkflowType } from "../types/Homepage";

/**
 * Landing：用户选 4 卡片之一后跳到 epic chat 多轮对话页 `/task/chat`。
 *
 * - 不改 WorkflowSelector 内部
 * - onSelect 回调在调用 setWorkflowSelection 之后再 navigate，把 workflow / step
 *   带到 query string，ChatView 从 URL 读取并初始化 ChatState
 */
export default function LandingRoute() {
  const navigate = useNavigate();
  const { activeWorkflow, activeEntryStep, setWorkflowSelection } = useTraycerApp();

  const handleSelect = useCallback(
    (workflow: WorkflowType, entryStep?: string) => {
      setWorkflowSelection(workflow, entryStep);
      const step = entryStep || "trigger";
      navigate(
        `/task/chat?workflow=${encodeURIComponent(workflow)}&step=${encodeURIComponent(step)}`,
      );
    },
    [navigate, setWorkflowSelection],
  );

  return (
    <div className="h-full overflow-y-auto">
      <WorkflowSelector
        active={activeWorkflow}
        activeEntryStep={activeEntryStep}
        onSelect={handleSelect}
      />
    </div>
  );
}
