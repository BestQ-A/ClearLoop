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

function inferCandidatePathFromActiveDocument(): string | undefined {
  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!activePath) {
    return undefined;
  }
  const parts = activePath.split(/[\\/]+/);
  const bestqaIndex = parts.lastIndexOf(".bestqa");
  if (
    bestqaIndex >= 0 &&
    parts[bestqaIndex + 1] === "memory-candidates" &&
    parts[bestqaIndex + 2]
  ) {
    return activePath;
  }
  return undefined;
}

function inferReviewPathFromActiveDocument(): string | undefined {
  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!activePath) {
    return undefined;
  }
  const parts = activePath.split(/[\\/]+/);
  const bestqaIndex = parts.lastIndexOf(".bestqa");
  if (
    bestqaIndex >= 0 &&
    parts[bestqaIndex + 1] === "memory-reviews" &&
    parts[bestqaIndex + 2]
  ) {
    return activePath;
  }
  return undefined;
}

function inferWorkspaceRootFromBestqaPath(targetPath: string, folderName: string): string | undefined {
  const parts = targetPath.split(/[\\/]+/);
  const bestqaIndex = parts.lastIndexOf(".bestqa");
  if (bestqaIndex > 0 && parts[bestqaIndex + 1] === folderName) {
    return parts.slice(0, bestqaIndex).join(path.sep);
  }
  return undefined;
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

type CommandCapture = {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
};

type VerifyRunResultOptions = {
  runDir?: string;
  command?: string;
  timeoutMs?: number;
  openReport?: boolean;
  showOutput?: boolean;
};

type VerifyRunResultReport = {
  run_dir: string;
  status: "VERIFIED" | "FAILED_VERIFICATION";
  command: string;
  exit_code: number | null;
  output_path: string;
  changed_files: string[];
  artifacts: string[];
};

type JsonObject = Record<string, any>;

type MemoryCandidateOptions = {
  runDir?: string;
  openCandidate?: boolean;
  showOutput?: boolean;
};

type MemoryCandidateReport = {
  status: "created" | "blocked";
  run_dir: string;
  candidate_path?: string;
  reasons: string[];
  evidence_paths: string[];
};

type PrepareMemoryReviewOptions = {
  candidatePath?: string;
  openReview?: boolean;
  showOutput?: boolean;
};

type PrepareMemoryReviewReport = {
  status: "created" | "blocked";
  candidate_path: string;
  source_run?: string;
  review_path?: string;
  reasons: string[];
  evidence_paths: string[];
};

type PromoteMemoryCandidateOptions = {
  candidatePath?: string;
  reviewPath?: string;
  accepted?: boolean;
  acceptedBy?: string;
  reviewNote?: string;
  openMemory?: boolean;
  showOutput?: boolean;
};

type PromoteMemoryCandidateReport = {
  status: "promoted" | "blocked";
  candidate_path: string;
  review_path?: string;
  source_run?: string;
  memory_path?: string;
  promotion_record_path?: string;
  reasons: string[];
  evidence_paths: string[];
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

async function readJsonFile(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJsonlFile(filePath: string): Promise<JsonObject[]> {
  const content = await fs.readFile(filePath, "utf8");
  const records: JsonObject[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      records.push({
        type: "unparsed_line",
        text: trimmed,
      });
    }
  }
  return records;
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function relativeOrAbsolute(workspaceRoot: string, targetPath: string): string {
  const relativePath = path.relative(workspaceRoot, targetPath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
    ? relativePath
    : targetPath;
}

function markdownExcerpt(value: string, maxChars = 5000): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "No content recorded.";
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `[tail ${maxChars} chars of ${normalized.length}]\n\n${normalized.slice(-maxChars)}`;
}

function runShellCommandCapture(command: string, cwd: string, timeoutMs: number): Promise<CommandCapture> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd,
      shell: true,
      windowsHide: true,
    });
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid && process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
        });
      } else {
        child.kill();
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        output,
        timedOut,
      });
    });
  });
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

async function appendJsonl(filePath: string, record: JsonObject): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
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

