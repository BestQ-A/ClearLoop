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

To record a completed or partially completed CLI run, use:

```text
ClearLoop: Record Run Ledger Result
```

The command updates the existing run directory with `recordRunLedgerResult` and opens `result.md`.

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
- `recordRunLedgerResult` turns a handoff into a reviewable result by updating `manifest.json`, `changes.json`, `verification.md`, `result.md`, `commands.jsonl`, and `evidence.jsonl`.
- `Start CLI Agent Run` records a controlled launch before result capture, rather than pretending the run has completed.
- `Capture CLI Agent Result` turns terminal output into reviewable evidence without promoting it to reusable memory.

## Next Step

After this smoke path is stable, the runner can add controlled execution adapters:

- Codex CLI adapter;
- Claude Code CLI adapter;
- explicit approval gates before file edits;
- automatic verification command capture before marking work complete.
