import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli command surface coverage", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-command-surface-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("covers the plan-named read and status commands directly", async () => {
    const scenario = await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    const scenarioPayload = JSON.parse(scenario.stdout);
    expect(scenarioPayload.ok).toBe(true);
    expect(scenarioPayload.counts.incidents).toBe(1);

    const ingest = await runCli(["dashboard", "ingest", "--service", "svc-api", "--json"]);
    const ingestPayload = JSON.parse(ingest.stdout);
    expect(ingestPayload.ok).toBe(true);
    const runId = ingestPayload.run.id as string;

    const contextShow = await runCli(["context", "show", "--latest", "--json"]);
    const contextShowPayload = JSON.parse(contextShow.stdout);
    expect(contextShowPayload.ok).toBe(true);
    expect(contextShowPayload.context.service.id).toBe("svc-api");

    const planCreate = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const planCreatePayload = JSON.parse(planCreate.stdout);
    expect(planCreatePayload.ok).toBe(true);

    const planShow = await runCli(["plan", "show", "--latest", "--json"]);
    const planShowPayload = JSON.parse(planShow.stdout);
    expect(planShowPayload.ok).toBe(true);
    expect(planShowPayload.run.plan.summary).toContain("public-api");

    const planRisk = await runCli(["plan", "risk", "--plan", "latest", "--json"]);
    const planRiskPayload = JSON.parse(planRisk.stdout);
    expect(planRiskPayload.ok).toBe(true);
    expect(planRiskPayload.risk.level).toBe("high");

    const approvalRequire = await runCli(["approval", "require", "--run", runId, "--json"]);
    const approvalRequirePayload = JSON.parse(approvalRequire.stdout);
    expect(approvalRequirePayload.ok).toBe(true);
    expect(approvalRequirePayload.required).toBe(true);

    const approvalStatusBefore = await runCli(["approval", "status", "--run", runId, "--json"]);
    const approvalStatusBeforePayload = JSON.parse(approvalStatusBefore.stdout);
    expect(approvalStatusBeforePayload.ok).toBe(true);
    expect(approvalStatusBeforePayload.latestApproval).toBe(null);

    await runCli([
      "approval",
      "record",
      "--run",
      runId,
      "--source",
      "slack",
      "--status",
      "changes_requested",
      "--by",
      "reviewer-a",
      "--json"
    ]);
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
      "reviewer-b",
      "--json"
    ]);

    const approvalStatusAfter = await runCli(["approval", "status", "--run", runId, "--json"]);
    const approvalStatusAfterPayload = JSON.parse(approvalStatusAfter.stdout);
    expect(approvalStatusAfterPayload.ok).toBe(true);
    expect(approvalStatusAfterPayload.latestApproval.status).toBe("approved");
    expect(approvalStatusAfterPayload.latestApproval.by).toBe("reviewer-b");

    const policyList = await runCli(["policy", "list", "--json"]);
    const policyListPayload = JSON.parse(policyList.stdout);
    expect(policyListPayload.ok).toBe(true);
    expect(policyListPayload.policies.some((entry: { id: string }) => entry.id === "APPROVAL_REQUIRED")).toBe(true);

    const auditList = await runCli(["audit", "list", "--json"]);
    const auditListPayload = JSON.parse(auditList.stdout);
    expect(auditListPayload.ok).toBe(true);
    expect(auditListPayload.runs.some((entry: { id: string }) => entry.id === runId)).toBe(true);

    const auditShow = await runCli(["audit", "show", runId, "--json"]);
    const auditShowPayload = JSON.parse(auditShow.stdout);
    expect(auditShowPayload.ok).toBe(true);
    expect(auditShowPayload.run.auditTrail.some((entry: { action: string }) => entry.action === "approval.record")).toBe(true);
    expect(auditShowPayload.run.auditTrail.some((entry: { detail: string }) => entry.detail.includes("changes_requested"))).toBe(true);
  });
});
