import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAgentCommand, runCommand } from "../src/core/agent-runner.js";

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

  it("writes optional stdin text into the child process", async () => {
    const result = await runAgentCommand({
      command: "node",
      args: ["-e", "process.stdin.setEncoding('utf8'); let data=''; process.stdin.on('data', (chunk) => data += chunk); process.stdin.on('end', () => console.log(data.trim()));"],
      runId: "run-2",
      jobId: "job-2",
      stdinText: "sentinelops prompt"
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("sentinelops prompt");
    expect(readFileSync(result.transcriptPath, "utf8")).toContain("sentinelops prompt");
  });

  it("supports raw command execution without transcript persistence", async () => {
    const result = await runCommand({
      command: "node",
      args: ["-e", "console.log('{\"ok\":true}')"]
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("\"ok\":true");
  });
});
