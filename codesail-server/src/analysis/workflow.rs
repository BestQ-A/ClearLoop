//! Workflow surface for runtime callers.
//!
//! 1:1 对齐 Traycer 的 3 套官方 workflow（Plan / Refactoring / Agile）。
//! 所有 prompt 文本来自 `resources/workflows/<wf>-workflow/**/*.md` 的
//! markdown body（不再硬编码在源码里）。

use std::sync::OnceLock;

use crate::protocol::*;

use super::loader::{self, WorkflowTemplate};

/// 一次加载，全局缓存。
fn templates() -> &'static [WorkflowTemplate] {
    static CACHE: OnceLock<Vec<WorkflowTemplate>> = OnceLock::new();
    CACHE.get_or_init(loader::load_workflows).as_slice()
}

fn template_for(wf: &WorkflowType) -> Option<&'static WorkflowTemplate> {
    let dir_name = match wf {
        WorkflowType::Plan => "plan-workflow",
        WorkflowType::Refactoring => "refactoring-workflow",
        WorkflowType::Agile => "agile-workflow",
    };
    templates()
        .iter()
        .find(|t| t.root_dir.file_name().and_then(|s| s.to_str()) == Some(dir_name))
}

/// 把所有 workflow 投影成 wire-format 列表。
///
/// 找不到模板时，仍返回 3 个最小骨架，避免前端列表全空。
pub fn get_all_workflows() -> Vec<WorkflowInfo> {
    let mut out: Vec<WorkflowInfo> = templates()
        .iter()
        .map(loader::template_to_workflow_info)
        .collect();

    // 如果模板探测失败，给前端最低限度的 3 条占位（id + name 取自 Traycer manifest）
    if out.is_empty() {
        out = vec![
            WorkflowInfo {
                id: "a3f1c8d2-7e45-4b9a-8c12-d9e6f0a2b5c7".into(),
                name: "Traycer Plan Workflow".into(),
                description: "A lightweight, general-purpose workflow for planning and developing work through structured clarification.".into(),
                steps: vec![],
            },
            WorkflowInfo {
                id: "c4e7a1b2-3d5f-6e8a-9b0c-1d2e3f4a5b6c".into(),
                name: "Traycer Refactoring Workflow".into(),
                description: "A lean, collaborative workflow for systematic code refactoring.".into(),
                steps: vec![],
            },
            WorkflowInfo {
                id: "271192ed-bf0b-4f43-9915-d77b9e7dbb04".into(),
                name: "Traycer Agile Workflow".into(),
                description: "A collaborative workflow for developing features from idea to specs and tickets through structured clarification.".into(),
                steps: vec![],
            },
        ];
    }
    out
}

/// 与历史 API 兼容别名（旧调用方仍叫这个名字）。
pub fn get_all_workflows_with_templates() -> Vec<WorkflowInfo> {
    get_all_workflows()
}

/// 与历史 API 兼容：仍按 `WorkflowType` 返回单个 workflow 信息。
pub fn get_workflow(wf: &WorkflowType) -> WorkflowInfo {
    template_for(wf)
        .map(loader::template_to_workflow_info)
        .unwrap_or_else(|| WorkflowInfo {
            id: match wf {
                WorkflowType::Plan => "a3f1c8d2-7e45-4b9a-8c12-d9e6f0a2b5c7".into(),
                WorkflowType::Refactoring => "c4e7a1b2-3d5f-6e8a-9b0c-1d2e3f4a5b6c".into(),
                WorkflowType::Agile => "271192ed-bf0b-4f43-9915-d77b9e7dbb04".into(),
            },
            name: match wf {
                WorkflowType::Plan => "Traycer Plan Workflow".into(),
                WorkflowType::Refactoring => "Traycer Refactoring Workflow".into(),
                WorkflowType::Agile => "Traycer Agile Workflow".into(),
            },
            description: String::new(),
            steps: vec![],
        })
}

/// 该 workflow 主 plan-生成 step 的 prompt（=`plan.md` / `plan-refactor.md` / `tech-plan.md`）。
///
/// 找不到时返回兜底 instruction，确保 LLM 调用链不至于空 prompt。
pub fn plan_system_prompt(wf: &WorkflowType) -> String {
    let cmd = match wf {
        WorkflowType::Plan => "plan",
        WorkflowType::Refactoring => "plan-refactor",
        WorkflowType::Agile => "tech-plan",
    };
    template_for(wf)
        .and_then(|t| t.find_step(cmd))
        .map(|s| s.body.clone())
        .unwrap_or_else(|| FALLBACK_PLAN_PROMPT.to_string())
}

/// 该 workflow 验证 step 的 prompt（=`plan-validation.md` / `architecture-validation.md`）。
pub fn validation_system_prompt(wf: &WorkflowType) -> String {
    let cmd = match wf {
        WorkflowType::Plan => "plan-validation",
        WorkflowType::Refactoring => "architecture-validation",
        WorkflowType::Agile => "prd-validation",
    };
    template_for(wf)
        .and_then(|t| t.find_step(cmd))
        .map(|s| s.body.clone())
        .unwrap_or_else(|| FALLBACK_VALIDATION_PROMPT.to_string())
}

/// 兜底 prompt（仅在 .md 文件丢失时使用），保留最小 JSON 输出契约，供 main.rs 的 `parse_json` 仍然能解出 `PlanResult`。
static FALLBACK_PLAN_PROMPT: &str = r#"You are an expert software engineer acting as a planning layer for coding agents.

Return strictly valid JSON in this shape:
{
  "task_name": "...",
  "problem_context": "...",
  "user_experience": "...",
  "technical_approach": "...",
  "steps": [{"id":"step-1","title":"...","description":"...","status":"pending","dependencies":[]}],
  "file_changes": [{"file_status":"modified","file_path":"...","file_content":"..."}],
  "clarification": null
}
No markdown fences. No prose outside JSON."#;

static FALLBACK_VALIDATION_PROMPT: &str = r#"You are a plan validation expert.

Return strictly valid JSON in this shape:
{
  "plan_id": "...",
  "passed": true,
  "score": 0.0,
  "comments": [{"id":"v-1","title":"[MINOR/MAJOR/CRITICAL] ...","description":"...","severity":"MINOR","referred_files":[],"is_applied":false}],
  "prompt_for_ai_agent": ""
}
No markdown fences."#;
