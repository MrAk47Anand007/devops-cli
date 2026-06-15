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

function readTranscriptFinalAgentMessage(transcriptPath: string | null): string | null {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return null;
  }

  const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);
  let latestMessage: string | null = null;

  for (const line of lines) {
    if (!line.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as {
        type?: string;
        item?: { type?: string; text?: string; status?: string };
      };
      if (
        parsed.type === "item.completed" &&
        parsed.item?.type === "agent_message" &&
        typeof parsed.item.text === "string" &&
        parsed.item.text.trim()
      ) {
        latestMessage = parsed.item.text.trim();
      }
    } catch {
      // Ignore non-JSONL transcript lines such as warnings.
    }
  }

  return latestMessage;
}

type GithubAutomationOutcome = "already_done" | "needs_changes" | "blocked";

function classifyAutomationOutcome(finalAgentMessage: string | null, executionSummary: string, exitCode: number | null): GithubAutomationOutcome {
  const combined = `${finalAgentMessage ?? ""}\n${executionSummary}`.toLowerCase();

  const alreadyDoneSignals = [
    "already implemented",
    "already appears to implement",
    "already ships",
    "no clear implementation gap",
    "safe remediation is issue hygiene",
    "close or update the issue",
    "feature already"
  ];

  if (alreadyDoneSignals.some((signal) => combined.includes(signal))) {
    return "already_done";
  }

  if (exitCode !== null && exitCode !== 0) {
    return "blocked";
  }

  const blockedSignals = [
    "cannot safely proceed",
    "blocked",
    "access is denied",
    "sandbox setup",
    "failed to",
    "unable to"
  ];
  if (blockedSignals.some((signal) => combined.includes(signal))) {
    return "blocked";
  }

  return "needs_changes";
}

function summarizeOutcome(outcome: GithubAutomationOutcome): string {
  switch (outcome) {
    case "already_done":
      return "Codex found the requested behavior already present, so the recommended action is validation plus issue closure.";
    case "needs_changes":
      return "Codex found follow-up implementation work is still needed, so the issue should remain open with a concrete fix plan.";
    case "blocked":
      return "Codex could not produce a safe implementation decision, so the issue should remain open until the blocker is resolved.";
  }
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
    automationOutcome: {
      classification: GithubAutomationOutcome;
      summary: string;
      agentMessage: string | null;
    };
    pluginPayloads: {
      github: {
        commentBody: string;
        status: string;
        closeIssue: boolean;
        issueState: "open" | "closed";
        stateReason: "completed" | "reopened" | null;
      };
      slack: {
        text: string;
        status: "approved" | "blocked";
      };
    };
  };
} {
  const run = requireRun(runId);
  const latestApproval = run.approvals.at(-1) ?? null;
  const readiness = getGithubUpdateReadiness(run);
  const automationJob = listAutomationJobs().find((job) => job.runId === runId);
  const finalAgentMessage = readTranscriptFinalAgentMessage(automationJob?.execution?.transcriptPath ?? null);
  const executionSummary = automationJob?.execution
    ? `Agent execution: ${automationJob.execution.summary || `exit ${automationJob.execution.exitCode}`}`
    : "Agent execution: not run";
  const outcome = classifyAutomationOutcome(
    finalAgentMessage,
    executionSummary,
    automationJob?.execution?.exitCode ?? null
  );
  const outcomeSummary = summarizeOutcome(outcome);
  const canCloseIssue = readiness.ready && outcome === "already_done";
  const issueActionText = canCloseIssue
    ? "Recommended GitHub action: close the issue as completed after validation."
    : outcome === "needs_changes"
      ? "Recommended GitHub action: keep the issue open and track the implementation work."
      : "Recommended GitHub action: keep the issue open until the blocker is resolved.";
  const commentSections = [
    `SentinelOps result for ${runId}`,
    `Summary: ${run.plan?.summary ?? "No plan summary available."}`,
    `Approval: ${latestApproval?.status ?? "missing"}`,
    `Tests recorded: ${run.tests.length}`,
    run.githubTarget ? `Target: ${run.githubTarget}` : "Target: none",
    executionSummary,
    `Outcome: ${outcome}`,
    outcomeSummary,
    issueActionText
  ];
  if (finalAgentMessage) {
    commentSections.push("", "Codex assessment:", finalAgentMessage);
  }
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
      automationOutcome: {
        classification: outcome,
        summary: outcomeSummary,
        agentMessage: finalAgentMessage
      },
      pluginPayloads: {
        github: {
          commentBody: [...commentSections, `Ready for protected GitHub update: ${readiness.ready ? "yes" : "no"}`].join("\n"),
          status: readiness.ready ? (latestApproval?.status ?? "pending") : "blocked",
          closeIssue: canCloseIssue,
          issueState: canCloseIssue ? "closed" : "open",
          stateReason: canCloseIssue ? "completed" : null
        },
        slack: {
          text: [
            `SentinelOps follow-up for ${runId}`,
            `Repo target: ${run.githubTarget ?? "none"}`,
            `Outcome: ${outcome}`,
            outcomeSummary,
            issueActionText
          ].join("\n"),
          status: readiness.ready ? "approved" : "blocked"
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
