# ClearLoop Project Instructions

## Project Boundary

ClearLoop is the user-facing VS Code product for Clear AI.

It is a sibling project of BestQ-A:

```text
E:\1_agents_space\9_AGI\BestQ-A   # reasoning / memory / causal core
E:\1_agents_space\9_AGI\ClearLoop  # VS Code extension / local backend / agent UI
```

Do not treat this repository as an embedded BestQ-A subtree. Cross-project behavior should go through explicit contracts such as CLI commands, MCP tools, or `.bestqa/agent-runs` records.

## Product Direction

Build a local-first VS Code control plane that makes AI coding work visible, auditable, and reusable.

The central product loop is:

```text
task -> explicit plan -> controlled agent run -> captured evidence -> verification -> memory gate
```

Hidden model chain-of-thought must not be persisted or displayed as product evidence. Persist structured summaries, tool events, prompts, commands, logs, diffs, verification outputs, and explicit user decisions.

## Local Commands

Use these targeted checks before claiming a ClearLoop change works:

```powershell
npm run compile
```

```powershell
npm run build
```

```powershell
cd codesail-server
cargo test
```

```powershell
cd webview-ui
npm run build
```

For a minimal backend smoke, send JSON-RPC to `codesail-server` and verify that `handoff` creates:

```text
.bestqa/agent-runs/<run>/manifest.json
.bestqa/agent-runs/<run>/handoff.md
.bestqa/agent-runs/<run>/evidence.jsonl
.bestqa/agent-runs/<run>/commands.jsonl
.bestqa/agent-runs/<run>/changes.json
.bestqa/agent-runs/<run>/verification.md
.bestqa/agent-runs/<run>/README.md
.bestqa/agent-runs/<run>/result.md
```

For result capture, send JSON-RPC `recordRunLedgerResult` against that run directory and verify:

```text
manifest.json status changes from WAITING_FOR_EXECUTION
evidence.jsonl contains result_recorded
commands.jsonl contains command_recorded when commands are supplied
changes.json contains reported changed_files
verification.md and result.md are rewritten with the recorded result
```

For a minimal extension runner smoke, verify the command palette exposes:

```text
ClearLoop: Start CLI Agent Run
```

It should infer the active run directory from an open file under `.bestqa/agent-runs/<run>/`, record `RUNNING`, append `command_recorded`, and launch a visible PowerShell terminal.

For Codex CLI starts, keep the generated command aligned with the local `codex exec --help` surface. The current validated shape is:

```powershell
Get-Content -Raw -LiteralPath <handoff.md> | codex exec -C <workspace> -s workspace-write --output-last-message <last-message.md> - 2>&1 | Tee-Object -FilePath <cli-output.log>
```

Do not add unsupported approval flags such as `-a on-request`; verify CLI flags live when changing this path.

For CLI readiness, verify the command palette exposes:

```text
ClearLoop: Check CLI Agents
```

It should offer `Quick preflight` and `Full smoke`, check both `codex` and `claude`, and write a diagnostic report under `.bestqa/cli-agent-checks/`. Report readiness as `usable`, `installed-but-blocked`, `missing`, or `unknown`; do not claim a CLI is usable from `--help` alone.

For automated Extension Host coverage of this path, run:

```powershell
npx vscode-test --fail-zero
```

The current smoke test lives at `src/test/checkCliAgents.test.ts`; it verifies command registration, non-interactive quick preflight execution, report file creation, and the rule that quick preflight must not claim `usable`.

For a minimal completion capture smoke, verify the command palette exposes:

```text
ClearLoop: Capture CLI Agent Result
```

It should infer the active run directory, read `last-message.md` or `cli-output.log`, detect changed files from `git status --porcelain`, call `recordRunLedgerResult`, and open `result.md`. Default to `WAITING_FOR_REVIEW` unless verification has actually happened.

For a minimal verification smoke, verify the command palette exposes:

```text
ClearLoop: Verify Run Result
```

It should run a verification command from the inferred workspace root, write `verification-output-<timestamp>.log` under the run directory, call `recordRunLedgerResult`, and set status to `VERIFIED` only when the command exits with code 0 and does not time out. Failed or timed-out commands must become `FAILED_VERIFICATION`.

For a minimal memory-gate smoke, verify the command palette exposes:

```text
ClearLoop: Extract Memory Candidate
```

It should only create `.bestqa/memory-candidates/<timestamp>-<run-id>.md` for a `VERIFIED` run ledger with non-empty `verification.md`, a `result_recorded` event in `evidence.jsonl`, at least one `command_recorded` event in `commands.jsonl`, and a non-blocked `manifest.memory_gate.decision`. The generated file is `candidate_only`; do not treat it as durable memory. Unverified or incomplete ledgers must return a blocked result and create no candidate file.

The Extension Host smoke in `src/test/checkCliAgents.test.ts` should cover both verified candidate creation and unverified-run blocking when this command changes.

## Engineering Rules

- Keep UI, extension host, Rust backend, and webview concerns separated.
- Do not claim the extension runtime works from `npm run build` alone; activation and server startup are separate evidence.
- Preserve the current dirty worktree. Do not delete generated VSIX/database/cache files unless the user explicitly asks for cleanup.
- When adding agent execution features, prefer a dry-run or handoff scaffold before automatic file mutation.
- Record status honestly: `WAITING_FOR_EXECUTION` means a handoff exists; it is not the same as completed agent work.
