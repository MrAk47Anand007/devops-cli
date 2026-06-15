# SentinelOps Real-Infra Rebuild — Design & Phased Plan

> **Status:** Design approved in brainstorming (2026-06-14). This spec covers the whole
> vision; each phase below becomes its own implementation plan (via writing-plans) when started.
> **Do not build this in one session.** The judgment layer is the differentiator — every phase
> here is plumbing in service of it, and no phase may dilute it.

## Goal

Turn the current simulated SentinelOps demo into a **production-capable, server-backed DevOps
agent** that:

- reacts to **real telemetry** (Prometheus + Grafana),
- acts on **real deploy targets** (Kubernetes + Docker) through a guarded, dry-run-first path,
- runs its judgment brain on **any AI CLI/SDK** (OpenAI, Anthropic, or a spawned `codex`/`claude` CLI),
- exposes a **live ops dashboard** where a DevOps user sees all service health, deployments,
  automation pipelines, and approvals — and edits config/connections safely,
- keeps the **simulator as a test/demo adapter**, never on the real path.

## Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| End goal | Real infra, production-capable (simulator only for tests/demo) |
| Rebuild strategy | Refactor in place around adapter interfaces |
| Adapters required | Prometheus, Grafana, Kubernetes, Docker |
| AI brain | `JudgmentBrain` interface: OpenAI SDK + Anthropic SDK + generic AI-CLI-spawn adapters |
| Dashboard | Server-side, live (SSE/WebSocket), config-editable, RBAC + audit gated |
| Plan shape | Phased milestones — one spec, separate implementation plan per phase |

---

## Architecture — the adapter spine

```
  CLI · Dashboard API · Webhook ingress            ← entrypoints
                  │
        AGENT CORE (imports NO vendor SDK)
  judge() · memory · guard() gate · automation · planning
   │        │         │           │          │
 Metric   Deploy   Judgment     Chat      Trigger        ← interfaces
 Source   Target    Brain      Channel
   │        │         │           │          │
 Prometheus K8s     OpenAI      Slack      GitHub
 Grafana    Docker  Anthropic   Teams      Jenkins
 Simulator  Sim     AI-CLI      ACP        ArgoCD
 (test)     (dryrun) Canned(test)          Simulator
```

**Design principles (apply to every phase):**

- **Adapters, not integrations.** Each external system sits behind a small interface. Adding a
  vendor = one new adapter, zero core changes.
- **The core never imports a vendor SDK.** It depends only on interfaces. Keeps the judgment
  layer testable and portable.
- **Every state-changing action passes through one `guard()` gate.** No deploy, rollback, secret
  access, or config write bypasses it.
- **Append-only audit for everything** — who/what/when/approval-id, immutable.
- **Memory is the moat** — every decision and human override is recorded and feeds retrieval.

---

## The five interfaces

### `MetricSource`
```ts
interface MetricSource {
  id: string;
  query(expr: string): Promise<Metrics>;
  baseline(window: BaselineWindow): Promise<Metrics>;   // rolling, e.g. 7d same-hour
  subscribe(cb: (m: Metrics) => void): Unsubscribe;
  health(): Promise<AdapterHealth>;
}
```
Adapters: `PrometheusSource` (PromQL: error rate, p95, throughput), `GrafanaSource`
(read dashboards/alerts as a source), `SimulatorSource` (current `simulator.ts`, test/demo).
Anomaly detection upgrades from fixed multiplier → **z-score / EWMA against rolling baseline**.

### `DeployTarget`
```ts
interface DeployTarget {
  id: string;
  status(deployId: string): Promise<DeployStatus>;
  currentRevision(service: string): Promise<Revision>;
  rollback(deployId: string, opts: { dryRun: boolean }): Promise<RollbackResult>;
  health(): Promise<AdapterHealth>;
}
```
Adapters: `KubernetesTarget` (`kubectl rollout undo`/revision pinning via k8s client),
`DockerTarget` (container status/logs/restart, compose rollback), `SimulatorTarget` (dry-run stub).
**Dry-run mode is mandatory on every target before first real use.** After any rollback,
re-poll metrics to confirm recovery; escalate if not recovered.

