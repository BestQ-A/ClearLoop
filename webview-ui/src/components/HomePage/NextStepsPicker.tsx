// =====================================================================
// NextStepsPicker
//
// 渲染来自 server 的 OrderedField.nextSteps 选项：每行一个按钮，
// 点击触发 onPick(name)。视觉风格对齐 Traycer 原版（垂直按钮列，
// hover 高亮，VS Code 主题变量驱动）。
//
// 注：按钮文本由 server 决定，已是中性短语，**不接 i18n**。
// =====================================================================

// 协议契约（与 agent B 写入 types/Homepage.ts 的定义保持一致）
// agent B 写完后切换到 import 即可。
export interface NextStepOption {
  name: string;
  description?: string;
}

interface Props {
  options: NextStepOption[];
  onPick: (name: string) => void;
}

const NextStepsPicker = ({ options, onPick }: Props) => {
  if (!options || options.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-1.5 w-full">
      {options.map((opt, idx) => (
        <button
          key={`${opt.name}-${idx}`}
          type="button"
          onClick={() => onPick(opt.name)}
          className="text-left rounded cursor-pointer transition-colors w-full"
          style={{
            padding: "8px 12px",
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
          <div className="text-[11px] font-semibold leading-tight">
            {opt.name}
          </div>
          {opt.description && (
            <div
              className="text-[10px] mt-0.5 leading-snug"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              {opt.description}
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

export default NextStepsPicker;
