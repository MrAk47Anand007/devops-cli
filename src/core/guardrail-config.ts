import { logAudit } from "../deploy.js";
import { guard } from "./guard.js";
import { readConfig, writeConfig } from "./store.js";

export interface GuardrailPolicyConfig {
  thresholds: {
    medium: number;
    high: number;
    critical: number;
  };
  rollback: {
    minConfidence: number;
    maxErrorRate: number;
    maxLatencyP95: number;
    requireHumanApproval: boolean;
  };
}

const DEFAULT_GUARDRAIL_POLICY: GuardrailPolicyConfig = {
  thresholds: {
    medium: 35,
    high: 60,
    critical: 80
  },
  rollback: {
    minConfidence: 90,
    maxErrorRate: 0.25,
    maxLatencyP95: 2000,
    requireHumanApproval: false
  }
};

function readNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (typeof raw !== "string") {
    return fallback;
  }
  return raw === "true";
}

function toStoredConfig(
  policy: GuardrailPolicyConfig,
  current: Record<string, string>
): Record<string, string> {
  return {
    ...current,
    "threshold.medium": String(policy.thresholds.medium),
    "threshold.high": String(policy.thresholds.high),
    "threshold.critical": String(policy.thresholds.critical),
    "guard.rollback.minConfidence": String(policy.rollback.minConfidence),
    "guard.rollback.maxErrorRate": String(policy.rollback.maxErrorRate),
    "guard.rollback.maxLatencyP95": String(policy.rollback.maxLatencyP95),
    "guard.rollback.requireHumanApproval": policy.rollback.requireHumanApproval ? "true" : "false"
  };
}

export function getGuardrailPolicyConfig(): GuardrailPolicyConfig {
  const config = readConfig();
  return {
    thresholds: {
      medium: readNumber(config["threshold.medium"], DEFAULT_GUARDRAIL_POLICY.thresholds.medium),
      high: readNumber(config["threshold.high"], DEFAULT_GUARDRAIL_POLICY.thresholds.high),
      critical: readNumber(config["threshold.critical"], DEFAULT_GUARDRAIL_POLICY.thresholds.critical)
    },
    rollback: {
      minConfidence: readNumber(
        config["guard.rollback.minConfidence"],
        DEFAULT_GUARDRAIL_POLICY.rollback.minConfidence
      ),
      maxErrorRate: readNumber(
        config["guard.rollback.maxErrorRate"],
        DEFAULT_GUARDRAIL_POLICY.rollback.maxErrorRate
      ),
      maxLatencyP95: readNumber(
        config["guard.rollback.maxLatencyP95"],
        DEFAULT_GUARDRAIL_POLICY.rollback.maxLatencyP95
      ),
      requireHumanApproval: readBoolean(
        config["guard.rollback.requireHumanApproval"],
        DEFAULT_GUARDRAIL_POLICY.rollback.requireHumanApproval
      )
    }
  };
}

export function updateGuardrailPolicyConfig(
  input: {
    thresholds?: Partial<GuardrailPolicyConfig["thresholds"]>;
    rollback?: Partial<GuardrailPolicyConfig["rollback"]>;
  },
  options?: { actor?: string; approved?: boolean }
): GuardrailPolicyConfig {
  const actor = options?.actor ?? "policy";
  const currentStored = readConfig();
  const current = getGuardrailPolicyConfig();
  const next: GuardrailPolicyConfig = {
    thresholds: {
      ...current.thresholds,
      ...input.thresholds
    },
    rollback: {
      ...current.rollback,
      ...input.rollback
    }
  };

  const changes = [
    { key: "threshold.medium", previousValue: current.thresholds.medium, nextValue: next.thresholds.medium },
    { key: "threshold.high", previousValue: current.thresholds.high, nextValue: next.thresholds.high },
    { key: "threshold.critical", previousValue: current.thresholds.critical, nextValue: next.thresholds.critical },
    {
      key: "guard.rollback.minConfidence",
      previousValue: current.rollback.minConfidence,
      nextValue: next.rollback.minConfidence
    },
    {
      key: "guard.rollback.maxErrorRate",
      previousValue: current.rollback.maxErrorRate,
      nextValue: next.rollback.maxErrorRate
    },
    {
      key: "guard.rollback.maxLatencyP95",
      previousValue: current.rollback.maxLatencyP95,
      nextValue: next.rollback.maxLatencyP95
    },
    {
      key: "guard.rollback.requireHumanApproval",
      previousValue: current.rollback.requireHumanApproval,
      nextValue: next.rollback.requireHumanApproval
    }
  ].filter((change) => change.previousValue !== change.nextValue);

  for (const change of changes) {
    const decision = guard({
      actor,
      action: "config.write",
      configKey: change.key,
      previousValue: change.previousValue,
      nextValue: change.nextValue,
      humanApproved: options?.approved ?? false
    });
    if (!decision.ok) {
      throw new Error(decision.message);
    }
  }

  const nextStored = toStoredConfig(next, currentStored);
  validateGuardrailConfig(nextStored);
  writeConfig(nextStored);

  for (const change of changes) {
    logAudit({
      timestamp: Date.now(),
      actor,
      action: "config",
      detail: `${change.key} -> ${String(change.nextValue)} (ALLOWED)`
    });
  }

  return next;
}

export function validateGuardrailConfig(config: Record<string, string>): void {
  const medium = readNumber(config["threshold.medium"], DEFAULT_GUARDRAIL_POLICY.thresholds.medium);
  const high = readNumber(config["threshold.high"], DEFAULT_GUARDRAIL_POLICY.thresholds.high);
  const critical = readNumber(config["threshold.critical"], DEFAULT_GUARDRAIL_POLICY.thresholds.critical);
  const minConfidence = readNumber(
    config["guard.rollback.minConfidence"],
    DEFAULT_GUARDRAIL_POLICY.rollback.minConfidence
  );
  const maxErrorRate = readNumber(
    config["guard.rollback.maxErrorRate"],
    DEFAULT_GUARDRAIL_POLICY.rollback.maxErrorRate
  );
  const maxLatencyP95 = readNumber(
    config["guard.rollback.maxLatencyP95"],
    DEFAULT_GUARDRAIL_POLICY.rollback.maxLatencyP95
  );

  if (!(medium >= 0 && medium < high && high < critical && critical <= 100)) {
    throw new Error(
      "Guardrail thresholds must increase strictly from medium to high to critical and stay within 0-100."
    );
  }

  if (!(minConfidence >= 0 && minConfidence <= 100)) {
    throw new Error("Rollback minimum confidence must stay within 0-100.");
  }

  if (!(maxErrorRate >= 0 && maxErrorRate <= 1)) {
    throw new Error("Rollback max error rate must stay within 0-1.");
  }

  if (!(maxLatencyP95 > 0)) {
    throw new Error("Rollback max latency p95 must be greater than 0.");
  }
}
