# SentinelOps Portable CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the SentinelOps hackathon MVP as a reusable local CLI plus agent skill wrapper that any shell-capable agent can invoke safely.

**Architecture:** Keep deploy-judgment logic in reusable modules, add a service layer for structured orchestration, and expose stable commands through a dedicated CLI entrypoint. Layer a thin local skill on top so Codex, Claude-style agents, and similar tools can discover and call the CLI in JSON mode.

**Tech Stack:** Node 24, TypeScript, tsx, vitest, zod, dotenv

---

### Task 1: Service Layer Extraction

**Files:**
- Create: `src/service.ts`
- Modify: `src/main.ts`
- Modify: `src/types.ts`
- Test: `tests/service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeDecisionFlow, simulateScenario } from "../src/service.js";
import type { Incident } from "../src/types.js";

const seededIncident: Incident = {
  id: "INC-2026-05-02",
  deployId: "deploy-8841",
  summary: "checkout service error rate spiked to 4% after config change, latency doubled, transient issue recovered without rollback",
  errorRate: 0.04,
  latencyP95: 360,
  agentAction: "hold",
  agentConfidence: 60,
  humanOverride: "hold",
  outcome: "held and recovered on its own in 6 minutes; rollback would have been unnecessary"
};

describe("service", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-service-"));
    writeFileSync(join(tempDir, "incidents.json"), `${JSON.stringify([seededIncident], null, 2)}\n`);
    writeFileSync(join(tempDir, "audit.json"), "[]\n");
    process.env.SENTINELOPS_INCIDENTS_PATH = join(tempDir, "incidents.json");
    process.env.SENTINELOPS_AUDIT_PATH = join(tempDir, "audit.json");
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_INCIDENTS_PATH;
    delete process.env.SENTINELOPS_AUDIT_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("simulateScenario returns deterministic metrics for the requested scenario", () => {
    const result = simulateScenario("degraded");
    expect(result.scenario).toBe("degraded");
    expect(result.metrics.errorRate).toBe(0.044);
  });

  it("executeDecisionFlow applies a caller override and records the final action", async () => {
    const result = await executeDecisionFlow({
      scenario: "degraded",
      deployId: "deploy-1002",
      useCanned: true,
      humanDecision: "override"
    });

    expect(result.finalAction).toBe("rollback");
    expect(result.humanDecision).toBe("override");
    expect(result.incidentRecorded).toBe(true);
    expect(result.autonomous).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/service.test.ts`
Expected: FAIL with module not found for `../src/service.js`

- [ ] **Step 3: Write minimal implementation**