async function verifyRunResult(options?: VerifyRunResultOptions): Promise<VerifyRunResultReport | undefined> {
  if (!rustClient) {
    vscode.window.showErrorMessage("ClearLoop server is not running.");
    return;
  }

  const runDir = options?.runDir ?? await vscode.window.showInputBox({
    prompt: "Run ledger directory to verify",
    value: inferRunDirFromActiveDocument(),
    placeHolder: String.raw`<workspace>\.bestqa\agent-runs\<run>`,
  });
  if (!runDir) {
    return;
  }

  const workspaceRoot = inferWorkspaceRootFromRunDir(runDir);
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("Cannot infer workspace root for this run.");
    return;
  }

  const command = options?.command ?? await vscode.window.showInputBox({
    prompt: "Verification command to run",
    value: "npm test",
  });
  if (!command) {
    return;
  }

  const timeoutMs = options?.timeoutMs ?? 600000;
  const channel =
    clearAiOutputChannel ??
    (clearAiOutputChannel = vscode.window.createOutputChannel("BestQ Clear AI"));
  if (options?.showOutput !== false) {
    channel.show(true);
  }
  channel.appendLine(`Running verification command: ${command}`);

  const startedAt = new Date();
  const capture = await runShellCommandCapture(command, workspaceRoot, timeoutMs);
  const outputPath = path.join(runDir, `verification-output-${timestampForFile(startedAt)}.log`);
  await fs.writeFile(outputPath, capture.output || "", "utf8");

  const passed = capture.exitCode === 0 && !capture.timedOut;
  const status = passed ? "VERIFIED" : "FAILED_VERIFICATION";
  const changedFiles = await listChangedFilesFromGit(workspaceRoot);
  const outputSummary = summarizeOutput(capture.output, 4000) || "Verification command produced no output.";
  const verification = [
    `Command: ${command}`,
    `Exit code: ${capture.exitCode === null ? "null" : capture.exitCode}`,
    `Timed out: ${capture.timedOut}`,
    `Output path: ${outputPath}`,
    "",
    outputSummary,
  ].join("\n");
  const residualRisk = passed
    ? "Verification command passed. Review scope still depends on whether the command covers the intended behavior."
    : "Verification command failed or timed out. Inspect the output path and treat this run as not verified.";

  const result = await rustClient.request("recordRunLedgerResult", {
    run_dir: runDir,
    status,
    summary: passed
      ? `Verification passed: ${command}`
      : `Verification failed: ${command}`,
    changed_files: changedFiles,
    commands: [
      {
        command,
        status: passed ? "passed" : "failed",
        summary: passed ? "Verification command exited successfully." : "Verification command failed or timed out.",
        output_path: outputPath,
      },
    ],
    verification,
    residual_risk: residualRisk,
    memory_gate: {
      decision: passed ? "ready_for_review" : "blocked",
      reason: passed
        ? "Verification evidence is available, but reusable memory promotion still requires review."
        : "Failed verification cannot be promoted to reusable memory.",
    },
  });

  channel.appendLine(`Verification result: ${status}`);
  channel.appendLine(`Verification output: ${outputPath}`);

  const resultPath = result?.artifacts?.find((artifact: string) =>
    artifact.endsWith(`${path.sep}result.md`) || artifact.endsWith("/result.md")
  );
  if (resultPath && options?.openReport !== false) {
    const doc = await vscode.workspace.openTextDocument(resultPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage(`ClearLoop verification recorded: ${status}`);
  }

  return {
    run_dir: runDir,
    status,
    command,
    exit_code: capture.exitCode,
    output_path: outputPath,
    changed_files: changedFiles,
    artifacts: result?.artifacts ?? [],
  };
}

function renderMemoryCandidateMarkdown(params: {
  runDir: string;
  workspaceRoot: string;
  manifest: JsonObject;
  resultMd: string;
  verificationMd: string;
  evidenceEvents: JsonObject[];
  commands: JsonObject[];
  changes: JsonObject;
  evidencePaths: string[];
}): string {
  const runId = params.manifest.run_id || path.basename(params.runDir);
  const memoryGate = params.manifest.memory_gate || {};
  const changedFiles = Array.isArray(params.changes.changed_files)
    ? params.changes.changed_files
    : [];
  const commandLines = params.commands
    .filter((record) => record.type === "command_recorded")
    .map((record) => {
      const status = record.status || "unknown";
      const outputPath = record.output_path ? `; output: ${record.output_path}` : "";
      return `- \`${record.command || "unknown command"}\` -> \`${status}\`${outputPath}`;
    });
  const eventLines = params.evidenceEvents.map((record) => {
    const timestamp = record.timestamp ? ` at ${record.timestamp}` : "";
    return `- \`${record.type || "unknown_event"}\`${timestamp}`;
  });

  return [
    "# Memory Candidate",
    "",
    "Status: `candidate_only`",
    "",
    `Source run: \`${params.runDir}\``,
    `Run id: \`${runId}\``,
    `Created at: ${new Date().toISOString()}`,
    `Run status: \`${params.manifest.status || "unknown"}\``,
    `Memory gate: \`${memoryGate.decision || "not_recorded"}\``,
    "",
    "## Reusable Claim",
    "",
    "This is a candidate, not durable memory. A human must decide whether the lesson is broadly reusable.",
    "",
    "## Applicability Conditions",
    "",
    "- Reuse only when the target context matches the source run evidence.",
    "- Reuse only when the verification command meaningfully covers the behavior being changed.",
    "- Do not reuse hidden model reasoning; use only recorded commands, outputs, diffs, and human-readable summaries.",
    "",
    "## Success And Failure Boundary",
    "",
    "- Success boundary: the run reached `VERIFIED` and recorded at least one verification command.",
    "- Failure boundary: if the same pattern lacks verification evidence, has a blocked memory gate, or applies to a materially different context, keep it local.",
    "",
    "## Evidence Paths",
    "",
    ...params.evidencePaths.map((evidencePath) => `- \`${relativeOrAbsolute(params.workspaceRoot, evidencePath)}\``),
    "",
    "## Event Evidence",
    "",
    ...(eventLines.length > 0 ? eventLines : ["- No evidence events were found."]),
    "",
    "## Commands",
    "",
    ...(commandLines.length > 0 ? commandLines : ["- No command records were found."]),
    "",
    "## Changed Files",
    "",
    ...(changedFiles.length > 0 ? changedFiles.map((filePath: string) => `- \`${filePath}\``) : ["- None reported."]),
    "",
    "## Result Summary",
    "",
    markdownExcerpt(params.resultMd),
    "",
    "## Verification Evidence",
    "",
    markdownExcerpt(params.verificationMd),
    "",
    "## Residual Risk",
    "",
    params.manifest.result_summary
      ? `Manifest summary: ${params.manifest.result_summary}`
      : "No manifest result summary was recorded.",
    "",
    "## Human Review Checklist",
    "",
    "- [ ] The candidate states a reusable causal pattern, not a one-off coincidence.",
    "- [ ] The evidence paths still exist and are inspectable.",
    "- [ ] The success/failure boundary is clear enough to prevent overgeneralization.",
    "- [ ] The residual risk is acceptable or explicitly documented.",
    "",
  ].join("\n");
}

