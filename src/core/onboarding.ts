import { saveOperatorConfig } from "./operator-config.js";
import { type OperatorConfig } from "../types.js";

export interface LiveOnboardingInput {
  repo: string;
  slackChannel: string;
  agentCommand?: string;
  agentArgs?: string[];
  enabled?: boolean;
}

export interface LiveOnboardingResult {
  config: OperatorConfig;
  repo: string;
  slackChannel: string;
  dashboardPath: string;
  codexPrompt: string;
  pluginFlow: string[];
}

export function normalizeGithubRepoInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Provide a GitHub repo URL or owner/repo name.");
  }

  if (!trimmed.includes("://")) {
    const parts = trimmed.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new Error(`Cannot infer GitHub repo from ${input}. Use owner/repo or a GitHub URL.`);
    }
    return `${parts[0]}/${parts[1]}`;
  }

  const url = new URL(trimmed);
  if (!url.hostname.toLowerCase().endsWith("github.com")) {
    throw new Error(`Expected a github.com URL, got ${url.hostname}.`);
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Cannot infer GitHub repo from ${input}.`);
  }
  return `${parts[0]}/${parts[1]}`;
}

export function createLiveOnboarding(input: LiveOnboardingInput): LiveOnboardingResult {
  const repo = normalizeGithubRepoInput(input.repo);
  const slackChannel = input.slackChannel.trim();
  if (!slackChannel) {
    throw new Error("Provide a Slack channel name.");
  }

  const config = saveOperatorConfig({
    trackedRepos: [repo],
    slackChannel,
    agentCommand: input.agentCommand ?? "codex",
    agentArgs: input.agentArgs ?? ["exec", "--json"],
    enabled: input.enabled ?? true
  });

  return {
    config,
    repo,
    slackChannel,
    dashboardPath: "/automation",
    codexPrompt:
      `Use SentinelOps live mode for ${repo} and ${slackChannel}. ` +
      "Inspect GitHub with the GitHub plugin, create the SentinelOps automation job, post approval with the Slack plugin, " +
      "wait for approval, run the configured agent command only after approval, then post the result back to GitHub.",
    pluginFlow: [
      "Use GitHub plugin to inspect the target repo and issue.",
      "Run SentinelOps automation seed-issue with the GitHub issue URL and service label.",
      "Use Slack plugin to post the SentinelOps approval text and include runId/jobId in the approval action value.",
      "Record approval in SentinelOps after the human approves.",
      "Run the approved SentinelOps automation job.",
      "Use GitHub plugin to post the SentinelOps result package back to the issue or PR.",
      "Keep the dashboard open on /automation to watch job status and transcripts update."
    ]
  };
}
