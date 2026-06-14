import { AutomationRunList } from "../components/automation-run-list";
import { DeployTimeline } from "../components/deploy-timeline";
import { RuntimeHealthPanel } from "../components/runtime-health-panel";
import { ServiceHealthPanel } from "../components/service-health-panel";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { fetchAutomationJobs, fetchDeploys, fetchRuntimeLive, fetchServices } from "../lib/api";

export function OverviewPage(): JSX.Element {
  const servicesQuery = useDashboardQuery(fetchServices);
  const runtimeQuery = useDashboardQuery(fetchRuntimeLive);
  const deploysQuery = useDashboardQuery(fetchDeploys);
  const jobsQuery = useDashboardQuery(fetchAutomationJobs);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">SentinelOps</p>
          <h1 className="mt-3 text-4xl font-semibold">SentinelOps Control Center</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            Live deploy signals, runtime health, approvals, and automation status from the
            real SentinelOps backend.
          </p>
        </div>
        <ServiceHealthPanel
          error={servicesQuery.error}
          loading={servicesQuery.loading}
          runtime={runtimeQuery.data}
          services={servicesQuery.data?.services ?? []}
        />
        <DeployTimeline
          deploys={deploysQuery.data?.deploys ?? []}
          error={deploysQuery.error}
          loading={deploysQuery.loading}
        />
      </div>

      <div className="grid gap-6">
        <RuntimeHealthPanel
          error={runtimeQuery.error}
          loading={runtimeQuery.loading}
          runtime={runtimeQuery.data}
        />
        <AutomationRunList
          error={jobsQuery.error}
          jobs={jobsQuery.data?.jobs ?? []}
          loading={jobsQuery.loading}
        />
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Approvals</h2>
          <p className="mt-3 text-sm text-slate-300">
            Pending decisions will appear here once the approvals inbox lands in the next slice.
          </p>
        </div>
      </div>
    </section>
  );
}
