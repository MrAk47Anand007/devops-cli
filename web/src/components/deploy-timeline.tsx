import type { DeployRecord } from "../lib/types";

export function DeployTimeline({
  deploys,
  loading,
  error
}: {
  deploys: DeployRecord[];
  loading: boolean;
  error: Error | null;
}): JSX.Element {
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
        <ol className="mt-4 grid gap-3">
          {deploys.map((deploy) => (
            <li key={deploy.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{deploy.version}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                    {deploy.serviceId}
                  </p>
                </div>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                  {deploy.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{formatTimestamp(deploy.timestamp)}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
