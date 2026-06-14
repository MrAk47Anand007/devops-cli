import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { executeDecisionFlow, simulateScenario } from "./service.js";
import { CONFIDENCE_THRESHOLD, type HumanDecision, type Scenario } from "./types.js";

export async function requestHumanDecision(
  action: "rollback" | "hold",
  rl: ReturnType<typeof createInterface>
): Promise<HumanDecision> {
  const answer = (
    await rl.question(
      `confidence < ${CONFIDENCE_THRESHOLD}% -> approve ${action}? [y = approve / o = override]: `
    )
  )
    .trim()
    .toLowerCase();

  return answer === "o" ? "override" : "approve";
}

async function handleDeploy(
  scenario: Scenario,
  deployId: string,
  rl: ReturnType<typeof createInterface>,
  useCanned: boolean
): Promise<void> {
  const preview = simulateScenario(scenario);
  console.log(`\n=== Deploy ${deployId} (${scenario}) ===`);
  console.log(
    `parallel signals -> errorRate=${(preview.metrics.errorRate * 100).toFixed(2)}% p95=${preview.metrics.latencyP95.toFixed(0)}ms rps=${preview.metrics.requestsPerSec.toFixed(0)}`
  );

  const initial = await executeDecisionFlow({
    scenario,
    deployId,
    useCanned
  });

  if (!initial.anomalous || !initial.decision) {
    console.log("agent: metrics nominal, no action.");
    return;
  }

  console.log(
    `agent decision: ${initial.decision.action.toUpperCase()} @ ${initial.decision.confidence}%`
  );
  console.log(`reasoning: ${initial.decision.reasoning}`);
  for (const item of initial.decision.evidence) {
    console.log(`- ${item}`);
  }

  if (initial.autonomous) {
    console.log(`confidence >= ${CONFIDENCE_THRESHOLD}% -> autonomous action`);
    console.log("memory updated.");
    return;
  }

  const humanDecision = await requestHumanDecision(initial.decision.action, rl);
  const confirmed = await executeDecisionFlow({
    scenario,
    deployId: `${deployId}-confirmed`,
    useCanned,
    humanDecision
  });

  if (humanDecision === "override") {
    console.log(`human override -> ${confirmed.finalAction}`);
  } else {
    console.log(`human approved -> ${confirmed.finalAction}`);
  }
  console.log("memory updated.");
}

export async function main(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const useCanned =
    process.argv.includes("--canned") ||
    process.env.SENTINELOPS_USE_CANNED_DECISIONS === "true" ||
    !process.env.OPENAI_API_KEY;

  try {
    await handleDeploy("healthy", "deploy-1001", rl, useCanned);
    await handleDeploy("degraded", "deploy-1002", rl, useCanned);
    await handleDeploy("crash", "deploy-1003", rl, useCanned);
  } finally {
    rl.close();
  }
}

const invokedAsScript =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
