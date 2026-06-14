interface DashboardHtmlOptions {
  incidentId?: string;
  view?: DashboardView;
}

type DashboardView = "overview" | "automation" | "integrations" | "settings";

export function renderDashboardHtml(options?: DashboardHtmlOptions): string {
  const initialIncidentId = JSON.stringify(options?.incidentId ?? null);
  const view = options?.view ?? "overview";
  const isActiveView = (target: DashboardView) => (view === target ? "active" : "");
  const viewCopy: Record<DashboardView, { eyebrow: string; title: string; summary: string }> = {
    overview: {
      eyebrow: "Operational Surface",
      title: "SentinelOps Command Overview",
      summary: "Live service context, incidents, deploys, logs, and autonomous operations in one workspace view."
    },
    automation: {
      eyebrow: "Autonomous Ops",
      title: "Automation Control Room",
      summary: "Watch GitHub issue intake, Slack approval state, and agent execution results update in realtime."
    },
    integrations: {
      eyebrow: "Integration Hub",
      title: "Connected Repos And Channels",
      summary: "Confirm which GitHub repositories SentinelOps tracks and where Slack approvals are posted."
    },
    settings: {
      eyebrow: "Operator Settings",
      title: "Workspace Control Plane",
      summary: "Switch automation on or off and verify the command SentinelOps will hand to Codex or another agent CLI."
    }
  };
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />
    <title>SentinelOps Control Center</title>
    <style>
      :root {
        --bg: #f3efe4;
        --panel: #fffaf0;
        --ink: #171717;
        --muted: #655f57;
        --line: rgba(23, 23, 23, 0.14);
        --accent: #0f766e;
        --accent-strong: #115e59;
        --warn: #b45309;
        --danger: #b91c1c;
        --shadow: 0 24px 60px rgba(23, 23, 23, 0.12);
        --mono: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
        --sans: "Segoe UI", "Inter", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: var(--sans);
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 28%),
          radial-gradient(circle at top right, rgba(180, 83, 9, 0.14), transparent 24%),
          linear-gradient(180deg, #f8f3e8 0%, var(--bg) 100%);
      }

      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(250px, 280px) minmax(0, 1fr);
      }

      .rail {
        padding: 24px 20px;
        border-right: 1px solid var(--line);
        background: rgba(255, 250, 240, 0.72);
        backdrop-filter: blur(10px);
      }

      .brand {
        margin-bottom: 28px;
      }

      .eyebrow {
        font-family: var(--mono);
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
      }

      h1, h2, h3, p {
        margin: 0;
      }

      h1 {
        margin-top: 10px;
        max-width: 12rem;
        font-size: clamp(2rem, 3.6vw, 3rem);
        line-height: 0.92;
        letter-spacing: -0.04em;
      }

      .brand p {
        margin-top: 14px;
        max-width: 14rem;
        color: var(--muted);
        font-size: 0.98rem;
        line-height: 1.45;
      }

      .scenario-list,
      .form-grid,
      .stats,
      .streams,
      .timelines {
        display: grid;
        gap: 12px;
      }

      .scenario-list {
        margin-top: 20px;
      }

      button,
      select,
      input,
      textarea {
        font: inherit;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 16px;
        background: var(--ink);
        color: #fff;
        cursor: pointer;
        transition: transform 140ms ease, opacity 140ms ease, background 140ms ease;
      }

      button:hover {
        transform: translateY(-1px);
        opacity: 0.94;
      }

      .scenario-button {
        width: 100%;
        text-align: left;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: transparent;
        color: var(--ink);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px 16px;
      }

      .scenario-button.active {
        border-color: rgba(15, 118, 110, 0.42);
        background: rgba(15, 118, 110, 0.09);
      }

      .scenario-button span:last-child {
        color: var(--muted);
        font-family: var(--mono);
        font-size: 12px;
      }

      .main {
        padding: 24px 30px 32px;
        max-width: 1280px;
      }

      .hero {
        display: grid;
        gap: 18px;
        padding-bottom: 26px;
        border-bottom: 1px solid var(--line);
      }

      .hero-top {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
      }

      .hero-copy {
        max-width: 34rem;
      }

      .hero-copy p {
        margin-top: 10px;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.45;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--line);
        font-family: var(--mono);
        font-size: 12px;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.55);
      }

      .top-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 18px;
      }

      .top-nav a {
        color: var(--ink);
        text-decoration: none;
        border: 1px solid var(--line);
        padding: 8px 10px;
        border-radius: 12px;
        font-family: var(--mono);
        font-size: 12px;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.5);
      }

      .top-nav a.active {
        background: var(--ink);
        color: #fff;
        border-color: var(--ink);
      }

      .stats {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
      }

      .stat {
        padding: 16px 0;
        border-top: 1px solid var(--line);
        min-width: 0;
      }

      .stat strong {
        display: block;
        font-size: 1.65rem;
        margin-top: 6px;
      }

      .grid {
        display: grid;
        gap: 24px;
        margin-top: 26px;
      }

      .grid.top {
        grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
      }

      .grid.bottom {
        grid-template-columns: minmax(0, 1fr);
      }

      .ops-grid {
        display: grid;
        grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
        gap: 20px;
        margin-top: 22px;
      }

      .section {
        padding: 22px;
        background: rgba(255, 250, 240, 0.74);
        border: 1px solid var(--line);
        border-radius: 22px;
        box-shadow: var(--shadow);
      }

      .section.wide {
        grid-column: 1 / -1;
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        margin-bottom: 16px;
      }

      .section-header p {
        color: var(--muted);
        max-width: 20rem;
        line-height: 1.4;
      }

      .service-card {
        display: grid;
        gap: 16px;
      }

      .operator-panel {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px 18px;
      }

      .operator-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
        grid-column: 1 / -1;
      }

      .realtime-indicator {
        font-family: var(--mono);
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .automation-list {
        display: grid;
        gap: 12px;
      }

      .automation-item {
        border-top: 1px solid var(--line);
        padding-top: 12px;
        display: grid;
        gap: 8px;
      }

      .automation-item strong,
      .automation-item code {
        overflow-wrap: anywhere;
      }

      .service-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }

      .health {
        padding: 8px 12px;
        border-radius: 999px;
        font-family: var(--mono);
        font-size: 12px;
        text-transform: uppercase;
      }

      .health.healthy {
        background: rgba(15, 118, 110, 0.12);
        color: var(--accent-strong);
      }

      .health.degraded {
        background: rgba(180, 83, 9, 0.12);
        color: var(--warn);
      }

      .health.failing {
        background: rgba(185, 28, 28, 0.12);
        color: var(--danger);
      }

      .service-meta,
      .stream-list,
      .timeline-list {
        display: grid;
        gap: 12px;
      }

      .meta-row,
      .stream-item,
      .timeline-item {
        padding-top: 12px;
        border-top: 1px solid var(--line);
      }

      .meta-label,
      .subtle {
        color: var(--muted);
        font-size: 0.92rem;
      }

      .streams {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .services-panel {
        display: grid;
        gap: 12px;
        align-content: start;
        min-height: 100%;
      }

      .service-list-item {
        width: 100%;
        text-align: left;
        display: grid;
        gap: 6px;
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.56);
        color: var(--ink);
      }

      .service-list-item.active {
        border-color: rgba(15, 118, 110, 0.42);
        background: rgba(15, 118, 110, 0.08);
      }

      .service-list-item small {
        color: var(--muted);
        font-family: var(--mono);
      }

      .table-shell {
        overflow-x: auto;
        border-top: 1px solid var(--line);
        padding-top: 12px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
      }

      th {
        font-family: var(--mono);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }

      .stream-item strong,
      .timeline-item strong {
        display: block;
        margin-bottom: 6px;
      }

      .timeline-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .form-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }

      .form-grid form[data-span="full"] {
        grid-column: 1 / -1;
      }

      label {
        display: grid;
        gap: 8px;
        font-size: 0.95rem;
      }

      input,
      select,
      textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.72);
      }

      textarea {
        min-height: 92px;
        resize: vertical;
      }

      .form-actions {
        display: flex;
        gap: 12px;
        margin-top: 14px;
      }

      .ghost {
        background: transparent;
        color: var(--ink);
        border: 1px solid var(--line);
      }

      .footer-note {
        margin-top: 20px;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .incident-shell {
        display: grid;
        gap: 12px;
      }

      .incident-links {
        display: grid;
        gap: 10px;
      }

      .incident-links a {
        color: var(--accent-strong);
        word-break: break-word;
      }

      .timeline-item a,
      .service-meta a {
        color: var(--accent-strong);
        text-decoration-thickness: 1px;
      }

      .incident-empty {
        padding-top: 12px;
        border-top: 1px solid var(--line);
        color: var(--muted);
      }

      .mode-card {
        display: grid;
        gap: 12px;
      }

      .mode-card code {
        overflow-wrap: anywhere;
      }

      .setup-status {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        line-height: 1.45;
      }

      .setup-status strong {
        color: var(--ink);
      }

      body[data-view="automation"] #service-grid,
      body[data-view="automation"] #manual-input-section,
      body[data-view="automation"] #logs-section,
      body[data-view="automation"] #alerts-section,
      body[data-view="automation"] #integration-guide-section,
      body[data-view="automation"] #settings-guide-section,
      body[data-view="integrations"] #service-grid,
      body[data-view="integrations"] #manual-input-section,
      body[data-view="integrations"] #logs-section,
      body[data-view="integrations"] #alerts-section,
      body[data-view="integrations"] #automation-section,
      body[data-view="integrations"] #timeline-section,
      body[data-view="integrations"] #incident-detail-section,
      body[data-view="integrations"] #settings-guide-section,
      body[data-view="settings"] #service-grid,
      body[data-view="settings"] #manual-input-section,
      body[data-view="settings"] #logs-section,
      body[data-view="settings"] #alerts-section,
      body[data-view="settings"] #automation-section,
      body[data-view="settings"] #timeline-section,
      body[data-view="settings"] #incident-detail-section,
      body[data-view="settings"] #integration-guide-section,
      body[data-view="overview"] #integration-guide-section,
      body[data-view="overview"] #settings-guide-section {
        display: none;
      }

      body[data-detail-mode="true"] .hero-copy p,
      body[data-detail-mode="true"] #service-list-section,
      body[data-detail-mode="true"] #service-list,
      body[data-detail-mode="true"] #manual-input-section,
      body[data-detail-mode="true"] #logs-section,
      body[data-detail-mode="true"] #alerts-section {
        display: none;
      }

      body[data-detail-mode="true"] .grid.top {
        grid-template-columns: minmax(0, 1fr);
      }

      body[data-detail-mode="true"] #timeline-section,
      body[data-detail-mode="true"] #incident-detail-section {
        border-color: rgba(15, 118, 110, 0.25);
      }

      .fade-in {
        animation: rise 320ms ease both;
      }

      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 980px) {
        .shell,
        .grid.top,
        .ops-grid,
        .streams,
        .timeline-list,
        .stats,
        .form-grid {
          grid-template-columns: 1fr;
        }

        .rail {
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }

        h1,
        .brand p,
        .hero-copy {
          max-width: none;
        }

        .hero-top,
        .service-head,
        .section-header {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body data-detail-mode="${options?.incidentId ? "true" : "false"}" data-view="${view}">
    <div class="shell">
      <aside class="rail">
        <div class="brand fade-in">
          <div class="eyebrow">SentinelOps Dashboard</div>
          <h1>SentinelOps Control Center</h1>
          <p>Scenario-driven operational context for any agent CLI, with live logs, alerts, deploys, incidents, and GitHub links.</p>
        </div>

        <section class="fade-in">
          <div class="eyebrow">Scenario Loader</div>
          <div id="scenario-list" class="scenario-list"></div>
          <p class="footer-note">Uses <code>/api/scenarios/load</code> to reset the workspace into a deterministic demo state.</p>
        </section>
      </aside>

      <main class="main">
        <nav class="top-nav">
          <a class="${isActiveView("overview")}" href="/">Overview</a>
          <a class="${isActiveView("automation")}" href="/automation">Automation</a>
          <a class="${isActiveView("integrations")}" href="/integrations">Integrations</a>
          <a class="${isActiveView("settings")}" href="/settings">Settings</a>
        </nav>

        <section class="hero fade-in">
          <div class="hero-top">
            <div class="hero-copy">
              <div class="eyebrow">${viewCopy[view].eyebrow}</div>
              <h2 id="hero-title">${viewCopy[view].title}</h2>
              <p id="hero-summary">${viewCopy[view].summary}</p>
            </div>
            <div class="pill" id="scenario-pill">SCENARIO</div>
          </div>

          <div class="stats">
            <div class="stat">
              <div class="eyebrow">Logs</div>
              <strong id="stat-logs">0</strong>
            </div>
            <div class="stat">
              <div class="eyebrow">Alerts</div>
              <strong id="stat-alerts">0</strong>
            </div>
            <div class="stat">
              <div class="eyebrow">Deploys</div>
              <strong id="stat-deploys">0</strong>
            </div>
            <div class="stat">
              <div class="eyebrow">Incidents</div>
              <strong id="stat-incidents">0</strong>
            </div>
          </div>
        </section>

        <div class="ops-grid">
          <section id="operator-config-section" class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Operator Config</div>
                <h3>Linked Repos And Channels</h3>
              </div>
              <p id="operator-updated" class="realtime-indicator">Waiting for config</p>
            </div>
            <div id="operator-config-panel" class="operator-panel"></div>
          </section>

          <section id="automation-section" class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Autonomous Ops</div>
                <h3>Automation Queue</h3>
              </div>
              <p id="automation-updated" class="realtime-indicator">Waiting for jobs</p>
            </div>
            <div id="automation-list" class="automation-list"></div>
          </section>
        </div>

        <div id="service-grid" class="grid top">
          <section class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Service</div>
                <h3>Active Context</h3>
              </div>
              <p id="context-updated">Waiting for data</p>
            </div>
            <div id="service-card" class="service-card"></div>
          </section>

          <section id="service-list-section" class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Inventory</div>
                <h3>Service List</h3>
              </div>
              <p>Pick the active service and inspect its linked GitHub context.</p>
            </div>
            <div id="service-list" class="services-panel"></div>
          </section>

          <section id="manual-input-section" class="section wide fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Manual Input</div>
                <h3>Add Signals</h3>
              </div>
              <p>Demo the dashboard receiving fresh operations data.</p>
            </div>
            <div class="form-grid">
              <form id="log-form">
                <label>Log Level
                  <select name="level">
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                  </select>
                </label>
                <label>Message
                  <textarea name="message" placeholder="Describe the runtime signal"></textarea>
                </label>
                <div class="form-actions">
                  <button type="submit">Add Log</button>
                </div>
              </form>

              <form id="alert-form">
                <label>Alert Severity
                  <select name="severity">
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="critical">critical</option>
                  </select>
                </label>
                <label>Summary
                  <textarea name="summary" placeholder="What should the operator know?"></textarea>
                </label>
                <div class="form-actions">
                  <button type="submit">Add Alert</button>
                </div>
              </form>

              <form id="deploy-form">
                <label>Version
                  <input name="version" placeholder="2.2.1" />
                </label>
                <label>Status
                  <select name="status">
                    <option value="healthy">healthy</option>
                    <option value="degraded">degraded</option>
                    <option value="failed">failed</option>
                  </select>
                </label>
                <div class="form-actions">
                  <button type="submit">Add Deploy</button>
                </div>
              </form>

              <form id="incident-form" data-span="full">
                <label>Incident Summary
                  <textarea name="summary" placeholder="Describe the customer-facing incident"></textarea>
                </label>
                <label>Status
                  <select name="status">
                    <option value="open">open</option>
                    <option value="investigating">investigating</option>
                    <option value="resolved">resolved</option>
                  </select>
                </label>
                <label>GitHub Issue URL
                  <input name="issueUrl" placeholder="https://github.com/example/repo/issues/77" />
                </label>
                <label>GitHub PR URL
                  <input name="prUrl" placeholder="https://github.com/example/repo/pull/79" />
                </label>
                <div class="form-actions">
                  <button type="submit">Add Incident</button>
                </div>
              </form>
            </div>
          </section>
        </div>

        <div class="grid bottom">
          <section id="integration-guide-section" class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Integration Checklist</div>
                <h3>GitHub To Slack Wiring</h3>
              </div>
              <p>Use this page to confirm the tracked repo and approval channel before enabling automation.</p>
            </div>
            <div class="mode-card">
              <div class="meta-row"><div class="meta-label">GitHub webhook</div><strong><code>POST /webhooks/github</code></strong></div>
              <div class="meta-row"><div class="meta-label">Slack action webhook</div><strong><code>POST /webhooks/slack</code></strong></div>
              <div class="meta-row"><div class="meta-label">Config command</div><strong><code>sentinelops init --repo owner/repo --slack-channel #ops-approvals</code></strong></div>
            </div>
          </section>

          <section id="settings-guide-section" class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Live Demo Setup</div>
                <h3>Give Codex The Repo And Slack Channel</h3>
              </div>
              <p>Paste the GitHub repo and Slack channel once. SentinelOps saves the operator config and Codex can drive the plugin-first flow.</p>
            </div>
            <form id="live-onboard-form" class="form-grid" data-span="full">
              <label>GitHub Repo URL Or owner/repo
                <input name="repo" placeholder="https://github.com/org/repo" />
              </label>
              <label>Slack Channel
                <input name="slackChannel" placeholder="#ops-approvals" />
              </label>
              <label>Agent Command
                <input name="agentCommand" value="codex" />
              </label>
              <label>Agent Args JSON
                <input name="agentArgs" value='["exec","--json"]' />
              </label>
              <div class="form-actions">
                <button type="submit">Start Live Mode</button>
              </div>
            </form>
            <div id="live-onboard-status" class="setup-status">Waiting for repo and Slack channel.</div>
            <div class="mode-card">
              <div class="meta-row"><div class="meta-label">Enable</div><strong><code>sentinelops automation enable</code></strong></div>
              <div class="meta-row"><div class="meta-label">Disable</div><strong><code>sentinelops automation disable</code></strong></div>
              <div class="meta-row"><div class="meta-label">Review jobs</div><strong><code>sentinelops automation list</code></strong></div>
            </div>
          </section>

          <section id="logs-section" class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Signals</div>
                <h3>Logs Table</h3>
              </div>
              <p>These logs are the raw operational evidence Codex can normalize into context and a plan.</p>
            </div>
            <div class="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Message</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody id="logs-list"></tbody>
              </table>
            </div>
          </section>

          <section id="alerts-section" class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Signals</div>
                <h3>Alert Table</h3>
              </div>
              <p>Alerts make severity and customer impact visible before Codex proposes any risky mutation.</p>
            </div>
            <div class="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Summary</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody id="alerts-list"></tbody>
              </table>
            </div>
          </section>

          <section id="timeline-section" class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Timeline</div>
                <h3>Deploys And Incidents</h3>
              </div>
              <p>Track release events, incident state, and linked GitHub references in one place.</p>
            </div>
            <div class="timelines">
              <div class="timeline-list" id="timeline-list"></div>
            </div>
          </section>

          <section id="incident-detail-section" class="section fade-in">
            <div class="section-header">
              <div>
                <div class="eyebrow">Incident Detail</div>
                <h3>Linked GitHub Context</h3>
              </div>
              <p id="incident-state">Select an incident from the timeline.</p>
            </div>
            <div id="incident-detail" class="incident-shell"></div>
          </section>
        </div>
      </main>
    </div>

    <script>
      const scenarios = ["healthy", "degraded-api", "failing-test", "post-deploy-errors", "config-risk"];
      const initialIncidentId = ${initialIncidentId};
      const dashboardView = "${view}";
      const isIncidentRoute = window.location.pathname.startsWith("/incidents/");
      const state = {
        scenario: "healthy",
        serviceId: null,
        incidentId: initialIncidentId
      };

      const els = {
        scenarioList: document.getElementById("scenario-list"),
        heroTitle: document.getElementById("hero-title"),
        heroSummary: document.getElementById("hero-summary"),
        scenarioPill: document.getElementById("scenario-pill"),
        contextUpdated: document.getElementById("context-updated"),
        serviceCard: document.getElementById("service-card"),
        serviceList: document.getElementById("service-list"),
        logsList: document.getElementById("logs-list"),
        alertsList: document.getElementById("alerts-list"),
        timelineList: document.getElementById("timeline-list"),
        statLogs: document.getElementById("stat-logs"),
        statAlerts: document.getElementById("stat-alerts"),
        statDeploys: document.getElementById("stat-deploys"),
        statIncidents: document.getElementById("stat-incidents"),
        incidentState: document.getElementById("incident-state"),
        incidentDetail: document.getElementById("incident-detail"),
        operatorUpdated: document.getElementById("operator-updated"),
        operatorConfigPanel: document.getElementById("operator-config-panel"),
        automationUpdated: document.getElementById("automation-updated"),
        automationList: document.getElementById("automation-list"),
        liveOnboardForm: document.getElementById("live-onboard-form"),
        liveOnboardStatus: document.getElementById("live-onboard-status")
      };

      function nowIso() {
        return new Date().toISOString();
      }

      async function request(path, options = {}) {
        const response = await fetch(path, {
          headers: { "content-type": "application/json" },
          ...options
        });
        if (!response.ok) {
          throw new Error("Request failed for " + path);
        }
        return response.json();
      }

      function renderScenarioButtons() {
        els.scenarioList.innerHTML = scenarios
          .map((scenario) => {
            const active = scenario === state.scenario ? "active" : "";
            return '<button class="scenario-button ' + active + '" data-scenario="' + scenario + '">' +
              '<span>' + scenario + '</span>' +
              '<span>' + (scenario === state.scenario ? "active" : "load") + '</span>' +
            '</button>';
          })
          .join("");

        els.scenarioList.querySelectorAll("[data-scenario]").forEach((button) => {
          button.addEventListener("click", async () => {
            await loadScenario(button.getAttribute("data-scenario"));
          });
        });
      }

      function renderService(context) {
        const service = context.service;
        const github = service.linkedGithub || { issueUrl: null, prUrl: null };
        if (dashboardView === "overview" || state.incidentId) {
          els.heroTitle.textContent = service.name + " · " + service.environment;
          els.heroSummary.textContent = context.summary;
        }
        els.scenarioPill.textContent = context.scenario;
        els.contextUpdated.textContent = "Updated from scenario data";
        els.serviceCard.innerHTML = '' +
          '<div class="service-head">' +
            '<div>' +
              '<div class="eyebrow">Service Id</div>' +
              '<h3>' + service.id + '</h3>' +
            '</div>' +
            '<div class="health ' + service.health + '">' + service.health + '</div>' +
          '</div>' +
          '<div class="service-meta">' +
            '<div class="meta-row"><div class="meta-label">GitHub Issue</div><strong>' + (github.issueUrl ? '<a href="' + github.issueUrl + '">' + github.issueUrl + '</a>' : "none") + '</strong></div>' +
            '<div class="meta-row"><div class="meta-label">GitHub PR</div><strong>' + (github.prUrl ? '<a href="' + github.prUrl + '">' + github.prUrl + '</a>' : "none") + '</strong></div>' +
            '<div class="meta-row"><div class="meta-label">Environment</div><strong>' + service.environment + '</strong></div>' +
          '</div>';
      }

      function renderServiceList(services) {
        els.serviceList.innerHTML = services
          .map((service) => {
            const active = service.id === state.serviceId ? "active" : "";
            const github = service.linkedGithub || { issueUrl: null, prUrl: null };
            return '' +
              '<button class="service-list-item ' + active + '" data-service-id="' + service.id + '">' +
                '<strong>' + service.name + '</strong>' +
                '<div>' + service.environment + ' / ' + service.health + '</div>' +
                '<small>' + (github.issueUrl || github.prUrl || "No linked GitHub reference") + '</small>' +
              '</button>';
          })
          .join("");

        els.serviceList.querySelectorAll("[data-service-id]").forEach((button) => {
          button.addEventListener("click", async (event) => {
            const nextServiceId = event.currentTarget.getAttribute("data-service-id");
            if (!nextServiceId) {
              return;
            }
            state.serviceId = nextServiceId;
            await refreshContext();
          });
        });
      }

      function renderSignals(context) {
        els.statLogs.textContent = String(context.logs.length);
        els.statAlerts.textContent = String(context.alerts.length);
        els.statDeploys.textContent = String(context.deploys.length);
        els.statIncidents.textContent = String(context.incidents.length);

        els.logsList.innerHTML = context.logs
          .map((log) => '<tr><td>' + log.level + '</td><td>' + log.message + '</td><td>' + log.timestamp + '</td></tr>')
          .join("");

        els.alertsList.innerHTML = context.alerts
          .map((alert) => '<tr><td>' + alert.severity + '</td><td>' + alert.summary + '</td><td>' + alert.timestamp + '</td></tr>')
          .join("");

        const deployMarkup = context.deploys
          .map((deploy) => '<div class="timeline-item"><strong>Deploy ' + deploy.version + '</strong><div>' + deploy.status + '</div><div class="subtle">' + deploy.timestamp + '</div></div>')
          .join("");

        const incidentMarkup = context.incidents
          .map((incident) => {
            const active = incident.id === state.incidentId ? " / active" : "";
            return '<div class="timeline-item">' +
              '<strong>' + incident.status + active + '</strong>' +
              '<div>' + incident.summary + '</div>' +
              '<div class="subtle">' + incident.timestamp + '</div>' +
              '<div class="subtle"><a href="/incidents/' + incident.id + '" data-incident-link="' + incident.id + '">Open incident detail</a></div>' +
            '</div>';
          })
          .join("");

        els.timelineList.innerHTML = deployMarkup + incidentMarkup;
        els.timelineList.querySelectorAll("[data-incident-link]").forEach((link) => {
          link.addEventListener("click", async (event) => {
            event.preventDefault();
            const incidentId = event.currentTarget.getAttribute("data-incident-link");
            if (!incidentId) {
              return;
            }
            state.incidentId = incidentId;
            window.history.replaceState({}, "", "/incidents/" + incidentId);
            renderSignals(context);
            await refreshIncidentDetail();
          });
        });
      }

      function renderIncidentDetail(incident) {
        if (!incident) {
          els.incidentState.textContent = "Select an incident from the timeline.";
          els.incidentDetail.innerHTML = '<div class="incident-empty">No incident is currently selected.</div>';
          return;
        }

        const github = incident.linkedGithub || { issueUrl: null, prUrl: null };
        els.incidentState.textContent = incident.status + " incident";
        els.incidentDetail.innerHTML = '' +
          '<div class="meta-row"><div class="meta-label">Incident Id</div><strong>' + incident.id + '</strong></div>' +
          '<div class="meta-row"><div class="meta-label">Summary</div><strong>' + incident.summary + '</strong></div>' +
          '<div class="meta-row"><div class="meta-label">Timestamp</div><strong>' + incident.timestamp + '</strong></div>' +
          '<div class="incident-links">' +
            '<div class="meta-row"><div class="meta-label">GitHub Issue</div><strong>' + (github.issueUrl ? '<a href="' + github.issueUrl + '">' + github.issueUrl + '</a>' : 'none') + '</strong></div>' +
            '<div class="meta-row"><div class="meta-label">GitHub PR</div><strong>' + (github.prUrl ? '<a href="' + github.prUrl + '">' + github.prUrl + '</a>' : 'none') + '</strong></div>' +
          '</div>';
      }

      function renderOperatorConfig(config) {
        els.operatorUpdated.textContent = "Live " + new Date().toLocaleTimeString();
        if (!config) {
          els.operatorConfigPanel.innerHTML = '' +
            '<div class="meta-row"><div class="meta-label">Status</div><strong>not initialized</strong></div>' +
            '<div class="subtle">Run sentinelops init with repo, Slack channel, and agent command settings.</div>';
          return;
        }

        els.operatorConfigPanel.innerHTML = '' +
          '<div class="meta-row"><div class="meta-label">Tracked GitHub Repos</div><strong>' + config.trackedRepos.join(", ") + '</strong></div>' +
          '<div class="meta-row"><div class="meta-label">Slack Channel</div><strong>' + config.slackChannel + '</strong></div>' +
          '<div class="meta-row"><div class="meta-label">Agent Command</div><strong>' + config.agentCommand + ' ' + config.agentArgs.join(" ") + '</strong></div>' +
          '<div class="meta-row"><div class="meta-label">Automation</div><strong>' + (config.enabled ? "enabled" : "disabled") + '</strong></div>' +
          '<div class="operator-actions">' +
            '<button type="button" data-operator-toggle="true">Enable</button>' +
            '<button type="button" data-operator-toggle="false">Disable</button>' +
          '</div>';

        els.operatorConfigPanel.querySelectorAll("[data-operator-toggle]").forEach((button) => {
          button.addEventListener("click", async (event) => {
            const enabled = event.currentTarget.getAttribute("data-operator-toggle") === "true";
            await request("/api/operator-config/toggle", {
              method: "POST",
              body: JSON.stringify({ enabled })
            });
            await refreshOperatorConfig();
          });
        });
      }

      function renderAutomationJobs(jobs) {
        els.automationUpdated.textContent = "Live " + new Date().toLocaleTimeString();
        if (!jobs || jobs.length === 0) {
          els.automationList.innerHTML = '<div class="incident-empty">No automation jobs have been recorded yet.</div>';
          return;
        }

        els.automationList.innerHTML = jobs
          .map((job) => {
            const execution = job.execution
              ? '<div class="subtle">Agent: ' + job.execution.summary + '</div><div class="subtle"><code>' + job.execution.transcriptPath + '</code></div>'
              : '<div class="subtle">Agent has not run yet.</div>';
            return '<article class="automation-item">' +
              '<strong>' + job.status + ' / ' + job.serviceId + '</strong>' +
              '<div><a href="' + job.githubIssueUrl + '">' + job.githubIssueUrl + '</a></div>' +
              '<div class="subtle">Run ' + job.runId + '</div>' +
              execution +
            '</article>';
          })
          .join("");
      }

      async function refreshOperatorConfig() {
        const payload = await request("/api/operator-config");
        renderOperatorConfig(payload.config);
      }

      async function refreshAutomationJobs() {
        const payload = await request("/api/automation/jobs");
        renderAutomationJobs(payload.jobs);
      }

      async function refreshIncidentDetail() {
        if (!state.incidentId) {
          renderIncidentDetail(null);
          return;
        }

        try {
          const payload = await request("/api/incidents/" + state.incidentId);
          renderIncidentDetail(payload.incident);
        } catch {
          renderIncidentDetail(null);
        }
      }

      async function refreshContext() {
        const servicesPayload = await request("/api/services");
        renderServiceList(servicesPayload.services);
        const contextPayload = await request("/api/context/" + state.serviceId);
        renderService(contextPayload.context);
        renderSignals(contextPayload.context);
        const matchingIncident = contextPayload.context.incidents.find((incident) => incident.id === state.incidentId);
        if (!matchingIncident && contextPayload.context.incidents.length > 0) {
          state.incidentId = contextPayload.context.incidents[0].id;
          if (isIncidentRoute && window.location.pathname !== "/incidents/" + state.incidentId) {
            window.history.replaceState({}, "", "/incidents/" + state.incidentId);
          }
        }
        await refreshIncidentDetail();
        await refreshOperatorConfig();
        await refreshAutomationJobs();
      }

      async function refreshRealtime() {
        await Promise.allSettled([
          refreshOperatorConfig(),
          refreshAutomationJobs(),
          refreshIncidentDetail()
        ]);
      }

      function startRealtimeRefresh() {
        window.setInterval(refreshRealtime, 3000);
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) {
            refreshRealtime();
          }
        });
      }

      async function loadScenario(scenario) {
        const payload = await request("/api/scenarios/load", {
          method: "POST",
          body: JSON.stringify({ scenario })
        });
        state.scenario = payload.scenario;
        state.serviceId = payload.service.id;
        renderScenarioButtons();
        await refreshContext();
      }

      function bindForms() {
        if (els.liveOnboardForm) {
          els.liveOnboardForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            els.liveOnboardStatus.textContent = "Saving live demo setup...";
            try {
              const payload = await request("/api/onboard/live", {
                method: "POST",
                body: JSON.stringify({
                  repo: form.get("repo"),
                  slackChannel: form.get("slackChannel"),
                  agentCommand: form.get("agentCommand") || "codex",
                  agentArgs: JSON.parse(String(form.get("agentArgs") || '["exec","--json"]')),
                  enabled: true
                })
              });
              els.liveOnboardStatus.innerHTML = '' +
                '<strong>Live mode ready.</strong> Tracking <code>' + payload.repo + '</code> and posting approvals to <code>' + payload.slackChannel + '</code>.' +
                '<br /><span class="subtle">Codex prompt: ' + payload.codexPrompt + '</span>';
              await refreshOperatorConfig();
              await refreshAutomationJobs();
            } catch (error) {
              els.liveOnboardStatus.textContent = "Setup failed: " + (error instanceof Error ? error.message : String(error));
            }
          });
        }

        document.getElementById("log-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await request("/api/logs", {
            method: "POST",
            body: JSON.stringify({
              level: form.get("level"),
              message: form.get("message"),
              serviceId: state.serviceId,
              timestamp: nowIso()
            })
          });
          event.currentTarget.reset();
          await refreshContext();
        });

        document.getElementById("alert-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await request("/api/alerts", {
            method: "POST",
            body: JSON.stringify({
              severity: form.get("severity"),
              summary: form.get("summary"),
              serviceId: state.serviceId,
              timestamp: nowIso()
            })
          });
          event.currentTarget.reset();
          await refreshContext();
        });

        document.getElementById("deploy-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await request("/api/deploys", {
            method: "POST",
            body: JSON.stringify({
              version: form.get("version"),
              status: form.get("status"),
              serviceId: state.serviceId,
              timestamp: nowIso()
            })
          });
          event.currentTarget.reset();
          await refreshContext();
        });

        document.getElementById("incident-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await request("/api/incidents", {
            method: "POST",
            body: JSON.stringify({
              summary: form.get("summary"),
              status: form.get("status"),
              serviceId: state.serviceId,
              linkedGithub: {
                issueUrl: form.get("issueUrl") || null,
                prUrl: form.get("prUrl") || null
              },
              timestamp: nowIso()
            })
          });
          event.currentTarget.reset();
          await refreshContext();
        });
      }

      renderScenarioButtons();
      bindForms();
      loadScenario("post-deploy-errors").then(startRealtimeRefresh);
    </script>
  </body>
</html>`;
}
