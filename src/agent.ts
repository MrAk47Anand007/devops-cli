import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { AdapterHealth, JudgmentBrain, JudgmentInput } from "./core/contracts.js";
import { loadOperatorConfig } from "./core/operator-config.js";
import { runCommand } from "./core/agent-runner.js";
import { findSimilar } from "./memory.js";
import {
  BASELINE,
  DecisionSchema,
  type Decision,
  type Incident,
  type Metrics
} from "./types.js";

export interface JudgeOptions {
  useCanned?: boolean;
  provider?: "canned" | "openai" | "anthropic" | "ai-cli";
}

function adapterHealth(status: AdapterHealth["status"], detail: string): AdapterHealth {
  return {
    status,
    checkedAt: Date.now(),
    detail
  };
}

export function isAnomalous(metrics: Metrics): boolean {
  return (
    metrics.errorRate > BASELINE.errorRate * 3 ||
    metrics.latencyP95 > BASELINE.latencyP95 * 2
  );
}

function inferScenario(metrics: Metrics): "healthy" | "degraded" | "crash" {
  if (metrics.errorRate > 0.1 || metrics.latencyP95 > 1000) {
    return "crash";
  }
  if (metrics.errorRate > 0.01 || metrics.latencyP95 > 200) {
    return "degraded";
  }
  return "healthy";
}

function buildMemoryEvidence(similarIncident: Incident | null): string[] {
  if (!similarIncident) {
    return ["No similar incident found in memory."];
  }

  const evidence = [
    `Similar incident ${similarIncident.id}: ${similarIncident.summary}`,
    `Past agent action was ${similarIncident.agentAction} at ${similarIncident.agentConfidence}% confidence.`,
    `Past outcome: ${similarIncident.outcome}`
  ];

  if (similarIncident.humanOverride) {
    evidence.push(`Human override precedent favored ${similarIncident.humanOverride}.`);
  }

  return evidence;
}

function cannedDecision(metrics: Metrics, similarIncident: Incident | null): Decision {
  const scenario = inferScenario(metrics);
  const evidence = [
    `Error rate is ${(metrics.errorRate * 100).toFixed(2)}% versus baseline ${(BASELINE.errorRate * 100).toFixed(2)}%.`,
    `P95 latency is ${metrics.latencyP95}ms versus baseline ${BASELINE.latencyP95}ms.`,
    ...buildMemoryEvidence(similarIncident)
  ];

  if (scenario === "healthy") {
    return DecisionSchema.parse({
      action: "hold",
      confidence: 18,
      reasoning: "Signals are healthy, so there is no justification to roll back.",
      evidence,
      similarIncidentId: similarIncident?.id ?? null
    });
  }

  if (scenario === "degraded") {
    const favoredAction = similarIncident?.humanOverride ?? similarIncident?.agentAction ?? "hold";
    const confidence = similarIncident?.humanOverride === "hold" ? 67 : 61;
    return DecisionSchema.parse({
      action: favoredAction,
      confidence,
      reasoning:
        "The deploy is degraded but not conclusively failing, so the agent should escalate unless a prior human precedent tips the balance.",
      evidence,
      similarIncidentId: similarIncident?.id ?? null
    });
  }

  const precedentSupportsRollback =
    similarIncident?.humanOverride === "rollback" || similarIncident?.agentAction === "rollback";

  return DecisionSchema.parse({
    action: "rollback",
    confidence: precedentSupportsRollback ? 97 : 94,
    reasoning:
      "This looks like a severe deploy regression, and the impact is strong enough to justify an immediate rollback.",
    evidence,
    similarIncidentId: similarIncident?.id ?? null
  });
}

function operatorConfig() {
  return loadOperatorConfig();
}

function decisionPrompt(metrics: Metrics, similarIncident: Incident | null): string {
  const memoryBlock = similarIncident
    ? `A similar past incident exists:
- id: ${similarIncident.id}
- summary: ${similarIncident.summary}
- agent action: ${similarIncident.agentAction} at ${similarIncident.agentConfidence}% confidence
- human override: ${similarIncident.humanOverride ?? "none"}
- outcome: ${similarIncident.outcome}`
    : "No similar incident found in memory.";

  return `You are SentinelOps, a Codex-native deploy judgment agent.
Live metrics after a deploy:
- errorRate: ${(metrics.errorRate * 100).toFixed(2)}%
- latencyP95: ${metrics.latencyP95.toFixed(0)}ms
- requestsPerSec: ${metrics.requestsPerSec.toFixed(0)}

${memoryBlock}

Return a structured decision. Prefer safe autonomy: ask for rollback only when the evidence is strong.
If a similar incident had a human override, treat that as important precedent.`;
}

function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("Judgment brain returned no JSON decision payload.");
  }

  return trimmed.slice(first, last + 1);
}

function parseDecisionFromText(text: string): Decision {
  return DecisionSchema.parse(JSON.parse(extractJsonBlock(text)) as unknown);
}

export class CannedJudgmentBrain implements JudgmentBrain {
  readonly id = "canned";

