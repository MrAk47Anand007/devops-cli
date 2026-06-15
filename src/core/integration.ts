import { createApprovalPackage } from "./approval.js";
import { createGithubResultPackage } from "./repo.js";

export function simulateIntegration(provider: "slack" | "github", runId: string): {
  provider: "slack" | "github";
  simulation: {
    delivered: true;
    preview: string;
    mode: "plugin-fallback";
  };
} {
  if (provider === "slack") {
    const resultPackage = createGithubResultPackage(runId);
    if (resultPackage.resultPackage.executionSummary !== "Agent execution: not run") {
      return {
        provider,
        simulation: {
          delivered: true,
          preview: resultPackage.resultPackage.pluginPayloads.slack.text,
          mode: "plugin-fallback"
        }
      };
    }

    const approvalPackage = createApprovalPackage(runId, {
      includePlan: true,
      includeDiff: true,
      includeTests: true
    });
    return {
      provider,
      simulation: {
        delivered: true,
        preview: approvalPackage.package.pluginPayloads.slack.text,
        mode: "plugin-fallback"
      }
    };
  }

  const resultPackage = createGithubResultPackage(runId);
  if (!resultPackage.resultPackage.readiness.ready) {
    throw new Error(
      `Run ${runId} is not ready for protected GitHub handoff: ${resultPackage.resultPackage.readiness.blockedReasons.join(" ")}`
    );
  }
  return {
    provider,
    simulation: {
      delivered: true,
      preview: resultPackage.resultPackage.pluginPayloads.github.commentBody,
      mode: "plugin-fallback"
    }
  };
}
