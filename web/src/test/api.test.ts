// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { startDashboardServer, type DashboardServerHandle } from "../../../src/dashboard/server";

async function loadApiModule(baseUrl?: string) {
  vi.resetModules();

  if (baseUrl) {
    vi.stubEnv("VITE_SENTINELOPS_API_BASE_URL", baseUrl);
  } else {
    vi.unstubAllEnvs();
  }

  return import("../lib/api");
}

describe("dashboard API client", () => {
  let server: DashboardServerHandle | null = null;

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();

    if (server) {
      await server.close();
      server = null;
    }
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

    const { fetchRuntimeLive } = await loadApiModule();

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

  it("normalizes malformed services JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        }
      }))
    );

    const { fetchServices } = await loadApiModule();

    await expect(fetchServices()).rejects.toThrow("Malformed response for /api/services.");
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

    const { fetchRuntimeLive } = await loadApiModule();

    await expect(fetchRuntimeLive()).rejects.toThrow("Invalid runtime live response.");
  });

  it("normalizes malformed runtime live JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        }
      }))
    );

    const { fetchRuntimeLive } = await loadApiModule();

    await expect(fetchRuntimeLive()).rejects.toThrow(
      "Malformed response for /api/runtime/live."
    );
  });

  it("matches the live dashboard server contract for services and runtime", async () => {
    server = await startDashboardServer();

    const { fetchServices, fetchRuntimeLive } = await loadApiModule(server.baseUrl);
    const services = await fetchServices();
    const runtime = await fetchRuntimeLive();

    expect(services.services.length).toBeGreaterThan(0);
    expect(services.services[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        environment: expect.any(String),
        health: expect.stringMatching(/^(healthy|degraded|failing)$/)
      })
    );

    expect(runtime).toEqual(
      expect.objectContaining({
        config: null,
        health: expect.any(Array),
        services: expect.any(Array),
        updatedAt: expect.any(String)
      })
    );
    expect(runtime.services.length).toBeGreaterThan(0);
    expect(runtime.services[0]).toEqual(
      expect.objectContaining({
        serviceId: services.services[0]?.id,
        revision: null,
        revisionDetail: expect.any(String),
        deployState: null
      })
    );
  });
});
