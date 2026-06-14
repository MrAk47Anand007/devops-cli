---
name: sentinelops-github
description: Use when an agent is fixing a GitHub issue or PR through SentinelOps and needs the approved result package, repo context, or target-based planning path.
---

# SentinelOps GitHub

Use this skill when the triggering object is a GitHub issue or pull request.

## Required Pattern

1. Understand the repo before editing.
2. Create a plan from the GitHub target when possible.
3. Prepare the change package locally.
4. Produce a result package after approval and tests.

## Command Map

- repo context: `npm run cli -- repo understand --context .sentinelops/context.json --json`
- target plan: `npm run cli -- plan create --target https://github.com/example/repo/issues/77 --json`
- change package: `npm run cli -- change prepare --target https://github.com/example/repo/issues/77 --json`
- change summary: `npm run cli -- change summarize --run <run-id> --json`
- github result-package --run: `npm run cli -- github result-package --run <run-id> --json`

Use `resultPackage.pluginPayloads.github` as the GitHub-plugin handoff for comment or status updates.
If the live GitHub plugin is unavailable, use `npm run cli -- integration simulate --provider github --run <run-id> --json` as the local fallback harness.

## Guardrails

- Do not mutate GitHub state before the SentinelOps gate passes.
- Use the GitHub plugin for live GitHub reads and writes when available.
- Keep SentinelOps CLI responsible for policy, approval, audit, and packaging.
