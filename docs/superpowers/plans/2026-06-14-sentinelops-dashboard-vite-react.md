# SentinelOps Dashboard Vite + React Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current inline HTML dashboard with a responsive Vite + React application backed by the existing SentinelOps Node API and SSE event stream.

**Architecture:** Keep `src/dashboard/server.ts` as the backend for `/api/*`, `/api/events/stream`, and webhook intake while adding a new `web/` frontend workspace. Build the new UI in small vertical slices: scaffold the frontend, add typed data access and live updates, recreate the existing operational views, then add the missing approvals inbox and reduce `src/dashboard/ui.ts` to a legacy bridge.

**Tech Stack:** Vite, React, TypeScript, Tailwind CSS, shadcn/ui, Node HTTP backend, Vitest, React Testing Library

---

## File Structure

### Backend files to keep and extend

- Modify: `src/dashboard/server.ts`
  - Continue serving JSON API and SSE
  - Add static asset support or explicit frontend handoff only after the React app is working
- Modify: `src/dashboard/ui.ts`
  - Keep temporarily as legacy renderer during migration
  - Reduce long-term responsibility rather than expanding it
- Modify: `tests/dashboard-api.test.ts`
  - Preserve contract coverage for backend routes and SSE
- Modify: `tests/dashboard-ui.test.ts`
  - Update expectations as the HTML renderer becomes a compatibility layer or redirect shell

### New frontend workspace

- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/styles/globals.css`
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/events.ts`
- Create: `web/src/lib/types.ts`
- Create: `web/src/lib/utils.ts`
- Create: `web/src/components/app-shell.tsx`
- Create: `web/src/components/nav-sidebar.tsx`
- Create: `web/src/components/status-rail.tsx`
- Create: `web/src/components/service-health-panel.tsx`
- Create: `web/src/components/deploy-timeline.tsx`
- Create: `web/src/components/automation-run-list.tsx`
- Create: `web/src/components/runtime-health-panel.tsx`
- Create: `web/src/components/incident-detail-panel.tsx`
- Create: `web/src/components/approval-inbox.tsx`
- Create: `web/src/routes/overview-page.tsx`
- Create: `web/src/routes/automation-page.tsx`
- Create: `web/src/routes/approvals-page.tsx`
- Create: `web/src/routes/integrations-page.tsx`
- Create: `web/src/routes/incident-page.tsx`
- Create: `web/src/hooks/use-dashboard-events.ts`
- Create: `web/src/hooks/use-dashboard-query.ts`
- Create: `web/src/hooks/use-runtime-snapshot.ts`
- Create: `web/src/hooks/use-approval-actions.ts`
- Create: `web/src/test/setup.ts`
- Create: `web/src/test/app-shell.test.tsx`
- Create: `web/src/test/overview-page.test.tsx`
- Create: `web/src/test/approvals-page.test.tsx`

### Optional shadcn-managed files

- Create: `web/components.json`
- Create or modify: `web/src/components/ui/*`

## Task 1: Scaffold the Vite + React frontend workspace

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/styles/globals.css`

- [ ] **Step 1: Write the failing workspace smoke test**

Create `web/src/test/app-shell.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";

