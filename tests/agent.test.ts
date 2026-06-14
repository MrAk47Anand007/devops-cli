import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAnomalous, judge } from "../src/agent.js";
import type { Incident } from "../src/types.js";

const seededIncident: Incident = {
  id: "INC-2026-05-02",
  deployId: "deploy-8841",
  summary: "checkout service error rate spiked to 4% after config change, latency doubled, transient issue recovered without rollback",
  errorRate: 0.04,
  latencyP95: 360,
  agentAction: "hold",
  agentConfidence: 60,
  humanOverride: "hold",
  outcome: "held and recovered on its own in 6 minutes; rollback would have been unnecessary"
};

describe("agent", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-agent-"));
    const incidentsPath = join(tempDir, "incidents.json");
    writeFileSync(incidentsPath, `${JSON.stringify([seededIncident], null, 2)}\n`);
    process.env.SENTINELOPS_INCIDENTS_PATH = incidentsPath;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_INCIDENTS_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("flags metrics well above baseline", () => {
    expect(
      isAnomalous({
        timestamp: Date.now(),
        errorRate: 0.05,
        latencyP95: 400,
        requestsPerSec: 500
      })
    ).toBe(true);
  });

  it("ignores healthy metrics", () => {
    expect(
      isAnomalous({
        timestamp: Date.now(),
        errorRate: 0.004,
        latencyP95: 120,
        requestsPerSec: 800
      })
    ).toBe(false);
  });

  it("returns a low or medium confidence hold for degraded metrics in canned mode", async () => {
    const decision = await judge(
      {
        timestamp: Date.now(),
        errorRate: 0.045,
        latencyP95: 380,
        requestsPerSec: 600
      },
      { useCanned: true }
    );

    expect(decision.action).toBe("hold");
    expect(decision.confidence).toBeGreaterThanOrEqual(40);
    expect(decision.confidence).toBeLessThan(85);
  });

  it("returns a high-confidence rollback for crash metrics in canned mode", async () => {
    const decision = await judge(
      {
        timestamp: Date.now(),
        errorRate: 0.22,
        latencyP95: 1800,
        requestsPerSec: 200
      },
      { useCanned: true }
    );

    expect(decision.action).toBe("rollback");
    expect(decision.confidence).toBeGreaterThanOrEqual(85);
  });
});
