import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { createLiveOnboarding, normalizeGithubRepoInput } from "../src/core/onboarding.js";

describe("live onboarding", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-live-onboarding-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("normalizes GitHub URLs and owner repo names", () => {
    expect(normalizeGithubRepoInput("example/repo")).toBe("example/repo");
    expect(normalizeGithubRepoInput("https://github.com/example/repo/issues/77")).toBe("example/repo");
  });

  it("creates plugin-first live onboarding config", () => {
    const result = createLiveOnboarding({
      repo: "https://github.com/example/repo",
      slackChannel: "#ops-approvals"
    });

    expect(result.config.trackedRepos).toEqual(["example/repo"]);
    expect(result.config.slackChannel).toBe("#ops-approvals");
    expect(result.codexPrompt).toContain("GitHub plugin");
    expect(result.pluginFlow.some((step) => step.includes("Slack plugin"))).toBe(true);
  });

  it("supports the onboard cli command", async () => {
    const result = await runCli([
      "onboard",
      "--repo-url",
      "https://github.com/example/repo",
      "--slack-channel",
      "#ops-approvals",
      "--json"
    ]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("onboard");
    expect(payload.repo).toBe("example/repo");
    expect(payload.dashboardPath).toBe("/automation");
  });
});
