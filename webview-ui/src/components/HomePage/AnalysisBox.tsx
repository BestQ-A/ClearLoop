import { useEffect, useRef, useState } from "react";
import { AnalysisResponse, ThinkingStep } from "../../types/Homepage";
import { FormButton } from "../ui/formFields/FormFields";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card/Card";
import { Clipboard, Check } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";

interface AnalysisBoxProps {
  thinkingSteps: ThinkingStep[];
  finalAnswer: AnalysisResponse | null;
  error: string;
  onClear: () => void;
  isLoading: boolean;
}

const AnalysisBox = ({
  thinkingSteps,
  finalAnswer,
  error,
  onClear,
  isLoading,
}: AnalysisBoxProps) => {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedStates, setCopiedStates] = useState<boolean[]>([]);

  // Scroll to bottom when content updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thinkingSteps, finalAnswer, error, isLoading]);

  // Initialize copied states when file_changes updates
  useEffect(() => {
    if (finalAnswer?.file_changes) {
      setCopiedStates(new Array(finalAnswer.file_changes.length).fill(false));
    }
  }, [finalAnswer?.file_changes]);

  // Extract language from file path and return content
  const extractCodeContent = (
    content: string,
    filePath: string
  ): { language: string; code: string } => {
    const extension = filePath.split(".").pop()?.toLowerCase() || "plaintext";
    const languageMap: { [key: string]: string } = {
      ts: "typescript",
      js: "javascript",
      py: "python",
      json: "json",
      css: "css",
      html: "html",
    };
    const language = languageMap[extension] || "plaintext";
    return { language, code: content };
  };

  // Handle copy to clipboard
  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedStates((prev) => {
        const newStates = [...prev];
        newStates[index] = true;
        return newStates;
      });
      setTimeout(() => {
        setCopiedStates((prev) => {
          const newStates = [...prev];
          newStates[index] = false;
          return newStates;
        });
      }, 5000);
    });
  };

  return (
    <div className="h-full bg-[var(--vscode-editor-background)] p-4 rounded-lg shadow-sm overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-[var(--vscode-foreground)] tracking-tight">
          {t.analysisResults}
        </h2>
        <FormButton
          onClick={onClear}
          className="px-4 py-2 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded-md hover:bg-[var(--vscode-button-hoverBackground)] transition-colors duration-200"
        >
          {t.btnClear}
        </FormButton>
      </div>
      <div ref={scrollRef} className="overflow-y-auto space-y-4">
        {isLoading && (
          <div className="flex justify-center items-center py-6">
            <svg
              className="animate-spin h-10 w-10 text-[var(--vscode-foreground)] opacity-80"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-20"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-80"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z"
              ></path>
            </svg>
          </div>
        )}
        {error && (
          <div className="p-4 bg-[var(--vscode-editorHoverWidget-background)] border-l-4 border-[var(--vscode-errorForeground)] rounded-md text-[var(--vscode-errorForeground)]">
            <span className="font-semibold">{t.errorLabel}</span> {error}
          </div>
        )}
        {thinkingSteps.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--vscode-foreground)]">
              {t.thinkingSteps}
            </h3>
            {thinkingSteps.map((step) => (
              <div
                key={step.step_number}
                className="p-4 bg-[var(--vscode-input-background)] rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="font-semibold text-[var(--vscode-foreground)]">
                  {step.step_number}. {step.step_title}
                </div>
                <div className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">
                  {step.step_description}
                </div>
              </div>
            ))}
          </div>
        )}
        {finalAnswer && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--vscode-foreground)]">
              {t.analysisSummary}
            </h3>
            <Card className="bg-[var(--vscode-input-background)] shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardHeader className="font-semibold text-[var(--vscode-foreground)]">
                {t.task}: {finalAnswer.task_name}
              </CardHeader>
              <CardTitle className="px-4 pb-2 text-[var(--vscode-foreground)]">
                <strong>{t.prTitle}:</strong> {finalAnswer.pr_title}
              </CardTitle>
              <CardDescription className="px-4 pb-4 text-[var(--vscode-descriptionForeground)]">
                <strong>{t.prDescription}:</strong> {finalAnswer.pr_description}
              </CardDescription>
            </Card>
            {finalAnswer.file_changes.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-[var(--vscode-foreground)]">
                  {t.fileChanges}
                </h3>
                {finalAnswer.file_changes.map((change, index) => (
                  <div
                    key={index}
                    className="p-4 bg-[var(--vscode-input-background)] rounded-lg shadow-sm"
                  >
                    <div className="font-semibold text-[var(--vscode-foreground)]">
                      {change.file_status.charAt(0).toUpperCase() +
                        change.file_status.slice(1)}{" "}
                      {t.analysisFileLabel} {change.file_path}
                    </div>
                    {change.file_content && (
                      <div className="relative mt-2">
                        <pre className="p-3 bg-[var(--vscode-editor-background)] rounded-md overflow-x-auto text-sm">
                          <code className="text-[var(--vscode-editor-foreground)]">
                            {
                              extractCodeContent(
                                change.file_content,
                                change.file_path
                              ).code
                            }
                          </code>
                        </pre>
                        <FormButton
                          onClick={() =>
                            handleCopy(
                              extractCodeContent(
                                change.file_content,
                                change.file_path
                              ).code,
                              index
                            )
                          }
                          className="absolute top-2 right-2 p-2 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded-md hover:bg-[var(--vscode-button-hoverBackground)] transition-colors duration-200"
                          title={
                            copiedStates[index]
                              ? t.copied
                              : t.copyToClipboard
                          }
                        >
                          {copiedStates[index] ? (
                            <Check size={16} />
                          ) : (
                            <Clipboard size={16} />
                          )}
                        </FormButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {finalAnswer.clarification && (
              <div className="p-4 bg-[var(--vscode-editorHoverWidget-background)] border-l-4 border-[var(--vscode-errorForeground)] rounded-md">
                <div className="font-semibold text-[var(--vscode-errorForeground)]">
                  {t.planClarificationNeeded}
                </div>
                <div className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">
                  {finalAnswer.clarification.message}
                </div>
                {finalAnswer.clarification.questions.length > 0 && (
                  <ul className="list-disc pl-6 mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
                    {finalAnswer.clarification.questions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisBox;