async function extractMemoryCandidate(options?: MemoryCandidateOptions): Promise<MemoryCandidateReport | undefined> {
  const runDir = options?.runDir ?? await vscode.window.showInputBox({
    prompt: "Verified Run Ledger directory to extract from",
    value: inferRunDirFromActiveDocument(),
    placeHolder: String.raw`<workspace>\.bestqa\agent-runs\<run>`,
  });
  if (!runDir) {
    return;
  }

  const workspaceRoot = inferWorkspaceRootFromRunDir(runDir);
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("Cannot infer workspace root for this run.");
    return;
  }

  const manifestPath = path.join(runDir, "manifest.json");
  const evidencePath = path.join(runDir, "evidence.jsonl");
  const resultPath = path.join(runDir, "result.md");
  const verificationPath = path.join(runDir, "verification.md");
  const commandsPath = path.join(runDir, "commands.jsonl");
  const changesPath = path.join(runDir, "changes.json");
  const evidencePaths = [
    manifestPath,
    evidencePath,
    resultPath,
    verificationPath,
    commandsPath,
    changesPath,
  ];

  const reasons: string[] = [];
  for (const evidencePath of evidencePaths) {
    if (!(await pathExists(evidencePath))) {
      reasons.push(`Missing evidence file: ${evidencePath}`);
    }
  }
  if (reasons.length > 0) {
    vscode.window.showWarningMessage(`Memory candidate blocked: ${reasons[0]}`);
    return {
      status: "blocked",
      run_dir: runDir,
      reasons,
      evidence_paths: evidencePaths,
    };
  }

  let manifest: JsonObject;
  let evidenceEvents: JsonObject[];
  let resultMd: string;
  let verificationMd: string;
  let commands: JsonObject[];
  let changes: JsonObject;
  try {
    manifest = await readJsonFile(manifestPath);
    evidenceEvents = await readJsonlFile(evidencePath);
    resultMd = await fs.readFile(resultPath, "utf8");
    verificationMd = await fs.readFile(verificationPath, "utf8");
    commands = await readJsonlFile(commandsPath);
    changes = await readJsonFile(changesPath);
  } catch (error) {
    const reason = `Cannot read Run Ledger evidence: ${unknownErrorMessage(error)}`;
    vscode.window.showWarningMessage(`Memory candidate blocked: ${reason}`);
    return {
      status: "blocked",
      run_dir: runDir,
      reasons: [reason],
      evidence_paths: evidencePaths,
    };
  }
  const hasResultRecorded = evidenceEvents.some((record) => record.type === "result_recorded");
  const hasCommandRecorded = commands.some((record) => record.type === "command_recorded");
  const memoryGateDecision = String(manifest.memory_gate?.decision || "");

  if (manifest.status !== "VERIFIED") {
    reasons.push(`Run status is ${manifest.status || "unknown"}, not VERIFIED.`);
  }
  if (!verificationMd.trim()) {
    reasons.push("verification.md is empty.");
  }
  if (!hasResultRecorded) {
    reasons.push("evidence.jsonl has no result_recorded event.");
  }
  if (!hasCommandRecorded) {
    reasons.push("commands.jsonl has no command_recorded event.");
  }
  if (memoryGateDecision.toLowerCase() === "blocked") {
    reasons.push("manifest.memory_gate.decision is blocked.");
  }

  const channel =
    clearAiOutputChannel ??
    (clearAiOutputChannel = vscode.window.createOutputChannel("BestQ Clear AI"));
  if (options?.showOutput !== false) {
    channel.show(true);
  }

  if (reasons.length > 0) {
    channel.appendLine("Memory candidate extraction blocked:");
    for (const reason of reasons) {
      channel.appendLine(`- ${reason}`);
    }
    vscode.window.showWarningMessage(`Memory candidate blocked: ${reasons[0]}`);
    return {
      status: "blocked",
      run_dir: runDir,
      reasons,
      evidence_paths: evidencePaths,
    };
  }

  const runId = String(manifest.run_id || path.basename(runDir));
  const candidateDir = path.join(workspaceRoot, ".bestqa", "memory-candidates");
  await fs.mkdir(candidateDir, { recursive: true });
  const candidatePath = path.join(
    candidateDir,
    `${timestampForFile()}-${sanitizeFileSegment(runId)}.md`
  );
  const markdown = renderMemoryCandidateMarkdown({
    runDir,
    workspaceRoot,
    manifest,
    resultMd,
    verificationMd,
    evidenceEvents,
    commands,
    changes,
    evidencePaths,
  });
  await fs.writeFile(candidatePath, markdown, "utf8");

  channel.appendLine(`Memory candidate created: ${candidatePath}`);
  if (options?.openCandidate !== false) {
    const doc = await vscode.workspace.openTextDocument(candidatePath);
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage("ClearLoop memory candidate created for review.");
  }
  return {
    status: "created",
    run_dir: runDir,
    candidate_path: candidatePath,
    reasons: [],
    evidence_paths: evidencePaths,
  };
}