### `JudgmentBrain`
```ts
interface JudgmentBrain {
  id: string;
  decide(input: JudgmentInput): Promise<Decision>;   // Decision schema unchanged
  health(): Promise<AdapterHealth>;
}
```
Adapters: `OpenAiBrain` (current logic), `AnthropicBrain`, `AiCliBrain` (spawns `codex`/`claude`
exec, parses structured JSON — reuses `agent-runner.ts` plumbing), `CannedBrain` (test/offline).
Selected via operator config. **The Decision schema and confidence/evidence/override semantics do
not change** — only where the inference runs.

### `ChatChannel`
```ts
interface ChatChannel {
  id: string;
  postApproval(pkg: ApprovalPackage): Promise<ThreadRef>;
  awaitDecision(ref: ThreadRef, timeoutMs: number): Promise<HumanDecision>;
  notify(ref: ThreadRef, update: string): Promise<void>;
}
```
Adapters: `SlackChannel`, `TeamsChannel`, `GitHubCommentChannel` (`/approve` `/hold` `/retry`),
`AcpChannel`, `SimulatorChannel`. Dedupe/throttle: one thread per incident; escalation policy
falls back to safe default (hold) after N minutes and records it.

### `Trigger`
```ts
interface Trigger {
  id: string;
  // HTTP ingress maps inbound events → DeployEvent the core consumes
  toDeployEvent(raw: RawWebhook): DeployEvent | null;   // { deployId, service, sha, target }
  verifySignature(raw: RawWebhook): boolean;            // HMAC
}
```
Adapters: `GitHubTrigger` (deployment/workflow_run/push/PR-comment), `JenkinsTrigger`,
`ArgoCDTrigger` (sync/health webhook or poll), `SimulatorTrigger`.

---

## The guard gate (safety spine)

One `guard(action, context)` function every state-changing path calls first — used by CLI,
dashboard, and automation alike:

- **RBAC** — who may approve/override/edit which actions; enforced at the gate, recorded in audit.
- **Typed thresholds** — error-rate ceiling, blast-radius, max auto-rollbacks/hour. Auto-reject on
  breach unless an authorized `--manual-override` is present.
- **`config validate`** — sanity-checks the guardrail config itself; rejects unsafe states (e.g.
  all approval gates disabled). Loosening a critical threshold may require a second approver.
- **Secret scanning** — scan any generated diff/config for committed secrets before approval.
- **Append-only audit** — tamper-evident hash chain (optional).

---

## Live ops dashboard (server-backed)

Real-time console backed by the **same adapters** the CLI uses (no separate mock data). The
current UI migration path uses a responsive React frontend under `web/` while the Node backend
remains authoritative for API, SSE, webhook, and config flows. Updates **push** to the browser via
SSE/WebSocket from the core's event stream.

Views:
1. **Services & health** — live health from `MetricSource`, current revision, last SHA; click → metric charts vs. rolling baseline.
2. **Deployments timeline** — every `Trigger` deploy event with the agent's judgment attached (decision, confidence, evidence, hold/rollback/escalate).
3. **Automation pipeline** — each autonomous job (issue → plan → diff → test → approval → push) with live stage, AI-CLI transcript, and guard result.
4. **Approvals inbox** — pending decisions with full evidence; approve/hold/reject from the browser (mirrors chat).
5. **Audit & memory** — searchable append-only audit + incident memory.

**Config & control surface** (extends current operator-config panel):
- Operator config (repos, channels, chosen AI brain, enabled flag).
- Adapter connections (Prometheus URL, Grafana URL/token, kubeconfig context, Docker host) each with a **Test connection** button (`adapter.health()`).
- Guardrail thresholds + automation master toggle.
- **All config writes go through `guard()` + `config validate`, are RBAC-gated, and audited.** Tightening is easy; loosening safety is gated, optionally needing a second approver.

---

## Memory at scale

