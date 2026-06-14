import { readFileSync } from "node:fs";
import {
  createRunId,
  getLatestRunId,
  loadRun,
  readLatestContext,
  saveRun,
  writeLatestRunId
} from "./store.js";
import {
  ContextSchema,
  PlanSchema,
  type Context,
  type Plan,
  type RiskLevel,
  type RunRecord
} from "../types.js";

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function deriveRisk(context: Context): Plan["risk"] {
  const reasons: string[] = [];
  let score = 15;

  if (context.alerts.length > 0) {
    score += 15;
    reasons.push(`Scenario contains ${context.alerts.length} active alerts.`);
  }
  if (context.service.environment === "production") {
    score += 20;
    reasons.push("Service targets production.");
  }
  if (context.service.health === "failing") {
    score += 25;
    reasons.push("Service is currently failing.");
  }

  const text = `${context.summary} ${context.logs.map((log) => log.message).join(" ")} ${context.incidents.map((incident) => incident.summary).join(" ")}`.toLowerCase();
  for (const keyword of ["config", "secret", "prod", "rollback"]) {
    if (text.includes(keyword)) {
      score += 15;
      reasons.push(`Detected risky keyword: ${keyword}.`);
    }
  }

  const cappedScore = Math.min(score, 100);
  const level = riskLevelFromScore(cappedScore);

  return { level, score: cappedScore, reasons };
}

function buildPlan(context: Context): Plan {
  const risk = deriveRisk(context);
  return PlanSchema.parse({
    summary: `Investigate ${context.service.name} in ${context.service.environment} and prepare a safe remediation plan.`,
    steps: [
      `Inspect logs and alerts for ${context.service.id}.`,
      "Review linked GitHub context before preparing any patch.",
      "Prepare local code or config changes and collect test evidence.",
      "Package approval evidence before allowing any push or external update."
    ],
    criticalQuestions: risk.level === "low" ? [] : ["Does this change touch production configuration, secrets, or rollback behavior?"],
    risk
  });
}

function buildPromptPlan(prompt: string): Plan {
  const normalized = prompt.toLowerCase();
  const reasons: string[] = [];
  let score = 20;

  for (const keyword of ["config", "secret", "prod", "production", "rollback", "deploy"]) {
    if (normalized.includes(keyword)) {
      score += 15;
      reasons.push(`Prompt contains risky keyword: ${keyword}.`);
    }
  }

  const cappedScore = Math.min(score, 100);
  const level = riskLevelFromScore(cappedScore);

  return PlanSchema.parse({
    summary: `Investigate and fix: ${prompt}`,
    steps: [
      "Clarify the prompt target and affected code path.",
      "Inspect repository context before making changes.",
      "Prepare local patch and test evidence.",
      "Require approval before any risky external mutation."
    ],
    criticalQuestions: level === "low" ? [] : ["Does this prompt affect production config, deployment, or secrets?"],
    risk: {
      level,
      score: cappedScore,
      reasons
    }
  });
}

function buildTargetPlan(target: string): Plan {
  const normalized = target.toLowerCase();
  const score =
    normalized.includes("/pull/") || normalized.includes("/issues/")
      ? 45
      : normalized.includes("prod") || normalized.includes("deploy")
        ? 65
        : 30;
  const level = riskLevelFromScore(score);

  return PlanSchema.parse({
    summary: `Investigate linked GitHub target and prepare a safe remediation for ${target}.`,
    steps: [
      "Read the linked GitHub issue or PR context.",
      "Inspect the affected repository files and tests.",
      "Prepare a local patch with approval evidence.",
      "Hold external updates until SentinelOps push gate succeeds."
    ],
    criticalQuestions:
      level === "low"
        ? []
        : ["What repository area and rollout path does this GitHub target affect?"],
    risk: {
      level,
      score,
      reasons: [`Planning directly from GitHub target ${target}.`]
    }
  });
}

function loadContextFromFile(filePath: string): Context {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return ContextSchema.parse(raw);
}

export function createPlanFromContextFile(contextFilePath: string): RunRecord {
  const latestRunId = loadLatestRunIdRequired();
  const existingRun = loadRunRequired(latestRunId);
  const context = loadContextFromFile(contextFilePath);
  const plan = buildPlan(context);
  const now = new Date().toISOString();

  const updatedRun = saveRun({
    ...existingRun,
    updatedAt: now,
    status: plan.risk.level === "low" ? "planned" : "approval_pending",
    plan,
    auditTrail: [
      ...existingRun.auditTrail,
      {
        at: now,
        action: "plan.create",
        detail: `Created plan with ${plan.risk.level} risk (${plan.risk.score}).`
      }
    ]
  });
  writeLatestRunId(updatedRun.id);
  return updatedRun;
}

export function createPlanFromPrompt(prompt: string): RunRecord {
  const now = new Date().toISOString();
  const run = saveRun({
    id: createRunId(),
    createdAt: now,
    updatedAt: now,
    source: "prompt",
    status: "planned",
    scenario: null,
    serviceId: null,
    context: null,
    plan: buildPromptPlan(prompt),
    testPlan: null,
    approvals: [],
    tests: [],
    auditTrail: [
      {
        at: now,
        action: "plan.create",
        detail: "Created plan from direct prompt."
      }
    ],
    githubTarget: null,
    prompt
  });
  writeLatestRunId(run.id);
  return run;
}

export function createPlanFromTarget(target: string): RunRecord {
  const now = new Date().toISOString();
  const plan = buildTargetPlan(target);
  const run = saveRun({
    id: createRunId(),
    createdAt: now,
    updatedAt: now,
    source: "github",
    status: plan.risk.level === "low" ? "planned" : "approval_pending",
    scenario: null,
    serviceId: null,
    context: null,
    plan,
    testPlan: null,
    approvals: [],
    tests: [],
    auditTrail: [
      {
        at: now,
        action: "plan.create",
        detail: `Created plan from GitHub target ${target}.`
      }
    ],
    githubTarget: target,
    prompt: null
  });
  writeLatestRunId(run.id);
  return run;
}

export function showLatestPlan(): RunRecord | null {
  const latestRun = loadLatestRunOptional();
  return latestRun?.plan ? latestRun : null;
}

export function readLatestContextForCli(): Context | null {
  return readLatestContext();
}

export function askLatestCriticalQuestions(): {
  runId: string;
  criticalQuestions: string[];
} {
  const latestRun = loadLatestRunOptional();
  if (!latestRun?.plan) {
    throw new Error("No latest plan is available.");
  }
  return {
    runId: latestRun.id,
    criticalQuestions: latestRun.plan.criticalQuestions
  };
}

function loadLatestRunIdRequired(): string {
  const runId = getLatestRunId();
  if (!runId) {
    throw new Error("No latest run available.");
  }
  return runId;
}

function loadRunRequired(runId: string): RunRecord {
  const run = loadRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found.`);
  }
  return run;
}

function loadLatestRunOptional(): RunRecord | null {
  const runId = getLatestRunId();
  return runId ? loadRun(runId) : null;
}