function cleanFsPathInput(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function extractBacktickField(markdown: string, label: string): string | undefined {
  const prefix = `${label}:`;
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith(prefix)) {
      continue;
    }
    return line.match(/`([^`]+)`/)?.[1];
  }
  return undefined;
}

function extractMarkdownSection(markdown: string, heading: string): string | undefined {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headingLine = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === headingLine);
  if (start < 0) {
    return undefined;
  }
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      break;
    }
    body.push(lines[index]);
  }
  return body.join("\n").trim();
}

function normalizeWorkspacePath(workspaceRoot: string, value: string): string {
  return path.normalize(path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value));
}

function isTodoValue(value: string | undefined): boolean {
  const trimmed = (value || "").trim();
  return !trimmed || /^todo\b/i.test(trimmed);
}

function candidateRequiredSectionReasons(candidateMarkdown: string): string[] {
  const requiredSections = [
    { label: "memory candidate heading", pattern: /^# Memory Candidate/m },
    { label: "candidate_only status", pattern: /Status:\s*`candidate_only`/ },
    { label: "reusable claim", pattern: /^## Reusable Claim/m },
    { label: "success/failure boundary", pattern: /^## Success And Failure Boundary/m },
    { label: "verification evidence", pattern: /^## Verification Evidence/m },
    { label: "human review checklist", pattern: /^## Human Review Checklist/m },
  ];
  return requiredSections
    .filter((section) => !section.pattern.test(candidateMarkdown))
    .map((section) => `Candidate is missing ${section.label}.`);
}

function sourceRunFromCandidate(workspaceRoot: string, candidateMarkdown: string): string | undefined {
  const sourceRunRaw = extractBacktickField(candidateMarkdown, "Source run");
  return sourceRunRaw ? normalizeWorkspacePath(workspaceRoot, sourceRunRaw) : undefined;
}

function renderMemoryReviewMarkdown(params: {
  candidatePath: string;
  sourceRun: string;
  workspaceRoot: string;
  candidateMarkdown: string;
  createdAt: string;
}): string {
  const reusableClaim = extractMarkdownSection(params.candidateMarkdown, "Reusable Claim") || "TODO: Write the reusable claim.";
  const applicability = extractMarkdownSection(params.candidateMarkdown, "Applicability Conditions") || "TODO: Define applicability conditions.";
  const boundary = extractMarkdownSection(params.candidateMarkdown, "Success And Failure Boundary") || "TODO: Define the success/failure boundary.";

  return [
    "# Memory Promotion Review",
    "",
    "Status: `review_pending`",
    "Schema: `clearloop.memory-review.v1`",
    "",
    `Created at: ${params.createdAt}`,
    `Source candidate: \`${relativeOrAbsolute(params.workspaceRoot, params.candidatePath)}\``,
    `Source run: \`${relativeOrAbsolute(params.workspaceRoot, params.sourceRun)}\``,
    "",
    "## Review Decision",
    "",
    "Decision: `pending`",
    "Accepted by: `TODO`",
    "",
    "## Human Review Note",
    "",
    "TODO: Explain why this should or should not become reusable memory.",
    "",
    "## Reusable Claim",
    "",
    reusableClaim,
    "",
    "## Applicability Conditions",
    "",
    applicability,
    "",
    "## Success And Failure Boundary",
    "",
    boundary,
    "",
    "## Review Checklist",
    "",
    "- [ ] The claim is reusable beyond this one run.",
    "- [ ] The verification evidence covers the intended behavior.",
    "- [ ] Failure conditions are explicit enough to prevent overgeneralization.",
    "- [ ] Residual risk is acceptable.",
    "",
    "## Source Candidate Snapshot",
    "",
    params.candidateMarkdown.trim(),
    "",
  ].join("\n");
}

