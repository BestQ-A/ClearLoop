import * as vscode from "vscode";
import * as fs from "fs/promises";
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

export function getRustClient(): RustClient | undefined {
    return rustClient;
}

export async function activate(context: vscode.ExtensionContext) {
  // Start Rust binary
  rustClient = new RustClient();
  try {
    await rustClient.start(context.extensionPath);
    vscode.window.showInformationMessage("CodeSail server started");
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to start CodeSail server: ${err.message}`);
    // Fall back to legacy ollama mode
    rustClient = undefined;
  }

  const provider = createViewProvider(context.extensionUri, context, rustClient);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(provider.viewId, provider)
  );

  // 注册新命令
  context.subscriptions.push(
    vscode.commands.registerCommand("codesail.startNewTask", () => {
      // 聚焦侧边栏并发送重置消息
      vscode.commands.executeCommand("codesailView.focus");
      provider.postMessage?.({ command: "reset" });
    }),

    vscode.commands.registerCommand("codesail.openEpicView", () => {
      // 切换到 Epic 视图
      vscode.commands.executeCommand("codesailView.focus");
      provider.postMessage?.({ command: "switchView", data: "epic" });
    }),

    vscode.commands.registerCommand("codesail.openSettings", () => {
      // 切换到设置视图
      vscode.commands.executeCommand("codesailView.focus");
      provider.postMessage?.({ command: "switchView", data: "settings" });
    }),

    vscode.commands.registerCommand("codesail.analyzeFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file to analyze.");
        return;
      }
      const filePath = editor.document.uri.fsPath;
      vscode.commands.executeCommand("codesailView.focus");
      provider.postMessage?.({
        command: "analyzeFile",
        data: { filePath },
      });
    }),

    vscode.commands.registerCommand("codesail.analyzeChanges", async () => {
      // 获取 git diff 并分析变更
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
      vscode.commands.executeCommand("codesailView.focus");
      provider.postMessage?.({
        command: "analyzeChanges",
        data: { diff },
      });
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
