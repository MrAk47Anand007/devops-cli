import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/app-shell";
import { AutomationPage } from "./routes/automation-page";
import { ApprovalsPage } from "./routes/approvals-page";
import { IncidentPage } from "./routes/incident-page";
import { IntegrationsPage } from "./routes/integrations-page";
import { MemoryPage } from "./routes/memory-page";
import { OverviewPage } from "./routes/overview-page";
import { SettingsPage } from "./routes/settings-page";
import { ServicePage } from "./routes/service-page";

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/incidents" element={<IncidentPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/services/:serviceId" element={<ServicePage />} />
          <Route path="/incidents/:incidentId" element={<IncidentPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
