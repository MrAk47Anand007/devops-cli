import { useEffect, useState } from "react";
import { connectDashboardEvents } from "../lib/events";
import type { DashboardEvent } from "../lib/types";

interface DashboardEventsState {
  connected: boolean;
  error: Error | null;
  lastEvent: DashboardEvent | null;
}

export function useDashboardEvents(enabled = true): DashboardEventsState {
  const [state, setState] = useState<DashboardEventsState>({
    connected: false,
    error: null,
    lastEvent: null
  });

  useEffect(() => {
    if (!enabled) {
      setState({
        connected: false,
        error: null,
        lastEvent: null
      });
      return;
    }

    const source = connectDashboardEvents(
      (event) => {
        setState({
          connected: true,
          error: null,
          lastEvent: event
        });
      },
      (error) => {
        setState((current) => ({
          ...current,
          connected: false,
          error
        }));
      }
    );

    return () => {
      source.close();
    };
  }, [enabled]);

  return state;
}
