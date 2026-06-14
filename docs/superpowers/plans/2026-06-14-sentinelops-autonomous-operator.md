# SentinelOps Autonomous Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real autonomous SentinelOps control loop where a GitHub issue can trigger SentinelOps triage, request Slack approval, run a configured agent CLI after approval, and publish the resulting status back into SentinelOps, with a proper onboarding/config layer and operator controls.

**Architecture:** Keep the existing SentinelOps CLI core as the policy and audit engine. Add a thin event-driven automation layer that normalizes GitHub and Slack webhook events, persists job state under `.sentinelops/`, and invokes a configured external agent command only after SentinelOps approval has been recorded. Add a SentinelOps-managed config builder so Codex can walk the user through selecting tracked GitHub repos, Slack channels, agent command settings, and operator on/off state during `init`, and reuse the existing dashboard server so one local process can host the UI, API, onboarding, and webhook endpoints.

**Tech Stack:** TypeScript, Node.js built-in `http`/`child_process`, Zod, Vitest, existing SentinelOps CLI/dashboard modules

---

## File Structure

**Create**

- `src/core/automation.ts`
  Responsibility: own automation job lifecycle, orchestration state transitions, and run linkage.
- `src/core/automation-webhooks.ts`
  Responsibility: normalize GitHub issue events and Slack approval callbacks into SentinelOps automation actions.
- `src/core/agent-runner.ts`
  Responsibility: spawn Codex/Claude-compatible shell commands, persist transcripts, and return structured execution results.
- `src/core/operator-config.ts`
  Responsibility: own tracked repository, Slack channel, session profile, and operator enabled/disabled configuration state.
- `tests/automation-store.test.ts`
  Responsibility: validate persisted automation events and jobs.
- `tests/operator-config.test.ts`
  Responsibility: validate onboarding config creation, session toggles, and tracked integration persistence.
- `tests/automation-webhooks.test.ts`
  Responsibility: validate GitHub and Slack webhook normalization plus orchestration entrypoints.
- `tests/automation-runner.test.ts`
  Responsibility: validate external agent command execution, transcript capture, and failure handling.
- `tests/automation-workflow.test.ts`
  Responsibility: validate the full issue -> approval -> agent run lifecycle.

**Modify**

- `src/types.ts`
  Responsibility: add schemas for automation events, jobs, agent executions, and webhook payload snapshots.
- `src/core/store.ts`
  Responsibility: add `.sentinelops/automation-events.json`, `.sentinelops/automation-jobs.json`, `.sentinelops/operator-config.json`, and transcript path helpers.
- `src/core/approval.ts`
  Responsibility: support recording webhook-driven approvals without bypassing existing push gate rules.
- `src/core/reporting.ts`
  Responsibility: include automation metadata in final reports and memory entries.
- `src/core/repo.ts`
  Responsibility: package agent execution output into GitHub-ready result payloads.
- `src/dashboard/server.ts`
  Responsibility: expose webhook ingestion routes, operator config APIs, and automation status APIs.
- `src/dashboard/ui.ts`
  Responsibility: show onboarding/config, linked repos and channels, operator controls, automation jobs, approval state, and last agent execution in the dashboard.
- `src/cli.ts`
  Responsibility: add Codex-guided init/config commands plus inspection and recovery commands for autonomous jobs.
- `package.json`
  Responsibility: keep scripts aligned if a dedicated automation smoke script is added.
- `README.md`
  Responsibility: document webhook setup, env vars, and autonomous workflow.

## Scope Rules

- This plan is one vertical slice only: GitHub issue opened -> Slack approval -> agent execution -> SentinelOps/GitHub status packaging.
- It does not add multi-tenant routing, production deploy adapters, or broad roadmap items like Prometheus/Grafana/Loki ingestion.
- For the first pass, GitHub issue routing is label-driven: the issue must contain a `service:<service-id>` label such as `service:svc-api`.
- External GitHub and Slack writes remain plugin-first when available, but the local HTTP/webhook and simulation path must stay fully demoable without live credentials.
- Operator onboarding is part of this slice: a user must be able to initialize tracked GitHub repos, Slack destination, agent command, and enable/disable state from SentinelOps itself.
- The dashboard is not read-only in this slice: it must expose pages or views for configuration, linked integrations, and live automation operations.

