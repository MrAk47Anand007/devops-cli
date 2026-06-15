import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { judge } from "./agent.js";
import {
  buildSlackApprovalRequest,
  executeApprovedAutomationJob,
  listAutomationJobsForCli,
  recordAutomationApproval,
  requireAutomationJob
} from "./core/automation.js";
import { handleGithubIssueOpened } from "./core/automation-webhooks.js";
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
import { guard } from "./core/guard.js";
import { simulateIntegration } from "./core/integration.js";
import { listIntegrationHealth } from "./core/metric-sources.js";
import { createLiveOnboarding } from "./core/onboarding.js";
import { loadOperatorConfig, saveOperatorConfig, setOperatorEnabled } from "./core/operator-config.js";
import { validateGuardrailConfig } from "./core/guardrail-config.js";
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
import { logAudit } from "./deploy.js";
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

function getMultiFlagValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  args.forEach((value, index) => {
    if (value === flag && index < args.length - 1) {
      values.push(args[index + 1]);
    }
  });
  return values;
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

function repoFromGithubUrl(target: string): string {
  const url = new URL(target);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Cannot infer repository from ${target}.`);
  }
  return `${parts[0]}/${parts[1]}`;
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
    command !== "onboard" &&
    command !== "init" &&
    command !== "status" &&
    command !== "config" &&
    command !== "integration" &&
    command !== "automation" &&
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
    const repos = getMultiFlagValues(args, "--repo");
    const slackChannel = getFlagValue(args, "--slack-channel");
    const agentCommand = getFlagValue(args, "--agent-command") ?? "codex";
    const agentArgsRaw = getFlagValue(args, "--agent-args") ?? "[\"exec\",\"--json\"]";
    const judgmentProvider = getFlagValue(args, "--judgment-provider");
    const openaiModel = getFlagValue(args, "--openai-model") ?? "gpt-4o-2024-08-06";
    const anthropicModel =
      getFlagValue(args, "--anthropic-model") ?? "claude-3-5-sonnet-latest";
    const aiCliCommand = getFlagValue(args, "--judgment-command") ?? agentCommand;
    const aiCliArgsRaw = getFlagValue(args, "--judgment-args") ?? agentArgsRaw;
    const aiCliHealthArgsRaw = getFlagValue(args, "--judgment-health-args") ?? "[\"--help\"]";
    const deployTarget = getFlagValue(args, "--deploy-target");
    const kubernetesCommand = getFlagValue(args, "--kube-command") ?? "kubectl";
    const kubernetesContext = getFlagValue(args, "--kube-context") ?? "";
    const kubernetesNamespace = getFlagValue(args, "--kube-namespace") ?? "default";
    const kubernetesDeployment = getFlagValue(args, "--kube-deployment") ?? "";
    const kubernetesService = getFlagValue(args, "--kube-service") ?? "app";
    const dockerCommand = getFlagValue(args, "--docker-command") ?? "docker";
    const dockerComposeFile = getFlagValue(args, "--docker-compose-file") ?? "";
    const dockerService = getFlagValue(args, "--docker-service") ?? "app";
    const dockerContainer = getFlagValue(args, "--docker-container") ?? "";
    const metricSource = getFlagValue(args, "--metric-source");
    const prometheusUrl = getFlagValue(args, "--prometheus-url") ?? "";
    const prometheusErrorRateExpr = getFlagValue(args, "--prometheus-error-rate-expr") ?? "";
    const prometheusLatencyExpr = getFlagValue(args, "--prometheus-latency-expr") ?? "";
    const prometheusRpsExpr = getFlagValue(args, "--prometheus-rps-expr") ?? "";
    const grafanaUrl = getFlagValue(args, "--grafana-url") ?? "";
    const grafanaToken = getFlagValue(args, "--grafana-token") ?? "";
    const grafanaDatasourceUid = getFlagValue(args, "--grafana-datasource-uid") ?? "";
    const grafanaDashboardUid = getFlagValue(args, "--grafana-dashboard-uid") ?? "";
    const grafanaErrorRateExpr = getFlagValue(args, "--grafana-error-rate-expr") ?? "";
    const grafanaLatencyExpr = getFlagValue(args, "--grafana-latency-expr") ?? "";
    const grafanaRpsExpr = getFlagValue(args, "--grafana-rps-expr") ?? "";
    const enabledFlag = getFlagValue(args, "--enabled");
    const enabled = enabledFlag ? enabledFlag === "true" : true;
    const config =
      repos.length > 0 && slackChannel
        ? saveOperatorConfig({
            trackedRepos: repos,
            slackChannel,
            agentCommand,
            agentArgs: JSON.parse(agentArgsRaw) as string[],
            judgmentProvider:
              judgmentProvider === "openai" ||
              judgmentProvider === "anthropic" ||
              judgmentProvider === "ai-cli"
                ? judgmentProvider
                : "canned",
            openai: {
              model: openaiModel
            },
            anthropic: {
              model: anthropicModel
            },
            aiCli: {
              command: aiCliCommand,
              args: JSON.parse(aiCliArgsRaw) as string[],
              healthArgs: JSON.parse(aiCliHealthArgsRaw) as string[]
            },
            deployTarget:
              deployTarget === "kubernetes" || deployTarget === "docker"
                ? deployTarget
                : "simulator",
            kubernetes: {
              command: kubernetesCommand,
              context: kubernetesContext,
              namespace: kubernetesNamespace,
              deployment: kubernetesDeployment,
              service: kubernetesService
            },
            docker: {
              command: dockerCommand,
              composeFile: dockerComposeFile,
              service: dockerService,
              container: dockerContainer
            },
            metricSource:
              metricSource === "prometheus" || metricSource === "grafana"
                ? metricSource
                : "simulator",
            prometheus: {
              url: prometheusUrl,
              errorRateExpr: prometheusErrorRateExpr,
              latencyP95Expr: prometheusLatencyExpr,
              requestsPerSecExpr: prometheusRpsExpr
            },
            grafana: {
              url: grafanaUrl,
              token: grafanaToken,
              datasourceUid: grafanaDatasourceUid,
              dashboardUid: grafanaDashboardUid,
              errorRateExpr: grafanaErrorRateExpr,
              latencyP95Expr: grafanaLatencyExpr,
              requestsPerSecExpr: grafanaRpsExpr
            },
            enabled
          })
        : loadOperatorConfig();
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "init",
        paths,
        config,
        nextPrompt:
          config === null
            ? "Provide --repo, --slack-channel, --agent-command, and --enabled to complete SentinelOps onboarding."
            : null
      })
    };
  }

  if (command === "onboard") {
    const repo = getFlagValue(args, "--repo") ?? getFlagValue(args, "--repo-url");
    const slackChannel = getFlagValue(args, "--slack-channel");
    const agentCommand = getFlagValue(args, "--agent-command") ?? "codex";
    const agentArgsRaw = getFlagValue(args, "--agent-args") ?? "[\"exec\",\"--json\"]";
    const judgmentProvider = getFlagValue(args, "--judgment-provider");
    const deployTarget = getFlagValue(args, "--deploy-target");
    const metricSource = getFlagValue(args, "--metric-source");
    const enabledFlag = getFlagValue(args, "--enabled");
    if (!repo || !slackChannel) {
      return errorResult("onboard", "MISSING_ONBOARD_FIELDS", "Provide --repo or --repo-url and --slack-channel.");
    }
    try {
      const result = createLiveOnboarding({
        repo,
        slackChannel,
        agentCommand,
        agentArgs: JSON.parse(agentArgsRaw) as string[],
        judgmentProvider:
          judgmentProvider === "openai" ||
          judgmentProvider === "anthropic" ||
          judgmentProvider === "ai-cli"
            ? judgmentProvider
            : "canned",
        deployTarget:
          deployTarget === "kubernetes" || deployTarget === "docker" ? deployTarget : "simulator",
        metricSource:
          metricSource === "prometheus" || metricSource === "grafana" ? metricSource : "simulator",
        enabled: enabledFlag ? enabledFlag === "true" : true
      });
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "onboard",
          ...result
        })
      };
    } catch (error) {
      return errorResult("onboard", "ONBOARD_FAILED", error instanceof Error ? error.message : String(error));
    }
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
    const decision = guard({
      actor: "cli",
      action: "config.write",
      configKey: key,
      previousValue: current[key] ?? null,
      nextValue: value,
      humanApproved: args.includes("--approved")
    });
    logAudit({
      timestamp: Date.now(),
      actor: "cli",
      action: "config",
      detail: `${key} -> ${value} (${decision.code})`
    });
    if (!decision.ok) {
      return errorResult("config", "CONFIG_GUARD_BLOCKED", decision.message);
    }
    current[key] = value;
    validateGuardrailConfig(current);
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
    if (key === "operator") {
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "config.get",
          key,
          value: loadOperatorConfig()
        })
      };
    }
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
    const config = loadOperatorConfig();
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "integration.list",
        integrations: [
          { id: "github", mode: "plugin-first" },
          { id: "slack", mode: "plugin-first" },
          { id: "dashboard", mode: "local-api" },
          { id: "workspace", mode: "local-tools" },
          {
            id: "metrics",
            mode: config?.metricSource ?? "simulator",
            provider: config?.metricSource ?? "simulator"
          },
          {
            id: "judgment",
            mode: config?.judgmentProvider ?? "canned",
            provider: config?.judgmentProvider ?? "canned"
          },
          {
            id: "deploy",
            mode: config?.deployTarget ?? "simulator",
            provider: config?.deployTarget ?? "simulator"
          }
        ]
      })
    };
  }

  if (command === "integration" && subcommand === "health") {
    const health = loadOperatorConfig() ? await listIntegrationHealth() : [
      { id: "github", status: "degraded", detail: "Operator config not initialized.", checkedAt: Date.now() },
      { id: "slack", status: "degraded", detail: "Operator config not initialized.", checkedAt: Date.now() },
      { id: "dashboard", status: "ready", detail: "Local dashboard API is available in-process.", checkedAt: Date.now() },
      { id: "workspace", status: "ready", detail: "Workspace-backed SentinelOps state is available.", checkedAt: Date.now() },
      { id: "simulator-metrics", status: "ready", detail: "Simulator metrics are available.", checkedAt: Date.now() },
      { id: "judgment-canned", status: "ready", detail: "Canned judgment brain is available.", checkedAt: Date.now() },
      { id: "deploy-simulator", status: "ready", detail: "Simulator deploy target is available.", checkedAt: Date.now() }
    ];
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "integration.health",
        health
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

  if (command === "automation" && subcommand === "enable") {
    try {
      const current = loadOperatorConfig();
      const decision = guard({
        actor: "cli",
        action: "config.write",
        configKey: "operator.enabled",
        previousValue: current?.enabled ?? null,
        nextValue: true
      });
      logAudit({
        timestamp: Date.now(),
        actor: "cli",
        action: "config",
        detail: `operator.enabled -> true (${decision.code})`
      });
      if (!decision.ok) {
        return errorResult("automation", "CONFIG_GUARD_BLOCKED", decision.message);
      }
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "automation.enable",
          config: setOperatorEnabled(true, { actor: "cli" })
        })
      };
    } catch (error) {
      return errorResult("automation", "AUTOMATION_ENABLE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "automation" && subcommand === "disable") {
    try {
      const current = loadOperatorConfig();
      const decision = guard({
        actor: "cli",
        action: "config.write",
        configKey: "operator.enabled",
        previousValue: current?.enabled ?? null,
        nextValue: false
      });
      logAudit({
        timestamp: Date.now(),
        actor: "cli",
        action: "config",
        detail: `operator.enabled -> false (${decision.code})`
      });
      if (!decision.ok) {
        return errorResult("automation", "CONFIG_GUARD_BLOCKED", decision.message);
      }
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "automation.disable",
          config: setOperatorEnabled(false, { actor: "cli" })
        })
      };
    } catch (error) {
      return errorResult("automation", "AUTOMATION_DISABLE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "automation" && subcommand === "list") {
    return {
      exitCode: 0,
      stdout: formatJson({
        ok: true,
        command: "automation.list",
        jobs: listAutomationJobsForCli()
      })
    };
  }

  if (command === "automation" && subcommand === "show") {
    const jobId = getFlagValue(args, "--job");
    if (!jobId) {
      return errorResult("automation", "MISSING_JOB", "Provide --job <job-id>.");
    }
    try {
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "automation.show",
          job: requireAutomationJob(jobId)
        })
      };
    } catch (error) {
      return errorResult("automation", "AUTOMATION_SHOW_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "automation" && subcommand === "seed-issue") {
    const target = getFlagValue(args, "--target");
    const service = getFlagValue(args, "--service");
    if (!target || !service) {
      return errorResult("automation", "MISSING_SEED_FIELDS", "Provide --target and --service.");
    }
    try {
      const result = await handleGithubIssueOpened({
        action: "opened",
        issue: {
          html_url: target,
          labels: [{ name: `service:${service}` }]
        },
        repository: {
          full_name: repoFromGithubUrl(target)
        }
      });
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: "automation.seed-issue",
          ...result,
          slackApproval: buildSlackApprovalRequest(result.run.id, result.job.id)
        })
      };
    } catch (error) {
      return errorResult("automation", "AUTOMATION_SEED_ISSUE_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "automation" && (subcommand === "approve" || subcommand === "reject")) {
    const jobId = getFlagValue(args, "--job");
    const by = getFlagValue(args, "--by") ?? "operator";
    if (!jobId) {
      return errorResult("automation", "MISSING_JOB", "Provide --job <job-id>.");
    }
    try {
      const job = requireAutomationJob(jobId);
      const result = recordAutomationApproval({
        runId: job.runId,
        jobId,
        source: "slack",
        status: subcommand === "approve" ? "approved" : "rejected",
        by
      });
      return {
        exitCode: 0,
        stdout: formatJson({
          ok: true,
          command: `automation.${subcommand}`,
          ...result
        })
      };
    } catch (error) {
      return errorResult("automation", "AUTOMATION_APPROVAL_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  if (command === "automation" && subcommand === "run") {
    const jobId = getFlagValue(args, "--job");
    if (!jobId) {
      return errorResult("automation", "MISSING_JOB", "Provide --job <job-id>.");
    }
    try {
      const result = await executeApprovedAutomationJob(jobId);
      return {
        exitCode: result.execution?.exitCode === 0 ? 0 : 1,
        stdout: formatJson({
          ok: result.execution?.exitCode === 0,
          command: "automation.run",
          ...result
        })
      };
    } catch (error) {
      return errorResult("automation", "AUTOMATION_RUN_FAILED", error instanceof Error ? error.message : String(error));
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
          ...setPolicyThreshold(key, value, {
            actor: "cli",
            approved: args.includes("--approved")
          })
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

  if (command === "simulate" && isScenario(scenarioValue)) {
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

  if (command === "judge" && isScenario(scenarioValue)) {
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

  if (command === "decide" && isScenario(scenarioValue)) {
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