  async decide(input: JudgmentInput): Promise<Decision> {
    return cannedDecision(input.metrics, input.similarIncident);
  }

  async health(): Promise<AdapterHealth> {
    return adapterHealth("ready", "Canned judgment brain is available.");
  }
}

async function openAiDecision(metrics: Metrics, similarIncident: Incident | null): Promise<Decision> {
  const model = operatorConfig()?.openai.model ?? "gpt-4o-2024-08-06";
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "user",
        content: decisionPrompt(metrics, similarIncident)
      }
    ],
    response_format: zodResponseFormat(DecisionSchema, "decision")
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("OpenAI returned no parsed decision.");
  }

  return parsed;
}

export class OpenAiJudgmentBrain implements JudgmentBrain {
  readonly id = "openai";

  async decide(input: JudgmentInput): Promise<Decision> {
    return openAiDecision(input.metrics, input.similarIncident);
  }

  async health(): Promise<AdapterHealth> {
    if (!process.env.OPENAI_API_KEY) {
      return adapterHealth("degraded", "OPENAI_API_KEY is not configured.");
    }
    return adapterHealth("ready", "OpenAI judgment brain is configured.");
  }
}

async function anthropicDecision(metrics: Metrics, similarIncident: Incident | null): Promise<Decision> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const model = operatorConfig()?.anthropic.model ?? "claude-3-5-sonnet-latest";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      temperature: 0,
      system:
        "You are SentinelOps, a Codex-native deploy judgment agent. Return only valid JSON matching the Decision schema.",
      messages: [
        {
          role: "user",
          content: decisionPrompt(metrics, similarIncident)
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text =
    payload.content
      ?.filter((entry) => entry.type === "text" && typeof entry.text === "string")
      .map((entry) => entry.text)
      .join("\n") ?? "";

  return parseDecisionFromText(text);
}

export class AnthropicJudgmentBrain implements JudgmentBrain {
  readonly id = "anthropic";

  async decide(input: JudgmentInput): Promise<Decision> {
    return anthropicDecision(input.metrics, input.similarIncident);
  }

  async health(): Promise<AdapterHealth> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return adapterHealth("degraded", "ANTHROPIC_API_KEY is not configured.");
    }
    return adapterHealth("ready", "Anthropic judgment brain is configured.");
  }
}

function aiCliPrompt(input: JudgmentInput): string {
  return [
    "You are SentinelOps, a Codex-native deploy judgment agent.",
    "Return only valid JSON for this schema:",
    '{"action":"rollback|hold","confidence":0,"reasoning":"...","evidence":["..."],"similarIncidentId":null}',
    decisionPrompt(input.metrics, input.similarIncident)
  ].join("\n");
}

export class AiCliJudgmentBrain implements JudgmentBrain {
  readonly id = "ai-cli";

  async decide(input: JudgmentInput): Promise<Decision> {
    const config = operatorConfig()?.aiCli ?? {
      command: "codex",
      args: ["exec", "--json"],
      healthArgs: ["--help"]
    };
    const result = await runCommand({
      command: config.command,
      args: config.args,
      stdinText: aiCliPrompt(input)
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `AI CLI judgment command failed with exit code ${result.exitCode}: ${result.output.trim()}`
      );
    }
    return parseDecisionFromText(result.output);
  }

  async health(): Promise<AdapterHealth> {
    const config = operatorConfig()?.aiCli ?? {
      command: "codex",
      args: ["exec", "--json"],
      healthArgs: ["--help"]
    };
    try {
      const result = await runCommand({
        command: config.command,
        args: config.healthArgs
      });
      if (result.exitCode !== 0) {
        return adapterHealth(
          "degraded",
          `AI CLI health check exited ${result.exitCode}: ${result.output.trim()}`
        );
      }
      return adapterHealth("ready", `AI CLI command ${config.command} is available.`);
    } catch (error) {
      return adapterHealth("unavailable", error instanceof Error ? error.message : String(error));
    }
  }
}

export function createJudgmentInput(metrics: Metrics): JudgmentInput {
  return {
    metrics,
    similarIncident: findSimilar(metrics)
  };
}

export function createDefaultJudgmentBrain(options: JudgeOptions = {}): JudgmentBrain {
  const configuredProvider = operatorConfig()?.judgmentProvider ?? "canned";
  const provider = options.provider ?? configuredProvider;
  if (options.useCanned === true || provider === "canned") {
    return new CannedJudgmentBrain();
  }
  if (
    provider === "openai" &&
    (process.env.SENTINELOPS_USE_CANNED_DECISIONS === "true" || !process.env.OPENAI_API_KEY)
  ) {
    return new CannedJudgmentBrain();
  }
  if (provider === "anthropic") {
    return new AnthropicJudgmentBrain();
  }
  if (provider === "ai-cli") {
    return new AiCliJudgmentBrain();
  }
  return new OpenAiJudgmentBrain();
}

export async function judge(metrics: Metrics, options: JudgeOptions = {}): Promise<Decision> {
  return createDefaultJudgmentBrain(options).decide(createJudgmentInput(metrics));
}
