import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAutomationJob } from "../src/core/automation.js";
import {
  handleGithubIssueOpened,
  handleGithubWebhook,
  handleSlackApprovalCallback
} from "../src/core/automation-webhooks.js";
import { saveOperatorConfig } from "../src/core/operator-config.js";
import { createPlanFromTarget } from "../src/core/planning.js";
import { getAutomationJob } from "../src/core/store.js";

describe("automation webhooks", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinelops-automation-webhooks-"));
    process.env.SENTINELOPS_WORKSPACE_ROOT = tempDir;
    process.env.SENTINELOPS_AUDIT_PATH = join(tempDir, "audit.json");
    saveOperatorConfig({
      trackedRepos: ["example/repo"],
      slackChannel: "#ops-approvals",
      agentCommand: "node",
      agentArgs: ["-e", "console.log('agent ok')"],
      enabled: true
    });
  });

  afterEach(() => {
    delete process.env.SENTINELOPS_AUDIT_PATH;
    delete process.env.SENTINELOPS_WORKSPACE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates an approval-pending automation job from a tracked labeled issue", async () => {
    const result = await handleGithubIssueOpened({
      action: "opened",
      issue: {
        html_url: "https://github.com/example/repo/issues/77",
        title: "API errors after deploy",
        body: "Production is failing after deploy",
        labels: [{ name: "service:svc-api" }]
      },
      repository: { full_name: "example/repo" }
    });

    expect(result.job.status).toBe("awaiting_approval");
    expect(result.job.approvalMessageId).toBe("#ops-approvals");
    expect(result.run.githubTarget).toBe("https://github.com/example/repo/issues/77");
    expect(result.run.serviceId).toBe("svc-api");
  });

  it("rejects issues for untracked repositories", async () => {
    await expect(() =>
      handleGithubIssueOpened({
        action: "opened",
        issue: {
          html_url: "https://github.com/other/repo/issues/1",
          labels: [{ name: "service:svc-api" }]
        },
        repository: { full_name: "other/repo" }
      })
    ).rejects.toThrow("not tracked");
  });

  it("records Slack approval and advances the automation job", async () => {
    const run = createPlanFromTarget("https://github.com/example/repo/issues/77");
    const { job } = await createAutomationJob({
      runId: run.id,
      serviceId: "svc-api",
      githubIssueUrl: "https://github.com/example/repo/issues/77"
    });

    const result = handleSlackApprovalCallback({
      type: "block_actions",
      user: { username: "anand" },
      actions: [{ action_id: "sentinelops_approve" }],
      state: {
        values: {
          sentinelops: {
            run_id: { value: run.id },
            job_id: { value: job.id }
          }
        }
      }
    });

    expect(result.job.status).toBe("approved");
    expect(getAutomationJob(job.id)?.status).toBe("approved");
  });

  it("maps GitHub deployment-style webhooks into deploy events", async () => {
    const result = await handleGithubWebhook({
      deployment: {
        id: 42,
        sha: "abc123def456",
        environment: "production",
        payload: {
          service: "svc-api",
          target: "prod-cluster"
        }
      },
      repository: {
        full_name: "example/repo"
      }
    });

    expect(result.kind).toBe("deploy_event");
    if (result.kind === "deploy_event") {
      const deployEvent = result.deployEvent;
      expect(deployEvent.deployId).toContain("gh-deploy-42");
      expect(deployEvent.service).toBe("svc-api");
      expect(deployEvent.target).toBe("prod-cluster");
    }
  });
});
