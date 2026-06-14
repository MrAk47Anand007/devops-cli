import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli core context and planning", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-core-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads a named scenario and creates a normalized context", async () => {
    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    const result = await runCli(["context", "create", "--service", "svc-api", "--json"]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.context.service.id).toBe("svc-api");
    expect(parsed.run.status).toBe("context_created");
  });

  it("creates a plan and risk score from the latest context", async () => {
    await runCli(["scenario", "load", "config-risk", "--json"]);
    await runCli(["context", "create", "--service", "svc-config", "--json"]);
    const result = await runCli([
      "plan",
      "create",
      "--context",
      ".sentinelops/context.json",
      "--json"
    ]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.run.plan.summary.length).toBeGreaterThan(0);
    expect(parsed.run.plan.risk.level).toMatch(/low|medium|high|critical/);
  });

  it("creates a plan directly from a prompt", async () => {
    const result = await runCli([
      "plan",
      "create",
      "--prompt",
      "fix config issue in production service",
      "--json"
    ]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.run.source).toBe("prompt");
    expect(parsed.run.plan.summary.length).toBeGreaterThan(0);
  });

  it("creates a github-targeted plan and exposes critical questions", async () => {
    const result = await runCli([
      "plan",
      "create",
      "--target",
      "https://github.com/example/repo/issues/77",
      "--json"
    ]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.run.source).toBe("github");
    expect(parsed.run.githubTarget).toContain("/issues/77");

    const critical = await runCli(["plan", "ask-critical", "--json"]);
    const criticalParsed = JSON.parse(critical.stdout);
    expect(criticalParsed.ok).toBe(true);
    expect(Array.isArray(criticalParsed.criticalQuestions)).toBe(true);
    expect(criticalParsed.runId).toBe(parsed.run.id);
  });

  it("supports config get as both a full snapshot and keyed lookup", async () => {
    await runCli(["config", "set", "threshold.high", "75", "--json"]);
    await runCli(["config", "set", "approval.channel", "ops-room", "--json"]);

    const full = await runCli(["config", "get", "--json"]);
    const fullParsed = JSON.parse(full.stdout);
    expect(fullParsed.ok).toBe(true);
    expect(fullParsed.config["threshold.high"]).toBe("75");
    expect(fullParsed.config["approval.channel"]).toBe("ops-room");

    const keyed = await runCli(["config", "get", "--key", "threshold.high", "--json"]);
    const keyedParsed = JSON.parse(keyed.stdout);
    expect(keyedParsed.ok).toBe(true);
    expect(keyedParsed.value).toBe("75");
  });

  it("supports guided init inputs and operator on off controls", async () => {
    const init = await runCli([
      "init",
      "--repo",
      "example/repo",
      "--repo",
      "example/platform",
      "--slack-channel",
      "#ops-approvals",
      "--agent-command",
      "codex",
      "--agent-args",
      "[\"exec\",\"--json\"]",
      "--enabled",
      "true",
      "--json"
    ]);
    const initPayload = JSON.parse(init.stdout);
    expect(initPayload.ok).toBe(true);
    expect(initPayload.config.trackedRepos).toContain("example/repo");
    expect(initPayload.config.agentCommand).toBe("codex");

    const toggle = await runCli(["automation", "disable", "--json"]);
    const togglePayload = JSON.parse(toggle.stdout);
    expect(togglePayload.ok).toBe(true);
    expect(togglePayload.config.enabled).toBe(false);
  });
});
