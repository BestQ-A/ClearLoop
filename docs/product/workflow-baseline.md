---
title: Workflow Baseline
recorded_at: 2026-05-10T00:00:00+08:00
scope: product-protocol
---

# Workflow Baseline

ClearLoop treats planning, implementation, and verification as a baseline software engineering loop. This is not a product clone or a proprietary workflow. It is the common structure of careful engineering made explicit for AI coding agents.

## Baseline Loop

```text
intent
  -> clarification
  -> relevant context
  -> causal hypothesis
  -> plan
  -> review
  -> breakdown
  -> controlled execution
  -> evidence capture
  -> verification
  -> memory gate
```

The loop can be shorter for small work, but it should not lose its evidence boundary. A trivial edit may compress clarification, plan, and breakdown into one record. A risky change should expand review, verification, and memory gates.

## Stage Contracts

| Stage | Purpose | Required record |
|---|---|---|
| `intent` | State what the human wants | task title, user wording, acceptance target |
| `clarification` | Remove ambiguity before execution | questions, answers, assumptions |
| `relevant_context` | Identify what matters | files, symbols, docs, logs, prior runs |
| `causal_hypothesis` | Explain why the context implies action | suspected cause, expected effect, uncertainty |
| `plan` | Choose a small reversible path | steps, constraints, risk notes |
| `review` | Stress-test the plan before work | findings, blockers, changes to plan |
| `breakdown` | Convert the plan into executable units | tickets, dependencies, owner/agent |
| `execution` | Run the work under control | agent, commands, changed files, outputs |
| `evidence` | Capture what actually happened | logs, diffs, screenshots, test output |
| `verification` | Decide whether the result satisfies the target | commands, pass/fail, residual risk |
| `memory_gate` | Decide whether the lesson is reusable | promote, reject, or keep local |

## Product Rules

1. Do not persist hidden model chain-of-thought as evidence.
2. Do persist user intent, prompts, summaries, commands, logs, diffs, outputs, verification, and decisions.
3. Do not mark work complete without a verification record or an explicit human override.
4. Do not promote memory from a failed or unverified run.
5. Keep auto-run behavior optional. The default product posture is reviewed control, not blind autonomy.

## ClearLoop Language

Use ClearLoop-native names in public product surfaces:

```text
ClearLoop workflow
ClearLoop run
ClearLoop ledger
ClearLoop verification
ClearLoop memory gate
```

Avoid inherited product names, copied prompt phrasing, or references that imply compatibility with a third-party paid product. The baseline is software engineering common sense; the implementation and wording must be ours.
