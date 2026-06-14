import type { IncidentRecord } from "../lib/types";

export function IncidentDetailPanel({
  incident,
  loading,
  error
}: {
  incident: IncidentRecord | null;
  loading: boolean;
  error: Error | null;
}): JSX.Element {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <h2 className="text-lg font-medium">Incident detail</h2>
      <p className="mt-2 text-sm text-slate-300">
        Current incident state, service linkage, and GitHub escalation references.
      </p>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading incident detail...</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && !incident ? (
        <p className="mt-4 text-sm text-slate-300">Select an incident to inspect its details.</p>
      ) : null}

      {incident ? (
        <div className="mt-4 grid gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm font-semibold text-white">{incident.summary}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-400">
              {incident.serviceId}
            </p>
            <p className="mt-3 text-sm text-slate-300">Status: {incident.status}</p>
            <p className="mt-2 text-sm text-slate-300">{formatTimestamp(incident.timestamp)}</p>
          </div>
          {incident.linkedGithub?.issueUrl ? (
            <a
              className="inline-flex text-sm text-cyan-300 hover:text-cyan-200"
              href={incident.linkedGithub.issueUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open linked GitHub issue
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
