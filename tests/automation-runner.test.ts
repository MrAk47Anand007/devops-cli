import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAgentCommand } from "../src/core/agent-runner.js";

describe("agent runner", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-agent-runner-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("captures transcript and exit code for a configured shell command", async () => {
    const result = await runAgentCommand({
      command: "node",
      args: ["-e", "console.log('sentinelops agent ran')"],
      runId: "run-1",
      jobId: "job-1"
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("sentinelops agent ran");
    expect(existsSync(result.transcriptPath)).toBe(true);
    expect(readFileSync(result.transcriptPath, "utf8")).toContain("sentinelops agent ran");
  });
});
