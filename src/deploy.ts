import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getScenario, setScenario, type Scenario } from "./simulator.js";

export interface AuditEntry {
  timestamp: number;
  actor: string;
  action: "deploy" | "rollback" | "decision" | "override";
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

export function readAudit(): AuditEntry[] {
  ensureAuditStore();
  return JSON.parse(readFileSync(getAuditPath(), "utf8")) as AuditEntry[];
}

export function logAudit(entry: AuditEntry): AuditEntry[] {
  const audit = readAudit();
  audit.push(entry);
  writeFileSync(getAuditPath(), `${JSON.stringify(audit, null, 2)}\n`);
  return audit;
}

export function deploy(scenario: Scenario, deployId: string): void {
  setScenario(scenario);
  logAudit({
    timestamp: Date.now(),
    actor: "system",
    action: "deploy",
    detail: `${deployId} -> scenario=${scenario}`
  });
}

export function rollback(deployId: string): void {
  const previousScenario = getScenario();
  setScenario("healthy");
  logAudit({
    timestamp: Date.now(),
    actor: "agent",
    action: "rollback",
    detail: `rolled back ${deployId} from ${previousScenario} -> healthy`
  });
}
