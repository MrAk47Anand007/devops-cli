import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSimulatorDeployTarget, defaultSimulatorRuntime } from "./core/simulator-adapters.js";
import { type Scenario } from "./types.js";

export interface AuditEntry {
  timestamp: number;
  actor: string;
  action: "deploy" | "rollback" | "decision" | "override" | "config";
  detail: string;
}

const DEFAULT_AUDIT_PATH = fileURLToPath(new URL("../data/audit.json", import.meta.url));

function getAuditPath(): string {
  return resolve(process.env.SENTINELOPS_AUDIT_PATH ?? DEFAULT_AUDIT_PATH);
}

function ensureAuditStore(): void {
  const filePath = getAuditPath();
  const folder = dirname(filePath);
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }
  if (!existsSync(filePath)) {
    writeFileSync(filePath, "[]\n");
  }
}

function parseAuditStore(raw: string): AuditEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed) as unknown;
  return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
}

function writeAuditStore(audit: AuditEntry[]): void {
  const filePath = getAuditPath();
  const payload = `${JSON.stringify(audit, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, payload);
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (errorCode === "EPERM" || errorCode === "EEXIST") {
      writeFileSync(filePath, payload);
    } else {
      throw error;
    }
  } finally {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }
}

export function readAudit(): AuditEntry[] {
  ensureAuditStore();
  const filePath = getAuditPath();
  try {
    return parseAuditStore(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Recover from empty or torn writes instead of crashing the command/test run.
      writeAuditStore([]);
      return [];
    }
    throw error;
  }
}

export function logAudit(entry: AuditEntry): AuditEntry[] {
  const audit = readAudit();
  audit.push(entry);
  writeAuditStore(audit);
  return audit;
}

export function deploy(scenario: Scenario, deployId: string): void {
  defaultSimulatorDeployTarget.activateScenario(scenario, deployId);
  logAudit({
    timestamp: Date.now(),
    actor: "system",
    action: "deploy",
    detail: `${deployId} -> scenario=${scenario}`
  });
}

export function rollback(deployId: string): void {
  const previousScenario = defaultSimulatorRuntime.getScenario();
  void defaultSimulatorDeployTarget.rollback(deployId, { dryRun: false });
  logAudit({
    timestamp: Date.now(),
    actor: "agent",
    action: "rollback",
    detail: `rolled back ${deployId} from ${previousScenario} -> healthy`
  });
}
