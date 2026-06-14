import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

async function loadDashboardModule(): Promise<null | {
  startDashboardServer: (options?: { port?: number }) => Promise<{
    baseUrl: string;
    close: () => Promise<void>;
  }>;
}> {
  try {
    return await import("../src/dashboard/server.js");
  } catch {
    return null;
  }
}

describe("dashboard api", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-dashboard-api-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("serves services and scenario-backed context", async () => {
    const dashboardModule = await loadDashboardModule();
    expect(dashboardModule?.startDashboardServer).toBeTypeOf("function");
    if (!dashboardModule) {
      return;
    }

    const server = await dashboardModule.startDashboardServer();
    try {
      const loadResponse = await fetch(`${server.baseUrl}/api/scenarios/load`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "post-deploy-errors" })
      });
      expect(loadResponse.status).toBe(200);

      const servicesResponse = await fetch(`${server.baseUrl}/api/services`);
      expect(servicesResponse.status).toBe(200);
      const servicesPayload = await servicesResponse.json();
      expect(servicesPayload.services).toHaveLength(1);
      expect(servicesPayload.services[0].id).toBe("svc-api");

      const contextResponse = await fetch(`${server.baseUrl}/api/context/svc-api`);
      expect(contextResponse.status).toBe(200);
      const contextPayload = await contextResponse.json();
      expect(contextPayload.context.service.environment).toBe("production");
      expect(contextPayload.context.alerts[0].severity).toBe("high");
    } finally {
      await server.close();
    }
  });

  it("allows creating mutable records on top of the active scenario", async () => {
    const dashboardModule = await loadDashboardModule();
    expect(dashboardModule?.startDashboardServer).toBeTypeOf("function");
    if (!dashboardModule) {
      return;
    }

    const server = await dashboardModule.startDashboardServer();
    try {
      await fetch(`${server.baseUrl}/api/scenarios/load`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "degraded-api" })
      });

      const logResponse = await fetch(`${server.baseUrl}/api/logs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          level: "error",
          message: "new error burst",
          serviceId: "svc-api",
          timestamp: "2026-06-14T10:00:00.000Z"
        })
      });
      expect(logResponse.status).toBe(201);

      const incidentResponse = await fetch(`${server.baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId: "svc-api",
          status: "open",
          summary: "Fresh issue from dashboard",
          linkedGithub: {
            issueUrl: "https://github.com/example/repo/issues/99",
            prUrl: null
          },
          timestamp: "2026-06-14T10:01:00.000Z"
        })
      });
      expect(incidentResponse.status).toBe(201);

      const logsPayload = await (await fetch(`${server.baseUrl}/api/logs`)).json();
      expect(logsPayload.logs.some((log: { message: string }) => log.message === "new error burst")).toBe(true);

      const incidentsPayload = await (await fetch(`${server.baseUrl}/api/incidents`)).json();
      const createdIncident = incidentsPayload.incidents.find(
        (incident: { summary: string }) => incident.summary === "Fresh issue from dashboard"
      );
      expect(createdIncident).toBeTruthy();

      const patchResponse = await fetch(`${server.baseUrl}/api/incidents/${createdIncident.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "resolved" })
      });
      expect(patchResponse.status).toBe(200);

      const detailPayload = await (await fetch(`${server.baseUrl}/api/incidents/${createdIncident.id}`)).json();
      expect(detailPayload.incident.id).toBe(createdIncident.id);
      expect(detailPayload.incident.status).toBe("resolved");
      expect(detailPayload.incident.linkedGithub.issueUrl).toContain("/issues/99");

      const contextPayload = await (await fetch(`${server.baseUrl}/api/context/svc-api`)).json();
      expect(contextPayload.context.logs).toHaveLength(2);
      expect(
        contextPayload.context.incidents.some(
          (incident: { id: string; status: string }) =>
            incident.id === createdIncident.id && incident.status === "resolved"
        )
      ).toBe(true);
    } finally {
      await server.close();
    }
  });
});
