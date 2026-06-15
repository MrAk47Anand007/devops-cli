import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getScenarioFixture } from "../core/scenarios.js";
import { ensureSentinelOpsState, readCurrentScenario, writeCurrentScenario } from "../core/store.js";
import { ContextSchema, DashboardScenarioSchema, type AlertRecord, type Context, type DashboardScenario, type DeployRecord, type IncidentRecord, type LogRecord, type Service } from "../types.js";

interface DashboardState {
  scenario: DashboardScenario;
  service: Service;
  logs: LogRecord[];
  alerts: AlertRecord[];
  deploys: DeployRecord[];
  incidents: IncidentRecord[];
}

function cloneState(scenario: DashboardScenario): DashboardState {
  const fixture = getScenarioFixture(scenario);
  return {
    scenario,
    service: structuredClone(fixture.service),
    logs: structuredClone(fixture.logs),
    alerts: structuredClone(fixture.alerts),
    deploys: structuredClone(fixture.deploys),
    incidents: structuredClone(fixture.incidents)
  };
}

function createId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export class DashboardStore {
  private state: DashboardState;

  constructor(initialScenario?: DashboardScenario) {
    const persisted = this.readPersistedState();
    if (persisted) {
      this.state = persisted;
      writeCurrentScenario(persisted.scenario);
      return;
    }
    const scenario = initialScenario ?? readCurrentScenario() ?? "healthy";
    this.state = cloneState(scenario);
    this.persistState();
    writeCurrentScenario(scenario);
  }

  private readPersistedState(): DashboardState | null {
    const { dashboardState } = ensureSentinelOpsState();
    if (!existsSync(dashboardState)) {
      return null;
    }
    return JSON.parse(readFileSync(dashboardState, "utf8")) as DashboardState;
  }

  private persistState(): void {
    const { dashboardState } = ensureSentinelOpsState();
    writeFileSync(dashboardState, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  loadScenario(scenario: DashboardScenario): DashboardState {
    const parsed = DashboardScenarioSchema.parse(scenario);
    this.state = cloneState(parsed);
    this.persistState();
    writeCurrentScenario(parsed);
    return this.snapshot();
  }

  snapshot(): DashboardState {
    return structuredClone(this.state);
  }

  getServices(): Service[] {
    return [structuredClone(this.state.service)];
  }

  getService(serviceId: string): Service | null {
    if (this.state.service.id !== serviceId) {
      return null;
    }
    return structuredClone(this.state.service);
  }

  getContext(serviceId: string): Context | null {
    if (this.state.service.id !== serviceId) {
      return null;
    }
    return ContextSchema.parse({
      service: this.state.service,
      scenario: this.state.scenario,
      logs: this.state.logs.filter((log) => log.serviceId === serviceId),
      alerts: this.state.alerts.filter((alert) => alert.serviceId === serviceId),
      deploys: this.state.deploys.filter((deploy) => deploy.serviceId === serviceId),
      incidents: this.state.incidents.filter((incident) => incident.serviceId === serviceId),
      summary: `Dashboard context for ${this.state.service.name} in ${this.state.service.environment}.`
    });
  }

  getLogs(): LogRecord[] {
    return structuredClone(this.state.logs);
  }

  addLog(input: Omit<LogRecord, "id">): LogRecord {
    const record: LogRecord = { id: createId("log"), ...input };
    this.state.logs.push(record);
    this.persistState();
    return structuredClone(record);
  }

  getAlerts(): AlertRecord[] {
    return structuredClone(this.state.alerts);
  }

  addAlert(input: Omit<AlertRecord, "id">): AlertRecord {
    const record: AlertRecord = { id: createId("alert"), ...input };
    this.state.alerts.push(record);
    this.persistState();
    return structuredClone(record);
  }

  getDeploys(): DeployRecord[] {
    return structuredClone(this.state.deploys);
  }

  addDeploy(input: Omit<DeployRecord, "id">): DeployRecord {
    const record: DeployRecord = { id: createId("dep"), ...input };
    this.state.deploys.push(record);
    this.persistState();
    return structuredClone(record);
  }

  recordDeployEvent(input: {
    serviceId: string;
    version: string;
    target: string;
    timestamp: string;
    judgment?: DeployRecord["judgment"];
  }): DeployRecord {
    const normalizedStatus =
      input.target.includes("prod") || input.target.includes("deploy") || input.target.includes("workflow")
        ? "healthy"
        : "degraded";
    return this.addDeploy({
      serviceId: input.serviceId,
      status: normalizedStatus,
      version: input.version,
      timestamp: input.timestamp,
      target: input.target,
      judgment: input.judgment ?? null
    });
  }

  getIncidents(): IncidentRecord[] {
    return structuredClone(this.state.incidents);
  }

  getIncident(incidentId: string): IncidentRecord | null {
    const incident = this.state.incidents.find((entry) => entry.id === incidentId);
    return incident ? structuredClone(incident) : null;
  }

  addIncident(input: Omit<IncidentRecord, "id">): IncidentRecord {
    const record: IncidentRecord = { id: createId("inc"), ...input };
    this.state.incidents.push(record);
    this.persistState();
    return structuredClone(record);
  }

  updateIncident(incidentId: string, patch: Partial<Pick<IncidentRecord, "status" | "summary" | "linkedGithub">>): IncidentRecord | null {
    const incident = this.state.incidents.find((entry) => entry.id === incidentId);
    if (!incident) {
      return null;
    }
    const nextIncident: IncidentRecord = {
      ...incident,
      ...patch
    };
    const index = this.state.incidents.findIndex((entry) => entry.id === incidentId);
    this.state.incidents[index] = nextIncident;
    this.persistState();
    return structuredClone(nextIncident);
  }
}
