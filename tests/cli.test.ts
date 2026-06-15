import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { saveOperatorConfig } from "../src/core/operator-config.js";

describe("cli", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-"));
    writeFileSync(join(tempDir, "incidents.json"), "[]\n");
    writeFileSync(join(tempDir, "audit.json"), "[]\n");
    process.env.SENTINELOPS_INCIDENTS_PATH = join(tempDir, "incidents.json");
    process.env.SENTINELOPS_AUDIT_PATH = join(tempDir, "audit.json");
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_INCIDENTS_PATH;
    delete process.env.SENTINELOPS_AUDIT_PATH;
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("judge command returns a stable JSON envelope", async () => {
    const result = await runCli(["judge", "--scenario", "degraded", "--json", "--canned"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("judge");
    expect(parsed.scenario).toBe("degraded");
    expect(parsed.decision.action).toBe("hold");
  });

  it("decide command accepts an explicit override", async () => {
    const result = await runCli([
      "decide",
      "--scenario",
      "degraded",
      "--override",
      "--json",
      "--canned"
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.finalAction).toBe("rollback");
    expect(parsed.humanDecision).toBe("override");
  });

  it("rejects invalid scenarios with a JSON error envelope", async () => {
    const result = await runCli(["judge", "--scenario", "bad", "--json"]);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("INVALID_SCENARIO");
  });

  it("decide uses the configured ai-cli brain when canned mode is not forced", async () => {
    saveOperatorConfig({
      trackedRepos: ["example/repo"],
      slackChannel: "#ops",
      agentCommand: "codex",
      agentArgs: ["exec", "--json"],
      judgmentProvider: "ai-cli",
      aiCli: {
        command: "node",
        args: [
          "-e",
          "process.stdin.resume(); process.stdin.on('data', () => {}); process.stdin.on('end', () => console.log(JSON.stringify({action:'hold',confidence:52,reasoning:'cli configured via operator config',evidence:['cli runtime'],similarIncidentId:null})));"
        ],
        healthArgs: ["-e", "process.exit(0)"]
      },
      enabled: true
    });

    const result = await runCli(["decide", "--scenario", "degraded", "--json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.decision.reasoning).toBe("cli configured via operator config");
    expect(parsed.finalAction).toBe("hold");
  });
});
