import { listRuns, loadRun, saveRun } from "./store.js";
import { evaluateRunPolicy } from "./policy.js";
import { getChangeDiff } from "./repo.js";
import { type ApprovalRecord, type ApprovalStatus, type RunRecord } from "../types.js";

function requireRun(runId: string): RunRecord {
  const run = loadRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found.`);
  }
  return run;
}

function requiresApproval(run: RunRecord): boolean {
  const level = run.plan?.risk.level;
  return level === "medium" || level === "high" || level === "critical";
}

export function createApprovalPackage(
  runId: string,
  options?: {
    includePlan?: boolean;
    includeDiff?: boolean;
    includeTests?: boolean;
  }
): {
  run: RunRecord;
  package: {
    summary: string;
    risk: NonNullable<RunRecord["plan"]>["risk"] | null;
    plan?: RunRecord["plan"] | null;
    diff?: ReturnType<typeof getChangeDiff>["diff"];
    tests: RunRecord["tests"];
    pluginPayloads: {
      slack: {
        text: string;
        metadata: {
          runId: string;
          requiresApproval: boolean;
          githubTarget: string | null;
        };
      };
    };
  };
} {
  const run = requireRun(runId);
  const includePlan = options?.includePlan ?? false;
  const includeDiff = options?.includeDiff ?? false;
  const includeTests = options?.includeTests ?? true;
  const tests = includeTests ? run.tests : [];
  const diff = includeDiff ? getChangeDiff(runId).diff : undefined;
  return {
    run,
    package: {
      summary: run.plan?.summary ?? "No plan available.",
      risk: run.plan?.risk ?? null,
      ...(includePlan ? { plan: run.plan } : {}),
      ...(includeDiff ? { diff } : {}),
      tests,
      pluginPayloads: {
        slack: {
          text: [
            `SentinelOps approval request for ${runId}`,
            `Summary: ${run.plan?.summary ?? "No plan summary available."}`,
            `Risk: ${run.plan?.risk.level ?? "unknown"} (${run.plan?.risk.score ?? 0})`,
            `Tests: ${tests.length} recorded`,
            run.githubTarget ? `GitHub target: ${run.githubTarget}` : "GitHub target: none"
          ].join("\n"),
          metadata: {
            runId,
            requiresApproval: requiresApproval(run),
            githubTarget: run.githubTarget
          }
        }
      }
    }
  };
}

export function recordApproval(
  runId: string,
  record: Omit<ApprovalRecord, "at">
): RunRecord {
  const run = requireRun(runId);
  const now = new Date().toISOString();
  const approval: ApprovalRecord = {
    ...record,
    at: now
  };

  const updated = saveRun({
    ...run,
    updatedAt: now,
    status: approval.status === "approved" ? "approved" : "approval_pending",
    approvals: [...run.approvals, approval],
    auditTrail: [
      ...run.auditTrail,
      {
        at: now,
        action: "approval.record",
        detail: `${approval.source} -> ${approval.status} by ${approval.by}`
      }
    ]
  });

  return updated;
}

export function getApprovalStatus(runId: string): {
  run: RunRecord;
  requiresApproval: boolean;
  latestApproval: ApprovalRecord | null;
} {
  const run = requireRun(runId);
  return {
    run,
    requiresApproval: requiresApproval(run),
    latestApproval: run.approvals.at(-1) ?? null
  };
}

export function requireApproval(runId: string): {
  run: RunRecord;
  required: boolean;
} {
  const run = requireRun(runId);
  return { run, required: requiresApproval(run) };
}

export function listPendingApprovals(): Array<{
  runId: string;
  summary: string;
  risk: NonNullable<RunRecord["plan"]>["risk"] | null;
  githubTarget: string | null;
}> {
  return listRuns()
    .filter(
      (run) =>
        requireApproval(run.id).required &&
        !run.approvals.some((entry) => entry.status === "approved")
    )
    .map((run) => ({
      runId: run.id,
      summary: run.plan?.summary ?? "No plan summary available.",
      risk: run.plan?.risk ?? null,
      githubTarget: run.githubTarget
    }));
}

export function pushGate(runId: string):
  | { ok: true; run: RunRecord }
  | { ok: false; run: RunRecord; code: "APPROVAL_REQUIRED" | "TESTS_REQUIRED" | "CRITICAL_ACTION_BLOCKED" } {
  const run = requireRun(runId);
  const violations = evaluateRunPolicy(run);
  if (violations.some((entry) => entry.id === "CRITICAL_RISK")) {
    return { ok: false, run, code: "CRITICAL_ACTION_BLOCKED" };
  }
  if (violations.some((entry) => entry.id === "APPROVAL_REQUIRED")) {
    return { ok: false, run, code: "APPROVAL_REQUIRED" };
  }
  if (violations.some((entry) => entry.id === "TEST_EVIDENCE_REQUIRED")) {
    return { ok: false, run, code: "TESTS_REQUIRED" };
  }

  const now = new Date().toISOString();
  const updated = saveRun({
    ...run,
    updatedAt: now,
    status: run.approvals.some((approval) => approval.status === "approved") ? "approved" : run.status,
    auditTrail: [
      ...run.auditTrail,
      {
        at: now,
        action: "push.gate",
        detail: "Push gate passed with current policy requirements satisfied."
      }
    ]
  });
  return { ok: true, run: updated };
}

export function recordPush(runId: string, commitSha: string): RunRecord {
  const gate = pushGate(runId);
  if (!gate.ok) {
    throw new Error(`Run ${runId} cannot record a final push until sentinelops push gate passes.`);
  }
  const run = gate.run;
  const now = new Date().toISOString();
  return saveRun({
    ...run,
    updatedAt: now,
    auditTrail: [
      ...run.auditTrail,
      {
        at: now,
        action: "push.record",
        detail: `Recorded commit ${commitSha}.`
      }
    ]
  });
}
