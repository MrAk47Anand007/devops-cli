import type { AutomationJob } from "../lib/types";

export function AutomationRunList({
  jobs,
  loading,
  error
}: {
  jobs: AutomationJob[];
  loading: boolean;
  error: Error | null;
}): JSX.Element {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Automation queue</h2>
          <p className="mt-2 text-sm text-slate-300">
            Active agent runs, pending approvals, and automation intake from the backend.
          </p>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading automation jobs...</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && jobs.length === 0 ? (
        <p className="mt-4 text-sm text-slate-300">No automation jobs are queued right now.</p>
      ) : null}

      {jobs.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{job.serviceId}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                    {job.id}
                  </p>
                </div>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
                  {job.status.replaceAll("_", " ")}
                </span>
              </div>
              <a
                className="mt-3 inline-flex text-sm text-cyan-300 hover:text-cyan-200"
                href={job.githubIssueUrl}
                rel="noreferrer"
                target="_blank"
              >
                View GitHub issue
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
