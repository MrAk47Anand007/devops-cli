import { parseDashboardEvent, type DashboardEvent } from "./types";

const baseUrl = import.meta.env.VITE_SENTINELOPS_API_BASE_URL ?? "";

export function connectDashboardEvents(
  onEvent: (event: DashboardEvent) => void,
  onError?: (error: Error) => void
): EventSource {
  const source = new EventSource(`${baseUrl}/api/events/stream`);

  source.addEventListener("dashboard", (message) => {
    try {
      const raw = JSON.parse((message as MessageEvent<string>).data) as unknown;
      onEvent(parseDashboardEvent(raw));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Dashboard event stream payload was invalid."
      ) {
        onError?.(error);
        return;
      }
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
