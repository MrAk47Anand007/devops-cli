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
- the post-hackathon roadmap

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

## SentinelOps Skills

The repo now ships a dedicated SentinelOps skill suite under `.agents/skills/`:

- `sentinelops-core`
- `sentinelops-dashboard`
- `sentinelops-github`
- `sentinelops-slack-approval`
- `sentinelops-troubleshooting`
- `sentinelops-testing`
- `sentinelops-security`
- `sentinelops-pipeline-detection`

## SentinelOps CLI Core

The first real SentinelOps control layer now lives under a local `.sentinelops/` workspace state directory and supports:

- `npm run cli -- init --json`
- `npm run cli -- status --json`
- `npm run cli -- config get --json`
- `npm run cli -- config set threshold.high 60 --json`
- `npm run cli -- config get --key threshold.high --json`
- `npm run cli -- integration list --json`
- `npm run cli -- integration health --json`
- `npm run cli -- integration simulate --provider slack --run <run-id> --json`
- `npm run cli -- integration simulate --provider github --run <run-id> --json`
- `npm run cli -- scenario load post-deploy-errors --json`
- `npm run cli -- dashboard ingest --service svc-api --json`
- `npm run cli -- dashboard incident resolve --run <run-id> --incident inc-post-1 --json`
- `npm run cli -- context create --service svc-api --json`
- `npm run cli -- context show --latest --json`
- `npm run cli -- context validate --file .sentinelops/context.json --json`
- `npm run cli -- repo understand --context .sentinelops/context.json --json`
- `npm run cli -- repo memory show --json`
- `npm run cli -- repo memory update --run <run-id> --json`
- `npm run cli -- plan create --context .sentinelops/context.json --json`
- `npm run cli -- plan create --target https://github.com/example/repo/issues/77 --json`
- `npm run cli -- plan create --prompt "fix config issue in production service" --json`
- `npm run cli -- plan show --latest --json`
- `npm run cli -- plan ask-critical --json`
- `npm run cli -- plan risk --plan latest --json`
- `npm run cli -- change prepare --target https://github.com/example/repo/issues/77 --json`
- `npm run cli -- change diff --run <run-id> --json`
- `npm run cli -- change test --run <run-id> --json`
- `npm run cli -- change summarize --run <run-id> --json`
- `npm run cli -- test discover --json`
- `npm run cli -- test generate-plan --target service --json`
- `npm run cli -- test run --plan latest --json`
- `npm run cli -- test report --run <run-id> --json`
- `npm run cli -- approval package --run <run-id> --json`
- `npm run cli -- approval package --run <run-id> --include-plan --include-diff --include-tests --json`
- `npm run cli -- approval record --run <run-id> --source slack --status approved --by anand --json`
- `npm run cli -- approval status --run <run-id> --json`
- `npm run cli -- approval require --run <run-id> --json`
- `npm run cli -- policy list --json`
- `npm run cli -- policy set threshold.high 90 --json`
- `npm run cli -- policy check --plan latest --json`
- `npm run cli -- policy explain --violation CRITICAL_RISK --json`
- `npm run cli -- permission check --action deploy --json`
- `npm run cli -- push gate --run <run-id> --json`
- `npm run cli -- github result-package --run <run-id> --json`
- `npm run cli -- audit list --json`
- `npm run cli -- audit show <run-id> --json`
- `npm run cli -- report create --run <run-id> --json`
- `npm run cli -- memory record --run <run-id> --json`
- `npm run cli -- memory search --target svc-api --json`

This is the foundation for the later dummy dashboard, GitHub workflow, and Slack approval wiring from the final hackathon plan.

Plugin-ready payloads are included in:

- `approval package` under `package.pluginPayloads.slack`
- `github result-package` under `resultPackage.pluginPayloads.github`

If live plugins are unavailable, use `integration simulate` as the local fallback harness for those payloads.

## Dummy Dashboard API

The hackathon dashboard backend is now available as a local HTTP API backed by deterministic scenario fixtures plus mutable demo records.

- `npm run dashboard:api`
- `POST /api/scenarios/load` with `{"scenario":"post-deploy-errors"}`
- `GET /api/services`
- `GET /api/services/:id`
- `GET /api/context/:serviceId`
- `GET /api/incidents/:id`
- `GET|POST /api/logs`
- `GET|POST /api/alerts`
- `GET|POST /api/deploys`
- `GET|POST /api/incidents`
- `PATCH /api/incidents/:id`

The default port is `4100`. Set `SENTINELOPS_DASHBOARD_PORT` to override it.

The browser dashboard now includes:

- scenario loader
- service list with health and linked GitHub references
- logs table
- alert table
- deploy and incident timeline
- incident detail deep links at `/incidents/:id`
- manual forms for logs, alerts, deploys, and incidents

## Hackathon Demo

Run the written hackathon flow end to end with:

- `npm run demo:hackathon`

This executes the same demo path from the final plan: load `post-deploy-errors`, ingest dashboard context, create a plan, prepare a change, run tests, package Slack approval, simulate Slack, record approval, pass the gate, prepare the GitHub result package, simulate GitHub handoff, record the final push, resolve the dashboard incident, and create the final report.

## Repo Guide

- [docs/superpowers/plans/2026-06-13-sentinelops-hackathon-mvp.md](/C:/Users/Anand/OneDrive%20-%20Xalta%20Technology%20Services%20Pvt%20Ltd/Desktop/SelfProjects/devops-cli/docs/superpowers/plans/2026-06-13-sentinelops-hackathon-mvp.md)
- [docs/superpowers/plans/2026-06-13-sentinelops-post-hackathon-roadmap.md](/C:/Users/Anand/OneDrive%20-%20Xalta%20Technology%20Services%20Pvt%20Ltd/Desktop/SelfProjects/devops-cli/docs/superpowers/plans/2026-06-13-sentinelops-post-hackathon-roadmap.md)
