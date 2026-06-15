import { AutomationRunList } from "../components/automation-run-list";
import { DeployTimeline } from "../components/deploy-timeline";
import { LiveActivityPanel } from "../components/live-activity-panel";
import { useLiveDashboardRefresh } from "../hooks/use-live-dashboard-refresh";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { fetchAutomationPipeline, fetchDeploys } from "../lib/api";

export function AutomationPage(): JSX.Element {
  const live = useLiveDashboardRefresh(["automation.updated", "deploy.created", "incident.created"]);
  const jobsQuery = useDashboardQuery(fetchAutomationPipeline, [live.refreshToken]);
  const deploysQuery = useDashboardQuery(fetchDeploys, [live.refreshToken]);

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
      </div>
      <DeployTimeline
        deploys={deploysQuery.data?.deploys ?? []}
        error={deploysQuery.error}
        loading={deploysQuery.loading}
      />
    </section>
  );
}
