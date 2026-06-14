import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeDecisionFlow, simulateScenario } from "../src/service.js";
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
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_INCIDENTS_PATH;
    delete process.env.SENTINELOPS_AUDIT_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("simulateScenario returns deterministic metrics for the requested scenario", () => {
    const result = simulateScenario("degraded");
    expect(result.scenario).toBe("degraded");
    expect(result.metrics.errorRate).toBe(0.044);
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
});
