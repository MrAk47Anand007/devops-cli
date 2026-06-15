import type {
  AdapterHealth,
  BaselineWindow,
  MetricHistoryWindow,
  MetricSource,
  Unsubscribe
} from "./contracts.js";
import { requireOperatorConfig } from "./operator-config.js";
import type { Metrics, OperatorConfig } from "../types.js";
import { defaultSimulatorMetricSource } from "./simulator-adapters.js";
import { createDefaultJudgmentBrain } from "../agent.js";
import { createDeployTargetFromConfig } from "./deploy-targets.js";

interface MetricsExpressions {
  errorRateExpr: string;
  latencyP95Expr: string;
  requestsPerSecExpr: string;
  baselineErrorRateExpr: string;
  baselineLatencyP95Expr: string;
  baselineRequestsPerSecExpr: string;
  baselineLookbackHours: number;
}

function ready(detail: string): AdapterHealth {
  return {
    status: "ready",
    checkedAt: Date.now(),
    detail
  };
}

function degraded(detail: string): AdapterHealth {
  return {
    status: "degraded",
    checkedAt: Date.now(),
    detail
  };
}

function unavailable(detail: string): AdapterHealth {
  return {
    status: "unavailable",
    checkedAt: Date.now(),
    detail
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

function parsePrometheusScalar(payload: unknown): number {
  const data = payload as {
    status?: string;
    data?: {
      result?: Array<{
        value?: [number | string, string];
      }>;
    };
    error?: string;
  };

  if (data.status !== "success") {
    throw new Error(data.error ?? "Prometheus query failed.");
  }

  const value = data.data?.result?.[0]?.value?.[1];
  if (typeof value !== "string") {
    throw new Error("Prometheus query returned no scalar value.");
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Prometheus returned a non-numeric scalar: ${value}`);
  }
  return parsed;
}

function parsePrometheusSeries(payload: unknown): Array<{ timestamp: number; value: number }> {
  const data = payload as {
    status?: string;
    data?: {
      result?: Array<{
        values?: Array<[number | string, string]>;
      }>;
    };
    error?: string;
  };

  if (data.status !== "success") {
    throw new Error(data.error ?? "Prometheus range query failed.");
  }

  const values = data.data?.result?.[0]?.values ?? [];
  return values
    .map((entry) => {
      const timestamp = Number(entry[0]);
      const value = Number(entry[1]);
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) {
        return null;
      }
      return {
        timestamp: Math.round(timestamp * 1000),
        value
      };
    })
    .filter((entry): entry is { timestamp: number; value: number } => entry !== null);
}

function extractGrafanaNumber(payload: unknown, refId: string): number {
  const response = payload as {
    results?: Record<
      string,
      {
        frames?: Array<{
          data?: {
            values?: unknown[];
          };
        }>;
        error?: string;
      }
    >;
  };
  const result = response.results?.[refId];
  if (!result) {
    throw new Error(`Grafana returned no result for ${refId}.`);
  }
  if (result.error) {
    throw new Error(result.error);
  }

  const frames = result.frames ?? [];
  for (const frame of frames) {
    const columns = frame.data?.values;
    if (!Array.isArray(columns)) {
      continue;
    }
    for (const column of [...columns].reverse()) {
      if (!Array.isArray(column) || column.length === 0) {
        continue;
      }
      const value = column[column.length - 1];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
  }

  throw new Error(`Grafana returned no numeric datapoint for ${refId}.`);
}

function extractGrafanaSeries(payload: unknown, refId: string): Array<{ timestamp: number; value: number }> {
  const response = payload as {
    results?: Record<
      string,
      {
        frames?: Array<{
          data?: {
            values?: unknown[];
          };
        }>;
        error?: string;
      }
    >;
  };
  const result = response.results?.[refId];
  if (!result) {
    throw new Error(`Grafana returned no result for ${refId}.`);
  }
  if (result.error) {
    throw new Error(result.error);
  }

  const frame = result.frames?.[0];
  const values = frame?.data?.values;
  if (!Array.isArray(values) || values.length < 2) {
    throw new Error(`Grafana returned no timeseries datapoints for ${refId}.`);
  }

  const timestamps = Array.isArray(values[0]) ? values[0] : [];
  const datapoints = Array.isArray(values[1]) ? values[1] : [];
  const points: Array<{ timestamp: number; value: number }> = [];

  for (let index = 0; index < Math.min(timestamps.length, datapoints.length); index += 1) {
    const rawTimestamp = timestamps[index];
    const rawValue = datapoints[index];
    const timestamp = Number(rawTimestamp);
    const value =
      typeof rawValue === "number" ? rawValue : typeof rawValue === "string" ? Number(rawValue) : NaN;
    if (Number.isFinite(timestamp) && Number.isFinite(value)) {
      points.push({ timestamp, value });
    }
  }

  if (points.length === 0) {
    throw new Error(`Grafana returned no numeric timeseries datapoints for ${refId}.`);
  }

  return points;
}

abstract class BaseHttpMetricSource implements MetricSource {
  readonly id: string;

  protected constructor(
    id: string,
    protected readonly expressions: MetricsExpressions
  ) {
    this.id = id;
  }

  abstract query(expr: string): Promise<Metrics>;

  abstract baseline(window: BaselineWindow): Promise<Metrics>;

  abstract history(window: MetricHistoryWindow): Promise<{
    current: Metrics[];
    baseline: Metrics[];
  }>;

  abstract health(): Promise<AdapterHealth>;

  subscribe(_cb: (metrics: Metrics) => void): Unsubscribe {
    return () => {};
  }

  protected createMetrics(
    errorRate: number,
    latencyP95: number,
    requestsPerSec: number
  ): Metrics {
    return {
      timestamp: Date.now(),
      errorRate,
      latencyP95,
      requestsPerSec
    };
  }

  protected baselineExpressions(window: BaselineWindow): {
    errorRateExpr: string;
    latencyP95Expr: string;
    requestsPerSecExpr: string;
  } {
    const lookbackHours = window.lookbackHours || this.expressions.baselineLookbackHours;
    return {
      errorRateExpr:
        this.expressions.baselineErrorRateExpr ||
        this.expressions.errorRateExpr ||
        `avg_over_time((${this.expressions.errorRateExpr})[${lookbackHours}h:])`,
      latencyP95Expr:
        this.expressions.baselineLatencyP95Expr ||
        this.expressions.latencyP95Expr ||
        `avg_over_time((${this.expressions.latencyP95Expr})[${lookbackHours}h:])`,
      requestsPerSecExpr:
        this.expressions.baselineRequestsPerSecExpr ||
        this.expressions.requestsPerSecExpr ||
        `avg_over_time((${this.expressions.requestsPerSecExpr})[${lookbackHours}h:])`
    };
  }
}

export class PrometheusMetricSource extends BaseHttpMetricSource {
  readonly id = "prometheus";

  constructor(
    private readonly config: {
      url: string;
    } & MetricsExpressions
  ) {
    super("prometheus", config);
  }

  private async queryScalar(query: string): Promise<number> {
    if (!query.trim()) {
      throw new Error("Prometheus query expression is not configured.");
    }
    const baseUrl = this.config.url.replace(/\/+$/, "");
    const url = new URL(`${baseUrl}/api/v1/query`);
    url.searchParams.set("query", query);
    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Prometheus query failed with HTTP ${response.status}.`);
    }
    return parsePrometheusScalar(await parseJsonResponse(response));
  }

  private async querySeries(
    query: string,
    options: { rangeMinutes: number; stepMinutes: number }
  ): Promise<Array<{ timestamp: number; value: number }>> {
    if (!query.trim()) {
      throw new Error("Prometheus query expression is not configured.");
    }
    const baseUrl = this.config.url.replace(/\/+$/, "");
    const url = new URL(`${baseUrl}/api/v1/query_range`);
    const end = Math.floor(Date.now() / 1000);
    const start = end - options.rangeMinutes * 60;
    url.searchParams.set("query", query);
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(end));
    url.searchParams.set("step", `${Math.max(1, options.stepMinutes)}m`);
    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Prometheus range query failed with HTTP ${response.status}.`);
    }
    return parsePrometheusSeries(await parseJsonResponse(response));
  }

  private async collectSeries(
    expressions: {
      errorRateExpr: string;
      latencyP95Expr: string;
      requestsPerSecExpr: string;
    },
    options: { rangeMinutes: number; stepMinutes: number }
  ): Promise<Metrics[]> {
    const [errorRate, latencyP95, requestsPerSec] = await Promise.all([
      this.querySeries(expressions.errorRateExpr, options),
      this.querySeries(expressions.latencyP95Expr, options),
      this.querySeries(expressions.requestsPerSecExpr, options)
    ]);

    const count = Math.min(errorRate.length, latencyP95.length, requestsPerSec.length);
    return Array.from({ length: count }, (_, index) => ({
      timestamp: errorRate[index]!.timestamp,
      errorRate: errorRate[index]!.value,
      latencyP95: latencyP95[index]!.value,
      requestsPerSec: requestsPerSec[index]!.value
    }));
  }

  async query(expr: string): Promise<Metrics> {
    if (expr !== "current") {
      throw new Error(`PrometheusMetricSource only supports the "current" query shape, got ${expr}.`);
    }

    const [errorRate, latencyP95, requestsPerSec] = await Promise.all([
      this.queryScalar(this.config.errorRateExpr),
      this.queryScalar(this.config.latencyP95Expr),
      this.queryScalar(this.config.requestsPerSecExpr)
    ]);

    return this.createMetrics(errorRate, latencyP95, requestsPerSec);
  }

  async baseline(window: BaselineWindow): Promise<Metrics> {
    const expressions = this.baselineExpressions(window);
    const [errorRate, latencyP95, requestsPerSec] = await Promise.all([
      this.queryScalar(expressions.errorRateExpr),
      this.queryScalar(expressions.latencyP95Expr),
      this.queryScalar(expressions.requestsPerSecExpr)
    ]);
    return this.createMetrics(errorRate, latencyP95, requestsPerSec);
  }

  async history(window: MetricHistoryWindow): Promise<{
    current: Metrics[];
    baseline: Metrics[];
  }> {
    const options = {
      rangeMinutes: window.rangeMinutes,
      stepMinutes: window.stepMinutes
    };
    const baselineExpressions = this.baselineExpressions({
      lookbackHours: window.baselineLookbackHours,
      sameHour: window.sameHour
    });
    const [current, baseline] = await Promise.all([
      this.collectSeries(
        {
          errorRateExpr: this.config.errorRateExpr,
          latencyP95Expr: this.config.latencyP95Expr,
          requestsPerSecExpr: this.config.requestsPerSecExpr
        },
        options
      ),
      this.collectSeries(baselineExpressions, options)
    ]);
    return { current, baseline };
  }

  async health(): Promise<AdapterHealth> {
    if (!this.config.url.trim()) {
      return degraded("Prometheus URL is not configured.");
    }
    try {
      const current = await this.query("current");
      return ready(
        `Prometheus reachable. Current error rate ${(current.errorRate * 100).toFixed(2)}%, p95 ${current.latencyP95.toFixed(0)}ms.`
      );
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error));
    }
  }
}

export class GrafanaMetricSource extends BaseHttpMetricSource {
  readonly id = "grafana";

  constructor(
    private readonly config: {
      url: string;
      token: string;
      datasourceUid: string;
      dashboardUid: string;
    } & MetricsExpressions
  ) {
    super("grafana", config);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json"
    };
    if (this.config.token.trim()) {
      headers.authorization = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  private async datasourceQuery(expr: string, refId: string): Promise<number> {
    if (!expr.trim()) {
      throw new Error(`Grafana query expression for ${refId} is not configured.`);
    }
    if (!this.config.datasourceUid.trim()) {
      throw new Error("Grafana datasource UID is not configured.");
    }
    const baseUrl = this.config.url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/ds/query`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        from: "now-5m",
        to: "now",
        queries: [
          {
            refId,
            expr,
            instant: true,
            datasource: {
              uid: this.config.datasourceUid
            }
          }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Grafana datasource query failed with HTTP ${response.status}.`);
    }
    return extractGrafanaNumber(await parseJsonResponse(response), refId);
  }

  private async datasourceSeries(
    expr: string,
    refId: string,
    options: { rangeMinutes: number; stepMinutes: number }
  ): Promise<Array<{ timestamp: number; value: number }>> {
    if (!expr.trim()) {
      throw new Error(`Grafana query expression for ${refId} is not configured.`);
    }
    if (!this.config.datasourceUid.trim()) {
      throw new Error("Grafana datasource UID is not configured.");
    }
    const baseUrl = this.config.url.replace(/\/+$/, "");
    const from = Date.now() - options.rangeMinutes * 60_000;
    const to = Date.now();
    const response = await fetch(`${baseUrl}/api/ds/query`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        from: String(from),
        to: String(to),
        queries: [
          {
            refId,
            expr,
            intervalMs: Math.max(60_000, options.stepMinutes * 60_000),
            maxDataPoints: Math.max(2, Math.round(options.rangeMinutes / Math.max(1, options.stepMinutes)) + 1),
            datasource: {
              uid: this.config.datasourceUid
            }
          }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Grafana datasource range query failed with HTTP ${response.status}.`);
    }
    return extractGrafanaSeries(await parseJsonResponse(response), refId);
  }

  private async collectSeries(
    expressions: {
      errorRateExpr: string;
      latencyP95Expr: string;
      requestsPerSecExpr: string;
    },
    options: { rangeMinutes: number; stepMinutes: number }
  ): Promise<Metrics[]> {
    const [errorRate, latencyP95, requestsPerSec] = await Promise.all([
      this.datasourceSeries(expressions.errorRateExpr, "A", options),
      this.datasourceSeries(expressions.latencyP95Expr, "B", options),
      this.datasourceSeries(expressions.requestsPerSecExpr, "C", options)
    ]);

    const count = Math.min(errorRate.length, latencyP95.length, requestsPerSec.length);
    return Array.from({ length: count }, (_, index) => ({
      timestamp: errorRate[index]!.timestamp,
      errorRate: errorRate[index]!.value,
      latencyP95: latencyP95[index]!.value,
      requestsPerSec: requestsPerSec[index]!.value
    }));
  }

  async query(expr: string): Promise<Metrics> {
    if (expr !== "current") {
      throw new Error(`GrafanaMetricSource only supports the "current" query shape, got ${expr}.`);
    }
    const [errorRate, latencyP95, requestsPerSec] = await Promise.all([
      this.datasourceQuery(this.config.errorRateExpr, "A"),
      this.datasourceQuery(this.config.latencyP95Expr, "B"),
      this.datasourceQuery(this.config.requestsPerSecExpr, "C")
    ]);
    return this.createMetrics(errorRate, latencyP95, requestsPerSec);
  }

  async baseline(window: BaselineWindow): Promise<Metrics> {
    const expressions = this.baselineExpressions(window);
    const [errorRate, latencyP95, requestsPerSec] = await Promise.all([
      this.datasourceQuery(expressions.errorRateExpr, "A"),
      this.datasourceQuery(expressions.latencyP95Expr, "B"),
      this.datasourceQuery(expressions.requestsPerSecExpr, "C")
    ]);
    return this.createMetrics(errorRate, latencyP95, requestsPerSec);
  }

  async history(window: MetricHistoryWindow): Promise<{
    current: Metrics[];
    baseline: Metrics[];
  }> {
    const options = {
      rangeMinutes: window.rangeMinutes,
      stepMinutes: window.stepMinutes
    };
    const baselineExpressions = this.baselineExpressions({
      lookbackHours: window.baselineLookbackHours,
      sameHour: window.sameHour
    });
    const [current, baseline] = await Promise.all([
      this.collectSeries(
        {
          errorRateExpr: this.config.errorRateExpr,
          latencyP95Expr: this.config.latencyP95Expr,
          requestsPerSecExpr: this.config.requestsPerSecExpr
        },
        options
      ),
      this.collectSeries(baselineExpressions, options)
    ]);
    return { current, baseline };
  }

  async health(): Promise<AdapterHealth> {
    if (!this.config.url.trim()) {
      return degraded("Grafana URL is not configured.");
    }
    try {
      const baseUrl = this.config.url.replace(/\/+$/, "");
      const healthResponse = await fetch(`${baseUrl}/api/health`, {
        headers: this.headers()
      });
      if (!healthResponse.ok) {
        throw new Error(`Grafana health check failed with HTTP ${healthResponse.status}.`);
      }
      const metrics = await this.query("current");
      const dashboard = this.config.dashboardUid.trim()
        ? ` dashboard ${this.config.dashboardUid}`
        : "";
      return ready(
        `Grafana reachable via datasource ${this.config.datasourceUid || "unset"}${dashboard}. Current error rate ${(metrics.errorRate * 100).toFixed(2)}%.`
      );
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error));
    }
  }
}