- `incidents.json` → SQLite (then Postgres) with schema for incidents/decisions/overrides/outcomes.
- Embedding-based retrieval (vector similarity over incident summaries) replacing keyword distance — **only when volume justifies it.**
- `memory build/query/update` over a real repo to start informed.
- **Confidence calibration** — track agent-confidence vs. actual outcome; recalibrate so "67%" means something.
- Add `tenant_id`/`repo_id` to all stores **from the first schema** (retrofitting later is expensive).

---

## Phased implementation plan

Each phase ships working, testable software and gets its own writing-plans plan when started.

### Phase 1 — Interface extraction & simulator-as-adapter (foundation)
Introduce the five interfaces. Migrate all existing simulated code to sit behind them as the
`Simulator*` adapter set. Wire `judge()` to take a `MetricSource` + `JudgmentBrain` by injection.
**No behavior change, all current tests still pass.** This de-risks everything after it.

### Phase 2 — Real metrics (Prometheus + Grafana)
`PrometheusSource` + `GrafanaSource`. Rolling baseline + z-score/EWMA anomaly detection.
`integration health` + dashboard "Test connection" for both. Simulator stays for tests.

### Phase 3 — Pluggable judgment brain
`JudgmentBrain` interface real: `OpenAiBrain`, `AnthropicBrain`, `AiCliBrain` (codex/claude spawn),
`CannedBrain`. Brain selectable via operator config + dashboard. Decision semantics unchanged.

### Phase 4 — Real deploy targets (Kubernetes + Docker), dry-run first
`KubernetesTarget` + `DockerTarget`. **Dry-run mode mandatory.** Post-rollback metric
re-verification + escalation. Gated entirely behind Phase 5's `guard()`.

### Phase 5 — Guardrails, RBAC & governance
The single `guard()` gate on every state-changing path (CLI, dashboard, automation). RBAC,
typed thresholds, `config validate`, secret scanning, audit hardening. **Lands with/before Phase 4
goes live — no real rollback without the gate.**

### Phase 6 — Real triggers (webhook ingress)
`GitHubTrigger` / `JenkinsTrigger` / `ArgoCDTrigger` with HMAC verification, mapping to
`DeployEvent`. `pipeline detect` reads the repo's CI/CD setup.

### Phase 7 — Live dashboard upgrade
SSE/WebSocket event stream from the core. The five views + config/control surface above.
Replaces the legacy inline HTML demo UI with the React/Tailwind operator workspace; backed by real
adapters.

### Phase 8 — Multi-channel negotiation & resolution loop
`ChatChannel` real adapters (Slack/Teams/GitHub-comment/ACP), dedupe/throttle, escalation policy.
Issue-resolver + sandbox-testing + cost-awareness + postmortem loop.

### Phase 9 — Memory at scale
SQLite→Postgres, vector retrieval, confidence calibration, multi-tenant schema.

### Phase 10 — Packaging: SKILL library + CLI + ACP
Refresh the `.agents/skills/` suite against the now-real adapters. `acp-serve` transport.
Docs + reference adapters so third parties add their own metric source / deploy target.

### Build-order rationale
1. **P1 (interfaces)** first — everything else plugs into it; zero risk.
2. **P2 (metrics) + P3 (brain)** — make the demo real without touching deploy safety.
3. **P5 (guardrails) before/with P4 (rollback)** — never let real rollback exist without the gate.
4. **P6 (triggers) + P7 (dashboard)** — close the real-world loop, give the user eyes.
5. **P8/P9** — broaden negotiation and grow the moat.
6. **P10 (packaging)** last — package something proven, not guessed.

### What to resist
- Don't build speculative adapters (GitLab, Datadog, AWS) before a real user needs them — the
  pattern makes them cheap to add on demand.
- Don't let any phase ship a state-changing path that skips `guard()`.
- Don't grow the CLI/skills ahead of the adapters they wrap.
- Protect the judgment layer's share of engineering time above all else.

## Testing strategy

- Every interface has a `Simulator*`/`Canned*` adapter → core logic stays fully unit-testable offline.
- Real adapters get integration tests behind an env flag (skipped in CI without creds).
- Existing test suite must stay green through Phase 1 (the refactor is behavior-preserving).
- Dashboard: API contract tests + event-stream tests against the simulator adapters.
