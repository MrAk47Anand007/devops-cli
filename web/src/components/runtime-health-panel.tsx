import type { RuntimeLiveResponse } from "../lib/types";

export function RuntimeHealthPanel({
  runtime,
  loading,
  error
}: {
  runtime: RuntimeLiveResponse | null;
  loading: boolean;
  error: Error | null;
}): JSX.Element {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div>
        <h2 className="text-lg font-medium">Runtime health</h2>
        <p className="mt-2 text-sm text-slate-300">
          Live adapter readiness, deploy target state, and backend runtime snapshots.
        </p>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading runtime health...</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && runtime && runtime.health.length === 0 ? (
        <p className="mt-4 text-sm text-slate-300">No integration health checks are available yet.</p>
      ) : null}

      {runtime ? (
        <div className="mt-4 grid gap-3">
          {runtime.health.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{entry.id}</p>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                  {entry.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{entry.detail}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
