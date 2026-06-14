import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DashboardStore } from "./store.js";
import { renderDashboardHtml } from "./ui.js";
import {
  AlertRecordSchema,
  DashboardScenarioSchema,
  DeployRecordSchema,
  IncidentRecordSchema,
  LogRecordSchema
} from "../types.js";

export interface DashboardServerHandle {
  baseUrl: string;
  close: () => Promise<void>;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export async function startDashboardServer(options?: { port?: number }): Promise<DashboardServerHandle> {
  const store = new DashboardStore();
  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const path = url.pathname;

      if (method === "GET" && path === "/") {
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(renderDashboardHtml());
        return;
      }

      if (method === "GET" && path.startsWith("/incidents/")) {
        const incidentId = decodeURIComponent(path.replace("/incidents/", ""));
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(renderDashboardHtml({ incidentId }));
        return;
      }

      if (method === "GET" && path === "/api/services") {
        sendJson(response, 200, { services: store.getServices() });
        return;
      }

      if (method === "GET" && path.startsWith("/api/services/")) {
        const serviceId = decodeURIComponent(path.replace("/api/services/", ""));
        const service = store.getService(serviceId);
        sendJson(response, service ? 200 : 404, service ? { service } : { error: { code: "SERVICE_NOT_FOUND" } });
        return;
      }

      if (method === "GET" && path.startsWith("/api/context/")) {
        const serviceId = decodeURIComponent(path.replace("/api/context/", ""));
        const context = store.getContext(serviceId);
        sendJson(response, context ? 200 : 404, context ? { context } : { error: { code: "CONTEXT_NOT_FOUND" } });
        return;
      }

      if (method === "GET" && path === "/api/logs") {
        sendJson(response, 200, { logs: store.getLogs() });
        return;
      }

      if (method === "POST" && path === "/api/logs") {
        const body = LogRecordSchema.omit({ id: true }).parse(await readJsonBody(request));
        sendJson(response, 201, { log: store.addLog(body) });
        return;
      }

      if (method === "GET" && path === "/api/alerts") {
        sendJson(response, 200, { alerts: store.getAlerts() });
        return;
      }

      if (method === "POST" && path === "/api/alerts") {
        const body = AlertRecordSchema.omit({ id: true }).parse(await readJsonBody(request));
        sendJson(response, 201, { alert: store.addAlert(body) });
        return;
      }

      if (method === "GET" && path === "/api/deploys") {
        sendJson(response, 200, { deploys: store.getDeploys() });
        return;
      }

      if (method === "POST" && path === "/api/deploys") {
        const body = DeployRecordSchema.omit({ id: true }).parse(await readJsonBody(request));
        sendJson(response, 201, { deploy: store.addDeploy(body) });
        return;
      }

      if (method === "GET" && path === "/api/incidents") {
        sendJson(response, 200, { incidents: store.getIncidents() });
        return;
      }

      if (method === "GET" && path.startsWith("/api/incidents/")) {
        const incidentId = decodeURIComponent(path.replace("/api/incidents/", ""));
        const incident = store.getIncident(incidentId);
        sendJson(response, incident ? 200 : 404, incident ? { incident } : { error: { code: "INCIDENT_NOT_FOUND" } });
        return;
      }

      if (method === "POST" && path === "/api/incidents") {
        const body = IncidentRecordSchema.omit({ id: true }).parse(await readJsonBody(request));
        sendJson(response, 201, { incident: store.addIncident(body) });
        return;
      }

      if (method === "PATCH" && path.startsWith("/api/incidents/")) {
        const incidentId = decodeURIComponent(path.replace("/api/incidents/", ""));
        const patch = IncidentRecordSchema.pick({
          status: true,
          summary: true,
          linkedGithub: true
        }).partial().parse(await readJsonBody(request));
        const incident = store.updateIncident(incidentId, patch);
        sendJson(response, incident ? 200 : 404, incident ? { incident } : { error: { code: "INCIDENT_NOT_FOUND" } });
        return;
      }

      if (method === "POST" && path === "/api/scenarios/load") {
        const body = await readJsonBody(request);
        const scenario = DashboardScenarioSchema.parse(
          typeof body === "object" && body !== null && "scenario" in body
            ? (body as { scenario: unknown }).scenario
            : undefined
        );
        const state = store.loadScenario(scenario);
        sendJson(response, 200, {
          scenario: state.scenario,
          service: state.service,
          counts: {
            logs: state.logs.length,
            alerts: state.alerts.length,
            deploys: state.deploys.length,
            incidents: state.incidents.length
          }
        });
        return;
      }

      sendJson(response, 404, { error: { code: "NOT_FOUND" } });
    } catch (error) {
      sendJson(response, 400, {
        error: {
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options?.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Dashboard server failed to start.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}