## Added Product Requirements

- `sentinelops init` must support a Codex-guided setup path that captures:
  - one or more tracked GitHub repositories
  - a default Slack channel for approvals and reports
  - the external agent command and args
  - whether autonomous operation is currently enabled or disabled
- The saved config must persist for the current workspace session under `.sentinelops/` and be available to both CLI and dashboard.
- Users must be able to turn automation on or off without editing files manually.
- The dashboard must expose operational pages or sections for:
  - linked GitHub repositories
  - linked Slack channel and agent session config
  - live automation queue and current run states
  - operator controls to enable or disable the autonomous worker
  - job drill-down with approval state and transcript summary

### Task 1: Add Operator Config And Guided Init State

**Files:**
- Modify: `src/types.ts`
- Modify: `src/core/store.ts`
- Create: `src/core/operator-config.ts`
- Test: `tests/operator-config.test.ts`

- [ ] **Step 1: Write the failing operator config test**

```ts
import { describe, expect, it } from "vitest";
import {
  loadOperatorConfig,
  saveOperatorConfig,
  setOperatorEnabled
} from "../src/core/operator-config.js";

describe("operator config", () => {
  it("persists tracked repos, slack channel, agent command, and enabled state", () => {
    saveOperatorConfig({
      trackedRepos: ["example/repo", "example/platform"],
      slackChannel: "#ops-approvals",
      agentCommand: "codex",
      agentArgs: ["exec", "--json"],
      enabled: true
    });

    setOperatorEnabled(false);

    const config = loadOperatorConfig();
    expect(config.trackedRepos).toEqual(["example/repo", "example/platform"]);
    expect(config.slackChannel).toBe("#ops-approvals");
    expect(config.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify the missing API**

Run: `npx vitest run tests/operator-config.test.ts`
Expected: FAIL with errors like `loadOperatorConfig is not exported`

- [ ] **Step 3: Extend the shared types**

```ts
export const OperatorConfigSchema = z.object({
  trackedRepos: z.array(z.string()).min(1),
  slackChannel: z.string(),
  agentCommand: z.string(),
  agentArgs: z.array(z.string()),
  enabled: z.boolean(),
  updatedAt: z.string()
});

export const AutomationJobStatusSchema = z.enum([
  "queued",
  "awaiting_approval",
  "approved",
  "rejected",
  "running_agent",
  "completed",
  "failed"
]);

export const AgentExecutionSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  exitCode: z.number().int(),
  transcriptPath: z.string(),
  summary: z.string(),
  startedAt: z.string(),
  finishedAt: z.string()
});

export const AutomationJobSchema = z.object({
  id: z.string(),
  runId: z.string(),
  source: z.enum(["github_issue"]),
  serviceId: z.string(),
  githubIssueUrl: z.string(),
  status: AutomationJobStatusSchema,
  approvalMessageId: z.string().nullable(),
  execution: AgentExecutionSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const AutomationEventSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  kind: z.enum(["github.issue.opened", "slack.approved", "slack.rejected", "agent.completed", "agent.failed"]),
  payload: z.record(z.string(), z.unknown()),
  at: z.string()
});
```

- [ ] **Step 4: Add operator config persistence helpers**

```ts
const operatorConfig = join(root, "operator-config.json");
const automationJobs = join(root, "automation-jobs.json");
const automationEvents = join(root, "automation-events.json");
const transcripts = join(root, "transcripts");

export function loadOperatorConfig(): OperatorConfig | null {
  if (!existsSync(ensureSentinelOpsState().operatorConfig)) {
    return null;
  }
  return OperatorConfigSchema.parse(
    JSON.parse(readFileSync(ensureSentinelOpsState().operatorConfig, "utf8")) as unknown
  );
}

