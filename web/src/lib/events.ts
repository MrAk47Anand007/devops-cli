import { parseDashboardEvent, type DashboardEvent } from "./types";

const baseUrl = import.meta.env.VITE_SENTINELOPS_API_BASE_URL ?? "";

export function connectDashboardEvents(
  onEvent: (event: DashboardEvent) => void,
  onError?: (error: Error) => void
): EventSource {
  const source = new EventSource(`${baseUrl}/api/events/stream`);

  source.addEventListener("dashboard", (message) => {
    let raw: unknown;

    try {
      raw = JSON.parse((message as MessageEvent<string>).data) as unknown;
    } catch (error) {
      onError?.(new Error("Dashboard event stream payload was malformed."));
      return;
    }

    let event: DashboardEvent;

    try {
      event = parseDashboardEvent(raw);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error
          : new Error("Dashboard event stream payload was invalid.")
      );
      return;
    }

    onEvent(event);
  });

  if (onError) {
    source.addEventListener("error", () => {
      onError(new Error("Dashboard event stream disconnected."));
    });
  }

  return source;
}
