import { runCli } from "../cli.js";

interface DemoStepResult {
  step: string;
  ok: boolean;
  payload: unknown;
}

function requireRunId(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "run" in value &&
    typeof (value as { run?: { id?: unknown } }).run?.id === "string"
  ) {
    return (value as { run: { id: string } }).run.id;
  }
  throw new Error("Expected demo step to return a run id.");
}

function requireJobId(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "job" in value &&
    typeof (value as { job?: { id?: unknown } }).job?.id === "string"
  ) {
    return (value as { job: { id: string } }).job.id;
  }
  throw new Error("Expected demo step to return a job id.");
}

async function execute(step: string, argv: string[]): Promise<DemoStepResult> {
  const result = await runCli([...argv, "--json"]);
  const payload = JSON.parse(result.stdout) as unknown;
  return {
    step,
    ok: result.exitCode === 0,
    payload
  };
}

async function main(): Promise<void> {
  const steps: DemoStepResult[] = [];

  steps.push(await execute("operator-init", [
    "init",
    "--repo",
    "example/repo",
    "--slack-channel",
    "#ops-approvals",
    "--agent-command",
    "node",
    "--agent-args",
    "[\"-e\",\"console.log('sentinelops autonomous agent completed')\"]",
    "--enabled",
    "true"
  ]));

  const automationIssueStep = await execute("automation-issue-open", [
    "automation",
    "seed-issue",
    "--target",
    "https://github.com/example/repo/issues/77",
    "--service",
    "svc-api"
  ]);
  steps.push(automationIssueStep);
  const automationJobId = requireJobId(automationIssueStep.payload);

  steps.push(await execute("automation-approve", [
    "automation",
    "approve",
    "--job",
    automationJobId,
    "--by",
    "demo-approver"
  ]));
  steps.push(await execute("automation-agent-run", ["automation", "run", "--job", automationJobId]));

  steps.push(await execute("load-scenario", ["scenario", "load", "post-deploy-errors"]));
  steps.push(await execute("dashboard-ingest", ["dashboard", "ingest", "--service", "svc-api"]));

  const planStep = await execute("plan-create", ["plan", "create", "--context", ".sentinelops/context.json"]);
  steps.push(planStep);
  const runId = requireRunId(planStep.payload);

  steps.push(await execute("change-prepare", ["change", "prepare", "--target", "https://github.com/example/repo/issues/77"]));
  steps.push(await execute("test-generate-plan", ["test", "generate-plan", "--target", "service"]));
  steps.push(await execute("test-run", ["test", "run", "--plan", "latest"]));
  steps.push(await execute("approval-package", ["approval", "package", "--run", runId, "--include-plan", "--include-diff", "--include-tests"]));
  steps.push(await execute("slack-simulate", ["integration", "simulate", "--provider", "slack", "--run", runId]));
  steps.push(await execute("approval-record", ["approval", "record", "--run", runId, "--source", "slack", "--status", "approved", "--by", "demo-approver"]));
  steps.push(await execute("push-gate", ["push", "gate", "--run", runId]));
  steps.push(await execute("github-result-package", ["github", "result-package", "--run", runId]));
  steps.push(await execute("github-simulate", ["integration", "simulate", "--provider", "github", "--run", runId]));
  steps.push(await execute("push-record", ["push", "record", "--run", runId, "--commit", "demoabc123456"]));
  steps.push(await execute("incident-resolve", ["dashboard", "incident", "resolve", "--run", runId, "--incident", "inc-post-1"]));
  steps.push(await execute("report-create", ["report", "create", "--run", runId]));
  steps.push(await execute("memory-record", ["memory", "record", "--run", runId]));

  const failed = steps.filter((step) => !step.ok);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: failed.length === 0,
        command: "demo.hackathon",
        runId,
        steps
      },
      null,
      2
    )}\n`
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        command: "demo.hackathon",
        error: {
          code: "DEMO_HACKATHON_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
});
