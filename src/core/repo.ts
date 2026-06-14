import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getLatestRunId, listAutomationJobs, loadRun, readMemoryEntries, saveRun, writeLatestRunId, writeMemoryEntries, type MemoryEntry } from "./store.js";
import { evaluateRunPolicy } from "./policy.js";
import { createTestReport } from "./testing.js";
import { type RunRecord } from "../types.js";

function requireRun(runId: string): RunRecord {
  const run = loadRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found.`);
  }
  return run;
}

function requireLatestRun(): RunRecord {
  const latestRunId = getLatestRunId();
  if (!latestRunId) {
    throw new Error("No latest run available.");
  }
  return requireRun(latestRunId);
}

function readWorkspacePackageJson(): Record<string, unknown> {
  const packageJsonPath = join(process.cwd(), "package.json");
  if (!existsSync(packageJsonPath)) {
    return {};
  }
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
}

export function understandRepo(contextPath: string): {
  repo: {
    packageManager: string;
    scripts: string[];
    testFrameworks: string[];
    ci: string;
    contextPath: string;
  };
} {
  const packageJson = readWorkspacePackageJson();
  const scripts =
    typeof packageJson.scripts === "object" && packageJson.scripts
      ? Object.keys(packageJson.scripts as Record<string, unknown>)
      : [];
  const dependencies = {
    ...(typeof packageJson.dependencies === "object" && packageJson.dependencies ? packageJson.dependencies : {}),
    ...(typeof packageJson.devDependencies === "object" && packageJson.devDependencies ? packageJson.devDependencies : {})
  } as Record<string, unknown>;

  return {
    repo: {
      packageManager: existsSync(join(process.cwd(), "package-lock.json")) ? "npm" : "unknown",
      scripts,
      testFrameworks: ["vitest", "jest"].filter((name) => name in dependencies),
      ci: existsSync(join(process.cwd(), ".github", "workflows")) ? "github-actions" : "local",
      contextPath
    }
  };
}

function workspaceDiffFiles(): string[] {
  const tracked = [
    ".gitignore",
    "README.md",
    "package.json",
    "src/cli.ts",
    "src/types.ts"
  ];
  return tracked.filter((file) => existsSync(join(process.cwd(), file)));
}

export function prepareChange(target: string): {
  run: RunRecord;
  change: {
    summary: string;
    checklist: string[];
    target: string;
  };
} {
  const run = requireLatestRun();
  const now = new Date().toISOString();
  const updated = saveRun({
    ...run,
    updatedAt: now,
    githubTarget: target,
    auditTrail: [
      ...run.auditTrail,
      {
        at: now,
        action: "change.prepare",
        detail: `Prepared change package for ${target}.`
      }
    ]
  });
  writeLatestRunId(updated.id);

  return {
    run: updated,
    change: {
      summary: `Prepared remediation package for ${updated.context?.service.name ?? "latest target"}.`,
      checklist: [
        "Review repo context and linked GitHub target.",
        "Collect diff, tests, and approval evidence.",
        "Hold push until SentinelOps gate passes."
      ],
      target
    }
  };
}

export function getChangeDiff(runId: string): {
  run: RunRecord;
  diff: {
    files: string[];
    summary: string;
  };
} {
  const run = requireRun(runId);
  const files = workspaceDiffFiles();
  return {
    run,
    diff: {
      files,
      summary: `Prepared ${files.length} changed workspace files for review.`
    }
  };
}

export function getChangeTestReport(runId: string) {
  return createTestReport(runId);
}

export function summarizeChange(runId: string): {
  run: RunRecord;
  summary: string;
} {
  const run = requireRun(runId);
  const approval = run.approvals.at(-1);
  const passed = run.tests.filter((entry) => entry.status === "passed").length;
  return {
    run,
    summary: `${run.plan?.summary ?? "No plan"} Latest approval is ${approval?.status ?? "missing"} and ${passed} tests passed.`
  };
}

function getGithubUpdateReadiness(run: RunRecord): {
  ready: boolean;
  blockedReasons: string[];
} {
  const violations = evaluateRunPolicy(run).filter((entry) =>
    ["APPROVAL_REQUIRED", "TEST_EVIDENCE_REQUIRED", "CRITICAL_RISK"].includes(entry.id)
  );
  const blockedReasons = violations.map((entry) => entry.message);
  if (!run.githubTarget) {
    blockedReasons.push("A GitHub target is required before any GitHub update handoff.");
  }
  return {
    ready: blockedReasons.length === 0,
    blockedReasons
  };
}

export function createGithubResultPackage(runId: string): {
  run: RunRecord;
  resultPackage: {
    runId: string;
    summary: string;
    latestApproval: RunRecord["approvals"][number] | null;
    tests: RunRecord["tests"];
    githubTarget: string | null;
    readiness: {
      ready: boolean;
      blockedReasons: string[];
      requiresPlugin: true;
    };
    executionSummary: string;
    pluginPayloads: {
      github: {
        commentBody: string;
        status: string;
      };
    };
  };
} {
  const run = requireRun(runId);
  const latestApproval = run.approvals.at(-1) ?? null;
  const readiness = getGithubUpdateReadiness(run);
  const automationJob = listAutomationJobs().find((job) => job.runId === runId);
  const executionSummary = automationJob?.execution
    ? `Agent execution: ${automationJob.execution.summary || `exit ${automationJob.execution.exitCode}`}`
    : "Agent execution: not run";
  return {
    run,
    resultPackage: {
      runId,
      summary: run.plan?.summary ?? "No plan summary available.",
      latestApproval,
      tests: run.tests,
      githubTarget: run.githubTarget,
      readiness: {
        ...readiness,
        requiresPlugin: true
      },
      executionSummary,
      pluginPayloads: {
        github: {
          commentBody: [
            `SentinelOps result for ${runId}`,
            `Summary: ${run.plan?.summary ?? "No plan summary available."}`,
            `Approval: ${latestApproval?.status ?? "missing"}`,
            `Tests recorded: ${run.tests.length}`,
            run.githubTarget ? `Target: ${run.githubTarget}` : "Target: none",
            executionSummary,
            `Ready for protected GitHub update: ${readiness.ready ? "yes" : "no"}`
          ].join("\n"),
          status: readiness.ready ? (latestApproval?.status ?? "pending") : "blocked"
        }
      }
    }
  };
}

export function updateRepoMemory(runId: string): {
  entry: MemoryEntry;
  entries: MemoryEntry[];
} {
  const run = requireRun(runId);
  const tags = [run.serviceId, run.scenario, run.githubTarget]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/[/:.-]+/))
    .map((value) => value.toLowerCase());
  const entry: MemoryEntry = {
    runId: run.id,
    summary: run.plan?.summary ?? run.context?.summary ?? "SentinelOps run memory entry.",
    serviceId: run.serviceId,
    githubTarget: run.githubTarget,
    updatedAt: new Date().toISOString(),
    tags: Array.from(new Set(tags))
  };
  const existing = readMemoryEntries().filter((item) => item.runId !== runId);
  const entries = writeMemoryEntries([entry, ...existing]);
  return { entry, entries };
}

export function showRepoMemory(): MemoryEntry[] {
  return readMemoryEntries();
}

export function searchMemory(target: string): MemoryEntry[] {
  const query = target.toLowerCase();
  return readMemoryEntries().filter((entry) => {
    return (
      entry.runId.toLowerCase().includes(query) ||
      (entry.serviceId?.toLowerCase().includes(query) ?? false) ||
      (entry.githubTarget?.toLowerCase().includes(query) ?? false) ||
      entry.summary.toLowerCase().includes(query) ||
      entry.tags.some((tag) => tag.includes(query))
    );
  });
}
