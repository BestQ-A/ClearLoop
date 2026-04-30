use std::sync::Arc;

use crate::llm::LlmProvider;
use crate::persistence::SqliteStore;
use crate::protocol::verification::*;

/// 验证引擎——基于 LLM 对计划/实现进行多维度审查
pub struct VerificationEngine {
    store: Arc<SqliteStore>,
}

impl VerificationEngine {
    pub fn new(store: Arc<SqliteStore>) -> Self {
        Self { store }
    }

    /// 对计划运行验证，生成验证线程和评论
    pub async fn verify(
        &self,
        params: VerifyParams,
        provider: Arc<dyn LlmProvider>,
    ) -> Result<VerifyResult, String> {
        let system_prompt = build_verification_system_prompt();
        let user_prompt = build_verification_user_prompt(&params.plan_json, &params.original_code);

        let raw = provider.chat(&system_prompt, &user_prompt).await?;
        let parsed = parse_verification_response(&raw, &params.plan_id)?;

        // 持久化验证线程
        for thread in &parsed.threads {
            self.store.save_verification_thread(thread)?;
        }

        Ok(parsed)
    }

    /// 修复后重新验证——在原线程基础上增量校验
    pub async fn re_verify(
        &self,
        params: ReVerifyParams,
        provider: Arc<dyn LlmProvider>,
    ) -> Result<VerifyResult, String> {
        // 获取原始线程
        let existing_threads = self.store.get_verification_threads(&params.thread_id)?;

        let system_prompt = build_re_verification_system_prompt();
        let user_prompt = build_re_verification_user_prompt(
            &params.updated_code,
            &existing_threads,
        );

        let raw = provider.chat(&system_prompt, &user_prompt).await?;

        // 复用 thread_id 作为 plan_id 进行解析
        let parsed = parse_verification_response(&raw, &params.thread_id)?;

        for thread in &parsed.threads {
            self.store.save_verification_thread(thread)?;
        }

        Ok(parsed)
    }

    /// 标记某条评论为已解决
    pub fn resolve_comment(&self, thread_id: &str, comment_id: &str) -> Result<(), String> {
        let threads = self.store.get_verification_threads(thread_id)?;

        for mut thread in threads {
            if thread.id == thread_id {
                let mut found = false;
                for comment in &mut thread.comments {
                    if comment.id == comment_id {
                        comment.is_applied = true;
                        found = true;
                    }
                }

                if !found {
                    return Err(format!(
                        "评论 '{}' 在线程 '{}' 中不存在",
                        comment_id, thread_id
                    ));
                }

                // 如果所有评论都已解决，将线程标记为 Resolved
                if thread.comments.iter().all(|c| c.is_applied) {
                    thread.status = ThreadStatus::Resolved;
                }

                self.store.save_verification_thread(&thread)?;
                return Ok(());
            }
        }

        Err(format!("线程 '{}' 不存在", thread_id))
    }

    /// 获取某个 plan_id 的所有验证线程
    pub fn get_threads(&self, plan_id: &str) -> Result<Vec<VerificationThread>, String> {
        self.store.get_verification_threads(plan_id)
    }
}

// ========== Prompt 构建 ==========

fn build_verification_system_prompt() -> String {
    r#"你是一个专业的代码验证专家。对给定的实现计划进行多维度审查。

## 审查维度
1. **Bug**：逻辑错误、边界条件、空值安全
2. **Security**：OWASP Top 10、输入验证、认证/授权
3. **Performance**：算法复杂度、不必要的分配、N+1 查询
4. **Clarity**：命名规范、注释充分、代码组织
5. **Architecture**：耦合度、内聚性、SOLID 原则

## 响应格式——严格返回有效 JSON：
{
  "thread_id": "生成的唯一线程 ID",
  "plan_id": "输入的 plan_id",
  "threads": [
    {
      "id": "线程 ID",
      "plan_id": "plan_id",
      "comments": [
        {
          "id": "评论 ID",
          "title": "[BUG/SECURITY/PERFORMANCE/CLARITY/ARCHITECTURE] 问题标题",
          "description": "详细描述",
          "severity": "MINOR/MAJOR/CRITICAL",
          "category": "BUG/SECURITY/PERFORMANCE/CLARITY/ARCHITECTURE",
          "referred_files": ["文件路径"],
          "prompt_for_ai_agent": "给编码代理的修复指令",
          "is_applied": false,
          "created_at": "ISO 时间戳"
        }
      ],
      "status": "UNRESOLVED",
      "created_at": "ISO 时间戳"
    }
  ],
  "overall_passed": true/false,
  "overall_score": 0.0-1.0,
  "prompt_for_ai_agent": "汇总的修复指令，或空字符串（如果通过）"
}

规则：
- overall_passed=true 仅当 overall_score >= 0.8
- 每个 CRITICAL 问题必须在 prompt_for_ai_agent 中给出修复指令
- 返回纯 JSON，不要包裹在 markdown 代码块中"#
        .into()
}

