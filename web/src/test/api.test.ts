import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRuntimeLive } from "../lib/api";

describe("dashboard API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads runtime live data from the dashboard API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          config: null,
          health: [
            {
              id: "slack",
              status: "ready",
              detail: "Healthy",
              checkedAt: 1718323200000
            }
          ],
          services: [
            {
              serviceId: "svc-api",
              revision: "abc123",
              revisionDetail: "main@abc123",
              deployState: "running"
            }
          ],
          updatedAt: "2026-06-14T00:00:00.000Z"
        })
      }))
    );

    await expect(fetchRuntimeLive()).resolves.toEqual({
      config: null,
      health: [
        {
          id: "slack",
          status: "ready",
          detail: "Healthy",
          checkedAt: 1718323200000
        }
      ],
      services: [
        {
          serviceId: "svc-api",
          revision: "abc123",
          revisionDetail: "main@abc123",
          deployState: "running"
        }
      ],
      updatedAt: "2026-06-14T00:00:00.000Z"
    });
  });

  it("rejects schema-invalid runtime live data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          config: null,
          health: {},
          services: [],
          updatedAt: "2026-06-14T00:00:00.000Z"
        })
      }))
    );

    await expect(fetchRuntimeLive()).rejects.toThrow("Invalid runtime live response.");
  });
});
