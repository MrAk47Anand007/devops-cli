import {
  parseRuntimeLiveResponse,
  parseServicesResponse,
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
