import { judge, isAnomalous } from "./agent.js";
import { deploy, logAudit, rollback } from "./deploy.js";
import { recordIncident } from "./memory.js";
import { simulateDeploy } from "./simulator.js";
import {
  CONFIDENCE_THRESHOLD,
  type Action,
  type Decision,
  type HumanDecision,
  type Metrics,
  type Scenario
} from "./types.js";

export interface ScenarioSimulationResult {
  scenario: Scenario;
  metrics: Metrics;
}

export interface DecisionFlowOptions {
  scenario: Scenario;
  deployId: string;
  useCanned?: boolean;
  humanDecision?: HumanDecision;
}

export interface DecisionFlowResult {
  scenario: Scenario;
  deployId: string;
  metrics: Metrics;
  anomalous: boolean;
  decision: Decision | null;
  humanDecision: HumanDecision | null;
  finalAction: Action | "none";
  autonomous: boolean;
  incidentRecorded: boolean;
}

export function simulateScenario(scenario: Scenario): ScenarioSimulationResult {
  return {
    scenario,
    metrics: simulateDeploy(scenario)
  };
}

export async function executeDecisionFlow(
  options: DecisionFlowOptions
): Promise<DecisionFlowResult> {
  const simulated = simulateScenario(options.scenario);

  if (!isAnomalous(simulated.metrics)) {
    return {
      scenario: options.scenario,
      deployId: options.deployId,
      metrics: simulated.metrics,
      anomalous: false,
      decision: null,
      humanDecision: null,
      finalAction: "none",
      autonomous: false,
      incidentRecorded: false
    };
  }

  deploy(options.scenario, options.deployId);

  const decision = await judge(simulated.metrics, { useCanned: options.useCanned });
  logAudit({
    timestamp: Date.now(),
    actor: "agent",
    action: "decision",
    detail: `${decision.action} @ ${decision.confidence}% -> ${decision.reasoning}`
  });

  let finalAction: Action = decision.action;
  let humanDecision: HumanDecision | null = null;
  let overrideAction: Action | null = null;
  const autonomous = decision.confidence >= CONFIDENCE_THRESHOLD && !options.humanDecision;

  if (!autonomous && options.humanDecision) {
    humanDecision = options.humanDecision;
    if (options.humanDecision === "override") {
      finalAction = decision.action === "rollback" ? "hold" : "rollback";
      overrideAction = finalAction;
      logAudit({
        timestamp: Date.now(),
        actor: "human:external",
        action: "override",
        detail: `override ${decision.action} -> ${finalAction}`
      });
    }
  }

  if (finalAction === "rollback") {
    rollback(options.deployId);
  }

  recordIncident({
    id: `INC-${options.deployId}`,
    deployId: options.deployId,
    summary: `Scenario ${options.scenario} produced ${(simulated.metrics.errorRate * 100).toFixed(1)}% errors and ${simulated.metrics.latencyP95.toFixed(0)}ms p95 latency.`,
    errorRate: simulated.metrics.errorRate,
    latencyP95: simulated.metrics.latencyP95,
    agentAction: decision.action,
    agentConfidence: decision.confidence,
    humanOverride: overrideAction,
    outcome: `final action: ${finalAction}`
  });

  return {
    scenario: options.scenario,
    deployId: options.deployId,
    metrics: simulated.metrics,
    anomalous: true,
    decision,
    humanDecision,
    finalAction,
    autonomous,
    incidentRecorded: true
  };
}