```typescript
import { judge, isAnomalous } from "./agent.js";
import { deploy, logAudit, rollback } from "./deploy.js";
import { recordIncident } from "./memory.js";
import { simulateDeploy } from "./simulator.js";
import { CONFIDENCE_THRESHOLD, type Action, type HumanDecision, type Incident, type Metrics, type Scenario } from "./types.js";

export interface ScenarioSimulationResult {
  scenario: Scenario;
  metrics: Metrics;
}

export interface DecisionFlowOptions {
  scenario: Scenario;
  deployId: string;
  useCanned?: boolean;
  humanDecision?: HumanDecision;
}

export interface DecisionFlowResult {
  scenario: Scenario;
  deployId: string;
  metrics: Metrics;
  anomalous: boolean;
  decision: Awaited<ReturnType<typeof judge>> | null;
  humanDecision: HumanDecision | null;
  finalAction: Action | "none";
  autonomous: boolean;
  incidentRecorded: boolean;
}

export function simulateScenario(scenario: Scenario): ScenarioSimulationResult {
  return {
    scenario,
    metrics: simulateDeploy(scenario)
  };
}

export async function executeDecisionFlow(options: DecisionFlowOptions): Promise<DecisionFlowResult> {
  const simulated = simulateScenario(options.scenario);
  deploy(options.scenario, options.deployId);

  if (!isAnomalous(simulated.metrics)) {
    return {
      scenario: options.scenario,
      deployId: options.deployId,
      metrics: simulated.metrics,
      anomalous: false,
      decision: null,
      humanDecision: null,
      finalAction: "none",
      autonomous: false,
      incidentRecorded: false
    };
  }

  const decision = await judge(simulated.metrics, { useCanned: options.useCanned });
  logAudit({
    timestamp: Date.now(),
    actor: "agent",
    action: "decision",
    detail: `${decision.action} @ ${decision.confidence}% -> ${decision.reasoning}`
  });

  let finalAction: Action = decision.action;
  let humanDecision: HumanDecision | null = null;
  let overrideAction: Action | null = null;
  const autonomous = decision.confidence >= CONFIDENCE_THRESHOLD && !options.humanDecision;

  if (!autonomous && options.humanDecision) {
    humanDecision = options.humanDecision;
    if (options.humanDecision === "override") {
      finalAction = decision.action === "rollback" ? "hold" : "rollback";
      overrideAction = finalAction;
      logAudit({
        timestamp: Date.now(),
        actor: "human:external",
        action: "override",
        detail: `override ${decision.action} -> ${finalAction}`
      });
    }
  }

  if (finalAction === "rollback") {
    rollback(options.deployId);
  }

  recordIncident({
    id: `INC-${options.deployId}`,
    deployId: options.deployId,
    summary: `Scenario ${options.scenario} produced ${(simulated.metrics.errorRate * 100).toFixed(1)}% errors and ${simulated.metrics.latencyP95.toFixed(0)}ms p95 latency.`,
    errorRate: simulated.metrics.errorRate,
    latencyP95: simulated.metrics.latencyP95,
    agentAction: decision.action,
    agentConfidence: decision.confidence,
    humanOverride: overrideAction,
    outcome: `final action: ${finalAction}`
  });

  return {
    scenario: options.scenario,
    deployId: options.deployId,
    metrics: simulated.metrics,
    anomalous: true,
    decision,
    humanDecision,
    finalAction,
    autonomous,
    incidentRecorded: true
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service.ts src/main.ts src/types.ts tests/service.test.ts
git commit -m "feat: add reusable service layer for portable sentinelops flows"
```

### Task 2: CLI Command Surface

