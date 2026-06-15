import { runCommand, type CommandRunResult } from "./agent-runner.js";
import { requireOperatorConfig } from "./operator-config.js";
import { defaultSimulatorDeployTarget } from "./simulator-adapters.js";
import type { AdapterHealth, DeployStatus, DeployTarget, Revision, RollbackResult } from "./contracts.js";
import type { OperatorConfig } from "../types.js";

function health(status: AdapterHealth["status"], detail: string): AdapterHealth {
  return {
    status,
    checkedAt: Date.now(),
    detail
  };
}

type Executor = (input: { command: string; args: string[]; stdinText?: string }) => Promise<CommandRunResult>;

function latestToken(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "unknown";
}

export class KubernetesDeployTarget implements DeployTarget {
  readonly id = "kubernetes";

  constructor(
    private readonly config: OperatorConfig["kubernetes"],
    private readonly executor: Executor = runCommand
  ) {}

  private baseArgs(): string[] {
    const args: string[] = [];
    if (this.config.context.trim()) {
      args.push("--context", this.config.context.trim());
    }
    if (this.config.namespace.trim()) {
      args.push("-n", this.config.namespace.trim());
    }
    return args;
  }

  private requireDeployment(): string {
    if (!this.config.deployment.trim()) {
      throw new Error("Kubernetes deployment is not configured.");
    }
    return this.config.deployment.trim();
  }

  async status(deployId: string): Promise<DeployStatus> {
    const deployment = this.requireDeployment();
    const result = await this.executor({
      command: this.config.command,
      args: [...this.baseArgs(), "rollout", "status", `deployment/${deployment}`]
    });
    if (result.exitCode !== 0) {
      return {
        deployId,
        service: this.config.service,
        state: "failed",
        scenario: "crash"
      };
    }
    const output = result.output.toLowerCase();
    return {
      deployId,
      service: this.config.service,
      state: output.includes("successfully rolled out") ? "healthy" : "pending",
      scenario: output.includes("successfully rolled out") ? "healthy" : "degraded"
    };
  }

  async currentRevision(service: string): Promise<Revision> {
    const deployment = this.requireDeployment();
    const result = await this.executor({
      command: this.config.command,
      args: [
        ...this.baseArgs(),
        "get",
        "deployment",
        deployment,
        "-o",
        "jsonpath={.metadata.annotations.deployment\\.kubernetes\\.io/revision}"
      ]
    });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read Kubernetes revision: ${result.output.trim()}`);
    }
    return {
      service,
      version: latestToken(result.output),
      deployedAt: Date.now()
    };
  }

  async rollback(deployId: string, opts: { dryRun: boolean }): Promise<RollbackResult> {
    const deployment = this.requireDeployment();
    const args = [...this.baseArgs(), "rollout", "undo", `deployment/${deployment}`];
    if (opts.dryRun) {
      args.push("--dry-run=client");
    }
    const result = await this.executor({
      command: this.config.command,
      args
    });
    return {
      deployId,
      ok: result.exitCode === 0,
      detail:
        result.exitCode === 0
          ? opts.dryRun
            ? "Kubernetes rollback dry-run succeeded."
            : "Kubernetes rollback command succeeded."
          : result.output.trim() || "Kubernetes rollback failed.",
      dryRun: opts.dryRun,
      revision: {
        service: this.config.service,
        version: opts.dryRun ? "dry-run" : "rolled-back",
        deployedAt: Date.now()
      }
    };
  }

  async health(): Promise<AdapterHealth> {
    if (!this.config.deployment.trim()) {
      return health("degraded", "Kubernetes deployment is not configured.");
    }
    try {
      const result = await this.executor({
        command: this.config.command,
        args: [...this.baseArgs(), "cluster-info"]
      });
      return result.exitCode === 0
        ? health("ready", "Kubernetes deploy target is reachable.")
        : health("unavailable", result.output.trim() || "Kubernetes health check failed.");
    } catch (error) {
      return health("unavailable", error instanceof Error ? error.message : String(error));
    }
  }
}

export class DockerDeployTarget implements DeployTarget {
  readonly id = "docker";

  constructor(
    private readonly config: OperatorConfig["docker"],
    private readonly executor: Executor = runCommand
  ) {}

  private composeArgs(): string[] {
    const args = ["compose"];
    if (this.config.composeFile.trim()) {
      args.push("-f", this.config.composeFile.trim());
    }
    return args;
  }

  private containerOrService(): string {
    return this.config.container.trim() || this.config.service.trim();
  }

  async status(deployId: string): Promise<DeployStatus> {
    const target = this.containerOrService();
    const result = await this.executor({
      command: this.config.command,
      args: [...this.composeArgs(), "ps", target, "--status", "running"]
    });
    return {
      deployId,
      service: this.config.service,
      state: result.exitCode === 0 ? "healthy" : "failed",
      scenario: result.exitCode === 0 ? "healthy" : "crash"
    };
  }

  async currentRevision(service: string): Promise<Revision> {
    const target = this.containerOrService();
    const result = await this.executor({
      command: this.config.command,
      args: ["inspect", target, "--format", "{{.Image}}"]
    });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to inspect Docker target: ${result.output.trim()}`);
    }
    return {
      service,
      version: latestToken(result.output),
      deployedAt: Date.now()
    };
  }

  async rollback(deployId: string, opts: { dryRun: boolean }): Promise<RollbackResult> {
    const target = this.containerOrService();
    const args = opts.dryRun
      ? [...this.composeArgs(), "config", "--services"]
      : [...this.composeArgs(), "restart", target];
    const result = await this.executor({
      command: this.config.command,
      args
    });
    return {
      deployId,
      ok: result.exitCode === 0,
      detail:
        result.exitCode === 0
          ? opts.dryRun
            ? "Docker rollback dry-run validated compose service configuration."
            : "Docker restart-based rollback command succeeded."
          : result.output.trim() || "Docker rollback failed.",
      dryRun: opts.dryRun,
      revision: {
        service: this.config.service,
        version: opts.dryRun ? "dry-run" : "restarted",
        deployedAt: Date.now()
      }
    };
  }

  async health(): Promise<AdapterHealth> {
    try {
      const result = await this.executor({
        command: this.config.command,
        args: ["info"]
      });
      return result.exitCode === 0
        ? health("ready", "Docker deploy target is reachable.")
        : health("unavailable", result.output.trim() || "Docker health check failed.");
    } catch (error) {
      return health("unavailable", error instanceof Error ? error.message : String(error));
    }
  }
}

export function createDeployTargetFromConfig(config: OperatorConfig): DeployTarget {
  if (config.deployTarget === "kubernetes") {
    return new KubernetesDeployTarget(config.kubernetes);
  }
  if (config.deployTarget === "docker") {
    return new DockerDeployTarget(config.docker);
  }
  return defaultSimulatorDeployTarget;
}

export function getConfiguredDeployTarget(): DeployTarget {
  return createDeployTargetFromConfig(requireOperatorConfig());
}