function renderPromotedMemoryMarkdown(params: {
  candidatePath: string;
  reviewPath?: string;
  sourceRun: string;
  memoryPath: string;
  promotedAt: string;
  acceptedBy: string;
  reviewNote: string;
  reviewMarkdown?: string;
  candidateMarkdown: string;
  workspaceRoot: string;
}): string {
  return [
    "# Promoted Memory",
    "",
    "Status: `promoted_memory`",
    "Schema: `clearloop.memory.v1`",
    "",
    `Promoted at: ${params.promotedAt}`,
    `Accepted by: ${params.acceptedBy}`,
    `Source candidate: \`${relativeOrAbsolute(params.workspaceRoot, params.candidatePath)}\``,
    ...(params.reviewPath ? [`Source review: \`${relativeOrAbsolute(params.workspaceRoot, params.reviewPath)}\``] : []),
    `Source run: \`${relativeOrAbsolute(params.workspaceRoot, params.sourceRun)}\``,
    `Memory path: \`${relativeOrAbsolute(params.workspaceRoot, params.memoryPath)}\``,
    "",
    "## Human Acceptance",
    "",
    params.reviewNote,
    "",
    "## Reuse Boundary",
    "",
    "- This memory was promoted from a `candidate_only` ClearLoop memory candidate.",
    "- Reuse requires matching the source run context, evidence paths, and verification meaning.",
    "- Do not treat this as hidden model reasoning; only recorded evidence and human acceptance are durable.",
    "",
    ...(params.reviewMarkdown
      ? [
          "## Review Record Snapshot",
          "",
          params.reviewMarkdown.trim(),
          "",
        ]
      : []),
    "## Candidate Evidence Snapshot",
    "",
    params.candidateMarkdown.trim(),
    "",
  ].join("\n");
}