fn build_verification_user_prompt(plan_json: &str, original_code: &str) -> String {
    format!(
        "# 待验证的计划\n```json\n{}\n```\n\n# 原始代码\n```\n{}\n```\n\n请按照系统提示的格式进行验证。",
        plan_json, original_code
    )
}

fn build_re_verification_system_prompt() -> String {
    r#"你是一个代码验证专家。用户已修复了之前的问题，现在需要重新验证。

重点检查：
1. 之前的 CRITICAL/MAJOR 问题是否真正修复
2. 修复是否引入了新问题
3. 整体质量是否达标

响应格式与初次验证相同（JSON）。"#
        .into()
}

fn build_re_verification_user_prompt(
    updated_code: &str,
    existing_threads: &[VerificationThread],
) -> String {
    let threads_json = serde_json::to_string_pretty(existing_threads).unwrap_or_default();
    format!(
        "# 之前的验证结果\n```json\n{}\n```\n\n# 更新后的代码\n```\n{}\n```\n\n请重新验证。",
        threads_json, updated_code
    )
}

/// 解析 LLM 返回的验证 JSON
fn parse_verification_response(raw: &str, plan_id: &str) -> Result<VerifyResult, String> {
    // 尝试直接解析
    if let Ok(mut result) = serde_json::from_str::<VerifyResult>(raw) {
        result.plan_id = plan_id.to_string();
        return Ok(result);
    }

    // 去掉 markdown 代码块包裹
    let cleaned = raw
        .replace("```json", "")
        .replace("```", "")
        .trim()
        .to_string();

    if let Ok(mut result) = serde_json::from_str::<VerifyResult>(&cleaned) {
        result.plan_id = plan_id.to_string();
        return Ok(result);
    }

    // 解析失败——生成一个默认的失败结果
    let now = chrono::Utc::now().to_rfc3339();
    let thread_id = uuid::Uuid::new_v4().to_string();

    Ok(VerifyResult {
        thread_id: thread_id.clone(),
        plan_id: plan_id.to_string(),
        threads: vec![VerificationThread {
            id: thread_id,
            plan_id: plan_id.to_string(),
            comments: vec![VerificationComment {
                id: uuid::Uuid::new_v4().to_string(),
                title: "[CRITICAL] 验证响应解析失败".into(),
                description: format!(
                    "LLM 返回了无法解析的验证结果。原始响应前 500 字符：\n{}",
                    &raw[..raw.len().min(500)]
                ),
                severity: Severity::Critical,
                category: ReviewCategory::Bug,
                referred_files: vec![],
                prompt_for_ai_agent: "验证系统返回了无法解析的结果，请检查 LLM 提示词或手动审查。".into(),
                is_applied: false,
                created_at: now.clone(),
            }],
            status: ThreadStatus::Open,
            is_detached: false,
            created_at: now,
        }],
        overall_passed: false,
        overall_score: 0.0,
        prompt_for_ai_agent: "验证响应解析失败，无法自动验证。".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_verification_response_valid_json() {
        let json = r#"{
            "thread_id": "t-1",
            "plan_id": "p-1",
            "threads": [],
            "overall_passed": true,
            "overall_score": 0.95,
            "prompt_for_ai_agent": ""
        }"#;

        let result = parse_verification_response(json, "p-override").unwrap();
        assert!(result.overall_passed);
        assert_eq!(result.plan_id, "p-override");
        assert!(result.overall_score > 0.9);
    }

    #[test]
    fn test_parse_verification_response_with_markdown() {
        let json = "```json\n{\"thread_id\":\"t-1\",\"plan_id\":\"p-1\",\"threads\":[],\"overall_passed\":false,\"overall_score\":0.3,\"prompt_for_ai_agent\":\"fix bugs\"}\n```";

        let result = parse_verification_response(json, "p-2").unwrap();
        assert!(!result.overall_passed);
        assert_eq!(result.prompt_for_ai_agent, "fix bugs");
    }

    #[test]
    fn test_parse_verification_response_invalid_returns_fallback() {
        let result =
            parse_verification_response("this is not json at all", "p-3").unwrap();
        assert!(!result.overall_passed);
        assert_eq!(result.overall_score, 0.0);
        assert!(!result.threads.is_empty());
        assert_eq!(
            result.threads[0].comments[0].severity,
            Severity::Critical
        );
    }

    #[test]
    fn test_build_prompts_not_empty() {
        let sys = build_verification_system_prompt();
        assert!(sys.len() > 100);
        assert!(sys.contains("Bug"));
        assert!(sys.contains("Security"));

        let user = build_verification_user_prompt("{}", "fn main() {}");
        assert!(user.contains("待验证的计划"));
    }
}
