# SentinelOps Dashboard Vite + React Redesign

> Status: Approved in interactive design review on 2026-06-14.
> Scope: Redesign the current server-rendered dashboard UI and migrate it from inline HTML to a responsive Vite + React application using Tailwind CSS and shadcn where useful.
> Relationship to existing spec: This design complements `2026-06-14-sentinelops-real-infra-rebuild-design.md` and narrows in on the dashboard/frontend portion of Phases 7 and 8.

## Goal

Replace the current string-rendered HTML dashboard with a responsive React application that:

- keeps the existing Node dashboard server as the backend source of truth,
- consumes the real SentinelOps API and SSE event stream,
- improves responsiveness and operator usability on desktop, tablet, and mobile,
- adds spec-aligned product surfaces, especially an approvals inbox,
- preserves existing operational behavior during migration.

## Decisions

| Topic | Decision |
|---|---|
| Frontend stack | Vite + React + TypeScript |
| Styling | Tailwind CSS |
| Component strategy | shadcn primitives plus domain-specific components |
| Backend role | Existing Node dashboard server remains API/SSE backend |
| Migration shape | Frontend added as `web/` app first, then current HTML renderer is retired or reduced |
| UX direction | Dense, calm operator workspace instead of demo-style static HTML |

## Current State

The dashboard frontend now lives in `web/` as a Vite + React + Tailwind application with typed API hooks, route-level workspace views, and an approvals inbox.

`src/dashboard/server.ts` remains the backend source of truth for:

- `/api/*` routes
- `/api/events/stream`
- runtime snapshots
- webhook intake
- operator config and onboarding mutations

`src/dashboard/ui.ts` has been reduced to a compatibility shell that boots the React app and lets the backend serve built frontend assets.

What already exists and must be preserved:

- Dashboard API routes under `/api/*`
- SSE stream at `/api/events/stream`
- Runtime snapshot route at `/api/runtime/live`
- Scenario loading
- Services, logs, alerts, deploys, incidents
- Operator config and onboarding flows
- Automation job listing and execution
- GitHub and Slack webhook intake

The redesign is a UI-stack migration, not a backend rewrite.

## Architecture

### Backend

`src/dashboard/server.ts` remains the live backend entrypoint.

Responsibilities that stay on the backend:

- JSON API routes
- SSE event stream
- webhook handling
- runtime adapter health aggregation
- dashboard store access
- guarded config mutations

Responsibilities that move out of the backend-rendered HTML layer:

- page layout
- navigation
- responsive behavior
- view composition
- client-side event subscription and refresh logic

### Frontend

The frontend app at `web/` uses:

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui where it improves consistency and speed

The frontend talks to the existing backend over HTTP and SSE. It does not invent alternate state or mock-only flows.

## UX Structure

The new UI should feel like an operations workspace, not a marketing page and not a generic card mosaic.

### Layout model

- Desktop: left navigation, top status rail, central workspace, optional secondary detail panel
- Tablet: stacked workspace with collapsible sections and sheets
- Mobile: compressed navigation, drawer/sheet detail patterns, no fragile wide-first layout assumptions

### Primary views

1. Overview
   - service health
   - deploy timeline
   - incident activity
   - runtime adapter health
   - latest automation state

2. Automation
   - issue intake
   - approval status
   - job stage
   - transcript path
   - final execution outcome

3. Approvals
   - pending decisions
   - evidence and risk summary
   - GitHub target
   - approve, hold, reject actions from the browser

4. Integrations
   - operator config
   - adapter connection status
   - runtime revision details
   - test-connection affordances

5. Incident detail
   - linked GitHub context
   - related timeline entries
   - operational evidence and status

## Component Strategy

Use shadcn for general-purpose product primitives such as:

- `Sidebar`
- `Tabs`
- `Sheet`
- `Dialog`
- `Table`
- `Badge`
- `Alert`
- `Separator`
- `Skeleton`
- form inputs and selectors

