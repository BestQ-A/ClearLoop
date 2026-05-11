import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, RefreshCw, Save } from "lucide-react";
import { useTraycerApp } from "./TraycerAppContext";

type MemoryReview = {
  path: string;
  title: string;
  createdAt: string;
  sourceCandidate: string;
  sourceRun: string;
  decision: string;
  acceptedBy: string;
  humanReviewNote: string;
  reusableClaim: string;
  applicabilityConditions: string;
  successFailureBoundary: string;
  reviewChecklist: string;
  sourceCandidateSnapshot: string;
  raw: string;
  updatedAt?: string;
};

type MemoryReviewMessage = {
  command?: string;
  data?: unknown;
  text?: string;
};

const decisionOptions = ["pending", "accepted", "rejected"] as const;

function basename(value: string): string {
  return value.split(/[\\/]/).pop() || value;
}

function isReview(value: unknown): value is MemoryReview {
  return Boolean(value && typeof value === "object" && "path" in value);
}

function isReviewList(value: unknown): value is MemoryReview[] {
  return Array.isArray(value);
}

export default function MemoryReviewsView() {
  const { sendToExtension } = useTraycerApp();
  const [reviews, setReviews] = useState<MemoryReview[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [detail, setDetail] = useState<MemoryReview | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedReview = useMemo(
    () => reviews.find((review) => review.path === selectedPath),
    [reviews, selectedPath],
  );

  const refresh = useCallback(() => {
    setError("");
    sendToExtension("memoryReviews.list");
  }, [sendToExtension]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<MemoryReviewMessage>) => {
      const { command, data, text } = event.data ?? {};
      switch (command) {
        case "memoryReviews.list":
          if (isReviewList(data)) {
            setReviews(data);
            if (!selectedPath && data[0]) {
              setSelectedPath(data[0].path);
              sendToExtension("memoryReviews.read", { path: data[0].path });
            }
          }
          break;
        case "memoryReviews.detail":
          if (isReview(data)) {
            setDetail(data);
            setSelectedPath(data.path);
          }
          break;
        case "memoryReviews.saved":
          setStatus("Saved");
          break;
        case "memoryReviews.promoted":
          setStatus("Promoted");
          break;
        case "memoryReviews.error":
          setError(String(text || data || "Memory review action failed"));
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [selectedPath, sendToExtension]);

  const selectReview = useCallback(
    (reviewPath: string) => {
      setSelectedPath(reviewPath);
      setStatus("");
      setError("");
      sendToExtension("memoryReviews.read", { path: reviewPath });
    },
    [sendToExtension],
  );

  const updateDetail = useCallback((patch: Partial<MemoryReview>) => {
    setDetail((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const save = useCallback(() => {
    if (!detail) {
      return;
    }
    setStatus("");
    setError("");
    sendToExtension("memoryReviews.save", detail);
  }, [detail, sendToExtension]);

  const promote = useCallback(() => {
    if (!detail) {
      return;
    }
    setStatus("");
    setError("");
    sendToExtension("memoryReviews.promote", { path: detail.path });
  }, [detail, sendToExtension]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(160px,0.42fr)_minmax(260px,1fr)] overflow-hidden">
      <aside className="min-h-0 border-r border-border pr-2">
        <div className="flex h-10 items-center justify-between gap-2 border-b border-border">
          <div className="min-w-0 text-xs font-semibold">Memory reviews</div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center border border-border bg-transparent"
            title="Refresh"
            aria-label="Refresh"
            onClick={refresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="h-[calc(100%-2.5rem)] overflow-y-auto py-2">
          {reviews.length === 0 ? (
            <div className="px-1 text-[11px] text-text-secondary">No review records.</div>
          ) : (
            <div className="space-y-1">
              {reviews.map((review) => (
                <button
                  key={review.path}
                  type="button"
                  onClick={() => selectReview(review.path)}
                  className={`w-full border border-border bg-transparent px-2 py-2 text-left text-[11px] ${
                    selectedPath === review.path ? "outline outline-1 outline-[var(--vscode-focusBorder)]" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate font-medium">{basename(review.title)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-text-secondary">
                    <span className="truncate">{review.decision || "pending"}</span>
                    <span className="shrink-0">{review.updatedAt ? new Date(review.updatedAt).toLocaleDateString() : ""}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="min-h-0 overflow-y-auto pl-3 pr-1">
        <div className="sticky top-0 z-10 flex min-h-10 items-center justify-between gap-2 border-b border-border bg-[var(--vscode-editor-background)]">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{detail ? basename(detail.path) : "Review"}</div>
            <div className="truncate text-[10px] text-text-secondary">{selectedReview?.sourceRun || detail?.sourceRun || ""}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 border border-border bg-transparent px-2 text-[11px]"
              disabled={!detail}
              onClick={save}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 border border-border bg-transparent px-2 text-[11px]"
              disabled={!detail || detail.decision !== "accepted"}
              onClick={promote}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Promote
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-2 border border-[var(--vscode-inputValidation-errorBorder,#be1100)] px-2 py-1.5 text-[11px]">
            {error}
          </div>
        )}
        {status && !error && (
          <div className="mt-2 border border-[var(--vscode-focusBorder)] px-2 py-1.5 text-[11px]">
            {status}
          </div>
        )}

        {detail ? (
          <div className="space-y-3 py-3">
            <div className="grid grid-cols-3 gap-1">
              {decisionOptions.map((decision) => (
                <button
                  key={decision}
                  type="button"
                  onClick={() => updateDetail({ decision })}
                  className={`h-8 border border-border bg-transparent text-[11px] ${
                    detail.decision === decision ? "outline outline-1 outline-[var(--vscode-focusBorder)]" : ""
                  }`}
                >
                  {decision}
                </button>
              ))}
            </div>

            <label className="block text-[11px]">
              <span className="mb-1 block text-text-secondary">Accepted by</span>
              <input
                className="h-8 w-full px-2 text-[12px]"
                value={detail.acceptedBy}
                onChange={(event) => updateDetail({ acceptedBy: event.target.value })}
              />
            </label>

            <label className="block text-[11px]">
              <span className="mb-1 block text-text-secondary">Human Review Note</span>
              <textarea
                className="min-h-20 resize-y text-[12px]"
                value={detail.humanReviewNote}
                onChange={(event) => updateDetail({ humanReviewNote: event.target.value })}
              />
            </label>

            <label className="block text-[11px]">
              <span className="mb-1 block text-text-secondary">Reusable Claim</span>
              <textarea
                className="min-h-24 resize-y text-[12px]"
                value={detail.reusableClaim}
                onChange={(event) => updateDetail({ reusableClaim: event.target.value })}
              />
            </label>

            <label className="block text-[11px]">
              <span className="mb-1 block text-text-secondary">Applicability Conditions</span>
              <textarea
                className="min-h-28 resize-y text-[12px]"
                value={detail.applicabilityConditions}
                onChange={(event) => updateDetail({ applicabilityConditions: event.target.value })}
              />
            </label>

            <label className="block text-[11px]">
              <span className="mb-1 block text-text-secondary">Success And Failure Boundary</span>
              <textarea
                className="min-h-28 resize-y text-[12px]"
                value={detail.successFailureBoundary}
                onChange={(event) => updateDetail({ successFailureBoundary: event.target.value })}
              />
            </label>

            <div className="border-t border-border pt-3 text-[10px] text-text-secondary">
              <div className="truncate">Candidate: {detail.sourceCandidate}</div>
              <div className="mt-1 truncate">Run: {detail.sourceRun}</div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-[11px] text-text-secondary">Select a review record.</div>
        )}
      </section>
    </div>
  );
}
