import { pushGate } from "./approval.js";
import { loadRun, saveRun } from "./store.js";
import { DashboardStore } from "../dashboard/store.js";
import { type IncidentRecord, type RunRecord } from "../types.js";

function requireRun(runId: string): RunRecord {
  const run = loadRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found.`);
  }
  return run;
}

function inferGithubLinks(run: RunRecord): NonNullable<IncidentRecord["linkedGithub"]> {
  const target = run.githubTarget ?? "";
  if (target.includes("/pull/")) {
    return { issueUrl: null, prUrl: target };
  }
  return {
    issueUrl: target || (run.context?.service.linkedGithub?.issueUrl ?? null),
    prUrl: run.context?.service.linkedGithub?.prUrl ?? null
  };
}

function hasRecordedFinalUpdate(run: RunRecord): boolean {
  return run.auditTrail.some((entry) => entry.action === "push.record");
}

export function resolveDashboardIncident(runId: string, incidentId: string): {
  run: RunRecord;
  incident: IncidentRecord;
} {
  const gate = pushGate(runId);
  if (!gate.ok) {
    throw new Error(`Run ${runId} cannot resolve incidents until push gate passes.`);
  }
  if (!hasRecordedFinalUpdate(gate.run)) {
    throw new Error(`Run ${runId} cannot resolve incidents until a final push or GitHub update has been recorded.`);
  }

  const store = new DashboardStore();
  const run = requireRun(runId);
  const incident = store.updateIncident(incidentId, {
    status: "resolved",
    summary: `${run.plan?.summary ?? "SentinelOps remediation completed."} [resolved by ${runId}]`,
    linkedGithub: inferGithubLinks(run)
  });
  if (!incident) {
    throw new Error(`Incident ${incidentId} not found.`);
  }

  const now = new Date().toISOString();
  const updatedRun = saveRun({
    ...run,
    updatedAt: now,
    auditTrail: [
      ...run.auditTrail,
      {
        at: now,
        action: "dashboard.incident.resolve",
        detail: `Resolved dashboard incident ${incidentId}.`
      }
    ]
  });

  return {
    run: updatedRun,
    incident
  };
}