Use custom domain components for SentinelOps-specific views such as:

- `ServiceHealthPanel`
- `DeployTimeline`
- `ApprovalInbox`
- `AutomationRunList`
- `RuntimeHealthPanel`
- `IncidentDetailPanel`

Rule: use shadcn to accelerate product UI composition, not to force every part of the app into generic components.

## Visual Direction

The dashboard should follow a restrained operator aesthetic:

- strong typography and spacing
- quiet surfaces
- status-driven accents
- readable dense information
- minimal decorative chrome

Avoid:

- hero sections
- demo-like glossy cards everywhere
- color noise
- oversized empty whitespace that hides operational context

## Data Flow

### Client data access

Create a small typed frontend API client instead of scattering raw `fetch` calls across components.

This client should handle:

- service listing
- context fetches
- incidents CRUD
- deploy/log/alert mutations
- operator config fetch and updates
- onboarding
- automation job reads and actions
- runtime snapshot reads
- event-stream subscription

### Live updates

The React app subscribes to `/api/events/stream` and refreshes the appropriate areas based on event type.

The SSE stream remains authoritative for live UI updates.

### Routing

Use React-side routing for primary app sections and incident detail views. Keep route structure simple and aligned to the operations model.

## Migration Plan

### Milestone 1

Stand up the new `web/` app and connect it to the existing backend.

Deliverables:

- Vite app scaffolded
- Tailwind configured
- shadcn initialized if adopted
- base app shell and navigation
- typed API client
- SSE client hook

### Milestone 2

Rebuild the current dashboard surfaces in React with improved responsiveness.

Deliverables:

- overview-equivalent workspace
- automation view
- integrations/config view
- incident detail behavior

### Milestone 3

Close the spec gap by adding the approvals inbox and aligning the product surface with the real-infra rebuild design.

Deliverables:

- approvals inbox
- browser approval actions
- evidence-first approval detail

### Milestone 4

Reduce or retire `src/dashboard/ui.ts` as the primary UI renderer.

Two acceptable end states:

1. Node backend serves only API/SSE and the Vite app runs separately in development and is deployed independently.
2. Node backend serves built frontend assets while still acting as the API/SSE backend.

The current implementation uses both:

- a dedicated frontend dev server with `npm run dashboard:web`
- a backend-served compatibility shell that loads the built React assets after `npm run dashboard:web:build`

## Testing Strategy

### Backend

Keep and extend backend verification for:

- API contracts
- SSE behavior
- webhook handling
- runtime health and config routes

### Frontend

Add frontend verification for:

- route rendering
- responsive navigation behavior
- key workspace panels
- event-driven refresh behavior
- approvals inbox rendering and actions

### End-to-end expectations

The new UI must be verified against the real backend routes, not only mocked data.

At minimum, verification must prove:

- the React app can load real dashboard state
- the SSE stream updates the UI
- existing operational mutations still work
- approvals and automation surfaces behave correctly

## Constraints

- Do not rewrite the SentinelOps backend just to accommodate the frontend.
- Do not drop existing dashboard capabilities during the migration.
- Do not introduce a frontend architecture that requires Next.js-specific assumptions.
- Do not keep the HTML string renderer as the long-term primary UI layer.
- Do not turn the operator workspace into a marketing-style landing page.

## Out of Scope

This design does not, by itself, define:

- full multi-channel chat adapter implementation beyond the approved backend direction
- memory-store migration to SQLite/Postgres
- new deploy-target or metric-source adapters
- packaging or ACP transport work

Those remain governed by the broader real-infra rebuild design.

## Success Criteria

This redesign is successful when:

- the dashboard UI runs as a Vite + React application,
- the app is responsive across desktop, tablet, and mobile,
- the UI consumes the real Node backend API and SSE stream,
- the current dashboard capabilities remain available,
- the approvals inbox exists as a first-class product surface,
- `src/dashboard/ui.ts` is no longer the primary long-term UI implementation.
