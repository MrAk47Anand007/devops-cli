import { readOperatorConfig, writeOperatorConfig } from "./store.js";
import { OperatorConfigSchema, type OperatorConfig } from "../types.js";

export interface SaveOperatorConfigInput {
  trackedRepos: string[];
  slackChannel: string;
  agentCommand: string;
  agentArgs: string[];
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

export function saveOperatorConfig(input: SaveOperatorConfigInput): OperatorConfig {
  const parsed = OperatorConfigSchema.parse({
    ...input,
    updatedAt: new Date().toISOString()
  });
  return writeOperatorConfig(parsed);
}

export function setOperatorEnabled(enabled: boolean): OperatorConfig {
  const current = requireOperatorConfig();
  return writeOperatorConfig({
    ...current,
    enabled,
    updatedAt: new Date().toISOString()
  });
}
