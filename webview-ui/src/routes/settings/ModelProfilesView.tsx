import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { getVsCodeApi } from "../../utils/vscode";
import { useI18n } from "../../i18n/I18nContext";

/**
 * ModelProfilesView —— Traycer §F Model Profiles 子页。
 *
 * Profile = "一组 step → model 的映射"，控制不同推理 step 用什么模型。
 *   - 3 个内置 ModelProfileType: FRONTIER / BALANCED / ECO
 *   - 用户可自定义 profile
 *
 * 11 个 step 来自 Traycer 推理流水线（plan + epic + verification 等）：
 *   planGeneration / planIteration
 *   review / reviewIteration
 *   verification / reVerification
 *   epicPlanning / epicReview
 *   phaseCreation / phaseIteration
 *   orchestration
 *
 * 后端契约：
 *   - request: { command: "modelProfiles.list" }
 *   - request: { command: "modelProfiles.upsert", payload: ModelProfile }
 *   - request: { command: "modelProfiles.activate", profileId }
 *   - request: { command: "modelProfiles.delete", profileId }
 */

type ModelProfileType = "FRONTIER" | "BALANCED" | "ECO" | "CUSTOM";

const STEPS = [
  "planGeneration",
  "planIteration",
  "review",
  "reviewIteration",
  "verification",
  "reVerification",
  "epicPlanning",
  "epicReview",
  "phaseCreation",
  "phaseIteration",
  "orchestration",
] as const;

type StepKey = (typeof STEPS)[number];

// 候选模型列表（mock；接通后从 backend 拉）
const MODEL_CHOICES = [
  "claude-opus-4.7",
  "claude-sonnet-4.6",
  "claude-haiku-4.5",
  "gpt-5-pro",
  "gpt-5",
  "gpt-5-mini",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "qwen3-coder-plus",
  "ollama:qwen2.5-coder",
];

interface ModelProfile {
  id: string;
  name: string;
  type: ModelProfileType;
  /** step → model id；缺省即继承 type 默认 */
  overrides: Partial<Record<StepKey, string>>;
}

const BUILTIN_PROFILES: ModelProfile[] = [
  {
    id: "frontier",
    name: "Frontier",
    type: "FRONTIER",
    overrides: Object.fromEntries(STEPS.map((s) => [s, "claude-opus-4.7"])) as Partial<Record<StepKey, string>>,
  },
  {
    id: "balanced",
    name: "Balanced",
    type: "BALANCED",
    overrides: Object.fromEntries(STEPS.map((s) => [s, "claude-sonnet-4.6"])) as Partial<Record<StepKey, string>>,
  },
  {
    id: "eco",
    name: "Eco",
    type: "ECO",
    overrides: Object.fromEntries(STEPS.map((s) => [s, "gpt-5-mini"])) as Partial<Record<StepKey, string>>,
  },
];

