import type { WorkflowType } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";

/**
 * Traycer "What can I help you build today?" 4 卡片选择器。
 *
 * 1:1 抄自 Traycer commentNavigator Landing：
 * - 4 张卡：Epic / Phases / Plan / Review（Refactor 不在首页）
 * - 标题 `font-heading text-pretty text-center text-text-primary text-xl font-semibold` →
 *   "What can I help you build today?"
 * - 副标题 `text-balance text-center font-normal text-textSecondary` →
 *   "Create new code, add features, or fix issues—let's make it happen."
 *   （注意 em dash `—`，不是 ` - ` 也不是空格 hyphen 空格）
 * - 卡片 `p-4 border-border rounded-md`，激活态 `bg-vscode-input-background` +
 *   右上 `CircleCheck size-4 text-green-500`（lucide）
 * - Epic 卡（promo 期）右上挂绿色 `Free` 徽章
 * - 后端 workflow 只有 3 个：plan / refactoring / agile。
 *   Epic / Phases 都映射到 agile，区别只是入口 step（epic-brief vs tech-plan）。
 */

interface CardSpec {
  /** 显示名 */
  title: string;
  /** 副标题描述 */
  desc: string;
  /** 后端 workflow 类型 */
  workflow: WorkflowType;
  /** 入口 step（启动哪个命令） */
  entryStep?: string;
}

type Translations = ReturnType<typeof useI18n>["t"];

function makeCards(t: Translations): CardSpec[] {
  return [
    {
      title: t.landingCardEpicTitle,
      desc: t.landingCardEpicDesc,
      workflow: "agile",
      entryStep: "trigger",
    },
    {
      title: t.landingCardPhasesTitle,
      desc: t.landingCardPhasesDesc,
      workflow: "agile",
      entryStep: "tech-plan",
    },
    {
      title: t.landingCardPlanTitle,
      desc: t.landingCardPlanDesc,
      workflow: "plan",
      entryStep: "trigger",
    },
    {
      title: t.landingCardReviewTitle,
      desc: t.landingCardReviewDesc,
      workflow: "plan",
      entryStep: "implementation-validation",
    },
  ];
}

interface Props {
  active: WorkflowType;
  onSelect: (wf: WorkflowType, entryStep?: string) => void;
  /** 当前选中的 entry step（用于在 Epic / Phases 之间区分） */
  activeEntryStep?: string;
}

/** 内联 CircleCheck（lucide-style，size-4） */
const CircleCheck = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const WorkflowSelector = ({ active, onSelect, activeEntryStep }: Props) => {
  const { t } = useI18n();
  const cards = makeCards(t);
  return (
    <div className="flex flex-col items-center gap-2 px-4 pt-6 pb-4">
      {/* Logo placeholder（Traycer 这里挂 TraycerLogoIcon 340x340 mask SVG，CodeSail 不抄 logo） */}

      {/* 标题 + 副标题 */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <span className="font-heading text-pretty text-center text-[var(--vscode-foreground)] text-xl font-semibold">
          {t.landingTitle}
        </span>
        <span className="text-balance text-center font-normal text-[var(--vscode-descriptionForeground)] text-sm">
          {t.landingSubtitle}
        </span>
      </div>

      {/* 4 卡片 grid 2x2 */}
      <div className="grid grid-cols-2 gap-2 w-full">
        {cards.map((card) => {
          const isSelected =
            card.workflow === active &&
            (card.entryStep ? card.entryStep === activeEntryStep : true);

          return (
            <button
              key={card.title}
              onClick={() => onSelect(card.workflow, card.entryStep)}
              className={[
                "relative text-left p-4 rounded-md border transition-colors cursor-pointer",
                isSelected
                  ? "border-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)]"
                  : "border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] hover:border-[var(--vscode-focusBorder)]",
              ].join(" ")}
            >
              {/* 标题行：title + 右上角 CircleCheck（激活时） + Free 徽章 */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-[var(--vscode-foreground)]">
                  {card.title}
                </span>
                <div className="flex items-center gap-1">
                  {isSelected && <CircleCheck className="text-green-500 size-4" />}
                </div>
              </div>
              <p className="text-xs text-[var(--vscode-descriptionForeground)] leading-relaxed">
                {card.desc}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default WorkflowSelector;
