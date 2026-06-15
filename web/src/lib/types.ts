import { z } from "zod";

export interface LinkedGithubReferences {
  issueUrl: string | null;
  prUrl: string | null;
}

export interface Service {
  id: string;
  name: string;
  environment: string;
  health: "healthy" | "degraded" | "failing";
  linkedGithub: LinkedGithubReferences | null;
}

export interface ServicesResponse {
  services: Service[];
}

export interface RuntimeLiveService {
  serviceId: string;
  revision: string | null;
  revisionDetail: string;
  deployState: string | null;
}

export interface MetricsSnapshot {
  timestamp: number;
  errorRate: number;
  latencyP95: number;
  requestsPerSec: number;
}

export interface ServiceMetricDelta {
  current: number;
  baseline: number;
  absolute: number;
  percent: number | null;
  direction: "up" | "down" | "flat";
}

export interface ServiceMetricsResponse {
  service: Service;
  metricSourceId: string;
  baselineLookbackHours: number;
  runtime: RuntimeLiveService;
  current: MetricsSnapshot;
  baseline: MetricsSnapshot;
  delta: {
    errorRate: ServiceMetricDelta;
    latencyP95: ServiceMetricDelta;
    requestsPerSec: ServiceMetricDelta;
  };
  series: Array<{
    timestamp: number;
    errorRate: number;
    errorRateBaseline: number;
    latencyP95: number;
    latencyP95Baseline: number;
    requestsPerSec: number;
    requestsPerSecBaseline: number;
  }>;
  updatedAt: string;
}

export interface IntegrationHealth {
  id: string;
  status: "ready" | "degraded" | "unavailable";
  detail: string;
  checkedAt: number;
}

export interface RuntimeLiveResponse {
  config: Record<string, unknown> | null;
  health: IntegrationHealth[];
  services: RuntimeLiveService[];
  updatedAt: string;
}

export interface IntegrationHealthResponse {
  health: IntegrationHealth[];
}

export interface IntegrationHealthItemResponse {
  health: IntegrationHealth;
}

export interface AuditEntry {
  timestamp: number;
  actor: string;
  action: "deploy" | "rollback" | "decision" | "override" | "config";
  detail: string;
}

export interface AuditLogResponse {
  entries: AuditEntry[];
}

export interface AuditRunSummary {
  id: string;
  status: string;
  updatedAt: string;
}

export interface AuditRunsResponse {
  runs: AuditRunSummary[];
}

export interface DeployRecord {
  id: string;
  serviceId: string;
  status: "healthy" | "degraded" | "failed";
  version: string;
  timestamp: string;
  target?: string;
  judgment?: {
    decision: {
      action: "rollback" | "hold";
      confidence: number;
      reasoning: string;
      evidence: string[];
      similarIncidentId: string | null;
    };
    metricSourceId: string;
    metrics: MetricsSnapshot;
    mode: "autonomous" | "needs_review";
    capturedAt: string;
  } | null;
}

export interface DeploysResponse {
  deploys: DeployRecord[];
}

export interface AgentExecution {
  command: string;
  args: string[];
  exitCode: number;
  transcriptPath: string;
  summary: string;
  startedAt: string;
  finishedAt: string;
}

