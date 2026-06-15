import {
  parseApprovalDetailResponse,
  parseAuditLogResponse,
  parseAuditRunsResponse,
  parseIntegrationHealthResponse,
  parseIntegrationHealthItemResponse,
  parseLiveOnboardingResponse,
  parseMemoryIncidentsResponse,
  parseOperatorConfigResponse,
  parseApprovalsResponse,
  parseAutomationJobsResponse,
  parseAutomationPipelineResponse,
  parseDeploysResponse,
  parseGuardrailPolicyResponse,
  parseIncidentResponse,
  parseIncidentsResponse,
  parseRepoMemoryResponse,
  parseRuntimeLiveResponse,
  parseServiceMetricsResponse,
  parseServicesResponse,
  type AuditLogResponse,
  type AuditRunsResponse,
  type ApprovalDetailResponse,
  type IntegrationHealthResponse,
  type IntegrationHealthItemResponse,
  type LiveOnboardingResponse,
  type MemoryIncidentsResponse,
  type OperatorConfigResponse,
  type ApprovalsResponse,
  type AutomationJobsResponse,
  type AutomationPipelineResponse,
  type DeploysResponse,
  type GuardrailPolicyResponse,
  type IncidentResponse,
  type IncidentsResponse,
  type RepoMemoryResponse,
  type RuntimeLiveResponse,
  type ServiceMetricsResponse,
  type ServicesResponse
} from "./types";

const baseUrl = import.meta.env.VITE_SENTINELOPS_API_BASE_URL ?? "";

async function fetchJson<T>(
  path: string,
  parser: (input: unknown) => T,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed for ${path}.`);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error(`Malformed response for ${path}.`);
  }

  return parser(payload);
}

export function fetchServices(): Promise<ServicesResponse> {
  return fetchJson<ServicesResponse>("/api/services", parseServicesResponse);
}

export function fetchRuntimeLive(): Promise<RuntimeLiveResponse> {
  return fetchJson<RuntimeLiveResponse>("/api/runtime/live", parseRuntimeLiveResponse);
}

export function fetchServiceMetrics(serviceId: string): Promise<ServiceMetricsResponse> {
  return fetchJson<ServiceMetricsResponse>(
    `/api/services/${encodeURIComponent(serviceId)}/metrics`,
    parseServiceMetricsResponse
  );
}

export function fetchIntegrationHealth(): Promise<IntegrationHealthResponse> {
  return fetchJson<IntegrationHealthResponse>(
    "/api/integrations/health",
    parseIntegrationHealthResponse
  );
}

export function fetchIntegrationHealthItem(
  integrationId: string
): Promise<IntegrationHealthItemResponse> {
  return fetchJson<IntegrationHealthItemResponse>(
    `/api/integrations/health/${encodeURIComponent(integrationId)}`,
    parseIntegrationHealthItemResponse
  );
}

export function fetchAuditLog(): Promise<AuditLogResponse> {
  return fetchJson<AuditLogResponse>("/api/audit/log", parseAuditLogResponse);
}

export function fetchAuditRuns(): Promise<AuditRunsResponse> {
  return fetchJson<AuditRunsResponse>("/api/audit/runs", parseAuditRunsResponse);
}

export function fetchDeploys(): Promise<DeploysResponse> {
  return fetchJson<DeploysResponse>("/api/deploys", parseDeploysResponse);
}

export function fetchAutomationJobs(): Promise<AutomationJobsResponse> {
  return fetchJson<AutomationJobsResponse>("/api/automation/jobs", parseAutomationJobsResponse);
}

export function fetchAutomationPipeline(): Promise<AutomationPipelineResponse> {
  return fetchJson<AutomationPipelineResponse>(
    "/api/automation/pipeline",
    parseAutomationPipelineResponse
  );
}

export function fetchApprovals(): Promise<ApprovalsResponse> {
  return fetchJson<ApprovalsResponse>("/api/approvals", parseApprovalsResponse);
}

export function fetchApprovalDetail(runId: string): Promise<ApprovalDetailResponse> {
  return fetchJson<ApprovalDetailResponse>(
    `/api/approvals/${encodeURIComponent(runId)}`,
    parseApprovalDetailResponse
  );
}

export function fetchOperatorConfig(): Promise<OperatorConfigResponse> {
  return fetchJson<OperatorConfigResponse>(
    "/api/operator-config",
    parseOperatorConfigResponse
  );
}

export function fetchGuardrailPolicyConfig(): Promise<GuardrailPolicyResponse> {
  return fetchJson<GuardrailPolicyResponse>(
    "/api/policy-config",
    parseGuardrailPolicyResponse
  );
}

export function saveOperatorConfig(input: Record<string, unknown>): Promise<OperatorConfigResponse> {
  return fetchJson<OperatorConfigResponse>(
    "/api/operator-config",
    parseOperatorConfigResponse,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}

export function saveGuardrailPolicyConfig(
  input: Record<string, unknown>
): Promise<GuardrailPolicyResponse> {
  return fetchJson<GuardrailPolicyResponse>(
    "/api/policy-config",
    parseGuardrailPolicyResponse,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}

export function fetchIncidents(): Promise<IncidentsResponse> {
  return fetchJson<IncidentsResponse>("/api/incidents", parseIncidentsResponse);
}

export function fetchIncident(incidentId: string): Promise<IncidentResponse> {
  return fetchJson<IncidentResponse>(
    `/api/incidents/${encodeURIComponent(incidentId)}`,
    parseIncidentResponse
  );
}

export function fetchRepoMemory(): Promise<RepoMemoryResponse> {
  return fetchJson<RepoMemoryResponse>("/api/memory/repo", parseRepoMemoryResponse);
}

export function fetchMemoryIncidents(): Promise<MemoryIncidentsResponse> {
  return fetchJson<MemoryIncidentsResponse>(
    "/api/memory/incidents",
    parseMemoryIncidentsResponse
  );
}

export async function submitApprovalAction(
  runId: string,
  action: "approve" | "hold" | "reject"
): Promise<void> {
  await fetchJson(
    `/api/approvals/${encodeURIComponent(runId)}`,
    () => undefined,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action })
    }
  );
}

export function createLiveOnboarding(input: {
  repo: string;
  slackChannel: string;
  agentCommand?: string;
  agentArgs?: string[];
  enabled?: boolean;
}): Promise<LiveOnboardingResponse> {
  return fetchJson<LiveOnboardingResponse>(
    "/api/onboard/live",
    parseLiveOnboardingResponse,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}