async function prepareMemoryReview(options?: PrepareMemoryReviewOptions): Promise<PrepareMemoryReviewReport | undefined> {
  const candidateInput = options?.candidatePath ?? await vscode.window.showInputBox({
    prompt: "Memory candidate file to prepare for review",
    value: inferCandidatePathFromActiveDocument(),
    placeHolder: String.raw`<workspace>\.bestqa\memory-candidates\<candidate>.md`,
  });
  if (!candidateInput) {
    return;
  }

  const candidatePath = cleanFsPathInput(candidateInput);
  const workspaceRoot = inferWorkspaceRootFromBestqaPath(candidatePath, "memory-candidates");
  const initialEvidencePaths = [candidatePath];
  const blocked = (
    reasons: string[],
    evidencePaths: string[] = initialEvidencePaths,
    sourceRun?: string
  ): PrepareMemoryReviewReport => {
    vscode.window.showWarningMessage(`Memory review blocked: ${reasons[0]}`);
    return {
      status: "blocked",
      candidate_path: candidatePath,
      source_run: sourceRun,
      reasons,
      evidence_paths: evidencePaths,
    };
  };

  if (!workspaceRoot) {
    return blocked(["Candidate must be under <workspace>/.bestqa/memory-candidates/."]);
  }

  const candidateRoot = path.join(workspaceRoot, ".bestqa", "memory-candidates");
  if (!isPathInside(candidateRoot, candidatePath)) {
    return blocked(["Candidate path is outside the workspace memory-candidates directory."]);
  }

  let candidateMarkdown: string;
  try {
    candidateMarkdown = await fs.readFile(candidatePath, "utf8");
  } catch (error) {
    return blocked([`Cannot read memory candidate: ${unknownErrorMessage(error)}`]);
  }

  const reasons = candidateRequiredSectionReasons(candidateMarkdown);
  const sourceRun = sourceRunFromCandidate(workspaceRoot, candidateMarkdown);
  if (!sourceRun) {
    reasons.push("Candidate is missing Source run.");
  }

  const evidencePaths = sourceRun
    ? [
        candidatePath,
        path.join(sourceRun, "manifest.json"),
        path.join(sourceRun, "evidence.jsonl"),
        path.join(sourceRun, "verification.md"),
        path.join(sourceRun, "result.md"),
      ]
    : initialEvidencePaths;

  if (sourceRun) {
    const runRoot = path.join(workspaceRoot, ".bestqa", "agent-runs");
    if (!isPathInside(runRoot, sourceRun)) {
      reasons.push("Source run is outside the workspace agent-runs directory.");
    }
    for (const evidencePath of evidencePaths) {
      if (!(await pathExists(evidencePath))) {
        reasons.push(`Missing source evidence: ${evidencePath}`);
      }
    }
  }

  if (sourceRun && reasons.length === 0) {
    try {
      const sourceManifest = await readJsonFile(path.join(sourceRun, "manifest.json"));
      const status = String(sourceManifest.status || "unknown");
      const memoryGateDecision = String(sourceManifest.memory_gate?.decision || "");
      if (status !== "VERIFIED") {
        reasons.push(`Source run status is ${status}, not VERIFIED.`);
      }
      if (memoryGateDecision.toLowerCase() === "blocked") {
        reasons.push("Source run memory gate is blocked.");
      }
    } catch (error) {
      reasons.push(`Cannot read source run manifest: ${unknownErrorMessage(error)}`);
    }
  }

  if (reasons.length > 0) {
    return blocked(reasons, evidencePaths, sourceRun);
  }

  const createdAt = new Date().toISOString();
  const reviewDir = path.join(workspaceRoot, ".bestqa", "memory-reviews");
  await fs.mkdir(reviewDir, { recursive: true });
  const reviewPath = path.join(
    reviewDir,
    `${timestampForFile(new Date(createdAt))}-${sanitizeFileSegment(path.basename(candidatePath, ".md"))}.md`
  );
  await fs.writeFile(
    reviewPath,
    renderMemoryReviewMarkdown({
      candidatePath,
      sourceRun: sourceRun!,
      workspaceRoot,
      candidateMarkdown,
      createdAt,
    }),
    "utf8"
  );

  const channel =
    clearAiOutputChannel ??
    (clearAiOutputChannel = vscode.window.createOutputChannel("BestQ Clear AI"));
  if (options?.showOutput !== false) {
    channel.show(true);
  }
  channel.appendLine(`Memory promotion review created: ${reviewPath}`);

  if (options?.openReview !== false) {
    const doc = await vscode.workspace.openTextDocument(reviewPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage("ClearLoop memory review created.");
  }

  return {
    status: "created",
    candidate_path: candidatePath,
    source_run: sourceRun,
    review_path: reviewPath,
    reasons: [],
    evidence_paths: evidencePaths,
  };
}

async function promoteMemoryCandidate(
  options?: PromoteMemoryCandidateOptions
): Promise<PromoteMemoryCandidateReport | undefined> {
  const reviewInput = options?.reviewPath ?? inferReviewPathFromActiveDocument();
  let reviewPath: string | undefined;
  let reviewMarkdown: string | undefined;
  let reviewCandidatePath: string | undefined;
  let reviewAccepted: boolean | undefined;
  let reviewAcceptedBy: string | undefined;
  let reviewNoteFromFile: string | undefined;
  let reviewSourceRun: string | undefined;
  let workspaceRootFromReview: string | undefined;

  if (reviewInput) {
    reviewPath = path.normalize(cleanFsPathInput(reviewInput));
    workspaceRootFromReview = inferWorkspaceRootFromBestqaPath(reviewPath, "memory-reviews");
    if (!workspaceRootFromReview) {
      vscode.window.showWarningMessage("Memory promotion blocked: Review must be under <workspace>/.bestqa/memory-reviews/.");
      return {
        status: "blocked",
        candidate_path: options?.candidatePath ?? reviewPath,
        review_path: reviewPath,
        reasons: ["Review must be under <workspace>/.bestqa/memory-reviews/."],
        evidence_paths: [reviewPath],
      };
    }
    const reviewRoot = path.join(workspaceRootFromReview, ".bestqa", "memory-reviews");
    if (!isPathInside(reviewRoot, reviewPath)) {
      vscode.window.showWarningMessage("Memory promotion blocked: Review path is outside the workspace memory-reviews directory.");
      return {
        status: "blocked",
        candidate_path: options?.candidatePath ?? reviewPath,
        review_path: reviewPath,
        reasons: ["Review path is outside the workspace memory-reviews directory."],
        evidence_paths: [reviewPath],
      };
    }
    try {
      reviewMarkdown = await fs.readFile(reviewPath, "utf8");
    } catch (error) {
      vscode.window.showWarningMessage(`Memory promotion blocked: Cannot read memory review: ${unknownErrorMessage(error)}`);
      return {
        status: "blocked",
        candidate_path: options?.candidatePath ?? reviewPath,
        review_path: reviewPath,
        reasons: [`Cannot read memory review: ${unknownErrorMessage(error)}`],
        evidence_paths: [reviewPath],
      };
    }

    const candidateFromReview = extractBacktickField(reviewMarkdown, "Source candidate");
    const sourceRunFromReview = extractBacktickField(reviewMarkdown, "Source run");
    reviewCandidatePath = candidateFromReview
      ? normalizeWorkspacePath(workspaceRootFromReview, candidateFromReview)
      : undefined;
    reviewSourceRun = sourceRunFromReview
      ? normalizeWorkspacePath(workspaceRootFromReview, sourceRunFromReview)
      : undefined;
    reviewAccepted = extractBacktickField(reviewMarkdown, "Decision")?.toLowerCase() === "accepted";
    reviewAcceptedBy = extractBacktickField(reviewMarkdown, "Accepted by");
    reviewNoteFromFile = extractMarkdownSection(reviewMarkdown, "Human Review Note");
  }

  const candidateInput = options?.candidatePath ?? reviewCandidatePath ?? await vscode.window.showInputBox({
    prompt: "Memory candidate file to promote",
    value: inferCandidatePathFromActiveDocument(),
    placeHolder: String.raw`<workspace>\.bestqa\memory-candidates\<candidate>.md`,
  });
  if (!candidateInput) {
    return;
  }

  const candidatePath = path.normalize(cleanFsPathInput(candidateInput));
  const workspaceRoot = inferWorkspaceRootFromBestqaPath(candidatePath, "memory-candidates");
  const initialEvidencePaths = reviewPath ? [reviewPath, candidatePath] : [candidatePath];

  const blocked = (
    reasons: string[],
    evidencePaths: string[] = initialEvidencePaths,
    sourceRun?: string
  ): PromoteMemoryCandidateReport => {
    vscode.window.showWarningMessage(`Memory promotion blocked: ${reasons[0]}`);
    return {
      status: "blocked",
      candidate_path: candidatePath,
      review_path: reviewPath,
      source_run: sourceRun,
      reasons,
      evidence_paths: evidencePaths,
    };
  };

  if (!workspaceRoot) {
    return blocked(["Candidate must be under <workspace>/.bestqa/memory-candidates/."]);
  }
  if (workspaceRootFromReview && workspaceRootFromReview !== workspaceRoot) {
    return blocked(["Review and candidate must belong to the same workspace."]);
  }

  const candidateRoot = path.join(workspaceRoot, ".bestqa", "memory-candidates");
  if (!isPathInside(candidateRoot, candidatePath)) {
    return blocked(["Candidate path is outside the workspace memory-candidates directory."]);
  }

  let candidateMarkdown: string;
  try {
    candidateMarkdown = await fs.readFile(candidatePath, "utf8");
  } catch (error) {
    return blocked([`Cannot read memory candidate: ${unknownErrorMessage(error)}`]);
  }

  const reasons: string[] = candidateRequiredSectionReasons(candidateMarkdown);
  if (reviewCandidatePath && path.normalize(reviewCandidatePath) !== candidatePath) {
    reasons.push("Review Source candidate does not match the candidate being promoted.");
  }

  const sourceRun = sourceRunFromCandidate(workspaceRoot, candidateMarkdown);
  if (!sourceRun) {
    reasons.push("Candidate is missing Source run.");
  }
  if (reviewSourceRun && sourceRun && path.normalize(reviewSourceRun) !== path.normalize(sourceRun)) {
    reasons.push("Review Source run does not match the candidate Source run.");
  }

  const evidencePaths = sourceRun
    ? [
        ...(reviewPath ? [reviewPath] : []),
        candidatePath,
        path.join(sourceRun, "manifest.json"),
        path.join(sourceRun, "evidence.jsonl"),
        path.join(sourceRun, "verification.md"),
        path.join(sourceRun, "result.md"),
      ]
    : initialEvidencePaths;

  if (sourceRun) {
    const runRoot = path.join(workspaceRoot, ".bestqa", "agent-runs");
    if (!isPathInside(runRoot, sourceRun)) {
      reasons.push("Source run is outside the workspace agent-runs directory.");
    }
    for (const evidencePath of evidencePaths) {
      if (!(await pathExists(evidencePath))) {
        reasons.push(`Missing source evidence: ${evidencePath}`);
      }
    }
  }

  let sourceManifest: JsonObject | undefined;
  if (sourceRun && reasons.length === 0) {
    try {
      sourceManifest = await readJsonFile(path.join(sourceRun, "manifest.json"));
    } catch (error) {
      reasons.push(`Cannot read source run manifest: ${unknownErrorMessage(error)}`);
    }
  }

  if (sourceManifest) {
    const status = String(sourceManifest.status || "unknown");
    const memoryGateDecision = String(sourceManifest.memory_gate?.decision || "");
    if (status === "PROMOTED_TO_MEMORY") {
      reasons.push("Source run is already PROMOTED_TO_MEMORY.");
    } else if (status !== "VERIFIED") {
      reasons.push(`Source run status is ${status}, not VERIFIED.`);
    }
    if (memoryGateDecision.toLowerCase() === "blocked") {
      reasons.push("Source run memory gate is blocked.");
    }
  }

  if (reasons.length > 0) {
    return blocked(reasons, evidencePaths, sourceRun);
  }

  let accepted = options?.accepted ?? reviewAccepted;
  if (accepted === undefined) {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: "Promote candidate",
          description: "I accept the residual risk and want this stored as local reusable memory",
          accepted: true,
        },
        {
          label: "Cancel",
          description: "Keep this as candidate_only",
          accepted: false,
        },
      ],
      {
        title: "ClearLoop memory promotion gate",
        placeHolder: "Promotion requires explicit human acceptance",
      }
    );
    accepted = choice?.accepted ?? false;
  }
  if (!accepted) {
    return blocked(["Human acceptance was not granted."], evidencePaths, sourceRun);
  }

  const acceptedBy = options?.acceptedBy ??
    (!isTodoValue(reviewAcceptedBy) ? reviewAcceptedBy : undefined) ??
    await vscode.window.showInputBox({
    prompt: "Accepted by",
    value: os.userInfo().username || "human",
  });
  if (!acceptedBy?.trim()) {
    return blocked(["Accepted-by identity is required."], evidencePaths, sourceRun);
  }

  const reviewNote = options?.reviewNote ??
    (!isTodoValue(reviewNoteFromFile) ? reviewNoteFromFile : undefined) ??
    await vscode.window.showInputBox({
    prompt: "Human review note",
    value: "Accepted as reusable memory because the evidence and verification boundary were reviewed.",
  });
  if (!reviewNote?.trim()) {
    return blocked(["Human review note is required."], evidencePaths, sourceRun);
  }

  const promotedAt = new Date().toISOString();
  const memoryDir = path.join(workspaceRoot, ".bestqa", "memory", "promoted");
  const memoryPath = path.join(
    memoryDir,
    `${timestampForFile(new Date(promotedAt))}-${sanitizeFileSegment(path.basename(candidatePath, ".md"))}.md`
  );
  const promotionRecordPath = path.join(workspaceRoot, ".bestqa", "memory", "promotions.jsonl");
  const memoryMarkdown = renderPromotedMemoryMarkdown({
    candidatePath,
    reviewPath,
    sourceRun: sourceRun!,
    memoryPath,
    promotedAt,
    acceptedBy: acceptedBy.trim(),
    reviewNote: reviewNote.trim(),
    reviewMarkdown,
    candidateMarkdown,
    workspaceRoot,
  });
  const promotionRecord = {
    ts: promotedAt,
    type: "memory_promoted",
    schema_version: "clearloop.memory-promotion.v1",
    candidate_path: candidatePath,
    review_path: reviewPath,
    source_run: sourceRun,
    memory_path: memoryPath,
    accepted_by: acceptedBy.trim(),
    review_note: reviewNote.trim(),
  };

  try {
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.writeFile(memoryPath, memoryMarkdown, "utf8");
    await appendJsonl(promotionRecordPath, promotionRecord);

    const manifestPath = path.join(sourceRun!, "manifest.json");
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify({
        ...sourceManifest,
        status: "PROMOTED_TO_MEMORY",
        memory_gate: {
          ...(sourceManifest?.memory_gate ?? {}),
          decision: "promoted",
          reason: reviewNote.trim(),
          promoted_at: promotedAt,
          accepted_by: acceptedBy.trim(),
          review_path: reviewPath,
          memory_path: memoryPath,
        },
      }, null, 2)}\n`,
      "utf8"
    );
    await appendJsonl(path.join(sourceRun!, "evidence.jsonl"), promotionRecord);
  } catch (error) {
    return blocked([`Cannot write promoted memory: ${unknownErrorMessage(error)}`], evidencePaths, sourceRun);
  }

  const channel =
    clearAiOutputChannel ??
    (clearAiOutputChannel = vscode.window.createOutputChannel("BestQ Clear AI"));
  if (options?.showOutput !== false) {
    channel.show(true);
  }
  channel.appendLine(`Promoted memory candidate: ${memoryPath}`);

  if (options?.openMemory !== false) {
    const doc = await vscode.workspace.openTextDocument(memoryPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage("ClearLoop memory candidate promoted.");
  }

  return {
    status: "promoted",
    candidate_path: candidatePath,
    review_path: reviewPath,
    source_run: sourceRun,
    memory_path: memoryPath,
    promotion_record_path: promotionRecordPath,
    reasons: [],
    evidence_paths: evidencePaths,
  };
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

    vscode.commands.registerCommand("clearLoop.verifyRunResult", verifyRunResult),

    vscode.commands.registerCommand("clearLoop.extractMemoryCandidate", extractMemoryCandidate),

    vscode.commands.registerCommand("clearLoop.prepareMemoryReview", prepareMemoryReview),

    vscode.commands.registerCommand("clearLoop.promoteMemoryCandidate", promoteMemoryCandidate),

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
