import { useState } from "react";
import { LiveActivityPanel } from "../components/live-activity-panel";
import { ServiceHealthPanel } from "../components/service-health-panel";
import { RuntimeHealthPanel } from "../components/runtime-health-panel";
import { useLiveDashboardRefresh } from "../hooks/use-live-dashboard-refresh";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { fetchIntegrationHealth, fetchRuntimeLive, fetchServices } from "../lib/api";

export function IntegrationsPage(): JSX.Element {
  const live = useLiveDashboardRefresh([
    "integration.updated",
    "config.updated",
    "operator.toggled",
    "onboarding.updated"
  ]);
  const servicesQuery = useDashboardQuery(fetchServices, [live.refreshToken]);
  const runtimeQuery = useDashboardQuery(fetchRuntimeLive, [live.refreshToken]);
  const [healthRefreshCount, setHealthRefreshCount] = useState(0);
  const healthQuery = useDashboardQuery(fetchIntegrationHealth, [healthRefreshCount, live.refreshToken]);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Integrations</p>
          <h1 className="mt-3 text-4xl font-semibold">Integrations Workspace</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            External services, credentials posture, and integration health summaries from
            the operator runtime.
          </p>
        </div>
        <RuntimeHealthPanel
          error={healthQuery.error ?? runtimeQuery.error}
          health={healthQuery.data?.health ?? []}
          loading={runtimeQuery.loading || healthQuery.loading}
          onRefresh={() => {
            setHealthRefreshCount((current) => current + 1);
          }}
          refreshing={healthQuery.loading}
          runtime={runtimeQuery.data}
        />
      </div>
      <div className="grid gap-6">
        <ServiceHealthPanel
          error={servicesQuery.error}
          loading={servicesQuery.loading}
          runtimeError={runtimeQuery.error}
          runtimeLoading={runtimeQuery.loading}
          runtime={runtimeQuery.data}
          services={servicesQuery.data?.services ?? []}
        />
        <LiveActivityPanel
          connected={live.connected}
          error={live.error}
          lastEvent={live.lastEvent}
        />
      </div>
    </section>
  );
}
