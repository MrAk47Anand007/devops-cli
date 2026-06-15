import type { IntegrationHealth, RuntimeLiveResponse } from "../lib/types";

export function RuntimeHealthPanel({
  health,
  runtime,
  loading,
  error,
  refreshLabel,
  refreshing,
  onRefresh
}: {
  health?: IntegrationHealth[];
  runtime: RuntimeLiveResponse | null;
  loading: boolean;
  error: Error | null;
  refreshLabel?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}): JSX.Element {
  const effectiveHealth = (health ?? []).length > 0 ? (health ?? []) : runtime?.health ?? [];

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Runtime health</h2>
          <p className="mt-2 text-sm text-slate-300">
            Live adapter readiness, deploy target state, and backend runtime snapshots.
          </p>
        </div>
        {onRefresh ? (
          <button
            className="rounded-full border border-cyan-400/30 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(refreshing)}
            onClick={onRefresh}
            type="button"
          >
            {refreshing ? "Testing..." : "Test connections"}
          </button>
        ) : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading runtime health...</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && effectiveHealth.length === 0 ? (
        <p className="mt-4 text-sm text-slate-300">No integration health checks are available yet.</p>
      ) : null}

      {effectiveHealth.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {effectiveHealth.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{entry.id}</p>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                  {entry.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{entry.detail}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                Checked {refreshLabel ?? new Date(entry.checkedAt).toLocaleTimeString()}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