export function saveOperatorConfig(config: Omit<OperatorConfig, "updatedAt">): OperatorConfig {
  const parsed = OperatorConfigSchema.parse({
    ...config,
    updatedAt: new Date().toISOString()
  });
  writeFileSync(ensureSentinelOpsState().operatorConfig, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}
```

- [ ] **Step 5: Run the operator config test to verify it passes**

Run: `npx vitest run tests/operator-config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/core/store.ts src/core/operator-config.ts tests/operator-config.test.ts
git commit -m "feat: add sentinelops operator config state"
```

### Task 2: Add Codex-Guided Init, Repo/Channel Builder, And On-Off Controls

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/core/operator-config.ts`
- Modify: `README.md`
- Test: `tests/cli-core.test.ts`
- Test: `tests/cli-command-surface.test.ts`

- [ ] **Step 1: Write the failing init/config command test**

```ts
it("supports guided init inputs and operator on off controls", async () => {
  const init = await runCli([
    "init",
    "--repo",
    "example/repo",
    "--repo",
    "example/platform",
    "--slack-channel",
    "#ops-approvals",
    "--agent-command",
    "codex",
    "--agent-args",
    "[\"exec\",\"--json\"]",
    "--enabled",
    "true",
    "--json"
  ]);
  const initPayload = JSON.parse(init.stdout);
  expect(initPayload.ok).toBe(true);
  expect(initPayload.config.trackedRepos).toContain("example/repo");

  const toggle = await runCli(["automation", "disable", "--json"]);
  const togglePayload = JSON.parse(toggle.stdout);
  expect(togglePayload.config.enabled).toBe(false);
});
```

- [ ] **Step 2: Run the targeted CLI tests to confirm the current gap**

Run: `npx vitest run tests/cli-core.test.ts tests/cli-command-surface.test.ts`
Expected: FAIL because `init` does not yet save onboarding config and `automation disable` does not exist

- [ ] **Step 3: Extend `init` so Codex can act as the setup builder**

```ts
if (command === "init") {
  const repos = getMultiFlagValues(args, "--repo");
  const slackChannel = getFlagValue(args, "--slack-channel");
  const agentCommand = getFlagValue(args, "--agent-command") ?? "codex";
  const agentArgsRaw = getFlagValue(args, "--agent-args") ?? "[\"exec\",\"--json\"]";
  const enabled = (getFlagValue(args, "--enabled") ?? "true") === "true";

  const paths = ensureSentinelOpsState();
  const config =
    repos.length > 0 && slackChannel
      ? saveOperatorConfig({
          trackedRepos: repos,
          slackChannel,
          agentCommand,
          agentArgs: JSON.parse(agentArgsRaw) as string[],
          enabled
        })
      : loadOperatorConfig();

  return {
    exitCode: 0,
    stdout: formatJson({
      ok: true,
      command: "init",
      paths,
      config,
      nextPrompt:
        config === null
          ? "Provide --repo, --slack-channel, --agent-command, and --enabled to complete SentinelOps onboarding."
          : null
    })
  };
}
```

- [ ] **Step 4: Add explicit operator commands**

```ts
if (command === "automation" && subcommand === "enable") {
  return {
    exitCode: 0,
    stdout: formatJson({
      ok: true,
      command: "automation.enable",
      config: setOperatorEnabled(true)
    })
  };
}

if (command === "automation" && subcommand === "disable") {
  return {
    exitCode: 0,
    stdout: formatJson({
      ok: true,
      command: "automation.disable",
      config: setOperatorEnabled(false)
    })
  };
}
```

- [ ] **Step 5: Document the config-builder workflow**

```md
Use Codex to initialize SentinelOps for a workspace:

- `npm run cli -- init --repo example/repo --slack-channel #ops-approvals --agent-command codex --agent-args "[\"exec\",\"--json\"]" --enabled true --json`
- `npm run cli -- automation disable --json`
- `npm run cli -- automation enable --json`
```

- [ ] **Step 6: Run the CLI tests**

Run: `npx vitest run tests/cli-core.test.ts tests/cli-command-surface.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts src/core/operator-config.ts README.md tests/cli-core.test.ts tests/cli-command-surface.test.ts
git commit -m "feat: add guided init and operator toggle commands"
```

### Task 3: Add Automation Domain State

**Files:**
- Modify: `src/types.ts`
- Modify: `src/core/store.ts`
- Test: `tests/automation-store.test.ts`

- [ ] **Step 1: Write the failing webhook orchestration test**

```ts
import { describe, expect, it } from "vitest";
import { handleGithubIssueOpened } from "../src/core/automation-webhooks.js";

describe("github issue webhook intake", () => {
  it("creates an approval-pending automation job from a labeled issue", () => {
    const result = handleGithubIssueOpened({
      action: "opened",
      issue: {
        html_url: "https://github.com/example/repo/issues/77",
        title: "API errors after deploy",
        body: "Production is failing after deploy",
        labels: [{ name: "service:svc-api" }]
      },
      repository: { full_name: "example/repo" }
    });

    expect(result.job.status).toBe("awaiting_approval");
    expect(result.run.githubTarget).toBe("https://github.com/example/repo/issues/77");
    expect(result.job.serviceId).toBe("svc-api");
  });
});
```

- [ ] **Step 2: Run the store test to confirm the missing flow**

Run: `npx vitest run tests/automation-store.test.ts`
Expected: FAIL with errors like `appendAutomationEvent is not exported` and `saveAutomationJob is not exported`

- [ ] **Step 3: Extend the shared types**

```ts
export const AgentExecutionSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  exitCode: z.number().int(),
  transcriptPath: z.string(),
  summary: z.string(),
  startedAt: z.string(),
  finishedAt: z.string()
});
```

- [ ] **Step 4: Add automation persistence helpers**

```ts
export function listAutomationJobs(): AutomationJob[] {
  if (!existsSync(ensureSentinelOpsState().automationJobs)) {
    return [];
  }
  return AutomationJobSchema.array().parse(
    JSON.parse(readFileSync(ensureSentinelOpsState().automationJobs, "utf8")) as unknown
  );
}
```

- [ ] **Step 5: Run the store test to verify it passes**

Run: `npx vitest run tests/automation-store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/core/store.ts tests/automation-store.test.ts
git commit -m "feat: add sentinelops automation job state"
```

### Task 4: Normalize GitHub Issue Events Into SentinelOps Jobs

**Files:**
- Create: `src/core/automation-webhooks.ts`
- Create: `src/core/automation.ts`
- Modify: `src/core/planning.ts`
- Modify: `src/core/reporting.ts`
- Modify: `src/core/operator-config.ts`
- Test: `tests/automation-webhooks.test.ts`

- [ ] **Step 1: Write the failing webhook orchestration test**

```ts
import { describe, expect, it } from "vitest";
import { handleGithubIssueOpened } from "../src/core/automation-webhooks.js";

