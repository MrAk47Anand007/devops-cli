import { randomUUID } from "node:crypto";

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

type DashboardEventListener = (event: DashboardEvent) => void;

export class DashboardEventBus {
  private readonly listeners = new Set<DashboardEventListener>();

  publish(input: Omit<DashboardEvent, "id" | "at">): DashboardEvent {
    const event: DashboardEvent = {
      id: `evt-${randomUUID().slice(0, 8)}`,
      at: new Date().toISOString(),
      ...input
    };
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  subscribe(listener: DashboardEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
