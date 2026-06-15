import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLiveDashboardRefresh } from "../hooks/use-live-dashboard-refresh";
import type { DashboardEvent } from "../lib/types";

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const current = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    current.add(listener);
    this.listeners.set(type, current);
  }

  close(): void {}

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("useLiveDashboardRefresh", () => {
  afterEach(() => {
    MockEventSource.instances = [];
    vi.unstubAllGlobals();
  });

  it("increments the refresh token only for subscribed dashboard events", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    const { result } = renderHook(() => {
      return useLiveDashboardRefresh(["automation.updated", "deploy.created"]);
    });

    expect(result.current.refreshToken).toBe(0);
    expect(MockEventSource.instances).toHaveLength(1);

    const payload: DashboardEvent = {
      id: "evt-1",
      type: "automation.updated",
      at: "2026-06-14T00:00:00.000Z",
      detail: "Automation run updated."
    };

    MockEventSource.instances[0].emit(
      "dashboard",
      new MessageEvent("dashboard", { data: JSON.stringify(payload) })
    );

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
      expect(result.current.refreshToken).toBe(1);
    });

    MockEventSource.instances[0].emit(
      "dashboard",
      new MessageEvent("dashboard", {
        data: JSON.stringify({
          ...payload,
          id: "evt-2",
          type: "config.updated"
        })
      })
    );

    await waitFor(() => {
      expect(result.current.lastEvent?.type).toBe("config.updated");
    });

    expect(result.current.refreshToken).toBe(1);
  });
});
