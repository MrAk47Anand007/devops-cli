import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getLatestRunId, loadRun, saveRun, writeLatestRunId } from "./store.js";
import { TestPlanSchema, type RunRecord, type TestPlan, type TestResult } from "../types.js";

function requireLatestRun(): RunRecord {
  const runId = getLatestRunId();
  if (!runId) {
    throw new Error("No latest run available.");
  }
  const run = loadRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found.`);
  }
  return run;
}

function requireRun(runId: string): RunRecord {
  const run = loadRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found.`);
  }
  return run;
}

function workspacePackageJson(): Record<string, unknown> {
  const packageJsonPath = join(process.cwd(), "package.json");
  if (!existsSync(packageJsonPath)) {
    return {};
  }
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
}

export function discoverTests(): {
  frameworks: string[];
  files: string[];
} {
  const frameworks: string[] = [];
  const packageJson = workspacePackageJson();
  const dependencies = {
    ...(typeof packageJson.dependencies === "object" && packageJson.dependencies ? packageJson.dependencies : {}),
    ...(typeof packageJson.devDependencies === "object" && packageJson.devDependencies ? packageJson.devDependencies : {})
  } as Record<string, unknown>;

  if ("vitest" in dependencies) {
    frameworks.push("vitest");
  }
  if ("jest" in dependencies) {
    frameworks.push("jest");
  }

  const testsDir = join(process.cwd(), "tests");
  const files = existsSync(testsDir)
    ? readdirSync(testsDir)
        .filter((entry) => entry.endsWith(".test.ts"))
        .sort()
    : [];

  return { frameworks, files };
}

export function generateLatestTestPlan(target: string): {
  run: RunRecord;
  testPlan: TestPlan;
} {
  const run = requireLatestRun();
  const discovered = discoverTests();
  const commands = discovered.frameworks.includes("vitest")
    ? ["npm test", "npm run cli -- push gate --run <run-id> --json"]
    : ["npm test"];

  const testPlan = TestPlanSchema.parse({
    target,
    commands,
    rationale: [
      `Validate the active ${target} change before any push or external update.`,
      "Record deterministic test evidence in the SentinelOps run."
    ]
  });

  const now = new Date().toISOString();
  const updated = saveRun({
    ...run,
    updatedAt: now,
    testPlan,
    auditTrail: [
      ...run.auditTrail,
      {
        at: now,
        action: "test.generate-plan",
        detail: `Generated test plan for target ${target}.`
      }
    ]
  });
  writeLatestRunId(updated.id);

  return { run: updated, testPlan };
}

function deterministicResults(run: RunRecord): TestResult[] {
  if (run.scenario === "failing-test") {
    return [
      {
        name: "unit regression suite",
        status: "failed",
        detail: "Known worker regression remains failing in the deterministic scenario."
      },
      {
        name: "approval gate check",
        status: "passed",
        detail: "SentinelOps gate command remained available."
      }
    ];
  }

  return [
    {
      name: "unit regression suite",
      status: "passed",
      detail: "Core regression checks passed for the current run."
    },
    {
      name: "workflow gate check",
      status: "passed",
      detail: "Approval and push-gate workflow checks passed."
    }
  ];
}

export function runLatestTestPlan(): {
  run: RunRecord;
  results: TestResult[];
} {
  const run = requireLatestRun();
  if (!run.testPlan) {
    throw new Error("No latest test plan is available.");
  }

  const results = deterministicResults(run);
  const now = new Date().toISOString();
  const updated = saveRun({
    ...run,
    updatedAt: now,
    tests: results,
    auditTrail: [
      ...run.auditTrail,
      {
        at: now,
        action: "test.run",
        detail: `Recorded ${results.length} deterministic test results.`
      }
    ]
  });
  writeLatestRunId(updated.id);

  return { run: updated, results };
}

export function createTestReport(runId: string): {
  run: RunRecord;
  report: {
    summary: string;
    results: TestResult[];
  };
} {
  const run = requireRun(runId);
  const passed = run.tests.filter((entry) => entry.status === "passed").length;
  const failed = run.tests.filter((entry) => entry.status === "failed").length;
  const notRun = run.tests.filter((entry) => entry.status === "not_run").length;

  return {
    run,
    report: {
      summary: `${passed} passed, ${failed} failed, ${notRun} not_run.`,
      results: run.tests
    }
  };
}
