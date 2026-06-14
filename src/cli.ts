import "dotenv/config";
import { pathToFileURL } from "node:url";
import { judge } from "./agent.js";
import { executeDecisionFlow, simulateScenario } from "./service.js";
import { type HumanDecision, type Scenario } from "./types.js";

export interface CliRunResult {
  exitCode: number;
  stdout: string;
}

function isScenario(value: string | undefined): value is Scenario {
  return value === "healthy" || value === "degraded" || value === "crash";
}

function formatJson(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return undefined;
  }
  return args[index + 1];
}

function parseHumanDecision(args: string[]): HumanDecision | null {
  if (args.includes("--override")) {
    return "override";
  }
  if (args.includes("--approve")) {
    return "approve";
  }
  return null;
}

function errorResult(command: string, code: string, message: string): CliRunResult {
  return {
    exitCode: 1,
    stdout: formatJson({
      ok: false,
      command,
      error: {
        code,
        message
      }
    })
  };
}

function formatText(command: string, scenario: Scenario, detail: string): string {
  return `${command} ${scenario}: ${detail}\n`;
}

export async function runCli(argv: string[]): Promise<CliRunResult> {
  const [command = "unknown", ...args] = argv;
  const json = args.includes("--json");
  const canned = args.includes("--canned");
  const scenarioValue = getFlagValue(args, "--scenario");
  const humanDecision = parseHumanDecision(args);

  if (command !== "demo" && !isScenario(scenarioValue)) {
    return errorResult(
      command,
      "INVALID_SCENARIO",
      "Scenario must be one of healthy, degraded, or crash."
    );
  }

  if (command === "simulate" && scenarioValue) {
    const result = simulateScenario(scenarioValue);
    return {
      exitCode: 0,
      stdout: json
        ? formatJson({
            ok: true,
            command: "simulate",
            scenario: result.scenario,
            metrics: result.metrics
          })
        : formatText(
            "simulate",
            result.scenario,
            `errorRate=${result.metrics.errorRate} latencyP95=${result.metrics.latencyP95}`
          )
    };
  }

  if (command === "judge" && scenarioValue) {
    const simulated = simulateScenario(scenarioValue);
    const decision = await judge(simulated.metrics, { useCanned: canned });
    return {
      exitCode: 0,
      stdout: json
        ? formatJson({
            ok: true,
            command: "judge",
            scenario: simulated.scenario,
            metrics: simulated.metrics,
            decision
          })
        : formatText("judge", simulated.scenario, `${decision.action} @ ${decision.confidence}%`)
    };
  }

  if (command === "decide" && scenarioValue) {
    const result = await executeDecisionFlow({
      scenario: scenarioValue,
      deployId: `deploy-${scenarioValue}`,
      useCanned: canned,
      humanDecision: humanDecision ?? undefined
    });
    return {
      exitCode: 0,
      stdout: json
        ? formatJson({
            ok: true,
            command: "decide",
            scenario: result.scenario,
            metrics: result.metrics,
            decision: result.decision,
            humanDecision: result.humanDecision,
            finalAction: result.finalAction,
            autonomous: result.autonomous,
            incidentRecorded: result.incidentRecorded
          })
        : formatText("decide", result.scenario, `${result.finalAction}`)
    };
  }

  if (command === "demo") {
    const healthy = await executeDecisionFlow({
      scenario: "healthy",
      deployId: "deploy-1001",
      useCanned: canned
    });
    const degraded = await executeDecisionFlow({
      scenario: "degraded",
      deployId: "deploy-1002",
      useCanned: canned,
      humanDecision: "override"
    });
    const crash = await executeDecisionFlow({
      scenario: "crash",
      deployId: "deploy-1003",
      useCanned: canned
    });

    return {
      exitCode: 0,
      stdout: json
        ? formatJson({
            ok: true,
            command: "demo",
            results: [healthy, degraded, crash]
          })
        : `demo: healthy=${healthy.finalAction} degraded=${degraded.finalAction} crash=${crash.finalAction}\n`
    };
  }

  return errorResult(
    command,
    "UNKNOWN_COMMAND",
    "Supported commands are simulate, judge, decide, and demo."
  );
}

const invokedAsScript =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  runCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.stdout);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stdout.write(
        formatJson({
          ok: false,
          command: "cli",
          error: {
            code: "UNHANDLED_ERROR",
            message: error instanceof Error ? error.message : String(error)
          }
        })
      );
      process.exitCode = 1;
    });
}
