import { useState } from "react";
import { ApprovalInbox } from "../components/approval-inbox";
import { LiveActivityPanel } from "../components/live-activity-panel";
import { useApprovalActions } from "../hooks/use-approval-actions";
import { useLiveDashboardRefresh } from "../hooks/use-live-dashboard-refresh";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { fetchApprovalDetail, fetchApprovals } from "../lib/api";
import type { ApprovalDetailResponse, PendingApproval } from "../lib/types";

export function ApprovalsPage(): JSX.Element {
  const live = useLiveDashboardRefresh(["automation.updated"]);
  const approvalsQuery = useDashboardQuery(fetchApprovals, [live.refreshToken]);
  const [dismissedRunIds, setDismissedRunIds] = useState<string[]>([]);
  const actions = useApprovalActions((runId) => {
    setDismissedRunIds((current) => [...current, runId]);
  });

  const approvals = (approvalsQuery.data?.approvals ?? []).filter(
    (approval) => !dismissedRunIds.includes(approval.runId)
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const activeRunId = approvals.find((approval) => approval.runId === selectedRunId)?.runId ?? approvals[0]?.runId ?? null;
  const detailQuery = useDashboardQuery<ApprovalDetailResponse | null>(
    () => (activeRunId ? fetchApprovalDetail(activeRunId) : Promise.resolve(null)),
    [activeRunId ?? "", live.refreshToken]
  );

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Approvals</p>
          <h1 className="mt-3 text-4xl font-semibold">Approvals Workspace</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            Review queued SentinelOps decisions, risk posture, and linked GitHub context before
            recording an operator outcome.
          </p>
        </div>
        <ApprovalInbox
          actionError={actions.error}
          approvals={approvals}
          error={approvalsQuery.error}
          loading={approvalsQuery.loading}
          onAction={actions.submit}
          pendingRunId={actions.pendingRunId}
          onSelect={setSelectedRunId}
          selectedRunId={activeRunId}
        />
        <ApprovalDetailPanel
          detail={detailQuery.data}
          error={detailQuery.error}
          loading={detailQuery.loading && Boolean(activeRunId)}
        />
      </div>
      <div className="grid gap-6">
        <LiveActivityPanel
          connected={live.connected}
          error={live.error}
          lastEvent={live.lastEvent}
        />
        <ApprovalsSummary approvals={approvals} />
      </div>
    </section>
  );
}

function ApprovalsSummary({ approvals }: { approvals: PendingApproval[] }): JSX.Element {
  return (
    <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <h2 className="text-lg font-medium">Decision history</h2>
      <p className="mt-2 text-sm text-slate-300">
        Pending approvals are grouped here by current risk so operators can prioritize the queue.
      </p>
      <div className="mt-4 grid gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Pending runs</p>
          <p className="mt-2 text-3xl font-semibold text-white">{approvals.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Highest risk</p>
          <p className="mt-2 text-sm text-white">
            {approvals[0]?.risk ? `${approvals[0].risk.level} (${approvals[0].risk.score})` : "None"}
          </p>
        </div>
      </div>
    </aside>
  );
}

function ApprovalDetailPanel({
  detail,
  loading,
  error
}: {
  detail: ApprovalDetailResponse | null;
  loading: boolean;
  error: Error | null;
}): JSX.Element {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div>
        <h2 className="text-lg font-medium">Approval evidence</h2>
        <p className="mt-2 text-sm text-slate-300">
          Full plan, test evidence, policy posture, and Slack preview for the selected run.
        </p>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading approval evidence...</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && !detail ? (
        <p className="mt-4 text-sm text-slate-300">Choose a run from the inbox to inspect its evidence package.</p>
      ) : null}

      {detail ? (
        <div className="mt-4 grid gap-4">
          <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{detail.summary}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">{detail.runId}</p>
              </div>
              {detail.risk ? (
                <span className="rounded-full border border-amber-400/30 px-2 py-1 text-xs uppercase tracking-[0.25em] text-amber-200">
                  {detail.risk.level} risk · {detail.risk.score}
                </span>
              ) : null}
            </div>
            {detail.githubTarget ? (
              <a
                className="mt-3 inline-flex text-sm text-cyan-300 hover:text-cyan-200"
                href={detail.githubTarget}
                rel="noreferrer"
                target="_blank"
              >
                Open GitHub target
              </a>
            ) : null}
          </article>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">Plan</h3>
              {detail.plan ? (
                <div className="mt-3 grid gap-3 text-sm text-slate-300">
                  <p>{detail.plan.summary}</p>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Steps</p>
                    <ul className="mt-2 grid gap-2">
                      {detail.plan.steps.map((step, index) => (
                        <li key={`${detail.runId}-step-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No plan package was recorded for this run.</p>
              )}
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">Policy posture</h3>
              {detail.policyViolations.length > 0 ? (
                <ul className="mt-3 grid gap-2 text-sm text-slate-300">
                  {detail.policyViolations.map((violation) => (
                    <li key={violation.id} className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                      <p className="font-medium text-white">{violation.id}</p>
                      <p className="mt-1">{violation.message}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-emerald-200">No current policy violations for this run.</p>
              )}
            </article>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">Test evidence</h3>
              {detail.tests.length > 0 ? (
                <ul className="mt-3 grid gap-2 text-sm text-slate-300">
                  {detail.tests.map((test, index) => (
                    <li key={`${detail.runId}-test-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <p className="font-medium text-white">{test.name}</p>
                      <p className="mt-1 capitalize">{test.status.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-slate-400">{test.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No test evidence was recorded for this run.</p>
              )}
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">Approval history</h3>
              {detail.approvals.length > 0 ? (
                <ul className="mt-3 grid gap-2 text-sm text-slate-300">
                  {detail.approvals.map((approval, index) => (
                    <li key={`${detail.runId}-approval-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <p className="font-medium text-white">
                        {approval.status.replaceAll("_", " ")} by {approval.by}
                      </p>
                      <p className="mt-1 text-slate-400">{approval.source} • {new Date(approval.at).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No operator decision has been recorded yet.</p>
              )}
            </article>
          </div>

          <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">Diff preview</h3>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-xs text-slate-300">
              {detail.diff || "No diff recorded."}
            </pre>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">Slack preview</h3>
            <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
              {detail.slackPreview}
            </pre>
          </article>
        </div>
      ) : null}
    </section>
  );
}
