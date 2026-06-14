import type {
  AlertRecord,
  DashboardScenario,
  DeployRecord,
  IncidentRecord,
  LogRecord,
  Service
} from "../types.js";

export interface ScenarioFixture {
  name: DashboardScenario;
  service: Service;
  logs: LogRecord[];
  alerts: AlertRecord[];
  deploys: DeployRecord[];
  incidents: IncidentRecord[];
}

function now(seed: string): string {
  return `2026-06-14T${seed}:00.000Z`;
}

export const SCENARIO_FIXTURES: Record<DashboardScenario, ScenarioFixture> = {
  healthy: {
    name: "healthy",
    service: {
      id: "svc-web",
      name: "web-frontend",
      environment: "staging",
      health: "healthy",
      linkedGithub: { issueUrl: null, prUrl: null }
    },
    logs: [{ id: "log-healthy-1", level: "info", message: "steady traffic", serviceId: "svc-web", timestamp: now("09:00") }],
    alerts: [],
    deploys: [{ id: "dep-healthy-1", serviceId: "svc-web", status: "healthy", version: "1.4.2", timestamp: now("08:55") }],
    incidents: []
  },
  "degraded-api": {
    name: "degraded-api",
    service: {
      id: "svc-api",
      name: "public-api",
      environment: "staging",
      health: "degraded",
      linkedGithub: { issueUrl: "https://github.com/example/repo/issues/42", prUrl: null }
    },
    logs: [{ id: "log-api-1", level: "warn", message: "latency spike for /search", serviceId: "svc-api", timestamp: now("09:05") }],
    alerts: [{ id: "alert-api-1", severity: "medium", summary: "p95 latency elevated", serviceId: "svc-api", timestamp: now("09:06") }],
    deploys: [{ id: "dep-api-1", serviceId: "svc-api", status: "degraded", version: "2.1.0", timestamp: now("09:00") }],
    incidents: [{ id: "inc-api-1", serviceId: "svc-api", status: "investigating", summary: "API degraded after latest deploy", linkedGithub: { issueUrl: "https://github.com/example/repo/issues/42", prUrl: null }, timestamp: now("09:07") }]
  },
  "failing-test": {
    name: "failing-test",
    service: {
      id: "svc-worker",
      name: "job-worker",
      environment: "staging",
      health: "degraded",
      linkedGithub: { issueUrl: "https://github.com/example/repo/issues/55", prUrl: "https://github.com/example/repo/pull/56" }
    },
    logs: [{ id: "log-worker-1", level: "error", message: "regression after test refactor", serviceId: "svc-worker", timestamp: now("09:10") }],
    alerts: [{ id: "alert-worker-1", severity: "medium", summary: "worker failures increasing", serviceId: "svc-worker", timestamp: now("09:11") }],
    deploys: [{ id: "dep-worker-1", serviceId: "svc-worker", status: "degraded", version: "3.0.1", timestamp: now("09:08") }],
    incidents: [{ id: "inc-worker-1", serviceId: "svc-worker", status: "open", summary: "Worker test failure blocks rollout", linkedGithub: { issueUrl: "https://github.com/example/repo/issues/55", prUrl: "https://github.com/example/repo/pull/56" }, timestamp: now("09:12") }]
  },
  "post-deploy-errors": {
    name: "post-deploy-errors",
    service: {
      id: "svc-api",
      name: "public-api",
      environment: "production",
      health: "failing",
      linkedGithub: { issueUrl: "https://github.com/example/repo/issues/77", prUrl: "https://github.com/example/repo/pull/79" }
    },
    logs: [{ id: "log-post-1", level: "error", message: "null pointer in payment route", serviceId: "svc-api", timestamp: now("09:15") }],
    alerts: [{ id: "alert-post-1", severity: "high", summary: "5xx error rate above threshold", serviceId: "svc-api", timestamp: now("09:16") }],
    deploys: [{ id: "dep-post-1", serviceId: "svc-api", status: "failed", version: "2.2.0", timestamp: now("09:14") }],
    incidents: [{ id: "inc-post-1", serviceId: "svc-api", status: "open", summary: "Errors after deploy with linked GitHub issue", linkedGithub: { issueUrl: "https://github.com/example/repo/issues/77", prUrl: "https://github.com/example/repo/pull/79" }, timestamp: now("09:17") }]
  },
  "config-risk": {
    name: "config-risk",
    service: {
      id: "svc-config",
      name: "config-service",
      environment: "production",
      health: "degraded",
      linkedGithub: { issueUrl: "https://github.com/example/repo/issues/88", prUrl: null }
    },
    logs: [{ id: "log-config-1", level: "warn", message: "prod config drift detected", serviceId: "svc-config", timestamp: now("09:20") }],
    alerts: [{ id: "alert-config-1", severity: "critical", summary: "configuration change touches production secrets", serviceId: "svc-config", timestamp: now("09:21") }],
    deploys: [{ id: "dep-config-1", serviceId: "svc-config", status: "degraded", version: "5.0.0", timestamp: now("09:19") }],
    incidents: [{ id: "inc-config-1", serviceId: "svc-config", status: "investigating", summary: "Risky production config issue", linkedGithub: { issueUrl: "https://github.com/example/repo/issues/88", prUrl: null }, timestamp: now("09:22") }]
  }
};

export function getScenarioFixture(name: DashboardScenario): ScenarioFixture {
  return SCENARIO_FIXTURES[name];
}
