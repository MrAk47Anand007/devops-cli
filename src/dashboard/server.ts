import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, normalize, resolve } from "node:path";
import { createDefaultJudgmentBrain, createJudgmentInput } from "../agent.js";
import { executeApprovedAutomationJob, listAutomationJobsForCli } from "../core/automation.js";
import { createApprovalPackage, listPendingApprovals, recordApproval } from "../core/approval.js";
import { handleGithubWebhook, handleSlackWebhook } from "../core/automation-webhooks.js";
import { guard } from "../core/guard.js";
import { createMetricSourceFromConfig, listIntegrationHealth } from "../core/metric-sources.js";
import { createLiveOnboarding } from "../core/onboarding.js";
import { loadOperatorConfig, saveOperatorConfig, setOperatorEnabled } from "../core/operator-config.js";
import { logAudit, readAudit } from "../deploy.js";
import { loadIncidents } from "../memory.js";
import { createDeployTargetFromConfig } from "../core/deploy-targets.js";
import { showRepoMemory } from "../core/repo.js";
import { listAuditRuns } from "../core/reporting.js";
import { listAutomationEvents, loadRun } from "../core/store.js";
import { evaluateRunPolicy } from "../core/policy.js";
import { getGuardrailPolicyConfig, updateGuardrailPolicyConfig } from "../core/guardrail-config.js";
import { DashboardStore } from "./store.js";
import { DashboardEventBus, type DashboardEvent } from "./events.js";
import { renderDashboardHtml } from "./ui.js";
import {
  AlertRecordSchema,
  DashboardScenarioSchema,
  DeployRecordSchema,
  IncidentRecordSchema,
  LogRecordSchema,
  CONFIDENCE_THRESHOLD,
  type Metrics,
  type OperatorConfig,
  type RunRecord,
  type Service,
  type DeployJudgmentSnapshot
} from "../types.js";
import { defaultSimulatorMetricSource } from "../core/simulator-adapters.js";

export interface DashboardServerHandle {
  baseUrl: string;
  close: () => Promise<void>;
}

interface RuntimeServiceSnapshot {
  serviceId: string;
  revision: string | null;
  revisionDetail: string;
  deployState: string | null;
}

interface ServiceMetricsDelta {
  current: number;
  baseline: number;
  absolute: number;
  percent: number | null;
  direction: "up" | "down" | "flat";
}

interface ServiceMetricsSnapshot {
  service: Service;
  metricSourceId: string;
  baselineLookbackHours: number;
  runtime: RuntimeServiceSnapshot;
  current: Metrics;
  baseline: Metrics;
  delta: {
    errorRate: ServiceMetricsDelta;
    latencyP95: ServiceMetricsDelta;
    requestsPerSec: ServiceMetricsDelta;
  };
  series: Array<{
    timestamp: number;
    errorRate: number;
    errorRateBaseline: number;
    latencyP95: number;
    latencyP95Baseline: number;
    requestsPerSec: number;
    requestsPerSecBaseline: number;
  }>;
  updatedAt: string;
}

interface AutomationPipelineStage {
  id: "intake" | "approval" | "execution" | "guard";
  label: string;
  status: "pending" | "active" | "completed" | "blocked" | "failed";
  detail: string;
}

interface AutomationPipelineItem {
  job: ReturnType<typeof listAutomationJobsForCli>[number];
  summary: string;
  githubTarget: string | null;
  risk: RunRecord["plan"] extends infer Plan
    ? Plan extends { risk: infer Risk }
      ? Risk | null
      : null
    : null;
  approvals: RunRecord["approvals"];
  latestApproval: RunRecord["approvals"][number] | null;
  testSummary: {
    passed: number;
    failed: number;
    notRun: number;
  };
  guard: {
    status: "passed" | "blocked";
    summary: string;
    violations: string[];
  };
  stages: AutomationPipelineStage[];
  transcriptPreview: string | null;
  events: Array<{
    id: string;
    kind: "github.issue.opened" | "slack.approved" | "slack.rejected" | "agent.completed" | "agent.failed";
    at: string;
    payload: Record<string, unknown>;
  }>;
}

