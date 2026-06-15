import { LiveActivityPanel } from "../components/live-activity-panel";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { useLiveDashboardRefresh } from "../hooks/use-live-dashboard-refresh";
import {
  fetchAuditLog,
  fetchAuditRuns,
  fetchMemoryIncidents,
  fetchRepoMemory
} from "../lib/api";

export function MemoryPage(): JSX.Element {
  const live = useLiveDashboardRefresh([
    "automation.updated",
    "incident.created",
    "incident.updated",
    "config.updated",
    "deploy.created"
  ]);
  const auditLogQuery = useDashboardQuery(fetchAuditLog, [live.refreshToken]);
  const auditRunsQuery = useDashboardQuery(fetchAuditRuns, [live.refreshToken]);
  const repoMemoryQuery = useDashboardQuery(fetchRepoMemory, [live.refreshToken]);
  const incidentMemoryQuery = useDashboardQuery(fetchMemoryIncidents, [live.refreshToken]);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Audit & memory</p>
          <h1 className="mt-3 text-4xl font-semibold">Audit and Memory Workspace</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            Review append-only audit activity, recent operator runs, and incident memory that
            informs future SentinelOps judgment.
          </p>
        </div>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Recent audit events</h2>
          <p className="mt-2 text-sm text-slate-300">
            Append-only system activity from deploys, config changes, decisions, and overrides.
          </p>
          {auditLogQuery.error ? (
            <p className="mt-4 text-sm text-rose-300">{auditLogQuery.error.message}</p>
          ) : auditLogQuery.loading ? (
            <p className="mt-4 text-sm text-slate-300">Loading audit log...</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {(auditLogQuery.data?.entries ?? []).slice(-8).reverse().map((entry, index) => (
                <li key={`${entry.timestamp}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{entry.action}</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{entry.actor}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{entry.detail}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatTimestamp(entry.timestamp)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Repo memory</h2>
          <p className="mt-2 text-sm text-slate-300">
            Searchable run summaries captured for future repo-aware planning and automation.
          </p>
          {repoMemoryQuery.error ? (
            <p className="mt-4 text-sm text-rose-300">{repoMemoryQuery.error.message}</p>
          ) : repoMemoryQuery.loading ? (
            <p className="mt-4 text-sm text-slate-300">Loading repo memory...</p>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {(repoMemoryQuery.data?.entries ?? []).slice(0, 6).map((entry) => (
                <article key={entry.runId} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{entry.runId}</p>
                  <p className="mt-2 text-sm font-medium text-white">{entry.summary}</p>
                  <p className="mt-2 text-sm text-slate-300">
                    {entry.serviceId ?? "No service linked"}
                    {entry.githubTarget ? ` · ${entry.githubTarget}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.tags.map((tag) => (
                      <span
                        key={`${entry.runId}-${tag}`}
                        className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6">
        <LiveActivityPanel
          connected={live.connected}
          error={live.error}
          lastEvent={live.lastEvent}
        />

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Run audit trail</h2>
          {auditRunsQuery.error ? (
            <p className="mt-4 text-sm text-rose-300">{auditRunsQuery.error.message}</p>
          ) : auditRunsQuery.loading ? (
            <p className="mt-4 text-sm text-slate-300">Loading run summaries...</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {(auditRunsQuery.data?.runs ?? []).slice(0, 8).map((run) => (
                <li key={run.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-sm font-medium text-white">{run.id}</p>
                  <p className="mt-2 text-sm capitalize text-slate-300">{run.status.replaceAll("_", " ")}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatIso(run.updatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Incident memory</h2>
          <p className="mt-2 text-sm text-slate-300">
            Similar prior incidents and outcomes that can be surfaced back into judgment.
          </p>
          {incidentMemoryQuery.error ? (
            <p className="mt-4 text-sm text-rose-300">{incidentMemoryQuery.error.message}</p>
          ) : incidentMemoryQuery.loading ? (
            <p className="mt-4 text-sm text-slate-300">Loading incident memory...</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {(incidentMemoryQuery.data?.incidents ?? []).slice(-5).reverse().map((incident) => (
                <li key={incident.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-sm font-medium text-white">{incident.summary}</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Action: {incident.agentAction} at {incident.agentConfidence}% confidence
                  </p>
                  <p className="mt-2 text-sm text-slate-300">Outcome: {incident.outcome}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

function formatTimestamp(value: number): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

function formatIso(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
