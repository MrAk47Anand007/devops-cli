---
name: sentinelops-testing
description: Use when an agent must discover tests, generate a SentinelOps test plan, run deterministic evidence, or report test results before a protected action.
---

# SentinelOps Testing

Use this skill whenever a run is preparing a change or approaching approval and push.

## Required Flow

1. Discover test capability.
2. Generate the test plan for the active target.
3. Run the plan and record results.
4. Include the report in approval or change summaries.

## Command Map

- test discover: `npm run cli -- test discover --json`
- test generate-plan --target: `npm run cli -- test generate-plan --target service --json`
- test run --plan latest: `npm run cli -- test run --plan latest --json`
- test report --run: `npm run cli -- test report --run <run-id> --json`
- change test: `npm run cli -- change test --run <run-id> --json`

## Guardrails

- High-risk changes require passing test evidence before push.
- Deterministic test output is still evidence and must be recorded in the run.
- Do not present a run as ready if tests are missing or failing.
