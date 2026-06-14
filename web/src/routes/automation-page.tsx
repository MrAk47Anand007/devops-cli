import { AutomationRunList } from "../components/automation-run-list";
import { DeployTimeline } from "../components/deploy-timeline";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { fetchAutomationJobs, fetchDeploys } from "../lib/api";

export function AutomationPage(): JSX.Element {
  const jobsQuery = useDashboardQuery(fetchAutomationJobs);
  const deploysQuery = useDashboardQuery(fetchDeploys);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Automation</p>
          <h1 className="mt-3 text-4xl font-semibold">Automation Workspace</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            Queued runs, recovery automations, and pipeline control surfaces from the
            SentinelOps backend.
          </p>
        </div>
        <AutomationRunList
          error={jobsQuery.error}
          jobs={jobsQuery.data?.jobs ?? []}
          loading={jobsQuery.loading}
        />
      </div>
      <DeployTimeline
        deploys={deploysQuery.data?.deploys ?? []}
        error={deploysQuery.error}
        loading={deploysQuery.loading}
      />
    </section>
  );
}
