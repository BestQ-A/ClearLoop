---
title: Run Ledger Architecture
recorded_at: 2026-05-10T00:00:00+08:00
scope: architecture
---

# Run Ledger Architecture

The run ledger is ClearLoop's source of truth for AI coding work. It turns a chat-shaped interaction into a durable engineering record.

## Goal

Every meaningful agent run should answer:

- What did the human ask for?
- What did the system consider relevant?
- What causal hypothesis justified the action?
- What changed?
- What evidence was captured?
- How was the result verified?
- Should anything be promoted into reusable memory?

The ledger is deliberately raw enough to preserve evidence and structured enough to be refactored later. Session refactoring is the process that turns a completed run into smaller reusable assets.

## Storage Direction

The first local format is file-based:

```text
<workspace>/.bestqa/agent-runs/<run_id>/
  manifest.json
  handoff.md
  evidence.jsonl
  commands.jsonl
  changes.json
  verification.md
  result.md
```

`manifest.json` is the index. Markdown files are for human review. JSONL files are append-only event streams. A later SQLite or graph projection may be built from these files, but the files remain the inspectable source.

## Minimal Manifest

```json
{
  "schema_version": "run-ledger.v1",
  "run_id": "20260510T120000-clearloop-001",
  "workspace": "E:/path/to/workspace",
  "status": "WAITING_FOR_EXECUTION",
  "agent": {
    "id": "codex-cli",
    "kind": "cli"
  },
  "workflow": {
    "stage": "handoff",
    "baseline": "intent->clarification->plan->execution->verification->memory"
  },
  "task": {
    "title": "Short task title",
    "intent": "Original user request",
    "acceptance": ["observable acceptance criterion"]
  },
  "memory_gate": {
    "decision": "not_evaluated",
    "reason": "No verification record yet"
  }
}
```

## Status Model

| Status | Meaning |
|---|---|
| `DRAFT` | A task record exists but no handoff is ready |
| `WAITING_FOR_EXECUTION` | Handoff exists; no agent result has been recorded |
| `RUNNING` | An agent execution is active |
| `WAITING_FOR_REVIEW` | Execution finished; verification or human review is pending |
| `VERIFIED` | Verification passed |
| `FAILED_VERIFICATION` | Verification failed |
| `CANCELLED` | A human or policy stopped the run |
| `PROMOTED_TO_MEMORY` | A verified lesson was promoted |

`WAITING_FOR_EXECUTION` is not success. `VERIFIED` is not reusable memory. Memory promotion is a separate gate.

## Event Streams

`evidence.jsonl` records evidence events:

```json
{"ts":"2026-05-10T12:00:00Z","type":"file_read","path":"src/example.ts","why":"entrypoint for reported behavior"}
{"ts":"2026-05-10T12:01:00Z","type":"hypothesis","text":"The failure likely comes from stale config loading","confidence":"medium"}
{"ts":"2026-05-10T12:05:00Z","type":"verification_output","command":"npm test","status":"passed"}
```

`commands.jsonl` records executable commands and outputs at a summary level. Large logs should be written as separate files and referenced by path.

## Result Capture

The local backend exposes JSON-RPC `recordRunLedgerResult` for adapters and the VS Code command palette. It updates the same run directory instead of creating a second source of truth.

Minimal params:

```json
{
  "run_dir": "E:/workspace/.bestqa/agent-runs/20260510T120000-codex-cli",
  "status": "VERIFIED",
  "summary": "Implementation completed and verified.",
  "changed_files": ["src/example.ts"],
  "commands": [
    {
      "command": "npm test",
      "status": "passed",
      "summary": "all tests passed"
    }
  ],
  "verification": "npm test passed.",
  "residual_risk": "No residual risk recorded.",
  "memory_gate": {
    "decision": "not_evaluated",
    "reason": "Result capture does not promote memory directly."
  }
}
```

The backend only accepts run directories under the active workspace's `.bestqa/agent-runs/` root. This keeps result capture from becoming an arbitrary filesystem write primitive.

## Adapter Contract

An agent adapter may be Codex CLI, Claude Code CLI, a VS Code extension command, or a future cloud worker. It must:

1. Read `handoff.md` and `manifest.json`.
2. Write an execution summary to `result.md`.
3. Append command/evidence events where possible.
4. List changed files.
5. Record verification commands or state why verification was skipped.
6. Never mark a run as `PROMOTED_TO_MEMORY` directly.

## Memory Gate

Memory promotion is allowed only when:

- the run has a human-readable result;
- verification passed or a human explicitly accepted the residual risk;
- the lesson is phrased as a reusable causal claim;
- the evidence path is still available.

This keeps ClearLoop from turning lucky correlations into permanent rules.

## Session Refactoring Boundary

The run ledger stores what happened. Session refactoring decides what can be reused.

Do not write reusable lessons directly from an agent transcript. First normalize the transcript into ledger evidence, then extract reusable assets such as:

- best questions;
- best answers;
- context filters;
- causal hypotheses;
- verification recipes;
- reusable workflows;
- failure patterns.

This boundary keeps ClearLoop honest: a run can be useful without becoming a permanent rule.
