import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GrafanaMetricSource,
  PrometheusMetricSource,
  createMetricSourceFromConfig,
  listIntegrationHealth
} from "../src/core/metric-sources.js";
import { saveOperatorConfig } from "../src/core/operator-config.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("metric sources", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-metric-sources-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    vi.unstubAllGlobals();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("queries Prometheus-backed current metrics", async () => {
    const source = new PrometheusMetricSource({
      url: "http://prometheus.local",
      errorRateExpr: "error_rate",
      latencyP95Expr: "latency_p95",
      requestsPerSecExpr: "rps",
      baselineErrorRateExpr: "",
      baselineLatencyP95Expr: "",
      baselineRequestsPerSecExpr: "",
      baselineLookbackHours: 168
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        const query = new URL(url).searchParams.get("query");
        const value =
          query === "error_rate" ? "0.032" : query === "latency_p95" ? "420" : query === "rps" ? "582" : "0";
        return new Response(
          JSON.stringify({
            status: "success",
            data: {
              result: [{ value: [Date.now(), value] }]
            }
          }),
          { status: 200 }
        );
      })
    );

    const metrics = await source.query("current");
    expect(metrics.errorRate).toBe(0.032);
    expect(metrics.latencyP95).toBe(420);
    expect(metrics.requestsPerSec).toBe(582);
  });

  it("queries Grafana-backed current metrics", async () => {
    const source = new GrafanaMetricSource({
      url: "http://grafana.local",
      token: "token",
      datasourceUid: "prom-main",
      dashboardUid: "svc-api",
      errorRateExpr: "error_rate",
      latencyP95Expr: "latency_p95",
      requestsPerSecExpr: "rps",
      baselineErrorRateExpr: "",
      baselineLatencyP95Expr: "",
      baselineRequestsPerSecExpr: "",
      baselineLookbackHours: 168
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/api/health")) {
          return new Response(JSON.stringify({ database: "ok" }), { status: 200 });
        }
        const payload = JSON.parse(String(init?.body)) as {
          queries: Array<{ refId: string; expr: string }>;
        };
        const refId = payload.queries[0]?.refId;
        const expr = payload.queries[0]?.expr;
        const value =
          expr === "error_rate" ? 0.014 : expr === "latency_p95" ? 231 : expr === "rps" ? 701 : 0;
        return new Response(
          JSON.stringify({
            results: {
              [refId]: {
                frames: [
                  {
                    data: {
                      values: [[Date.now()], [value]]
                    }
                  }
                ]
              }
            }
          }),
          { status: 200 }
        );
      })
    );

    const metrics = await source.query("current");
    expect(metrics.errorRate).toBe(0.014);
    expect(metrics.latencyP95).toBe(231);
    expect(metrics.requestsPerSec).toBe(701);
    expect((await source.health()).status).toBe("ready");
  });

  it("reports configured integration health for Prometheus mode", async () => {
    saveOperatorConfig({
      trackedRepos: ["example/repo"],
      slackChannel: "#ops",
      agentCommand: "codex",
      agentArgs: ["exec", "--json"],
      metricSource: "prometheus",
      prometheus: {
        url: "http://prometheus.local",
        errorRateExpr: "error_rate",
        latencyP95Expr: "latency_p95",
        requestsPerSecExpr: "rps"
      },
      enabled: true
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "success",
            data: {
              result: [{ value: [Date.now(), "0.02"] }]
            }
          }),
          { status: 200 }
        )
      )
    );

    const source = createMetricSourceFromConfig(
      saveOperatorConfig({
        trackedRepos: ["example/repo"],
        slackChannel: "#ops",
        agentCommand: "codex",
        agentArgs: ["exec", "--json"],
        metricSource: "prometheus",
        prometheus: {
          url: "http://prometheus.local",
          errorRateExpr: "error_rate",
          latencyP95Expr: "latency_p95",
          requestsPerSecExpr: "rps"
        },
        enabled: true
      })
    );
    expect(source.id).toBe("prometheus");

    const health = await listIntegrationHealth();
    expect(health.some((entry) => entry.id === "prometheus" && entry.status === "ready")).toBe(true);
  });
});
