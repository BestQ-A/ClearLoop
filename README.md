# ClearLoop: Clear AI Control Plane for Coding Agents

ClearLoop is the user-facing VS Code layer between humans and AI coding agents.
It is now a standalone sibling project at:

```text
E:\1_agents_space\9_AGI\ClearLoop
```

BestQ-A remains the reasoning / memory / causal core. ClearLoop owns the VS Code extension, local Rust backend, agent UI, packaging, and smoke validation. The shared contract is explicit local records, starting with `.bestqa/agent-runs/<run>/`.

The product thesis is simple: AI is strong at discovering relevance, but humans need a stable handle on causality. ClearLoop turns relevant model output into explicit task state, causal hypotheses, evidence, verification, and reusable memory.

The first working scaffold is the CLI handoff smoke path:

```text
ClearLoop: Create CLI Agent Handoff Smoke
```

It writes a durable `.bestqa/agent-runs/<run>/` directory with `handoff.md`, `manifest.json`, `README.md`, and `result.md` so Codex CLI / Claude Code CLI work can be reviewed and replayed instead of disappearing into chat state. See `docs/clear-ai-cli-handoff.md`.

The core philosophy is documented in [`docs/product/relevance-to-causality.md`](docs/product/relevance-to-causality.md).

loom.com/share/752aa7884c304b609b71b37e75e8ab74
Overview of the video - [YouTube Video](https://www.youtube.com/watch?v=VOZYGDZvJho)

## Ollama Model Installation

Install the [Ollama](https://ollama.com/) App in your system

Run this command from your terminal:

```bash
ollama run qwen2.5-coder
```

## For running Second time

For Next time run:

```bash
ollama serve
```

In another terminal run:

```bash
ollama run qwen2.5-coder
```

For stoping the LLM:

```bash
ollama stop qwen2.5-coder
```

This project began as a simplified planning-layer VS Code extension. Its direction is now Clear AI: a local-first interface that helps people and AI collaborate through explicit state instead of opaque chat-only reasoning.

Built in **TypeScript** with a **React-based webview UI** (styled with Tailwind CSS), it integrates seamlessly into VS Code. No backend required—API keys are stored securely via VS Code's `SecretStorage`.

## Why This Exists

- **Human interface**: ClearLoop is the layer where people can inspect, steer, and verify AI work.
- **Explicit causality**: Relevant observations become hypotheses, evidence, actions, outcomes, and verification records.
- **Agent integration**: Codex CLI, Claude Code CLI, and other local agents should run through auditable handoff records.
- **Stable improvement**: Good runs should become reusable memory only after evidence and verification pass.

This is still early. The current backend binary remains `codesail-server` as an internal implementation name until a later, isolated rename.

## Features

- **AI Code Planning & Analysis**: Upload code + task (e.g., "Fix auth bug") → Groq generates step-by-step plan, issues, suggestions, and fixed code.
- **Structured Output**:
  - **Thinking Phase**: [STEP 1-6] reasoning.
  - **Final Plan**: Markdown with walkthrough, issues (Low/Med/High), suggestions, full fixed code, and diff summary.
- **Secure Qwen2.5 Coder Integration**: Prompt for API key on first use; stored encrypted (no exposure).
- **GitHub Auth**: Optional login for user profile (avatar/email in UI).
- **Modern UI**: Responsive React sidebar with Tailwind; light/dark theme support; file search/modal.
- **Streaming Responses**: Real-time chunks for fast, interactive feedback.

## Requirements

- **VS Code**: v1.93.0+.
- **Grok API Key**: Free from [console.ai](https://console.groq.com/keys) (powers the planning agent).
- **Node.js**: v20+ (for local dev/build).

## Installation & Setup

1. **Install Extension**:

   - Search "ClearLoop" in VS Code Extensions view (`Ctrl+Shift+X`).
   - Install and reload VS Code.

3. **Optional: GitHub Login**:

   - In sidebar footer → "Sign In with GitHub" → Authorise in browser.
   - Shows your profile in the UI.

4. **Usage**:
   - Open ClearLoop sidebar.
   - Search/select a file (excludes node_modules/.git).
   - Enter task prompt (e.g., "Add login validation").
   - Click "Send" → Watch planning stream: Steps → Final plan/fixes.
   - Copy fixed code or apply changes manually.

## Changelog

**2.0.0 (2025-10-13)**

- Bundled deps for reliable publishing.
- Enhanced planning output for better agent integration.
