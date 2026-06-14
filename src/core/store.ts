import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  AutomationEventSchema,
  AutomationJobSchema,
  ContextSchema,
  DashboardScenarioSchema,
  OperatorConfigSchema,
  RunRecordSchema,
  type AutomationEvent,
  type AutomationJob,
  type Context,
  type DashboardScenario,
  type OperatorConfig,
  type RunRecord
} from "../types.js";

export interface SentinelOpsPaths {
  root: string;
  runs: string;
  latestRun: string;
  currentScenario: string;
  latestContext: string;
  config: string;
  memory: string;
  dashboardState: string;
  operatorConfig: string;
  automationJobs: string;
  automationEvents: string;
  transcripts: string;
}

function getWorkspaceRoot(): string {
  return resolve(process.env.SENTINELOPS_WORKSPACE_ROOT ?? process.cwd());
}

export function ensureSentinelOpsState(): SentinelOpsPaths {
  const root = join(getWorkspaceRoot(), ".sentinelops");
  const runs = join(root, "runs");
  const latestRun = join(root, "latest-run.txt");
  const currentScenario = join(root, "current-scenario.json");
  const latestContext = join(root, "context.json");
  const config = join(root, "config.json");
  const memory = join(root, "memory.json");
  const dashboardState = join(root, "dashboard-state.json");
  const operatorConfig = join(root, "operator-config.json");
  const automationJobs = join(root, "automation-jobs.json");
  const automationEvents = join(root, "automation-events.json");
  const transcripts = join(root, "transcripts");

  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }
  if (!existsSync(runs)) {
    mkdirSync(runs, { recursive: true });
  }
  if (!existsSync(transcripts)) {
    mkdirSync(transcripts, { recursive: true });
  }

  return {
    root,
    runs,
    latestRun,
    currentScenario,
    latestContext,
    config,
    memory,
    dashboardState,
    operatorConfig,
    automationJobs,
    automationEvents,
    transcripts
  };
}

function getRunPath(runId: string): string {
  const { runs } = ensureSentinelOpsState();
  return join(runs, `${runId}.json`);
}

export function saveRun(run: RunRecord): RunRecord {
  const parsed = RunRecordSchema.parse(run);
  writeFileSync(getRunPath(parsed.id), `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

export function listRuns(): RunRecord[] {
  const { runs } = ensureSentinelOpsState();
  return readdirSync(runs)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readFileSync(join(runs, entry), "utf8")) as unknown)
    .map((value) => RunRecordSchema.parse(value));
}

export function writeLatestRunId(runId: string): void {
  const { latestRun } = ensureSentinelOpsState();
  writeFileSync(latestRun, `${runId}\n`);
}

export function getLatestRunId(): string | null {
  const { latestRun } = ensureSentinelOpsState();
  if (!existsSync(latestRun)) {
    return null;
  }
  return readFileSync(latestRun, "utf8").trim() || null;
}

export function loadRun(runId: string): RunRecord | null {
  const filePath = getRunPath(runId);
  if (!existsSync(filePath)) {
    return null;
  }
  return RunRecordSchema.parse(JSON.parse(readFileSync(filePath, "utf8")) as unknown);
}

export function createRunId(): string {
  return `run-${Date.now()}`;
}

export function writeCurrentScenario(scenario: DashboardScenario): void {
  const { currentScenario } = ensureSentinelOpsState();
  const parsed = DashboardScenarioSchema.parse(scenario);
  writeFileSync(currentScenario, `${JSON.stringify({ scenario: parsed }, null, 2)}\n`);
}

export function readCurrentScenario(): DashboardScenario | null {
  const { currentScenario } = ensureSentinelOpsState();
  if (!existsSync(currentScenario)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(currentScenario, "utf8")) as { scenario: unknown };
  return DashboardScenarioSchema.parse(parsed.scenario);
}

export function writeLatestContext(context: Context): Context {
  const { latestContext } = ensureSentinelOpsState();
  const parsed = ContextSchema.parse(context);
  writeFileSync(latestContext, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

export function readLatestContext(): Context | null {
  const { latestContext } = ensureSentinelOpsState();
  if (!existsSync(latestContext)) {
    return null;
  }
  return ContextSchema.parse(JSON.parse(readFileSync(latestContext, "utf8")) as unknown);
}

export function readConfig(): Record<string, string> {
  const { config } = ensureSentinelOpsState();
  if (!existsSync(config)) {
    return {};
  }
  return JSON.parse(readFileSync(config, "utf8")) as Record<string, string>;
}

export function writeConfig(nextConfig: Record<string, string>): Record<string, string> {
  const { config } = ensureSentinelOpsState();
  writeFileSync(config, `${JSON.stringify(nextConfig, null, 2)}\n`);
  return nextConfig;
}

export interface MemoryEntry {
  runId: string;
  summary: string;
  serviceId: string | null;
  githubTarget: string | null;
  updatedAt: string;
  tags: string[];
}

export function readMemoryEntries(): MemoryEntry[] {
  const { memory } = ensureSentinelOpsState();
  if (!existsSync(memory)) {
    return [];
  }
  return JSON.parse(readFileSync(memory, "utf8")) as MemoryEntry[];
}

export function writeMemoryEntries(entries: MemoryEntry[]): MemoryEntry[] {
  const { memory } = ensureSentinelOpsState();
  writeFileSync(memory, `${JSON.stringify(entries, null, 2)}\n`);
  return entries;
}

export function readOperatorConfig(): OperatorConfig | null {
  const { operatorConfig } = ensureSentinelOpsState();
  if (!existsSync(operatorConfig)) {
    return null;
  }
  return OperatorConfigSchema.parse(JSON.parse(readFileSync(operatorConfig, "utf8")) as unknown);
}

export function writeOperatorConfig(config: OperatorConfig): OperatorConfig {
  const parsed = OperatorConfigSchema.parse(config);
  writeFileSync(ensureSentinelOpsState().operatorConfig, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

export function listAutomationJobs(): AutomationJob[] {
  const { automationJobs } = ensureSentinelOpsState();
  if (!existsSync(automationJobs)) {
    return [];
  }
  return AutomationJobSchema.array().parse(JSON.parse(readFileSync(automationJobs, "utf8")) as unknown);
}

export function getAutomationJob(jobId: string): AutomationJob | null {
  return listAutomationJobs().find((job) => job.id === jobId) ?? null;
}

export function saveAutomationJob(job: AutomationJob): AutomationJob {
  const parsed = AutomationJobSchema.parse(job);
  const jobs = listAutomationJobs().filter((entry) => entry.id !== parsed.id);
  jobs.push(parsed);
  writeFileSync(ensureSentinelOpsState().automationJobs, `${JSON.stringify(jobs, null, 2)}\n`);
  return parsed;
}

export function listAutomationEvents(): AutomationEvent[] {
  const { automationEvents } = ensureSentinelOpsState();
  if (!existsSync(automationEvents)) {
    return [];
  }
  return AutomationEventSchema.array().parse(JSON.parse(readFileSync(automationEvents, "utf8")) as unknown);
}

export function appendAutomationEvent(event: AutomationEvent): AutomationEvent {
  const parsed = AutomationEventSchema.parse(event);
  const events = listAutomationEvents();
  events.push(parsed);
  writeFileSync(ensureSentinelOpsState().automationEvents, `${JSON.stringify(events, null, 2)}\n`);
  return parsed;
}

export function getAutomationTranscriptPath(jobId: string): string {
  const { transcripts } = ensureSentinelOpsState();
  return join(transcripts, `${jobId}.log`);
}
