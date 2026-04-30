//! Workflow template loader — Traycer schema 1:1.
//!
//! Each workflow lives in `resources/workflows/<workflow-name>-workflow/`:
//!
//! - `workflow.json` — registry: `{ id, name, description, entrypointCommand, commands: [..] }`
//! - `<entrypoint>.md` — entry-point command（trigger）；body 是 prompt，YAML frontmatter 含
//!   `id / name / description / argumentHints / nextSteps`
//! - `referred/*.md` — 其余 step；frontmatter 含
//!   `description / argumentHints / selectedAgent? / nextSteps`
//!
//! 不存在 DAG / on_pass / on_fail 等条件 edge——分支由 prompt 文本里
//! "Path A/B/C" 自然语言决定，由 LLM 解释。
//!
//! ## 探测路径
//! 按以下顺序尝试 `resources/workflows`，命中即停：
//! 1. CWD 下
//! 2. CWD 上一级
//! 3. exe 同目录
//! 4. exe 上一级

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// `workflow.json` 注册表条目（不是 DAG，是 manifest）。
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkflowManifest {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "entrypointCommand")]
    pub entrypoint_command: String,
    pub commands: Vec<String>,
}

/// 单个 `.md` 文件 YAML frontmatter 的字段集合。
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct StepFrontmatter {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, rename = "argumentHints")]
    pub argument_hints: Vec<String>,
    #[serde(default, rename = "selectedAgent")]
    pub selected_agent: Option<String>,
    #[serde(default, rename = "nextSteps")]
    pub next_steps: Vec<NextStep>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NextStep {
    pub name: String,
}

/// 单个 step 的完整定义（manifest + frontmatter + body）。
#[derive(Debug, Clone)]
pub struct WorkflowStepDef {
    /// 命令名（Traycer slash-command），等于不带 `.md` 的文件名 / 路径。
    pub command_name: String,
    /// .md 文件相对 workflow 目录的路径。
    pub relative_path: String,
    /// frontmatter 全字段。
    pub frontmatter: StepFrontmatter,
    /// 去掉 frontmatter 后的 markdown 正文（即 prompt）。
    pub body: String,
}

/// 完整 workflow 定义：manifest + 入口 step + 其余 step。
#[derive(Debug, Clone)]
pub struct WorkflowTemplate {
    pub manifest: WorkflowManifest,
    pub entrypoint: WorkflowStepDef,
    pub commands: Vec<WorkflowStepDef>,
    /// 该 workflow 所在目录（用于排查路径）。
    pub root_dir: PathBuf,
}

impl WorkflowTemplate {
    /// 按 command_name 查找 step（含 entrypoint）。
    pub fn find_step(&self, name: &str) -> Option<&WorkflowStepDef> {
        let trimmed = name.trim_end_matches(".md");
        if self.entrypoint.command_name == trimmed {
            return Some(&self.entrypoint);
        }
        self.commands
            .iter()
            .find(|s| s.command_name == trimmed)
    }
}

/// 探测 `resources/workflows` 目录。
fn locate_workflows_dir() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf));

    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from("resources/workflows"),
        PathBuf::from("./resources/workflows"),
        PathBuf::from("../resources/workflows"),
    ];
    if let Some(ref d) = exe_dir {
        candidates.push(d.join("resources/workflows"));
        if let Some(parent) = d.parent() {
            candidates.push(parent.join("resources/workflows"));
        }
    }
    candidates.into_iter().find(|p| p.exists())
}

