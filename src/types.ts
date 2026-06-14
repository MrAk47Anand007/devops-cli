import { z } from "zod";

export const ActionSchema = z.enum(["rollback", "hold"]);
export type Action = z.infer<typeof ActionSchema>;

export const MetricsSchema = z.object({
  timestamp: z.number(),
  errorRate: z.number(),
  latencyP95: z.number(),
  requestsPerSec: z.number()
});
export type Metrics = z.infer<typeof MetricsSchema>;

export const IncidentSchema = z.object({
  id: z.string(),
  deployId: z.string(),
  summary: z.string(),
  errorRate: z.number(),
  latencyP95: z.number(),
  agentAction: ActionSchema,
  agentConfidence: z.number(),
  humanOverride: ActionSchema.nullable(),
  outcome: z.string()
});
export type Incident = z.infer<typeof IncidentSchema>;

export const DecisionSchema = z.object({
  action: ActionSchema,
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  evidence: z.array(z.string()),
  similarIncidentId: z.string().nullable()
});
export type Decision = z.infer<typeof DecisionSchema>;

export const HumanDecisionSchema = z.enum(["approve", "override"]);
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;

export const ScenarioSchema = z.enum(["healthy", "degraded", "crash"]);
export type Scenario = z.infer<typeof ScenarioSchema>;

export const DashboardScenarioSchema = z.enum([
  "healthy",
  "degraded-api",
  "failing-test",
  "post-deploy-errors",
  "config-risk"
]);
export type DashboardScenario = z.infer<typeof DashboardScenarioSchema>;

export const ServiceHealthSchema = z.enum(["healthy", "degraded", "failing"]);
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;

export const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  environment: z.string(),
  health: ServiceHealthSchema,
  linkedGithub: z
    .object({
      issueUrl: z.string().nullable(),
      prUrl: z.string().nullable()
    })
    .nullable()
});
export type Service = z.infer<typeof ServiceSchema>;

export const LogRecordSchema = z.object({
  id: z.string(),
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  serviceId: z.string(),
  timestamp: z.string()
});
export type LogRecord = z.infer<typeof LogRecordSchema>;

export const AlertRecordSchema = z.object({
  id: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string(),
  serviceId: z.string(),
  timestamp: z.string()
});
export type AlertRecord = z.infer<typeof AlertRecordSchema>;

export const DeployRecordSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  status: z.enum(["healthy", "degraded", "failed"]),
  version: z.string(),
  timestamp: z.string()
});
export type DeployRecord = z.infer<typeof DeployRecordSchema>;

export const IncidentRecordSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  status: z.enum(["open", "investigating", "resolved"]),
  summary: z.string(),
  linkedGithub: z
    .object({
      issueUrl: z.string().nullable(),
      prUrl: z.string().nullable()
    })
    .nullable(),
  timestamp: z.string()
});
export type IncidentRecord = z.infer<typeof IncidentRecordSchema>;

export const ContextSchema = z.object({
  service: ServiceSchema,
  scenario: DashboardScenarioSchema,
  logs: z.array(LogRecordSchema),
  alerts: z.array(AlertRecordSchema),
  deploys: z.array(DeployRecordSchema),
  incidents: z.array(IncidentRecordSchema),
  summary: z.string()
});
export type Context = z.infer<typeof ContextSchema>;

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const RiskSchema = z.object({
  level: RiskLevelSchema,
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string())
});
export type Risk = z.infer<typeof RiskSchema>;

export const PlanSchema = z.object({
  summary: z.string(),
  steps: z.array(z.string()),
  criticalQuestions: z.array(z.string()),
  risk: RiskSchema
});
export type Plan = z.infer<typeof PlanSchema>;

export const ApprovalStatusSchema = z.enum(["approved", "rejected", "changes_requested"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRecordSchema = z.object({
  source: z.string(),
  status: ApprovalStatusSchema,
  by: z.string(),
  at: z.string()
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

export const TestResultSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed", "not_run"]),
  detail: z.string()
});
export type TestResult = z.infer<typeof TestResultSchema>;

export const TestPlanSchema = z.object({
  target: z.string(),
  commands: z.array(z.string()),
  rationale: z.array(z.string())
});
export type TestPlan = z.infer<typeof TestPlanSchema>;

export const PolicyViolationSchema = z.object({
  id: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  message: z.string()
});
export type PolicyViolation = z.infer<typeof PolicyViolationSchema>;

export const RunAuditEntrySchema = z.object({
  at: z.string(),
  action: z.string(),
  detail: z.string()
});
export type RunAuditEntry = z.infer<typeof RunAuditEntrySchema>;

export const RunStatusSchema = z.enum([
  "initialized",
  "scenario_loaded",
  "context_created",
  "planned",
  "approval_pending",
  "approved",
  "blocked",
  "report_created"
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: z.enum(["scenario", "prompt", "github"]),
  status: RunStatusSchema,
  scenario: DashboardScenarioSchema.nullable(),
  serviceId: z.string().nullable(),
  context: ContextSchema.nullable(),
  plan: PlanSchema.nullable(),
  testPlan: TestPlanSchema.nullable(),
  approvals: z.array(ApprovalRecordSchema),
  tests: z.array(TestResultSchema),
  auditTrail: z.array(RunAuditEntrySchema),
  githubTarget: z.string().nullable(),
  prompt: z.string().nullable()
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const OperatorConfigSchema = z.object({
  trackedRepos: z.array(z.string()).min(1),
  slackChannel: z.string().min(1),
  agentCommand: z.string().min(1),
  agentArgs: z.array(z.string()),
  enabled: z.boolean(),
  updatedAt: z.string()
});
export type OperatorConfig = z.infer<typeof OperatorConfigSchema>;

export const AutomationJobStatusSchema = z.enum([
  "queued",
  "awaiting_approval",
  "approved",
  "rejected",
  "running_agent",
  "completed",
  "failed"
]);
export type AutomationJobStatus = z.infer<typeof AutomationJobStatusSchema>;

export const AgentExecutionSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  exitCode: z.number().int(),
  transcriptPath: z.string(),
  summary: z.string(),
  startedAt: z.string(),
  finishedAt: z.string()
});
export type AgentExecution = z.infer<typeof AgentExecutionSchema>;

export const AutomationJobSchema = z.object({
  id: z.string(),
  runId: z.string(),
  source: z.enum(["github_issue"]),
  serviceId: z.string(),
  githubIssueUrl: z.string(),
  status: AutomationJobStatusSchema,
  approvalMessageId: z.string().nullable(),
  execution: AgentExecutionSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type AutomationJob = z.infer<typeof AutomationJobSchema>;

export const AutomationEventSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  kind: z.enum([
    "github.issue.opened",
    "slack.approved",
    "slack.rejected",
    "agent.completed",
    "agent.failed"
  ]),
  payload: z.record(z.string(), z.unknown()),
  at: z.string()
});
export type AutomationEvent = z.infer<typeof AutomationEventSchema>;

export const BASELINE = {
  errorRate: 0.004,
  latencyP95: 120
} as const;

export const CONFIDENCE_THRESHOLD = 85;
