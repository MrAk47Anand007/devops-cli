import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { getAutomationTranscriptPath } from "./store.js";
import { AgentExecutionSchema, type AgentExecution } from "../types.js";

export async function runAgentCommand(input: {
  command: string;
  args: string[];
  runId: string;
  jobId: string;
}): Promise<AgentExecution> {
  const transcriptPath = getAutomationTranscriptPath(input.jobId);
  const startedAt = new Date().toISOString();
  const child = spawn(input.command, input.args, {
    cwd: process.env.SENTINELOPS_WORKSPACE_ROOT ?? process.cwd(),
    shell: false
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });

  writeFileSync(transcriptPath, output);
  return AgentExecutionSchema.parse({
    command: input.command,
    args: input.args,
    exitCode,
    transcriptPath,
    summary: output.trim().slice(0, 400),
    startedAt,
    finishedAt: new Date().toISOString()
  });
}
