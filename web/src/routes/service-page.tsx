import { Link, useParams } from "react-router-dom";
import { LiveActivityPanel } from "../components/live-activity-panel";
import { useLiveDashboardRefresh } from "../hooks/use-live-dashboard-refresh";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { fetchServiceMetrics } from "../lib/api";
import type { ServiceMetricDelta, ServiceMetricsResponse } from "../lib/types";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatLatency(value: number): string {
  return `${Math.round(value)} ms`;
}

function formatThroughput(value: number): string {
  return `${value.toFixed(1)} req/s`;
}

function formatDelta(delta: ServiceMetricDelta, positiveLabel: string, negativeLabel: string): string {
  if (delta.direction === "flat") {
    return "On baseline";
  }

  const directionLabel = delta.direction === "up" ? positiveLabel : negativeLabel;
  const percent = delta.percent === null ? "" : ` (${Math.abs(delta.percent).toFixed(1)}%)`;
  return `${directionLabel}${percent}`;
}

function metricTone(delta: ServiceMetricDelta, inverted = false): string {
  if (delta.direction === "flat") {
    return "border-slate-700 bg-slate-950/70 text-slate-200";
  }

  const isWorse = inverted ? delta.direction === "down" : delta.direction === "up";
  return isWorse
    ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildLinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function MetricTrendChart({
  title,
  description,
  currentLabel,
  baselineLabel,
  currentValues,
  baselineValues,
  formatter,
  timestamps
}: {
  title: string;
  description: string;
  currentLabel: string;
  baselineLabel: string;
  currentValues: number[];
  baselineValues: number[];
  formatter: (value: number) => string;
  timestamps: number[];
}): JSX.Element {
  const width = 320;
  const height = 120;
  const currentPath = buildLinePath(currentValues, width, height);
  const baselinePath = buildLinePath(baselineValues, width, height);
  const latestCurrent = currentValues.at(-1) ?? 0;
  const latestBaseline = baselineValues.at(-1) ?? 0;

  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="mt-2 text-sm text-slate-300">{description}</p>
        </div>
        <div className="grid gap-2 text-right text-sm text-slate-300">
          <span className="text-white">{currentLabel}: {formatter(latestCurrent)}</span>
          <span>{baselineLabel}: {formatter(latestBaseline)}</span>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
        <svg
          aria-label={`${title} trend chart`}
          className="h-auto w-full"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <path d={baselinePath} fill="none" stroke="rgba(148,163,184,0.9)" strokeDasharray="6 6" strokeWidth="3" />
          <path d={currentPath} fill="none" stroke="rgba(34,211,238,0.95)" strokeWidth="4" />
        </svg>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.25em] text-slate-500">
          <span>{timestamps[0] ? formatTime(timestamps[0]) : "Start"}</span>
          <span>Last hour</span>
          <span>{timestamps.at(-1) ? formatTime(timestamps.at(-1)!) : "Now"}</span>
        </div>
      </div>
    </article>
  );
}

function MetricComparisonCard({
  label,
  current,
  baseline,
  delta,
  formatter,
  positiveLabel,
  negativeLabel,
  inverted
}: {
  label: string;
  current: number;
  baseline: number;
  delta: ServiceMetricDelta;
  formatter: (value: number) => string;
  positiveLabel: string;
  negativeLabel: string;
  inverted?: boolean;
}): JSX.Element {
  return (
    <article className={`rounded-3xl border p-5 shadow-panel ${metricTone(delta, inverted)}`}>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
      <p className="mt-4 text-3xl font-semibold">{formatter(current)}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-cyan-300"
          style={{
            width: `${Math.min(100, Math.max(18, baseline === 0 ? 100 : (current / Math.max(current, baseline)) * 100))}%`
          }}
        />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span>Baseline {formatter(baseline)}</span>
        <span>{formatDelta(delta, positiveLabel, negativeLabel)}</span>
      </div>
    </article>
  );
}

