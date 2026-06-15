import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("automation workflow", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-automation-workflow-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("runs the issue intake, approval, agent execution, and result packaging flow", async () => {
    await runCli([
      "init",
      "--repo",
      "example/repo",
      "--slack-channel",
      "#ops-approvals",
      "--agent-command",
      "node",
      "--agent-args",
      "[\"-e\",\"console.log('The requested feature is already implemented and can be validated before closing the issue.')\"]",
      "--enabled",
      "true",
      "--json"
    ]);

    const issue = await runCli([
      "automation",
      "seed-issue",
      "--target",
      "https://github.com/example/repo/issues/77",
      "--service",
      "svc-api",
      "--json"
    ]);
    const issuePayload = JSON.parse(issue.stdout);
    expect(issuePayload.ok).toBe(true);
    expect(issuePayload.job.status).toBe("awaiting_approval");

    const approve = await runCli([
      "automation",
      "approve",
      "--job",
      issuePayload.job.id,
      "--by",
      "anand",
      "--json"
    ]);
    const approvePayload = JSON.parse(approve.stdout);
    expect(approvePayload.ok).toBe(true);
    expect(approvePayload.job.status).toBe("approved");

    const run = await runCli(["automation", "run", "--job", issuePayload.job.id, "--json"]);
    const runPayload = JSON.parse(run.stdout);
    expect(runPayload.ok).toBe(true);
    expect(runPayload.job.status).toBe("completed");
    expect(runPayload.execution.summary).toContain("already implemented");

    const result = await runCli(["github", "result-package", "--run", issuePayload.run.id, "--json"]);
    const resultPayload = JSON.parse(result.stdout);
    expect(resultPayload.ok).toBe(true);
    expect(resultPayload.resultPackage.executionSummary).toContain("already implemented");
    expect(resultPayload.resultPackage.automationOutcome.classification).toBe("already_done");
    expect(resultPayload.resultPackage.pluginPayloads.github.closeIssue).toBe(true);
    expect(resultPayload.resultPackage.pluginPayloads.github.issueState).toBe("closed");
    expect(resultPayload.resultPackage.pluginPayloads.slack.text).toContain("close the issue");
  });
});
