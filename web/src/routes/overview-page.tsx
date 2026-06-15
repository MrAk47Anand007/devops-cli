import { Link } from "react-router-dom";
import { AutomationRunList } from "../components/automation-run-list";
import { DeployTimeline } from "../components/deploy-timeline";
import { LiveActivityPanel } from "../components/live-activity-panel";
import { RuntimeHealthPanel } from "../components/runtime-health-panel";
import { ServiceHealthPanel } from "../components/service-health-panel";
import { useLiveDashboardRefresh } from "../hooks/use-live-dashboard-refresh";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { fetchAutomationPipeline, fetchDeploys, fetchRuntimeLive, fetchServices } from "../lib/api";

export function OverviewPage(): JSX.Element {
  const live = useLiveDashboardRefresh();
  const servicesQuery = useDashboardQuery(fetchServices, [live.refreshToken]);
  const runtimeQuery = useDashboardQuery(fetchRuntimeLive, [live.refreshToken]);
  const deploysQuery = useDashboardQuery(fetchDeploys, [live.refreshToken]);
  const jobsQuery = useDashboardQuery(fetchAutomationPipeline, [live.refreshToken]);

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
          runtimeError={runtimeQuery.error}
          runtimeLoading={runtimeQuery.loading}
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
          health={runtimeQuery.data?.health ?? []}
          loading={runtimeQuery.loading}
          runtime={runtimeQuery.data}
        />
        <LiveActivityPanel
          connected={live.connected}
          error={live.error}
          lastEvent={live.lastEvent}
        />
        <AutomationRunList
          error={jobsQuery.error}
          items={jobsQuery.data?.items ?? []}
          loading={jobsQuery.loading}
        />
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Approvals</h2>
          <p className="mt-3 text-sm text-slate-300">
            Pending decisions are tracked in the live approvals workspace, mirrored from the same
            backend stream driving this control center.
          </p>
          <Link className="mt-4 inline-flex text-sm text-cyan-300 hover:text-cyan-200" to="/approvals">
            Open approvals workspace
          </Link>
        </div>
      </div>
    </section>
  );
}
