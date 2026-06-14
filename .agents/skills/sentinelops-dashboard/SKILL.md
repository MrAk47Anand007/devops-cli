---
name: sentinelops-dashboard
description: Use when an agent needs logs, alerts, deploys, incidents, or service health from the SentinelOps dummy dashboard API or CLI ingest path.
---

# SentinelOps Dashboard

Use this skill when troubleshooting starts from service telemetry instead of a direct prompt.

## Preferred Flow

1. Load a deterministic scenario when setting up a demo.
2. Ingest dashboard context for the affected service.
3. Read the normalized context before planning.
4. Resolve the dashboard incident only after the gated run is complete.

## Command Map

- load scenario: `npm run cli -- scenario load post-deploy-errors --json`
- dashboard ingest --service: `npm run cli -- dashboard ingest --service svc-api --json`
- show latest context: `npm run cli -- context show --latest --json`
- local API context: `GET /api/context/:serviceId`
- local API incident detail: `GET /api/incidents/:id`
- incident resolution: `npm run cli -- dashboard incident resolve --run <run-id> --incident inc-post-1 --json`

## Guardrails

- Prefer CLI ingest for agent workflows because it writes run state.
- Prefer API reads for UI or browser-led inspection.
- Do not mark incidents resolved before `sentinelops push gate` succeeds.
