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