const TRANSCRIPT_PREVIEW_MAX_LINES = 18;
const TRANSCRIPT_PREVIEW_MAX_CHARS = 4000;

function readTranscriptPreview(transcriptPath: string | null): string | null {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return null;
  }

  const lines = readFileSync(transcriptPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const preview = lines.slice(-TRANSCRIPT_PREVIEW_MAX_LINES).join("\n");
  if (preview.length <= TRANSCRIPT_PREVIEW_MAX_CHARS) {
    return preview;
  }
  return preview.slice(preview.length - TRANSCRIPT_PREVIEW_MAX_CHARS);
}

const dashboardDistRoot = resolve(process.cwd(), "web", "dist");

function sendHtml(response: ServerResponse, html: string): void {
  response.statusCode = 200;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendStaticDashboardAsset(path: string, response: ServerResponse): boolean {
  const requested = normalize(path).replace(/^(\.\.(\/|\\|$))+/, "");
  const assetPath = resolve(dashboardDistRoot, `.${requested}`);
  if (!assetPath.startsWith(dashboardDistRoot) || !existsSync(assetPath)) {
    return false;
  }

  const contentType = getContentType(assetPath);
  response.statusCode = 200;
  response.setHeader("content-type", contentType);
  response.end(readFileSync(assetPath));
  return true;
}

function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".html":
      return "text/html; charset=utf-8";
    default:
      return "application/octet-stream";
  }
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
  const events = new DashboardEventBus();

  function readMetricBaselineLookback(config: OperatorConfig | null): number {
    if (!config) {
      return 168;
    }
    if (config.metricSource === "prometheus") {
      return config.prometheus.baselineLookbackHours;
    }
    if (config.metricSource === "grafana") {
      return config.grafana.baselineLookbackHours;
    }
    return 168;
  }

  function buildMetricDelta(current: number, baseline: number): ServiceMetricsDelta {
    const absolute = current - baseline;
    const percent = baseline === 0 ? null : (absolute / baseline) * 100;
    const epsilon = Math.max(Math.abs(current), Math.abs(baseline), 1) * 0.001;
    return {
      current,
      baseline,
      absolute,
      percent,
      direction: Math.abs(absolute) <= epsilon ? "flat" : absolute > 0 ? "up" : "down"
    };
  }

  async function getRuntimeServiceSnapshot(service: Service): Promise<RuntimeServiceSnapshot> {
    const config = loadOperatorConfig();
    if (!config) {
      return {
        serviceId: service.id,
        revision: null,
        revisionDetail: "Operator config has not been initialized yet.",
        deployState: null
      };
    }

    const deployTarget = createDeployTargetFromConfig(config);
    const latestDeploy = store
      .getDeploys()
      .filter((deploy) => deploy.serviceId === service.id)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
    try {
      const revision = await deployTarget.currentRevision(service.id);
      const deployStatus = latestDeploy ? await deployTarget.status(latestDeploy.id) : null;
      return {
        serviceId: service.id,
        revision: revision.version,
        revisionDetail: `Deploy target ${deployTarget.id} reports revision ${revision.version}.`,
        deployState: deployStatus?.state ?? null
      };
    } catch (error) {
      return {
        serviceId: service.id,
        revision: null,
        revisionDetail: error instanceof Error ? error.message : String(error),
        deployState: latestDeploy?.status ?? null
      };
    }
  }

  async function getServiceMetricsSnapshot(serviceId: string): Promise<ServiceMetricsSnapshot | null> {
    const service = store.getService(serviceId);
    if (!service) {
      return null;
    }

    const config = loadOperatorConfig();
    const baselineLookbackHours = readMetricBaselineLookback(config);
    const metricSource = config ? createMetricSourceFromConfig(config) : defaultSimulatorMetricSource;
    const [runtime, current, baseline, history] = await Promise.all([
      getRuntimeServiceSnapshot(service),
      metricSource.query("current"),
      metricSource.baseline({ lookbackHours: baselineLookbackHours, sameHour: true }),
      metricSource.history
        ? metricSource.history({
            rangeMinutes: 60,
            stepMinutes: 5,
            baselineLookbackHours,
            sameHour: true
          })
        : Promise.resolve(null)
    ]);

    const series = history
      ? history.current
          .slice(0, Math.min(history.current.length, history.baseline.length))
          .map((point, index) => ({
            timestamp: point.timestamp,
            errorRate: point.errorRate,
            errorRateBaseline: history.baseline[index]!.errorRate,
            latencyP95: point.latencyP95,
            latencyP95Baseline: history.baseline[index]!.latencyP95,
            requestsPerSec: point.requestsPerSec,
            requestsPerSecBaseline: history.baseline[index]!.requestsPerSec
          }))
      : [
          {
            timestamp: baseline.timestamp,
            errorRate: baseline.errorRate,
            errorRateBaseline: baseline.errorRate,
            latencyP95: baseline.latencyP95,
            latencyP95Baseline: baseline.latencyP95,
            requestsPerSec: baseline.requestsPerSec,
            requestsPerSecBaseline: baseline.requestsPerSec
          },
          {
            timestamp: current.timestamp,
            errorRate: current.errorRate,
            errorRateBaseline: baseline.errorRate,
            latencyP95: current.latencyP95,
            latencyP95Baseline: baseline.latencyP95,
            requestsPerSec: current.requestsPerSec,
            requestsPerSecBaseline: baseline.requestsPerSec
          }
        ];

    return {
      service,
      metricSourceId: metricSource.id,
      baselineLookbackHours,
      runtime,
      current,
      baseline,
      delta: {
        errorRate: buildMetricDelta(current.errorRate, baseline.errorRate),
        latencyP95: buildMetricDelta(current.latencyP95, baseline.latencyP95),
        requestsPerSec: buildMetricDelta(current.requestsPerSec, baseline.requestsPerSec)
      },
      series,
      updatedAt: new Date().toISOString()
    };
  }

  async function captureDeployJudgmentSnapshot(): Promise<DeployJudgmentSnapshot | null> {
    const config = loadOperatorConfig();
    const judgmentBrain = createDefaultJudgmentBrain({
      provider: config?.judgmentProvider
    });
    const candidateSources = config
      ? [createMetricSourceFromConfig(config), defaultSimulatorMetricSource]
      : [defaultSimulatorMetricSource];

    for (const metricSource of candidateSources) {
      try {
        const metrics = await metricSource.query("current");
        const decision = await judgmentBrain.decide(createJudgmentInput(metrics));
        return {
          decision,
          metricSourceId: metricSource.id,
          metrics,
          mode: decision.confidence >= CONFIDENCE_THRESHOLD ? "autonomous" : "needs_review",
          capturedAt: new Date().toISOString()
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  function summarizeTests(run: RunRecord | null): AutomationPipelineItem["testSummary"] {
    const tests = run?.tests ?? [];
    return {
      passed: tests.filter((entry) => entry.status === "passed").length,
      failed: tests.filter((entry) => entry.status === "failed").length,
      notRun: tests.filter((entry) => entry.status === "not_run").length
    };
  }

  function buildPipelineStages(item: {
    job: ReturnType<typeof listAutomationJobsForCli>[number];
    approvals: RunRecord["approvals"];
    execution: ReturnType<typeof listAutomationJobsForCli>[number]["execution"];
    guard: AutomationPipelineItem["guard"];
  }): AutomationPipelineStage[] {
    const intakeStage: AutomationPipelineStage = {
      id: "intake",
      label: "Issue intake",
      status: "completed",
      detail: "GitHub issue arrived and created an automation job."
    };

    const latestApproval = item.approvals.at(-1) ?? null;
    const approvalStage: AutomationPipelineStage =
      item.job.status === "awaiting_approval"
        ? {
            id: "approval",
            label: "Approval",
            status: "active",
            detail: "Waiting for an operator decision."
          }
        : latestApproval?.status === "approved"
          ? {
              id: "approval",
              label: "Approval",
              status: "completed",
              detail: `Approved by ${latestApproval.by}.`
            }
          : latestApproval
            ? {
                id: "approval",
                label: "Approval",
                status: "blocked",
                detail: `${latestApproval.status.replaceAll("_", " ")} by ${latestApproval.by}.`
              }
            : {
                id: "approval",
                label: "Approval",
                status: "pending",
                detail: "Approval has not started yet."
              };

    const executionStage: AutomationPipelineStage =
      item.job.status === "running_agent"
        ? {
            id: "execution",
            label: "Agent execution",
            status: "active",
            detail: "The selected AI operator is currently running."
          }
        : item.job.status === "completed"
          ? {
              id: "execution",
              label: "Agent execution",
              status: "completed",
              detail: item.execution?.summary || "Agent run completed successfully."
            }
          : item.job.status === "failed"
            ? {
                id: "execution",
                label: "Agent execution",
                status: "failed",
                detail: item.execution?.summary || "Agent run failed."
              }
            : item.job.status === "approved"
              ? {
                  id: "execution",
                  label: "Agent execution",
                  status: "pending",
                  detail: "Approved and ready to execute."
                }
              : {
                  id: "execution",
                  label: "Agent execution",
                  status: "pending",
                  detail: "Execution has not started."
                };

    const guardStage: AutomationPipelineStage =
      item.guard.status === "passed"
        ? {
            id: "guard",
            label: "Guard gate",
            status: "completed",
            detail: item.guard.summary
          }
        : {
            id: "guard",
            label: "Guard gate",
            status: "blocked",
            detail: item.guard.summary
          };

    return [intakeStage, approvalStage, executionStage, guardStage];
  }

  function getAutomationPipelineItems(): AutomationPipelineItem[] {
    const events = listAutomationEvents();
    return listAutomationJobsForCli().map((job) => {
      const run = loadRun(job.runId);
      const policyViolations = run ? evaluateRunPolicy(run) : [];
      const approvals = run?.approvals ?? [];
      const pipelineEvents = events
        .filter((event) => event.jobId === job.id)
        .sort((left, right) => left.at.localeCompare(right.at))
        .map((event) => ({
          id: event.id,
          kind: event.kind,
          at: event.at,
          payload: event.payload
        }));
      const guardResult = {
        status: policyViolations.length === 0 ? "passed" as const : "blocked" as const,
        summary:
          policyViolations.length === 0
            ? "Guard policy is satisfied for the current run state."
            : policyViolations.map((entry) => entry.message).join(" "),
        violations: policyViolations.map((entry) => entry.id)
      };

      return {
        job,
        summary: run?.plan?.summary ?? `Investigate linked GitHub target for ${job.serviceId}.`,
        githubTarget: run?.githubTarget ?? job.githubIssueUrl,
        risk: run?.plan?.risk ?? null,
        approvals,
        latestApproval: approvals.at(-1) ?? null,
        testSummary: summarizeTests(run),
        guard: guardResult,
        stages: buildPipelineStages({
          job,
          approvals,
          execution: job.execution,
          guard: guardResult
        }),
        transcriptPreview: readTranscriptPreview(job.execution?.transcriptPath ?? null),
        events: pipelineEvents
      };
    });
  }

  async function getRuntimeSnapshot(): Promise<{
    config: ReturnType<typeof loadOperatorConfig>;
    health: Awaited<ReturnType<typeof listIntegrationHealth>>;
    services: RuntimeServiceSnapshot[];
    updatedAt: string;
  }> {
    const config = loadOperatorConfig();
    const services = store.getServices();
    if (!config) {
      return {
        config,
        health: [],
        services: await Promise.all(services.map((service) => getRuntimeServiceSnapshot(service))),
        updatedAt: new Date().toISOString()
      };
    }

    return {
      config,
      health: await listIntegrationHealth(),
      services: await Promise.all(services.map((service) => getRuntimeServiceSnapshot(service))),
      updatedAt: new Date().toISOString()
    };
  }

  function publishEvent(input: Omit<DashboardEvent, "id" | "at">): void {
    events.publish(input);
  }

  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const path = url.pathname;

      if (method === "GET" && path.startsWith("/assets/")) {
        if (sendStaticDashboardAsset(path, response)) {
          return;
        }
      }

      if (
        method === "GET" &&
        ["/", "/automation", "/approvals", "/incidents", "/integrations", "/settings", "/memory"].includes(path)
      ) {
        sendHtml(response, renderDashboardHtml({ routePath: path }));
        return;
      }

      if (method === "GET" && path.startsWith("/services/")) {
        const serviceId = decodeURIComponent(path.replace("/services/", ""));
        sendHtml(response, renderDashboardHtml({ routePath: `/services/${serviceId}` }));
        return;
      }

      if (method === "GET" && path.startsWith("/incidents/")) {
        const incidentId = decodeURIComponent(path.replace("/incidents/", ""));
        sendHtml(response, renderDashboardHtml({ incidentId, routePath: path }));
        return;
      }

      if (method === "GET" && path === "/api/services") {
        sendJson(response, 200, { services: store.getServices() });
        return;
      }

      if (method === "GET" && path.startsWith("/api/services/") && path.endsWith("/metrics")) {
        const serviceId = decodeURIComponent(path.replace("/api/services/", "").replace("/metrics", ""));
        const snapshot = await getServiceMetricsSnapshot(serviceId);
        sendJson(
          response,
          snapshot ? 200 : 404,
          snapshot ?? { error: { code: "SERVICE_NOT_FOUND" } }
        );
        return;
      }

      if (method === "GET" && path === "/api/operator-config") {
        sendJson(response, 200, { config: loadOperatorConfig() });
        return;
      }

      if (method === "GET" && path === "/api/policy-config") {
        sendJson(response, 200, { policy: getGuardrailPolicyConfig() });
        return;
      }

      if (method === "GET" && path === "/api/audit/log") {
        sendJson(response, 200, { entries: readAudit() });
        return;
      }

      if (method === "GET" && path === "/api/audit/runs") {
        sendJson(response, 200, { runs: listAuditRuns() });
        return;
      }

      if (method === "GET" && path === "/api/memory/repo") {
        sendJson(response, 200, { entries: showRepoMemory() });
        return;
      }

      if (method === "GET" && path === "/api/memory/incidents") {
        sendJson(response, 200, { incidents: loadIncidents() });
        return;
      }

      if (method === "GET" && path === "/api/events/stream") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive"
        });
        response.write(`event: dashboard\n`);
        response.write(
          `data: ${JSON.stringify(events.publish({ type: "stream.connected", detail: "Dashboard stream connected." }))}\n\n`
        );
        const unsubscribe = events.subscribe((event) => {
          response.write(`event: dashboard\n`);
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        });
        request.on("close", () => {
          unsubscribe();
          response.end();
        });
        return;
      }

      if (method === "GET" && path === "/api/runtime/live") {
        sendJson(response, 200, await getRuntimeSnapshot());
        return;
      }

      if (method === "POST" && path === "/api/operator-config") {
        const body = await readJsonBody(request);
        const parsed = body as {
          trackedRepos?: string[];
          slackChannel?: string;
          agentCommand?: string;
          agentArgs?: string[];
          judgmentProvider?: "canned" | "openai" | "anthropic" | "ai-cli";
          openai?: {
            model?: string;
          };
          anthropic?: {
            model?: string;
          };
          aiCli?: {
            command?: string;
            args?: string[];
            healthArgs?: string[];
          };
          deployTarget?: "simulator" | "kubernetes" | "docker";
          kubernetes?: {
            command?: string;
            context?: string;
            namespace?: string;
            deployment?: string;
            service?: string;
          };
          docker?: {
            command?: string;
            composeFile?: string;
            service?: string;
            container?: string;
          };
          metricSource?: "simulator" | "prometheus" | "grafana";
          prometheus?: {
            url?: string;
            errorRateExpr?: string;
            latencyP95Expr?: string;
            requestsPerSecExpr?: string;
          };
          grafana?: {
            url?: string;
            token?: string;
            datasourceUid?: string;
            dashboardUid?: string;
            errorRateExpr?: string;
            latencyP95Expr?: string;
            requestsPerSecExpr?: string;
          };
          enabled?: boolean;
        };
        const current = loadOperatorConfig();
        const nextEnabled = parsed.enabled ?? true;
        const enabledDecision = guard({
          actor: "dashboard",
          action: "config.write",
          configKey: "operator.enabled",
          previousValue: current?.enabled ?? null,
          nextValue: nextEnabled
        });
        logAudit({
          timestamp: Date.now(),
          actor: "dashboard",
          action: "config",
          detail: `operator-config save (${enabledDecision.code})`
        });
        if (!enabledDecision.ok) {
          throw new Error(enabledDecision.message);
        }
        const config = saveOperatorConfig({
            trackedRepos: parsed.trackedRepos ?? [],
            slackChannel: parsed.slackChannel ?? "",
            agentCommand: parsed.agentCommand ?? "codex",
            agentArgs: parsed.agentArgs ?? ["exec", "--json"],
            judgmentProvider: parsed.judgmentProvider ?? "canned",
            openai: parsed.openai ?? {},
            anthropic: parsed.anthropic ?? {},
            aiCli: parsed.aiCli ?? {},
            deployTarget: parsed.deployTarget ?? "simulator",
            kubernetes: parsed.kubernetes ?? {},
            docker: parsed.docker ?? {},
            metricSource: parsed.metricSource ?? "simulator",
            prometheus: parsed.prometheus ?? {},
            grafana: parsed.grafana ?? {},
            enabled: parsed.enabled ?? true
          }, { actor: "dashboard" });
        publishEvent({
          type: "config.updated",
          detail: `Operator config saved for ${config.trackedRepos.join(", ") || "no repos yet"}.`
        });
        publishEvent({
          type: "integration.updated",
          detail: "Adapter configuration changed. Runtime health should be refreshed."
        });
        sendJson(response, 200, { config });
        return;
      }

      if (method === "POST" && path === "/api/policy-config") {
        const body = await readJsonBody(request);
        const parsed = body as {
          thresholds?: {
            medium?: number;
            high?: number;
            critical?: number;
          };
          rollback?: {
            minConfidence?: number;
            maxErrorRate?: number;
            maxLatencyP95?: number;
            requireHumanApproval?: boolean;
          };
          approved?: boolean;
        };
        const policy = updateGuardrailPolicyConfig(
          {
            thresholds: parsed.thresholds,
            rollback: parsed.rollback
          },
          {
            actor: "dashboard",
            approved: parsed.approved === true
          }
        );
        publishEvent({
          type: "config.updated",
          detail: "Guardrail policy updated from dashboard settings."
        });
        sendJson(response, 200, { policy });
        return;
      }

      if (method === "POST" && path === "/api/operator-config/toggle") {
        const body = await readJsonBody(request);
        const enabled = Boolean((body as { enabled?: unknown }).enabled);
        const current = loadOperatorConfig();
        const decision = guard({
          actor: "dashboard",
          action: "config.write",
          configKey: "operator.enabled",
          previousValue: current?.enabled ?? null,
          nextValue: enabled
        });
        logAudit({
          timestamp: Date.now(),
          actor: "dashboard",
          action: "config",
          detail: `operator.enabled -> ${enabled} (${decision.code})`
        });
        if (!decision.ok) {
          throw new Error(decision.message);
        }
        const config = setOperatorEnabled(enabled, { actor: "dashboard" });
        publishEvent({
          type: "operator.toggled",
          detail: `Automation ${enabled ? "enabled" : "disabled"} from dashboard settings.`
        });
        sendJson(response, 200, { config });
        return;
      }

      if (method === "POST" && path === "/api/onboard/live") {
        const body = await readJsonBody(request);
        const parsed = body as {
          repo?: string;
          repoUrl?: string;
          slackChannel?: string;
          agentCommand?: string;
          agentArgs?: string[];
          enabled?: boolean;
        };
        const onboarding = createLiveOnboarding({
          repo: parsed.repo ?? parsed.repoUrl ?? "",
          slackChannel: parsed.slackChannel ?? "",
          agentCommand: parsed.agentCommand,
          agentArgs: parsed.agentArgs,
          enabled: parsed.enabled
        });
        publishEvent({
          type: "onboarding.updated",
          detail: `Live onboarding saved for ${onboarding.repo}.`
        });
        publishEvent({
          type: "integration.updated",
          detail: "Repo and approval channel wiring changed."
        });
        sendJson(
          response,
          200,
          onboarding
        );
        return;
      }

      if (method === "GET" && path === "/api/automation/jobs") {
        sendJson(response, 200, { jobs: listAutomationJobsForCli() });
        return;
      }

      if (method === "GET" && path === "/api/automation/pipeline") {
        sendJson(response, 200, { items: getAutomationPipelineItems() });
        return;
      }

      if (method === "GET" && path === "/api/approvals") {
        sendJson(response, 200, { approvals: listPendingApprovals() });
        return;
      }

      if (method === "GET" && path.startsWith("/api/approvals/")) {
        const runId = decodeURIComponent(path.replace("/api/approvals/", ""));
        const run = loadRun(runId);
        if (!run) {
          sendJson(response, 404, { error: { code: "RUN_NOT_FOUND" } });
          return;
        }
        const approvalPackage = createApprovalPackage(runId, {
          includePlan: true,
          includeDiff: true,
          includeTests: true
        });
        const violations = evaluateRunPolicy(run);
        sendJson(response, 200, {
          runId,
          summary: approvalPackage.package.summary,
          risk: approvalPackage.package.risk,
          githubTarget: run.githubTarget,
          approvals: run.approvals,
          latestApproval: run.approvals.at(-1) ?? null,
          tests: run.tests,
          policyViolations: violations,
          plan: approvalPackage.package.plan ?? null,
          diff: approvalPackage.package.diff ?? "",
          slackPreview: approvalPackage.package.pluginPayloads.slack.text,
          requiresApproval: approvalPackage.package.pluginPayloads.slack.metadata.requiresApproval
        });
        return;
      }

      if (method === "GET" && path === "/api/integrations/health") {
        sendJson(response, 200, { health: loadOperatorConfig() ? await listIntegrationHealth() : [] });
        return;
      }

      if (method === "GET" && path.startsWith("/api/integrations/health/")) {
        const integrationId = decodeURIComponent(path.replace("/api/integrations/health/", ""));
        const health = loadOperatorConfig() ? await listIntegrationHealth() : [];
        const entry = health.find((item) => item.id === integrationId) ?? null;
        sendJson(
          response,
          entry ? 200 : 404,
          entry ? { health: entry } : { error: { code: "INTEGRATION_NOT_FOUND" } }
        );
        return;
      }

      if (method === "POST" && path.startsWith("/api/approvals/")) {
        const runId = decodeURIComponent(path.replace("/api/approvals/", ""));
        const body = await readJsonBody(request);
        const parsed = body as {
          action?: "approve" | "hold" | "reject";
          by?: string;
        };
        const status =
          parsed.action === "approve"
            ? "approved"
            : parsed.action === "reject"
              ? "rejected"
              : "changes_requested";
        const run = recordApproval(runId, {
          source: "dashboard",
          status,
          by: parsed.by?.trim() || "dashboard-operator"
        });
        publishEvent({
          type: "automation.updated",
          detail: `Approval ${status} recorded for ${runId}.`,
          serviceId: run.serviceId ?? undefined
        });
        sendJson(response, 200, { run });
        return;
      }

      if (method === "POST" && path.startsWith("/api/automation/jobs/") && path.endsWith("/run")) {
        const jobId = decodeURIComponent(path.replace("/api/automation/jobs/", "").replace("/run", ""));
        const result = await executeApprovedAutomationJob(jobId);
        publishEvent({
          type: "automation.updated",
          detail: `Automation job ${jobId} executed with status ${result.job.status}.`,
          serviceId: result.job.serviceId
        });
        sendJson(response, 200, result);
        return;
      }

      if (method === "POST" && path === "/webhooks/github") {
        const result = await handleGithubWebhook(await readJsonBody(request));
        if (result.kind === "deploy_event") {
          const deployEvent = result.deployEvent;
          const judgment = await captureDeployJudgmentSnapshot();
          const deploy = store.recordDeployEvent({
            serviceId: deployEvent.service,
            version: deployEvent.sha,
            target: deployEvent.target,
            timestamp: new Date().toISOString(),
            judgment
          });
          publishEvent({
            type: "deploy.created",
            detail: `Deploy event ${deployEvent.sha} arrived from GitHub for ${deployEvent.service}.`,
            serviceId: deployEvent.service
          });
          sendJson(response, 202, {
            ok: true,
            kind: result.kind,
            deployEvent,
            deploy
          });
          return;
        }
        publishEvent({
          type: "automation.updated",
          detail: `GitHub issue intake recorded for ${result.job.serviceId}.`,
          serviceId: result.job.serviceId
        });
        sendJson(response, 202, result);
        return;
      }

      if (method === "POST" && path === "/webhooks/slack") {
        sendJson(response, 200, handleSlackWebhook(await readJsonBody(request)));
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
        const log = store.addLog(body);
        publishEvent({
          type: "log.created",
          detail: `Log ${log.level} captured for ${log.serviceId}.`,
          serviceId: log.serviceId
        });
        sendJson(response, 201, { log });
        return;
      }

      if (method === "GET" && path === "/api/alerts") {
        sendJson(response, 200, { alerts: store.getAlerts() });
        return;
      }

      if (method === "POST" && path === "/api/alerts") {
        const body = AlertRecordSchema.omit({ id: true }).parse(await readJsonBody(request));
        const alert = store.addAlert(body);
        publishEvent({
          type: "alert.created",
          detail: `Alert ${alert.severity} captured for ${alert.serviceId}.`,
          serviceId: alert.serviceId
        });
        sendJson(response, 201, { alert });
        return;
      }

      if (method === "GET" && path === "/api/deploys") {
        sendJson(response, 200, { deploys: store.getDeploys() });
        return;
      }

      if (method === "POST" && path === "/api/deploys") {
        const body = DeployRecordSchema.omit({ id: true }).parse(await readJsonBody(request));
        const deploy = store.addDeploy(body);
        publishEvent({
          type: "deploy.created",
          detail: `Deploy ${deploy.version} recorded for ${deploy.serviceId}.`,
          serviceId: deploy.serviceId
        });
        sendJson(response, 201, { deploy });
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
        const incident = store.addIncident(body);
        publishEvent({
          type: "incident.created",
          detail: `Incident ${incident.id} opened for ${incident.serviceId}.`,
          serviceId: incident.serviceId
        });
        sendJson(response, 201, { incident });
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
        if (incident) {
          publishEvent({
            type: "incident.updated",
            detail: `Incident ${incident.id} updated to ${incident.status}.`,
            serviceId: incident.serviceId
          });
        }
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
        publishEvent({
          type: "scenario.loaded",
          detail: `Scenario ${state.scenario} loaded into the dashboard.`,
          serviceId: state.service.id
        });
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
