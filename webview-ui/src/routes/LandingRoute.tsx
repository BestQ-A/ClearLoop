import { useState } from "react";
import WorkflowSelector from "../components/HomePage/WorkflowSelector";
import type { WorkflowType } from "../types/Homepage";

/**
 * Landing route ("/") —— Traycer "Create new task" 首页。
 *
 * Mock 内部状态用于 SCAFFOLD 期能渲染；真正的 onSelect 接线由
 * NAV / EPIC agent 在整合阶段通过 router state 重写。
 */
export default function LandingRoute() {
  const [active, setActive] = useState<WorkflowType>("plan");
  const [activeEntryStep, setActiveEntryStep] = useState<string | undefined>("trigger");

  return (
    <div className="h-full overflow-y-auto">
      <WorkflowSelector
        active={active}
        activeEntryStep={activeEntryStep}
        onSelect={(wf, step) => {
          setActive(wf);
          setActiveEntryStep(step);
        }}
      />
      {/* TODO(EDITOR agent): 下方 ChatInput / Editor 入口 */}
    </div>
  );
}
