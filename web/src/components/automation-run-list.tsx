import type { AutomationPipelineItem, PipelineStage } from "../lib/types";

function stageTone(status: PipelineStage["status"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "active":
      return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
    case "blocked":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "failed":
      return "border-rose-500/30 bg-rose-500/10 text-rose-100";
    default:
      return "border-slate-700 bg-slate-950/60 text-slate-300";
  }
}

function guardTone(status: AutomationPipelineItem["guard"]["status"]): string {
  return status === "passed"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
    : "border-amber-500/30 bg-amber-500/10 text-amber-100";
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatEventLabel(kind: AutomationPipelineItem["events"][number]["kind"]): string {
  return kind.replaceAll(".", " ");
}

export function AutomationRunList({
  items,
  loading,
  error
}: {
  items: AutomationPipelineItem[];
  loading: boolean;
  error: Error | null;
}): JSX.Element {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Automation pipeline</h2>
          <p className="mt-2 text-sm text-slate-300">
            Each autonomous run broken into intake, approval, execution, and guard stages.
          </p>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading automation pipeline...</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-300">No automation jobs are queued right now.</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-4 grid gap-4">
          {items.map((item) => (
            <li key={item.job.id} className="rounded-[28px] border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">{item.job.serviceId}</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">{item.summary}</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    {item.job.id} • updated {formatDateTime(item.job.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-200">
                    {item.job.status.replaceAll("_", " ")}
                  </span>
                  {item.risk ? (
                    <span className="rounded-full border border-amber-400/30 px-3 py-1 text-xs uppercase tracking-[0.25em] text-amber-200">
                      {item.risk.level} risk • {item.risk.score}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {item.stages.map((stage) => (
                  <article key={stage.id} className={`rounded-2xl border p-4 ${stageTone(stage.status)}`}>
                    <p className="text-xs uppercase tracking-[0.25em] opacity-80">{stage.label}</p>
                    <p className="mt-3 text-sm font-medium capitalize">{stage.status}</p>
                    <p className="mt-2 text-sm opacity-90">{stage.detail}</p>
                  </article>
                ))}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="grid gap-4">
                  <article className={`rounded-2xl border p-4 ${guardTone(item.guard.status)}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.25em]">Guard result</h4>
                      <span className="text-xs uppercase tracking-[0.25em]">{item.guard.status}</span>
                    </div>
                    <p className="mt-3 text-sm">{item.guard.summary}</p>
                    {item.guard.violations.length > 0 ? (
                      <p className="mt-3 text-xs uppercase tracking-[0.25em] opacity-80">
                        Violations: {item.guard.violations.join(", ")}
                      </p>
                    ) : null}
                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">
                      Agent execution
                    </h4>
                    {item.job.execution ? (
                      <div className="mt-3 grid gap-2 text-sm text-slate-300">
                        <p>{item.job.execution.summary}</p>
                        <p>
                          Command: <span className="text-white">{item.job.execution.command}</span>
                        </p>
                        <p>
                          Exit code: <span className="text-white">{item.job.execution.exitCode}</span>
                        </p>
                        <p className="break-all">
                          Transcript: <span className="text-white">{item.job.execution.transcriptPath}</span>
                        </p>
                        {item.transcriptPreview ? (
                          <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                              Transcript preview
                            </p>
                            <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-300">
                              {item.transcriptPreview}
                            </pre>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                            Transcript preview unavailable.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">No transcript has been captured yet.</p>
                    )}
                  </article>
                </div>

                <div className="grid gap-4">
                  <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">
                      Approval history
                    </h4>
                    {item.approvals.length > 0 ? (
                      <ul className="mt-3 grid gap-3 text-sm text-slate-300">
                        {item.approvals.map((approval, index) => (
                          <li key={`${approval.at}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                            <p className="font-medium text-white">
                              {approval.status.replaceAll("_", " ")} by {approval.by}
                            </p>
                            <p className="mt-1 text-slate-400">
                              {approval.source} • {formatDateTime(approval.at)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">No approval decisions recorded yet.</p>
                    )}
                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">
                      Evidence
                    </h4>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300">
                      <p>
                        Tests: <span className="text-white">{item.testSummary.passed} passed</span>,
                        {" "}<span className="text-white">{item.testSummary.failed} failed</span>,
                        {" "}<span className="text-white">{item.testSummary.notRun} not run</span>
                      </p>
                      <p>
                        Events recorded: <span className="text-white">{item.events.length}</span>
                      </p>
                      <a
                        className="inline-flex text-cyan-300 hover:text-cyan-200"
                        href={item.githubTarget ?? item.job.githubIssueUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open GitHub target
                      </a>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">
                      Event feed
                    </h4>
                    {item.events.length > 0 ? (
                      <ul className="mt-3 grid gap-3 text-sm text-slate-300">
                        {item.events.map((event) => (
                          <li
                            key={event.id}
                            className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                          >
                            <p className="font-medium text-white capitalize">
                              {formatEventLabel(event.kind)}
                            </p>
                            <p className="mt-1 text-slate-400">{formatDateTime(event.at)}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">
                        No pipeline events have been recorded yet.
                      </p>
                    )}
                  </article>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
