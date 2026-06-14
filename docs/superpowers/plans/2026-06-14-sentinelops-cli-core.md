# SentinelOps CLI Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real SentinelOps CLI core slice for run state, scenario/context creation, planning, approval recording, push gating, audit visibility, and report generation.

**Architecture:** Add a workspace-backed SentinelOps state store under `.sentinelops/`, backed by JSON files and small focused TypeScript modules. Extend the CLI command surface around a stable run model so dashboard ingestion, planning, approval, and GitHub/Slack workflows can plug into the same gate and audit layer later.

**Tech Stack:** Node 24, TypeScript, tsx, vitest, zod, dotenv

---

### Task 1: SentinelOps State Models and Store

**Files:**
- Modify: `src/types.ts`
- Create: `src/core/store.ts`
- Create: `src/core/scenarios.ts`
- Test: `tests/core-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureSentinelOpsState,
  getLatestRunId,
  listRuns,
  saveRun,
  writeLatestRunId
} from "../src/core/store.js";

describe("core store", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-core-store-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates the sentinelops workspace folders on demand", () => {
    const paths = ensureSentinelOpsState();
    expect(paths.root.endsWith(".sentinelops")).toBe(true);
    expect(paths.runs.endsWith("runs")).toBe(true);
  });

  it("persists runs and tracks the latest run id", () => {
    saveRun({
      id: "run-001",
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
      source: "scenario",
      status: "context_created",
      scenario: "post-deploy-errors",
      serviceId: "svc-api",
      context: null,
      plan: null,
      approvals: [],
      tests: [],
      auditTrail: [],
      githubTarget: null,
      prompt: null
    });

    writeLatestRunId("run-001");

    expect(getLatestRunId()).toBe("run-001");
    expect(listRuns()[0]?.id).toBe("run-001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core-store.test.ts`
Expected: FAIL with module not found for `../src/core/store.js`

- [ ] **Step 3: Write minimal implementation**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RunRecordSchema, type RunRecord } from "../types.js";

export interface SentinelOpsPaths {
  root: string;
  runs: string;
  latestRun: string;
}

function getWorkspaceRoot(): string {
  return resolve(process.env.SENTINELOPS_WORKSPACE_ROOT ?? process.cwd());
}

export function ensureSentinelOpsState(): SentinelOpsPaths {
  const root = join(getWorkspaceRoot(), ".sentinelops");
  const runs = join(root, "runs");
  const latestRun = join(root, "latest-run.txt");

  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  if (!existsSync(runs)) mkdirSync(runs, { recursive: true });

  return { root, runs, latestRun };
}

function getRunPath(runId: string): string {
  const { runs } = ensureSentinelOpsState();
  return join(runs, `${runId}.json`);
}

