import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/app-shell";
import { AutomationPage } from "./routes/automation-page";
import { IncidentPage } from "./routes/incident-page";
import { IntegrationsPage } from "./routes/integrations-page";
import { OverviewPage } from "./routes/overview-page";

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/approvals" element={<ApprovalsWorkspace />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/incidents/:incidentId" element={<IncidentPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

function ApprovalsWorkspace(): JSX.Element {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Approvals</p>
        <h1 className="mt-3 text-4xl font-semibold">Approvals Workspace</h1>
        <p className="mt-4 max-w-2xl text-sm text-slate-300">
          Operator approval requests, production gates, and decision context will surface here.
        </p>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
        <h2 className="text-lg font-medium">Decision history</h2>
        <p className="mt-3 text-sm text-slate-300">
          Approval history and escalation notes will appear here.
        </p>
      </div>
    </section>
  );
}
