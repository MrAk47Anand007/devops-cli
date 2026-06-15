import { createAutomationJob, recordAutomationApproval } from "./automation.js";
import { requireOperatorConfig } from "./operator-config.js";
import { createPlanFromTarget } from "./planning.js";
import { saveRun, writeLatestRunId } from "./store.js";
import { ArgoCdTrigger, GitHubTrigger, JenkinsTrigger } from "./triggers.js";
import type { RawWebhook, Trigger } from "./contracts.js";

export interface GithubIssueOpenedPayload {
  action: string;
  issue: {
    html_url: string;
    title?: string;
    body?: string | null;
    labels?: Array<{ name?: string }>;
  };
  repository: {
    full_name: string;
  };
}

export interface SlackApprovalPayload {
  type?: string;
  user?: {
    username?: string;
    name?: string;
    id?: string;
  };
  actions?: Array<{ action_id?: string; value?: string }>;
  state?: {
    values?: Record<string, Record<string, { value?: string }>>;
  };
}

export type GithubWebhookResult =
  | {
      kind: "deploy_event";
      deployEvent: {
        deployId: string;
        service: string;
        sha: string;
        target: string;
      };
    }
  | ({
      kind: "issue_event";
    } & Awaited<ReturnType<typeof handleGithubIssueOpened>>);

export interface TriggerWebhookResult {
  kind: "deploy_event";
  deployEvent: {
    deployId: string;
    service: string;
    sha: string;
    target: string;
  };
}

function extractServiceLabel(labels: Array<{ name?: string }>): string {
  const match = labels
    .map((label) => label.name ?? "")
    .find((name) => name.startsWith("service:"));
  if (!match) {
    throw new Error("GitHub issue is missing a service:<service-id> label.");
  }
  return match.replace("service:", "");
}

function assertTrackedRepo(repositoryFullName: string): void {
  const config = requireOperatorConfig();
  if (!config.enabled) {
    throw new Error("SentinelOps automation is disabled.");
  }
  if (!config.trackedRepos.includes(repositoryFullName)) {
    throw new Error(`Repository ${repositoryFullName} is not tracked by SentinelOps.`);
  }
}

function findStateValue(payload: SlackApprovalPayload, key: string): string | null {
  const values = payload.state?.values ?? {};
  for (const block of Object.values(values)) {
    for (const input of Object.values(block)) {
      if (input.value && key === "runId" && input.value.startsWith("run-")) {
        return input.value;
      }
      if (input.value && key === "jobId" && input.value.startsWith("job-")) {
        return input.value;
      }
    }
  }
  const actionValue = payload.actions?.map((action) => action.value).find(Boolean);
  if (actionValue) {
    try {
      const parsed = JSON.parse(actionValue) as { runId?: string; jobId?: string };
      return key === "runId" ? parsed.runId ?? null : parsed.jobId ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function handleGithubIssueOpened(payload: GithubIssueOpenedPayload) {
  if (payload.action !== "opened" && payload.action !== "labeled") {
    throw new Error(`Unsupported GitHub issue action ${payload.action}.`);
  }
  assertTrackedRepo(payload.repository.full_name);
  const serviceId = extractServiceLabel(payload.issue.labels ?? []);
  const planned = createPlanFromTarget(payload.issue.html_url);
  const now = new Date().toISOString();
  const run = saveRun({
    ...planned,
    serviceId,
    updatedAt: now,
    auditTrail: [
      ...planned.auditTrail,
      {
        at: now,
        action: "automation.github.issue.opened",
        detail: `Created automation run from ${payload.repository.full_name}.`
      }
    ]
  });
  writeLatestRunId(run.id);
  const { job } = await createAutomationJob({
    runId: run.id,
    serviceId,
    githubIssueUrl: payload.issue.html_url
  });
  return { run, job };
}

export async function handleGithubWebhook(
  payload: unknown,
  headers?: Record<string, string | undefined>
): Promise<GithubWebhookResult> {
  const raw: RawWebhook = {
    headers: headers ?? {},
    body: payload
  };
  const trigger = new GitHubTrigger(process.env.SENTINELOPS_GITHUB_WEBHOOK_SECRET ?? null);
  if (!trigger.verifySignature(raw)) {
    throw new Error("GitHub webhook signature verification failed.");
  }
  const deployEvent = trigger.toDeployEvent(raw);
  if (deployEvent) {
    return {
      kind: "deploy_event",
      deployEvent
    };
  }
  const issuePayload = payload as GithubIssueOpenedPayload;
  return {
    kind: "issue_event",
    ...(await handleGithubIssueOpened(issuePayload))
  };
}

function handleTriggerWebhook(
  payload: unknown,
  headers: Record<string, string | undefined> | undefined,
  trigger: Trigger,
  sourceLabel: string
): TriggerWebhookResult {
  const raw: RawWebhook = {
    headers: headers ?? {},
    body: payload
  };
  if (!trigger.verifySignature(raw)) {
    throw new Error(`${sourceLabel} webhook signature verification failed.`);
  }
  const deployEvent = trigger.toDeployEvent(raw);
  if (!deployEvent) {
    throw new Error(`${sourceLabel} webhook did not contain a deploy event.`);
  }
  return {
    kind: "deploy_event",
    deployEvent
  };
}

export async function handleJenkinsWebhook(
  payload: unknown,
  headers?: Record<string, string | undefined>
): Promise<TriggerWebhookResult> {
  return handleTriggerWebhook(
    payload,
    headers,
    new JenkinsTrigger(process.env.SENTINELOPS_JENKINS_WEBHOOK_SECRET ?? null),
    "Jenkins"
  );
}

export async function handleArgoCdWebhook(
  payload: unknown,
  headers?: Record<string, string | undefined>
): Promise<TriggerWebhookResult> {
  return handleTriggerWebhook(
    payload,
    headers,
    new ArgoCdTrigger(process.env.SENTINELOPS_ARGOCD_WEBHOOK_SECRET ?? null),
    "ArgoCD"
  );
}

export function handleSlackApprovalCallback(payload: SlackApprovalPayload) {
  const runId = findStateValue(payload, "runId");
  const jobId = findStateValue(payload, "jobId");
  if (!runId || !jobId) {
    throw new Error("Slack approval payload is missing runId or jobId.");
  }
  const approved = payload.actions?.some((action) => action.action_id === "sentinelops_approve") ?? false;
  const user = payload.user?.username ?? payload.user?.name ?? payload.user?.id ?? "slack-user";
  const result = recordAutomationApproval({
    runId,
    jobId,
    source: "slack",
    status: approved ? "approved" : "rejected",
    by: user
  });
  return result;
}

export function handleSlackWebhook(payload: unknown) {
  return handleSlackApprovalCallback(payload as SlackApprovalPayload);
}
