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

export interface DeployRecord {
  id: string;
  serviceId: string;
  status: "healthy" | "degraded" | "failed";
  version: string;
  timestamp: string;
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

export const DeployRecordSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  status: z.enum(["healthy", "degraded", "failed"]),
  version: z.string(),
  timestamp: z.string()
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

export function parseDeploysResponse(input: unknown): DeploysResponse {
  return validatePayload(DeploysResponseSchema, input, "Invalid deploys response.");
}

export function parseAutomationJobsResponse(input: unknown): AutomationJobsResponse {
  return validatePayload(AutomationJobsResponseSchema, input, "Invalid automation jobs response.");
}

export function parseIncidentsResponse(input: unknown): IncidentsResponse {
  return validatePayload(IncidentsResponseSchema, input, "Invalid incidents response.");
}

export function parseIncidentResponse(input: unknown): IncidentResponse {
  return validatePayload(IncidentResponseSchema, input, "Invalid incident response.");
}

export function parseDashboardEvent(input: unknown): DashboardEvent {
  return validatePayload(DashboardEventSchema, input, "Dashboard event stream payload was invalid.");
}