**Files:**
- Create: `src/cli.ts`
- Modify: `src/service.ts`
- Modify: `package.json`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-"));
    writeFileSync(join(tempDir, "incidents.json"), "[]\n");
    writeFileSync(join(tempDir, "audit.json"), "[]\n");
    process.env.SENTINELOPS_INCIDENTS_PATH = join(tempDir, "incidents.json");
    process.env.SENTINELOPS_AUDIT_PATH = join(tempDir, "audit.json");
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_INCIDENTS_PATH;
    delete process.env.SENTINELOPS_AUDIT_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("judge command returns a stable JSON envelope", async () => {
    const result = await runCli(["judge", "--scenario", "degraded", "--json", "--canned"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("judge");
    expect(parsed.scenario).toBe("degraded");
    expect(parsed.decision.action).toBe("hold");
  });

  it("decide command accepts an explicit override", async () => {
    const result = await runCli(["decide", "--scenario", "degraded", "--override", "--json", "--canned"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.finalAction).toBe("rollback");
    expect(parsed.humanDecision).toBe("override");
  });

  it("rejects invalid scenarios with a JSON error envelope", async () => {
    const result = await runCli(["judge", "--scenario", "bad", "--json"]);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("INVALID_SCENARIO");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli.test.ts`
Expected: FAIL with module not found for `../src/cli.js`

- [ ] **Step 3: Write minimal implementation**

```typescript
import "dotenv/config";
import { executeDecisionFlow, simulateScenario } from "./service.js";
import { judge } from "./agent.js";
import type { HumanDecision, Scenario } from "./types.js";

export interface CliRunResult {
  exitCode: number;
  stdout: string;
}

function isScenario(value: string | undefined): value is Scenario {
  return value === "healthy" || value === "degraded" || value === "crash";
}

function formatJson(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export async function runCli(argv: string[]): Promise<CliRunResult> {
  const [command, ...rest] = argv;
  const json = rest.includes("--json");
  const canned = rest.includes("--canned");
  const scenarioValue = rest[rest.indexOf("--scenario") + 1];
  const humanDecision: HumanDecision | null = rest.includes("--override")
    ? "override"
    : rest.includes("--approve")
      ? "approve"
      : null;

  if (command !== "demo" && !isScenario(scenarioValue)) {
    return {
      exitCode: 1,
      stdout: formatJson({
        ok: false,
        command: command ?? "unknown",
        error: {
          code: "INVALID_SCENARIO",
          message: "Scenario must be one of healthy, degraded, or crash."
        }
      })
    };
  }

  if (command === "simulate") {
    const result = simulateScenario(scenarioValue);
    return {
      exitCode: 0,
      stdout: json
        ? formatJson({ ok: true, command: "simulate", scenario: result.scenario, metrics: result.metrics })
        : `simulate ${result.scenario}: errorRate=${result.metrics.errorRate} latencyP95=${result.metrics.latencyP95}\n`
    };
  }

  if (command === "judge") {
    const simulated = simulateScenario(scenarioValue);
    const decision = await judge(simulated.metrics, { useCanned: canned });
    return {
      exitCode: 0,
      stdout: json
        ? formatJson({
            ok: true,
            command: "judge",
            scenario: simulated.scenario,
            metrics: simulated.metrics,
            decision
          })
        : `judge ${simulated.scenario}: ${decision.action} @ ${decision.confidence}%\n`
    };
  }

  if (command === "decide") {
    const result = await executeDecisionFlow({
      scenario: scenarioValue,
      deployId: `deploy-${scenarioValue}`,
      useCanned: canned,
      humanDecision: humanDecision ?? undefined
    });
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "decide",
        scenario: result.scenario,
        metrics: result.metrics,
        decision: result.decision,
        humanDecision: result.humanDecision,
        finalAction: result.finalAction,
        autonomous: result.autonomous,
        incidentRecorded: result.incidentRecorded
      })
    };
  }

  if (command === "demo") {
    const healthy = await executeDecisionFlow({ scenario: "healthy", deployId: "deploy-1001", useCanned: canned });
    const degraded = await executeDecisionFlow({ scenario: "degraded", deployId: "deploy-1002", useCanned: canned, humanDecision: "override" });
    const crash = await executeDecisionFlow({ scenario: "crash", deployId: "deploy-1003", useCanned: canned });
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "demo",
        results: [healthy, degraded, crash]
      })
    };
  }

  return {
    exitCode: 1,
    stdout: formatJson({
      ok: false,
      command: command ?? "unknown",
      error: {
        code: "UNKNOWN_COMMAND",
        message: "Supported commands are simulate, judge, decide, and demo."
      }
    })
  };
}

