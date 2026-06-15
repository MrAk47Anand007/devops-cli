import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("cli foundational ops", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-cli-ops-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("initializes workspace state and reports status", async () => {
    const init = await runCli(["init", "--json"]);
    const initPayload = JSON.parse(init.stdout);
    expect(initPayload.ok).toBe(true);
    expect(initPayload.paths.root.endsWith(".sentinelops")).toBe(true);

    const status = await runCli(["status", "--json"]);
    const statusPayload = JSON.parse(status.stdout);
    expect(statusPayload.ok).toBe(true);
    expect(statusPayload.status.initialized).toBe(true);
    expect(statusPayload.status.latestRunId).toBe(null);
  });

  it("stores config values and reports integration status", async () => {
    const setResult = await runCli(["config", "set", "threshold.high", "60", "--json"]);
    const setPayload = JSON.parse(setResult.stdout);
    expect(setPayload.ok).toBe(true);
    expect(setPayload.value).toBe("60");

    const getResult = await runCli(["config", "get", "--key", "threshold.high", "--json"]);
    const getPayload = JSON.parse(getResult.stdout);
    expect(getPayload.ok).toBe(true);
    expect(getPayload.value).toBe("60");

    const integrations = await runCli(["integration", "list", "--json"]);
    const integrationsPayload = JSON.parse(integrations.stdout);
    expect(integrationsPayload.ok).toBe(true);
    expect(integrationsPayload.integrations.some((entry: { id: string }) => entry.id === "github")).toBe(true);
    expect(
      integrationsPayload.integrations.some((entry: { id: string }) => entry.id === "judgment")
    ).toBe(true);
    expect(
      integrationsPayload.integrations.some((entry: { id: string }) => entry.id === "deploy")
    ).toBe(true);

    const health = await runCli(["integration", "health", "--json"]);
    const healthPayload = JSON.parse(health.stdout);
    expect(healthPayload.ok).toBe(true);
    expect(healthPayload.health.some((entry: { id: string; status: string }) => entry.id === "dashboard" && entry.status === "ready")).toBe(true);
    expect(healthPayload.health.some((entry: { id: string }) => entry.id === "simulator-metrics")).toBe(true);
    expect(healthPayload.health.some((entry: { id: string }) => entry.id === "judgment-canned")).toBe(true);
    expect(healthPayload.health.some((entry: { id: string }) => entry.id === "deploy-simulator")).toBe(true);
  });

  it("ingests dashboard context through the dedicated command", async () => {
    await runCli(["scenario", "load", "degraded-api", "--json"]);
    const result = await runCli(["dashboard", "ingest", "--service", "svc-api", "--json"]);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.context.service.id).toBe("svc-api");
    expect(payload.run.status).toBe("context_created");
  });
});
