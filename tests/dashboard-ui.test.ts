import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startDashboardServer } from "../src/dashboard/server.js";

describe("dashboard ui", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-dashboard-ui-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("serves a browser dashboard shell from the root route", async () => {
    const server = await startDashboardServer();
    try {
      const response = await fetch(`${server.baseUrl}/`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain("SentinelOps Control Center");
      expect(html).toContain("Scenario Loader");
      expect(html).toContain("Service List");
      expect(html).toContain("Logs Table");
      expect(html).toContain("Alert Table");
      expect(html).toContain("GitHub Issue URL");
      expect(html).toContain("GitHub PR URL");
      expect(html).toContain("Linked Repos And Channels");
      expect(html).toContain("Automation Queue");
      expect(html).toContain("operator-updated");
      expect(html).toContain("automation-updated");
      expect(html).toContain("startRealtimeRefresh");
      expect(html).toContain("/api/operator-config");
      expect(html).toContain("/api/automation/jobs");
      expect(html).toContain("/api/scenarios/load");
    } finally {
      await server.close();
    }
  });

  it("serves an incident detail page shell for direct incident deep links", async () => {
    const server = await startDashboardServer();
    try {
      await fetch(`${server.baseUrl}/api/scenarios/load`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "post-deploy-errors" })
      });

      const incidentsPayload = await (await fetch(`${server.baseUrl}/api/incidents`)).json();
      const incidentId = incidentsPayload.incidents[0].id as string;

      const response = await fetch(`${server.baseUrl}/incidents/${incidentId}`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain("Incident Detail");
      expect(html).toContain(incidentId);
      expect(html).toContain('id="service-list-section"');
      expect(html).toContain('body[data-detail-mode="true"] #service-list-section');
      expect(html).toContain("/api/incidents/");
      expect(html).toContain("Automation Queue");
    } finally {
      await server.close();
    }
  });

  it("renders distinct top-navigation pages", async () => {
    const server = await startDashboardServer();
    try {
      const automationHtml = await (await fetch(`${server.baseUrl}/automation`)).text();
      const integrationsHtml = await (await fetch(`${server.baseUrl}/integrations`)).text();
      const settingsHtml = await (await fetch(`${server.baseUrl}/settings`)).text();

      expect(automationHtml).toContain('data-view="automation"');
      expect(automationHtml).toContain("Automation Control Room");
      expect(automationHtml).toContain('class="active" href="/automation"');

      expect(integrationsHtml).toContain('data-view="integrations"');
      expect(integrationsHtml).toContain("Connected Repos And Channels");
      expect(integrationsHtml).toContain("GitHub To Slack Wiring");
      expect(integrationsHtml).toContain('class="active" href="/integrations"');

      expect(settingsHtml).toContain('data-view="settings"');
      expect(settingsHtml).toContain("Workspace Control Plane");
      expect(settingsHtml).toContain("Give Codex The Repo And Slack Channel");
      expect(settingsHtml).toContain("Start Live Mode");
      expect(settingsHtml).toContain("/api/onboard/live");
      expect(settingsHtml).toContain('class="active" href="/settings"');
    } finally {
      await server.close();
    }
  });
});
