import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli approval and push gate", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-gate-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("blocks push gate for a risky run without approval", async () => {
    await runCli(["scenario", "load", "config-risk", "--json"]);
    await runCli(["context", "create", "--service", "svc-config", "--json"]);
    const plan = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const runId = JSON.parse(plan.stdout).run.id;

    const gate = await runCli(["push", "gate", "--run", runId, "--json"]);
    const parsed = JSON.parse(gate.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("CRITICAL_ACTION_BLOCKED");
  });

  it("passes push gate after approval and passing tests are recorded", async () => {
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
    await runCli(["test", "generate-plan", "--target", "service", "--json"]);
    await runCli(["test", "run", "--plan", "latest", "--json"]);

    const gate = await runCli(["push", "gate", "--run", runId, "--json"]);
    const parsed = JSON.parse(gate.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.run.status).toBe("approved");
  });

  it("blocks push recording until the protected gate has actually passed", async () => {
    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    await runCli(["context", "create", "--service", "svc-api", "--json"]);
    const plan = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const runId = JSON.parse(plan.stdout).run.id;

    const pushRecord = await runCli([
      "push",
      "record",
      "--run",
      runId,
      "--commit",
      "abc123def456",
      "--json"
    ]);
    const parsed = JSON.parse(pushRecord.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("PUSH_RECORD_FAILED");
    expect(parsed.error.message).toContain("push gate");
  });

  it("blocks incident resolution until a final push or GitHub update has been recorded", async () => {
    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    await runCli(["dashboard", "ingest", "--service", "svc-api", "--json"]);
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
    await runCli(["test", "generate-plan", "--target", "service", "--json"]);
    await runCli(["test", "run", "--plan", "latest", "--json"]);
    await runCli(["push", "gate", "--run", runId, "--json"]);

    const resolve = await runCli([
      "dashboard",
      "incident",
      "resolve",
      "--run",
      runId,
      "--incident",
      "inc-post-1",
      "--json"
    ]);
    const parsed = JSON.parse(resolve.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("DASHBOARD_INCIDENT_RESOLVE_FAILED");
    expect(parsed.error.message).toContain("final push");
  });
});
