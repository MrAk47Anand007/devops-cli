import { readConfig } from "./store.js";
import type { Action, Metrics } from "../types.js";

export type GuardAction =
  | "rollback"
  | "deploy"
  | "config.write"
  | "approval.override"
  | "automation.run";

export interface GuardContext {
  actor: string;
  action: GuardAction;
  confidence?: number;
  metrics?: Metrics;
  humanApproved?: boolean;
  manualOverride?: boolean;
  reason?: string;
  configKey?: string;
  previousValue?: string | boolean | number | null;
  nextValue?: string | boolean | number | null;
}

export interface GuardDecision {
  ok: boolean;
  code:
    | "ALLOWED"
    | "REQUIRES_APPROVAL"
    | "CONFIDENCE_TOO_LOW"
    | "BLAST_RADIUS_EXCEEDED"
    | "ACTION_BLOCKED";
  message: string;
  auditDetail: string;
}

function configNumber(key: string, fallback: number): number {
  const raw = Number(readConfig()[key] ?? fallback);
  return Number.isFinite(raw) ? raw : fallback;
}

function configBoolean(key: string, fallback: boolean): boolean {
  const raw = readConfig()[key];
  if (typeof raw !== "string") {
    return fallback;
  }
  return raw === "true";
}

function rollbackConfidenceThreshold(): number {
  return configNumber("guard.rollback.minConfidence", 90);
}

function maxErrorRate(): number {
  return configNumber("guard.rollback.maxErrorRate", 0.25);
}

function maxLatencyP95(): number {
  return configNumber("guard.rollback.maxLatencyP95", 2000);
}

function requireHumanApprovalForRollback(): boolean {
  return configBoolean("guard.rollback.requireHumanApproval", false);
}

export function guard(context: GuardContext): GuardDecision {
  if (context.manualOverride) {
    return {
      ok: true,
      code: "ALLOWED",
      message: `Guard override accepted for ${context.action}.`,
      auditDetail: `${context.actor} manually overrode guard for ${context.action}.`
    };
  }

  if (context.action !== "rollback") {
    if (context.action === "config.write" || context.action === "automation.run") {
      const configDecision = evaluateConfigGuard(context);
      if (configDecision) {
        return configDecision;
      }
    }
    return {
      ok: true,
      code: "ALLOWED",
      message: `Guard allows ${context.action}.`,
      auditDetail: `${context.actor} passed guard for ${context.action}.`
    };
  }

  if (requireHumanApprovalForRollback() && !context.humanApproved) {
    return {
      ok: false,
      code: "REQUIRES_APPROVAL",
      message: "Rollback requires explicit human approval under the current guardrail policy.",
      auditDetail: `${context.actor} blocked from rollback because human approval is required.`
    };
  }

  if ((context.confidence ?? 0) < rollbackConfidenceThreshold() && !context.humanApproved) {
    return {
      ok: false,
      code: "CONFIDENCE_TOO_LOW",
      message: `Rollback confidence ${context.confidence ?? 0}% is below the guard threshold ${rollbackConfidenceThreshold()}%.`,
      auditDetail: `${context.actor} blocked from rollback because confidence was below threshold.`
    };
  }

  if (context.metrics) {
    if (context.metrics.errorRate > maxErrorRate() || context.metrics.latencyP95 > maxLatencyP95()) {
      return {
        ok: false,
        code: "BLAST_RADIUS_EXCEEDED",
        message:
          `Rollback blocked because metrics exceed configured blast-radius thresholds ` +
          `(errorRate>${maxErrorRate()} or latencyP95>${maxLatencyP95()}ms).`,
        auditDetail: `${context.actor} blocked from rollback because guard blast-radius thresholds were exceeded.`
      };
    }
  }

  return {
    ok: true,
    code: "ALLOWED",
    message: "Guard allows rollback.",
    auditDetail: `${context.actor} passed guard for rollback.`
  };
}

function toNumber(value: string | boolean | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function evaluateConfigGuard(context: GuardContext): GuardDecision | null {
  const key = context.configKey ?? "";
  const previous = context.previousValue;
  const next = context.nextValue;

  const previousNumber = toNumber(previous);
  const nextNumber = toNumber(next);

  const loosensSafety =
    (key === "guard.rollback.minConfidence" &&
      previousNumber !== null &&
      nextNumber !== null &&
      nextNumber < previousNumber) ||
    (key === "guard.rollback.maxErrorRate" &&
      previousNumber !== null &&
      nextNumber !== null &&
      nextNumber > previousNumber) ||
    (key === "guard.rollback.maxLatencyP95" &&
      previousNumber !== null &&
      nextNumber !== null &&
      nextNumber > previousNumber) ||
    ((key === "threshold.medium" || key === "threshold.high" || key === "threshold.critical") &&
      previousNumber !== null &&
      nextNumber !== null &&
      nextNumber > previousNumber) ||
    (key === "guard.rollback.requireHumanApproval" && previous === true && next === false);

  if (!loosensSafety) {
    return null;
  }

  if (!context.humanApproved) {
    return {
      ok: false,
      code: "REQUIRES_APPROVAL",
      message: `Changing ${key} in a less safe direction requires explicit approval.`,
      auditDetail: `${context.actor} blocked from loosening ${key} without approval.`
    };
  }

  return {
    ok: true,
    code: "ALLOWED",
    message: `Approved safety-impacting config change for ${key}.`,
    auditDetail: `${context.actor} approved safety-impacting config change for ${key}.`
  };
}
