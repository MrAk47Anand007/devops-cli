import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureSentinelOpsState,
  getLatestRunId,
  listRuns,
  saveRun,
  writeLatestRunId
} from "../src/core/store.js";

describe("core store", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-core-store-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates the sentinelops workspace folders on demand", () => {
    const paths = ensureSentinelOpsState();
    expect(paths.root.endsWith(".sentinelops")).toBe(true);
    expect(paths.runs.endsWith("runs")).toBe(true);
  });

  it("persists runs and tracks the latest run id", () => {
    saveRun({
      id: "run-001",
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
      source: "scenario",
      status: "context_created",
      scenario: "post-deploy-errors",
      serviceId: "svc-api",
      context: null,
      plan: null,
      testPlan: null,
      approvals: [],
      tests: [],
      auditTrail: [],
      githubTarget: null,
      prompt: null
    });

    writeLatestRunId("run-001");

    expect(getLatestRunId()).toBe("run-001");
    expect(listRuns()[0]?.id).toBe("run-001");
  });
});
