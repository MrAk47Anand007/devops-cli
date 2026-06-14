import { runAgentCommand } from "./agent-runner.js";
import { createApprovalPackage, recordApproval } from "./approval.js";
import { requireOperatorConfig } from "./operator-config.js";
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

export function createAutomationJob(input: {
  runId: string;
  serviceId: string;
  githubIssueUrl: string;
}): { job: AutomationJob } {
  const config = requireOperatorConfig();
  const now = new Date().toISOString();
  const job = saveAutomationJob({
    id: `job-${Date.now()}`,
    runId: input.runId,
    source: "github_issue",
    serviceId: input.serviceId,
    githubIssueUrl: input.githubIssueUrl,
    status: "awaiting_approval",
    approvalMessageId: config.slackChannel,
    execution: null,
    createdAt: now,
    updatedAt: now
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

function resolveAgentCommand(): { command: string; args: string[] } {
  const config = requireOperatorConfig();
  return {
    command: config.agentCommand,
    args: config.agentArgs
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
  const resolved = resolveAgentCommand();
  const execution = await runAgentCommand({
    command: resolved.command,
    args: resolved.args,
    runId: running.runId,
    jobId: running.id
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

  return {
    job: updatedJob,
    execution
  };
}
