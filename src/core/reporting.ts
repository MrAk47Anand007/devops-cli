import { listRuns, loadRun, saveRun } from "./store.js";
import { getChangeDiff } from "./repo.js";
import { type RunRecord } from "../types.js";

function requireRun(runId: string): RunRecord {
  const run = loadRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found.`);
  }
  return run;
}

export function listAuditRuns(): Array<{
  id: string;
  status: RunRecord["status"];
  updatedAt: string;
}> {
  return listRuns()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((run) => ({
      id: run.id,
      status: run.status,
      updatedAt: run.updatedAt
    }));
}

export function showAuditRun(runId: string): RunRecord {
  return requireRun(runId);
}

export function createReport(runId: string): {
  run: RunRecord;
  report: {
    summary: string;
    latestApproval: RunRecord["approvals"][number] | null;
    approvals: RunRecord["approvals"];
    tests: RunRecord["tests"];
    githubTarget: string | null;
    commitSha: string | null;
    finalOutcome: string;
    diff: ReturnType<typeof getChangeDiff>["diff"];
    auditTrail: RunRecord["auditTrail"];
  };
} {
  const run = requireRun(runId);
  const now = new Date().toISOString();
  const updated = saveRun({
    ...run,
    updatedAt: now,
    status: "report_created",
    auditTrail: [
      ...run.auditTrail,
      {
        at: now,
        action: "report.create",
        detail: "Created final run report."
      }
    ]
  });
  const latestApproval = updated.approvals.at(-1) ?? null;
  const pushRecord = [...updated.auditTrail]
    .reverse()
    .find((entry) => entry.action === "push.record");
  const commitSha = pushRecord
    ? pushRecord.detail.replace("Recorded commit ", "").replace(".", "")
    : null;
  const incidentResolution = [...updated.auditTrail]
    .reverse()
    .find((entry) => entry.action === "dashboard.incident.resolve");
  const finalOutcome =
    incidentResolution?.detail ??
    (commitSha ? `Recorded final commit ${commitSha}.` : "No final outcome recorded.");

  return {
    run: updated,
    report: {
      summary: updated.plan?.summary ?? "No plan summary available.",
      latestApproval,
      approvals: updated.approvals,
      tests: updated.tests,
      githubTarget: updated.githubTarget,
      commitSha,
      finalOutcome,
      diff: getChangeDiff(runId).diff,
      auditTrail: updated.auditTrail
    }
  };
}

export function memoryRecord(runId: string): RunRecord {
  const run = requireRun(runId);
  const now = new Date().toISOString();
  return saveRun({
    ...run,
    updatedAt: now,
    auditTrail: [
      ...run.auditTrail,
      {
        at: now,
        action: "memory.record",
        detail: "Recorded run in memory layer."
      }
    ]
  });
}