export interface AutomationJob {
  id: string;
  runId: string;
  source: "github_issue";
  serviceId: string;
  githubIssueUrl: string;
  status:
    | "queued"
    | "awaiting_approval"
    | "approved"
    | "rejected"
    | "running_agent"
    | "completed"
    | "failed";
  approvalMessageId: string | null;
  execution: AgentExecution | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationJobsResponse {
  jobs: AutomationJob[];
}

export interface PipelineStage {
  id: "intake" | "approval" | "execution" | "guard";
  label: string;
  status: "pending" | "active" | "completed" | "blocked" | "failed";
  detail: string;
}

export interface PipelineGuardResult {
  status: "passed" | "blocked";
  summary: string;
  violations: string[];
}

export interface AutomationPipelineItem {
  job: AutomationJob;
  summary: string;
  githubTarget: string | null;
  risk: ApprovalRisk | null;
  approvals: Array<{
    source: string;
    status: "approved" | "rejected" | "changes_requested";
    by: string;
    at: string;
  }>;
  latestApproval: {
    source: string;
    status: "approved" | "rejected" | "changes_requested";
    by: string;
    at: string;
  } | null;
  testSummary: {
    passed: number;
    failed: number;
    notRun: number;
  };
  guard: PipelineGuardResult;
  stages: PipelineStage[];
  transcriptPreview: string | null;
  events: Array<{
    id: string;
    kind:
      | "github.issue.opened"
      | "slack.approved"
      | "slack.rejected"
      | "agent.completed"
      | "agent.failed";
    at: string;
    payload: Record<string, unknown>;
  }>;
}

export interface AutomationPipelineResponse {
  items: AutomationPipelineItem[];
}

export interface IncidentRecord {
  id: string;
  serviceId: string;
  status: "open" | "investigating" | "resolved";
  summary: string;
  linkedGithub: LinkedGithubReferences | null;
  timestamp: string;
}

export interface IncidentsResponse {
  incidents: IncidentRecord[];
}

export interface IncidentResponse {
  incident: IncidentRecord;
}

export interface RepoMemoryEntry {
  runId: string;
  summary: string;
  serviceId: string | null;
  githubTarget: string | null;
  updatedAt: string;
  tags: string[];
}

export interface RepoMemoryResponse {
  entries: RepoMemoryEntry[];
}

export interface MemoryIncident {
  id: string;
  deployId: string;
  summary: string;
  errorRate: number;
  latencyP95: number;
  agentAction: "rollback" | "hold";
  agentConfidence: number;
  humanOverride: "rollback" | "hold" | null;
  outcome: string;
}

export interface MemoryIncidentsResponse {
  incidents: MemoryIncident[];
}

export interface ApprovalRisk {
  level: "low" | "medium" | "high" | "critical";
  score: number;
  reasons?: string[];
}

export interface PendingApproval {
  runId: string;
  summary: string;
  risk: ApprovalRisk | null;
  githubTarget: string | null;
}

export interface ApprovalsResponse {
  approvals: PendingApproval[];
}

export interface ApprovalDetailResponse {
  runId: string;
  summary: string;
  risk: ApprovalRisk | null;
  githubTarget: string | null;
  approvals: Array<{
    source: string;
    status: "approved" | "rejected" | "changes_requested";
    by: string;
    at: string;
  }>;
  latestApproval: {
    source: string;
    status: "approved" | "rejected" | "changes_requested";
    by: string;
    at: string;
  } | null;
  tests: Array<{
    name: string;
    status: "passed" | "failed" | "not_run";
    detail: string;
  }>;
  policyViolations: Array<{
    id: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
  }>;
  plan: {
    summary: string;
    steps: string[];
    criticalQuestions: string[];
    risk: ApprovalRisk;
  } | null;
  diff: string;
  slackPreview: string;
  requiresApproval: boolean;
}

export interface OperatorConfigClient {
  trackedRepos: string[];
  slackChannel: string;
  agentCommand: string;
  agentArgs: string[];
  judgmentProvider: "canned" | "openai" | "anthropic" | "ai-cli";
  openai?: {
    model?: string;
  };
  anthropic?: {
    model?: string;
  };
  aiCli?: {
    command?: string;
    args?: string[];
    healthArgs?: string[];
  };
  deployTarget: "simulator" | "kubernetes" | "docker";
  kubernetes?: {
    command?: string;
    context?: string;
    namespace?: string;
    deployment?: string;
    service?: string;
  };
  docker?: {
    command?: string;
    composeFile?: string;
    service?: string;
    container?: string;
  };
  metricSource: "simulator" | "prometheus" | "grafana";
  prometheus?: {
    url?: string;
    errorRateExpr?: string;
    latencyP95Expr?: string;
    requestsPerSecExpr?: string;
    baselineErrorRateExpr?: string;
    baselineLatencyP95Expr?: string;
    baselineRequestsPerSecExpr?: string;
    baselineLookbackHours?: number;
  };
  grafana?: {
    url?: string;
    token?: string;
    datasourceUid?: string;
    dashboardUid?: string;
    errorRateExpr?: string;
    latencyP95Expr?: string;
    requestsPerSecExpr?: string;
    baselineErrorRateExpr?: string;
    baselineLatencyP95Expr?: string;
    baselineRequestsPerSecExpr?: string;
    baselineLookbackHours?: number;
  };
  enabled: boolean;
  updatedAt: string;
  [key: string]: unknown;
}

export interface OperatorConfigResponse {
  config: OperatorConfigClient | null;
}

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

export interface GuardrailPolicyResponse {
  policy: GuardrailPolicyConfig;
}

export interface LiveOnboardingResponse {
  config: OperatorConfigClient;
  repo: string;
  slackChannel: string;
  dashboardPath: string;
  codexPrompt: string;
  pluginFlow: string[];
}

export type DashboardEventType =
  | "stream.connected"
  | "scenario.loaded"
  | "log.created"
  | "alert.created"
  | "deploy.created"
  | "incident.created"
  | "incident.updated"
  | "config.updated"
  | "operator.toggled"
  | "automation.updated"
  | "integration.updated"
  | "onboarding.updated";

export interface DashboardEvent {
  id: string;
  type: DashboardEventType;
  at: string;
  serviceId?: string;
  detail: string;
}

export const LinkedGithubReferencesSchema = z.object({
  issueUrl: z.string().nullable(),
  prUrl: z.string().nullable()
});

export const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  environment: z.string(),
  health: z.enum(["healthy", "degraded", "failing"]),
  linkedGithub: LinkedGithubReferencesSchema.nullable()
});

