---
name: sentinelops-core
description: Use when an agent is running the SentinelOps workflow and needs the global rules for context, planning, approval, testing, audit, and push gating.
---

# SentinelOps Core

Use this skill when working inside the SentinelOps repo or when another agent CLI is driving SentinelOps commands.

## Required Flow

1. Initialize or inspect local state with `npm run cli -- init --json` or `npm run cli -- status --json`.
2. If autonomous operation is requested, prefer live onboarding with `npm run cli -- onboard --repo <github-url-or-owner/repo> --slack-channel <channel> --json`.
3. For a Codex-driven live demo, use GitHub and Slack plugins as the real-world hands while SentinelOps remains the control plane.
2. Create or ingest context before planning.
3. Create a plan before preparing changes.
4. Collect tests and approval evidence before protected mutations.
5. Record audit and memory after the result is ready.

## Hard Rule

Never push, update PR branch, merge, close issue, deploy, rollback, or mark an incident resolved until `sentinelops push gate` succeeds.

## Command Spine

- live onboarding: `npm run cli -- onboard --repo https://github.com/example/repo --slack-channel #ops-approvals --json`
- operator setup: `npm run cli -- init --repo example/repo --slack-channel #ops-approvals --agent-command codex --agent-args "[\"exec\",\"--json\"]" --enabled true --json`
- operator config: `npm run cli -- config get --key operator --json`
- automation switch: `npm run cli -- automation enable --json` / `npm run cli -- automation disable --json`
- automation issue intake: `npm run cli -- automation seed-issue --target https://github.com/example/repo/issues/77 --service svc-api --json`
- automation approval: `npm run cli -- automation approve --job <job-id> --by <user> --json`
- automation agent run: `npm run cli -- automation run --job <job-id> --json`
- context from dashboard: `npm run cli -- dashboard ingest --service svc-api --json`
- context validation: `npm run cli -- context validate --file .sentinelops/context.json --json`
- plan creation: `npm run cli -- plan create --context .sentinelops/context.json --json`
- approval requirement: `npm run cli -- approval require --run <run-id> --json`
- push gate: `npm run cli -- push gate --run <run-id> --json`
- audit report: `npm run cli -- report create --run <run-id> --json`

## Plugin-First Live Demo

When the user provides a GitHub repo URL and Slack channel, run `onboard` first. Then:

1. Use the GitHub plugin to inspect the repo and issue.
2. Run `automation seed-issue` with the issue URL and service label.
3. Use the Slack plugin to post the approval text from `slackApproval.text`; include `runId` and `jobId` in the approval action payload.
4. After human approval, record it with `automation approve --job <job-id> --by <user>`.
5. Run `automation run --job <job-id>` only after approval.
6. Generate `github result-package --run <run-id>` and use the GitHub plugin to post the result back.
7. Keep `/automation` open so the user sees realtime job state.

## Common Mistakes

- Skipping context and planning because the issue looks obvious.
- Running automation while the operator config is disabled or missing the target repo.
- Treating approval as enough for high-risk changes without test evidence.
- Updating GitHub or incidents before the SentinelOps gate passes.
