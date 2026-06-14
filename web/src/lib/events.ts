import type { DashboardEvent } from "./types";

const baseUrl = import.meta.env.VITE_SENTINELOPS_API_BASE_URL ?? "";

export function connectDashboardEvents(
  onEvent: (event: DashboardEvent) => void,
  onError?: (error: Error) => void
): EventSource {
  const source = new EventSource(`${baseUrl}/api/events/stream`);

  source.addEventListener("dashboard", (message) => {
    try {
      const payload = JSON.parse((message as MessageEvent<string>).data) as DashboardEvent;
      onEvent(payload);
    } catch {
      onError?.(new Error("Dashboard event stream payload was malformed."));
    }
  });

  if (onError) {
    source.addEventListener("error", () => {
      onError(new Error("Dashboard event stream disconnected."));
    });
  }

  return source;
}
