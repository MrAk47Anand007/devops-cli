import { useEffect, useState } from "react";
import { useDashboardEvents } from "./use-dashboard-events";
import type { DashboardEvent, DashboardEventType } from "../lib/types";

const DEFAULT_EVENT_TYPES: DashboardEventType[] = [
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
];

interface LiveDashboardRefreshState {
  connected: boolean;
  error: Error | null;
  lastEvent: DashboardEvent | null;
  refreshToken: number;
}

export function useLiveDashboardRefresh(
  eventTypes: DashboardEventType[] = DEFAULT_EVENT_TYPES
): LiveDashboardRefreshState {
  const enabled = typeof EventSource !== "undefined";
  const stream = useDashboardEvents(enabled);
  const [refreshToken, setRefreshToken] = useState(0);
  const eventTypeKey = eventTypes.join("|");
  const trackedEventTypes = eventTypeKey.split("|") as DashboardEventType[];

  useEffect(() => {
    const event = stream.lastEvent;
    if (!event || !trackedEventTypes.includes(event.type)) {
      return;
    }

    setRefreshToken((current) => current + 1);
  }, [eventTypeKey, stream.lastEvent]);

  return {
    connected: enabled ? stream.connected : false,
    error: enabled ? stream.error : null,
    lastEvent: stream.lastEvent,
    refreshToken
  };
}
