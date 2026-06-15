import type { PendingApproval } from "../lib/types";

export function ApprovalInbox({
  approvals,
  loading,
  error,
  actionError,
  pendingRunId,
  onAction,
  onSelect,
  selectedRunId
}: {
  approvals: PendingApproval[];
  loading: boolean;
  error: Error | null;
  actionError: Error | null;
  pendingRunId: string | null;
  onAction: (runId: string, action: "approve" | "hold" | "reject") => Promise<void>;
  onSelect?: (runId: string) => void;
  selectedRunId?: string | null;
}): JSX.Element {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Approvals inbox</h2>
          <p className="mt-2 text-sm text-slate-300">
            Review the current risk package before letting an operator action proceed.
          </p>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading approvals...</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error.message}
        </p>
      ) : null}
      {actionError ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {actionError.message}
        </p>
      ) : null}
      {!loading && !error && approvals.length === 0 ? (
        <p className="mt-4 text-sm text-slate-300">No approvals are waiting right now.</p>
      ) : null}

      {approvals.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {approvals.map((approval) => {
            const isPending = pendingRunId === approval.runId;

            return (
              <li
                key={approval.runId}
                className={`rounded-2xl border bg-slate-950/70 p-4 ${
                  selectedRunId === approval.runId
                    ? "border-cyan-400/40"
                    : "border-slate-800"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{approval.summary}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                      {approval.runId}
                    </p>
                  </div>
                  {approval.risk ? (
                    <span className="rounded-full border border-amber-400/30 px-2 py-1 text-xs uppercase tracking-[0.25em] text-amber-200">
                      {approval.risk.level} risk · {approval.risk.score}
                    </span>
                  ) : null}
                </div>
                {approval.githubTarget ? (
                  <a
                    className="mt-3 inline-flex text-sm text-cyan-300 hover:text-cyan-200"
                    href={approval.githubTarget}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open GitHub target
                  </a>
                ) : null}
                {onSelect ? (
                  <button
                    className="mt-3 inline-flex text-sm text-slate-300 hover:text-white"
                    onClick={() => onSelect(approval.runId)}
                    type="button"
                  >
                    Review evidence
                  </button>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="rounded-full border border-emerald-400/30 px-4 py-2 text-sm text-emerald-200 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending}
                    onClick={() => void onAction(approval.runId, "approve")}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="rounded-full border border-amber-400/30 px-4 py-2 text-sm text-amber-200 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending}
                    onClick={() => void onAction(approval.runId, "hold")}
                    type="button"
                  >
                    Hold
                  </button>
                  <button
                    className="rounded-full border border-rose-400/30 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending}
                    onClick={() => void onAction(approval.runId, "reject")}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
