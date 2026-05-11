import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

async function createRunLedger(workspaceRoot: string, runId: string): Promise<string> {
  const runDir = path.join(workspaceRoot, ".bestqa", "agent-runs", runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, "manifest.json"),
    `${JSON.stringify({
      schema_version: "run-ledger.v1",
      run_id: runId,
      status: "WAITING_FOR_REVIEW",
      workflow: {
        stage: "review",
      },
    }, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(path.join(runDir, "evidence.jsonl"), "", "utf8");
  await fs.writeFile(path.join(runDir, "commands.jsonl"), "", "utf8");
  await fs.writeFile(
    path.join(runDir, "changes.json"),
    `${JSON.stringify({
      schema_version: "run-ledger.v1",
      status: "WAITING_FOR_REVIEW",
      changed_files: [],
    }, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(path.join(runDir, "verification.md"), "# Verification\n\nNot run yet.\n", "utf8");
  await fs.writeFile(path.join(runDir, "result.md"), "# Agent Result\n\nWaiting for verification.\n", "utf8");
  return runDir;
}

suite("ClearLoop CLI agent preflight", () => {
  test("registers and runs quick CLI agent check without UI prompts", async function () {
    this.timeout(60000);

    const extension = vscode.extensions.getExtension("bestqa.clearloop");
    assert.ok(extension, "ClearLoop extension should be discoverable by id");
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("clearLoop.checkCliAgents"),
      "clearLoop.checkCliAgents command should be registered"
    );
    assert.ok(
      commands.includes("clearLoop.openRunLedger"),
      "clearLoop.openRunLedger command should be registered"
    );

    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clearloop-vscode-smoke-"));
    const report = await vscode.commands.executeCommand<any>("clearLoop.checkCliAgents", {
      mode: "quick",
      workspaceRoot,
      openReport: false,
      showOutput: false,
    });

    assert.ok(report, "quick preflight should return a report");
    assert.strictEqual(report.schema_version, "clearloop.cli-agent-check.v1");
    assert.strictEqual(report.mode, "quick");
    assert.strictEqual(report.workspace_root, workspaceRoot);
    assert.ok(report.report_path, "report_path should be returned");

    const reportJson = JSON.parse(await fs.readFile(report.report_path, "utf8"));
    assert.strictEqual(reportJson.mode, "quick");
    assert.strictEqual(reportJson.report_path, report.report_path);
    assert.deepStrictEqual(
      reportJson.agents.map((agent: any) => agent.agent_id).sort(),
      ["claude", "codex"]
    );
    for (const agent of reportJson.agents) {
      assert.notStrictEqual(
        agent.readiness,
        "usable",
        "quick preflight must not claim real CLI usability"
      );
      assert.ok(agent.path_check, "path_check should be recorded");
      assert.ok(agent.help_check, "help_check should be recorded");
      assert.ok(agent.boundary, "boundary should be recorded");
    }
  });

  test("runs verification command and records Run Ledger result", async function () {
    this.timeout(60000);

    const extension = vscode.extensions.getExtension("bestqa.clearloop");
    assert.ok(extension, "ClearLoop extension should be discoverable by id");
    await extension.activate();

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(workspaceRoot, "test host should open the repository workspace");

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("clearLoop.verifyRunResult"),
      "clearLoop.verifyRunResult command should be registered"
    );

    const runDir = await createRunLedger(workspaceRoot, `verify-smoke-${Date.now()}`);
    const report = await vscode.commands.executeCommand<any>("clearLoop.verifyRunResult", {
      runDir,
      command: "echo CLEARLOOP_VERIFY_SMOKE_OK",
      timeoutMs: 30000,
      openReport: false,
      showOutput: false,
    });

    assert.ok(report, "verification command should return a report");
    assert.strictEqual(report.status, "VERIFIED");
    assert.strictEqual(report.command, "echo CLEARLOOP_VERIFY_SMOKE_OK");
    assert.strictEqual(report.exit_code, 0);
    assert.ok(report.output_path, "verification output path should be returned");

    const output = await fs.readFile(report.output_path, "utf8");
    assert.match(output, /CLEARLOOP_VERIFY_SMOKE_OK/);

    const manifest = JSON.parse(await fs.readFile(path.join(runDir, "manifest.json"), "utf8"));
    assert.strictEqual(manifest.status, "VERIFIED");

    const verificationMd = await fs.readFile(path.join(runDir, "verification.md"), "utf8");
    assert.match(verificationMd, /CLEARLOOP_VERIFY_SMOKE_OK/);

    const commandsJsonl = await fs.readFile(path.join(runDir, "commands.jsonl"), "utf8");
    assert.match(commandsJsonl, /command_recorded/);
    assert.match(commandsJsonl, /passed/);
  });

  test("extracts memory candidate only from verified Run Ledger", async function () {
    this.timeout(60000);

    const extension = vscode.extensions.getExtension("bestqa.clearloop");
    assert.ok(extension, "ClearLoop extension should be discoverable by id");
    await extension.activate();

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(workspaceRoot, "test host should open the repository workspace");

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("clearLoop.extractMemoryCandidate"),
      "clearLoop.extractMemoryCandidate command should be registered"
    );
    assert.ok(
      commands.includes("clearLoop.prepareMemoryReview"),
      "clearLoop.prepareMemoryReview command should be registered"
    );
    assert.ok(
      commands.includes("clearLoop.promoteMemoryCandidate"),
      "clearLoop.promoteMemoryCandidate command should be registered"
    );
    assert.ok(
      commands.includes("clearLoop.openMemoryReviews"),
      "clearLoop.openMemoryReviews command should be registered"
    );

    const verifiedRunDir = await createRunLedger(workspaceRoot, `memory-smoke-${Date.now()}`);
    await vscode.commands.executeCommand<any>("clearLoop.verifyRunResult", {
      runDir: verifiedRunDir,
      command: "echo CLEARLOOP_MEMORY_SMOKE_OK",
      timeoutMs: 30000,
      openReport: false,
      showOutput: false,
    });

    const created = await vscode.commands.executeCommand<any>("clearLoop.extractMemoryCandidate", {
      runDir: verifiedRunDir,
      openCandidate: false,
      showOutput: false,
    });
    assert.strictEqual(created.status, "created");
    assert.ok(created.candidate_path, "candidate path should be returned");

    const candidate = await fs.readFile(created.candidate_path, "utf8");
    assert.match(candidate, /# Memory Candidate/);
    assert.match(candidate, /candidate_only/);
    assert.match(candidate, /CLEARLOOP_MEMORY_SMOKE_OK/);
    assert.match(candidate, /manifest\.json/);
    assert.match(candidate, /evidence\.jsonl/);
    assert.match(candidate, /result_recorded/);
    assert.match(candidate, /verification\.md/);

    const review = await vscode.commands.executeCommand<any>("clearLoop.prepareMemoryReview", {
      candidatePath: created.candidate_path,
      openReview: false,
      showOutput: false,
    });
    assert.strictEqual(review.status, "created");
    assert.ok(review.review_path, "review path should be returned");

    const pendingReview = await fs.readFile(review.review_path, "utf8");
    assert.match(pendingReview, /# Memory Promotion Review/);
    assert.match(pendingReview, /review_pending/);
    assert.match(pendingReview, /Decision: `pending`/);
    assert.match(pendingReview, /Source candidate:/);

    const declined = await vscode.commands.executeCommand<any>("clearLoop.promoteMemoryCandidate", {
      reviewPath: review.review_path,
      openMemory: false,
      showOutput: false,
    });
    assert.strictEqual(declined.status, "blocked");
    assert.ok(
      declined.reasons.some((reason: string) => reason.includes("Human acceptance")),
      "promotion should require explicit human acceptance"
    );

    await fs.writeFile(
      review.review_path,
      pendingReview
        .replace("Decision: `pending`", "Decision: `accepted`")
        .replace("Accepted by: `TODO`", "Accepted by: `extension-host-review`")
        .replace(
          "TODO: Explain why this should or should not become reusable memory.",
          "Accepted because the editable review preserved the verification boundary."
        ),
      "utf8"
    );

    const promoted = await vscode.commands.executeCommand<any>("clearLoop.promoteMemoryCandidate", {
      reviewPath: review.review_path,
      openMemory: false,
      showOutput: false,
    });
    assert.strictEqual(promoted.status, "promoted");
    assert.ok(promoted.memory_path, "promoted memory path should be returned");
    assert.ok(promoted.promotion_record_path, "promotion index path should be returned");

    const memory = await fs.readFile(promoted.memory_path, "utf8");
    assert.match(memory, /# Promoted Memory/);
    assert.match(memory, /promoted_memory/);
    assert.match(memory, /Source review:/);
    assert.match(memory, /extension-host-review/);
    assert.match(memory, /CLEARLOOP_MEMORY_SMOKE_OK/);

    const promotedManifest = JSON.parse(await fs.readFile(path.join(verifiedRunDir, "manifest.json"), "utf8"));
    assert.strictEqual(promotedManifest.status, "PROMOTED_TO_MEMORY");
    assert.strictEqual(promotedManifest.memory_gate.decision, "promoted");
    assert.strictEqual(promotedManifest.memory_gate.accepted_by, "extension-host-review");
    assert.strictEqual(promotedManifest.memory_gate.review_path, review.review_path);

    const promotedEvidence = await fs.readFile(path.join(verifiedRunDir, "evidence.jsonl"), "utf8");
    assert.match(promotedEvidence, /memory_promoted/);

    const promotionIndex = await fs.readFile(promoted.promotion_record_path, "utf8");
    assert.match(promotionIndex, /memory_promoted/);
    assert.match(promotionIndex, /extension-host-review/);

    const unverifiedRunDir = await createRunLedger(workspaceRoot, `memory-blocked-${Date.now()}`);
    const blocked = await vscode.commands.executeCommand<any>("clearLoop.extractMemoryCandidate", {
      runDir: unverifiedRunDir,
      openCandidate: false,
      showOutput: false,
    });
    assert.strictEqual(blocked.status, "blocked");
    assert.ok(!blocked.candidate_path, "blocked extraction must not create a candidate file");
    assert.ok(
      blocked.reasons.some((reason: string) => reason.includes("not VERIFIED")),
      "blocked extraction should explain the missing VERIFIED status"
    );
  });
});
