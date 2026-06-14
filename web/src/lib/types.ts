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

export function parseDashboardEvent(input: unknown): DashboardEvent {
  return validatePayload(DashboardEventSchema, input, "Dashboard event stream payload was invalid.");
}