export const ServicesResponseSchema = z.object({
  services: z.array(ServiceSchema)
});

export const RuntimeLiveServiceSchema = z.object({
  serviceId: z.string(),
  revision: z.string().nullable(),
  revisionDetail: z.string(),
  deployState: z.string().nullable()
});

export const MetricsSnapshotSchema = z.object({
  timestamp: z.number(),
  errorRate: z.number(),
  latencyP95: z.number(),
  requestsPerSec: z.number()
});

export const ServiceMetricDeltaSchema = z.object({
  current: z.number(),
  baseline: z.number(),
  absolute: z.number(),
  percent: z.number().nullable(),
  direction: z.enum(["up", "down", "flat"])
});

export const ServiceMetricsResponseSchema = z.object({
  service: ServiceSchema,
  metricSourceId: z.string(),
  baselineLookbackHours: z.number(),
  runtime: RuntimeLiveServiceSchema,
  current: MetricsSnapshotSchema,
  baseline: MetricsSnapshotSchema,
  delta: z.object({
    errorRate: ServiceMetricDeltaSchema,
    latencyP95: ServiceMetricDeltaSchema,
    requestsPerSec: ServiceMetricDeltaSchema
  }),
  series: z.array(
    z.object({
      timestamp: z.number(),
      errorRate: z.number(),
      errorRateBaseline: z.number(),
      latencyP95: z.number(),
      latencyP95Baseline: z.number(),
      requestsPerSec: z.number(),
      requestsPerSecBaseline: z.number()
    })
  ),
  updatedAt: z.string()
});

export const IntegrationHealthSchema = z.object({
  id: z.string(),
  status: z.enum(["ready", "degraded", "unavailable"]),
  detail: z.string(),
  checkedAt: z.number()
});

export const RuntimeLiveResponseSchema = z.object({
  config: z.record(z.string(), z.unknown()).nullable(),
  health: z.array(IntegrationHealthSchema),
  services: z.array(RuntimeLiveServiceSchema),
  updatedAt: z.string()
});

export const IntegrationHealthResponseSchema = z.object({
  health: z.array(IntegrationHealthSchema)
});

export const IntegrationHealthItemResponseSchema = z.object({
  health: IntegrationHealthSchema
});

export const AuditEntrySchema = z.object({
  timestamp: z.number(),
  actor: z.string(),
  action: z.enum(["deploy", "rollback", "decision", "override", "config"]),
  detail: z.string()
});