describe("app shell", () => {
  it("renders the SentinelOps workspace frame", () => {
    render(<App />);
    expect(screen.getByText("SentinelOps Control Center")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- --runInBand`
Expected: FAIL with missing `web/package.json` or missing `../App`

- [ ] **Step 3: Create the frontend workspace and minimal app**

Create `web/package.json`:

```json
{
  "name": "sentinelops-dashboard-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.6.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.8.3",
    "vite": "^5.4.2",
    "vitest": "^3.2.4"
  }
}
```

Create `web/src/App.tsx`:

```tsx
export default function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">SentinelOps</p>
        <h1 className="mt-3 text-4xl font-semibold">SentinelOps Control Center</h1>
        <nav className="mt-8 flex gap-3 text-sm text-slate-300">
          <span>Overview</span>
          <span>Automation</span>
          <span>Approvals</span>
          <span>Integrations</span>
        </nav>
      </main>
    </div>
  );
}
```

Create `web/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Run workspace test to verify it passes**

Run: `npm --prefix web install && npm --prefix web test`
Expected: PASS with `app shell` test green

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/tsconfig.json web/vite.config.ts web/index.html web/src
git commit -m "feat: scaffold Vite React dashboard workspace"
```

## Task 2: Add Tailwind, shadcn setup, and the responsive app shell

**Files:**
- Create: `web/postcss.config.cjs`
- Create: `web/tailwind.config.ts`
- Create: `web/components.json`
- Modify: `web/src/styles/globals.css`
- Create: `web/src/lib/utils.ts`
- Create: `web/src/components/app-shell.tsx`
- Create: `web/src/components/nav-sidebar.tsx`
- Create: `web/src/components/status-rail.tsx`
- Test: `web/src/test/app-shell.test.tsx`

- [ ] **Step 1: Expand the shell test to require responsive workspace structure**

Update `web/src/test/app-shell.test.tsx`:

```tsx
it("renders navigation and live status regions", () => {
  render(<App />);
  expect(screen.getByRole("navigation")).toBeInTheDocument();
  expect(screen.getByText("Runtime health")).toBeInTheDocument();
  expect(screen.getByText("Approvals")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix web test -- app-shell.test.tsx`
Expected: FAIL because `Runtime health` and app shell regions do not exist yet

- [ ] **Step 3: Build the shell with Tailwind and utility helpers**

Create `web/src/lib/utils.ts`:

```ts
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
```

Create `web/src/components/app-shell.tsx`:

```tsx
import { ReactNode } from "react";
import { NavSidebar } from "./nav-sidebar";
import { StatusRail } from "./status-rail";

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <NavSidebar />
        <div className="flex min-w-0 flex-col gap-6">
          <StatusRail />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
```

Update `web/src/App.tsx`:

```tsx
import { AppShell } from "./components/app-shell";

export default function App(): JSX.Element {
  return (
    <AppShell>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">SentinelOps</p>
          <h1 className="mt-3 text-4xl font-semibold">SentinelOps Control Center</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            Live deploy signals, runtime health, approvals, and automation status from the real SentinelOps backend.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-lg font-medium">Approvals</h2>
          <p className="mt-3 text-sm text-slate-300">Pending decisions will appear here.</p>
        </div>
      </section>
    </AppShell>
  );
}
```

- [ ] **Step 4: Run tests to verify the responsive shell passes**

Run: `npm --prefix web test -- app-shell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/postcss.config.cjs web/tailwind.config.ts web/components.json web/src
git commit -m "feat: add Tailwind app shell for dashboard frontend"
```

## Task 3: Add typed frontend API and SSE client

**Files:**
- Create: `web/src/lib/types.ts`
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/events.ts`
- Create: `web/src/hooks/use-dashboard-query.ts`
- Create: `web/src/hooks/use-dashboard-events.ts`
- Test: `web/src/test/overview-page.test.tsx`

- [ ] **Step 1: Write the failing frontend data test**

Create `web/src/test/overview-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../App";

describe("overview page", () => {
  it("loads services from the dashboard API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ services: [{ id: "svc-api", name: "API", environment: "production", health: "degraded", linkedGithub: null }] })
    })));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("svc-api")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix web test -- overview-page.test.tsx`
Expected: FAIL because the app does not fetch or render backend service data yet

- [ ] **Step 3: Implement typed client and SSE helper**

Create `web/src/lib/types.ts`:

```ts
export interface ServiceSummary {
  id: string;
  name: string;
  environment: string;
  health: "healthy" | "degraded" | "failing";
  linkedGithub: { issueUrl: string | null; prUrl: string | null } | null;
}

export interface ServicesResponse {
  services: ServiceSummary[];
}

export interface DashboardEvent {
  id: string;
  type: string;
  at: string;
  serviceId?: string;
  detail: string;
}
```

Create `web/src/lib/api.ts`:

```ts
import type { ServicesResponse } from "./types";

const baseUrl = import.meta.env.VITE_SENTINELOPS_API_BASE_URL ?? "";

export async function fetchServices(): Promise<ServicesResponse> {
  const response = await fetch(`${baseUrl}/api/services`);
  if (!response.ok) {
    throw new Error("Failed to load services.");
  }
  return response.json() as Promise<ServicesResponse>;
}
```

Create `web/src/lib/events.ts`:

```ts
import type { DashboardEvent } from "./types";

export function connectDashboardEvents(onEvent: (event: DashboardEvent) => void): EventSource {
  const source = new EventSource("/api/events/stream");
  source.addEventListener("dashboard", (message) => {
    onEvent(JSON.parse((message as MessageEvent<string>).data) as DashboardEvent);
  });
  return source;
}
```

- [ ] **Step 4: Run the overview test to verify it passes**

Run: `npm --prefix web test -- overview-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib web/src/hooks web/src/test/overview-page.test.tsx web/src/App.tsx
git commit -m "feat: add typed API and SSE client for dashboard frontend"
```

## Task 4: Rebuild overview, automation, integrations, and incident views in React

**Files:**
- Create: `web/src/routes/overview-page.tsx`
- Create: `web/src/routes/automation-page.tsx`
- Create: `web/src/routes/integrations-page.tsx`
- Create: `web/src/routes/incident-page.tsx`
- Create: `web/src/components/service-health-panel.tsx`
- Create: `web/src/components/deploy-timeline.tsx`
- Create: `web/src/components/automation-run-list.tsx`
- Create: `web/src/components/runtime-health-panel.tsx`
- Create: `web/src/components/incident-detail-panel.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/test/overview-page.test.tsx`

- [ ] **Step 1: Add failing assertions for real operational panels**

Update `web/src/test/overview-page.test.tsx`:

```tsx
await waitFor(() => {
  expect(screen.getByText("Runtime health")).toBeInTheDocument();
  expect(screen.getByText("Deploy timeline")).toBeInTheDocument();
  expect(screen.getByText("Automation queue")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix web test -- overview-page.test.tsx`
Expected: FAIL because the new panels and routes are not rendered yet

- [ ] **Step 3: Implement the first route-driven workspace**

Create `web/src/routes/overview-page.tsx`:

```tsx
import { ServiceHealthPanel } from "../components/service-health-panel";
import { DeployTimeline } from "../components/deploy-timeline";
import { AutomationRunList } from "../components/automation-run-list";
import { RuntimeHealthPanel } from "../components/runtime-health-panel";

export function OverviewPage(): JSX.Element {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        <ServiceHealthPanel />
        <DeployTimeline />
      </div>
      <div className="grid gap-6">
        <RuntimeHealthPanel />
        <AutomationRunList />
      </div>
    </div>
  );
}
```

Update `web/src/App.tsx`:

```tsx
import { AppShell } from "./components/app-shell";
import { OverviewPage } from "./routes/overview-page";

export default function App(): JSX.Element {
  return (
    <AppShell>
      <OverviewPage />
    </AppShell>
  );
}
```

- [ ] **Step 4: Run the test to verify the overview workspace passes**

Run: `npm --prefix web test -- overview-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/routes web/src/components web/src/App.tsx web/src/test/overview-page.test.tsx
git commit -m "feat: rebuild core dashboard views in React"
```

## Task 5: Add the approvals inbox and browser-side approval actions

**Files:**
- Create: `web/src/routes/approvals-page.tsx`
- Create: `web/src/components/approval-inbox.tsx`
- Create: `web/src/hooks/use-approval-actions.ts`
- Modify: `src/dashboard/server.ts`
- Modify: `src/core/approval.ts`
- Modify: `tests/dashboard-api.test.ts`
- Create: `web/src/test/approvals-page.test.tsx`

- [ ] **Step 1: Write the failing approvals inbox test**

Create `web/src/test/approvals-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalsPage } from "../routes/approvals-page";

describe("approvals page", () => {
  it("renders a pending approval and exposes approve, hold, and reject actions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        approvals: [{ runId: "run-1", summary: "Rollback risk", risk: { level: "high", score: 82 }, githubTarget: "https://github.com/example/repo/issues/77" }]
      })
    })));

    render(<ApprovalsPage />);

    expect(await screen.findByText("Rollback risk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix web test -- approvals-page.test.tsx`
Expected: FAIL because there is no approvals route or backend payload yet

- [ ] **Step 3: Add backend approval listing and action endpoints with the existing run store**

Add to `src/core/approval.ts`:

```ts
export function listPendingApprovals(): Array<{
  runId: string;
  summary: string;
  risk: NonNullable<RunRecord["plan"]>["risk"] | null;
  githubTarget: string | null;
}> {
  return listRuns()
    .filter((run) => requireApproval(run.id).required && !run.approvals.some((entry) => entry.status === "approved"))
    .map((run) => ({
      runId: run.id,
      summary: run.plan?.summary ?? "No plan summary available.",
      risk: run.plan?.risk ?? null,
      githubTarget: run.githubTarget
    }));
}
```

Add to `src/dashboard/server.ts`:

```ts
if (method === "GET" && path === "/api/approvals") {
  sendJson(response, 200, { approvals: listPendingApprovals() });
  return;
}
```

- [ ] **Step 4: Run backend and frontend approval tests to verify they pass**

Run: `npm test -- tests/dashboard-api.test.ts`
Expected: PASS with `/api/approvals` covered

Run: `npm --prefix web test -- approvals-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/approval.ts src/dashboard/server.ts tests/dashboard-api.test.ts web/src/routes/approvals-page.tsx web/src/components/approval-inbox.tsx web/src/hooks/use-approval-actions.ts web/src/test/approvals-page.test.tsx
git commit -m "feat: add approvals inbox to dashboard frontend"
```

## Task 6: Bridge the backend to the new frontend and de-emphasize the legacy HTML renderer

**Files:**
- Modify: `package.json`
- Modify: `src/dashboard/main.ts`
- Modify: `src/dashboard/server.ts`
- Modify: `src/dashboard/ui.ts`
- Modify: `tests/dashboard-ui.test.ts`

- [ ] **Step 1: Write the failing integration expectation for the new frontend entry**

Update `tests/dashboard-ui.test.ts` with an expectation that the server either serves a minimal compatibility shell or clearly points at the React app:

```ts
expect(html).toContain("SentinelOps Control Center");
expect(html).toContain("dashboard-root");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/dashboard-ui.test.ts`
Expected: FAIL because the legacy HTML output has not been narrowed to the React handoff shell

- [ ] **Step 3: Add explicit frontend scripts and compatibility shell behavior**

Update `package.json` scripts:

```json
"dashboard:web": "npm --prefix web run dev",
"dashboard:web:build": "npm --prefix web run build"
```

Update `src/dashboard/ui.ts` to a minimal handoff shell:

```ts
export function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SentinelOps Control Center</title>
  </head>
  <body>
    <div id="dashboard-root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}
```

- [ ] **Step 4: Run compatibility tests and full test suites**

Run: `npm test`
Expected: PASS

Run: `npm --prefix web test`
Expected: PASS

Run: `npm --prefix web build`
Expected: PASS with Vite production bundle emitted

- [ ] **Step 5: Commit**

```bash
git add package.json src/dashboard/main.ts src/dashboard/server.ts src/dashboard/ui.ts tests/dashboard-ui.test.ts
git commit -m "feat: bridge backend dashboard server to React frontend"
```

## Task 7: Final verification and docs alignment

**Files:**
- Modify: `docs/superpowers/specs/2026-06-14-sentinelops-dashboard-vite-react-redesign-design.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-06-14-sentinelops-real-infra-rebuild-design.md`

- [ ] **Step 1: Add failing documentation expectation**

Create or update a lightweight docs test if one exists, otherwise use a manual verification checklist:

```md
- dashboard frontend runs from `web/`
- backend remains the API/SSE source of truth
- approvals inbox is available in the React dashboard
```

- [ ] **Step 2: Run the current docs verification**

Run: `npm test -- tests/skill-docs.test.ts`
Expected: PASS or reveal missing updated references

- [ ] **Step 3: Update docs to match the implemented stack**

Add a short README section:

```md
## Dashboard

- API server: `npm run dashboard:api`
- React frontend: `npm run dashboard:web`
- Build frontend: `npm run dashboard:web:build`
```

- [ ] **Step 4: Run full verification**

Run: `npm test`
Expected: PASS

Run: `npm --prefix web test`
Expected: PASS

Run: `npm --prefix web build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-06-14-sentinelops-dashboard-vite-react-redesign-design.md docs/superpowers/specs/2026-06-14-sentinelops-real-infra-rebuild-design.md
git commit -m "docs: align SentinelOps docs with React dashboard migration"
```

## Self-Review

### Spec coverage

- Vite + React frontend stack: covered by Tasks 1 and 2
- Tailwind and shadcn adoption: covered by Task 2
- Typed API and SSE consumption: covered by Task 3
- Responsive operator workspace: covered by Tasks 2 and 4
- Approvals inbox: covered by Task 5
- Migration away from `src/dashboard/ui.ts`: covered by Task 6
- Verification against real backend routes: covered by Tasks 3 through 7

### Placeholder scan

- No `TODO`, `TBD`, or deferred “write tests later” placeholders remain
- Every task includes explicit files and verification commands

### Type consistency

- Frontend uses `ServiceSummary`, `ServicesResponse`, and `DashboardEvent` consistently
- Backend approval listing is explicitly added before frontend approval actions depend on it

