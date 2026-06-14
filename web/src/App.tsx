import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/app-shell";
import { useDashboardQuery } from "./hooks/use-dashboard-query";
import { fetchServices } from "./lib/api";

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route
            path="/"
            element={<OverviewPage />}
          />
          <Route
            path="/automation"
            element={
              <WorkspacePage
                description="Queued runs, recovery automations, and pipeline control surfaces will land here next."
                eyebrow="Automation"
                panelBody="Recent automation events and retries will appear here."
                panelTitle="Run queue"
                title="Automation Workspace"
              />
            }
          />
          <Route
            path="/approvals"
            element={
              <WorkspacePage
                description="Operator approval requests, production gates, and decision context will surface here."
                eyebrow="Approvals"
                panelBody="Approval history and escalation notes will appear here."
                panelTitle="Decision history"
                title="Approvals Workspace"
              />
            }
          />
          <Route
            path="/integrations"
            element={
              <WorkspacePage
                description="External services, credentials posture, and integration health summaries will land here."
                eyebrow="Integrations"
                panelBody="Connected systems and sync state will appear here."
                panelTitle="Connection health"
                title="Integrations Workspace"
              />
            }
          />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

function WorkspacePage({
  description,
  eyebrow,
  panelBody,
  panelTitle,
  title
}: {
  description: string;
  eyebrow: string;
  panelBody: string;
  panelTitle: string;
  title: string;
}): JSX.Element {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm text-slate-300">{description}</p>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
        <h2 className="text-lg font-medium">{panelTitle}</h2>
        <p className="mt-3 text-sm text-slate-300">{panelBody}</p>
      </div>
    </section>
  );
}

function OverviewPage(): JSX.Element {
  const { data, error, loading } = useDashboardQuery(fetchServices);

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

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Backend services</h2>
              <p className="mt-2 text-sm text-slate-300">
                Typed service inventory from the dashboard backend.
              </p>
            </div>
          </div>

          {loading ? <p className="mt-4 text-sm text-slate-300">Loading services...</p> : null}
          {error ? (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {error.message}
            </p>
          ) : null}

          {data ? (
            <ul className="mt-4 grid gap-3">
              {data.services.map((service) => (
                <li
                  key={service.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{service.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                        {service.id}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.25em] text-slate-300">
                      <span className="rounded-full border border-slate-700 px-2 py-1">
                        {service.environment}
                      </span>
                      <span className="rounded-full border border-slate-700 px-2 py-1">
                        {service.health}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
        <h2 className="text-lg font-medium">Approvals</h2>
        <p className="mt-3 text-sm text-slate-300">Pending decisions will appear here.</p>
      </div>
    </section>
  );
}
