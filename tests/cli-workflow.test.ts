import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli repo and change workflow", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-workflow-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("understands the repo, prepares a change package, and records searchable memory", async () => {
    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    await runCli(["dashboard", "ingest", "--service", "svc-api", "--json"]);
    const plan = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const runId = JSON.parse(plan.stdout).run.id;
    await runCli(["test", "generate-plan", "--target", "service", "--json"]);
    await runCli(["test", "run", "--plan", "latest", "--json"]);
    await runCli([
      "approval",
      "record",
      "--run",
      runId,
      "--source",
      "slack",
      "--status",
      "approved",
      "--by",
      "anand",
      "--json"
    ]);

    const approvalPackage = await runCli([
      "approval",
      "package",
      "--run",
      runId,
      "--include-plan",
      "--include-diff",
      "--include-tests",
      "--json"
    ]);
    const approvalPackagePayload = JSON.parse(approvalPackage.stdout);
    expect(approvalPackagePayload.ok).toBe(true);
    expect(approvalPackagePayload.package.plan).toBeTruthy();
    expect(approvalPackagePayload.package.diff.files.length).toBeGreaterThan(0);
    expect(approvalPackagePayload.package.tests.length).toBeGreaterThan(0);
    expect(approvalPackagePayload.package.pluginPayloads.slack.text).toContain(runId);
    expect(approvalPackagePayload.package.pluginPayloads.slack.metadata.requiresApproval).toBe(true);

    const repoUnderstand = await runCli([
      "repo",
      "understand",
      "--context",
      ".sentinelops/context.json",
      "--json"
    ]);
    const repoPayload = JSON.parse(repoUnderstand.stdout);
    expect(repoPayload.ok).toBe(true);
    expect(repoPayload.repo.packageManager).toBe("npm");
    expect(repoPayload.repo.testFrameworks).toContain("vitest");

    const changePrepare = await runCli([
      "change",
      "prepare",
      "--target",
      "https://github.com/example/repo/issues/77",
      "--json"
    ]);
    const changePreparePayload = JSON.parse(changePrepare.stdout);
    expect(changePreparePayload.ok).toBe(true);
    expect(changePreparePayload.run.githubTarget).toContain("/issues/77");
    expect(changePreparePayload.change.summary).toContain("public-api");

    const changeDiff = await runCli(["change", "diff", "--run", runId, "--json"]);
    const changeDiffPayload = JSON.parse(changeDiff.stdout);
    expect(changeDiffPayload.ok).toBe(true);
    expect(changeDiffPayload.diff.files.length).toBeGreaterThan(0);

    const changeTest = await runCli(["change", "test", "--run", runId, "--json"]);
    const changeTestPayload = JSON.parse(changeTest.stdout);
    expect(changeTestPayload.ok).toBe(true);
    expect(changeTestPayload.report.summary).toContain("passed");

    const changeSummary = await runCli(["change", "summarize", "--run", runId, "--json"]);
    const changeSummaryPayload = JSON.parse(changeSummary.stdout);
    expect(changeSummaryPayload.ok).toBe(true);
    expect(changeSummaryPayload.summary).toContain("approved");

    const githubPackage = await runCli(["github", "result-package", "--run", runId, "--json"]);
    const githubPayload = JSON.parse(githubPackage.stdout);
    expect(githubPayload.ok).toBe(true);
    expect(githubPayload.resultPackage.runId).toBe(runId);
    expect(githubPayload.resultPackage.latestApproval?.status).toBe("approved");
    expect(githubPayload.resultPackage.readiness.ready).toBe(true);
    expect(githubPayload.resultPackage.readiness.requiresPlugin).toBe(true);
    expect(githubPayload.resultPackage.pluginPayloads.github.commentBody).toContain(runId);
    expect(githubPayload.resultPackage.pluginPayloads.github.status).toBe("approved");
    expect(githubPayload.resultPackage.pluginPayloads.github.closeIssue).toBe(false);
    expect(githubPayload.resultPackage.pluginPayloads.slack.text).toContain("SentinelOps follow-up");

    const pushRecord = await runCli([
      "push",
      "record",
      "--run",
      runId,
      "--commit",
      "abc123def456",
      "--json"
    ]);
    const pushRecordPayload = JSON.parse(pushRecord.stdout);
    expect(pushRecordPayload.ok).toBe(true);

    const incidentResolve = await runCli([
      "dashboard",
      "incident",
      "resolve",
      "--run",
      runId,
      "--incident",
      "inc-post-1",
      "--json"
    ]);
    const incidentResolvePayload = JSON.parse(incidentResolve.stdout);
    expect(incidentResolvePayload.ok).toBe(true);
    expect(incidentResolvePayload.incident.id).toBe("inc-post-1");
    expect(incidentResolvePayload.incident.status).toBe("resolved");
    expect(incidentResolvePayload.incident.linkedGithub.issueUrl).toContain("/issues/77");

    const finalReport = await runCli(["report", "create", "--run", runId, "--json"]);
    const finalReportPayload = JSON.parse(finalReport.stdout);
    expect(finalReportPayload.ok).toBe(true);
    expect(finalReportPayload.report.latestApproval?.status).toBe("approved");
    expect(finalReportPayload.report.githubTarget).toContain("/issues/77");
    expect(finalReportPayload.report.commitSha).toBe("abc123def456");
    expect(finalReportPayload.report.finalOutcome).toContain("inc-post-1");
    expect(finalReportPayload.report.diff.files.length).toBeGreaterThan(0);
    expect(finalReportPayload.report.auditTrail.some((entry: { action: string }) => entry.action === "push.record")).toBe(true);
    expect(finalReportPayload.report.auditTrail.some((entry: { action: string }) => entry.action === "dashboard.incident.resolve")).toBe(true);
    expect(finalReportPayload.report.auditTrail.some((entry: { action: string }) => entry.action === "report.create")).toBe(true);

    const memoryUpdate = await runCli(["repo", "memory", "update", "--run", runId, "--json"]);
    const memoryUpdatePayload = JSON.parse(memoryUpdate.stdout);
    expect(memoryUpdatePayload.ok).toBe(true);
    expect(memoryUpdatePayload.entry.runId).toBe(runId);

    const repoMemoryShow = await runCli(["repo", "memory", "show", "--json"]);
    const repoMemoryPayload = JSON.parse(repoMemoryShow.stdout);
    expect(repoMemoryPayload.ok).toBe(true);
    expect(repoMemoryPayload.entries.some((entry: { runId: string }) => entry.runId === runId)).toBe(true);

    const memorySearch = await runCli(["memory", "search", "--target", "svc-api", "--json"]);
    const memorySearchPayload = JSON.parse(memorySearch.stdout);
    expect(memorySearchPayload.ok).toBe(true);
    expect(memorySearchPayload.matches.some((entry: { runId: string }) => entry.runId === runId)).toBe(true);
  });
});