if (process.argv[1]?.endsWith("cli.ts")) {
  runCli(process.argv.slice(2)).then((result) => {
    process.stdout.write(result.stdout);
    process.exitCode = result.exitCode;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/service.ts package.json tests/cli.test.ts
git commit -m "feat: expose sentinelops portable cli commands"
```

### Task 3: Interactive Demo Rewire

**Files:**
- Modify: `src/main.ts`
- Modify: `tests/service.test.ts`
- Test: `tests/service.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/service.test.ts`:

```typescript
  it("executeDecisionFlow leaves healthy scenarios read-only", async () => {
    const result = await executeDecisionFlow({
      scenario: "healthy",
      deployId: "deploy-1001",
      useCanned: true
    });

    expect(result.anomalous).toBe(false);
    expect(result.finalAction).toBe("none");
    expect(result.incidentRecorded).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/service.test.ts`
Expected: FAIL if healthy flow still mutates or reports the wrong state

- [ ] **Step 3: Write minimal implementation**

```typescript
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { executeDecisionFlow } from "./service.js";
import { CONFIDENCE_THRESHOLD, type HumanDecision, type Scenario } from "./types.js";

async function promptForDecision(action: "rollback" | "hold", rl: ReturnType<typeof createInterface>): Promise<HumanDecision> {
  const answer = (
    await rl.question(
      `confidence < ${CONFIDENCE_THRESHOLD}% -> approve ${action}? [y = approve / o = override]: `
    )
  ).trim().toLowerCase();
  return answer === "o" ? "override" : "approve";
}

async function runScenario(scenario: Scenario, deployId: string, rl: ReturnType<typeof createInterface>, useCanned: boolean): Promise<void> {
  const preview = await executeDecisionFlow({
    scenario,
    deployId,
    useCanned,
    humanDecision: scenario === "healthy" || scenario === "crash" ? undefined : "approve"
  });

  console.log(`\n=== Deploy ${deployId} (${scenario}) ===`);
  console.log(`parallel signals -> errorRate=${(preview.metrics.errorRate * 100).toFixed(2)}% p95=${preview.metrics.latencyP95.toFixed(0)}ms rps=${preview.metrics.requestsPerSec.toFixed(0)}`);

  if (!preview.anomalous || !preview.decision) {
    console.log("agent: metrics nominal, no action.");
    return;
  }

  if (preview.decision.confidence >= CONFIDENCE_THRESHOLD || scenario === "crash") {
    console.log(`agent decision: ${preview.decision.action.toUpperCase()} @ ${preview.decision.confidence}%`);
    console.log("confidence >= threshold -> autonomous action");
    return;
  }

  const humanDecision = await promptForDecision(preview.decision.action, rl);
  const final = await executeDecisionFlow({
    scenario,
    deployId: `${deployId}-confirmed`,
    useCanned,
    humanDecision
  });
  console.log(`agent decision: ${final.decision?.action.toUpperCase()} @ ${final.decision?.confidence}%`);
  console.log(`human ${humanDecision} -> ${final.finalAction}`);
}
```

Then refactor `main()` to call `runScenario(...)` for healthy, degraded, and crash.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main.ts tests/service.test.ts
git commit -m "refactor: route interactive demo through reusable service flows"
```

### Task 4: Portable Skill Wrapper and README

**Files:**
- Create: `.agents/skills/sentinelops-portable/SKILL.md`
- Modify: `README.md`
- Test: `tests/skill-docs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("portable skill docs", () => {
  it("publishes a sentinelops portable skill with cli guidance", () => {
    const path = ".agents/skills/sentinelops-portable/SKILL.md";
    expect(existsSync(path)).toBe(true);
    const skill = readFileSync(path, "utf8");
    expect(skill).toContain("sentinelops judge --scenario degraded --json");
  });

  it("documents the portable cli in the README", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("sentinelops judge --scenario degraded --json");
    expect(readme).toContain("npm run cli --");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/skill-docs.test.ts`
Expected: FAIL because the skill file does not exist yet

- [ ] **Step 3: Write minimal implementation**

`SKILL.md`:

```markdown
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

## Guidance

- Prefer `--json` when another tool or agent will parse the output.
- Prefer `--canned` when stable offline behavior matters more than live model judgment.
- The CLI writes local JSON memory and audit state on `decide` and `demo`, but not on `judge`.
```

Update `README.md` with a `Portable CLI` section that includes:

```markdown
## Portable CLI

SentinelOps can be attached to other agent CLIs through shell commands.

- `npm run cli -- simulate --scenario healthy --json`
- `npm run cli -- judge --scenario degraded --json --canned`
- `npm run cli -- decide --scenario degraded --override --json --canned`
- `npm run cli -- demo --json --canned`

Use JSON mode when another tool needs a stable machine-readable contract.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/skill-docs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/sentinelops-portable/SKILL.md README.md tests/skill-docs.test.ts
git commit -m "docs: add portable skill wrapper and cli integration guide"
```

### Task 5: Full Verification

**Files:**
- Modify: `package.json`
- Test: `tests/*.test.ts`

- [ ] **Step 1: Add the CLI script**

Add this script to `package.json`:

```json
"cli": "tsx src/cli.ts"
```

- [ ] **Step 2: Run focused verification**

Run: `npx vitest run tests/service.test.ts tests/cli.test.ts tests/skill-docs.test.ts`
Expected: PASS

- [ ] **Step 3: Run full verification**

Run: `npm test`
Expected: PASS with all test files green

- [ ] **Step 4: Run a CLI smoke test**

Run: `npm run cli -- judge --scenario degraded --json --canned`
Expected: JSON output with `"ok": true`, `"command": "judge"`, and `"scenario": "degraded"`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: finalize portable sentinelops cli packaging"
```
