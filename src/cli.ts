import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { judge } from "./agent.js";
import {
  createApprovalPackage,
  getApprovalStatus,
  pushGate,
  recordApproval,
  recordPush,
  requireApproval
} from "./core/approval.js";
import { createContextForService, validateContextFile } from "./core/context.js";
import { resolveDashboardIncident } from "./core/dashboard.js";
import { simulateIntegration } from "./core/integration.js";
import {
  askLatestCriticalQuestions,
  createPlanFromContextFile,
  createPlanFromPrompt,
  createPlanFromTarget,
  readLatestContextForCli,
  showLatestPlan
} from "./core/planning.js";
import { checkLatestPolicy, checkPermission, explainPolicyViolation, listPolicies, setPolicyThreshold } from "./core/policy.js";
import {
  createGithubResultPackage,
  getChangeDiff,
  getChangeTestReport,
  prepareChange,
  searchMemory,
  showRepoMemory,
  summarizeChange,
  understandRepo,
  updateRepoMemory
} from "./core/repo.js";
import { createReport, listAuditRuns, memoryRecord, showAuditRun } from "./core/reporting.js";
import { getScenarioFixture } from "./core/scenarios.js";
import {
  createTestReport,
  discoverTests,
  generateLatestTestPlan,
  runLatestTestPlan
} from "./core/testing.js";
import {
  readCurrentScenario,
  readConfig,
  getLatestRunId,
  ensureSentinelOpsState,
  writeConfig,
  writeCurrentScenario
} from "./core/store.js";
import { DashboardStore } from "./dashboard/store.js";
import { executeDecisionFlow, simulateScenario } from "./service.js";
import { DashboardScenarioSchema, type HumanDecision, type Scenario } from "./types.js";

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

