import {
  parseAutomationJobsResponse,
  parseDeploysResponse,
  parseIncidentResponse,
  parseIncidentsResponse,
  parseRuntimeLiveResponse,
  parseServicesResponse,
  type AutomationJobsResponse,
  type DeploysResponse,
  type IncidentResponse,
  type IncidentsResponse,
  type RuntimeLiveResponse,
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

export function fetchDeploys(): Promise<DeploysResponse> {
  return fetchJson<DeploysResponse>("/api/deploys", parseDeploysResponse);
}

export function fetchAutomationJobs(): Promise<AutomationJobsResponse> {
  return fetchJson<AutomationJobsResponse>("/api/automation/jobs", parseAutomationJobsResponse);
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
