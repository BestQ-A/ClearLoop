import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

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
});