export const AuditLogResponseSchema = z.object({
  entries: z.array(AuditEntrySchema)
});

export const AuditRunSummarySchema = z.object({
  id: z.string(),
  status: z.string(),
  updatedAt: z.string()
});

export const AuditRunsResponseSchema = z.object({
  runs: z.array(AuditRunSummarySchema)
});

export const DeployRecordSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  status: z.enum(["healthy", "degraded", "failed"]),
  version: z.string(),
  timestamp: z.string(),
  target: z.string().optional(),
  judgment: z
    .object({
      decision: z.object({
        action: z.enum(["rollback", "hold"]),
        confidence: z.number(),
        reasoning: z.string(),
        evidence: z.array(z.string()),
        similarIncidentId: z.string().nullable()
      }),
      metricSourceId: z.string(),
      metrics: MetricsSnapshotSchema,
      mode: z.enum(["autonomous", "needs_review"]),
      capturedAt: z.string()
    })
    .nullable()
    .optional()
});

export const DeploysResponseSchema = z.object({
  deploys: z.array(DeployRecordSchema)
});

export const AgentExecutionSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  exitCode: z.number().int(),
  transcriptPath: z.string(),
  summary: z.string(),
  startedAt: z.string(),
  finishedAt: z.string()
});

export const AutomationJobSchema = z.object({
  id: z.string(),
  runId: z.string(),
  source: z.enum(["github_issue"]),
  serviceId: z.string(),
  githubIssueUrl: z.string(),
  status: z.enum([
    "queued",
    "awaiting_approval",
    "approved",
    "rejected",
    "running_agent",
    "completed",
    "failed"
  ]),
  approvalMessageId: z.string().nullable(),
  execution: AgentExecutionSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const AutomationJobsResponseSchema = z.object({
  jobs: z.array(AutomationJobSchema)
});

export const PipelineStageSchema = z.object({
  id: z.enum(["intake", "approval", "execution", "guard"]),
  label: z.string(),
  status: z.enum(["pending", "active", "completed", "blocked", "failed"]),
  detail: z.string()
});

export const PipelineGuardResultSchema = z.object({
  status: z.enum(["passed", "blocked"]),
  summary: z.string(),
  violations: z.array(z.string())
});

export const AutomationPipelineItemSchema = z.object({
  job: AutomationJobSchema,
  summary: z.string(),
  githubTarget: z.string().nullable(),
  risk: z
    .object({
      level: z.enum(["low", "medium", "high", "critical"]),
      score: z.number(),
      reasons: z.array(z.string()).optional()
    })
    .nullable(),
  approvals: z.array(
    z.object({
      source: z.string(),
      status: z.enum(["approved", "rejected", "changes_requested"]),
      by: z.string(),
      at: z.string()
    })
  ),
  latestApproval: z
    .object({
      source: z.string(),
      status: z.enum(["approved", "rejected", "changes_requested"]),
      by: z.string(),
      at: z.string()
    })
    .nullable(),
  testSummary: z.object({
    passed: z.number(),
    failed: z.number(),
    notRun: z.number()
  }),
  guard: PipelineGuardResultSchema,
  stages: z.array(PipelineStageSchema),
  transcriptPreview: z.string().nullable(),
  events: z.array(
    z.object({
      id: z.string(),
      kind: z.enum([
        "github.issue.opened",
        "slack.approved",
        "slack.rejected",
        "agent.completed",
        "agent.failed"
      ]),
      at: z.string(),
      payload: z.record(z.string(), z.unknown())
    })
  )
});

export const AutomationPipelineResponseSchema = z.object({
  items: z.array(AutomationPipelineItemSchema)
});

export const IncidentRecordSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  status: z.enum(["open", "investigating", "resolved"]),
  summary: z.string(),
  linkedGithub: LinkedGithubReferencesSchema.nullable(),
  timestamp: z.string()
});

export const IncidentsResponseSchema = z.object({
  incidents: z.array(IncidentRecordSchema)
});

