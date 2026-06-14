import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendIncident, findSimilar, loadIncidents } from "../src/memory.js";
import type { Incident } from "../src/types.js";

const sampleIncident: Incident = {
  id: "TEST-1",
  deployId: "d1",
  summary: "latency spike on payments",
  errorRate: 0.05,
  latencyP95: 400,
  agentAction: "hold",
  agentConfidence: 55,
  humanOverride: "hold",
  outcome: "recovered"
};

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

describe("memory", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-memory-"));
    const incidentsPath = join(tempDir, "incidents.json");
    writeFileSync(incidentsPath, `${JSON.stringify([seededIncident], null, 2)}\n`);
    process.env.SENTINELOPS_INCIDENTS_PATH = incidentsPath;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_INCIDENTS_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads seeded incidents", () => {
    expect(loadIncidents().length).toBeGreaterThan(0);
  });

  it("findSimilar returns the closest incident by metric distance", () => {
    const match = findSimilar({ errorRate: 0.042, latencyP95: 370 });
    expect(match).not.toBeNull();
  });

  it("appendIncident grows the store", () => {
    const before = loadIncidents().length;
    appendIncident(sampleIncident);
    expect(loadIncidents().length).toBe(before + 1);
  });
});
