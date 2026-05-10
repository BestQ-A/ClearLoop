import * as vscode from "vscode";
import * as fs from "fs/promises";
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
