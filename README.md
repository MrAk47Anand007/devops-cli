# devops-cli

`devops-cli` is the workspace for SentinelOps: an AI-assisted DevOps CLI and agent workflow focused on deploy judgment, rollback decisions, human approvals, and operational memory.

## Current Status

This repository currently contains the planning documents for:

- A hackathon MVP that simulates production metrics, makes confidence-scored rollback decisions, and learns from human overrides
- A full-product roadmap that evolves the MVP into a real integration layer for CI/CD, metrics, chat, and deployment systems

## Repository Contents

- `docs/superpowers/plans/2026-06-13-sentinelops-hackathon-mvp.md`
- `docs/superpowers/plans/2026-06-13-sentinelops-full-product.md`

## Direction

The long-term goal is to turn SentinelOps into a portable DevOps agent and CLI that can:

- watch deploy events and production signals
- decide whether to hold or roll back with a confidence score
- ask humans for approval when uncertainty is high
- learn from overrides and improve future decisions
- integrate cleanly with tools like GitHub, Jenkins, ArgoCD, Prometheus, Grafana, Loki, Slack, and Teams
