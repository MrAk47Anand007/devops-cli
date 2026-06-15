import { useEffect, useState } from "react";
import type { DeployRecord } from "../lib/types";

function statusTone(status: DeployRecord["status"]): string {
  switch (status) {
    case "healthy":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "failed":
      return "border-rose-500/30 bg-rose-500/10 text-rose-100";
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
}

function judgmentTone(action: "rollback" | "hold"): string {
  return action === "rollback"
    ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
    : "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatLatency(value: number): string {
  return `${Math.round(value)} ms`;
}

function formatThroughput(value: number): string {
  return `${value.toFixed(1)} req/s`;
}

export function DeployTimeline({
  deploys,
  loading,
  error
}: {
  deploys: DeployRecord[];
  loading: boolean;
  error: Error | null;
}): JSX.Element {
  const [selectedDeployId, setSelectedDeployId] = useState<string | null>(null);

  useEffect(() => {
    if (deploys.length === 0) {
      setSelectedDeployId(null);
      return;
    }

    setSelectedDeployId((current) => {
      if (current && deploys.some((deploy) => deploy.id === current)) {
        return current;
      }
      return deploys[0]!.id;
    });
  }, [deploys]);

  const selectedDeploy = deploys.find((deploy) => deploy.id === selectedDeployId) ?? deploys[0] ?? null;

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div>
        <h2 className="text-lg font-medium">Deploy timeline</h2>
        <p className="mt-2 text-sm text-slate-300">
          Recent deploy records and version changes reported by the dashboard backend.
        </p>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading deploy activity...</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && deploys.length === 0 ? (
        <p className="mt-4 text-sm text-slate-300">No deploy events have been recorded yet.</p>
      ) : null}

      {deploys.length > 0 ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <ol className="grid gap-3">
            {deploys.map((deploy) => {
              const isSelected = deploy.id === selectedDeploy?.id;
              return (
                <li key={deploy.id}>
                  <button
                    className={`w-full rounded-[28px] border p-5 text-left transition ${
                      isSelected
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-slate-800 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-950/90"
                    }`}
                    onClick={() => {
                      setSelectedDeployId(deploy.id);
                    }}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{deploy.version}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                          {deploy.serviceId}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs uppercase tracking-[0.25em] ${statusTone(deploy.status)}`}
                      >
                        {deploy.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                      <p>{formatTimestamp(deploy.timestamp)}</p>
                      {deploy.target ? <p>Target: {deploy.target}</p> : null}
                    </div>
                    {deploy.judgment ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.25em]">
                        <span className={`rounded-full border px-2 py-1 ${judgmentTone(deploy.judgment.decision.action)}`}>
                          {deploy.judgment.decision.action}
                        </span>
                        <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">
                          {deploy.judgment.decision.confidence}%
                        </span>
                        <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">
                          {deploy.judgment.mode === "autonomous" ? "Autonomous" : "Review"}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-400">
                        No judgment snapshot was captured for this deploy event yet.
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {selectedDeploy ? (
            <DeployDetail deploy={selectedDeploy} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DeployDetail({ deploy }: { deploy: DeployRecord }): JSX.Element {
  if (!deploy.judgment) {
    return (
      <article className="rounded-[28px] border border-slate-800 bg-slate-950/70 p-6">
        <h3 className="text-lg font-medium text-white">Deploy detail</h3>
        <p className="mt-3 text-sm text-slate-300">
          This deploy event has not captured a judgment package yet.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-[28px] border border-slate-800 bg-slate-950/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Deploy detail</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">{deploy.version}</h3>
          <p className="mt-2 text-sm text-slate-300">
            {deploy.serviceId} {deploy.target ? `• ${deploy.target}` : ""}
          </p>
        </div>
        <div className="grid gap-2 text-right text-xs uppercase tracking-[0.25em] text-slate-400">
          <span>{formatTimestamp(deploy.timestamp)}</span>
          <span>{deploy.judgment.metricSourceId}</span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <article className={`rounded-2xl border p-4 ${judgmentTone(deploy.judgment.decision.action)}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.25em]">Agent judgment</h4>
            <span className="text-xs uppercase tracking-[0.25em]">
              {deploy.judgment.decision.action} • {deploy.judgment.decision.confidence}%
            </span>
          </div>
          <p className="mt-3 text-sm">{deploy.judgment.decision.reasoning}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.25em]">
            <span className="rounded-full border border-current/40 px-2 py-1">
              {deploy.judgment.mode === "autonomous" ? "Autonomous threshold met" : "Needs operator review"}
            </span>
            {deploy.judgment.decision.similarIncidentId ? (
              <span className="rounded-full border border-current/40 px-2 py-1">
                Similar incident {deploy.judgment.decision.similarIncidentId}
              </span>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">
            Snapshot metrics
          </h4>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricValue label="Error rate" value={formatPercent(deploy.judgment.metrics.errorRate)} />
            <MetricValue label="P95 latency" value={formatLatency(deploy.judgment.metrics.latencyP95)} />
            <MetricValue label="Traffic" value={formatThroughput(deploy.judgment.metrics.requestsPerSec)} />
          </dl>
          <p className="mt-4 text-xs uppercase tracking-[0.25em] text-slate-500">
            Captured {formatTimestamp(deploy.judgment.capturedAt)}
          </p>
        </article>
      </div>

      <article className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">Evidence</h4>
          <span className="text-xs uppercase tracking-[0.25em] text-slate-500">
            {deploy.judgment.decision.evidence.length} items
          </span>
        </div>
        <ul className="mt-3 grid gap-2 text-sm text-slate-300">
          {deploy.judgment.decision.evidence.map((evidence, index) => (
            <li
              key={`${deploy.id}-evidence-${index}`}
              className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              {evidence}
            </li>
          ))}
        </ul>
      </article>
    </article>
  );
}

function MetricValue({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
