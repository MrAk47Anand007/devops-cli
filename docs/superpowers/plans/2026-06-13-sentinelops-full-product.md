# SentinelOps Full-Product Development Plan

> **For agentic workers:** This is the post-hackathon roadmap. It is organized into **milestones**, each of which produces working, testable software and should be turned into its own detailed task-by-task plan (via the writing-plans skill) when you start it. Do NOT try to build this in one session — each milestone is 1–3 weeks of work. The hackathon MVP (`2026-06-13-sentinelops-hackathon-mvp.md`) is Milestone 0; everything here extends it from a simulated demo into a real product.

**Goal:** Turn the judgment-layer demo into a production agent that plugs into real CI/CD pipelines, watches real metrics, makes autonomous rollback/hold decisions with org-specific memory, negotiates with humans, and enforces strong configurable guardrails — distributed as a portable SKILL library usable by any coding agent (Codex, Claude Code, ACP clients).

**Architecture:** The MVP's five units harden into a service. The simulator is replaced by real metric sources (Prometheus/Grafana/Loki) behind an adapter interface. The JSON memory becomes a real store with similarity retrieval. A webhook ingress receives deploy events from GitHub/Jenkins/ArgoCD. A guardrail/RBAC layer gates every state-changing action. The whole capability set is also packaged as composable SKILL.md files plus a `devops-cli`, so the agent runs inside any host that speaks the skill protocol. **Differentiator to protect at every step: the judgment layer (confidence-scored decisions + human-override learning) — never let the plumbing dilute it.**

**Tech Stack:** Node/TypeScript, OpenAI API (runtime brain), SQLite→Postgres for state, Prometheus/Grafana/Loki clients, Slack/Teams SDKs, GitHub/Jenkins/ArgoCD webhooks, Kubernetes + Docker clients, ACP for transport.

---

## Design Principles (apply to every milestone)

- **Adapters, not integrations.** Every external system (metrics source, deploy target, chat platform, VCS) sits behind a small interface (`MetricSource`, `DeployTarget`, `ChatChannel`, `Trigger`). Adding "support GitLab" or "support Datadog" = one new adapter, zero changes to the agent core. This is what makes "plug and play" real instead of a slogan.
- **The agent core never imports a vendor SDK.** It depends only on the interfaces. This keeps the judgment layer testable and portable.
- **Every state-changing action passes through one guardrail gate.** No deploy, rollback, or secret access bypasses it.
- **Append-only audit for everything.** Who/what/when/approval-id, immutable.
- **Memory is the moat.** Every decision and every human override is recorded and feeds retrieval. Invest here disproportionately.

---

## Milestone 0 — Hackathon MVP (DONE / baseline)

See `2026-06-13-sentinelops-hackathon-mvp.md`. Delivers: simulator, judgment agent, JSON memory, Slack negotiation, deploy/rollback stub, audit log. Everything below replaces a simulated piece with a real one or adds a new capability.

---

## Milestone 1 — Real Metric Sources (replace the simulator)

**Outcome:** The agent reacts to real production telemetry instead of `simulator.ts`.

**Build:**
- Define `MetricSource` interface: `query(expr): Promise<Metrics>`, `baseline(window): Promise<Metrics>`, `subscribe(cb)`.
- `PrometheusSource` adapter (PromQL queries for error rate, p95 latency, throughput).
- `LokiSource` adapter (LogQL for error-log rate / specific error signatures).
- `GrafanaSource` adapter (read existing dashboards/alerts as a source).
- Baseline computation: rolling window (e.g. last 7 days, same hour-of-day) instead of the hardcoded constant.
- Anomaly detection upgrade: z-score / EWMA against the rolling baseline, not a fixed multiplier.

**Spec note when planning:** keep `MetricSource` swappable so the simulator stays usable for tests and demos.

---

## Milestone 2 — Real Deploy Triggers (webhook ingress)

**Outcome:** A real deploy in the user's pipeline wakes the agent automatically.

**Build:**
- `Trigger` interface + an HTTP ingress (Fastify/Express) verifying signatures.
- `GitHubTrigger`: receives `deployment`, `workflow_run`, `push`, PR-comment (`/approve`, `/retry`) events. Verify HMAC.
- `JenkinsTrigger`: post-build webhook.
- `ArgoCDTrigger`: sync/health-status webhook (or poll the ArgoCD API).
- Map each event → a `DeployEvent { deployId, service, sha, target }` the agent core consumes.
- `pipeline detect` skill: read the repo and document the existing CI/CD setup so the agent knows what it's plugged into.

---

## Milestone 3 — Real Deploy / Rollback Execution

**Outcome:** The agent's rollback decision actually rolls back a real deployment.

