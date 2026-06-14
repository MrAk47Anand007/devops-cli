import { z } from "zod";

export const ActionSchema = z.enum(["rollback", "hold"]);
export type Action = z.infer<typeof ActionSchema>;

export const MetricsSchema = z.object({
  timestamp: z.number(),
  errorRate: z.number(),
  latencyP95: z.number(),
  requestsPerSec: z.number()
});
export type Metrics = z.infer<typeof MetricsSchema>;

export const IncidentSchema = z.object({
  id: z.string(),
  deployId: z.string(),
  summary: z.string(),
  errorRate: z.number(),
  latencyP95: z.number(),
  agentAction: ActionSchema,
  agentConfidence: z.number(),
  humanOverride: ActionSchema.nullable(),
  outcome: z.string()
});
export type Incident = z.infer<typeof IncidentSchema>;

export const DecisionSchema = z.object({
  action: ActionSchema,
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  evidence: z.array(z.string()),
  similarIncidentId: z.string().nullable()
});
export type Decision = z.infer<typeof DecisionSchema>;

export const HumanDecisionSchema = z.enum(["approve", "override"]);
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;

export const ScenarioSchema = z.enum(["healthy", "degraded", "crash"]);
export type Scenario = z.infer<typeof ScenarioSchema>;

export const BASELINE = {
  errorRate: 0.004,
  latencyP95: 120
} as const;

export const CONFIDENCE_THRESHOLD = 85;