/// 把一段 markdown 文本拆成 (frontmatter, body)。
///
/// 形如：
/// ```text
/// ---
/// key: value
/// ---
///
/// body...
/// ```
///
/// 找不到 frontmatter 时返回空 frontmatter + 整段 body。
fn split_frontmatter(content: &str) -> (StepFrontmatter, String) {
    if !content.starts_with("---") {
        return (StepFrontmatter::default(), content.to_string());
    }
    // 跳过开头的 "---" 行，找下一个 "---" 行作为 frontmatter 终结符
    let after_first = &content[3..];
    let after_first = after_first.strip_prefix('\r').unwrap_or(after_first);
    let after_first = after_first.strip_prefix('\n').unwrap_or(after_first);

    if let Some(end_offset) = after_first.find("\n---") {
        let yaml = &after_first[..end_offset];
        let mut rest = &after_first[end_offset + 4..];
        rest = rest.strip_prefix('\r').unwrap_or(rest);
        rest = rest.strip_prefix('\n').unwrap_or(rest);
        let fm: StepFrontmatter = serde_yaml::from_str(yaml).unwrap_or_default();
        return (fm, rest.to_string());
    }
    (StepFrontmatter::default(), content.to_string())
}

fn load_step(workflow_dir: &Path, rel: &str) -> Option<WorkflowStepDef> {
    let path = workflow_dir.join(rel);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to read step {}: {}", path.display(), e);
            return None;
        }
    };
    let (fm, body) = split_frontmatter(&content);
    let command_name = Path::new(rel)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| rel.to_string());
    Some(WorkflowStepDef {
        command_name,
        relative_path: rel.to_string(),
        frontmatter: fm,
        body,
    })
}

fn load_one(workflow_dir: &Path) -> Option<WorkflowTemplate> {
    let manifest_path = workflow_dir.join("workflow.json");
    let manifest_text = match std::fs::read_to_string(&manifest_path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to read {}: {}", manifest_path.display(), e);
            return None;
        }
    };
    let manifest: WorkflowManifest = match serde_json::from_str(&manifest_text) {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!("Failed to parse {}: {}", manifest_path.display(), e);
            return None;
        }
    };

    let entrypoint = load_step(workflow_dir, &manifest.entrypoint_command)?;
    let commands: Vec<WorkflowStepDef> = manifest
        .commands
        .iter()
        .filter_map(|rel| load_step(workflow_dir, rel))
        .collect();

    Some(WorkflowTemplate {
        manifest,
        entrypoint,
        commands,
        root_dir: workflow_dir.to_path_buf(),
    })
}

/// 扫描 `resources/workflows/*-workflow/` 加载所有 workflow。
pub fn load_workflows() -> Vec<WorkflowTemplate> {
    let Some(root) = locate_workflows_dir() else {
        tracing::debug!("No resources/workflows directory found");
        return Vec::new();
    };
    tracing::info!("Loading workflows from {}", root.display());

    let entries = match std::fs::read_dir(&root) {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!("Failed to read {}: {}", root.display(), e);
            return Vec::new();
        }
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if !path.join("workflow.json").exists() {
            continue;
        }
        if let Some(wf) = load_one(&path) {
            tracing::info!(
                "Loaded workflow '{}' ({} commands) from {}",
                wf.manifest.id,
                wf.commands.len(),
                path.display()
            );
            out.push(wf);
        }
    }
    out
}

/// 把 [`WorkflowTemplate`] 投影到对外的 [`crate::protocol::WorkflowInfo`]。
///
/// step 列表 = entrypoint + commands；step.id 用 command_name；step.name 优先用
/// frontmatter.name，否则 fallback 到 command_name；description 用 frontmatter.description。
pub fn template_to_workflow_info(t: &WorkflowTemplate) -> crate::protocol::WorkflowInfo {
    let mut steps = Vec::new();
    let mut push = |s: &WorkflowStepDef| {
        steps.push(crate::protocol::WorkflowStep {
            id: s.command_name.clone(),
            name: s
                .frontmatter
                .name
                .clone()
                .unwrap_or_else(|| s.command_name.replace(['-', '_'], " ")),
            description: s
                .frontmatter
                .description
                .clone()
                .unwrap_or_default(),
            status: crate::protocol::StepStatus::Pending,
        });
    };
    push(&t.entrypoint);
    for c in &t.commands {
        push(c);
    }

    crate::protocol::WorkflowInfo {
        id: t.manifest.id.clone(),
        name: t.manifest.name.clone(),
        description: t.manifest.description.clone(),
        steps,
    }
}