export function ServicePage(): JSX.Element {
  const { serviceId } = useParams();
  const live = useLiveDashboardRefresh([
    "deploy.created",
    "incident.created",
    "incident.updated",
    "alert.created",
    "log.created",
    "scenario.loaded",
    "integration.updated",
    "config.updated"
  ]);
  const metricsQuery = useDashboardQuery<ServiceMetricsResponse | null>(
    () => (serviceId ? fetchServiceMetrics(serviceId) : Promise.resolve(null)),
    [serviceId ?? "", live.refreshToken]
  );

  const snapshot = metricsQuery.data;
  const series = snapshot?.series ?? [];
  const timestamps = series.map((point) => point.timestamp);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Services</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold">
                {snapshot?.service.name ?? serviceId ?? "Service"} workspace
              </h1>
              <p className="mt-4 max-w-2xl text-sm text-slate-300">
                Compare current runtime metrics against the rolling baseline, then pivot back to
                the overview when the service stabilizes.
              </p>
            </div>
            <Link className="text-sm text-cyan-300 hover:text-cyan-200" to="/">
              Back to overview
            </Link>
          </div>
        </div>

        {metricsQuery.error ? (
          <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-100">
            {metricsQuery.error.message}
          </div>
        ) : metricsQuery.loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-300 shadow-panel">
            Loading service metrics...
          </div>
        ) : snapshot ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricComparisonCard
                baseline={snapshot.baseline.errorRate}
                current={snapshot.current.errorRate}
                delta={snapshot.delta.errorRate}
                formatter={formatPercent}
                label="Error rate"
                negativeLabel="Improving"
                positiveLabel="Above baseline"
              />
              <MetricComparisonCard
                baseline={snapshot.baseline.latencyP95}
                current={snapshot.current.latencyP95}
                delta={snapshot.delta.latencyP95}
                formatter={formatLatency}
                label="P95 latency"
                negativeLabel="Recovering"
                positiveLabel="Slower than baseline"
              />
              <MetricComparisonCard
                baseline={snapshot.baseline.requestsPerSec}
                current={snapshot.current.requestsPerSec}
                delta={snapshot.delta.requestsPerSec}
                formatter={formatThroughput}
                inverted
                label="Traffic"
                negativeLabel="Traffic higher"
                positiveLabel="Traffic lower"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <MetricTrendChart
                baselineLabel="Baseline"
                baselineValues={series.map((point) => point.errorRateBaseline)}
                currentLabel="Current"
                currentValues={series.map((point) => point.errorRate)}
                description="Live error rate against the rolling baseline for this service."
                formatter={formatPercent}
                timestamps={timestamps}
                title="Error trend"
              />
              <MetricTrendChart
                baselineLabel="Baseline"
                baselineValues={series.map((point) => point.latencyP95Baseline)}
                currentLabel="Current"
                currentValues={series.map((point) => point.latencyP95)}
                description="P95 latency movement across the latest observation window."
                formatter={formatLatency}
                timestamps={timestamps}
                title="Latency trend"
              />
              <MetricTrendChart
                baselineLabel="Baseline"
                baselineValues={series.map((point) => point.requestsPerSecBaseline)}
                currentLabel="Current"
                currentValues={series.map((point) => point.requestsPerSec)}
                description="Traffic trend so operators can judge whether load is falling away from normal."
                formatter={formatThroughput}
                timestamps={timestamps}
                title="Traffic trend"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
              <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
                <h2 className="text-lg font-medium">Runtime posture</h2>
                <dl className="mt-4 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Environment</dt>
                    <dd className="mt-2 text-base text-white">{snapshot.service.environment}</dd>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Health</dt>
                    <dd className="mt-2 text-base text-white">{snapshot.service.health}</dd>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Current revision</dt>
                    <dd className="mt-2 break-all text-base text-white">
                      {snapshot.runtime.revision ?? "Not available"}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Deploy state</dt>
                    <dd className="mt-2 text-base text-white">
                      {snapshot.runtime.deployState ?? "Not reported"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-sm text-slate-400">{snapshot.runtime.revisionDetail}</p>
              </article>

              <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
                <h2 className="text-lg font-medium">Metric source</h2>
                <p className="mt-4 text-sm text-slate-300">
                  Live values are coming from <span className="text-white">{snapshot.metricSourceId}</span>,
                  compared against a rolling {snapshot.baselineLookbackHours}-hour baseline window.
                </p>
                <p className="mt-4 text-sm text-slate-400">
                  Updated {new Date(snapshot.updatedAt).toLocaleString()}
                </p>
              </article>
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-300 shadow-panel">
            Choose a service from the overview to inspect its metrics.
          </div>
        )}
      </div>

      <div className="grid gap-6">
        <LiveActivityPanel
          connected={live.connected}
          error={live.error}
          lastEvent={live.lastEvent}
        />
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Operator notes</h2>
          <p className="mt-3 text-sm text-slate-300">
            Use this view to judge whether the latest revision is drifting away from the rolling
            baseline before moving into incident handling or rollback.
          </p>
        </div>
      </div>
    </section>
  );
}
