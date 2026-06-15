import { runAgentCommand } from "./agent-runner.js";
import { getConfiguredChatChannel } from "./chat-channels.js";
import { createApprovalPackage, recordApproval } from "./approval.js";
import { requireOperatorConfig } from "./operator-config.js";
import { loadRun } from "./store.js";
import {
  appendAutomationEvent,
  getAutomationJob,
  listAutomationJobs,
  saveAutomationJob
} from "./store.js";
import { type ApprovalStatus, type AutomationJob, type AutomationJobStatus } from "../types.js";

export function requireAutomationJob(jobId: string): AutomationJob {
  const job = getAutomationJob(jobId);
  if (!job) {
    throw new Error(`Automation job ${jobId} not found.`);
  }
  return job;
}

export async function createAutomationJob(input: {
  runId: string;
  serviceId: string;
  githubIssueUrl: string;
}): Promise<{ job: AutomationJob }> {
  const config = requireOperatorConfig();
  const now = new Date().toISOString();
  const initialJob = saveAutomationJob({
    id: `job-${Date.now()}`,
    runId: input.runId,
    source: "github_issue",
    serviceId: input.serviceId,
    githubIssueUrl: input.githubIssueUrl,
    status: "awaiting_approval",
    approvalMessageId: null,
    execution: null,
    createdAt: now,
    updatedAt: now
  });
  const thread = await getConfiguredChatChannel().postApproval({
    incidentId: input.runId,
    summary: `Approval needed for ${input.serviceId}.`,
    evidence: [input.githubIssueUrl, `service:${input.serviceId}`, `channel:${config.slackChannel}`]
  });
  const job = saveAutomationJob({
    ...initialJob,
    approvalMessageId: thread.id,
    updatedAt: new Date().toISOString()
  });
  appendAutomationEvent({
    id: `evt-${Date.now()}`,
    jobId: job.id,
    kind: "github.issue.opened",
    payload: {
      githubIssueUrl: input.githubIssueUrl,
      serviceId: input.serviceId
    },
    at: now
  });
  return { job };
}

export function updateAutomationJobStatus(jobId: string, status: AutomationJobStatus): AutomationJob {
  const job = requireAutomationJob(jobId);
  return saveAutomationJob({
    ...job,
    status,
    updatedAt: new Date().toISOString()
  });
}

export function listAutomationJobsForCli(): AutomationJob[] {
  return listAutomationJobs().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function buildSlackApprovalRequest(runId: string, jobId: string): {
  text: string;
  metadata: {
    runId: string;
    jobId: string;
    requiresApproval: boolean;
    githubTarget: string | null;
  };
} {
  const approvalPackage = createApprovalPackage(runId, {
    includePlan: true,
    includeDiff: true,
    includeTests: true
  });

  return {
    text: approvalPackage.package.pluginPayloads.slack.text,
    metadata: {
      runId,
      jobId,
      requiresApproval: approvalPackage.package.pluginPayloads.slack.metadata.requiresApproval,
      githubTarget: approvalPackage.package.pluginPayloads.slack.metadata.githubTarget
    }
  };
}

export function recordAutomationApproval(input: {
  runId: string;
  jobId: string;
  source: string;
  status: ApprovalStatus;
  by: string;
}): { job: AutomationJob } {
  recordApproval(input.runId, {
    source: input.source,
    status: input.status,
    by: input.by
  });
  const job = updateAutomationJobStatus(
    input.jobId,
    input.status === "approved" ? "approved" : "rejected"
  );
  appendAutomationEvent({
    id: `evt-${Date.now()}`,
    jobId: input.jobId,
    kind: input.status === "approved" ? "slack.approved" : "slack.rejected",
    payload: { by: input.by, source: input.source },
    at: new Date().toISOString()
  });
  return { job };
}

function buildAutomationPrompt(job: AutomationJob): string {
  const run = loadRun(job.runId);
  const summary = run?.plan?.summary ?? `Investigate ${job.githubIssueUrl} and prepare a safe remediation path.`;
  const steps = run?.plan?.steps ?? [];
  return [
    "You are the SentinelOps autonomous operator.",
    `Run ID: ${job.runId}`,
    `Job ID: ${job.id}`,
    `Service: ${job.serviceId}`,
    `GitHub target: ${job.githubIssueUrl}`,
    `Plan summary: ${summary}`,
    steps.length > 0 ? `Plan steps: ${steps.join(" | ")}` : null,
    "Inspect the linked GitHub issue and the relevant repository context.",
    "Work non-interactively and finish with a concise final summary.",
    "If you cannot safely proceed, explain the blocker and exit."
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveAgentCommand(job: AutomationJob): { command: string; args: string[]; stdinText?: string } {
  const config = requireOperatorConfig();
  const usesCodexExec = config.agentCommand === "codex" && config.agentArgs.includes("exec");
  return {
    command: config.agentCommand,
    args: config.agentArgs,
    stdinText: usesCodexExec ? buildAutomationPrompt(job) : undefined
  };
}

export async function executeApprovedAutomationJob(jobId: string): Promise<{
  job: AutomationJob;
  execution: AutomationJob["execution"];
}> {
  const job = requireAutomationJob(jobId);
  if (job.status !== "approved") {
    throw new Error(`Automation job ${jobId} is not approved.`);
  }

  const running = updateAutomationJobStatus(jobId, "running_agent");
  const resolved = resolveAgentCommand(running);
  const execution = await runAgentCommand({
    command: resolved.command,
    args: resolved.args,
    runId: running.runId,
    jobId: running.id,
    stdinText: resolved.stdinText
  });
  const nextStatus: AutomationJobStatus = execution.exitCode === 0 ? "completed" : "failed";
  const updatedJob = saveAutomationJob({
    ...running,
    status: nextStatus,
    execution,
    updatedAt: new Date().toISOString()
  });
  appendAutomationEvent({
    id: `evt-${Date.now()}`,
    jobId,
    kind: execution.exitCode === 0 ? "agent.completed" : "agent.failed",
    payload: {
      exitCode: execution.exitCode,
      transcriptPath: execution.transcriptPath
    },
    at: new Date().toISOString()
  });
  if (updatedJob.approvalMessageId) {
    await getConfiguredChatChannel().notify(
      { id: updatedJob.approvalMessageId },
      `Automation job ${updatedJob.id} finished with status ${updatedJob.status}.`
    );
  }

  return {
    job: updatedJob,
    execution
  };
}