export const IncidentResponseSchema = z.object({
  incident: IncidentRecordSchema
});

export const RepoMemoryEntrySchema = z.object({
  runId: z.string(),
  summary: z.string(),
  serviceId: z.string().nullable(),
  githubTarget: z.string().nullable(),
  updatedAt: z.string(),
  tags: z.array(z.string())
});

export const RepoMemoryResponseSchema = z.object({
  entries: z.array(RepoMemoryEntrySchema)
});

export const MemoryIncidentSchema = z.object({
  id: z.string(),
  deployId: z.string(),
  summary: z.string(),
  errorRate: z.number(),
  latencyP95: z.number(),
  agentAction: z.enum(["rollback", "hold"]),
  agentConfidence: z.number(),
  humanOverride: z.enum(["rollback", "hold"]).nullable(),
  outcome: z.string()
});

export const MemoryIncidentsResponseSchema = z.object({
  incidents: z.array(MemoryIncidentSchema)
});

export const ApprovalRiskSchema = z.object({
  level: z.enum(["low", "medium", "high", "critical"]),
  score: z.number(),
  reasons: z.array(z.string()).optional()
});

export const PendingApprovalSchema = z.object({
  runId: z.string(),
  summary: z.string(),
  risk: ApprovalRiskSchema.nullable(),
  githubTarget: z.string().nullable()
});

export const ApprovalsResponseSchema = z.object({
  approvals: z.array(PendingApprovalSchema)
});

export const ApprovalDetailResponseSchema = z.object({
  runId: z.string(),
  summary: z.string(),
  risk: ApprovalRiskSchema.nullable(),
  githubTarget: z.string().nullable(),
  approvals: z.array(
    z.object({
      source: z.string(),
      status: z.enum(["approved", "rejected", "changes_requested"]),
      by: z.string(),
      at: z.string()
    })
  ),
  latestApproval: z
    .object({
      source: z.string(),
      status: z.enum(["approved", "rejected", "changes_requested"]),
      by: z.string(),
      at: z.string()
    })
    .nullable(),
  tests: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["passed", "failed", "not_run"]),
      detail: z.string()
    })
  ),
  policyViolations: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      message: z.string()
    })
  ),
  plan: z
    .object({
      summary: z.string(),
      steps: z.array(z.string()),
      criticalQuestions: z.array(z.string()),
      risk: ApprovalRiskSchema
    })
    .nullable(),
  diff: z.string(),
  slackPreview: z.string(),
  requiresApproval: z.boolean()
});

export const OperatorConfigClientSchema = z
  .object({
    trackedRepos: z.array(z.string()),
    slackChannel: z.string(),
    agentCommand: z.string(),
    agentArgs: z.array(z.string()),
    judgmentProvider: z.enum(["canned", "openai", "anthropic", "ai-cli"]),
    deployTarget: z.enum(["simulator", "kubernetes", "docker"]),
    metricSource: z.enum(["simulator", "prometheus", "grafana"]),
    enabled: z.boolean(),
    updatedAt: z.string()
  })
  .passthrough();

export const OperatorConfigResponseSchema = z.object({
  config: OperatorConfigClientSchema.nullable()
});

export const GuardrailPolicyConfigSchema = z.object({
  thresholds: z.object({
    medium: z.number(),
    high: z.number(),
    critical: z.number()
  }),
  rollback: z.object({
    minConfidence: z.number(),
    maxErrorRate: z.number(),
    maxLatencyP95: z.number(),
    requireHumanApproval: z.boolean()
  })
});

export const GuardrailPolicyResponseSchema = z.object({
  policy: GuardrailPolicyConfigSchema
});

export const LiveOnboardingResponseSchema = z.object({
  config: OperatorConfigClientSchema,
  repo: z.string(),
  slackChannel: z.string(),
  dashboardPath: z.string(),
  codexPrompt: z.string(),
  pluginFlow: z.array(z.string())
});

