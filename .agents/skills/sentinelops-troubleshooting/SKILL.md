---
name: sentinelops-troubleshooting
description: Use when an agent must turn SentinelOps logs, alerts, incidents, and repo context into a likely cause, critical questions, and a remediation plan.
---

# SentinelOps Troubleshooting

Use this skill when a service is degraded, failing, or linked to an incident.

## Workflow

1. Ingest or validate context.
2. Inspect repo context if a GitHub target exists.
3. Create a plan from context or target.
4. Ask critical questions before risky fixes.

## Command Map

- context show: `npm run cli -- context show --latest --json`
- repo understand: `npm run cli -- repo understand --context .sentinelops/context.json --json`
- plan create --context: `npm run cli -- plan create --context .sentinelops/context.json --json`
- plan create --target: `npm run cli -- plan create --target https://github.com/example/repo/issues/77 --json`
- plan ask-critical: `npm run cli -- plan ask-critical --json`

## Common Mistakes

- Jumping from an alert to code edits without normalized context.
- Ignoring linked GitHub context when an incident already has one.
- Treating critical questions as optional for production or config risk.
