import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeDecisionFlow, simulateScenario } from "../src/service.js";
import { saveOperatorConfig } from "../src/core/operator-config.js";
import { writeConfig } from "../src/core/store.js";
import {
  SimulatorDeployTarget,
  SimulatorMetricSource,
  SimulatorRuntime
} from "../src/core/simulator-adapters.js";
import { CannedJudgmentBrain } from "../src/agent.js";
import { readAudit } from "../src/deploy.js";
import { loadIncidents } from "../src/memory.js";
import type { Incident } from "../src/types.js";

const seededIncident: Incident = {
  id: "INC-2026-05-02",
  deployId: "deploy-8841",
  summary:
    "checkout service error rate spiked to 4% after config change, latency doubled, transient issue recovered without rollback",
  errorRate: 0.04,
  latencyP95: 360,
  agentAction: "hold",
  agentConfidence: 60,
  humanOverride: "hold",
  outcome: "held and recovered on its own in 6 minutes; rollback would have been unnecessary"
};

describe("service", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-service-"));
    writeFileSync(
      join(tempDir, "incidents.json"),
      `${JSON.stringify([seededIncident], null, 2)}\n`
    );
    writeFileSync(join(tempDir, "audit.json"), "[]\n");
    process.env.SENTINELOPS_INCIDENTS_PATH = join(tempDir, "incidents.json");
    process.env.SENTINELOPS_AUDIT_PATH = join(tempDir, "audit.json");
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_INCIDENTS_PATH;
    delete process.env.SENTINELOPS_AUDIT_PATH;
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    vi.unstubAllGlobals();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("simulateScenario returns deterministic metrics for the requested scenario", () => {
    const result = simulateScenario("degraded");
    expect(result.scenario).toBe("degraded");
    expect(result.metrics.errorRate).toBe(0.044);
  });

  it("executeDecisionFlow supports injected simulator adapters", async () => {
    const runtime = new SimulatorRuntime();
    const result = await executeDecisionFlow(
      {
        scenario: "crash",
        deployId: "deploy-injected",
        useCanned: true
      },
      {
        simulator: runtime,
        metricSource: new SimulatorMetricSource(runtime),
        deployTarget: new SimulatorDeployTarget(runtime),
        judgmentBrain: new CannedJudgmentBrain()
      }
    );

    expect(result.decision?.action).toBe("rollback");
    expect(result.metrics.errorRate).toBeGreaterThan(0.1);
  });

  it("executeDecisionFlow applies a caller override and records the final action", async () => {
    const result = await executeDecisionFlow({
      scenario: "degraded",
      deployId: "deploy-1002",
      useCanned: true,
      humanDecision: "override"
    });

    expect(result.finalAction).toBe("rollback");
    expect(result.humanDecision).toBe("override");
    expect(result.incidentRecorded).toBe(true);
    expect(result.autonomous).toBe(false);
    expect(result.guard?.ok).toBe(true);
  });

  it("executeDecisionFlow leaves healthy scenarios read-only", async () => {
    const incidentCountBefore = loadIncidents().length;
    const auditCountBefore = readAudit().length;

    const result = await executeDecisionFlow({
      scenario: "healthy",
      deployId: "deploy-1001",
      useCanned: true
    });

    expect(result.anomalous).toBe(false);
    expect(result.finalAction).toBe("none");
    expect(result.incidentRecorded).toBe(false);
    expect(loadIncidents().length).toBe(incidentCountBefore);
    expect(readAudit().length).toBe(auditCountBefore);
  });

  it("executeDecisionFlow honors configured runtime adapters without manual injection", async () => {
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
          "process.stdin.resume(); process.stdin.on('data', () => {}); process.stdin.on('end', () => console.log(JSON.stringify({action:'rollback',confidence:91,reasoning:'runtime configured brain',evidence:['live adapter'],similarIncidentId:null})));"
        ],
        healthArgs: ["-e", "process.exit(0)"]
      },
      metricSource: "prometheus",
      prometheus: {
        url: "http://prometheus.local",
        errorRateExpr: "error_rate",
        latencyP95Expr: "latency_p95",
        requestsPerSecExpr: "rps"
      },
      enabled: true
    });
    writeConfig({
      "guard.rollback.maxErrorRate": "0.1",
      "guard.rollback.maxLatencyP95": "1200"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        const query = new URL(url).searchParams.get("query");
        const value =
          query === "error_rate"
            ? "0.15"
            : query === "latency_p95"
              ? "1500"
              : query === "rps"
                ? "210"
                : "0";
        return new Response(
          JSON.stringify({
            status: "success",
            data: {
              result: [{ value: [Date.now(), value] }]
            }
          }),
          { status: 200 }
        );
      })
    );

    const result = await executeDecisionFlow({
      scenario: "healthy",
      deployId: "deploy-runtime-configured"
    });

    expect(result.anomalous).toBe(true);
    expect(result.metrics.errorRate).toBe(0.15);
    expect(result.decision?.reasoning).toBe("runtime configured brain");
    expect(result.finalAction).toBe("hold");
    expect(result.guard?.code).toBe("BLAST_RADIUS_EXCEEDED");
  });

  it("blocks autonomous rollback when guard confidence threshold is raised", async () => {
    const result = await executeDecisionFlow({
      scenario: "crash",
      deployId: "deploy-guarded",
      useCanned: true
    });

    expect(result.decision?.action).toBe("rollback");
    expect(result.finalAction).toBe("rollback");

    writeConfig({
      "guard.rollback.minConfidence": "99"
    });

    const blocked = await executeDecisionFlow({
      scenario: "crash",
      deployId: "deploy-guarded-strict",
      useCanned: true
    });

    expect(blocked.decision?.action).toBe("rollback");
    expect(blocked.finalAction).toBe("hold");
    expect(blocked.guard?.code).toBe("CONFIDENCE_TOO_LOW");
  });
});
