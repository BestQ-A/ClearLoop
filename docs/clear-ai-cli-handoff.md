# Clear AI CLI Handoff Scaffold

ClearLoop's first useful Clear AI path is not a fake autonomous loop.

It creates a durable handoff directory that can be used by Codex CLI, Claude Code CLI, or another registered CLI agent:

```text
<workspace>/.bestqa/agent-runs/<timestamp-agent-execution>/
  manifest.json
  handoff.md
  evidence.jsonl
  commands.jsonl
  changes.json
  verification.md
  README.md
  result.md
```

## VS Code Smoke

Run this command from the VS Code command palette:

```text
ClearLoop: Create CLI Agent Handoff Smoke
```

The extension will:

- ask for a task;
- read the active editor as bounded context when one is open;
- call the local Rust server through JSON-RPC `handoff`;
- write the run ledger v1 scaffold under the current workspace;
- open `handoff.md` for inspection.

Before starting an agent run, check local CLI readiness with:

```text
ClearLoop: Check CLI Agents
```

The command supports two modes:

- `Quick preflight` checks `PATH` and `--help` without making a model call. It can prove an agent is installed, but readiness remains `unknown`.
- `Full smoke` also runs a minimal real model call. It can mark an agent `usable`, or `installed-but-blocked` when auth, policy, network, or runtime behavior prevents execution.

Reports are written to:

```text
<workspace>/.bestqa/cli-agent-checks/<timestamp>.json
```

To record a completed or partially completed CLI run, use:

```text
ClearLoop: Record Run Ledger Result
```

The command updates the existing run directory with `recordRunLedgerResult` and opens `result.md`.

To inspect recorded runs visually, use:

```text
ClearLoop: Open Run Ledger
```

This opens the `/runs` webview route. It reads `.bestqa/agent-runs/*` and displays the manifest status, stage, commands, evidence events, verification text, result summary, and memory-gate state. It is a visual reader over the existing run ledger files, not a new persistence layer.

To start a controlled visible CLI run from an existing handoff, use:

```text
ClearLoop: Start CLI Agent Run
```

This opens a VS Code terminal, runs a command that pipes `handoff.md` into Codex CLI or Claude Code, and records `RUNNING` plus the launched command in the same ledger. The terminal remains visible so the human can interrupt it.

The Codex CLI command shape must match the live `codex exec --help` surface. The current validated command does not include an approval flag:

```powershell
Get-Content -Raw -LiteralPath <handoff.md> | codex exec -C <workspace> -s workspace-write --output-last-message <last-message.md> - 2>&1 | Tee-Object -FilePath <cli-output.log>
```

To capture the visible CLI run after it finishes, use:

```text
ClearLoop: Capture CLI Agent Result
```

This reads `last-message.md` or `cli-output.log`, detects changed files from `git status --porcelain`, and records the output into the same ledger. It defaults to a review-oriented status; only mark `VERIFIED` when verification has actually happened.

To run and record a verification command, use:

```text
ClearLoop: Verify Run Result
```

This runs a user-selected verification command in the workspace, writes `verification-output-<timestamp>.log` under the same run directory, and records `VERIFIED` only when the command exits successfully. A non-zero exit or timeout records `FAILED_VERIFICATION` with the output path and residual risk.

To extract a reusable-memory review candidate, use:

```text
ClearLoop: Extract Memory Candidate
```

This is a gate, not promotion. It only creates a candidate when the run ledger is `VERIFIED`, `verification.md` is non-empty, `evidence.jsonl` contains a `result_recorded` event, `commands.jsonl` contains at least one `command_recorded` event, and `manifest.memory_gate.decision` is not `blocked`. The output is a human-review file under:

```text
<workspace>/.bestqa/memory-candidates/<timestamp>-<run-id>.md
```

The file is marked `candidate_only`. It must not be treated as durable memory until a human or a later explicit promotion workflow accepts it.

To create an editable review record before promotion, use:

```text
ClearLoop: Prepare Memory Review
```

This writes a review Markdown file under:

```text
<workspace>/.bestqa/memory-reviews/<timestamp>-<candidate>.md
```

The review file keeps the source candidate and source run links, then exposes editable fields for `Decision`, `Accepted by`, `Human Review Note`, reusable claim, applicability conditions, and the success/failure boundary. A candidate should normally be promoted from this reviewed file, not directly from the raw candidate.

For the visual path, use:

```text
ClearLoop: Open Memory Reviews
```

This opens the `/memory-reviews` webview route. The UI lists `.bestqa/memory-reviews/*.md`, edits the same review fields, saves back to the review file, and triggers promotion through `ClearLoop: Promote Memory Candidate`.

To promote a reviewed candidate into local reusable memory, use:

```text
ClearLoop: Promote Memory Candidate
```

This command still does not write into the BestQ-A core directly. It requires an extracted `candidate_only` file, source run evidence under `.bestqa/agent-runs/`, and explicit human acceptance with a review note. When invoked from a review file, `Decision` must be `accepted`, `Accepted by` must be filled, and `Human Review Note` must no longer be `TODO`. Promotion writes:

```text
<workspace>/.bestqa/memory/promoted/<timestamp>-<candidate>.md
<workspace>/.bestqa/memory/promotions.jsonl
```

It also updates the source run manifest to `PROMOTED_TO_MEMORY` and appends `memory_promoted` to `evidence.jsonl`. If acceptance is declined, source evidence is missing, or the run is no longer `VERIFIED`, the command returns `blocked`.

## Why This Exists

The project goal is Clear AI:

```text
implicit model reasoning + explicit task state + auditable evidence
```

In product terms, the handoff converts AI relevance into a causal work record:

```text
task -> context -> hypothesis -> plan -> execution evidence -> verification -> memory gate
```

This scaffold keeps the current product honest. It does not claim the agent has executed code when it has only created a prompt bundle. The status is `WAITING_FOR_EXECUTION` until a human or a later runner explicitly invokes the CLI and records the result.

Run ledger v1 adds appendable evidence and command streams:

- `evidence.jsonl` starts with `handoff_created`;
- `commands.jsonl` starts with the suggested launch command;
- `changes.json` is empty until an agent records changed files;
- `verification.md` is the human-readable verification gate.
- `Open Run Ledger` gives a visual reader over the same run files.
- `Check CLI Agents` records local CLI readiness as `usable`, `installed-but-blocked`, `missing`, or `unknown`.
- `recordRunLedgerResult` turns a handoff into a reviewable result by updating `manifest.json`, `changes.json`, `verification.md`, `result.md`, `commands.jsonl`, and `evidence.jsonl`.
- `Start CLI Agent Run` records a controlled launch before result capture, rather than pretending the run has completed.
- `Capture CLI Agent Result` turns terminal output into reviewable evidence without promoting it to reusable memory.
- `Verify Run Result` turns a verification command into pass/fail evidence before memory promotion.
- `Extract Memory Candidate` turns a verified run into a reviewable candidate only; unverified, incomplete, or explicitly blocked runs must stay local.
- `Prepare Memory Review` creates the editable human review record between candidate extraction and promotion.
- `Promote Memory Candidate` records explicit human acceptance before a candidate becomes local reusable memory.

## Next Step

After this smoke path is stable, the runner can tighten cross-project memory flow:

- export/import contracts for BestQ-A durable memory;
