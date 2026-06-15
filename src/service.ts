import { createDefaultJudgmentBrain, createJudgmentInput, isAnomalous } from "./agent.js";
import { logAudit } from "./deploy.js";
import { createDeployTargetFromConfig } from "./core/deploy-targets.js";
import { guard, type GuardDecision } from "./core/guard.js";
import { createMetricSourceFromConfig } from "./core/metric-sources.js";
import { loadOperatorConfig } from "./core/operator-config.js";
import {
  defaultSimulatorDeployTarget,
  defaultSimulatorMetricSource,
  defaultSimulatorRuntime,
  type SimulatorRuntime
} from "./core/simulator-adapters.js";
import { recordIncident } from "./memory.js";
import type { DeployTarget, JudgmentBrain, MetricSource } from "./core/contracts.js";
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
  guard: GuardDecision | null;
}

export interface DecisionFlowDependencies {
  simulator?: SimulatorRuntime;
  metricSource?: MetricSource;
  deployTarget?: DeployTarget;
  judgmentBrain?: JudgmentBrain;
}

function resolveDecisionFlowDependencies(
  options: DecisionFlowOptions,
  dependencies: DecisionFlowDependencies
): Required<DecisionFlowDependencies> {
  const config = loadOperatorConfig();
  return {
    simulator: dependencies.simulator ?? defaultSimulatorRuntime,
    metricSource:
      dependencies.metricSource ??
      (config ? createMetricSourceFromConfig(config) : defaultSimulatorMetricSource),
    deployTarget:
      dependencies.deployTarget ??
      (config ? createDeployTargetFromConfig(config) : defaultSimulatorDeployTarget),
    judgmentBrain:
      dependencies.judgmentBrain ??
      createDefaultJudgmentBrain({
        useCanned: options.useCanned,
        provider: config?.judgmentProvider
      })
  };
}

export function simulateScenario(
  scenario: Scenario,
  dependencies: DecisionFlowDependencies = {}
): ScenarioSimulationResult {
  const simulator = dependencies.simulator ?? defaultSimulatorRuntime;
  return {
    scenario,
    metrics: simulator.previewScenario(scenario)
  };
}

export async function executeDecisionFlow(
  options: DecisionFlowOptions,
  dependencies: DecisionFlowDependencies = {}
): Promise<DecisionFlowResult> {
  const resolved = resolveDecisionFlowDependencies(options, dependencies);
  const usesSimulatorMetrics = resolved.metricSource.id === defaultSimulatorMetricSource.id;
  const simulated = simulateScenario(options.scenario, {
    simulator: resolved.simulator
  });
  const candidateMetrics = usesSimulatorMetrics
    ? simulated.metrics
    : await resolved.metricSource.query("current");

  if (!isAnomalous(candidateMetrics)) {
    return {
      scenario: options.scenario,
      deployId: options.deployId,
      metrics: candidateMetrics,
      anomalous: false,
      decision: null,
      humanDecision: null,
      finalAction: "none",
      autonomous: false,
      incidentRecorded: false,
      guard: null
    };
  }

  if (usesSimulatorMetrics) {
    resolved.simulator.activateScenario(options.scenario, options.deployId);
  }
  const liveMetrics = usesSimulatorMetrics
    ? await resolved.metricSource.query("current")
    : candidateMetrics;

  const decision = await resolved.judgmentBrain.decide(createJudgmentInput(liveMetrics));
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
  let guardDecision: GuardDecision | null = null;

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
    guardDecision = guard({
      actor: options.humanDecision ? "human:external" : "agent",
      action: "rollback",
      confidence: decision.confidence,
      metrics: liveMetrics,
      humanApproved: options.humanDecision === "approve" || options.humanDecision === "override"
    });
    logAudit({
      timestamp: Date.now(),
      actor: options.humanDecision ? "human:external" : "agent",
      action: "decision",
      detail: `guard ${guardDecision.code} -> ${guardDecision.message}`
    });

    if (guardDecision.ok) {
      await resolved.deployTarget.rollback(options.deployId, { dryRun: false });
    } else {
      finalAction = "hold";
    }
  }

  recordIncident({
    id: `INC-${options.deployId}`,
    deployId: options.deployId,
    summary: `Scenario ${options.scenario} produced ${(liveMetrics.errorRate * 100).toFixed(1)}% errors and ${liveMetrics.latencyP95.toFixed(0)}ms p95 latency.`,
    errorRate: liveMetrics.errorRate,
    latencyP95: liveMetrics.latencyP95,
    agentAction: decision.action,
    agentConfidence: decision.confidence,
    humanOverride: overrideAction,
    outcome: `final action: ${finalAction}`
  });

  return {
    scenario: options.scenario,
    deployId: options.deployId,
    metrics: liveMetrics,
    anomalous: true,
    decision,
    humanDecision,
    finalAction,
    autonomous,
    incidentRecorded: true,
    guard: guardDecision
  };
}
