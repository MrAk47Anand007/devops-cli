import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDeployTargetFromConfig, DockerDeployTarget, KubernetesDeployTarget } from "../src/core/deploy-targets.js";
import type { OperatorConfig } from "../src/types.js";

function baseConfig(): OperatorConfig {
  return {
    trackedRepos: ["example/repo"],
    slackChannel: "#ops",
    agentCommand: "codex",
    agentArgs: ["exec", "--json"],
    judgmentProvider: "canned",
    openai: { model: "gpt-4o-2024-08-06" },
    anthropic: { model: "claude-3-5-sonnet-latest" },
    aiCli: { command: "codex", args: ["exec", "--json"], healthArgs: ["--help"] },
    deployTarget: "simulator",
    kubernetes: {
      command: "kubectl",
      context: "",
      namespace: "default",
      deployment: "",
      service: "app"
    },
    docker: {
      command: "docker",
      composeFile: "",
      service: "app",
      container: ""
    },
    metricSource: "simulator",
    prometheus: {
      url: "",
      errorRateExpr: "",
      latencyP95Expr: "",
      requestsPerSecExpr: "",
      baselineErrorRateExpr: "",
      baselineLatencyP95Expr: "",
      baselineRequestsPerSecExpr: "",
      baselineLookbackHours: 168
    },
    grafana: {
      url: "",
      token: "",
      datasourceUid: "",
      dashboardUid: "",
      errorRateExpr: "",
      latencyP95Expr: "",
      requestsPerSecExpr: "",
      baselineErrorRateExpr: "",
      baselineLatencyP95Expr: "",
      baselineRequestsPerSecExpr: "",
      baselineLookbackHours: 168
    },
    enabled: true,
    updatedAt: new Date().toISOString()
  };
}

describe("deploy targets", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-deploy-targets-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a kubernetes deploy target from operator config", async () => {
    const executor = async () => ({
      command: "kubectl",
      args: [],
      exitCode: 0,
      output: "deployment.apps/api successfully rolled out\n",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString()
    });

    const target = new KubernetesDeployTarget(
      {
        command: "kubectl",
        context: "prod",
        namespace: "default",
        deployment: "api",
        service: "svc-api"
      },
      executor
    );

    const health = await target.health();
    const status = await target.status("deploy-1");
    const dryRun = await target.rollback("deploy-1", { dryRun: true });

    expect(health.status).toBe("ready");
    expect(status.state).toBe("healthy");
    expect(dryRun.dryRun).toBe(true);
  });

  it("creates a docker deploy target from operator config", async () => {
    const executor = async () => ({
      command: "docker",
      args: [],
      exitCode: 0,
      output: "sha256:image-id\n",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString()
    });

    const target = new DockerDeployTarget(
      {
        command: "docker",
        composeFile: "",
        service: "svc-api",
        container: "api-container"
      },
      executor
    );

    const revision = await target.currentRevision("svc-api");
    const rollback = await target.rollback("deploy-2", { dryRun: false });

    expect(revision.version).toContain("sha256:image-id");
    expect(rollback.ok).toBe(true);
  });

  it("selects configured deploy target provider", () => {
    const kubeConfig = {
      ...baseConfig(),
      deployTarget: "kubernetes" as const,
      kubernetes: {
        command: "kubectl",
        context: "prod",
        namespace: "default",
        deployment: "api",
        service: "svc-api"
      }
    };
    const dockerConfig = {
      ...baseConfig(),
      deployTarget: "docker" as const,
      docker: {
        command: "docker",
        composeFile: "",
        service: "svc-api",
        container: "api-container"
      }
    };

    expect(createDeployTargetFromConfig(kubeConfig).id).toBe("kubernetes");
    expect(createDeployTargetFromConfig(dockerConfig).id).toBe("docker");
  });
});
