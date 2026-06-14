import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadOperatorConfig,
  saveOperatorConfig,
  setOperatorEnabled
} from "../src/core/operator-config.js";

describe("operator config", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-operator-config-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists tracked repos, slack channel, agent command, and enabled state", () => {
    saveOperatorConfig({
      trackedRepos: ["example/repo", "example/platform"],
      slackChannel: "#ops-approvals",
      agentCommand: "codex",
      agentArgs: ["exec", "--json"],
      enabled: true
    });

    setOperatorEnabled(false);

    const config = loadOperatorConfig();
    expect(config?.trackedRepos).toEqual(["example/repo", "example/platform"]);
    expect(config?.slackChannel).toBe("#ops-approvals");
    expect(config?.enabled).toBe(false);
  });
});
