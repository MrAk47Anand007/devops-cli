---
name: sentinelops-security
description: Use when an agent is handling production, config, secret, rollback, deploy, or other protected SentinelOps actions and needs policy or permission checks.
---

# SentinelOps Security

Use this skill when the change touches production, configuration, deployment, rollback, secrets, or other protected surfaces.

## Required Checks

1. Inspect current risk and policy violations.
2. Check whether the intended action is blocked.
3. Respect configured thresholds before deciding a run is safe.

## Command Map

- policy list: `npm run cli -- policy list --json`
- policy set threshold.high 90 --json
- policy check --plan latest: `npm run cli -- policy check --plan latest --json`
- policy explain --violation CRITICAL_RISK: `npm run cli -- policy explain --violation CRITICAL_RISK --json`
- permission check --action deploy: `npm run cli -- permission check --action deploy --json`

## Hard Rule

Critical-risk actions remain blocked unless an explicit policy path allows them. Approval alone is not enough.
