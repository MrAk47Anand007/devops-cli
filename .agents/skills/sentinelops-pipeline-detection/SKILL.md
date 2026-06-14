---
name: sentinelops-pipeline-detection
description: Use when an agent needs to infer the current repository test and pipeline shape before planning or packaging a SentinelOps change.
---

# SentinelOps Pipeline Detection

Use this skill before change preparation when the repository setup is not yet clear.

## What to Inspect

- package manager
- test framework
- available scripts
- CI workflow presence

## Command Map

- repo understand --context: `npm run cli -- repo understand --context .sentinelops/context.json --json`
- test discover: `npm run cli -- test discover --json`
- integration health: `npm run cli -- integration health --json`

## Guidance

- Prefer repo understanding before guessing test or pipeline commands.
- For the hackathon build, GitHub Actions detection or local workflow metadata is enough.
- Keep real Jenkins or deployment integrations out of scope unless the repo already contains them.
