# Traycer Default Workflows — 拆解索引

本文件为 Traycer 三套官方 default-workflows 的逐字摘录索引。每套工作流的完整结构、step 表格、trigger 与 referred prompt 全文按 workflow 拆分到三个独立文件。

## 关键发现：workflow.json 不是 DAG

Traycer 的 `workflow.json` **只是注册表**——只列出 `entrypointCommand` 和 `commands` 文件清单，没有显式 step 节点 / edges / on_pass / on_fail / nextSteps。

真正的"DAG 编排信息"全部嵌在每个 `.md` 文件的 **YAML frontmatter** 里：

```yaml
---
id: <uuid>          # 仅 trigger_workflow 有
name: <name>        # 仅 trigger_workflow 有
description: <desc>
argumentHints:
  - <hint string>
selectedAgent: REVIEWER   # 可选，仅 validation 类 step 设定
nextSteps:
  - name: <next-command-name>
  - name: <another-next-command-name>
---
```

字段语义：

| 字段 | 含义 | 类比 |
|---|---|---|
| `nextSteps` | 当前 step 完成后允许的后续命令（多选 = 用户从中挑） | 多分支 edge |
| `selectedAgent: REVIEWER` | 该 step 用 reviewer 子 agent（区别于默认的 planner/architect） | 角色标记 |
| `argumentHints` | CLI 参数提示，给用户填 `/$command <args>` | 入参提示 |
| `description` | step 一句话定位 | 节点描述 |

**不存在** `condition: on_pass / on_fail / on_user_approval` 类显式条件 edge——所有"通过/失败"由 prompt 文本自身的 "Path A/B/C" 之类的分支语言决定，由 LLM 解释执行，不是引擎裁决。

**不存在** `modelProfileStepOverrides` 字段。

**不存在** `referredArtifacts` 字段（只有 commands 里的 referred prompt 文件清单）。

## 三套 workflow 概览

| Workflow | UUID | 入口 | step 数 | 反思/验证 step |
|---|---|---|---|---|
| Plan | `a3f1c8d2-7e45-4b9a-8c12-d9e6f0a2b5c7` | `trigger_workflow.md` | 1 trigger + 7 referred = 8 | plan-validation, implementation-validation, cross-artifact-validation（3 个 reviewer） |
| Refactoring | `c4e7a1b2-3d5f-6e8a-9b0c-1d2e3f4a5b6c` | `trigger-workflow.md` | 1 trigger + 5 referred = 6 | architecture-validation, verification（2 个 reviewer） |
| Agile | `271192ed-bf0b-4f43-9915-d77b9e7dbb04` | `trigger_workflow.md` | 1 trigger + 10 referred = 11 | prd-validation, architecture-validation, implementation-validation, cross-artifact-validation（4 个 reviewer） |

## 公共 step 模式（三套共享）

- **trigger** → 收集需求（无 artifact 写入，readonly）
- **plan / tech-plan / plan-refactor** → 主架构 step，draft 文档前先 interview
- **\*-validation** → reviewer 子 agent，stress-test，发现后用 interview 解决
- **ticket-breakdown** → 出 mermaid 依赖图 + coarse 粗粒度 ticket
- **execute** → batch 并行执行 + 4 个 finding 类（well/minor/drift/major）
- **implementation-validation / verification** → 实现完成后的最终 review
- **revise-requirements** → 需求变更后的级联更新（仅 plan + agile 有）
- **cross-artifact-validation** → 跨 spec 一致性（仅 plan + agile 有）

## 拆分文件

- `TRAYCER_WORKFLOW_PLAN.md` — Plan workflow（轻量通用）
- `TRAYCER_WORKFLOW_REFACTORING.md` — Refactoring workflow（带 invariants 安全约束）
- `TRAYCER_WORKFLOW_AGILE.md` — Agile workflow（PM + Architect 双轨制）

## "Plan 中心论"印证

三套 workflow 的入口节点都是**强制 interview 收集需求**——不允许直接跳到 plan/execute。Trigger step 反复强调：

> "The philosophy and goal of this workflow is alignment, coming to a set of decisions made together, not deliverables to rush toward."
> "Multiple rounds of clarification is normal and encouraged."
> "Questions are investments in correctness, not overhead."
> "This step is for REQUIREMENT GATHERING only. It is a readonly step in the sense that this doesn't involve creation of any artifacts."

这与 BestQ-A 的"显式 OpenAGI / 推理链可审计"哲学高度契合，可作为 CodeSail 的 trigger step 复刻范式。
