import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deploy, readAudit, rollback } from "../src/deploy.js";
import { getScenario, setScenario } from "../src/simulator.js";

describe("deploy/rollback", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-audit-"));
    const auditPath = join(tempDir, "audit.json");
    writeFileSync(auditPath, "[]\n");
    process.env.SENTINELOPS_AUDIT_PATH = auditPath;
    setScenario("healthy");
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_AUDIT_PATH;
    setScenario("healthy");
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("deploy flips the live scenario and logs to audit", () => {
    const before = readAudit().length;
    deploy("crash", "deploy-test");
    expect(getScenario()).toBe("crash");
    expect(readAudit().length).toBe(before + 1);
  });

  it("rollback returns production to healthy", () => {
    deploy("crash", "deploy-test");
    rollback("deploy-test");
    expect(getScenario()).toBe("healthy");
  });
});
