# Clear AI CLI Handoff Scaffold

ClearLoop's first useful Clear AI path is not a fake autonomous loop.

It creates a durable handoff directory that can be used by Codex CLI, Claude Code CLI, or another registered CLI agent:

```text
<workspace>/.bestqa/agent-runs/<timestamp-agent-execution>/
  handoff.md
  manifest.json
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
- write the handoff scaffold under the current workspace;
- open `handoff.md` for inspection.

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

## Next Step

After this smoke path is stable, the runner can add controlled execution adapters:

- Codex CLI adapter;
- Claude Code CLI adapter;
- explicit approval gates before file edits;
- result capture into `result.md`;
- verification command capture before marking work complete.
