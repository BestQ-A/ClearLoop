import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import { createViewProvider } from "./webview/ViewProvider";
import { RustClient } from "./rustclient/RustClient";

export async function listAllWorkspaceFiles() {
  const excludePatterns = "**/{node_modules,dist,build,.git,.*}/**";
  try {
    const allFiles = await vscode.workspace.findFiles("**/*", excludePatterns);
    if (allFiles.length > 0) {
      vscode.window.showInformationMessage(
        `Found ${allFiles.length} files in the workspace.`
      );
      return allFiles;
    } else {
      vscode.window.showInformationMessage(
        "No important files found in the workspace."
      );
      return [];
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error listing files: ${error.message}`);
    return [];
  }
}

export async function readFileContent(filePath: string) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    vscode.window.showInformationMessage(`File content read successfully`);
    return content;
  } catch (error: any) {
    const errorMsg = `Error reading file: ${error.message}`;
    vscode.window.showErrorMessage(errorMsg);
    throw new Error(errorMsg);
  }
}

let rustClient: RustClient | undefined;
let codexOutputChannel: vscode.OutputChannel | undefined;
let clearAiOutputChannel: vscode.OutputChannel | undefined;
const CLEAR_LOOP_VIEW_ID = "clearLoop.commentNavigatorWebview";

export function getRustClient(): RustClient | undefined {
    return rustClient;
}

/**
 * 跑一次 `codex login status`，返回 stdout/stderr 合并文本。
 * 用 spawn shell:true 兼容 Windows 上 codex 是 .cmd shim 的情况。
 */
function runCodexStatus(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["login", "status"], {
      shell: true,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(new Error(`Cannot start codex CLI: ${err.message}`));
    });
    child.on("close", (code) => {
      const output = `${stdout}${stderr}`;
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(output || `codex exited with code ${code}`));
      }
    });
  });
}

async function createCliHandoffSmoke() {
  if (!rustClient) {
    vscode.window.showErrorMessage("ClearLoop server is not running.");
    return;
  }

  const task = await vscode.window.showInputBox({
    prompt: "Task to hand off to Codex CLI / Claude Code CLI",
    value: "Create a visible, auditable plan for improving the current project without modifying files.",
  });
  if (!task) {
    return;
  }

  const cfg = vscode.workspace.getConfiguration("clearLoop");
  const agentId = cfg.get<string>("executionAgent") || "claude-code";
  const now = new Date().toISOString();
  const active = vscode.window.activeTextEditor?.document;
  const contextFiles = active
    ? [
        {
          path: active.uri.fsPath,
          language: active.languageId || "text",
          content: active.getText().slice(0, 12000),
        },
      ]
    : [];

  const payload = {
    ticket: {
      id: `clear-ai-smoke-${Date.now()}`,
      epic_id: "clear-ai-smoke",
      title: "Clear AI CLI handoff smoke",
      description: task,
      status: "TICKET_TODO",
      assignee: agentId,
      is_streaming: false,
      spec_refs: [],
      created_at: now,
      updated_at: now,
    },
    plan_snapshot: [
      "1. Restate the task and hard constraints.",
      "2. List the files/evidence that should be inspected first.",
      "3. Propose the smallest reversible next action.",
      "4. State the verification command or observable evidence required.",
    ].join("\n"),
    instructions: [
      "You are being invoked through the BestQ-A Clear AI handoff scaffold.",
      "Keep reasoning explicit as inspect -> plan -> act -> verify.",
      "Do not modify files during this smoke unless the user explicitly asks for implementation.",
      "Return changed files, commands run, logs, and remaining risks.",
    ].join("\n"),
    verification_prompt:
      "The smoke passes only if the CLI agent output can be tied back to concrete files, commands, or logs.",
    context_files: contextFiles,
  };

  const result = await rustClient.request("handoff", {
    payload,
    agent_id: agentId,
  });

  const channel =
    clearAiOutputChannel ??
    (clearAiOutputChannel = vscode.window.createOutputChannel("BestQ Clear AI"));
  channel.show(true);
  channel.appendLine("Created CLI agent handoff scaffold:");
  channel.appendLine(JSON.stringify(result, null, 2));

  if (result?.handoff_path) {
    const doc = await vscode.workspace.openTextDocument(result.handoff_path);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  vscode.window.showInformationMessage(
    `BestQ CLI handoff created for ${agentId}.`
  );
}

function inferRunDirFromActiveDocument(): string | undefined {
  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!activePath) {
    return undefined;
  }
  const parts = activePath.split(/[\\/]+/);
  const bestqaIndex = parts.lastIndexOf(".bestqa");
  if (
    bestqaIndex >= 0 &&
    parts[bestqaIndex + 1] === "agent-runs" &&
    parts[bestqaIndex + 2]
  ) {
    return parts.slice(0, bestqaIndex + 3).join(path.sep);
  }
  return undefined;
}

function parseListInput(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function recordCliRunLedgerResult() {
  if (!rustClient) {
    vscode.window.showErrorMessage("ClearLoop server is not running.");
    return;
  }

  const runDir = await vscode.window.showInputBox({
    prompt: "Run ledger directory to update",
    value: inferRunDirFromActiveDocument(),
    placeHolder: String.raw`<workspace>\.bestqa\agent-runs\<run>`,
  });
  if (!runDir) {
    return;
  }

  const status = await vscode.window.showQuickPick(
    ["WAITING_FOR_REVIEW", "VERIFIED", "FAILED_VERIFICATION", "CANCELLED"],
    {
      title: "Run Ledger status",
      placeHolder: "Pick the honest current status",
    }
  );
  if (!status) {
    return;
  }

  const summary = await vscode.window.showInputBox({
    prompt: "Execution summary",
    value: "Agent output was recorded for review.",
  });
  if (summary === undefined) {
    return;
  }

  const changedFilesRaw = await vscode.window.showInputBox({
    prompt: "Changed files, comma-separated",
    placeHolder: "src/example.ts, tests/example.test.ts",
  });
  if (changedFilesRaw === undefined) {
    return;
  }

  const command = await vscode.window.showInputBox({
    prompt: "Verification or execution command to record (optional)",
    placeHolder: "npm test",
  });
  if (command === undefined) {
    return;
  }

  const commandStatus = command
    ? await vscode.window.showQuickPick(["passed", "failed", "not_run", "unknown"], {
        title: "Command status",
      })
    : undefined;
  if (command && !commandStatus) {
    return;
  }

  const verification = await vscode.window.showInputBox({
    prompt: "Verification note",
    value:
      status === "VERIFIED"
        ? "Verification passed."
        : "Verification has not passed yet.",
  });
  if (verification === undefined) {
    return;
  }

  const residualRisk = await vscode.window.showInputBox({
    prompt: "Residual risk",
    value: status === "VERIFIED" ? "No residual risk recorded." : "Needs review.",
  });
  if (residualRisk === undefined) {
    return;
  }

  const result = await rustClient.request("recordRunLedgerResult", {
    run_dir: runDir,
    status,
    summary,
    changed_files: parseListInput(changedFilesRaw),
    commands: command
      ? [
          {
            command,
            status: commandStatus,
            summary: verification,
          },
        ]
      : [],
    verification,
    residual_risk: residualRisk,
    memory_gate: {
      decision: "not_evaluated",
      reason: "Result capture does not promote memory directly.",
    },
  });

  const channel =
    clearAiOutputChannel ??
    (clearAiOutputChannel = vscode.window.createOutputChannel("BestQ Clear AI"));
  channel.show(true);
  channel.appendLine("Recorded Run Ledger result:");
  channel.appendLine(JSON.stringify(result, null, 2));

  const resultPath = result?.artifacts?.find((artifact: string) =>
    artifact.endsWith(`${path.sep}result.md`) || artifact.endsWith("/result.md")
  );
  if (resultPath) {
    const doc = await vscode.workspace.openTextDocument(resultPath);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  vscode.window.showInformationMessage(`ClearLoop Run Ledger updated: ${status}`);
}

export async function activate(context: vscode.ExtensionContext) {
  // Start Rust binary
  rustClient = new RustClient();
  try {
    await rustClient.start(context.extensionPath);
    vscode.window.showInformationMessage("ClearLoop server started");
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to start ClearLoop server: ${err.message}`);
    // Fall back to legacy ollama mode
    rustClient = undefined;
  }

  const provider = createViewProvider(context.extensionUri, context, rustClient);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(provider.viewId, provider)
  );

  const focusClearLoop = () => vscode.commands.executeCommand(`${CLEAR_LOOP_VIEW_ID}.focus`);
  const navigateClearLoop = (path: string) => {
    focusClearLoop();
    provider.postMessage?.({ command: "navigate", path });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("clearLoop.startNewTask", () => {
      focusClearLoop();
      provider.postMessage?.({ command: "reset" });
    }),

    vscode.commands.registerCommand("clearLoop.openTaskHistory", () => navigateClearLoop("/history")),

    vscode.commands.registerCommand("clearLoop.listMCPServers", () => navigateClearLoop("/mcp")),

    vscode.commands.registerCommand("clearLoop.managePromptTemplates", () => navigateClearLoop("/settings/prompt-template")),

    vscode.commands.registerCommand("clearLoop.manageCLIAgents", () => navigateClearLoop("/settings/cli-agents")),

    vscode.commands.registerCommand("clearLoop.manageWorkflows", () => navigateClearLoop("/settings/workflows")),

    vscode.commands.registerCommand("clearLoop.manageGitScripts", () => navigateClearLoop("/settings/git")),

    vscode.commands.registerCommand("clearLoop.manageModelProfiles", () => navigateClearLoop("/settings/model-profiles")),

    vscode.commands.registerCommand("clearLoop.openEpicView", () => navigateClearLoop("/epic/chat/new")),

    vscode.commands.registerCommand("clearLoop.openSettings", () => navigateClearLoop("/settings/prompt-template")),

    vscode.commands.registerCommand("clearLoop.analyzeFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file to analyze.");
        return;
      }
      const filePath = editor.document.uri.fsPath;
      focusClearLoop();
      provider.postMessage?.({
        command: "analyzeFile",
        data: { filePath },
      });
    }),

    vscode.commands.registerCommand("clearLoop.analyzeChanges", async () => {
      const gitExtension = vscode.extensions.getExtension("vscode.git");
      if (!gitExtension) {
        vscode.window.showWarningMessage("Git extension not found.");
        return;
      }
      const git = gitExtension.exports.getAPI(1);
      const repo = git.repositories[0];
      if (!repo) {
        vscode.window.showWarningMessage("No git repository found.");
        return;
      }
      const diff = await repo.diff(true);
      focusClearLoop();
      provider.postMessage?.({
        command: "analyzeChanges",
        data: { diff },
      });
    }),

    vscode.commands.registerCommand("clearLoop.createCliHandoff", createCliHandoffSmoke),

    vscode.commands.registerCommand("clearLoop.recordRunLedgerResult", recordCliRunLedgerResult),

    // Codex CLI 集成：登录 / 状态查看（对应 LlmProvider=codex）
    vscode.commands.registerCommand("clearLoop.codexLogin", () => {
      const terminal = vscode.window.createTerminal({ name: "Codex Login" });
      terminal.sendText("codex login");
      terminal.show();
    }),

    vscode.commands.registerCommand("clearLoop.codexStatus", async () => {
      const channel =
        codexOutputChannel ??
        (codexOutputChannel = vscode.window.createOutputChannel("Codex"));
      channel.show(true);
      channel.appendLine("$ codex login status");
      try {
        const output = await runCodexStatus();
        channel.appendLine(output.trim() || "(no output)");
      } catch (err: any) {
        channel.appendLine(`Failed: ${err.message ?? err}`);
      }
    })
  );

  context.subscriptions.push({
    dispose: () => {
      rustClient?.shutdown();
    },
  });
}

export function deactivate() {
  rustClient?.shutdown();
}
