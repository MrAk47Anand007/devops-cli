import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli testing and policy workflow", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-policy-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("discovers tests, generates a test plan, and records deterministic test results", async () => {
    const discover = await runCli(["test", "discover", "--json"]);
    const discovered = JSON.parse(discover.stdout);
    expect(discovered.ok).toBe(true);
    expect(discovered.frameworks).toContain("vitest");

    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    await runCli(["context", "create", "--service", "svc-api", "--json"]);
    const plan = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const runId = JSON.parse(plan.stdout).run.id;

    const generated = await runCli(["test", "generate-plan", "--target", "service", "--json"]);
    const generatedPayload = JSON.parse(generated.stdout);
    expect(generatedPayload.ok).toBe(true);
    expect(generatedPayload.testPlan.commands).toContain("npm test");

    const executed = await runCli(["test", "run", "--plan", "latest", "--json"]);
    const executedPayload = JSON.parse(executed.stdout);
    expect(executedPayload.ok).toBe(true);
    expect(executedPayload.run.tests.length).toBeGreaterThan(0);
    expect(executedPayload.run.tests.every((entry: { status: string }) => entry.status === "passed")).toBe(true);

    const report = await runCli(["test", "report", "--run", runId, "--json"]);
    const reportPayload = JSON.parse(report.stdout);
    expect(reportPayload.ok).toBe(true);
    expect(reportPayload.report.summary).toContain("passed");
  });

  it("requires test evidence for a high risk push even after approval", async () => {
    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    await runCli(["context", "create", "--service", "svc-api", "--json"]);
    const plan = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const runId = JSON.parse(plan.stdout).run.id;

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

    const blockedGate = await runCli(["push", "gate", "--run", runId, "--json"]);
    const blockedPayload = JSON.parse(blockedGate.stdout);
    expect(blockedPayload.ok).toBe(false);
    expect(blockedPayload.error.code).toBe("TESTS_REQUIRED");

    await runCli(["test", "generate-plan", "--target", "service", "--json"]);
    await runCli(["test", "run", "--plan", "latest", "--json"]);

    const passingGate = await runCli(["push", "gate", "--run", runId, "--json"]);
    const passingPayload = JSON.parse(passingGate.stdout);
    expect(passingPayload.ok).toBe(true);
  });

  it("explains policy violations and blocks protected actions for critical runs", async () => {
    await runCli(["scenario", "load", "config-risk", "--json"]);
    await runCli(["context", "create", "--service", "svc-config", "--json"]);
    await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);

    const policy = await runCli(["policy", "check", "--plan", "latest", "--json"]);
    const policyPayload = JSON.parse(policy.stdout);
    expect(policyPayload.ok).toBe(true);
    expect(policyPayload.violations.some((entry: { id: string }) => entry.id === "CRITICAL_RISK")).toBe(true);

    const explain = await runCli(["policy", "explain", "--violation", "CRITICAL_RISK", "--json"]);
    const explainPayload = JSON.parse(explain.stdout);
    expect(explainPayload.ok).toBe(true);
    expect(explainPayload.explanation).toContain("critical");

    const permission = await runCli(["permission", "check", "--action", "deploy", "--json"]);
    const permissionPayload = JSON.parse(permission.stdout);
    expect(permissionPayload.ok).toBe(true);
    expect(permissionPayload.allowed).toBe(false);
    expect(permissionPayload.reasonCode).toBe("ACTION_BLOCKED");
  });

  it("updates policy thresholds and changes effective gate behavior", async () => {
    await runCli(["config", "set", "threshold.critical", "96", "--json"]);
    await runCli(["config", "set", "threshold.high", "90", "--json"]);
    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    await runCli(["context", "create", "--service", "svc-api", "--json"]);
    const plan = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const runId = JSON.parse(plan.stdout).run.id;

    const blockedPolicy = await runCli(["policy", "set", "threshold.high", "95", "--json"]);
    const blockedPayload = JSON.parse(blockedPolicy.stdout);
    expect(blockedPayload.ok).toBe(false);
    expect(blockedPayload.error.code).toBe("POLICY_SET_FAILED");

    const setPolicy = await runCli([
      "policy",
      "set",
      "threshold.high",
      "90",
      "--approved",
      "--json"
    ]);
    const setPolicyPayload = JSON.parse(setPolicy.stdout);
    expect(setPolicyPayload.ok).toBe(true);
    expect(setPolicyPayload.value).toBe("90");

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

    const gate = await runCli(["push", "gate", "--run", runId, "--json"]);
    const gatePayload = JSON.parse(gate.stdout);
    expect(gatePayload.ok).toBe(true);
  });
});
