# SentinelOps Post-Hackathon Roadmap

> **Scope note:** This roadmap is intentionally excluded from the hackathon MVP so the project stays focused on a clean demo and a strong Codex submission. The shipped MVP is the starting point for everything below.

**Goal:** Grow the terminal-first deploy-judgment MVP into a production-capable agent that plugs into real CI/CD systems, observes real telemetry, enforces guardrails, and preserves the core differentiator: confidence-scored decisions that learn from human overrides.

**Architecture Direction:** The MVP stays the judgment core. Future work replaces simulated inputs with real adapters, replaces JSON stores with scalable memory, and adds production-grade safety and integration layers without diluting the judgment loop.

## Milestone 0 — Shipped MVP Baseline

The baseline already delivered in this repo is:

- simulated `healthy`, `degraded`, and `crash` telemetry
- anomaly-aware judgment with structured reasoning
- JSON incident memory and append-only audit logging
- terminal human-override flow
- reusable local CLI packaging for shell-capable agents
- canned demo-safe fallback mode

This baseline is intentionally lightweight and does **not** include real integrations, Slack as a required path, or production control-plane features.

## Milestone 1 — Real Metric Sources

- introduce a `MetricSource` abstraction
- add adapters for Prometheus, Loki, or Grafana-backed queries
- replace fixed baselines with rolling baseline calculations
- keep the simulator as a test and demo adapter

## Milestone 2 — Real Deploy Triggers

- define a trigger abstraction
- ingest real deploy events from GitHub, Jenkins, or ArgoCD
- normalize them into deploy events consumed by the judgment core

## Milestone 3 — Real Deploy / Rollback Targets

- define a `DeployTarget` abstraction
- add dry-run-capable rollback integrations
- verify post-action recovery before claiming success

## Milestone 4 — Guardrails and Governance

- add one centralized gate for state-changing actions
- define approval, override, and threshold policies
- extend audit fidelity and policy validation

## Milestone 5 — Memory at Scale

- replace JSON memory with SQLite or Postgres-backed incident history
- add richer similarity retrieval
- track calibration and real-world decision outcomes

## Milestone 6 — Multi-Channel Negotiation

- add optional Slack, Teams, or PR-comment negotiation channels
- keep the approval contract compatible with the terminal-first flow
- add dedupe and escalation policies

## Milestone 7 — Resolution and Postmortem Loop

- expand beyond rollback decisions into issue resolution support
- add testing, fix proposals, and postmortem generation
- preserve explicit human approval boundaries

## Milestone 8 — Broader Packaging

- grow the local CLI into a fuller agent-facing toolkit
- add more composable skills
- consider MCP or ACP exposure only after the CLI and service boundaries are mature

## Guardrails for Future Work

- do not dilute the product into a generic observability dashboard
- do not add adapters before the judgment core needs them
- do not ship autonomous state changes without guardrails
- do not let packaging work outrun working judgment behavior