export default function ModelProfilesView() {
  const { t } = useI18n();
  // Step 的 human-readable 标签（i18n）
  const STEP_LABELS: Record<StepKey, string> = {
    planGeneration: t.modelStepPlanGeneration,
    planIteration: t.modelStepPlanIteration,
    review: t.modelStepReview,
    reviewIteration: t.modelStepReviewIteration,
    verification: t.modelStepVerification,
    reVerification: t.modelStepReVerification,
    epicPlanning: t.modelStepEpicPlanning,
    epicReview: t.modelStepEpicReview,
    phaseCreation: t.modelStepPhaseCreation,
    phaseIteration: t.modelStepPhaseIteration,
    orchestration: t.modelStepOrchestration,
  };
  const [profiles, setProfiles] = useState<ModelProfile[]>(BUILTIN_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>("balanced");
  const [editProfileId, setEditProfileId] = useState<string>("balanced");
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");

  const editProfile = useMemo(
    () => profiles.find((p) => p.id === editProfileId) ?? profiles[0],
    [profiles, editProfileId]
  );

  const handleActivate = (id: string) => {
    setActiveProfileId(id);
    getVsCodeApi().postMessage({ command: "modelProfiles.activate", profileId: id });
  };

  const handleDelete = (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile || profile.type !== "CUSTOM") return;
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    if (editProfileId === id) setEditProfileId("balanced");
    if (activeProfileId === id) setActiveProfileId("balanced");
    getVsCodeApi().postMessage({ command: "modelProfiles.delete", profileId: id });
  };

  const handleCreate = () => {
    if (!draftName.trim()) return;
    const id = `custom-${Date.now()}`;
    const next: ModelProfile = {
      id,
      name: draftName.trim(),
      type: "CUSTOM",
      overrides: {},
    };
    setProfiles((prev) => [...prev, next]);
    setEditProfileId(id);
    setDraftName("");
    setCreating(false);
    getVsCodeApi().postMessage({ command: "modelProfiles.upsert", payload: next });
  };

  const handleStepChange = (step: StepKey, model: string) => {
    if (!editProfile) return;
    const next: ModelProfile = {
      ...editProfile,
      overrides: { ...editProfile.overrides, [step]: model },
    };
    setProfiles((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    getVsCodeApi().postMessage({ command: "modelProfiles.upsert", payload: next });
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--vscode-foreground)]">{t.settingsTabModelProfiles}</h2>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">
            {t.modelProfilesDesc}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {profiles.length} {t.modelProfilesBadge}
        </Badge>
      </header>

      <Separator />

      <div className="grid grid-cols-[minmax(200px,260px)_1fr] gap-4">
        {/* 左侧：profile 列表 */}
        <nav className="space-y-2 min-w-0">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const isEditing = p.id === editProfileId;
            return (
              <div
                key={p.id}
                className={
                  "p-2 border rounded-md cursor-pointer transition-colors " +
                  (isEditing
                    ? "border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]"
                    : "border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]")
                }
                onClick={() => setEditProfileId(p.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate flex-1">
                    {p.name}
                  </span>
                  {isActive && (
                    <Badge variant="default" className="text-[10px] shrink-0">
                      {t.modelProfilesActive}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {p.type}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={isActive ? "secondary" : "outline"}
                    disabled={isActive}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleActivate(p.id);
                    }}
                  >
                    {isActive ? t.modelProfilesActive : t.modelProfilesActivate}
                  </Button>
                  {p.type === "CUSTOM" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id);
                      }}
                    >
                      {t.modelProfilesDelete}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* 新建 profile */}
          {creating ? (
            <div className="p-2 border border-[var(--vscode-panel-border)] rounded-md space-y-2">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t.modelProfilesNamePlaceholder}
                className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
                autoFocus
              />
              <div className="flex gap-1.5">
                <Button size="sm" onClick={handleCreate} disabled={!draftName.trim()}>
                  {t.modelProfilesCreate}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    setDraftName("");
                  }}
                >
                  {t.modelProfilesCancel}
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="w-full">
              {t.modelProfilesNew}
            </Button>
          )}
        </nav>

        {/* 右侧：step → model 编辑矩阵 */}
        <section className="p-3 border border-[var(--vscode-panel-border)] rounded-md min-w-0">
          {editProfile ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-[var(--vscode-foreground)] truncate">
                    {editProfile.name}
                  </div>
                  <div className="text-xs text-[var(--vscode-descriptionForeground)]">
                    {t.modelProfilesOverrideDesc}
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {editProfile.type}
                </Badge>
              </div>

              <div className="space-y-1.5">
                {STEPS.map((step) => (
                  <div
                    key={step}
                    className="grid grid-cols-[minmax(140px,1fr)_minmax(180px,2fr)] gap-2 items-center"
                  >
                    <label className="text-sm text-[var(--vscode-foreground)] truncate" title={step}>
                      {STEP_LABELS[step]}
                    </label>
                    <select
                      value={editProfile.overrides[step] ?? ""}
                      onChange={(e) => handleStepChange(step, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
                    >
                      <option value="">{t.modelProfilesInheritDefault}</option>
                      {MODEL_CHOICES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--vscode-descriptionForeground)]">{t.modelProfilesNoSelection}</div>
          )}
        </section>
      </div>
    </div>
  );
}
