# SentinelOps Hackathon MVP Implementation Plan

> **For agentic workers (Codex / Claude Code):** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task ends working and demoable. Build in order — every task adds something you can show on stage.

**Goal:** Build an AI agent that watches a (simulated) production metrics stream after a deploy, decides whether to rollback or hold with a stated confidence level, negotiates with a human over Slack when unsure, and learns from every human override.

**Architecture:** A Node/TypeScript app with five small, independent units: (1) a metrics simulator that fakes "production," (2) a judgment agent that detects anomalies, retrieves similar past incidents, and calls the OpenAI API for a structured decision, (3) a JSON-file memory of past incidents + overrides, (4) a Slack negotiation layer with Approve/Override buttons, (5) a deploy/rollback stub with an audit log. All state is JSON files — no database, no real infra.

**Tech Stack:** Node 20+, TypeScript, OpenAI SDK (`openai`), Slack (`@slack/bolt`), `tsx` for running TS directly, `zod` for structured-output validation, `vitest` for tests.

**The demo (90 seconds):** healthy deploy → bad deploy → agent flags 67%, asks Slack → human overrides "hold" → worse crash deploy → agent now flags 94% and **auto-rolls-back without asking**, citing the learned override. Asks when unsure, acts when sure, learns in between.

---

## File Structure

```
SentinelOps/
├── package.json
├── tsconfig.json
├── .env.example                  # OPENAI_API_KEY, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CHANNEL
├── data/
│   ├── incidents.json            # memory: past incidents + human overrides (seeded)
│   └── audit.json                # append-only log of every decision + action
├── src/
│   ├── types.ts                  # shared types + zod schemas (Metrics, Decision, Incident)
│   ├── simulator.ts              # fake production metrics stream + scenarios
│   ├── memory.ts                 # load/query/append incidents.json
│   ├── agent.ts                  # anomaly detection + LLM judgment call
│   ├── deploy.ts                 # deploy()/rollback() stubs + audit log
│   ├── slack.ts                  # post decision w/ buttons, handle Approve/Override
│   └── main.ts                   # orchestration loop wiring it all together
└── tests/
    ├── simulator.test.ts
    ├── memory.test.ts
    ├── agent.test.ts
    └── deploy.test.ts
```

**Build order rationale:** types → simulator → memory → deploy → agent → slack → main. Each lower layer is testable before the one above needs it. If you run out of time, stop after Task 6 (agent works end-to-end in the terminal) and fake Slack with console output — you still have a demo.

---

## Task 0: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`

- [ ] **Step 1: Init the repo and install deps**

```bash
cd "C:/Users/Anand/OneDrive - Xalta Technology Services Pvt Ltd/Desktop/SelfProjects/SentinalOps"
git init
npm init -y
npm install openai @slack/bolt zod dotenv
npm install -D typescript tsx vitest @types/node
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Set `package.json` scripts and `"type": "module"`**

```json
{
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "test": "vitest run",
    "sim": "tsx src/simulator.ts"
  }
}
```

- [ ] **Step 4: Write `.env.example` and `.gitignore`**

`.env.example`:
```
OPENAI_API_KEY=sk-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
SLACK_CHANNEL=#sentinelops
```

`.gitignore`:
```
node_modules
.env
dist
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold SentinelOps project"
```

---

## Task 1: Shared Types & Schemas

**Files:**
- Create: `src/types.ts`
- Test: (covered indirectly by later tests)

- [ ] **Step 1: Write `src/types.ts`**

```typescript
import { z } from "zod";

// Live metrics snapshot from "production"
export const MetricsSchema = z.object({
  timestamp: z.number(),
  errorRate: z.number(),    // fraction, e.g. 0.032 = 3.2%
  latencyP95: z.number(),   // milliseconds
  requestsPerSec: z.number(),
});
export type Metrics = z.infer<typeof MetricsSchema>;