export const DashboardEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "stream.connected",
    "scenario.loaded",
    "log.created",
    "alert.created",
    "deploy.created",
    "incident.created",
    "incident.updated",
    "config.updated",
    "operator.toggled",
    "automation.updated",
    "integration.updated",
    "onboarding.updated"
  ]),
  at: z.string(),
  serviceId: z.string().optional(),
  detail: z.string()
});

function validatePayload<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(message);
  }
  return parsed.data;
}

export function parseServicesResponse(input: unknown): ServicesResponse {
  return validatePayload(ServicesResponseSchema, input, "Invalid services response.");
}

export function parseRuntimeLiveResponse(input: unknown): RuntimeLiveResponse {
  return validatePayload(RuntimeLiveResponseSchema, input, "Invalid runtime live response.");
}

export function parseServiceMetricsResponse(input: unknown): ServiceMetricsResponse {
  return validatePayload(
    ServiceMetricsResponseSchema,
    input,
    "Invalid service metrics response."
  );
}

export function parseIntegrationHealthResponse(input: unknown): IntegrationHealthResponse {
  return validatePayload(
    IntegrationHealthResponseSchema,
    input,
    "Invalid integration health response."
  );
}

export function parseIntegrationHealthItemResponse(input: unknown): IntegrationHealthItemResponse {
  return validatePayload(
    IntegrationHealthItemResponseSchema,
    input,
    "Invalid integration health item response."
  );
}

export function parseAuditLogResponse(input: unknown): AuditLogResponse {
  return validatePayload(AuditLogResponseSchema, input, "Invalid audit log response.");
}

export function parseAuditRunsResponse(input: unknown): AuditRunsResponse {
  return validatePayload(AuditRunsResponseSchema, input, "Invalid audit runs response.");
}

export function parseDeploysResponse(input: unknown): DeploysResponse {
  return validatePayload(DeploysResponseSchema, input, "Invalid deploys response.");
}

export function parseAutomationJobsResponse(input: unknown): AutomationJobsResponse {
  return validatePayload(AutomationJobsResponseSchema, input, "Invalid automation jobs response.");
}

export function parseAutomationPipelineResponse(input: unknown): AutomationPipelineResponse {
  return validatePayload(
    AutomationPipelineResponseSchema,
    input,
    "Invalid automation pipeline response."
  );
}

export function parseIncidentsResponse(input: unknown): IncidentsResponse {
  return validatePayload(IncidentsResponseSchema, input, "Invalid incidents response.");
}

export function parseIncidentResponse(input: unknown): IncidentResponse {
  return validatePayload(IncidentResponseSchema, input, "Invalid incident response.");
}

export function parseRepoMemoryResponse(input: unknown): RepoMemoryResponse {
  return validatePayload(RepoMemoryResponseSchema, input, "Invalid repo memory response.");
}

export function parseMemoryIncidentsResponse(input: unknown): MemoryIncidentsResponse {
  return validatePayload(
    MemoryIncidentsResponseSchema,
    input,
    "Invalid incident memory response."
  );
}

export function parseApprovalsResponse(input: unknown): ApprovalsResponse {
  return validatePayload(ApprovalsResponseSchema, input, "Invalid approvals response.");
}

export function parseApprovalDetailResponse(input: unknown): ApprovalDetailResponse {
  return validatePayload(
    ApprovalDetailResponseSchema,
    input,
    "Invalid approval detail response."
  );
}

export function parseOperatorConfigResponse(input: unknown): OperatorConfigResponse {
  return validatePayload(
    OperatorConfigResponseSchema,
    input,
    "Invalid operator config response."
  );
}

export function parseGuardrailPolicyResponse(input: unknown): GuardrailPolicyResponse {
  return validatePayload(
    GuardrailPolicyResponseSchema,
    input,
    "Invalid guardrail policy response."
  );
}

export function parseLiveOnboardingResponse(input: unknown): LiveOnboardingResponse {
  return validatePayload(
    LiveOnboardingResponseSchema,
    input,
    "Invalid live onboarding response."
  );
}

export function parseDashboardEvent(input: unknown): DashboardEvent {
  return validatePayload(DashboardEventSchema, input, "Dashboard event stream payload was invalid.");
}
