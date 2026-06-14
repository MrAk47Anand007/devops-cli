import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("hackathon demo harness", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-demo-hackathon-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("runs the written hackathon flow end to end", async () => {
    const stdout =
      process.platform === "win32"
        ? execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run demo:hackathon"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              SENTINELOPS_WORKSPACE_ROOT: tempDir
            },
            encoding: "utf8"
          })
        : execFileSync("npm", ["run", "demo:hackathon"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              SENTINELOPS_WORKSPACE_ROOT: tempDir
            },
            encoding: "utf8"
          });
    const lines = stdout.trim().split(/\r?\n/);
    const payload = JSON.parse(lines.slice(lines.findIndex((line) => line.trim().startsWith("{"))).join("\n")) as {
      ok: boolean;
      runId: string;
      steps: Array<{ step: string; ok: boolean }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.runId).toMatch(/^run-/);
    expect(payload.steps.some((step) => step.step === "github-simulate" && step.ok)).toBe(true);
    expect(payload.steps.some((step) => step.step === "incident-resolve" && step.ok)).toBe(true);
  });
});
