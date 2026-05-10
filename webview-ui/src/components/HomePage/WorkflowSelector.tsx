import type { WorkflowType } from "../../types/Homepage";
import { useI18n } from "../../i18n/I18nContext";
import TraycerLogoIcon from "../Brand/TraycerLogoIcon";
import { CircleCheck } from "lucide-react";

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
  badge?: string;
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

const WorkflowSelector = ({ active, onSelect, activeEntryStep }: Props) => {
  const { t } = useI18n();
  const cards = makeCards(t);
  return (
    <div className="flex flex-col items-center gap-2 px-4 pt-6 pb-4">
      <TraycerLogoIcon className="self-center text-[var(--traycer-logo-color)]" />

      <div className="mb-8 mt-2 flex flex-col items-center gap-2">
        <span className="font-heading text-pretty text-center text-[var(--vscode-foreground)] text-xl font-semibold">
          {t.landingTitle}
        </span>
        <span className="text-balance text-center font-normal text-[var(--vscode-descriptionForeground)] text-sm">
          {t.landingSubtitle}
        </span>
      </div>

      {/* 4 卡片 grid 2x2 */}
      <div className="grid grid-cols-2 w-full justify-center border-border rounded-lg gap-2">
        {cards.map((card) => {
          const isSelected =
            card.workflow === active &&
            (card.entryStep ? card.entryStep === activeEntryStep : true);

          return (
            <button
              key={card.title}
              onClick={() => onSelect(card.workflow, card.entryStep)}
              className={[
                "relative p-4 flex flex-col gap-y-1 cursor-pointer transition-colors w-full text-center items-center h-full border-border border rounded-md bg-transparent",
                isSelected
                  ? "bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]"
                  : "hover:bg-[var(--vscode-list-hoverBackground)]",
              ].join(" ")}
            >
              <div className="flex w-full items-center justify-center mb-1.5">
                <span className="text-sm font-semibold text-[var(--vscode-foreground)]">
                  {card.title}
                </span>
                {isSelected && (
                  <CircleCheck className="absolute right-3 top-3 text-green-500 size-4" />
                )}
                {card.badge && !isSelected && (
                  <span className="absolute right-3 top-3 rounded-full border border-[var(--vscode-panel-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--vscode-testing-iconPassed,#73c991)]">
                    {card.badge}
                  </span>
                )}
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
