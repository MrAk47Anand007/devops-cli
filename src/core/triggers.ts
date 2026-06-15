import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeployEvent, RawWebhook, Trigger } from "./contracts.js";

export interface GithubWebhookPayload {
  action?: string;
  repository?: {
    full_name?: string;
  };
  deployment?: {
    id?: number | string;
    sha?: string;
    environment?: string;
    payload?: {
      service?: string;
      target?: string;
    };
  };
  deployment_status?: {
    state?: string;
  };
  workflow_run?: {
    id?: number | string;
    head_sha?: string;
    name?: string;
    event?: string;
  };
  ref?: string;
  after?: string;
}

export interface JenkinsWebhookPayload {
  service?: string;
  target?: string;
  sha?: string;
  job?: {
    name?: string;
  };
  build?: {
    number?: number | string;
    phase?: string;
    status?: string;
    scm?: {
      commit?: string;
    };
  };
}

export interface ArgoCdWebhookPayload {
  service?: string;
  target?: string;
  application?: {
    metadata?: {
      name?: string;
    };
    status?: {
      health?: {
        status?: string;
      };
      sync?: {
        status?: string;
        revision?: string;
      };
    };
  };
}

function compareSignatures(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function createSignature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function verifySha256Signature(
  secret: string | null | undefined,
  headerValue: string | undefined,
  payload: unknown,
  prefixed: boolean
): boolean {
  if (!secret) {
    return true;
  }
  if (!headerValue) {
    return false;
  }
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
  const digest = createSignature(secret, serialized);
  const expected = prefixed ? `sha256=${digest}` : digest;
  return compareSignatures(expected, headerValue);
}

export class GitHubTrigger implements Trigger {
  readonly id = "github-trigger";

  constructor(private readonly secret?: string | null) {}

  toDeployEvent(raw: RawWebhook): DeployEvent | null {
    const payload = raw.body as GithubWebhookPayload;

    if (payload.deployment?.id) {
      return {
        deployId: `gh-deploy-${payload.deployment.id}`,
        service:
          payload.deployment.payload?.service ??
          payload.repository?.full_name?.split("/")[1] ??
          "unknown-service",
        sha: payload.deployment.sha ?? "unknown-sha",
        target:
          payload.deployment.payload?.target ??
          payload.deployment.environment ??
          payload.deployment_status?.state ??
          "github-deployment"
      };
    }

    if (payload.workflow_run?.id) {
      return {
        deployId: `gh-workflow-${payload.workflow_run.id}`,
        service:
          payload.workflow_run.name ??
          payload.repository?.full_name?.split("/")[1] ??
          "unknown-service",
        sha: payload.workflow_run.head_sha ?? payload.after ?? "unknown-sha",
        target: payload.workflow_run.event ?? "workflow_run"
      };
    }

    if (payload.after && payload.ref) {
      return {
        deployId: `gh-push-${payload.after.slice(0, 12)}`,
        service: payload.repository?.full_name?.split("/")[1] ?? "unknown-service",
        sha: payload.after,
        target: payload.ref
      };
    }

    return null;
  }

  verifySignature(raw: RawWebhook): boolean {
    if (!this.secret) {
      return true;
    }
    const header = raw.headers["x-hub-signature-256"];
    if (!header?.startsWith("sha256=")) {
      return false;
    }
    const payload =
      typeof raw.body === "string" ? raw.body : JSON.stringify(raw.body ?? {});
    const digest = createHmac("sha256", this.secret).update(payload).digest("hex");
    return compareSignatures(`sha256=${digest}`, header);
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

export class JenkinsTrigger implements Trigger {
  readonly id = "jenkins-trigger";

  constructor(private readonly secret?: string | null) {}

  toDeployEvent(raw: RawWebhook): DeployEvent | null {
    const payload = raw.body as JenkinsWebhookPayload;
    const buildNumber = payload.build?.number;
    if (!buildNumber) {
      return null;
    }

    const service =
      payload.service ??
      payload.job?.name ??
      "jenkins-service";
    const sha =
      payload.sha ??
      payload.build?.scm?.commit ??
      "unknown-sha";
    const state =
      payload.target ??
      payload.build?.phase ??
      payload.build?.status ??
      "jenkins-build";

    return {
      deployId: `jenkins-${service}-${String(buildNumber)}`,
      service,
      sha,
      target: state
    };
  }

  verifySignature(raw: RawWebhook): boolean {
    return verifySha256Signature(
      this.secret,
      raw.headers["x-jenkins-signature"],
      raw.body,
      false
    );
  }
}

export class ArgoCdTrigger implements Trigger {
  readonly id = "argocd-trigger";

  constructor(private readonly secret?: string | null) {}

  toDeployEvent(raw: RawWebhook): DeployEvent | null {
    const payload = raw.body as ArgoCdWebhookPayload;
    const applicationName = payload.application?.metadata?.name;
    const revision = payload.application?.status?.sync?.revision;
    if (!applicationName || !revision) {
      return null;
    }

    return {
      deployId: `argocd-${applicationName}-${revision.slice(0, 12)}`,
      service: payload.service ?? applicationName,
      sha: revision,
      target:
        payload.target ??
        payload.application?.status?.sync?.status ??
        payload.application?.status?.health?.status ??
        "argocd-application"
    };
  }

  verifySignature(raw: RawWebhook): boolean {
    return verifySha256Signature(
      this.secret,
      raw.headers["x-argocd-signature"],
      raw.body,
      true
    );
  }
}
