import { MetricsSchema, type Metrics, type Scenario } from "./types.js";

const SCENARIO_METRICS: Record<Scenario, Omit<Metrics, "timestamp">> = {
  healthy: {
    errorRate: 0.0042,
    latencyP95: 128,
    requestsPerSec: 810
  },
  degraded: {
    errorRate: 0.044,
    latencyP95: 372,
    requestsPerSec: 605
  },
  crash: {
    errorRate: 0.223,
    latencyP95: 1825,
    requestsPerSec: 195
  }
};

let currentScenario: Scenario = "healthy";

export function generateMetrics(scenario: Scenario): Metrics {
  return MetricsSchema.parse({
    timestamp: Date.now(),
    ...SCENARIO_METRICS[scenario]
  });
}

export function simulateDeploy(scenario: Scenario): Metrics {
  setScenario(scenario);
  return pollMetrics();
}

export function setScenario(scenario: Scenario): void {
  currentScenario = scenario;
}

export function getScenario(): Scenario {
  return currentScenario;
}

export function pollMetrics(): Metrics {
  return generateMetrics(currentScenario);
}
