import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendAutomationEvent,
  getAutomationJob,
  listAutomationJobs,
  saveAutomationJob
} from "../src/core/store.js";

describe("automation state store", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-automation-store-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists automation jobs and event history", () => {
    saveAutomationJob({
      id: "job-1",
      runId: "run-1",
      source: "github_issue",
      serviceId: "svc-api",
      githubIssueUrl: "https://github.com/example/repo/issues/77",
      status: "awaiting_approval",
      approvalMessageId: null,
      execution: null,
      createdAt: "2026-06-14T10:00:00.000Z",
      updatedAt: "2026-06-14T10:00:00.000Z"
    });

    appendAutomationEvent({
      id: "evt-1",
      jobId: "job-1",
      kind: "github.issue.opened",
      payload: { issue: 77 },
      at: "2026-06-14T10:00:01.000Z"
    });

    expect(getAutomationJob("job-1")?.status).toBe("awaiting_approval");
    expect(listAutomationJobs()).toHaveLength(1);
  });
});
