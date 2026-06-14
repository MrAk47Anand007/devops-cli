import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDashboardEvents } from "../hooks/use-dashboard-events";
import type { DashboardEvent } from "../lib/types";

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<string, Set<(event: Event) => void>>();
  closed = false;

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const current = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    current.add(listener);
    this.listeners.set(type, current);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("useDashboardEvents", () => {
  afterEach(() => {
    MockEventSource.instances = [];
    vi.unstubAllGlobals();
  });

  it("registers listeners, handles lifecycle events, and closes on unmount", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    const { result, unmount } = renderHook(() => useDashboardEvents());

    expect(MockEventSource.instances).toHaveLength(1);

    const [source] = MockEventSource.instances;
    expect(source.url).toBe("/api/events/stream");
    expect(source.listeners.get("dashboard")?.size).toBe(1);
    expect(source.listeners.get("error")?.size).toBe(1);
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastEvent).toBeNull();

    const payload: DashboardEvent = {
      id: "evt-1",
      type: "stream.connected",
      at: "2026-06-14T00:00:00.000Z",
      detail: "Connected to dashboard stream."
    };

    source.emit("dashboard", new MessageEvent("dashboard", { data: JSON.stringify(payload) }));

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.lastEvent).toEqual(payload);
    });

    source.emit("error", new Event("error"));

    await waitFor(() => {
      expect(result.current.connected).toBe(false);
      expect(result.current.error).toEqual(new Error("Dashboard event stream disconnected."));
      expect(result.current.lastEvent).toEqual(payload);
    });

    unmount();

    expect(source.closed).toBe(true);
  });
});