export function saveRun(run: RunRecord): RunRecord {
  const parsed = RunRecordSchema.parse(run);
  writeFileSync(getRunPath(parsed.id), `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

export function listRuns(): RunRecord[] {
  const { runs } = ensureSentinelOpsState();
  const { readdirSync } = require("node:fs");
  return readdirSync(runs)
    .filter((entry: string) => entry.endsWith(".json"))
    .map((entry: string) => JSON.parse(readFileSync(join(runs, entry), "utf8")))
    .map((value: unknown) => RunRecordSchema.parse(value));
}

export function writeLatestRunId(runId: string): void {
  const { latestRun } = ensureSentinelOpsState();
  writeFileSync(latestRun, `${runId}\n`);
}

export function getLatestRunId(): string | null {
  const { latestRun } = ensureSentinelOpsState();
  if (!existsSync(latestRun)) return null;
  return readFileSync(latestRun, "utf8").trim() || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/core/store.ts src/core/scenarios.ts tests/core-store.test.ts
git commit -m "feat: add sentinelops core workspace state store"
```

### Task 2: Scenario, Context, and Planning Commands

**Files:**
- Create: `src/core/context.ts`
- Create: `src/core/planning.ts`
- Modify: `src/cli.ts`
- Test: `tests/cli-core.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli core context and planning", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-core-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads a named scenario and creates a normalized context", async () => {
    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    const result = await runCli(["context", "create", "--service", "svc-api", "--json"]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.context.service.id).toBe("svc-api");
    expect(parsed.run.status).toBe("context_created");
  });

  it("creates a plan and risk score from the latest context", async () => {
    await runCli(["scenario", "load", "config-risk", "--json"]);
    await runCli(["context", "create", "--service", "svc-config", "--json"]);
    const result = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.run.plan.summary.length).toBeGreaterThan(0);
    expect(parsed.run.plan.risk.level).toMatch(/low|medium|high|critical/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli-core.test.ts`
Expected: FAIL because the command surface does not support `scenario`, `context`, or `plan`

- [ ] **Step 3: Write minimal implementation**

Add scenario fixtures, context normalization, and plan creation with simple risk heuristics based on:

- scenario severity
- alert count
- deploy recency
- risky keywords like `config`, `secret`, `prod`, `rollback`

The CLI must support:

```bash
sentinelops scenario load <name>
sentinelops context create --service <service-id>
sentinelops context show --latest
sentinelops context validate --file .sentinelops/context.json
sentinelops plan create --context .sentinelops/context.json
sentinelops plan show --latest
sentinelops plan risk --plan latest
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli-core.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/context.ts src/core/planning.ts src/cli.ts tests/cli-core.test.ts
git commit -m "feat: add scenario, context, and planning cli commands"
```

### Task 3: Approval, Push Gate, and Audit Commands

**Files:**
- Create: `src/core/approval.ts`
- Create: `src/core/reporting.ts`
- Modify: `src/cli.ts`
- Test: `tests/cli-gate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli approval and push gate", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-gate-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("blocks push gate for a risky run without approval", async () => {
    await runCli(["scenario", "load", "config-risk", "--json"]);
    await runCli(["context", "create", "--service", "svc-config", "--json"]);
    const plan = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const runId = JSON.parse(plan.stdout).run.id;

    const gate = await runCli(["push", "gate", "--run", runId, "--json"]);
    const parsed = JSON.parse(gate.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("APPROVAL_REQUIRED");
  });

  it("passes push gate after approval is recorded", async () => {
    await runCli(["scenario", "load", "post-deploy-errors", "--json"]);
    await runCli(["context", "create", "--service", "svc-api", "--json"]);
    const plan = await runCli(["plan", "create", "--context", ".sentinelops/context.json", "--json"]);
    const runId = JSON.parse(plan.stdout).run.id;

    await runCli([
      "approval",
      "record",
      "--run",
      runId,
      "--source",
      "slack",
      "--status",
      "approved",
      "--by",
      "anand",
      "--json"
    ]);

    const gate = await runCli(["push", "gate", "--run", runId, "--json"]);
    const parsed = JSON.parse(gate.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.run.status).toBe("approved");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli-gate.test.ts`
Expected: FAIL because approval and push-gate commands do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

```bash
sentinelops approval package --run <run-id>
sentinelops approval record --run <run-id> --source slack --status approved --by <user>
sentinelops approval status --run <run-id>
sentinelops approval require --run <run-id>
sentinelops push gate --run <run-id>
sentinelops audit list
sentinelops audit show <run-id>
sentinelops report create --run <run-id>
sentinelops memory record --run <run-id>
```

Behavior:

- medium/high/critical risk requires explicit approval
- approval package includes plan summary, risk, and test placeholders
- push gate returns `APPROVAL_REQUIRED` when the run needs approval and has no approved record
- audit entries are appended to the run’s audit trail and surfaced in `audit list/show`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli-gate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/approval.ts src/core/reporting.ts src/cli.ts tests/cli-gate.test.ts
git commit -m "feat: add approval, push gate, audit, and report commands"
```

### Task 4: Full CLI Core Verification

**Files:**
- Modify: `README.md`
- Test: `tests/*.test.ts`

- [ ] **Step 1: Update the README command surface**

Document the new CLI core commands and the `.sentinelops` workspace state.

- [ ] **Step 2: Run focused verification**

Run: `npx vitest run tests/core-store.test.ts tests/cli-core.test.ts tests/cli-gate.test.ts`
Expected: PASS

- [ ] **Step 3: Run full verification**

Run: `npm test`
Expected: PASS with all test files green

- [ ] **Step 4: Run a CLI smoke test**

Run: `npm run cli -- plan create --prompt "fix config issue" --json`
Expected: JSON output with a created run, plan summary, and a risk object

- [ ] **Step 5: Commit**

```bash
git add README.md package-lock.json package.json src tests
git commit -m "docs: finalize sentinelops cli core slice"
```
