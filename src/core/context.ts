import {
  createRunId,
  readCurrentScenario,
  saveRun,
  writeLatestContext,
  writeLatestRunId
} from "./store.js";
import { getScenarioFixture } from "./scenarios.js";
import { ContextSchema, type Context, type RunRecord } from "../types.js";

export function createContextForService(serviceId: string): {
  context: Context;
  run: RunRecord;
} {
  const scenario = readCurrentScenario();
  if (!scenario) {
    throw new Error("No scenario loaded. Run `sentinelops scenario load <name>` first.");
  }

  const fixture = getScenarioFixture(scenario);
  if (fixture.service.id !== serviceId) {
    throw new Error(`Service ${serviceId} is not available in scenario ${scenario}.`);
  }

  const context = ContextSchema.parse({
    service: fixture.service,
    scenario,
    logs: fixture.logs,
    alerts: fixture.alerts,
    deploys: fixture.deploys,
    incidents: fixture.incidents,
    summary: `${fixture.service.name} is ${fixture.service.health} with ${fixture.alerts.length} alerts, ${fixture.logs.length} notable logs, and ${fixture.incidents.length} incidents.`
  });

  writeLatestContext(context);

  const now = new Date().toISOString();
  const run = saveRun({
    id: createRunId(),
    createdAt: now,
    updatedAt: now,
    source: "scenario",
    status: "context_created",
    scenario,
    serviceId,
    context,
    plan: null,
    testPlan: null,
    approvals: [],
    tests: [],
    auditTrail: [
      {
        at: now,
        action: "context.create",
        detail: `Created context for ${serviceId} from scenario ${scenario}.`
      }
    ],
    githubTarget: context.service.linkedGithub?.issueUrl ?? null,
    prompt: null
  });

  writeLatestRunId(run.id);

  return { context, run };
}

export function validateContextFile(context: unknown): Context {
  return ContextSchema.parse(context);
}
