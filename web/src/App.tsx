import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/app-shell";

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route
            path="/"
            element={
              <WorkspacePage
                description="Live deploy signals, runtime health, approvals, and automation status from the real SentinelOps backend."
                eyebrow="SentinelOps"
                panelBody="Pending decisions will appear here."
                panelTitle="Approvals"
                title="SentinelOps Control Center"
              />
            }
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
