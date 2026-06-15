import { logAudit } from "../deploy.js";
import { guard } from "./guard.js";
import { readOperatorConfig, writeOperatorConfig } from "./store.js";
import { OperatorConfigSchema, type OperatorConfig } from "../types.js";

export interface SaveOperatorConfigInput {
  trackedRepos: string[];
  slackChannel: string;
  agentCommand: string;
  agentArgs: string[];
  judgmentProvider?: "canned" | "openai" | "anthropic" | "ai-cli";
  openai?: {
    model?: string;
  };
  anthropic?: {
    model?: string;
  };
  aiCli?: {
    command?: string;
    args?: string[];
    healthArgs?: string[];
  };
  deployTarget?: "simulator" | "kubernetes" | "docker";
  kubernetes?: {
    command?: string;
    context?: string;
    namespace?: string;
    deployment?: string;
    service?: string;
  };
  docker?: {
    command?: string;
    composeFile?: string;
    service?: string;
    container?: string;
  };
  metricSource?: "simulator" | "prometheus" | "grafana";
  prometheus?: {
    url?: string;
    errorRateExpr?: string;
    latencyP95Expr?: string;
    requestsPerSecExpr?: string;
    baselineErrorRateExpr?: string;
    baselineLatencyP95Expr?: string;
    baselineRequestsPerSecExpr?: string;
    baselineLookbackHours?: number;
  };
  grafana?: {
    url?: string;
    token?: string;
    datasourceUid?: string;
    dashboardUid?: string;
    errorRateExpr?: string;
    latencyP95Expr?: string;
    requestsPerSecExpr?: string;
    baselineErrorRateExpr?: string;
    baselineLatencyP95Expr?: string;
    baselineRequestsPerSecExpr?: string;
    baselineLookbackHours?: number;
  };
  enabled: boolean;
}

export function loadOperatorConfig(): OperatorConfig | null {
  return readOperatorConfig();
}

export function requireOperatorConfig(): OperatorConfig {
  const config = loadOperatorConfig();
  if (!config) {
    throw new Error("SentinelOps operator config has not been initialized.");
  }
  return config;
}

export function saveOperatorConfig(
  input: SaveOperatorConfigInput,
  options?: { actor?: string; approved?: boolean }
): OperatorConfig {
  const current = loadOperatorConfig();
  const enabledDecision = guard({
    actor: options?.actor ?? "operator-config",
    action: "config.write",
    configKey: "operator.enabled",
    previousValue: current?.enabled ?? null,
    nextValue: input.enabled,
    humanApproved: options?.approved ?? false
  });
  logAudit({
    timestamp: Date.now(),
    actor: options?.actor ?? "operator-config",
    action: "config",
    detail: `operator-config save (${enabledDecision.code})`
  });
  if (!enabledDecision.ok) {
    throw new Error(enabledDecision.message);
  }

  const parsed = OperatorConfigSchema.parse({
    ...input,
    judgmentProvider: input.judgmentProvider ?? "canned",
    openai: input.openai ?? {},
    anthropic: input.anthropic ?? {},
    aiCli: input.aiCli ?? {},
    deployTarget: input.deployTarget ?? "simulator",
    kubernetes: input.kubernetes ?? {},
    docker: input.docker ?? {},
    metricSource: input.metricSource ?? "simulator",
    prometheus: input.prometheus ?? {},
    grafana: input.grafana ?? {},
    updatedAt: new Date().toISOString()
  });
  return writeOperatorConfig(parsed);
}

export function setOperatorEnabled(
  enabled: boolean,
  options?: { actor?: string; approved?: boolean }
): OperatorConfig {
  const current = requireOperatorConfig();
  const decision = guard({
    actor: options?.actor ?? "operator-config",
    action: "config.write",
    configKey: "operator.enabled",
    previousValue: current.enabled,
    nextValue: enabled,
    humanApproved: options?.approved ?? false
  });
  logAudit({
    timestamp: Date.now(),
    actor: options?.actor ?? "operator-config",
    action: "config",
    detail: `operator.enabled -> ${enabled} (${decision.code})`
  });
  if (!decision.ok) {
    throw new Error(decision.message);
  }

  return writeOperatorConfig({
    ...current,
    enabled,
    updatedAt: new Date().toISOString()
  });
}
