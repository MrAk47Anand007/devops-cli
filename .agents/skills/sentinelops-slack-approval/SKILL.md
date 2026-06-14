---
name: sentinelops-slack-approval
description: Use when an agent needs to request or record human approval for a SentinelOps run, especially before push, merge, deploy, or risky updates.
---

# SentinelOps Slack Approval

Use this skill when a run is medium, high, or critical risk and human signoff is required.

## Approval Package

Always include:

- plan summary
- risk level and reasons
- test evidence
- change summary or result package when available

## Command Map

- approval package --run: `npm run cli -- approval package --run <run-id> --include-plan --include-diff --include-tests --json`
- approval record: `npm run cli -- approval record --run <run-id> --source slack --status approved --by anand --json`
- approval status: `npm run cli -- approval status --run <run-id> --json`
- change tests: `npm run cli -- change test --run <run-id> --json`

Use the Slack-ready payload inside `package.pluginPayloads.slack` as the message handoff for a plugin or connector.
If the live Slack plugin is unavailable, use `npm run cli -- integration simulate --provider slack --run <run-id> --json` as the local fallback harness.

## Guardrails

- Slack is plugin-first, not CLI-implemented.
- Approval must be recorded in SentinelOps CLI even when the message exchange happened elsewhere.
- Approval does not bypass test evidence for high-risk runs.
