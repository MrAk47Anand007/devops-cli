---
name: sentinelops-core
description: Use when an agent is running the SentinelOps workflow and needs the global rules for context, planning, approval, testing, audit, and push gating.
---

# SentinelOps Core

Use this skill when working inside the SentinelOps repo or when another agent CLI is driving SentinelOps commands.

## Required Flow

1. Initialize or inspect local state with `npm run cli -- init --json` or `npm run cli -- status --json`.
2. Create or ingest context before planning.
3. Create a plan before preparing changes.
4. Collect tests and approval evidence before protected mutations.
5. Record audit and memory after the result is ready.

## Hard Rule

Never push, update PR branch, merge, close issue, deploy, rollback, or mark an incident resolved until `sentinelops push gate` succeeds.

## Command Spine

- context from dashboard: `npm run cli -- dashboard ingest --service svc-api --json`
- context validation: `npm run cli -- context validate --file .sentinelops/context.json --json`
- plan creation: `npm run cli -- plan create --context .sentinelops/context.json --json`
- approval requirement: `npm run cli -- approval require --run <run-id> --json`
- push gate: `npm run cli -- push gate --run <run-id> --json`
- audit report: `npm run cli -- report create --run <run-id> --json`

## Common Mistakes

- Skipping context and planning because the issue looks obvious.
- Treating approval as enough for high-risk changes without test evidence.
- Updating GitHub or incidents before the SentinelOps gate passes.
