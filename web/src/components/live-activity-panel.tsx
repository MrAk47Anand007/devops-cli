import type { DashboardEvent } from "../lib/types";

interface LiveActivityPanelProps {
  connected: boolean;
  error: Error | null;
  lastEvent: DashboardEvent | null;
}

export function LiveActivityPanel({
  connected,
  error,
  lastEvent
}: LiveActivityPanelProps): JSX.Element {
  const statusLabel = connected ? "Live" : error ? "Reconnect needed" : "Waiting";
  const statusClasses = connected
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
    : error
      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
      : "border-slate-700 bg-slate-950/70 text-slate-300";

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Live stream</p>
          <h2 className="mt-3 text-lg font-medium">Operator event feed</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.25em] ${statusClasses}`}>
          {statusLabel}
        </span>
      </div>

      <p className="mt-3 text-sm text-slate-300">
        {error
          ? error.message
          : lastEvent
            ? lastEvent.detail
            : "Waiting for the next deployment, approval, or config update from the backend."}
      </p>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Last event</p>
        <p className="mt-2 text-white">{lastEvent?.type ?? "No events yet"}</p>
        <p className="mt-1 text-xs text-slate-400">
          {lastEvent
            ? new Date(lastEvent.at).toLocaleString()
            : "Stream opens when the browser connects."}
        </p>
      </div>
    </section>
  );
}
