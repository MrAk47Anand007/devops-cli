import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadOperatorConfig,
  saveOperatorConfig,
  setOperatorEnabled
} from "../src/core/operator-config.js";
import { writeConfig } from "../src/core/store.js";

describe("operator config", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-operator-config-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists tracked repos, slack channel, agent command, and enabled state", () => {
    saveOperatorConfig({
      trackedRepos: ["example/repo", "example/platform"],
      slackChannel: "#ops-approvals",
      agentCommand: "codex",
      agentArgs: ["exec", "--json"],
      judgmentProvider: "ai-cli",
      aiCli: {
        command: "node",
        args: ["-e", "console.log('brain')"],
        healthArgs: ["-e", "process.exit(0)"]
      },
      metricSource: "prometheus",
      prometheus: {
        url: "http://127.0.0.1:9090",
        errorRateExpr: "sum(rate(http_requests_total{status=~\"5..\"}[5m]))",
        latencyP95Expr: "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
        requestsPerSecExpr: "sum(rate(http_requests_total[5m]))"
      },
      enabled: true
    });

    setOperatorEnabled(false);

    const config = loadOperatorConfig();
    expect(config?.trackedRepos).toEqual(["example/repo", "example/platform"]);
    expect(config?.slackChannel).toBe("#ops-approvals");
    expect(config?.enabled).toBe(false);
    expect(config?.judgmentProvider).toBe("ai-cli");
    expect(config?.aiCli.command).toBe("node");
    expect(config?.metricSource).toBe("prometheus");
    expect(config?.prometheus.url).toBe("http://127.0.0.1:9090");
  });

  it("blocks helper-level safety loosening without approval", () => {
    writeConfig({
      "guard.rollback.requireHumanApproval": "true"
    });

    expect(() =>
      saveOperatorConfig(
        {
          trackedRepos: ["example/repo"],
          slackChannel: "#ops-approvals",
          agentCommand: "codex",
          agentArgs: ["exec", "--json"],
          enabled: false
        },
        { actor: "test" }
      )
    ).not.toThrow();

    expect(() => setOperatorEnabled(true, { actor: "test" })).not.toThrow();
  });
});
