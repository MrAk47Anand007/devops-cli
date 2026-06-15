import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder
): Promise<string> {
  const chunk = await reader.read();
  return decoder.decode(chunk.value ?? new Uint8Array(), { stream: true });
}

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

  it("serves per-service metrics against a rolling baseline", async () => {
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

      const metricsResponse = await fetch(`${server.baseUrl}/api/services/svc-api/metrics`);
      expect(metricsResponse.status).toBe(200);
      const metricsPayload = await metricsResponse.json();
      expect(metricsPayload.service.id).toBe("svc-api");
      expect(metricsPayload.metricSourceId).toBe("simulator-metrics");
      expect(metricsPayload.baselineLookbackHours).toBe(168);
      expect(metricsPayload.runtime.serviceId).toBe("svc-api");
      expect(metricsPayload.current.errorRate).toBeTypeOf("number");
      expect(metricsPayload.baseline.requestsPerSec).toBeTypeOf("number");
      expect(metricsPayload.delta.errorRate.direction).toMatch(/up|down|flat/);
      expect(Array.isArray(metricsPayload.series)).toBe(true);
      expect(metricsPayload.series.length).toBeGreaterThan(1);
      expect(metricsPayload.series[0].errorRateBaseline).toBeTypeOf("number");
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

  it("serves operator config, automation jobs, and webhook intake", async () => {
    const dashboardModule = await loadDashboardModule();
    expect(dashboardModule?.startDashboardServer).toBeTypeOf("function");
    if (!dashboardModule) {
      return;
    }

    const server = await dashboardModule.startDashboardServer();
    try {
      const configResponse = await fetch(`${server.baseUrl}/api/operator-config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackedRepos: ["example/repo"],
          slackChannel: "#ops-approvals",
          agentCommand: "node",
          agentArgs: ["-e", "console.log('ok')"],
          judgmentProvider: "ai-cli",
          aiCli: {
            command: "node",
            args: [
              "-e",
              "process.stdin.resume(); process.stdin.on('data', () => {}); process.stdin.on('end', () => console.log(JSON.stringify({action:'hold',confidence:50,reasoning:'ok',evidence:['x'],similarIncidentId:null})));"
            ],
            healthArgs: ["-e", "process.exit(0)"]
          },
          metricSource: "prometheus",
          prometheus: {
            url: "http://127.0.0.1:9090",
            errorRateExpr: "error_rate",
            latencyP95Expr: "latency_p95",
            requestsPerSecExpr: "rps"
          },
          enabled: true
        })
      });
      expect(configResponse.status).toBe(200);

      const defaultPolicyResponse = await fetch(`${server.baseUrl}/api/policy-config`);
      expect(defaultPolicyResponse.status).toBe(200);
      const defaultPolicyPayload = await defaultPolicyResponse.json();
      expect(defaultPolicyPayload.policy.thresholds.medium).toBe(35);
      expect(defaultPolicyPayload.policy.rollback.minConfidence).toBe(90);

      const blockedPolicyResponse = await fetch(`${server.baseUrl}/api/policy-config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          thresholds: {
            high: 75
          }
        })
      });
      expect(blockedPolicyResponse.status).toBe(400);
      const blockedPolicyPayload = await blockedPolicyResponse.json();
      expect(blockedPolicyPayload.error.message).toContain("requires explicit approval");

      const policyResponse = await fetch(`${server.baseUrl}/api/policy-config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          thresholds: {
            high: 55
          },
          rollback: {
            minConfidence: 92,
            requireHumanApproval: true
          },
          approved: true
        })
      });
      expect(policyResponse.status).toBe(200);
      const policyPayload = await policyResponse.json();
      expect(policyPayload.policy.thresholds.high).toBe(55);
      expect(policyPayload.policy.rollback.minConfidence).toBe(92);
      expect(policyPayload.policy.rollback.requireHumanApproval).toBe(true);

      const webhookResponse = await fetch(`${server.baseUrl}/webhooks/github`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "opened",
          repository: { full_name: "example/repo" },
          issue: {
            html_url: "https://github.com/example/repo/issues/77",
            labels: [{ name: "service:svc-api" }]
          }
        })
      });
      expect(webhookResponse.status).toBe(202);

      const deployWebhookResponse = await fetch(`${server.baseUrl}/webhooks/github`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deployment: {
            id: 55,
            sha: "abc123def456",
            environment: "production",
            payload: {
              service: "svc-api",
              target: "prod-cluster"
            }
          },
          repository: { full_name: "example/repo" }
        })
      });
      expect(deployWebhookResponse.status).toBe(202);
      const deployWebhookPayload = await deployWebhookResponse.json();
      expect(deployWebhookPayload.kind).toBe("deploy_event");

      const jobsPayload = await (await fetch(`${server.baseUrl}/api/automation/jobs`)).json();
      expect(jobsPayload.jobs).toHaveLength(1);
      expect(jobsPayload.jobs[0].githubIssueUrl).toContain("/issues/77");

      const pipelineResponse = await fetch(`${server.baseUrl}/api/automation/pipeline`);
      expect(pipelineResponse.status).toBe(200);
      const pipelinePayload = await pipelineResponse.json();
      expect(pipelinePayload.items).toHaveLength(1);
      expect(pipelinePayload.items[0].job.id).toBe(jobsPayload.jobs[0].id);
      expect(Array.isArray(pipelinePayload.items[0].stages)).toBe(true);
      expect(Array.isArray(pipelinePayload.items[0].events)).toBe(true);

      const approvalsResponse = await fetch(`${server.baseUrl}/api/approvals`);
      expect(approvalsResponse.status).toBe(200);
      const approvalsPayload = await approvalsResponse.json();
      expect(approvalsPayload.approvals).toHaveLength(1);
      expect(approvalsPayload.approvals[0].runId).toBe(jobsPayload.jobs[0].runId);
      expect(approvalsPayload.approvals[0].summary).toContain("Investigate linked GitHub target");

      const approvalDetailResponse = await fetch(
        `${server.baseUrl}/api/approvals/${jobsPayload.jobs[0].runId}`
      );
      expect(approvalDetailResponse.status).toBe(200);
      const approvalDetailPayload = await approvalDetailResponse.json();
      expect(approvalDetailPayload.runId).toBe(jobsPayload.jobs[0].runId);
      expect(approvalDetailPayload.slackPreview).toContain(jobsPayload.jobs[0].runId);
      expect(Array.isArray(approvalDetailPayload.tests)).toBe(true);
      expect(Array.isArray(approvalDetailPayload.policyViolations)).toBe(true);

      const approvalActionResponse = await fetch(`${server.baseUrl}/webhooks/slack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user: {
            username: "dashboard-reviewer"
          },
          actions: [
            {
              action_id: "sentinelops_approve",
              value: JSON.stringify({
                runId: jobsPayload.jobs[0].runId,
                jobId: jobsPayload.jobs[0].id
              })
            }
          ]
        })
      });
      expect(approvalActionResponse.status).toBe(200);
      const approvalActionPayload = await approvalActionResponse.json();
      expect(approvalActionPayload.job.status).toBe("approved");

      const runJobResponse = await fetch(
        `${server.baseUrl}/api/automation/jobs/${jobsPayload.jobs[0].id}/run`,
        {
          method: "POST"
        }
      );
      expect(runJobResponse.status).toBe(200);
      const runJobPayload = await runJobResponse.json();
      expect(runJobPayload.job.status).toBe("completed");
      expect(runJobPayload.execution.transcriptPath).toBeTruthy();

      const refreshedPipelineResponse = await fetch(`${server.baseUrl}/api/automation/pipeline`);
      expect(refreshedPipelineResponse.status).toBe(200);
      const refreshedPipelinePayload = await refreshedPipelineResponse.json();
      expect(refreshedPipelinePayload.items[0].job.status).toBe("completed");
      expect(refreshedPipelinePayload.items[0].transcriptPreview).toContain("ok");

      const deploysPayload = await (await fetch(`${server.baseUrl}/api/deploys`)).json();
      expect(
        deploysPayload.deploys.some((deploy: { version: string }) => deploy.version === "abc123def456")
      ).toBe(true);
      const createdDeploy = deploysPayload.deploys.find(
        (deploy: { version: string }) => deploy.version === "abc123def456"
      );
      expect(createdDeploy.target).toBe("prod-cluster");
      expect(createdDeploy.judgment.decision.action).toBe("hold");
      expect(createdDeploy.judgment.metricSourceId).toBeTruthy();

      const togglePayload = await (
        await fetch(`${server.baseUrl}/api/operator-config/toggle`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: false })
        })
      ).json();
      expect(togglePayload.config.enabled).toBe(false);

      const reenableResponse = await fetch(`${server.baseUrl}/api/operator-config/toggle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true })
      });
      expect(reenableResponse.status).toBe(200);

      const integrationHealthResponse = await fetch(`${server.baseUrl}/api/integrations/health`);
      expect(integrationHealthResponse.status).toBe(200);
      const integrationHealthPayload = await integrationHealthResponse.json();
      expect(Array.isArray(integrationHealthPayload.health)).toBe(true);
      expect(
        integrationHealthPayload.health.some(
          (entry: { id: string }) => entry.id === "judgment-ai-cli"
        )
      ).toBe(true);

      const judgmentHealthResponse = await fetch(
        `${server.baseUrl}/api/integrations/health/judgment-ai-cli`
      );
      expect(judgmentHealthResponse.status).toBe(200);
      const judgmentHealthPayload = await judgmentHealthResponse.json();
      expect(judgmentHealthPayload.health.id).toBe("judgment-ai-cli");

      const onboardResponse = await fetch(`${server.baseUrl}/api/onboard/live`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repoUrl: "https://github.com/example/platform/issues/5",
          slackChannel: "#live-demo",
          agentCommand: "codex",
          agentArgs: ["exec", "--json"],
          enabled: true
        })
      });
      expect(onboardResponse.status).toBe(200);
      const onboardPayload = await onboardResponse.json();
      expect(onboardPayload.repo).toBe("example/platform");
      expect(onboardPayload.config.slackChannel).toBe("#live-demo");
      expect(onboardPayload.codexPrompt).toContain("GitHub plugin");

      const runtimeResponse = await fetch(`${server.baseUrl}/api/runtime/live`);
      expect(runtimeResponse.status).toBe(200);
      const runtimePayload = await runtimeResponse.json();
      expect(runtimePayload.config.trackedRepos[0]).toBe("example/platform");
      expect(Array.isArray(runtimePayload.health)).toBe(true);
      expect(runtimePayload.services[0].serviceId).toBeTruthy();

      const auditLogResponse = await fetch(`${server.baseUrl}/api/audit/log`);
      expect(auditLogResponse.status).toBe(200);
      const auditLogPayload = await auditLogResponse.json();
      expect(Array.isArray(auditLogPayload.entries)).toBe(true);

      const auditRunsResponse = await fetch(`${server.baseUrl}/api/audit/runs`);
      expect(auditRunsResponse.status).toBe(200);
      const auditRunsPayload = await auditRunsResponse.json();
      expect(Array.isArray(auditRunsPayload.runs)).toBe(true);

      const repoMemoryResponse = await fetch(`${server.baseUrl}/api/memory/repo`);
      expect(repoMemoryResponse.status).toBe(200);
      const repoMemoryPayload = await repoMemoryResponse.json();
      expect(Array.isArray(repoMemoryPayload.entries)).toBe(true);

      const incidentMemoryResponse = await fetch(`${server.baseUrl}/api/memory/incidents`);
      expect(incidentMemoryResponse.status).toBe(200);
      const incidentMemoryPayload = await incidentMemoryResponse.json();
      expect(Array.isArray(incidentMemoryPayload.incidents)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("streams dashboard events for live mutations", async () => {
    const dashboardModule = await loadDashboardModule();
    expect(dashboardModule?.startDashboardServer).toBeTypeOf("function");
    if (!dashboardModule) {
      return;
    }

    const server = await dashboardModule.startDashboardServer();
    const controller = new AbortController();
    try {
      const response = await fetch(`${server.baseUrl}/api/events/stream`, {
        signal: controller.signal
      });
      expect(response.status).toBe(200);
      expect(response.body).toBeTruthy();

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const initialText = await readStreamChunk(reader, decoder);
      expect(initialText).toContain("\"type\":\"stream.connected\"");

      await fetch(`${server.baseUrl}/api/scenarios/load`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "post-deploy-errors" })
      });

      const text = await readStreamChunk(reader, decoder);
      expect(text).toContain("event: dashboard");
      expect(text).toContain("\"type\":\"scenario.loaded\"");

    } finally {
      controller.abort();
      await server.close();
    }
  });
});
