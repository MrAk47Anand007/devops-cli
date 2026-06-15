import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { getAutomationTranscriptPath } from "./store.js";
import { AgentExecutionSchema, type AgentExecution } from "../types.js";

export interface CommandRunResult {
  command: string;
  args: string[];
  exitCode: number;
  output: string;
  startedAt: string;
  finishedAt: string;
}

export async function runCommand(input: {
  command: string;
  args: string[];
  stdinText?: string;
}): Promise<CommandRunResult> {
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

  if (input.stdinText) {
    child.stdin.write(input.stdinText);
  }
  child.stdin.end();

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });

  return {
    command: input.command,
    args: input.args,
    exitCode,
    output,
    startedAt,
    finishedAt: new Date().toISOString()
  };
}

export async function runAgentCommand(input: {
  command: string;
  args: string[];
  runId: string;
  jobId: string;
  stdinText?: string;
}): Promise<AgentExecution> {
  const transcriptPath = getAutomationTranscriptPath(input.jobId);
  const result = await runCommand(input);
  writeFileSync(transcriptPath, result.output);
  return AgentExecutionSchema.parse({
    command: result.command,
    args: result.args,
    exitCode: result.exitCode,
    transcriptPath,
    summary: result.output.trim().slice(0, 400),
    startedAt: result.startedAt,
    finishedAt: result.finishedAt
  });
}
