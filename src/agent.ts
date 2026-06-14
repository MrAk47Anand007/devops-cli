import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
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

async function openAiDecision(metrics: Metrics, similarIncident: Incident | null): Promise<Decision> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const memoryBlock = similarIncident
    ? `A similar past incident exists:
- id: ${similarIncident.id}
- summary: ${similarIncident.summary}
- agent action: ${similarIncident.agentAction} at ${similarIncident.agentConfidence}% confidence
- human override: ${similarIncident.humanOverride ?? "none"}
- outcome: ${similarIncident.outcome}`
    : "No similar incident found in memory.";

  const completion = await client.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      {
        role: "user",
        content: `You are SentinelOps, a Codex-native deploy judgment agent.
Live metrics after a deploy:
- errorRate: ${(metrics.errorRate * 100).toFixed(2)}%
- latencyP95: ${metrics.latencyP95.toFixed(0)}ms
- requestsPerSec: ${metrics.requestsPerSec.toFixed(0)}

${memoryBlock}

Return a structured decision. Prefer safe autonomy: ask for rollback only when the evidence is strong.
If a similar incident had a human override, treat that as important precedent.`
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

export async function judge(metrics: Metrics, options: JudgeOptions = {}): Promise<Decision> {
  const similarIncident = findSimilar(metrics);
  const useCanned =
    options.useCanned ??
    (process.env.SENTINELOPS_USE_CANNED_DECISIONS === "true" || !process.env.OPENAI_API_KEY);

  if (useCanned) {
    return cannedDecision(metrics, similarIncident);
  }

  return openAiDecision(metrics, similarIncident);
}