**Build:**
- `DeployTarget` interface: `rollback(deployId)`, `status(deployId)`, `currentRevision(service)`.
- `KubernetesTarget`: `kubectl rollout undo` / revision pinning via the k8s client.
- `ArgoCDTarget`: rollback to previous synced revision.
- `JenkinsTarget`: trigger a rollback job.
- **Dry-run mode** for every target (preview the action without executing) — required before first real use.
- Rollback verification: after rollback, re-poll metrics to confirm recovery; if not recovered, escalate.

---

## Milestone 4 — Guardrails, RBAC & Governance

**Outcome:** No unsafe or unauthorized action is possible; misconfiguration is caught before it matters.

**Build:**
- One `guard(action, context)` gate every state-changing path calls first.
- RBAC: who may approve/override which actions, stored in `config` and enforced at the gate (responsibility principle — the audit log records *who*).
- Threshold config: typed limits (error-rate ceiling, blast-radius, max auto-rollbacks/hour). Auto-reject on breach unless a `--manual-override` flag with an authorized approver is present.
- `config validate`: sanity-check the guardrail config itself (a misconfigured guardrail is worse than none).
- Secret scanning: scan any generated diff/config for committed secrets before approval.
- Append-only audit hardening (tamper-evident hash chain optional).

---

## Milestone 5 — Memory at Scale (the moat)

**Outcome:** Org-specific, queryable institutional memory of every failure and override.

**Build:**
- Move `incidents.json` → SQLite (then Postgres) with a schema for incidents, decisions, overrides, outcomes.
- Embedding-based retrieval (vector similarity over incident summaries) replacing keyword distance — only now, when volume justifies it (YAGNI'd in MVP on purpose).
- `memory build/query/update` over a real repo: ingest past incidents, postmortems, and resolved issues so the agent starts informed.
- Confidence calibration: track agent-confidence vs. actual outcome over time; recalibrate so "67%" means something.

---

## Milestone 6 — Multi-Channel Negotiation & Notification Hygiene

**Outcome:** Negotiation works across the org's actual chat tools without alert fatigue.

**Build:**
- `ChatChannel` interface; `SlackChannel` (from MVP) + `TeamsChannel` + ACP channel.
- PR-comment negotiation path (`/approve`, `/hold`, `/retry` as GitHub comments).
- Notification dedupe/throttle: collapse repeated alerts for the same root cause; one thread per incident.
- Escalation policy: if no human responds within N minutes, fall back to the configured safe default (usually hold) and record it.

---

## Milestone 7 — Issue Resolution & Postmortem Loop

**Outcome:** The agent closes the loop beyond rollback — it proposes fixes and learns from incidents.

**Build:**
- `devops-issue-resolver`: issue/prompt → memory query → plan (with diff preview + cost estimate + risk tags) → approval → code → sandbox test → PR. Diff always shown before approval.
- `devops-sandbox-testing`: auto-generate and run tests in an ephemeral workspace before any deploy.
- `devops-cost-awareness`: flag infra-changing plans (new VMs, scaling) before approval.
- `devops-postmortem`: after incident resolution, auto-generate a blameless postmortem and feed it back into memory.

---

## Milestone 8 — Packaging: SKILL Library + CLI + ACP

**Outcome:** "SKILL + CLI + plug-and-play" — the capability runs inside any coding agent.

**Build:**
- Extract each capability into a portable `SKILL.md` (devops-repo-memory, devops-pipeline-detect, devops-plan-creation, devops-approval-flow, devops-observability, devops-pipeline-deploy, devops-security-guardrails, devops-github, devops-docker, devops-kubernetes, devops-cost-awareness, devops-postmortem).
- `devops-cli` wrapping the adapters (the command tree from the original spec — build it last, once the engine is proven).
- `acp-serve`: expose the agent over the Agent Client Protocol as an optional transport.
- Multi-tenant: add `tenant_id`/`repo_id` to all stores from this milestone's schema (retrofitting later is expensive — design it in here).
- Docs + reference adapters so third parties can add their own metric source / deploy target.

---

## Suggested Build Order & Rationale

1. **M1 (real metrics)** and **M2 (real triggers)** first — they make the demo real without touching the differentiator.
2. **M3 (real rollback)** next — now the agent acts on the real world; gate it behind dry-run.
3. **M4 (guardrails)** immediately after M3 — never let real rollback exist without the gate.
4. **M5 (memory at scale)** — the moat; invest once there's real incident volume.
5. **M6/M7** — broaden negotiation and close the resolution loop.
6. **M8 (packaging)** last — extract to skills/CLI/ACP only once the engine is proven, so you're packaging something that works rather than guessing interfaces.

## What to Resist

- Don't build the 40-command CLI early. The CLI is a thin shell over adapters; building it before the adapters exist means rewriting it.
- Don't add Docker/k8s/GCP/AWS adapters speculatively. Add each only when a real user needs it — the adapter pattern makes it cheap to add on demand.
- Don't let any milestone ship a state-changing path that skips the guardrail gate.
- Protect the judgment layer's share of engineering time. Every milestone here is plumbing in service of that one differentiator.