describe("github issue webhook intake", () => {
  it("creates an approval-pending automation job from a tracked labeled issue", () => {
    seedOperatorConfig({
      trackedRepos: ["example/repo"],
      slackChannel: "#ops-approvals",
      agentCommand: "codex",
      agentArgs: ["exec", "--json"],
      enabled: true
    });

    const result = handleGithubIssueOpened({
      action: "opened",
      issue: {
        html_url: "https://github.com/example/repo/issues/77",
        title: "API errors after deploy",
        body: "Production is failing after deploy",
        labels: [{ name: "service:svc-api" }]
      },
      repository: { full_name: "example/repo" }
    });

    expect(result.job.status).toBe("awaiting_approval");
    expect(result.run.githubTarget).toBe("https://github.com/example/repo/issues/77");
    expect(result.job.serviceId).toBe("svc-api");
  });
});
```

- [ ] **Step 2: Run the webhook test to confirm the missing flow**

Run: `npx vitest run tests/automation-webhooks.test.ts`
Expected: FAIL with `Cannot find module '../src/core/automation-webhooks.js'`

- [ ] **Step 3: Add the event normalization helpers**

```ts
function assertTrackedRepo(repositoryFullName: string): void {
  const config = requireOperatorConfig();
  if (!config.enabled) {
    throw new Error("SentinelOps automation is disabled.");
  }
  if (!config.trackedRepos.includes(repositoryFullName)) {
    throw new Error(`Repository ${repositoryFullName} is not tracked by SentinelOps.`);
  }
}
```

- [ ] **Step 4: Add the automation job creator**

```ts
export function createAutomationJob(input: {
  runId: string;
  serviceId: string;
  githubIssueUrl: string;
}): { job: AutomationJob } {
  const config = requireOperatorConfig();
  const job: AutomationJob = {
    id: `job-${Date.now()}`,
    runId: input.runId,
    source: "github_issue",
    serviceId: input.serviceId,
    githubIssueUrl: input.githubIssueUrl,
    status: "awaiting_approval",
    approvalMessageId: config.slackChannel,
    execution: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveAutomationJob(job);
  return { job };
}
```

- [ ] **Step 5: Ensure planning/reporting keep the GitHub issue visible**

```ts
const run = createPlanFromTarget(target);
run.serviceId = run.serviceId ?? inferServiceIdFromGithubTarget(target) ?? null;
run.auditTrail = [
  ...run.auditTrail,
  {
    at: new Date().toISOString(),
    action: "automation.github.issue.opened",
    detail: `Created automation run from ${target}.`
  }
];
```

- [ ] **Step 6: Run the webhook test to verify the issue-open path**

Run: `npx vitest run tests/automation-webhooks.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/automation.ts src/core/automation-webhooks.ts src/core/planning.ts src/core/reporting.ts tests/automation-webhooks.test.ts
git commit -m "feat: create automation jobs from github issue webhooks"
```

### Task 5: Add Slack Approval Delivery And Callback Handling

**Files:**
- Modify: `src/core/automation.ts`
- Modify: `src/core/automation-webhooks.ts`
- Modify: `src/core/approval.ts`
- Modify: `src/dashboard/server.ts`
- Test: `tests/automation-webhooks.test.ts`
- Test: `tests/cli-plugin-sim.test.ts`

- [ ] **Step 1: Write the failing approval callback test**

```ts
it("records Slack approval and advances the automation job", () => {
  const result = handleSlackApprovalCallback({
    type: "block_actions",
    user: { username: "anand" },
    actions: [{ action_id: "sentinelops_approve" }],
    state: {
      values: {
        sentinelops: {
          run_id: { value: "run-1" },
          job_id: { value: "job-1" }
        }
      }
    }
  });

  expect(result.run.approvals.at(-1)?.status).toBe("approved");
  expect(result.job.status).toBe("approved");
});
```

- [ ] **Step 2: Run the targeted test to confirm the callback gap**

Run: `npx vitest run tests/automation-webhooks.test.ts`
Expected: FAIL with `handleSlackApprovalCallback is not exported`

- [ ] **Step 3: Build the Slack approval message payload from existing SentinelOps packaging**

```ts
export function buildSlackApprovalRequest(runId: string, jobId: string) {
  const approvalPackage = createApprovalPackage(runId, {
    includePlan: true,
    includeDiff: true,
    includeTests: true
  });

  return {
    text: approvalPackage.package.pluginPayloads.slack.text,
    metadata: {
      runId,
      jobId
    }
  };
}
```

- [ ] **Step 4: Record approve and reject actions through the existing approval subsystem**

```ts
export function handleSlackApprovalCallback(payload: SlackApprovalPayload) {
  const runId = payload.state.values.sentinelops.run_id.value;
  const jobId = payload.state.values.sentinelops.job_id.value;
  const approved = payload.actions.some((action) => action.action_id === "sentinelops_approve");

  const run = recordApproval(runId, {
    source: "slack",
    status: approved ? "approved" : "rejected",
    by: payload.user.username || "slack-user"
  });

  const job = updateAutomationJobStatus(jobId, approved ? "approved" : "rejected");
  appendAutomationEvent({
    id: `evt-${Date.now()}`,
    jobId,
    kind: approved ? "slack.approved" : "slack.rejected",
    payload: { user: payload.user.username },
    at: new Date().toISOString()
  });

  return { run, job };
}
```

- [ ] **Step 5: Expose webhook/API routes in the dashboard server**

```ts
if (method === "POST" && path === "/webhooks/github") {
  const body = await readJsonBody(request);
  sendJson(response, 202, handleGithubWebhook(body, request.headers));
  return;
}

if (method === "POST" && path === "/webhooks/slack") {
  const body = await readJsonBody(request);
  sendJson(response, 200, handleSlackWebhook(body, request.headers));
  return;
}

if (method === "GET" && path === "/api/automation/jobs") {
  sendJson(response, 200, { jobs: listAutomationJobs() });
  return;
}
```

- [ ] **Step 6: Run the approval tests**

Run: `npx vitest run tests/automation-webhooks.test.ts tests/cli-plugin-sim.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/automation.ts src/core/automation-webhooks.ts src/core/approval.ts src/dashboard/server.ts tests/automation-webhooks.test.ts tests/cli-plugin-sim.test.ts
git commit -m "feat: add slack approval callbacks for automation jobs"
```

### Task 6: Execute An External Agent CLI After Approval

**Files:**
- Create: `src/core/agent-runner.ts`
- Modify: `src/core/automation.ts`
- Modify: `src/core/repo.ts`
- Test: `tests/automation-runner.test.ts`
- Test: `tests/automation-workflow.test.ts`

- [ ] **Step 1: Write the failing runner test**

```ts
import { describe, expect, it } from "vitest";
import { runAgentCommand } from "../src/core/agent-runner.js";

describe("agent runner", () => {
  it("captures transcript and exit code for a configured shell command", async () => {
    const result = await runAgentCommand({
      command: "node",
      args: ["-e", "console.log('sentinelops agent ran')"],
      runId: "run-1",
      jobId: "job-1"
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("sentinelops agent ran");
  });
});
```

- [ ] **Step 2: Run the agent runner test to verify the missing module**

Run: `npx vitest run tests/automation-runner.test.ts`
Expected: FAIL with `Cannot find module '../src/core/agent-runner.js'`

- [ ] **Step 3: Implement the external command runner**

```ts
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

export async function runAgentCommand(input: {
  command: string;
  args: string[];
  runId: string;
  jobId: string;
}) {
  const transcriptPath = getAutomationTranscriptPath(input.jobId);
  const child = spawn(input.command, input.args, {
    cwd: process.env.SENTINELOPS_WORKSPACE_ROOT ?? process.cwd(),
    shell: false
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  writeFileSync(transcriptPath, output);
  return {
    command: input.command,
    args: input.args,
    exitCode,
    transcriptPath,
    summary: output.trim().slice(0, 400),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString()
  };
}
```

- [ ] **Step 4: Wire approved jobs into the runner**

```ts
export async function executeApprovedAutomationJob(jobId: string) {
  const job = requireAutomationJob(jobId);
  if (job.status !== "approved") {
    throw new Error(`Automation job ${jobId} is not approved.`);
  }

  updateAutomationJobStatus(jobId, "running_agent");
  const execution = await runAgentCommand(resolveAgentCommand(job));
  const nextStatus = execution.exitCode === 0 ? "completed" : "failed";
  const updatedJob = saveAutomationJob({
    ...job,
    status: nextStatus,
    execution,
    updatedAt: new Date().toISOString()
  });

  appendAutomationEvent({
    id: `evt-${Date.now()}`,
    jobId,
    kind: execution.exitCode === 0 ? "agent.completed" : "agent.failed",
    payload: { exitCode: execution.exitCode, transcriptPath: execution.transcriptPath },
    at: new Date().toISOString()
  });

  return { job: updatedJob, execution };
}
```

- [ ] **Step 5: Include execution output in the GitHub result package**

```ts
const executionSummary = automationJob?.execution
  ? `Agent execution: ${automationJob.execution.summary}`
  : "Agent execution: not run";

return {
  resultPackage: {
    ...base,
    executionSummary,
    pluginPayloads: {
      github: {
        commentBody: `${base.pluginPayloads.github.commentBody}\n\n${executionSummary}`
      }
    }
  }
};
```

- [ ] **Step 6: Run the runner and workflow tests**

Run: `npx vitest run tests/automation-runner.test.ts tests/automation-workflow.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/agent-runner.ts src/core/automation.ts src/core/repo.ts tests/automation-runner.test.ts tests/automation-workflow.test.ts
git commit -m "feat: execute approved automation jobs with external agent cli"
```

### Task 7: Add Dashboard Pages For Config, Integrations, And Live Operations

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/dashboard/ui.ts`
- Modify: `src/dashboard/server.ts`
- Modify: `src/core/operator-config.ts`
- Test: `tests/dashboard-api.test.ts`
- Test: `tests/dashboard-ui.test.ts`
- Test: `tests/cli-command-surface.test.ts`

- [ ] **Step 1: Write the failing command-surface assertions**

```ts
it("shows operator config and automation views through the cli and dashboard", async () => {
  const jobs = await runCli(["automation", "list", "--json"]);
  const config = await runCli(["config", "get", "--key", "operator", "--json"]);
  const jobsPayload = JSON.parse(jobs.stdout);
  const configPayload = JSON.parse(config.stdout);
  expect(jobsPayload.ok).toBe(true);
  expect(Array.isArray(jobsPayload.jobs)).toBe(true);
  expect(configPayload.ok).toBe(true);
});
```

- [ ] **Step 2: Run the CLI surface test to confirm missing commands**

Run: `npx vitest run tests/cli-command-surface.test.ts`
Expected: FAIL with `UNKNOWN_COMMAND` for `automation`

- [ ] **Step 3: Add CLI automation inspection commands**

```ts
if (command === "automation" && subcommand === "list") {
  return {
    exitCode: 0,
    stdout: formatJson({
      ok: true,
      command: "automation.list",
      jobs: listAutomationJobs()
    })
  };
}

if (command === "automation" && subcommand === "show") {
  const jobId = getFlagValue(args, "--job");
  return {
    exitCode: 0,
    stdout: formatJson({
      ok: true,
      command: "automation.show",
      job: getAutomationJob(jobId!)
    })
  };
}
```

- [ ] **Step 4: Render dashboard pages for setup and operations**

```ts
<nav class="top-nav">
  <a href="/" data-page="overview">Overview</a>
  <a href="/automation" data-page="automation">Automation</a>
  <a href="/integrations" data-page="integrations">Integrations</a>
  <a href="/settings" data-page="settings">Settings</a>
</nav>

<section class="section fade-in" id="automation-section">
  <div class="section-header">
    <div>
      <span>AUTONOMOUS OPS</span>
      <h3>Automation Queue</h3>
    </div>
    <p>Track webhook intake, approvals, and agent runs in one place.</p>
  </div>
  <div id="automation-list" class="list-panel"></div>
</section>

<section class="section fade-in" id="settings-section">
  <div class="section-header">
    <div>
      <span>OPERATOR CONFIG</span>
      <h3>Tracked Repos And Channels</h3>
    </div>
    <p>Control which repos and channels SentinelOps should use for this workspace.</p>
  </div>
  <div id="settings-panel" class="meta-grid"></div>
</section>
```

```ts
const jobsPayload = await request("/api/automation/jobs");
const configPayload = await request("/api/operator-config");
els.automationList.innerHTML = jobsPayload.jobs
  .map((job) => `<article class="list-card"><strong>${job.status}</strong><div>${job.githubIssueUrl}</div></article>`)
  .join("");
els.settingsPanel.innerHTML =
  '<div class="meta-row"><div class="meta-label">Tracked repos</div><strong>' + configPayload.config.trackedRepos.join(", ") + '</strong></div>' +
  '<div class="meta-row"><div class="meta-label">Slack channel</div><strong>' + configPayload.config.slackChannel + '</strong></div>' +
  '<div class="meta-row"><div class="meta-label">Automation</div><strong>' + (configPayload.config.enabled ? "enabled" : "disabled") + '</strong></div>';
```

- [ ] **Step 5: Expose config and operator-control APIs**

```ts
if (method === "GET" && path === "/api/operator-config") {
  sendJson(response, 200, { config: loadOperatorConfig() });
  return;
}

if (method === "POST" && path === "/api/operator-config/toggle") {
  const body = await readJsonBody(request);
  const enabled = Boolean((body as { enabled?: unknown }).enabled);
  sendJson(response, 200, { config: setOperatorEnabled(enabled) });
  return;
}
```

- [ ] **Step 6: Run API, UI, and CLI tests**

Run: `npx vitest run tests/dashboard-api.test.ts tests/dashboard-ui.test.ts tests/cli-command-surface.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts src/dashboard/server.ts src/dashboard/ui.ts tests/dashboard-api.test.ts tests/dashboard-ui.test.ts tests/cli-command-surface.test.ts
git commit -m "feat: expose autonomous job status in cli and dashboard"
```

### Task 8: Document And Prove The End-To-End Autonomous Flow

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `src/demo/hackathon.ts`
- Modify: `package.json`
- Test: `tests/demo-hackathon.test.ts`
- Test: `tests/skill-docs.test.ts`

- [ ] **Step 1: Write the failing demo expectation**

```ts
it("runs the autonomous issue triage flow", async () => {
  const payload = await runHackathonDemo();
  expect(payload.steps.some((step) => step.step === "automation-issue-open" && step.ok)).toBe(true);
  expect(payload.steps.some((step) => step.step === "automation-agent-run" && step.ok)).toBe(true);
});
```

- [ ] **Step 2: Run the demo test to confirm the new steps are absent**

Run: `npx vitest run tests/demo-hackathon.test.ts`
Expected: FAIL because the autonomous steps do not exist yet

- [ ] **Step 3: Add the env contract and README flow**

```env
OPENAI_API_KEY=
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_CHANNEL=
SENTINELOPS_GITHUB_WEBHOOK_SECRET=
SENTINELOPS_AGENT_COMMAND=codex
SENTINELOPS_AGENT_ARGS_JSON=["exec","--json"]
SENTINELOPS_TRACKED_REPOS=example/repo,example/platform
SENTINELOPS_AUTONOMOUS_ENABLED=true
SENTINELOPS_USE_CANNED_DECISIONS=false
```

```md
## Autonomous Issue Flow

1. Initialize SentinelOps with tracked repos, Slack channel, agent command, and enabled state.
2. GitHub sends an `issues.opened` webhook with a `service:<service-id>` label.
3. SentinelOps creates a run, generates a plan, and posts a Slack approval request.
4. Slack approve records approval in SentinelOps and starts the configured agent CLI.
5. SentinelOps stores the transcript, updates the dashboard, and packages the GitHub result.
```

- [ ] **Step 4: Extend the demo harness with the autonomous steps**

```ts
steps.push(await execute("automation-issue-open", ["automation", "seed-issue", "--target", "https://github.com/example/repo/issues/77", "--service", "svc-api"]));
steps.push(await execute("automation-approve", ["approval", "record", "--run", runId, "--source", "slack", "--status", "approved", "--by", "demo-approver"]));
steps.push(await execute("automation-agent-run", ["automation", "run", "--job", jobId]));
```

- [ ] **Step 5: Run the full validation bundle**

Run: `npm test`
Expected: PASS for the full suite, including the new automation coverage

- [ ] **Step 6: Commit**

```bash
git add README.md .env.example src/demo/hackathon.ts package.json tests/demo-hackathon.test.ts tests/skill-docs.test.ts
git commit -m "docs: add autonomous sentinelops workflow"
```

## Final Verification Checklist

- Run: `npx vitest run tests/automation-store.test.ts tests/automation-webhooks.test.ts tests/automation-runner.test.ts tests/automation-workflow.test.ts`
- Run: `npx vitest run tests/dashboard-api.test.ts tests/dashboard-ui.test.ts tests/cli-command-surface.test.ts`
- Run: `npm test`
- Manually verify:
  - Run `npm run cli -- init --repo example/repo --slack-channel #ops-approvals --agent-command codex --agent-args "[\"exec\",\"--json\"]" --enabled true --json`
  - Start the dashboard server with `npm run dashboard:api`
  - POST a sample issue-open payload to `http://127.0.0.1:4100/webhooks/github`
  - Confirm a Slack approval payload is created or simulated
  - POST an approval callback to `http://127.0.0.1:4100/webhooks/slack`
  - Confirm the configured agent command transcript appears under `.sentinelops/transcripts/`
  - Open `http://127.0.0.1:4100/` and verify settings, linked repos/channels, and the automation queue update

## Spec Coverage Self-Review

- Covered: guided init, tracked repo and Slack channel config, operator on/off control, GitHub issue-triggered intake, Slack approval/deny, approval recording, external agent CLI execution, dashboard/CLI observability, transcript persistence, and end-to-end demo coverage.
- Covered: compatibility with Codex or Claude-style CLIs through a configurable shell command instead of hard-coding one agent.
- Intentionally excluded: deploy adapters, multi-tenant routing, real production infra integrations, and broader roadmap milestones outside this autonomous issue-resolution slice.

Plan complete and saved to `docs/superpowers/plans/2026-06-14-sentinelops-autonomous-operator.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
