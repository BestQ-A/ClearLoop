import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
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

function inferWorkspaceRootFromRunDir(runDir: string): string | undefined {
  const parts = runDir.split(/[\\/]+/);
  const bestqaIndex = parts.lastIndexOf(".bestqa");
  if (bestqaIndex > 0 && parts[bestqaIndex + 1] === "agent-runs") {
    return parts.slice(0, bestqaIndex).join(path.sep);
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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

function runCommandText(command: string, args: string[], cwd: string, timeoutMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          if (child.pid && process.platform === "win32") {
            spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
              windowsHide: true,
            });
          } else {
            child.kill();
          }
        }, timeoutMs)
      : undefined;
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      const output = `${stdout}${stderr}`;
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms\n${output}`));
        return;
      }
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(output || `${command} exited with code ${code}`));
      }
    });
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTextTail(filePath: string, maxBytes = 64 * 1024): Promise<string> {
  const stat = await fs.stat(filePath);
  const length = Math.min(stat.size, maxBytes);
  const position = Math.max(0, stat.size - length);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, position);
    const prefix =
      stat.size > maxBytes
        ? `[Captured final ${length} bytes of ${stat.size} bytes]\n\n`
        : "";
    return `${prefix}${buffer.toString("utf8")}`;
  } finally {
    await handle.close();
  }
}

async function readCliResultOutput(runDir: string): Promise<{ sourcePath: string; content: string }> {
  const candidates = [
    path.join(runDir, "last-message.md"),
    path.join(runDir, "cli-output.log"),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return {
        sourcePath: candidate,
        content: await readTextTail(candidate),
      };
    }
  }
  throw new Error(`No CLI output found. Expected ${candidates.join(" or ")}`);
}

function compactCapturedOutput(sourcePath: string, content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const sourceName = path.basename(sourcePath);
  if (!normalized) {
    return `CLI output was captured from ${sourceName}, but the file was empty.`;
  }
  const maxChars = 4000;
  const excerpt =
    normalized.length > maxChars
      ? `[Tail excerpt from ${sourceName}]\n\n${normalized.slice(-maxChars)}`
      : `[Captured output from ${sourceName}]\n\n${normalized}`;
  return excerpt;
}

function parseGitStatusFiles(output: string): string[] {
  const files = new Set<string>();
  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      continue;
    }
    let filePath = rawLine.length > 3 ? rawLine.slice(3).trim() : rawLine.trim();
    const renameIndex = filePath.indexOf(" -> ");
    if (renameIndex >= 0) {
      filePath = filePath.slice(renameIndex + 4).trim();
    }
    filePath = filePath.replace(/^"|"$/g, "");
    if (filePath.replace(/\\/g, "/").includes(".bestqa/agent-runs/")) {
      continue;
    }
    if (filePath) {
      files.add(filePath);
    }
  }
  return [...files].sort();
}

async function listChangedFilesFromGit(workspaceRoot: string): Promise<string[]> {
  try {
    const output = await runCommandText("git", ["status", "--porcelain=v1"], workspaceRoot);
    return parseGitStatusFiles(output);
  } catch {
    return [];
  }
}

type CliCheckMode = "quick" | "full-smoke";
type CliReadiness = "usable" | "installed-but-blocked" | "missing" | "unknown";

type CliCheckStep = {
  ok: boolean;
  output?: string;
  error?: string;
};

type CliAgentCheck = {
  agent_id: "codex" | "claude";
  readiness: CliReadiness;
  executable_paths: string[];
  path_check: CliCheckStep;
  help_check: CliCheckStep;
  smoke_check?: CliCheckStep;
  smoke_command?: string;
  boundary: string;
};

type CliAgentCheckCommandOptions = {
  mode?: CliCheckMode;
  workspaceRoot?: string;
  openReport?: boolean;
  showOutput?: boolean;
};

type CliAgentCheckReport = {
  schema_version: "clearloop.cli-agent-check.v1";
  checked_at: string;
  workspace_root: string;
  mode: CliCheckMode;
  agents: CliAgentCheck[];
  report_path: string;
};

function summarizeOutput(value: string | undefined, maxChars = 4000): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `[tail ${maxChars} chars of ${normalized.length}]\n${normalized.slice(-maxChars)}`;
}

async function runCheckStep(command: string, args: string[], cwd: string, timeoutMs: number): Promise<CliCheckStep> {
  try {
    return {
      ok: true,
      output: summarizeOutput(await runCommandText(command, args, cwd, timeoutMs)),
    };
  } catch (error: any) {
    return {
      ok: false,
      error: summarizeOutput(error.message || String(error)),
    };
  }
}

function executablePathsFromWhere(output: string | undefined): string[] {
  return (output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function runCodexSmoke(workspaceRoot: string): Promise<CliCheckStep> {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "clearloop-codex-check-"));
  const lastMessagePath = path.join(runDir, "last-message.md");
  const prompt = "Reply exactly CLEARLOOP_CODEX_PREFLIGHT_OK. Do not inspect files. Do not modify files. Do not run commands.";
  try {
    const output = await runCommandText(
      "codex",
      [
        "exec",
        "-C",
        workspaceRoot,
        "-s",
        "read-only",
        "--output-last-message",
        lastMessagePath,
        prompt,
      ],
      workspaceRoot,
      120000
    );
    const lastMessage = (await pathExists(lastMessagePath))
      ? await fs.readFile(lastMessagePath, "utf8")
      : "";
    const combined = `${output}\n${lastMessage}`;
    return {
      ok: combined.includes("CLEARLOOP_CODEX_PREFLIGHT_OK"),
      output: summarizeOutput(combined),
    };
  } catch (error: any) {
    return {
      ok: false,
      error: summarizeOutput(error.message || String(error)),
    };
  }
}

async function runClaudeSmoke(workspaceRoot: string): Promise<CliCheckStep> {
  const prompt = "Reply exactly CLEARLOOP_CLAUDE_PREFLIGHT_OK. Do not inspect files. Do not modify files. Do not run commands.";
  try {
    const output = await runCommandText(
      "claude",
      [
        "-p",
        "--permission-mode",
        "default",
        "--add-dir",
        workspaceRoot,
        "--output-format",
        "text",
        prompt,
      ],
      workspaceRoot,
      120000
    );
    return {
      ok: output.includes("CLEARLOOP_CLAUDE_PREFLIGHT_OK"),
      output: summarizeOutput(output),
    };
  } catch (error: any) {
    return {
      ok: false,
      error: summarizeOutput(error.message || String(error)),
    };
  }
}

async function checkCliAgent(
  agentId: "codex" | "claude",
  mode: CliCheckMode,
  workspaceRoot: string
): Promise<CliAgentCheck> {
  const command = agentId === "codex" ? "codex" : "claude";
  const pathCheck = await runCheckStep("where.exe", [command], workspaceRoot, 10000);
  const executablePaths = executablePathsFromWhere(pathCheck.output);
  if (!pathCheck.ok || executablePaths.length === 0) {
    return {
      agent_id: agentId,
      readiness: "missing",
      executable_paths: [],
      path_check: pathCheck,
      help_check: { ok: false, error: "Skipped because executable was not found." },
      boundary: "Executable is missing from PATH.",
    };
  }

  const helpArgs = agentId === "codex" ? ["exec", "--help"] : ["--help"];
  const helpCheck = await runCheckStep(command, helpArgs, workspaceRoot, 15000);
  if (!helpCheck.ok) {
    return {
      agent_id: agentId,
      readiness: "installed-but-blocked",
      executable_paths: executablePaths,
      path_check: pathCheck,
      help_check: helpCheck,
      boundary: "Executable exists, but help command failed.",
    };
  }

  if (mode === "quick") {
    return {
      agent_id: agentId,
      readiness: "unknown",
      executable_paths: executablePaths,
      path_check: pathCheck,
      help_check: helpCheck,
      boundary: "Executable and help surface are present, but real model smoke was not run.",
    };
  }

  const smokeCheck = agentId === "codex"
    ? await runCodexSmoke(workspaceRoot)
    : await runClaudeSmoke(workspaceRoot);
  const smokeCommand = agentId === "codex"
    ? "codex exec -C <workspace> -s read-only --output-last-message <last-message.md> <prompt>"
    : "claude -p --permission-mode default --add-dir <workspace> --output-format text <prompt>";

  return {
    agent_id: agentId,
    readiness: smokeCheck.ok ? "usable" : "installed-but-blocked",
    executable_paths: executablePaths,
    path_check: pathCheck,
    help_check: helpCheck,
    smoke_check: smokeCheck,
    smoke_command: smokeCommand,
    boundary: smokeCheck.ok
      ? "Real model smoke completed successfully."
      : "Executable and help surface are present, but real model smoke failed.",
  };
}

async function checkCliAgents(options?: CliAgentCheckCommandOptions): Promise<CliAgentCheckReport | undefined> {
  const workspaceRoot = options?.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("Open a workspace before checking CLI agents.");
    return;
  }

  const selectedMode = options?.mode
    ? {
        label: options.mode === "quick" ? "Quick preflight" : "Full smoke",
        mode: options.mode,
      }
    : await vscode.window.showQuickPick(
        [
          {
            label: "Quick preflight",
            description: "PATH + --help only; no model call",
            mode: "quick" as CliCheckMode,
          },
          {
            label: "Full smoke",
            description: "PATH + --help + real minimal model call",
            mode: "full-smoke" as CliCheckMode,
          },
        ],
        {
          title: "ClearLoop CLI agent check mode",
          placeHolder: "Use Full smoke when validating actual execution readiness",
        }
      );
  if (!selectedMode) {
    return;
  }

  const channel =
    clearAiOutputChannel ??
    (clearAiOutputChannel = vscode.window.createOutputChannel("BestQ Clear AI"));
  if (options?.showOutput !== false) {
    channel.show(true);
  }
  channel.appendLine(`Checking CLI agents with mode: ${selectedMode.label}`);

  const startedAt = new Date();
  const agents: CliAgentCheck[] = [];
  for (const agentId of ["codex", "claude"] as const) {
    channel.appendLine(`Checking ${agentId}...`);
    const result = await checkCliAgent(agentId, selectedMode.mode, workspaceRoot);
    agents.push(result);
    channel.appendLine(`${agentId}: ${result.readiness} - ${result.boundary}`);
  }

  const report = {
    schema_version: "clearloop.cli-agent-check.v1" as const,
    checked_at: startedAt.toISOString(),
    workspace_root: workspaceRoot,
    mode: selectedMode.mode,
    agents,
  };
  const reportDir = path.join(workspaceRoot, ".bestqa", "cli-agent-checks");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${timestampForFile(startedAt)}.json`);
  const reportWithPath: CliAgentCheckReport = {
    ...report,
    report_path: reportPath,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(reportWithPath, null, 2)}\n`, "utf8");

  channel.appendLine(`CLI agent check report: ${reportPath}`);
  if (options?.openReport !== false) {
    const doc = await vscode.workspace.openTextDocument(reportPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage(`ClearLoop CLI agent check complete: ${selectedMode.label}`);
  }
  return reportWithPath;
}

function buildCliRunCommand(agentId: string, workspaceRoot: string, runDir: string): string {
  const handoffPath = path.join(runDir, "handoff.md");
  const logPath = path.join(runDir, "cli-output.log");
  const lastMessagePath = path.join(runDir, "last-message.md");
  const input = `Get-Content -Raw -LiteralPath ${quotePowerShellLiteral(handoffPath)}`;
  const tee = `2>&1 | Tee-Object -FilePath ${quotePowerShellLiteral(logPath)}`;

  if (agentId === "codex-cli" || agentId === "codex") {
    return [
      input,
      "|",
      "codex exec",
      "-C",
      quotePowerShellLiteral(workspaceRoot),
      "-s workspace-write",
      "--output-last-message",
      quotePowerShellLiteral(lastMessagePath),
      "-",
      tee,
    ].join(" ");
  }

  if (agentId === "claude-code") {
    return [
      input,
      "|",
      "claude -p",
      "--permission-mode default",
      "--add-dir",
      quotePowerShellLiteral(workspaceRoot),
      "--output-format text",
      tee,
    ].join(" ");
  }

  return [
    input,
    "|",
    agentId,
    tee,
  ].join(" ");
}

async function startCliAgentRun() {
  if (!rustClient) {
    vscode.window.showErrorMessage("ClearLoop server is not running.");
    return;
  }

  const runDir = await vscode.window.showInputBox({
    prompt: "Run ledger directory to execute",
    value: inferRunDirFromActiveDocument(),
    placeHolder: String.raw`<workspace>\.bestqa\agent-runs\<run>`,
  });
  if (!runDir) {
    return;
  }

  const handoffPath = path.join(runDir, "handoff.md");
  try {
    await fs.access(handoffPath);
  } catch {
    vscode.window.showErrorMessage(`handoff.md not found: ${handoffPath}`);
    return;
  }

  const cfg = vscode.workspace.getConfiguration("clearLoop");
  const defaultAgent = cfg.get<string>("executionAgent") || "claude-code";
  const agentId = await vscode.window.showQuickPick(
    ["codex-cli", "claude-code", "codex", "custom"],
    {
      title: "CLI agent to start",
      placeHolder: defaultAgent,
    }
  );
  if (!agentId) {
    return;
  }

  const workspaceRoot = inferWorkspaceRootFromRunDir(runDir);
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("Cannot infer workspace root for this run.");
    return;
  }

  const defaultCommand = buildCliRunCommand(agentId, workspaceRoot, runDir);
  const command = await vscode.window.showInputBox({
    prompt: "Command to run in a controlled terminal",
    value: defaultCommand,
  });
  if (!command) {
    return;
  }

  await rustClient.request("recordRunLedgerResult", {
    run_dir: runDir,
    status: "RUNNING",
    summary: `Started ${agentId} from ClearLoop controlled terminal.`,
    changed_files: [],
    commands: [
      {
        command,
        status: "started",
        summary: "Started by ClearLoop: Start CLI Agent Run.",
        output_path: path.join(runDir, "cli-output.log"),
      },
    ],
    verification: "Execution started. Verification is pending.",
    residual_risk: "Agent execution is still running or awaiting result capture.",
    memory_gate: {
      decision: "not_evaluated",
      reason: "Execution has not reached verification.",
    },
  });

  const terminal = vscode.window.createTerminal({
    name: `ClearLoop ${agentId}`,
    cwd: workspaceRoot,
    shellPath: "powershell.exe",
  });
  terminal.sendText(command);
  terminal.show();

  const channel =
    clearAiOutputChannel ??
    (clearAiOutputChannel = vscode.window.createOutputChannel("BestQ Clear AI"));
  channel.show(true);
  channel.appendLine("Started CLI agent run:");
  channel.appendLine(command);
  channel.appendLine(`Run ledger: ${runDir}`);

  vscode.window.showInformationMessage(`ClearLoop started ${agentId}. Record the result after it finishes.`);
}

async function captureCliAgentResult() {
  if (!rustClient) {
    vscode.window.showErrorMessage("ClearLoop server is not running.");
    return;
  }

  const runDir = await vscode.window.showInputBox({
    prompt: "Run ledger directory to capture",
    value: inferRunDirFromActiveDocument(),
    placeHolder: String.raw`<workspace>\.bestqa\agent-runs\<run>`,
  });
  if (!runDir) {
    return;
  }

  let output: { sourcePath: string; content: string };
  try {
    output = await readCliResultOutput(runDir);
  } catch (error: any) {
    vscode.window.showErrorMessage(error.message);
    return;
  }

  const status = await vscode.window.showQuickPick(
    ["WAITING_FOR_REVIEW", "VERIFIED", "FAILED_VERIFICATION", "CANCELLED"],
    {
      title: "Captured run status",
      placeHolder: "Use WAITING_FOR_REVIEW unless verification has actually happened",
    }
  );
  if (!status) {
    return;
  }

  const workspaceRoot = inferWorkspaceRootFromRunDir(runDir);
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("Cannot infer workspace root for this run.");
    return;
  }

  const changedFiles = await listChangedFilesFromGit(workspaceRoot);
  const summary = await vscode.window.showInputBox({
    prompt: "Captured result summary",
    value: `Captured CLI output from ${path.basename(output.sourcePath)}.`,
  });
  if (summary === undefined) {
    return;
  }

  const outputExcerpt = compactCapturedOutput(output.sourcePath, output.content);
  const verification =
    [
      `Output source: ${output.sourcePath}`,
      `Detected changed files: ${changedFiles.length}`,
      "",
      outputExcerpt,
    ].join("\n");
  const residualRisk =
    status === "VERIFIED"
      ? "Captured output was explicitly marked verified by the user."
      : "Captured output still needs human review or a separate verification command before memory promotion.";

  const result = await rustClient.request("recordRunLedgerResult", {
    run_dir: runDir,
    status,
    summary,
    changed_files: changedFiles,
    commands: [
      {
        command: "ClearLoop: Capture CLI Agent Result",
        status: "captured",
        summary: `Captured ${path.basename(output.sourcePath)} into the run ledger.`,
        output_path: output.sourcePath,
      },
    ],
    verification,
    residual_risk: residualRisk,
    memory_gate: {
      decision: "not_evaluated",
      reason: "Captured CLI output still requires review before reusable memory promotion.",
    },
  });

  const channel =
    clearAiOutputChannel ??
    (clearAiOutputChannel = vscode.window.createOutputChannel("BestQ Clear AI"));
  channel.show(true);
  channel.appendLine("Captured CLI agent result:");
  channel.appendLine(JSON.stringify(result, null, 2));

  const resultPath = result?.artifacts?.find((artifact: string) =>
    artifact.endsWith(`${path.sep}result.md`) || artifact.endsWith("/result.md")
  );
  if (resultPath) {
    const doc = await vscode.workspace.openTextDocument(resultPath);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  vscode.window.showInformationMessage(`ClearLoop captured CLI result: ${status}`);
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

    vscode.commands.registerCommand("clearLoop.checkCliAgents", checkCliAgents),

    vscode.commands.registerCommand("clearLoop.startCliAgentRun", startCliAgentRun),

    vscode.commands.registerCommand("clearLoop.captureCliAgentResult", captureCliAgentResult),

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
