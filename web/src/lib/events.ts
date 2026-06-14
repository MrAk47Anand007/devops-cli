import type { DashboardEvent } from "./types";

const baseUrl = import.meta.env.VITE_SENTINELOPS_API_BASE_URL ?? "";

export function connectDashboardEvents(
  onEvent: (event: DashboardEvent) => void,
  onError?: (event: Event) => void
): EventSource {
  const source = new EventSource(`${baseUrl}/api/events/stream`);

  source.addEventListener("dashboard", (message) => {
    const payload = JSON.parse((message as MessageEvent<string>).data) as DashboardEvent;
    onEvent(payload);
  });

  if (onError) {
    source.addEventListener("error", onError);
  }

  return source;
}
