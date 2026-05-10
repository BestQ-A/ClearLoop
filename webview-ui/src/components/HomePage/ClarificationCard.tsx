// =====================================================================
// ClarificationCard
//
// 渲染 server 推过来的 OrderedField.interview，引导用户做单/多选回答。
// 视觉对齐 Traycer：左侧 4px 蓝竖条 + 浅蓝背景，区分于普通 markdown。
// 单选立即提交；多选展示 checkbox + "提交" 按钮。
// =====================================================================

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 协议契约（agent B 写完 types/Homepage.ts 后改为 import 即可）
export interface Question {
  id: string;
  title: string;
  description?: string;
  options: string[];
  multiselect: boolean;
}

interface Props {
  question: Question;
  onAnswer: (selected: string[]) => void;
}

const ClarificationCard = ({ question, onAnswer }: Props) => {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (opt: string) => {
    setSelected((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
    );
  };

  const submitMulti = () => {
    if (selected.length > 0) onAnswer(selected);
  };

  return (
    <div
      className="mt-1.5 rounded"
      style={{
        // 左竖条 + 浅蓝背景：用 border-left + 半透明背景模拟
        borderLeft: "4px solid var(--vscode-charts-blue, #3794ff)",
        // 浅蓝背景（通过较透明的 inputValidation.infoBackground 或 fallback）
        background:
          "var(--vscode-inputValidation-infoBackground, rgba(55, 148, 255, 0.08))",
        padding: "10px 12px",
      }}
    >
      <div className="text-[11px] font-semibold leading-snug mb-1">
        {question.title}
      </div>

      {question.description && (
        <div
          className="text-[10px] leading-snug mb-2"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children, ...props }) => (
                <p className="text-[10px] leading-snug mb-1" {...props}>
                  {children}
                </p>
              ),
              code: ({ children, ...props }) => (
                <code
                  className="bg-[var(--vscode-textCodeBlock-background)] px-1 rounded text-[10px] font-mono"
                  {...props}
                >
                  {children}
                </code>
              ),
            }}
          >
            {question.description}
          </ReactMarkdown>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {question.options.map((opt, idx) =>
          question.multiselect ? (
            <label
              key={`${question.id}-${idx}`}
              className="flex items-start gap-2 cursor-pointer text-[11px] leading-snug px-1.5 py-1 rounded"
              style={{
                background: selected.includes(opt)
                  ? "var(--vscode-list-activeSelectionBackground, rgba(55,148,255,0.15))"
                  : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="mt-[2px] cursor-pointer"
              />
              <span className="flex-1">{opt}</span>
            </label>
          ) : (
            <button
              key={`${question.id}-${idx}`}
              type="button"
              onClick={() => onAnswer([opt])}
              className="text-left cursor-pointer text-[11px] leading-snug rounded transition-colors"
              style={{
                padding: "6px 10px",
                border: "1px solid var(--vscode-panel-border)",
                background: "var(--vscode-input-background)",
                color: "var(--vscode-foreground)",
                borderRadius: "4px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "var(--vscode-list-hoverBackground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  "var(--vscode-input-background)";
              }}
            >
              {opt}
            </button>
          ),
        )}
      </div>

      {question.multiselect && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={submitMulti}
            disabled={selected.length === 0}
            className="text-[10px] px-2.5 py-1 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
              border: "none",
            }}
          >
            提交 ({selected.length})
          </button>
        </div>
      )}
    </div>
  );
};

export default ClarificationCard;