export function createMetricSourceFromConfig(config: OperatorConfig): MetricSource {
  if (config.metricSource === "prometheus") {
    return new PrometheusMetricSource(config.prometheus);
  }
  if (config.metricSource === "grafana") {
    return new GrafanaMetricSource(config.grafana);
  }
  return defaultSimulatorMetricSource;
}

export function getConfiguredMetricSource(): MetricSource {
  const config = requireOperatorConfig();
  return createMetricSourceFromConfig(config);
}

export async function listIntegrationHealth(): Promise<
  Array<{ id: string; status: AdapterHealth["status"]; detail: string; checkedAt: number }>
> {
  const config = requireOperatorConfig();
  const metricSource = createMetricSourceFromConfig(config);
  const metricHealth = await metricSource.health();
  const brainHealth = await createDefaultJudgmentBrain({
    provider: config.judgmentProvider
  }).health();
  const deployHealth = await createDeployTargetFromConfig(config).health();

  const staticCheckedAt = Date.now();
  return [
    {
      id: "github",
      status: "ready",
      detail:
        config.trackedRepos.length > 0
          ? `Tracking ${config.trackedRepos.length} repository entries.`
          : "No tracked repositories configured yet.",
      checkedAt: staticCheckedAt
    },
    {
      id: "slack",
      status: config.slackChannel.trim() ? "ready" : "degraded",
      detail: config.slackChannel.trim()
        ? `Slack approval channel ${config.slackChannel} configured.`
        : "Slack channel is not configured.",
      checkedAt: staticCheckedAt
    },
    {
      id: "dashboard",
      status: "ready",
      detail: "Local dashboard API is available in-process.",
      checkedAt: staticCheckedAt
    },
    {
      id: "workspace",
      status: "ready",
      detail: "Workspace-backed SentinelOps state is available.",
      checkedAt: staticCheckedAt
    },
    {
      id: metricSource.id,
      status: metricHealth.status,
      detail: metricHealth.detail,
      checkedAt: metricHealth.checkedAt
    },
    {
      id: `judgment-${config.judgmentProvider}`,
      status: brainHealth.status,
      detail: brainHealth.detail,
      checkedAt: brainHealth.checkedAt
    },
    {
      id: `deploy-${config.deployTarget}`,
      status: deployHealth.status,
      detail: deployHealth.detail,
      checkedAt: deployHealth.checkedAt
    }
  ];
}
