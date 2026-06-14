import { ServiceHealthPanel } from "../components/service-health-panel";
import { RuntimeHealthPanel } from "../components/runtime-health-panel";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import { fetchRuntimeLive, fetchServices } from "../lib/api";

export function IntegrationsPage(): JSX.Element {
  const servicesQuery = useDashboardQuery(fetchServices);
  const runtimeQuery = useDashboardQuery(fetchRuntimeLive);

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
          error={runtimeQuery.error}
          loading={runtimeQuery.loading}
          runtime={runtimeQuery.data}
        />
      </div>
      <ServiceHealthPanel
        error={servicesQuery.error}
        loading={servicesQuery.loading}
        runtime={runtimeQuery.data}
        services={servicesQuery.data?.services ?? []}
      />
    </section>
  );
}
