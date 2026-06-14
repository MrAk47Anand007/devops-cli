import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli plugin simulation", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-plugin-sim-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("simulates Slack and GitHub plugin handoff from existing SentinelOps payloads", async () => {
    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    await runCli(["dashboard", "ingest", "--service", "svc-api", "--json"]);
    const plan = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const runId = JSON.parse(plan.stdout).run.id;
    await runCli(["change", "prepare", "--target", "https://github.com/example/repo/issues/77", "--json"]);

    const blockedGithubSim = await runCli([
      "integration",
      "simulate",
      "--provider",
      "github",
      "--run",
      runId,
      "--json"
    ]);
    const blockedGithubPayload = JSON.parse(blockedGithubSim.stdout);
    expect(blockedGithubPayload.ok).toBe(false);
    expect(blockedGithubPayload.error.code).toBe("INTEGRATION_SIMULATE_FAILED");
    expect(blockedGithubPayload.error.message).toContain("not ready");

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
    await runCli(["push", "gate", "--run", runId, "--json"]);

    const slackSim = await runCli([
      "integration",
      "simulate",
      "--provider",
      "slack",
      "--run",
      runId,
      "--json"
    ]);
    const slackPayload = JSON.parse(slackSim.stdout);
    expect(slackPayload.ok).toBe(true);
    expect(slackPayload.provider).toBe("slack");
    expect(slackPayload.simulation.delivered).toBe(true);
    expect(slackPayload.simulation.preview).toContain(runId);

    const githubSim = await runCli([
      "integration",
      "simulate",
      "--provider",
      "github",
      "--run",
      runId,
      "--json"
    ]);
    const githubPayload = JSON.parse(githubSim.stdout);
    expect(githubPayload.ok).toBe(true);
    expect(githubPayload.provider).toBe("github");
    expect(githubPayload.simulation.delivered).toBe(true);
    expect(githubPayload.simulation.preview).toContain(runId);
  });
});
