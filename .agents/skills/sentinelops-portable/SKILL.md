---
name: sentinelops-portable
description: Use when an agent needs a local deploy-judgment tool with deterministic simulation, JSON-safe output, or reusable rollback-vs-hold decisions from the SentinelOps MVP.
---

# SentinelOps Portable

Use this skill when a shell-capable agent needs SentinelOps as a local tool instead of an interactive demo.

## Command Map

- simulate metrics: `npm run cli -- simulate --scenario degraded --json`
- inspect a judgment: `npm run cli -- judge --scenario degraded --json --canned`
- execute a decision with explicit human input: `npm run cli -- decide --scenario degraded --override --json --canned`
- run the three-step MVP story: `npm run cli -- demo --json --canned`

Direct command shape for wrappers and future packaging:

- `sentinelops judge --scenario degraded --json`

## Guidance

- Prefer `--json` when another tool or agent will parse the output.
- Prefer `--canned` when stable offline behavior matters more than live model judgment.
- The CLI writes local JSON memory and audit state on `decide` and `demo`, but not on `judge`.
