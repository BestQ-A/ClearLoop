import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";

export interface PaletteCommand {
  id: string;
  label: string;
  description?: string;
  category?: string;
  shortcut?: string;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

const CommandPalette = ({ isOpen, onClose, commands }: Props) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Filter commands
  const filtered = query.trim() === ""
    ? commands
    : commands.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()) ||
        c.id.toLowerCase().includes(query.toLowerCase())
      );

  // Keep selectedIdx in bounds
  useEffect(() => {
    if (selectedIdx >= filtered.length) setSelectedIdx(0);
  }, [filtered.length, selectedIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[selectedIdx];
      if (cmd) {
        cmd.action();
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[90%] max-w-md bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-md shadow-2xl overflow-hidden"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.palettePlaceholder}
          className="w-full px-3 py-2.5 text-[12px] bg-transparent text-[var(--vscode-foreground)] border-b border-[var(--vscode-panel-border)] focus:outline-none placeholder:text-[var(--vscode-descriptionForeground)]"
        />
        <div className="max-h-[300px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-[10px] text-center text-[var(--vscode-descriptionForeground)]">
              {t.paletteNoMatch}
            </div>
          ) : (
            filtered.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => { cmd.action(); onClose(); }}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`w-full text-left px-3 py-2 transition-colors cursor-pointer ${
                  idx === selectedIdx
                    ? "bg-[var(--vscode-list-activeSelectionBackground)]"
                    : "hover:bg-[var(--vscode-list-hoverBackground)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {cmd.category && (
                        <span className="text-[8px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
                          {cmd.category}
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-[var(--vscode-foreground)] truncate">
                        {cmd.label}
                      </span>
                    </div>
                    {cmd.description && (
                      <div className="text-[9px] text-[var(--vscode-descriptionForeground)] mt-0.5 truncate">
                        {cmd.description}
                      </div>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-descriptionForeground)]">
                      {cmd.shortcut}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-[var(--vscode-panel-border)] flex items-center gap-3 text-[8px] text-[var(--vscode-descriptionForeground)]">
          <span>{t.paletteHintNavigate}</span>
          <span>{t.paletteHintSelect}</span>
          <span>{t.paletteHintClose}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
