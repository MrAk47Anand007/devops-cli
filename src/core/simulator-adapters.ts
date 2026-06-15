import type { Action, Metrics, Scenario } from "../types.js";
import type {
  AdapterHealth,
  ApprovalPackage,
  BaselineWindow,
  ChatChannel,
  DeployEvent,
  DeployStatus,
  DeployTarget,
  HumanDecisionResult,
  MetricSource,
  RawWebhook,
  Revision,
  RollbackResult,
  ThreadRef,
  Trigger,
  Unsubscribe,
  MetricHistoryWindow
} from "./contracts.js";

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

function health(detail: string): AdapterHealth {
  return {
    status: "ready",
    checkedAt: Date.now(),
    detail
  };
}

function stateForScenario(scenario: Scenario): DeployStatus["state"] {
  if (scenario === "healthy") {
    return "healthy";
  }
  if (scenario === "degraded") {
    return "degraded";
  }
  return "failed";
}

export class SimulatorRuntime {
  private currentScenario: Scenario = "healthy";

  private currentRevision = "sim-healthy";

  private lastDeployId = "bootstrap";

  private readonly listeners = new Set<(metrics: Metrics) => void>();

  previewScenario(scenario: Scenario): Metrics {
    return {
      timestamp: Date.now(),
      ...SCENARIO_METRICS[scenario]
    };
  }

  activateScenario(scenario: Scenario, deployId: string): Metrics {
    this.currentScenario = scenario;
    this.currentRevision = `sim-${scenario}`;
    this.lastDeployId = deployId;
    const metrics = this.previewScenario(scenario);
    for (const listener of this.listeners) {
      listener(metrics);
    }
    return metrics;
  }

  rollback(deployId: string, dryRun: boolean): RollbackResult {
    const revision = {
      service: "simulator-service",
      version: "sim-healthy",
      deployedAt: Date.now()
    };

    if (!dryRun) {
      this.currentScenario = "healthy";
      this.currentRevision = revision.version;
      this.lastDeployId = deployId;
      const metrics = this.previewScenario("healthy");
      for (const listener of this.listeners) {
        listener(metrics);
      }
    }

    return {
      deployId,
      ok: true,
      detail: dryRun ? "Dry-run rollback validated." : "Rollback applied to simulator runtime.",
      dryRun,
      revision
    };
  }

  getScenario(): Scenario {
    return this.currentScenario;
  }

  pollMetrics(): Metrics {
    return this.previewScenario(this.currentScenario);
  }

  currentDeployStatus(): DeployStatus {
    return {
      deployId: this.lastDeployId,
      service: "simulator-service",
      state: stateForScenario(this.currentScenario),
      scenario: this.currentScenario
    };
  }

  currentRevisionInfo(service: string): Revision {
    return {
      service,
      version: this.currentRevision,
      deployedAt: Date.now()
    };
  }

  subscribe(cb: (metrics: Metrics) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

export class SimulatorMetricSource implements MetricSource {
  readonly id = "simulator-metrics";

  constructor(private readonly runtime: SimulatorRuntime) {}

  async query(_expr: string): Promise<Metrics> {
    return this.runtime.pollMetrics();
  }

  async baseline(_window: BaselineWindow): Promise<Metrics> {
    return this.runtime.previewScenario("healthy");
  }

  async history(window: MetricHistoryWindow): Promise<{
    current: Metrics[];
    baseline: Metrics[];
  }> {
    const stepMs = Math.max(1, window.stepMinutes) * 60_000;
    const count = Math.max(2, Math.round(window.rangeMinutes / Math.max(1, window.stepMinutes)) + 1);
    const now = Date.now();
    const currentSeed = this.runtime.previewScenario(this.runtime.getScenario());
    const baselineSeed = this.runtime.previewScenario("healthy");

    const current = Array.from({ length: count }, (_, index) => {
      const progress = count === 1 ? 1 : index / (count - 1);
      const timestamp = now - (count - 1 - index) * stepMs;
      return {
        timestamp,
        errorRate: currentSeed.errorRate * (0.82 + progress * 0.18),
        latencyP95: currentSeed.latencyP95 * (0.9 + progress * 0.1),
        requestsPerSec: currentSeed.requestsPerSec * (1.04 - progress * 0.04)
      };
    });

    const baseline = Array.from({ length: count }, (_, index) => ({
      timestamp: now - (count - 1 - index) * stepMs,
      errorRate: baselineSeed.errorRate,
      latencyP95: baselineSeed.latencyP95,
      requestsPerSec: baselineSeed.requestsPerSec
    }));

    return { current, baseline };
  }

  subscribe(cb: (metrics: Metrics) => void): Unsubscribe {
    return this.runtime.subscribe(cb);
  }

  async health(): Promise<AdapterHealth> {
    return health("Simulator metrics are available.");
  }
}

export class SimulatorDeployTarget implements DeployTarget {
  readonly id = "simulator-deploy";

  constructor(private readonly runtime: SimulatorRuntime) {}

  activateScenario(scenario: Scenario, deployId: string): Metrics {
    return this.runtime.activateScenario(scenario, deployId);
  }

  async status(deployId: string): Promise<DeployStatus> {
    const current = this.runtime.currentDeployStatus();
    return {
      ...current,
      deployId
    };
  }

  async currentRevision(service: string): Promise<Revision> {
    return this.runtime.currentRevisionInfo(service);
  }

  async rollback(deployId: string, opts: { dryRun: boolean }): Promise<RollbackResult> {
    return this.runtime.rollback(deployId, opts.dryRun);
  }

  async health(): Promise<AdapterHealth> {
    return health("Simulator deploy target is available.");
  }
}

export class SimulatorChatChannel implements ChatChannel {
  readonly id = "simulator-chat";

  async postApproval(pkg: ApprovalPackage): Promise<ThreadRef> {
    return {
      id: `sim-thread-${pkg.incidentId}`
    };
  }

  async awaitDecision(_ref: ThreadRef, _timeoutMs: number): Promise<HumanDecisionResult> {
    return {
      action: "hold",
      actor: "simulator"
    };
  }

  async notify(_ref: ThreadRef, _update: string): Promise<void> {}

  async health(): Promise<AdapterHealth> {
    return health("Simulator chat channel is available.");
  }
}

export class SimulatorTrigger implements Trigger {
  readonly id = "simulator-trigger";

  toDeployEvent(raw: RawWebhook): DeployEvent | null {
    if (typeof raw.body !== "object" || raw.body === null) {
      return null;
    }
    const body = raw.body as Record<string, unknown>;
    const deployId = typeof body.deployId === "string" ? body.deployId : null;
    if (!deployId) {
      return null;
    }
    return {
      deployId,
      service: typeof body.service === "string" ? body.service : "simulator-service",
      sha: typeof body.sha === "string" ? body.sha : "simulated",
      target: typeof body.target === "string" ? body.target : "simulator"
    };
  }

  verifySignature(_raw: RawWebhook): boolean {
    return true;
  }
}

export const defaultSimulatorRuntime = new SimulatorRuntime();
export const defaultSimulatorMetricSource = new SimulatorMetricSource(defaultSimulatorRuntime);
export const defaultSimulatorDeployTarget = new SimulatorDeployTarget(defaultSimulatorRuntime);
export const defaultSimulatorChatChannel = new SimulatorChatChannel();
export const defaultSimulatorTrigger = new SimulatorTrigger();
