import {
  defaultSimulatorDeployTarget,
  defaultSimulatorRuntime
} from "./core/simulator-adapters.js";
import { MetricsSchema, type Metrics, type Scenario } from "./types.js";

export function generateMetrics(scenario: Scenario): Metrics {
  return MetricsSchema.parse(defaultSimulatorRuntime.previewScenario(scenario));
}

export function simulateDeploy(scenario: Scenario): Metrics {
  return MetricsSchema.parse(defaultSimulatorDeployTarget.activateScenario(scenario, `sim-${scenario}`));
}

export function setScenario(scenario: Scenario): void {
  defaultSimulatorRuntime.activateScenario(scenario, `manual-${scenario}`);
}

export function getScenario(): Scenario {
  return defaultSimulatorRuntime.getScenario();
}

export function pollMetrics(): Metrics {
  return MetricsSchema.parse(defaultSimulatorRuntime.pollMetrics());
}
