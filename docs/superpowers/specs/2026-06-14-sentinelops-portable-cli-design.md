# SentinelOps Portable CLI Design

## Summary

Package the existing SentinelOps hackathon MVP as a portable local tool that any agent-oriented CLI can invoke. The integration target is CLI-first, with a reusable skill layer on top for Codex, Claude-style skills, and similar agent runners.

This design keeps the current MVP behavior intact while separating three concerns:

- core deploy-judgment logic
- command-line interface and machine-readable output
- agent-facing usage instructions

## Goals

- Expose SentinelOps through stable local commands instead of only `npm run start`
- Support both human-readable and JSON output for agent automation
- Make the same package callable from Codex, Claude, or any shell-capable tool
- Preserve the terminal-first MVP flow, canned mode, and JSON memory/audit behavior

## Non-Goals

- No MCP server in this pass
- No Slack integration in this pass
- No real infrastructure adapters in this pass
- No product-roadmap features beyond portable packaging

## Recommended Approach

### Option A: CLI-first with reusable skill wrapper

This is the recommended approach.

- Build a small `sentinelops` command entrypoint
- Keep business logic in reusable modules under `src/`
- Add commands that agents can invoke with strict JSON responses
- Add a thin local `SKILL.md` that teaches an agent when and how to call the CLI

Why this is best:

- works everywhere a shell command works
- keeps the portable contract simple and inspectable
- avoids locking the MVP into one agent platform
- leaves room to add MCP later without rewriting core logic

### Option B: Skill-only integration

- Add only a local skill and keep `npm run start` as the execution path

Trade-off:

- fast, but weak for automation
- output contract is unstable for machine consumers
- shells and other tools would need brittle parsing

### Option C: MCP/server-first

- Wrap the logic in a local server and expose tools directly

Trade-off:

- more future-friendly for tool-native agents
- too much overhead for this packaging pass
- introduces protocol, lifecycle, and deployment complexity before the CLI contract is stable

## Architecture

### 1. Core Modules

Keep the current modules as the domain layer:

- `src/simulator.ts`
- `src/agent.ts`
- `src/memory.ts`
- `src/deploy.ts`
- `src/types.ts`

Add a service-level orchestration module so both the interactive demo and CLI commands can reuse the same logic without duplicating behavior:

- `src/service.ts`

Responsibilities:

- execute scenario simulation
- run judgment
- handle optional human decision input passed in by the caller
- record incidents and audit entries
- return structured results

### 2. CLI Layer

Add a dedicated CLI entrypoint:

- `src/cli.ts`

Commands:

- `sentinelops simulate --scenario <healthy|degraded|crash> [--json]`
- `sentinelops judge --scenario <healthy|degraded|crash> [--json] [--canned]`
- `sentinelops decide --scenario <healthy|degraded|crash> [--approve|--override] [--json] [--canned]`
- `sentinelops demo [--json] [--canned]`

Command intent:

- `simulate`: return the deterministic telemetry snapshot only
- `judge`: return the structured decision without mutating memory or audit state
- `decide`: execute the judgment path plus optional explicit human decision and persistence
- `demo`: run the full 3-step story in a non-interactive programmable way

### 3. Output Contract

Every command must support:

- text mode for humans
- JSON mode for agents

JSON responses should include explicit command-specific envelopes so consumers do not need to infer structure. Example shapes:

```json
{
  "ok": true,
  "command": "judge",
  "scenario": "degraded",
  "metrics": {
    "timestamp": 1781420801933,
    "errorRate": 0.044,
    "latencyP95": 372,
    "requestsPerSec": 605
  },
  "decision": {
    "action": "hold",
    "confidence": 67,
    "reasoning": "The deploy is degraded but not conclusively failing, so the agent should escalate unless a prior human precedent tips the balance.",
    "evidence": [
      "Error rate is 4.40% versus baseline 0.40%."
    ],
    "similarIncidentId": "INC-2026-05-02"
  }
}
```

```json
{
  "ok": true,
  "command": "decide",
  "scenario": "degraded",
  "humanDecision": "override",
  "finalAction": "rollback",
  "incidentRecorded": true,
  "autonomous": false
}
```

Error responses should use a consistent shape:

```json
{
  "ok": false,
  "command": "judge",
  "error": {
    "code": "INVALID_SCENARIO",
    "message": "Scenario must be one of healthy, degraded, or crash."
  }
}
```

### 4. Agent Skill Layer

Add a reusable local skill under:

- `.agents/skills/sentinelops-portable/SKILL.md`

The skill should:

- tell the agent when to use SentinelOps
- prefer JSON mode for machine use
- map common intents to commands
- document that this package is terminal-first and local-state-based

The skill must not re-implement logic or duplicate long docs from the repo. It should point the agent to commands and the repository guide.

### 5. Documentation

Update:

- `README.md`

Add:

- `docs/superpowers/specs/2026-06-14-sentinelops-portable-cli-design.md`
- a short CLI usage section in the README

The README should explain:

- what command to run
- how JSON mode works
- how another agent tool can attach to it
- what remains out of scope

## Data Flow

### `judge`

1. parse CLI args
2. simulate metrics for the scenario
3. call judgment logic
4. print decision as text or JSON

### `decide`

1. parse CLI args
2. simulate metrics for the scenario
3. call judgment logic
4. apply explicit human decision if supplied
5. record audit entry and incident memory
6. print structured result

### `demo`

1. run healthy flow
2. run degraded flow with caller-provided or default human action
3. run crash flow
4. emit a result list suitable for demos or agent assertions

## Error Handling

- invalid scenario: fail fast with clear exit code and JSON error envelope
- missing OpenAI key: automatically use canned mode unless explicitly forbidden later
- file-store path issues: create missing JSON files/directories where safe
- malformed JSON state: return explicit error rather than silently resetting data

## Testing Strategy

Add TDD coverage for the packaging layer:

- CLI parsing for each command
- JSON output envelopes
- `judge` command is read-only
- `decide` command writes memory/audit
- `demo` command returns all three stages
- skill file presence and documentation references may be smoke-checked if practical

Use temp file paths in tests so packaged commands do not mutate committed seed data.

## Success Criteria

- Another shell-based agent can invoke `sentinelops judge --scenario degraded --json`
- The returned JSON is stable and parseable without scraping text output
- The `decide` path can accept an explicit override from the caller
- The interactive MVP still works
- README and skill docs make the integration discoverable

## Open Questions Resolved

- Primary integration surface: CLI
- Skill wrapper role: thin orchestration guide, not business logic
- Roadmap features: intentionally excluded from this pass