function resolveWorkspacePath(filePath: string): string {
  const workspaceRoot = process.env.SENTINELOPS_WORKSPACE_ROOT ?? process.cwd();
  return resolve(workspaceRoot, filePath);
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
  const subcommand = args[0];
  const serviceId = getFlagValue(args, "--service");
  const contextFile = getFlagValue(args, "--context");
  const promptValue = getFlagValue(args, "--prompt");
  const targetValue = getFlagValue(args, "--target");

  if (
    command !== "demo" &&
    command !== "scenario" &&
    command !== "dashboard" &&
    command !== "context" &&
    command !== "plan" &&
    command !== "approval" &&
    command !== "push" &&
    command !== "audit" &&
    command !== "report" &&
    command !== "memory" &&
    command !== "test" &&
    command !== "policy" &&
    command !== "permission" &&
    command !== "repo" &&
    command !== "change" &&
    command !== "github" &&
    command !== "init" &&
    command !== "status" &&
    command !== "config" &&
    command !== "integration" &&
    !isScenario(scenarioValue)
  ) {
    return errorResult(
      command,
      "INVALID_SCENARIO",
      "Scenario must be one of healthy, degraded, or crash."
    );
  }

  if (command === "scenario" && subcommand === "load") {
    const scenarioName = args[1];
    const parsed = DashboardScenarioSchema.safeParse(scenarioName);
    if (!parsed.success) {
      return errorResult(
        "scenario",
        "INVALID_DASHBOARD_SCENARIO",
        "Scenario must be one of healthy, degraded-api, failing-test, post-deploy-errors, or config-risk."
      );
    }
    const dashboard = new DashboardStore();
    const state = dashboard.loadScenario(parsed.data);
    writeCurrentScenario(parsed.data);
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "scenario.load",
        scenario: parsed.data,
        service: state.service,
        counts: {
          logs: state.logs.length,
          alerts: state.alerts.length,
          deploys: state.deploys.length,
          incidents: state.incidents.length
        }
      })
    };
  }

  if (command === "init") {
    const paths = ensureSentinelOpsState();
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "init",
        paths
      })
    };
  }

  if (command === "status") {
    ensureSentinelOpsState();
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "status",
        status: {
          initialized: true,
          latestRunId: getLatestRunId(),
          currentScenario: readCurrentScenario(),
          hasContext: readLatestContextForCli() !== null
        }
      })
    };
  }

  if (command === "config" && subcommand === "set") {
    const key = args[1];
    const value = args[2];
    if (!key || typeof value === "undefined") {
      return errorResult("config", "MISSING_CONFIG_FIELDS", "Provide config set <key> <value>.");
    }
    const current = readConfig();
    current[key] = value;
    writeConfig(current);
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "config.set",
        key,
        value
      })
    };
  }

  if (command === "config" && subcommand === "get") {
    const key = getFlagValue(args, "--key");
    const config = readConfig();
    if (!key) {
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "config.get",
          config
        })
      };
    }
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "config.get",
        key,
        value: config[key] ?? null
      })
    };
  }

  if (command === "integration" && subcommand === "list") {
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "integration.list",
        integrations: [
          { id: "github", mode: "plugin-first" },
          { id: "slack", mode: "plugin-first" },
          { id: "dashboard", mode: "local-api" },
          { id: "workspace", mode: "local-tools" }
        ]
      })
    };
  }

  if (command === "integration" && subcommand === "health") {
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "integration.health",
        health: [
          { id: "github", status: "plugin-first" },
          { id: "slack", status: "plugin-first" },
          { id: "dashboard", status: "ready" },
          { id: "workspace", status: "ready" }
        ]
      })
    };
  }

  if (command === "integration" && subcommand === "simulate") {
    const provider = getFlagValue(args, "--provider");
    const runId = getFlagValue(args, "--run");
    if (!provider || !runId) {
      return errorResult("integration", "MISSING_SIMULATION_FIELDS", "Provide --provider and --run.");
    }
    if (provider !== "slack" && provider !== "github") {
      return errorResult("integration", "INVALID_PROVIDER", "Provider must be slack or github.");
    }
    try {
      const result = simulateIntegration(provider, runId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "integration.simulate",
          ...result
        })
      };
    } catch (error) {
      return errorResult("integration", "INTEGRATION_SIMULATE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "dashboard" && subcommand === "ingest") {
    if (!serviceId) {
      return errorResult("dashboard", "MISSING_SERVICE", "Provide --service <service-id>.");
    }
    try {
      const result = createContextForService(serviceId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "dashboard.ingest",
          context: result.context,
          run: result.run
        })
      };
    } catch (error) {
      return errorResult("dashboard", "DASHBOARD_INGEST_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "dashboard" && subcommand === "incident" && args[1] === "resolve") {
    const runId = getFlagValue(args, "--run");
    const incidentId = getFlagValue(args, "--incident");
    if (!runId || !incidentId) {
      return errorResult("dashboard", "MISSING_INCIDENT_FIELDS", "Provide --run and --incident.");
    }
    try {
      const result = resolveDashboardIncident(runId, incidentId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "dashboard.incident.resolve",
          ...result
        })
      };
    } catch (error) {
      return errorResult("dashboard", "DASHBOARD_INCIDENT_RESOLVE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "repo" && subcommand === "understand") {
    if (!contextFile) {
      return errorResult("repo", "MISSING_CONTEXT", "Provide --context <path>.");
    }
    try {
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "repo.understand",
          ...understandRepo(resolveWorkspacePath(contextFile))
        })
      };
    } catch (error) {
      return errorResult("repo", "REPO_UNDERSTAND_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "repo" && subcommand === "memory" && args[1] === "show") {
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "repo.memory.show",
        entries: showRepoMemory()
      })
    };
  }

  if (command === "repo" && subcommand === "memory" && args[1] === "update") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("repo", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = updateRepoMemory(runId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "repo.memory.update",
          ...result
        })
      };
    } catch (error) {
      return errorResult("repo", "REPO_MEMORY_UPDATE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "context" && subcommand === "create") {
    if (!serviceId) {
      return errorResult("context", "MISSING_SERVICE", "Provide --service <service-id>.");
    }
    try {
      const result = createContextForService(serviceId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "context.create",
          context: result.context,
          run: result.run
        })
      };
    } catch (error) {
      return errorResult(
        "context",
        "CONTEXT_CREATE_FAILED",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (command === "context" && subcommand === "show") {
    const context = readLatestContextForCli();
    if (!context) {
      return errorResult("context", "NO_CONTEXT", "No latest context is available.");
    }
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "context.show",
        scenario: readCurrentScenario(),
        context
      })
    };
  }

  if (command === "context" && subcommand === "validate") {
    const filePath = getFlagValue(args, "--file");
    if (!filePath) {
      return errorResult("context", "MISSING_FILE", "Provide --file <path>.");
    }
    try {
      const parsed = validateContextFile(
        JSON.parse(readFileSync(resolveWorkspacePath(filePath), "utf8")) as unknown
      );
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "context.validate",
          context: parsed
        })
      };
    } catch (error) {
      return errorResult(
        "context",
        "INVALID_CONTEXT",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (command === "plan" && subcommand === "create") {
    if (!contextFile && !promptValue && !targetValue) {
      return errorResult("plan", "MISSING_CONTEXT", "Provide --context <path>.");
    }
    try {
      const run = promptValue
        ? createPlanFromPrompt(promptValue)
        : targetValue
          ? createPlanFromTarget(targetValue)
          : createPlanFromContextFile(resolveWorkspacePath(contextFile!));
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "plan.create",
          run
        })
      };
    } catch (error) {
      return errorResult(
        "plan",
        "PLAN_CREATE_FAILED",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (command === "plan" && subcommand === "ask-critical") {
    try {
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "plan.ask-critical",
          ...askLatestCriticalQuestions()
        })
      };
    } catch (error) {
      return errorResult("plan", "PLAN_ASK_CRITICAL_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "plan" && subcommand === "show") {
    const run = showLatestPlan();
    if (!run?.plan) {
      return errorResult("plan", "NO_PLAN", "No latest plan is available.");
    }
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "plan.show",
        run
      })
    };
  }

  if (command === "plan" && subcommand === "risk") {
    const run = showLatestPlan();
    if (!run?.plan) {
      return errorResult("plan", "NO_PLAN", "No latest plan is available.");
    }
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "plan.risk",
        risk: run.plan.risk,
        runId: run.id
      })
    };
  }

  if (command === "approval" && subcommand === "package") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("approval", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = createApprovalPackage(runId, {
        includePlan: args.includes("--include-plan"),
        includeDiff: args.includes("--include-diff"),
        includeTests: args.includes("--include-tests") || !args.some((arg) => arg.startsWith("--include-"))
      });
      return {
        exitCode: 0,
        stdout: formatJson({ ok: true, command: "approval.package", ...result })
      };
    } catch (error) {
      return errorResult("approval", "APPROVAL_PACKAGE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "approval" && subcommand === "record") {
    const runId = getFlagValue(args, "--run");
    const source = getFlagValue(args, "--source");
    const status = getFlagValue(args, "--status");
    const by = getFlagValue(args, "--by");
    if (!runId || !source || !status || !by) {
      return errorResult(
        "approval",
        "MISSING_APPROVAL_FIELDS",
        "Provide --run, --source, --status, and --by."
      );
    }
    if (!["approved", "rejected", "changes_requested"].includes(status)) {
      return errorResult("approval", "INVALID_APPROVAL_STATUS", "Status must be approved, rejected, or changes_requested.");
    }
    try {
      const run = recordApproval(runId, {
        source,
        status: status as "approved" | "rejected" | "changes_requested",
        by
      });
      return {
        exitCode: 0,
        stdout: formatJson({ ok: true, command: "approval.record", run })
      };
    } catch (error) {
      return errorResult("approval", "APPROVAL_RECORD_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "approval" && subcommand === "status") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("approval", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = getApprovalStatus(runId);
      return {
        exitCode: 0,
        stdout: formatJson({ ok: true, command: "approval.status", ...result })
      };
    } catch (error) {
      return errorResult("approval", "APPROVAL_STATUS_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "approval" && subcommand === "require") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("approval", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = requireApproval(runId);
      return {
        exitCode: 0,
        stdout: formatJson({ ok: true, command: "approval.require", ...result })
      };
    } catch (error) {
      return errorResult("approval", "APPROVAL_REQUIRE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "push" && subcommand === "gate") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("push", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = pushGate(runId);
      if (!result.ok) {
        const messageByCode: Record<string, string> = {
          APPROVAL_REQUIRED: "This run requires approval before push.",
          TESTS_REQUIRED: "This run requires passing test evidence before push.",
          CRITICAL_ACTION_BLOCKED: "Critical risk runs remain blocked for push."
        };
        return {
          exitCode: 1,
          stdout: formatJson({
            ok: false,
            command: "push.gate",
            run: result.run,
            error: {
              code: result.code,
              message: messageByCode[result.code]
            }
          })
        };
      }
      return {
        exitCode: 0,
        stdout: formatJson({ ok: true, command: "push.gate", run: result.run })
      };
    } catch (error) {
      return errorResult("push", "PUSH_GATE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "push" && subcommand === "record") {
    const runId = getFlagValue(args, "--run");
    const commitSha = getFlagValue(args, "--commit");
    if (!runId || !commitSha) {
      return errorResult("push", "MISSING_PUSH_FIELDS", "Provide --run and --commit.");
    }
    try {
      const run = recordPush(runId, commitSha);
      return {
        exitCode: 0,
        stdout: formatJson({ ok: true, command: "push.record", run })
      };
    } catch (error) {
      return errorResult("push", "PUSH_RECORD_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "audit" && subcommand === "list") {
    return {
      exitCode: 0,
      stdout: formatJson({ ok: true, command: "audit.list", runs: listAuditRuns() })
    };
  }

  if (command === "audit" && subcommand === "show") {
    const runId = args[1];
    if (!runId) {
      return errorResult("audit", "MISSING_RUN", "Provide a run id.");
    }
    try {
      const run = showAuditRun(runId);
      return {
        exitCode: 0,
        stdout: formatJson({ ok: true, command: "audit.show", run })
      };
    } catch (error) {
      return errorResult("audit", "AUDIT_SHOW_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "report" && subcommand === "create") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("report", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = createReport(runId);
      return {
        exitCode: 0,
        stdout: formatJson({ ok: true, command: "report.create", ...result })
      };
    } catch (error) {
      return errorResult("report", "REPORT_CREATE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "memory" && subcommand === "record") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("memory", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const run = memoryRecord(runId);
      return {
        exitCode: 0,
        stdout: formatJson({ ok: true, command: "memory.record", run })
      };
    } catch (error) {
      return errorResult("memory", "MEMORY_RECORD_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "memory" && subcommand === "search") {
    const target = getFlagValue(args, "--target");
    if (!target) {
      return errorResult("memory", "MISSING_TARGET", "Provide --target <service|repo|issue>.");
    }
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "memory.search",
        matches: searchMemory(target)
      })
    };
  }

  if (command === "change" && subcommand === "prepare") {
    const target = getFlagValue(args, "--target");
    if (!target) {
      return errorResult("change", "MISSING_TARGET", "Provide --target <github-url>.");
    }
    try {
      const result = prepareChange(target);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "change.prepare",
          ...result
        })
      };
    } catch (error) {
      return errorResult("change", "CHANGE_PREPARE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "change" && subcommand === "diff") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("change", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = getChangeDiff(runId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "change.diff",
          ...result
        })
      };
    } catch (error) {
      return errorResult("change", "CHANGE_DIFF_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "change" && subcommand === "test") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("change", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = getChangeTestReport(runId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "change.test",
          ...result
        })
      };
    } catch (error) {
      return errorResult("change", "CHANGE_TEST_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "change" && subcommand === "summarize") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("change", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = summarizeChange(runId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "change.summarize",
          ...result
        })
      };
    } catch (error) {
      return errorResult("change", "CHANGE_SUMMARIZE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "github" && subcommand === "result-package") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("github", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = createGithubResultPackage(runId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "github.result-package",
          ...result
        })
      };
    } catch (error) {
      return errorResult("github", "GITHUB_RESULT_PACKAGE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "test" && subcommand === "discover") {
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "test.discover",
        ...discoverTests()
      })
    };
  }

  if (command === "test" && subcommand === "generate-plan") {
    const target = getFlagValue(args, "--target");
    if (!target) {
      return errorResult("test", "MISSING_TARGET", "Provide --target <change|service|issue>.");
    }
    try {
      const result = generateLatestTestPlan(target);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "test.generate-plan",
          run: result.run,
          testPlan: result.testPlan
        })
      };
    } catch (error) {
      return errorResult("test", "TEST_PLAN_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "test" && subcommand === "run") {
    const planTarget = getFlagValue(args, "--plan");
    if (planTarget !== "latest") {
      return errorResult("test", "INVALID_PLAN_TARGET", "Provide --plan latest.");
    }
    try {
      const result = runLatestTestPlan();
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "test.run",
          run: result.run,
          results: result.results
        })
      };
    } catch (error) {
      return errorResult("test", "TEST_RUN_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "test" && subcommand === "report") {
    const runId = getFlagValue(args, "--run");
    if (!runId) {
      return errorResult("test", "MISSING_RUN", "Provide --run <run-id>.");
    }
    try {
      const result = createTestReport(runId);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "test.report",
          ...result
        })
      };
    } catch (error) {
      return errorResult("test", "TEST_REPORT_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "policy" && subcommand === "list") {
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "policy.list",
        policies: listPolicies()
      })
    };
  }

  if (command === "policy" && subcommand === "set") {
    const key = args[1];
    const value = args[2];
    if (!key || typeof value === "undefined") {
      return errorResult("policy", "MISSING_POLICY_FIELDS", "Provide policy set <key> <value>.");
    }
    try {
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "policy.set",
          ...setPolicyThreshold(key, value)
        })
      };
    } catch (error) {
      return errorResult("policy", "POLICY_SET_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "policy" && subcommand === "check") {
    try {
      const result = checkLatestPolicy();
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "policy.check",
          run: result.run,
          violations: result.violations
        })
      };
    } catch (error) {
      return errorResult("policy", "POLICY_CHECK_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "policy" && subcommand === "explain") {
    const violationId = getFlagValue(args, "--violation");
    if (!violationId) {
      return errorResult("policy", "MISSING_VIOLATION", "Provide --violation <id>.");
    }
    try {
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "policy.explain",
          violationId,
          explanation: explainPolicyViolation(violationId)
        })
      };
    } catch (error) {
      return errorResult("policy", "POLICY_EXPLAIN_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "permission" && subcommand === "check") {
    const action = getFlagValue(args, "--action");
    if (!action) {
      return errorResult("permission", "MISSING_ACTION", "Provide --action <action>.");
    }
    try {
      const result = checkPermission(action);
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "permission.check",
          ...result
        })
      };
    } catch (error) {
      return errorResult("permission", "PERMISSION_CHECK_FAILED", error instanceof Error ? error.message : String(error));
    }
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