// A past incident or a recorded human override (the "memory")
export const IncidentSchema = z.object({
  id: z.string(),
  deployId: z.string(),
  summary: z.string(),                  // human-readable, used for retrieval
  errorRate: z.number(),
  latencyP95: z.number(),
  agentAction: z.enum(["rollback", "hold"]),
  agentConfidence: z.number(),
  humanOverride: z.enum(["rollback", "hold"]).nullable(),
  outcome: z.string(),                  // what ended up happening
});
export type Incident = z.infer<typeof IncidentSchema>;

// The agent's structured decision (forced via zod from the LLM)
export const DecisionSchema = z.object({
  action: z.enum(["rollback", "hold"]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  evidence: z.array(z.string()),        // bullet facts the agent used
  similarIncidentId: z.string().nullable(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const BASELINE = { errorRate: 0.004, latencyP95: 120 };
export const CONFIDENCE_THRESHOLD = 85; // act autonomously at/above this
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared types and zod schemas"
```

---

## Task 2: Metrics Simulator

**Files:**
- Create: `src/simulator.ts`
- Test: `tests/simulator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { generateMetrics } from "../src/simulator.js";

describe("generateMetrics", () => {
  it("healthy scenario stays near baseline", () => {
    const m = generateMetrics("healthy");
    expect(m.errorRate).toBeLessThan(0.01);
    expect(m.latencyP95).toBeLessThan(200);
  });

  it("crash scenario spikes error rate well above baseline", () => {
    const m = generateMetrics("crash");
    expect(m.errorRate).toBeGreaterThan(0.1);
    expect(m.latencyP95).toBeGreaterThan(500);
  });

  it("degraded scenario is between healthy and crash", () => {
    const m = generateMetrics("degraded");
    expect(m.errorRate).toBeGreaterThan(0.01);
    expect(m.errorRate).toBeLessThan(0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulator.test.ts`
Expected: FAIL with "generateMetrics is not a function" / module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Metrics } from "./types.js";

export type Scenario = "healthy" | "degraded" | "crash";

// Deterministic-ish jitter so the demo is stable but not robotic.
function jitter(base: number, spread: number): number {
  return base + (Math.random() - 0.5) * spread;
}

export function generateMetrics(scenario: Scenario): Metrics {
  const base = {
    healthy: { errorRate: 0.004, latencyP95: 120, rps: 800 },
    degraded: { errorRate: 0.045, latencyP95: 380, rps: 600 },
    crash: { errorRate: 0.22, latencyP95: 1800, rps: 200 },
  }[scenario];

  return {
    timestamp: Date.now(),
    errorRate: Math.max(0, jitter(base.errorRate, base.errorRate * 0.2)),
    latencyP95: Math.max(10, jitter(base.latencyP95, base.latencyP95 * 0.15)),
    requestsPerSec: Math.max(0, jitter(base.rps, 50)),
  };
}

// Mutable "current scenario" so deploy/rollback can flip production state.
let current: Scenario = "healthy";
export function setScenario(s: Scenario) { current = s; }
export function getScenario(): Scenario { return current; }
export function pollMetrics(): Metrics { return generateMetrics(current); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulator.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/simulator.ts tests/simulator.test.ts
git commit -m "feat: metrics simulator with healthy/degraded/crash scenarios"
```

---

## Task 3: Memory (incidents.json)

**Files:**
- Create: `src/memory.ts`, `data/incidents.json`
- Test: `tests/memory.test.ts`

- [ ] **Step 1: Seed `data/incidents.json` with one past incident**

```json
[
  {
    "id": "INC-2026-05-02",
    "deployId": "deploy-8841",
    "summary": "checkout service error rate spiked to 4% after config change, latency doubled, transient — recovered without rollback",
    "errorRate": 0.04,
    "latencyP95": 360,
    "agentAction": "hold",
    "agentConfidence": 60,
    "humanOverride": null,
    "outcome": "held; recovered on its own in 6 minutes; rollback would have been unnecessary"
  }
]
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { loadIncidents, findSimilar, appendIncident } from "../src/memory.js";
import { Incident } from "../src/types.js";

const sample: Incident = {
  id: "TEST-1", deployId: "d1", summary: "latency spike on payments",
  errorRate: 0.05, latencyP95: 400, agentAction: "hold",
  agentConfidence: 55, humanOverride: "hold", outcome: "recovered",
};

describe("memory", () => {
  it("loads seeded incidents", () => {
    expect(loadIncidents().length).toBeGreaterThan(0);
  });

  it("findSimilar returns the closest incident by metric distance", () => {
    const match = findSimilar({ errorRate: 0.042, latencyP95: 370 });
    expect(match).not.toBeNull();
  });

  it("appendIncident grows the store", () => {
    const before = loadIncidents().length;
    appendIncident(sample);
    expect(loadIncidents().length).toBe(before + 1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/memory.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 4: Write minimal implementation**

```typescript
import { readFileSync, writeFileSync } from "node:fs";
import { Incident, IncidentSchema } from "./types.js";

const PATH = new URL("../data/incidents.json", import.meta.url);

export function loadIncidents(): Incident[] {
  const raw = JSON.parse(readFileSync(PATH, "utf-8"));
  return raw.map((r: unknown) => IncidentSchema.parse(r));
}

// Similarity = normalized distance on errorRate + latency. Closest wins.
export function findSimilar(m: { errorRate: number; latencyP95: number }): Incident | null {
  const all = loadIncidents();
  if (all.length === 0) return null;
  let best: Incident | null = null;
  let bestDist = Infinity;
  for (const inc of all) {
    const d =
      Math.abs(inc.errorRate - m.errorRate) / 0.1 +
      Math.abs(inc.latencyP95 - m.latencyP95) / 1000;
    if (d < bestDist) { bestDist = d; best = inc; }
  }
  return best;
}

export function appendIncident(inc: Incident): void {
  const all = loadIncidents();
  all.push(inc);
  writeFileSync(PATH, JSON.stringify(all, null, 2));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/memory.test.ts`
Expected: PASS. (Note: the append test mutates the seed file; reset with `git checkout data/incidents.json` after running, or wrap in your own temp copy if you have time. For a hackathon, the git reset is fine.)

- [ ] **Step 6: Commit**

```bash
git checkout data/incidents.json
git add src/memory.ts data/incidents.json tests/memory.test.ts
git commit -m "feat: JSON-file incident memory with similarity retrieval"
```

---

## Task 4: Deploy / Rollback Stub + Audit Log

**Files:**
- Create: `src/deploy.ts`, `data/audit.json` (start as `[]`)
- Test: `tests/deploy.test.ts`

- [ ] **Step 1: Create `data/audit.json`**

```json
[]
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { deploy, rollback, readAudit } from "../src/deploy.js";
import { getScenario } from "../src/simulator.js";

describe("deploy/rollback", () => {
  it("deploy flips the live scenario and logs to audit", () => {
    const before = readAudit().length;
    deploy("crash", "deploy-test");
    expect(getScenario()).toBe("crash");
    expect(readAudit().length).toBe(before + 1);
  });

  it("rollback returns production to healthy", () => {
    deploy("crash", "deploy-test");
    rollback("deploy-test");
    expect(getScenario()).toBe("healthy");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/deploy.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 4: Write minimal implementation**

```typescript
import { readFileSync, writeFileSync } from "node:fs";
import { setScenario, Scenario } from "./simulator.js";

const PATH = new URL("../data/audit.json", import.meta.url);

export interface AuditEntry {
  timestamp: number;
  actor: string;        // "agent" | "human:<name>" | "system"
  action: string;       // "deploy" | "rollback" | "decision" | "override"
  detail: string;
}

export function readAudit(): AuditEntry[] {
  return JSON.parse(readFileSync(PATH, "utf-8"));
}

export function logAudit(entry: AuditEntry): void {
  const all = readAudit();
  all.push(entry);
  writeFileSync(PATH, JSON.stringify(all, null, 2));
}

export function deploy(scenario: Scenario, deployId: string): void {
  setScenario(scenario);
  logAudit({ timestamp: Date.now(), actor: "system", action: "deploy",
    detail: `${deployId} -> scenario=${scenario}` });
}

export function rollback(deployId: string): void {
  setScenario("healthy");
  logAudit({ timestamp: Date.now(), actor: "agent", action: "rollback",
    detail: `rolled back ${deployId} -> healthy` });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/deploy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git checkout data/audit.json
git add src/deploy.ts data/audit.json tests/deploy.test.ts
git commit -m "feat: deploy/rollback stub with append-only audit log"
```

---

## Task 5: The Judgment Agent

**Files:**
- Create: `src/agent.ts`
- Test: `tests/agent.test.ts`

- [ ] **Step 1: Write the failing test (anomaly detection only — no live LLM in tests)**

```typescript
import { describe, it, expect } from "vitest";
import { isAnomalous } from "../src/agent.js";

describe("isAnomalous", () => {
  it("flags metrics well above baseline", () => {
    expect(isAnomalous({ errorRate: 0.05, latencyP95: 400 } as any)).toBe(true);
  });
  it("ignores healthy metrics", () => {
    expect(isAnomalous({ errorRate: 0.004, latencyP95: 120 } as any)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent.test.ts`
Expected: FAIL — `isAnomalous` not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { Metrics, Decision, DecisionSchema, BASELINE } from "./types.js";
import { findSimilar } from "./memory.js";

// Anomaly = error rate 3x baseline OR latency 2x baseline.
export function isAnomalous(m: Metrics): boolean {
  return m.errorRate > BASELINE.errorRate * 3 || m.latencyP95 > BASELINE.latencyP95 * 2;
}

const client = new OpenAI();

export async function judge(m: Metrics): Promise<Decision> {
  const similar = findSimilar(m);

  const memoryBlock = similar
    ? `A similar past incident exists:
- id: ${similar.id}
- summary: ${similar.summary}
- agent did: ${similar.agentAction} (confidence ${similar.agentConfidence})
- human override: ${similar.humanOverride ?? "none"}
- outcome: ${similar.outcome}`
    : "No similar past incident found.";

  const prompt = `You are SentinelOps, an autonomous deployment-judgment agent.
A deploy just shipped. Live production metrics:
- error rate: ${(m.errorRate * 100).toFixed(2)}% (baseline ${(BASELINE.errorRate * 100).toFixed(2)}%)
- p95 latency: ${m.latencyP95.toFixed(0)}ms (baseline ${BASELINE.latencyP95}ms)
- throughput: ${m.requestsPerSec.toFixed(0)} req/s

${memoryBlock}

Decide whether to ROLLBACK or HOLD. Weigh the past incident heavily: if a human
previously overrode the agent in a similar situation, trust that signal and let it
move your confidence. Output your confidence (0-100) that your chosen action is correct.
Be concrete in your evidence.`;

  const completion = await client.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [{ role: "user", content: prompt }],
    response_format: zodResponseFormat(DecisionSchema, "decision"),
  });

  const decision = completion.choices[0].message.parsed;
  if (!decision) throw new Error("LLM returned no parsed decision");
  return decision;
}
```

> **Note for the implementer:** `chat.completions.parse` + `zodResponseFormat` is OpenAI's structured-outputs helper — it forces the model to return JSON matching `DecisionSchema`, so you never parse free text. If the installed SDK version lacks `.parse`, fall back to `response_format: { type: "json_object" }` and validate with `DecisionSchema.parse(JSON.parse(content))`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent.test.ts`
Expected: PASS (the `judge` function isn't unit-tested — it needs a live key; you'll exercise it in Task 7's manual run).

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts tests/agent.test.ts
git commit -m "feat: judgment agent with anomaly detection + memory-aware LLM decision"
```

---

## Task 6: Terminal-Only End-to-End Loop (demo-safe fallback)

**Files:**
- Create: `src/main.ts`

> This task gives you a **fully working demo without Slack**. If Slack setup eats your time, you ship this. Slack (Task 7) upgrades the negotiation from terminal prompt to real buttons.

- [ ] **Step 1: Write `src/main.ts`**

```typescript
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { pollMetrics } from "./simulator.js";
import { isAnomalous, judge } from "./agent.js";
import { deploy, rollback, logAudit } from "./deploy.js";
import { appendIncident } from "./memory.js";
import { CONFIDENCE_THRESHOLD, Decision, Metrics } from "./types.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function handleDeploy(scenario: "healthy" | "degraded" | "crash", deployId: string) {
  console.log(`\n=== Deploy ${deployId} (${scenario}) ===`);
  deploy(scenario, deployId);
  await new Promise((r) => setTimeout(r, 800)); // let "metrics settle"
  const m: Metrics = pollMetrics();
  console.log(`metrics: errorRate=${(m.errorRate*100).toFixed(2)}% p95=${m.latencyP95.toFixed(0)}ms`);

  if (!isAnomalous(m)) { console.log("✅ Agent: metrics nominal, no action."); return; }

  const d: Decision = await judge(m);
  console.log(`\n🤖 Agent decision: ${d.action.toUpperCase()} — confidence ${d.confidence}%`);
  console.log(`   reasoning: ${d.reasoning}`);
  d.evidence.forEach((e) => console.log(`   • ${e}`));
  logAudit({ timestamp: Date.now(), actor: "agent", action: "decision",
    detail: `${d.action} @ ${d.confidence}% — ${d.reasoning}` });

  let finalAction = d.action;
  let override: "rollback" | "hold" | null = null;

  if (d.confidence >= CONFIDENCE_THRESHOLD) {
    console.log(`   confidence ≥ ${CONFIDENCE_THRESHOLD}% → acting autonomously.`);
  } else {
    const ans = (await rl.question(
      `   confidence < ${CONFIDENCE_THRESHOLD}% → asking human. Approve ${d.action}? [y = approve / o = override to opposite]: `
    )).trim().toLowerCase();
    if (ans === "o") {
      finalAction = d.action === "rollback" ? "hold" : "rollback";
      override = finalAction;
      console.log(`   👤 Human overrode → ${finalAction}`);
      logAudit({ timestamp: Date.now(), actor: "human:demo", action: "override",
        detail: `override agent ${d.action} -> ${finalAction}` });
    }
  }

  if (finalAction === "rollback") rollback(deployId);
  else console.log("   holding — leaving deploy in place.");

  // LEARN: record this episode so future similar incidents shift confidence.
  appendIncident({
    id: `INC-${deployId}`, deployId,
    summary: `errorRate ${(m.errorRate*100).toFixed(1)}%, p95 ${m.latencyP95.toFixed(0)}ms; agent chose ${d.action}`,
    errorRate: m.errorRate, latencyP95: m.latencyP95,
    agentAction: d.action, agentConfidence: d.confidence,
    humanOverride: override, outcome: `final action: ${finalAction}`,
  });
  console.log(`   🧠 Episode written to memory.`);
}

async function main() {
  await handleDeploy("healthy", "deploy-1001");
  await handleDeploy("degraded", "deploy-1002"); // ~67%, should ask
  await handleDeploy("crash", "deploy-1003");     // high confidence, should auto-rollback
  rl.close();
}

main();
```

- [ ] **Step 2: Run it end-to-end with a real key**

```bash
cp .env.example .env   # then edit .env to add OPENAI_API_KEY
npm start
```
Expected: healthy → no action; degraded → agent asks you to approve (try overriding); crash → agent auto-rolls-back. Confirm an episode is written each time (`data/incidents.json` grows).

- [ ] **Step 3: Reset demo state and commit**

```bash
git checkout data/incidents.json data/audit.json
git add src/main.ts
git commit -m "feat: terminal end-to-end judgment loop with learning"
```

---

## Task 7: Slack Negotiation (the wow factor)

**Files:**
- Create: `src/slack.ts`
- Modify: `src/main.ts` (swap terminal prompt for Slack when in Slack mode)

> Prereq: create a Slack app, enable **Socket Mode** (so you need no public URL), add bot scopes `chat:write`, install to a workspace, invite the bot to `#sentinelops`. Put tokens in `.env`. Socket Mode avoids ngrok — critical for a hackathon network.

- [ ] **Step 1: Write `src/slack.ts`**

```typescript
import pkg from "@slack/bolt";
const { App } = pkg;
import { Decision } from "./types.js";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

let resolver: ((v: "approve" | "override") => void) | null = null;

app.action("approve_btn", async ({ ack }) => { await ack(); resolver?.("approve"); });
app.action("override_btn", async ({ ack }) => { await ack(); resolver?.("override"); });

export async function startSlack() { await app.start(); console.log("⚡ Slack connected (socket mode)"); }

// Posts the decision with buttons and resolves when a human clicks.
export async function negotiate(d: Decision): Promise<"approve" | "override"> {
  await app.client.chat.postMessage({
    channel: process.env.SLACK_CHANNEL!,
    text: `SentinelOps wants to ${d.action} (confidence ${d.confidence}%)`,
    blocks: [
      { type: "section", text: { type: "mrkdwn",
        text: `*🤖 SentinelOps decision: ${d.action.toUpperCase()}*  _confidence ${d.confidence}%_\n${d.reasoning}\n${d.evidence.map(e=>`• ${e}`).join("\n")}` } },
      { type: "actions", elements: [
        { type: "button", text: { type: "plain_text", text: `Approve ${d.action}` }, style: "primary", action_id: "approve_btn" },
        { type: "button", text: { type: "plain_text", text: "Override (do opposite)" }, style: "danger", action_id: "override_btn" },
      ] },
    ],
  });
  return new Promise((resolve) => { resolver = resolve; });
}
```

- [ ] **Step 2: Wire Slack into `main.ts`**

Replace the `rl.question(...)` block in `handleDeploy` with:

```typescript
    const choice = await negotiate(d); // from "./slack.js"
    if (choice === "override") {
      finalAction = d.action === "rollback" ? "hold" : "rollback";
      override = finalAction;
      logAudit({ timestamp: Date.now(), actor: "human:slack", action: "override",
        detail: `override agent ${d.action} -> ${finalAction}` });
    }
```

And at the top of `main()` add `await startSlack();` (import `startSlack`, `negotiate` from `./slack.js`). Remove the `readline` code paths if running Slack-only, or gate on `process.env.SLACK_BOT_TOKEN` to keep both modes.

- [ ] **Step 3: Run and click through in Slack**

```bash
npm start
```
Expected: the degraded deploy posts a message with two buttons in `#sentinelops`; clicking **Override** flips the action; the crash deploy auto-rolls-back and posts a confirmation. Verify the override is written to `incidents.json`.

- [ ] **Step 4: Reset demo state and commit**

```bash
git checkout data/incidents.json data/audit.json
git add src/slack.ts src/main.ts
git commit -m "feat: Slack socket-mode negotiation with approve/override buttons"
```

---

## Task 8: Demo Polish (do only if time remains)

- [ ] **Step 1:** Add a `data/incidents.json` seed that makes the degraded scenario land at ~67% confidence and the crash at ~94%, so the demo contrast is crisp. Tune the seed `summary`/`outcome` wording — the LLM weights it.
- [ ] **Step 2:** Add a one-line ASCII banner + colored output (`console.log` with ANSI) so the terminal looks intentional on the projector.
- [ ] **Step 3:** Write a 6-line `README.md` "what + why + run" and a one-slide architecture diagram (the 5 boxes).
- [ ] **Step 4:** Rehearse the 90-second script twice. Time it. Commit.

```bash
git add -A && git commit -m "chore: demo polish"
```

---

## Cut List (say no to these tomorrow)

Real Grafana/Loki/Prometheus, GitHub/Jenkins/ArgoCD webhooks, Docker, Kubernetes, RBAC, secrets lifecycle, cost estimation, config validation, multi-tenant, ACP transport, postmortem generation, the 40-command CLI. **All of these are roadmap slides, not hackathon code.** If a judge asks, point them at the full-product plan.

## Risk & Fallback

- **No internet / OpenAI down:** keep a `--canned` flag in `judge()` that returns a hardcoded `Decision` per scenario so the demo never depends on the network. Add it if you have 10 minutes.
- **Slack won't connect on venue wifi:** Task 6 is your fallback — the terminal loop is a complete demo on its own.
- **Running low on time:** ship through Task 6. Tasks 7-8 are upside, not critical path.
