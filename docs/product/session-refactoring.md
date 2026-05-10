---
title: Session Refactoring
recorded_at: 2026-05-10T00:00:00+08:00
scope: product-protocol
---

# Session Refactoring

An AI or CLI session is like a large temporary source file. It may solve the immediate task, but the first version is usually mixed together: intent, assumptions, context, failed attempts, useful commands, evidence, partial answers, final fixes, and verification are all interleaved.

ClearLoop's job is not only to save that transcript. Saving a transcript is like committing one giant function. The product goal is to refactor the session into smaller, named, testable, reusable engineering assets.

## Analogy

```text
large code file
  -> functions
  -> modules
  -> interfaces
  -> tests
  -> reusable library

AI/CLI session
  -> questions
  -> answers
  -> context filters
  -> plans
  -> evidence
  -> verification recipes
  -> causal patterns
  -> reusable memory
```

## Definition

```text
session refactoring = converting a one-off AI work session into reusable questions, answers, plans, evidence paths, verification recipes, and causal patterns
```

This is the bridge between ClearLoop and BestQ-A:

```text
ClearLoop captures and controls the work session.
BestQ-A distills verified runs into reusable Best Questions, Best Answers, and causal patterns.
```

## Source Material

The raw material comes from the run ledger:

- original human intent;
- clarification questions and answers;
- selected files, symbols, docs, logs, and constraints;
- model-generated relevant context;
- causal hypotheses;
- plan and review findings;
- execution commands;
- changed files and diffs;
- test output and other verification evidence;
- final result and residual risk.

## Refactored Assets

| Asset | Meaning | Reuse condition |
|---|---|---|
| `BestQuestion` | The best way to frame a recurring problem | It narrows the search space better than the raw user request |
| `BestAnswer` | A reusable answer tied to context and evidence | It has passed verification or explicit human acceptance |
| `ContextFilter` | A repeatable way to decide which files/logs matter | It reduces irrelevant context without hiding likely causes |
| `CausalHypothesis` | A cause-effect claim extracted from a run | It is supported by evidence and not contradicted by verification |
| `PlanPattern` | A reusable implementation strategy | It has clear constraints and failure modes |
| `VerificationRecipe` | A reusable command or observable check | It catches the class of failure it claims to catch |
| `FailurePattern` | A known bad path or misleading assumption | It prevents repeated wasted work |

## Refactoring Process

```text
raw session
  -> normalize into run ledger
  -> separate signal from noise
  -> identify repeated problem shape
  -> extract best question
  -> extract answer and evidence
  -> attach verification recipe
  -> decide memory gate
```

The memory gate has three outcomes:

- `promote`: reusable and verified;
- `keep_local`: useful for this run, not general enough yet;
- `reject`: misleading, unverified, or too context-specific.

## Quality Bar

A refactored session asset must answer:

1. What problem shape does this apply to?
2. What context must be true for reuse?
3. What evidence supports it?
4. What command or observation verifies it?
5. What are the known exceptions?

If those questions cannot be answered, the asset should remain run-local evidence instead of becoming reusable memory.

## Product Standard

ClearLoop should make session refactoring visible to the user:

- show the original run;
- show extracted candidate assets;
- let the user accept, edit, or reject each asset;
- only promote verified assets into BestQ-A memory;
- keep links from the reusable asset back to the original run evidence.

The goal is stable improvement: each completed run should make the next similar run easier, clearer, and safer.
