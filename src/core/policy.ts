import { getLatestRunId, loadRun, readConfig } from "./store.js";
import { getGuardrailPolicyConfig, updateGuardrailPolicyConfig } from "./guardrail-config.js";
import { type PolicyViolation, type RunRecord } from "../types.js";

const POLICY_DEFINITIONS = [
  {
    id: "APPROVAL_REQUIRED",
    description: "Medium and higher risk changes require approval before protected mutations."
  },
  {
    id: "TEST_EVIDENCE_REQUIRED",
    description: "High risk changes need recorded passing test evidence before push or update."
  },
  {
    id: "CRITICAL_RISK",
    description: "Critical risk changes stay blocked until an explicit critical-action policy exists."
  },
  {
    id: "PROTECTED_CHANGE",
    description: "Production, config, secret, deploy, and rollback changes are protected actions."
  }
] as const;

function requireLatestRun(): RunRecord {
  const runId = getLatestRunId();
  if (!runId) {
    throw new Error("No latest run available.");
  }
  const run = loadRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found.`);
  }
  return run;
}

function hasApproved(run: RunRecord): boolean {
  return run.approvals.some((entry) => entry.status === "approved");
}

function hasPassingTests(run: RunRecord): boolean {
  return run.tests.some((entry) => entry.status === "passed") && !run.tests.some((entry) => entry.status === "failed");
}

function effectiveThreshold(name: "medium" | "high" | "critical"): number {
  const config = readConfig();
  const defaults = {
    medium: 35,
    high: 60,
    critical: 80
  } as const;
  const configured = Number(config[`threshold.${name}`] ?? defaults[name]);
  return Number.isFinite(configured) ? configured : defaults[name];
}

function effectiveRiskLevel(run: RunRecord): "low" | "medium" | "high" | "critical" {
  const score = run.plan?.risk.score ?? 0;
  if (score >= effectiveThreshold("critical")) return "critical";
  if (score >= effectiveThreshold("high")) return "high";
  if (score >= effectiveThreshold("medium")) return "medium";
  return "low";
}

function touchesProtectedSurface(run: RunRecord): boolean {
  const text = `${run.plan?.summary ?? ""} ${run.plan?.risk.reasons.join(" ") ?? ""} ${run.context?.summary ?? ""}`.toLowerCase();
  return (
    run.context?.service.environment === "production" ||
    ["config", "secret", "deploy", "rollback", "prod", "production"].some((keyword) => text.includes(keyword))
  );
}

export function evaluateRunPolicy(run: RunRecord): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const riskLevel = effectiveRiskLevel(run);

  if (riskLevel === "medium" || riskLevel === "high" || riskLevel === "critical") {
    if (!hasApproved(run)) {
      violations.push({
        id: "APPROVAL_REQUIRED",
        severity: riskLevel === "critical" ? "critical" : "high",
        message: "This run needs approval before protected actions."
      });
    }
  }

  if (riskLevel === "high" || riskLevel === "critical") {
    if (!hasPassingTests(run)) {
      violations.push({
        id: "TEST_EVIDENCE_REQUIRED",
        severity: riskLevel === "critical" ? "critical" : "high",
        message: "High risk changes require passing test evidence."
      });
    }
  }

  if (riskLevel === "critical") {
    violations.push({
      id: "CRITICAL_RISK",
      severity: "critical",
      message: "Critical risk actions remain blocked until explicitly allowed."
    });
  }

  if (touchesProtectedSurface(run)) {
    violations.push({
      id: "PROTECTED_CHANGE",
      severity: "high",
      message: "This run touches protected production, config, secret, or deploy surfaces."
    });
  }

  return violations;
}

export function listPolicies(): Array<{ id: string; description: string }> {
  return [...POLICY_DEFINITIONS];
}

export function setPolicyThreshold(
  key: string,
  value: string,
  options?: { actor?: string; approved?: boolean }
): { key: string; value: string } {
  if (!["threshold.medium", "threshold.high", "threshold.critical"].includes(key)) {
    throw new Error(`Unsupported policy key ${key}.`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Policy threshold value must be numeric.");
  }
  const thresholdName = key.replace("threshold.", "") as "medium" | "high" | "critical";
  updateGuardrailPolicyConfig(
    {
      thresholds: {
        [thresholdName]: numeric
      }
    },
    options
  );
  return { key, value };
}

export function getPolicyThresholds(): {
  medium: number;
  high: number;
  critical: number;
} {
  return getGuardrailPolicyConfig().thresholds;
}

export function checkLatestPolicy(): {
  run: RunRecord;
  violations: PolicyViolation[];
} {
  const run = requireLatestRun();
  return {
    run,
    violations: evaluateRunPolicy(run)
  };
}

export function explainPolicyViolation(violationId: string): string {
  const policy = POLICY_DEFINITIONS.find((entry) => entry.id === violationId);
  if (!policy) {
    throw new Error(`Unknown policy violation ${violationId}.`);
  }
  return policy.description;
}

export function checkPermission(action: string): {
  run: RunRecord | null;
  allowed: boolean;
  reasonCode: "ALLOWED" | "ACTION_BLOCKED";
  message: string;
} {
  const protectedActions = new Set([
    "push",
    "deploy",
    "rollback",
    "merge",
    "close-issue",
    "update-pr"
  ]);

  if (!protectedActions.has(action)) {
    return {
      run: null,
      allowed: true,
      reasonCode: "ALLOWED",
      message: `Action ${action} is not policy-gated.`
    };
  }

  const run = requireLatestRun();
  const violations = evaluateRunPolicy(run).filter((entry) =>
    ["APPROVAL_REQUIRED", "TEST_EVIDENCE_REQUIRED", "CRITICAL_RISK", "PROTECTED_CHANGE"].includes(entry.id)
  );

  if (violations.length > 0) {
    return {
      run,
      allowed: false,
      reasonCode: "ACTION_BLOCKED",
      message: violations.map((entry) => entry.message).join(" ")
    };
  }

  return {
    run,
    allowed: true,
    reasonCode: "ALLOWED",
    message: `Action ${action} is permitted for the latest run.`
  };
}
