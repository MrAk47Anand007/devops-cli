# devops-cli

`devops-cli` now contains the SentinelOps hackathon MVP: a terminal-first deploy-judgment agent that simulates telemetry, chooses `hold` or `rollback` with confidence, escalates when uncertain, and learns from human overrides.

## MVP Scope

In scope for this repo:

- deterministic simulated deploy telemetry for `healthy`, `degraded`, and `crash`
- confidence-scored judgment with reasoning and evidence
- terminal human-override flow
- JSON incident memory plus append-only audit logging
- canned decision mode so the demo works without network access

Explicitly out of scope for this implementation:

- real infra integrations
- Slack as a required path
- Kubernetes, Prometheus, Grafana, Loki, RBAC, ACP, and multi-tenant features
- the full-product platform roadmap

## Run It

1. Install dependencies with `npm install`
2. Start the MVP with `npm run start`
3. Run tests with `npm test`

If `OPENAI_API_KEY` is not set, SentinelOps automatically falls back to canned decisions for a stable offline demo.

## Portable CLI

SentinelOps can be attached to other agent CLIs through shell commands.

- `npm run cli -- simulate --scenario healthy --json`
- `npm run cli -- judge --scenario degraded --json --canned`
- `npm run cli -- decide --scenario degraded --override --json --canned`
- `npm run cli -- demo --json --canned`

Direct command shape for skill/tool wrappers:

- `sentinelops judge --scenario degraded --json`

Use JSON mode when another tool needs a stable machine-readable contract.

## Repo Guide

- [docs/superpowers/plans/2026-06-13-sentinelops-hackathon-mvp.md](/C:/Users/Anand/OneDrive%20-%20Xalta%20Technology%20Services%20Pvt%20Ltd/Desktop/SelfProjects/devops-cli/docs/superpowers/plans/2026-06-13-sentinelops-hackathon-mvp.md)
- [docs/superpowers/plans/2026-06-13-sentinelops-full-product.md](/C:/Users/Anand/OneDrive%20-%20Xalta%20Technology%20Services%20Pvt%20Ltd/Desktop/SelfProjects/devops-cli/docs/superpowers/plans/2026-06-13-sentinelops-full-product.md)
