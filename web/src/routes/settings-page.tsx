import { useEffect, useState } from "react";
import { LiveActivityPanel } from "../components/live-activity-panel";
import { useLiveDashboardRefresh } from "../hooks/use-live-dashboard-refresh";
import {
  createLiveOnboarding,
  fetchGuardrailPolicyConfig,
  fetchIntegrationHealthItem,
  fetchOperatorConfig,
  saveGuardrailPolicyConfig,
  saveOperatorConfig
} from "../lib/api";
import { useDashboardQuery } from "../hooks/use-dashboard-query";
import type {
  GuardrailPolicyConfig,
  IntegrationHealth,
  LiveOnboardingResponse,
  OperatorConfigClient
} from "../lib/types";

interface OperatorConfigFormState {
  trackedReposText: string;
  slackChannel: string;
  agentCommand: string;
  agentArgsText: string;
  enabled: boolean;
  judgmentProvider: "canned" | "openai" | "anthropic" | "ai-cli";
  openaiModel: string;
  anthropicModel: string;
  aiCliCommand: string;
  aiCliArgsText: string;
  aiCliHealthArgsText: string;
  deployTarget: "simulator" | "kubernetes" | "docker";
  kubernetesCommand: string;
  kubernetesContext: string;
  kubernetesNamespace: string;
  kubernetesDeployment: string;
  kubernetesService: string;
  dockerCommand: string;
  dockerComposeFile: string;
  dockerService: string;
  dockerContainer: string;
  metricSource: "simulator" | "prometheus" | "grafana";
  prometheusUrl: string;
  prometheusErrorRateExpr: string;
  prometheusLatencyP95Expr: string;
  prometheusRequestsPerSecExpr: string;
  prometheusBaselineErrorRateExpr: string;
  prometheusBaselineLatencyP95Expr: string;
  prometheusBaselineRequestsPerSecExpr: string;
  prometheusBaselineLookbackHours: string;
  grafanaUrl: string;
  grafanaToken: string;
  grafanaDatasourceUid: string;
  grafanaDashboardUid: string;
  grafanaErrorRateExpr: string;
  grafanaLatencyP95Expr: string;
  grafanaRequestsPerSecExpr: string;
  grafanaBaselineErrorRateExpr: string;
  grafanaBaselineLatencyP95Expr: string;
  grafanaBaselineRequestsPerSecExpr: string;
  grafanaBaselineLookbackHours: string;
}

interface GuardrailFormState {
  thresholdMedium: string;
  thresholdHigh: string;
  thresholdCritical: string;
  rollbackMinConfidence: string;
  rollbackMaxErrorRate: string;
  rollbackMaxLatencyP95: string;
  rollbackRequireHumanApproval: boolean;
  approved: boolean;
}

const defaultOperatorConfigForm: OperatorConfigFormState = {
  trackedReposText: "",
  slackChannel: "",
  agentCommand: "codex",
  agentArgsText: "exec\n--json",
  enabled: true,
  judgmentProvider: "canned",
  openaiModel: "gpt-4o-2024-08-06",
  anthropicModel: "claude-3-5-sonnet-latest",
  aiCliCommand: "codex",
  aiCliArgsText: "exec\n--json",
  aiCliHealthArgsText: "--help",
  deployTarget: "simulator",
  kubernetesCommand: "kubectl",
  kubernetesContext: "",
  kubernetesNamespace: "default",
  kubernetesDeployment: "",
  kubernetesService: "app",
  dockerCommand: "docker",
  dockerComposeFile: "",
  dockerService: "app",
  dockerContainer: "",
  metricSource: "simulator",
  prometheusUrl: "",
  prometheusErrorRateExpr: "",
  prometheusLatencyP95Expr: "",
  prometheusRequestsPerSecExpr: "",
  prometheusBaselineErrorRateExpr: "",
  prometheusBaselineLatencyP95Expr: "",
  prometheusBaselineRequestsPerSecExpr: "",
  prometheusBaselineLookbackHours: "168",
  grafanaUrl: "",
  grafanaToken: "",
  grafanaDatasourceUid: "",
  grafanaDashboardUid: "",
  grafanaErrorRateExpr: "",
  grafanaLatencyP95Expr: "",
  grafanaRequestsPerSecExpr: "",
  grafanaBaselineErrorRateExpr: "",
  grafanaBaselineLatencyP95Expr: "",
  grafanaBaselineRequestsPerSecExpr: "",
  grafanaBaselineLookbackHours: "168"
};

const defaultGuardrailForm: GuardrailFormState = {
  thresholdMedium: "35",
  thresholdHigh: "60",
  thresholdCritical: "80",
  rollbackMinConfidence: "90",
  rollbackMaxErrorRate: "0.25",
  rollbackMaxLatencyP95: "2000",
  rollbackRequireHumanApproval: false,
  approved: false
};

function linesToArray(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function configToFormState(config: OperatorConfigClient | null): OperatorConfigFormState {
  if (!config) {
    return defaultOperatorConfigForm;
  }

  return {
    trackedReposText: config.trackedRepos.join("\n"),
    slackChannel: config.slackChannel,
    agentCommand: config.agentCommand,
    agentArgsText: config.agentArgs.join("\n"),
    enabled: config.enabled,
    judgmentProvider: config.judgmentProvider,
    openaiModel: String(config.openai?.model ?? defaultOperatorConfigForm.openaiModel),
    anthropicModel: String(config.anthropic?.model ?? defaultOperatorConfigForm.anthropicModel),
    aiCliCommand: String(config.aiCli?.command ?? defaultOperatorConfigForm.aiCliCommand),
    aiCliArgsText: Array.isArray(config.aiCli?.args)
      ? config.aiCli.args.join("\n")
      : defaultOperatorConfigForm.aiCliArgsText,
    aiCliHealthArgsText: Array.isArray(config.aiCli?.healthArgs)
      ? config.aiCli.healthArgs.join("\n")
      : defaultOperatorConfigForm.aiCliHealthArgsText,
    deployTarget: config.deployTarget,
    kubernetesCommand: String(config.kubernetes?.command ?? defaultOperatorConfigForm.kubernetesCommand),
    kubernetesContext: String(config.kubernetes?.context ?? ""),
    kubernetesNamespace: String(
      config.kubernetes?.namespace ?? defaultOperatorConfigForm.kubernetesNamespace
    ),
    kubernetesDeployment: String(config.kubernetes?.deployment ?? ""),
    kubernetesService: String(config.kubernetes?.service ?? defaultOperatorConfigForm.kubernetesService),
    dockerCommand: String(config.docker?.command ?? defaultOperatorConfigForm.dockerCommand),
    dockerComposeFile: String(config.docker?.composeFile ?? ""),
    dockerService: String(config.docker?.service ?? defaultOperatorConfigForm.dockerService),
    dockerContainer: String(config.docker?.container ?? ""),
    metricSource: config.metricSource,
    prometheusUrl: String(config.prometheus?.url ?? ""),
    prometheusErrorRateExpr: String(config.prometheus?.errorRateExpr ?? ""),
    prometheusLatencyP95Expr: String(config.prometheus?.latencyP95Expr ?? ""),
    prometheusRequestsPerSecExpr: String(config.prometheus?.requestsPerSecExpr ?? ""),
    prometheusBaselineErrorRateExpr: String(config.prometheus?.baselineErrorRateExpr ?? ""),
    prometheusBaselineLatencyP95Expr: String(config.prometheus?.baselineLatencyP95Expr ?? ""),
    prometheusBaselineRequestsPerSecExpr: String(config.prometheus?.baselineRequestsPerSecExpr ?? ""),
    prometheusBaselineLookbackHours: String(
      config.prometheus?.baselineLookbackHours ?? defaultOperatorConfigForm.prometheusBaselineLookbackHours
    ),
    grafanaUrl: String(config.grafana?.url ?? ""),
    grafanaToken: String(config.grafana?.token ?? ""),
    grafanaDatasourceUid: String(config.grafana?.datasourceUid ?? ""),
    grafanaDashboardUid: String(config.grafana?.dashboardUid ?? ""),
    grafanaErrorRateExpr: String(config.grafana?.errorRateExpr ?? ""),
    grafanaLatencyP95Expr: String(config.grafana?.latencyP95Expr ?? ""),
    grafanaRequestsPerSecExpr: String(config.grafana?.requestsPerSecExpr ?? ""),
    grafanaBaselineErrorRateExpr: String(config.grafana?.baselineErrorRateExpr ?? ""),
    grafanaBaselineLatencyP95Expr: String(config.grafana?.baselineLatencyP95Expr ?? ""),
    grafanaBaselineRequestsPerSecExpr: String(config.grafana?.baselineRequestsPerSecExpr ?? ""),
    grafanaBaselineLookbackHours: String(
      config.grafana?.baselineLookbackHours ?? defaultOperatorConfigForm.grafanaBaselineLookbackHours
    )
  };
}

function buildOperatorConfigPayload(form: OperatorConfigFormState): Record<string, unknown> {
  return {
    trackedRepos: linesToArray(form.trackedReposText),
    slackChannel: form.slackChannel.trim(),
    agentCommand: form.agentCommand.trim(),
    agentArgs: linesToArray(form.agentArgsText),
    enabled: form.enabled,
    judgmentProvider: form.judgmentProvider,
    openai: {
      model: form.openaiModel.trim()
    },
    anthropic: {
      model: form.anthropicModel.trim()
    },
    aiCli: {
      command: form.aiCliCommand.trim(),
      args: linesToArray(form.aiCliArgsText),
      healthArgs: linesToArray(form.aiCliHealthArgsText)
    },
    deployTarget: form.deployTarget,
    kubernetes: {
      command: form.kubernetesCommand.trim(),
      context: form.kubernetesContext.trim(),
      namespace: form.kubernetesNamespace.trim(),
      deployment: form.kubernetesDeployment.trim(),
      service: form.kubernetesService.trim()
    },
    docker: {
      command: form.dockerCommand.trim(),
      composeFile: form.dockerComposeFile.trim(),
      service: form.dockerService.trim(),
      container: form.dockerContainer.trim()
    },
    metricSource: form.metricSource,
    prometheus: {
      url: form.prometheusUrl.trim(),
      errorRateExpr: form.prometheusErrorRateExpr.trim(),
      latencyP95Expr: form.prometheusLatencyP95Expr.trim(),
      requestsPerSecExpr: form.prometheusRequestsPerSecExpr.trim(),
      baselineErrorRateExpr: form.prometheusBaselineErrorRateExpr.trim(),
      baselineLatencyP95Expr: form.prometheusBaselineLatencyP95Expr.trim(),
      baselineRequestsPerSecExpr: form.prometheusBaselineRequestsPerSecExpr.trim(),
      baselineLookbackHours: Number(form.prometheusBaselineLookbackHours)
    },
    grafana: {
      url: form.grafanaUrl.trim(),
      token: form.grafanaToken.trim(),
      datasourceUid: form.grafanaDatasourceUid.trim(),
      dashboardUid: form.grafanaDashboardUid.trim(),
      errorRateExpr: form.grafanaErrorRateExpr.trim(),
      latencyP95Expr: form.grafanaLatencyP95Expr.trim(),
      requestsPerSecExpr: form.grafanaRequestsPerSecExpr.trim(),
      baselineErrorRateExpr: form.grafanaBaselineErrorRateExpr.trim(),
      baselineLatencyP95Expr: form.grafanaBaselineLatencyP95Expr.trim(),
      baselineRequestsPerSecExpr: form.grafanaBaselineRequestsPerSecExpr.trim(),
      baselineLookbackHours: Number(form.grafanaBaselineLookbackHours)
    }
  };
}

function guardrailToFormState(policy: GuardrailPolicyConfig | null): GuardrailFormState {
  if (!policy) {
    return defaultGuardrailForm;
  }

  return {
    thresholdMedium: String(policy.thresholds.medium),
    thresholdHigh: String(policy.thresholds.high),
    thresholdCritical: String(policy.thresholds.critical),
    rollbackMinConfidence: String(policy.rollback.minConfidence),
    rollbackMaxErrorRate: String(policy.rollback.maxErrorRate),
    rollbackMaxLatencyP95: String(policy.rollback.maxLatencyP95),
    rollbackRequireHumanApproval: policy.rollback.requireHumanApproval,
    approved: false
  };
}

export function SettingsPage(): JSX.Element {
  const live = useLiveDashboardRefresh([
    "config.updated",
    "operator.toggled",
    "integration.updated",
    "onboarding.updated"
  ]);
  const configQuery = useDashboardQuery(fetchOperatorConfig, [live.refreshToken]);
  const guardrailQuery = useDashboardQuery(fetchGuardrailPolicyConfig, [live.refreshToken]);
  const [configForm, setConfigForm] = useState<OperatorConfigFormState>(defaultOperatorConfigForm);
  const [guardrailForm, setGuardrailForm] = useState<GuardrailFormState>(defaultGuardrailForm);
  const [configStatusMessage, setConfigStatusMessage] = useState<string | null>(null);
  const [guardrailStatusMessage, setGuardrailStatusMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<Error | null>(null);
  const [guardrailError, setGuardrailError] = useState<Error | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingGuardrails, setSavingGuardrails] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [slackChannelInput, setSlackChannelInput] = useState("");
  const [agentCommandInput, setAgentCommandInput] = useState("codex");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LiveOnboardingResponse | null>(null);
  const [seededConfig, setSeededConfig] = useState(false);
  const [seededGuardrails, setSeededGuardrails] = useState(false);
  const [healthChecks, setHealthChecks] = useState<Record<string, IntegrationHealth>>({});
  const [healthError, setHealthError] = useState<Error | null>(null);
  const [pendingHealthId, setPendingHealthId] = useState<string | null>(null);

  useEffect(() => {
    const config = configQuery.data?.config;
    if (!config) {
      return;
    }

    if (!seededConfig) {
      setConfigForm(configToFormState(config));
      setSeededConfig(true);
    }

    if (!repoInput && config.trackedRepos[0]) {
      setRepoInput(config.trackedRepos[0]);
    }
    if (!slackChannelInput && config.slackChannel) {
      setSlackChannelInput(config.slackChannel);
    }
    if (agentCommandInput === "codex" && config.agentCommand) {
      setAgentCommandInput(config.agentCommand);
    }
  }, [agentCommandInput, configQuery.data?.config, repoInput, seededConfig, slackChannelInput]);

  useEffect(() => {
    const policy = guardrailQuery.data?.policy;
    if (!policy || seededGuardrails) {
      return;
    }

    setGuardrailForm(guardrailToFormState(policy));
    setSeededGuardrails(true);
  }, [guardrailQuery.data?.policy, seededGuardrails]);

  function updateConfigForm<K extends keyof OperatorConfigFormState>(
    key: K,
    value: OperatorConfigFormState[K]
  ): void {
    setConfigForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateGuardrailForm<K extends keyof GuardrailFormState>(
    key: K,
    value: GuardrailFormState[K]
  ): void {
    setGuardrailForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function handleConfigSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSavingConfig(true);
    setConfigError(null);
    setConfigStatusMessage("Saving operator control-plane settings...");

    try {
      const response = await saveOperatorConfig(buildOperatorConfigPayload(configForm));
      setConfigForm(configToFormState(response.config));
      setSeededConfig(true);
      setConfigStatusMessage(
        `Saved ${response.config?.judgmentProvider ?? "operator"} settings for ${response.config?.trackedRepos.join(", ") ?? "the workspace"}.`
      );
    } catch (error) {
      setConfigError(error instanceof Error ? error : new Error("Operator config save failed."));
      setConfigStatusMessage(null);
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setStatusMessage("Saving live mode setup...");

    try {
      const nextResult = await createLiveOnboarding({
        repo: repoInput,
        slackChannel: slackChannelInput,
        agentCommand: agentCommandInput,
        agentArgs: ["exec", "--json"],
        enabled: true
      });
      setResult(nextResult);
      setStatusMessage(
        `Tracking ${nextResult.repo} and posting approvals to ${nextResult.slackChannel}.`
      );
    } catch (error) {
      setSubmitError(error instanceof Error ? error : new Error("Live onboarding failed."));
      setStatusMessage(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGuardrailSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSavingGuardrails(true);
    setGuardrailError(null);
    setGuardrailStatusMessage("Saving guardrail thresholds...");

    try {
      const response = await saveGuardrailPolicyConfig({
        thresholds: {
          medium: Number(guardrailForm.thresholdMedium),
          high: Number(guardrailForm.thresholdHigh),
          critical: Number(guardrailForm.thresholdCritical)
        },
        rollback: {
          minConfidence: Number(guardrailForm.rollbackMinConfidence),
          maxErrorRate: Number(guardrailForm.rollbackMaxErrorRate),
          maxLatencyP95: Number(guardrailForm.rollbackMaxLatencyP95),
          requireHumanApproval: guardrailForm.rollbackRequireHumanApproval
        },
        approved: guardrailForm.approved
      });
      setGuardrailForm(guardrailToFormState(response.policy));
      setSeededGuardrails(true);
      setGuardrailStatusMessage(
        `Saved guardrails. Medium/high/critical risk now start at ${response.policy.thresholds.medium}/${response.policy.thresholds.high}/${response.policy.thresholds.critical}.`
      );
    } catch (error) {
      setGuardrailError(error instanceof Error ? error : new Error("Guardrail policy save failed."));
      setGuardrailStatusMessage(null);
    } finally {
      setSavingGuardrails(false);
    }
  }

  async function handleHealthCheck(integrationId: string): Promise<void> {
    setPendingHealthId(integrationId);
    setHealthError(null);
    try {
      const response = await fetchIntegrationHealthItem(integrationId);
      setHealthChecks((current) => ({
        ...current,
        [integrationId]: response.health
      }));
    } catch (error) {
      setHealthError(error instanceof Error ? error : new Error("Health check failed."));
    } finally {
      setPendingHealthId(null);
    }
  }

  const currentConfig = configQuery.data?.config ?? null;
  const currentGuardrails = guardrailQuery.data?.policy ?? null;
  const activeDiagnostics = buildDiagnostics(configForm);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Settings</p>
          <h1 className="mt-3 text-4xl font-semibold">Settings Workspace</h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300">
            Configure the operator control plane, adapter choices, and live onboarding flows from
            the React workspace instead of the legacy HTML shell.
          </p>
        </div>

        <form
          className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur"
          onSubmit={(event) => {
            void handleConfigSave(event);
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Operator control plane</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Choose the active judgment provider, metric source, deploy target, and repo wiring
                that the backend should use for real SentinelOps decisions.
              </p>
            </div>
            <label className="rounded-full border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-200">
              <span className="mr-3">Automation enabled</span>
              <input
                checked={configForm.enabled}
                onChange={(event) => {
                  updateConfigForm("enabled", event.target.checked);
                }}
                type="checkbox"
              />
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-200 md:col-span-2">
              <span>Tracked repositories</span>
              <textarea
                className="min-h-24 rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                onChange={(event) => {
                  updateConfigForm("trackedReposText", event.target.value);
                }}
                value={configForm.trackedReposText}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              <span>Slack approvals channel</span>
              <input
                className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                onChange={(event) => {
                  updateConfigForm("slackChannel", event.target.value);
                }}
                type="text"
                value={configForm.slackChannel}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              <span>Default agent command</span>
              <input
                className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                onChange={(event) => {
                  updateConfigForm("agentCommand", event.target.value);
                }}
                type="text"
                value={configForm.agentCommand}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-200 md:col-span-2">
              <span>Default agent args</span>
              <textarea
                className="min-h-24 rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                onChange={(event) => {
                  updateConfigForm("agentArgsText", event.target.value);
                }}
                value={configForm.agentArgsText}
              />
            </label>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-base font-medium text-white">Judgment brain</h3>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm text-slate-200">
                  <span>Provider</span>
                  <select
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none"
                    onChange={(event) => {
                      updateConfigForm(
                        "judgmentProvider",
                        event.target.value as OperatorConfigFormState["judgmentProvider"]
                      );
                    }}
                    value={configForm.judgmentProvider}
                  >
                    <option value="canned">Canned</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ai-cli">AI CLI</option>
                  </select>
                </label>

                {configForm.judgmentProvider === "openai" ? (
                  <ConfigField
                    label="OpenAI model"
                    value={configForm.openaiModel}
                    onChange={(value) => {
                      updateConfigForm("openaiModel", value);
                    }}
                  />
                ) : null}

                {configForm.judgmentProvider === "anthropic" ? (
                  <ConfigField
                    label="Anthropic model"
                    value={configForm.anthropicModel}
                    onChange={(value) => {
                      updateConfigForm("anthropicModel", value);
                    }}
                  />
                ) : null}

                {configForm.judgmentProvider === "ai-cli" ? (
                  <>
                    <ConfigField
                      label="CLI command"
                      value={configForm.aiCliCommand}
                      onChange={(value) => {
                        updateConfigForm("aiCliCommand", value);
                      }}
                    />
                    <ConfigTextArea
                      label="CLI args"
                      value={configForm.aiCliArgsText}
                      onChange={(value) => {
                        updateConfigForm("aiCliArgsText", value);
                      }}
                    />
                    <ConfigTextArea
                      label="CLI health args"
                      value={configForm.aiCliHealthArgsText}
                      onChange={(value) => {
                        updateConfigForm("aiCliHealthArgsText", value);
                      }}
                    />
                  </>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-base font-medium text-white">Metric source</h3>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm text-slate-200">
                  <span>Source</span>
                  <select
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none"
                    onChange={(event) => {
                      updateConfigForm(
                        "metricSource",
                        event.target.value as OperatorConfigFormState["metricSource"]
                      );
                    }}
                    value={configForm.metricSource}
                  >
                    <option value="simulator">Simulator</option>
                    <option value="prometheus">Prometheus</option>
                    <option value="grafana">Grafana</option>
                  </select>
                </label>

                {configForm.metricSource === "prometheus" ? (
                  <>
                    <ConfigField label="Prometheus URL" value={configForm.prometheusUrl} onChange={(value) => updateConfigForm("prometheusUrl", value)} />
                    <ConfigField label="Error rate query" value={configForm.prometheusErrorRateExpr} onChange={(value) => updateConfigForm("prometheusErrorRateExpr", value)} />
                    <ConfigField label="Latency p95 query" value={configForm.prometheusLatencyP95Expr} onChange={(value) => updateConfigForm("prometheusLatencyP95Expr", value)} />
                    <ConfigField label="Requests/sec query" value={configForm.prometheusRequestsPerSecExpr} onChange={(value) => updateConfigForm("prometheusRequestsPerSecExpr", value)} />
                    <ConfigField label="Baseline error query" value={configForm.prometheusBaselineErrorRateExpr} onChange={(value) => updateConfigForm("prometheusBaselineErrorRateExpr", value)} />
                    <ConfigField label="Baseline latency query" value={configForm.prometheusBaselineLatencyP95Expr} onChange={(value) => updateConfigForm("prometheusBaselineLatencyP95Expr", value)} />
                    <ConfigField label="Baseline RPS query" value={configForm.prometheusBaselineRequestsPerSecExpr} onChange={(value) => updateConfigForm("prometheusBaselineRequestsPerSecExpr", value)} />
                    <ConfigField label="Baseline lookback hours" type="number" value={configForm.prometheusBaselineLookbackHours} onChange={(value) => updateConfigForm("prometheusBaselineLookbackHours", value)} />
                  </>
                ) : null}

                {configForm.metricSource === "grafana" ? (
                  <>
                    <ConfigField label="Grafana URL" value={configForm.grafanaUrl} onChange={(value) => updateConfigForm("grafanaUrl", value)} />
                    <ConfigField label="Grafana token" value={configForm.grafanaToken} onChange={(value) => updateConfigForm("grafanaToken", value)} />
                    <ConfigField label="Datasource UID" value={configForm.grafanaDatasourceUid} onChange={(value) => updateConfigForm("grafanaDatasourceUid", value)} />
                    <ConfigField label="Dashboard UID" value={configForm.grafanaDashboardUid} onChange={(value) => updateConfigForm("grafanaDashboardUid", value)} />
                    <ConfigField label="Error rate query" value={configForm.grafanaErrorRateExpr} onChange={(value) => updateConfigForm("grafanaErrorRateExpr", value)} />
                    <ConfigField label="Latency p95 query" value={configForm.grafanaLatencyP95Expr} onChange={(value) => updateConfigForm("grafanaLatencyP95Expr", value)} />
                    <ConfigField label="Requests/sec query" value={configForm.grafanaRequestsPerSecExpr} onChange={(value) => updateConfigForm("grafanaRequestsPerSecExpr", value)} />
                    <ConfigField label="Baseline error query" value={configForm.grafanaBaselineErrorRateExpr} onChange={(value) => updateConfigForm("grafanaBaselineErrorRateExpr", value)} />
                    <ConfigField label="Baseline latency query" value={configForm.grafanaBaselineLatencyP95Expr} onChange={(value) => updateConfigForm("grafanaBaselineLatencyP95Expr", value)} />
                    <ConfigField label="Baseline RPS query" value={configForm.grafanaBaselineRequestsPerSecExpr} onChange={(value) => updateConfigForm("grafanaBaselineRequestsPerSecExpr", value)} />
                    <ConfigField label="Baseline lookback hours" type="number" value={configForm.grafanaBaselineLookbackHours} onChange={(value) => updateConfigForm("grafanaBaselineLookbackHours", value)} />
                  </>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-base font-medium text-white">Deploy target</h3>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm text-slate-200">
                  <span>Target</span>
                  <select
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none"
                    onChange={(event) => {
                      updateConfigForm(
                        "deployTarget",
                        event.target.value as OperatorConfigFormState["deployTarget"]
                      );
                    }}
                    value={configForm.deployTarget}
                  >
                    <option value="simulator">Simulator</option>
                    <option value="kubernetes">Kubernetes</option>
                    <option value="docker">Docker</option>
                  </select>
                </label>

                {configForm.deployTarget === "kubernetes" ? (
                  <>
                    <ConfigField label="Kubectl command" value={configForm.kubernetesCommand} onChange={(value) => updateConfigForm("kubernetesCommand", value)} />
                    <ConfigField label="Context" value={configForm.kubernetesContext} onChange={(value) => updateConfigForm("kubernetesContext", value)} />
                    <ConfigField label="Namespace" value={configForm.kubernetesNamespace} onChange={(value) => updateConfigForm("kubernetesNamespace", value)} />
                    <ConfigField label="Deployment" value={configForm.kubernetesDeployment} onChange={(value) => updateConfigForm("kubernetesDeployment", value)} />
                    <ConfigField label="Service" value={configForm.kubernetesService} onChange={(value) => updateConfigForm("kubernetesService", value)} />
                  </>
                ) : null}

                {configForm.deployTarget === "docker" ? (
                  <>
                    <ConfigField label="Docker command" value={configForm.dockerCommand} onChange={(value) => updateConfigForm("dockerCommand", value)} />
                    <ConfigField label="Compose file" value={configForm.dockerComposeFile} onChange={(value) => updateConfigForm("dockerComposeFile", value)} />
                    <ConfigField label="Service" value={configForm.dockerService} onChange={(value) => updateConfigForm("dockerService", value)} />
                    <ConfigField label="Container" value={configForm.dockerContainer} onChange={(value) => updateConfigForm("dockerContainer", value)} />
                  </>
                ) : null}
              </div>
            </section>
          </div>

          {configQuery.error ? (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {configQuery.error.message}
            </p>
          ) : null}
          {configError ? (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {configError.message}
            </p>
          ) : null}
          {configStatusMessage ? <p className="mt-4 text-sm text-emerald-300">{configStatusMessage}</p> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-full border border-cyan-400/30 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={savingConfig}
              type="submit"
            >
              {savingConfig ? "Saving..." : "Save operator config"}
            </button>
          </div>
        </form>

        <form
          className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Live onboarding</h2>
              <p className="mt-2 text-sm text-slate-300">
                Save the tracked repo, Slack approval destination, and agent command for the
                current workspace session.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ConfigField
              label="GitHub repo"
              value={repoInput}
              onChange={(value) => {
                setRepoInput(value);
              }}
            />

            <ConfigField
              label="Slack channel"
              value={slackChannelInput}
              onChange={(value) => {
                setSlackChannelInput(value);
              }}
            />

            <div className="md:col-span-2">
              <ConfigField
                label="Agent command"
                value={agentCommandInput}
                onChange={(value) => {
                  setAgentCommandInput(value);
                }}
              />
            </div>
          </div>

          {submitError ? (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {submitError.message}
            </p>
          ) : null}
          {statusMessage ? <p className="mt-4 text-sm text-emerald-300">{statusMessage}</p> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-full border border-cyan-400/30 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Starting..." : "Start live mode"}
            </button>
          </div>
        </form>

        <form
          className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur"
          onSubmit={(event) => {
            void handleGuardrailSave(event);
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Guardrails and thresholds</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Tune risk thresholds and rollback limits from the React workspace. Tightening is
                immediate; loosening safety must carry explicit approval and stays audited.
              </p>
            </div>
            <label className="rounded-full border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-200">
              <span className="mr-3">Approval attached</span>
              <input
                checked={guardrailForm.approved}
                onChange={(event) => {
                  updateGuardrailForm("approved", event.target.checked);
                }}
                type="checkbox"
              />
            </label>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-base font-medium text-white">Risk policy</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <ConfigField
                  label="Medium threshold"
                  type="number"
                  value={guardrailForm.thresholdMedium}
                  onChange={(value) => {
                    updateGuardrailForm("thresholdMedium", value);
                  }}
                />
                <ConfigField
                  label="High threshold"
                  type="number"
                  value={guardrailForm.thresholdHigh}
                  onChange={(value) => {
                    updateGuardrailForm("thresholdHigh", value);
                  }}
                />
                <ConfigField
                  label="Critical threshold"
                  type="number"
                  value={guardrailForm.thresholdCritical}
                  onChange={(value) => {
                    updateGuardrailForm("thresholdCritical", value);
                  }}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-base font-medium text-white">Rollback limits</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ConfigField
                  label="Minimum confidence"
                  type="number"
                  value={guardrailForm.rollbackMinConfidence}
                  onChange={(value) => {
                    updateGuardrailForm("rollbackMinConfidence", value);
                  }}
                />
                <ConfigField
                  label="Max error rate"
                  type="number"
                  value={guardrailForm.rollbackMaxErrorRate}
                  onChange={(value) => {
                    updateGuardrailForm("rollbackMaxErrorRate", value);
                  }}
                />
                <ConfigField
                  label="Max latency p95 (ms)"
                  type="number"
                  value={guardrailForm.rollbackMaxLatencyP95}
                  onChange={(value) => {
                    updateGuardrailForm("rollbackMaxLatencyP95", value);
                  }}
                />
                <label className="grid gap-2 text-sm text-slate-200">
                  <span>Require human approval</span>
                  <input
                    checked={guardrailForm.rollbackRequireHumanApproval}
                    className="h-5 w-5"
                    onChange={(event) => {
                      updateGuardrailForm("rollbackRequireHumanApproval", event.target.checked);
                    }}
                    type="checkbox"
                  />
                </label>
              </div>
            </section>
          </div>

          {guardrailQuery.error ? (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {guardrailQuery.error.message}
            </p>
          ) : null}
          {guardrailError ? (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {guardrailError.message}
            </p>
          ) : null}
          {guardrailStatusMessage ? (
            <p className="mt-4 text-sm text-emerald-300">{guardrailStatusMessage}</p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-full border border-cyan-400/30 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={savingGuardrails}
              type="submit"
            >
              {savingGuardrails ? "Saving..." : "Save guardrails"}
            </button>
          </div>
        </form>
      </div>

      <aside className="grid gap-6">
        <LiveActivityPanel
          connected={live.connected}
          error={live.error}
          lastEvent={live.lastEvent}
        />
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Current config</h2>
          {configQuery.loading ? (
            <p className="mt-3 text-sm text-slate-300">Loading operator config...</p>
          ) : currentConfig ? (
            <CurrentConfigSummary config={currentConfig} guardrails={currentGuardrails} />
          ) : (
            <p className="mt-3 text-sm text-slate-300">No operator config has been saved yet.</p>
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Connection diagnostics</h2>
          <p className="mt-2 text-sm text-slate-300">
            Test the active adapters one by one from the control surface, using the same backend
            health checks as the live runtime.
          </p>
          {healthError ? (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {healthError.message}
            </p>
          ) : null}
          <div className="mt-4 grid gap-3">
            {activeDiagnostics.map((diagnostic) => {
              const health = healthChecks[diagnostic.id] ?? null;
              const isPending = pendingHealthId === diagnostic.id;
              return (
                <article key={diagnostic.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{diagnostic.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-500">{diagnostic.id}</p>
                    </div>
                    <button
                      className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs uppercase tracking-[0.25em] text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isPending}
                      onClick={() => {
                        void handleHealthCheck(diagnostic.id);
                      }}
                      type="button"
                    >
                      {isPending ? "Testing..." : diagnostic.buttonLabel}
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{diagnostic.description}</p>
                  {health ? (
                    <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">
                      <p className="font-medium text-white">{health.status}</p>
                      <p className="mt-1">{health.detail}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                        Checked {new Date(health.checkedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-panel backdrop-blur">
          <h2 className="text-lg font-medium">Codex handoff</h2>
          {result ? (
            <div className="mt-4 grid gap-3 text-sm text-slate-300">
              <p className="text-white">{result.codexPrompt}</p>
              <ul className="grid gap-2">
                {result.pluginFlow.map((step) => (
                  <li key={step} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-300">
              Launch live mode to get the GitHub and Slack handoff guidance for the current repo.
            </p>
          )}
        </section>
      </aside>
    </section>
  );
}

function buildDiagnostics(form: OperatorConfigFormState): Array<{
  id: string;
  label: string;
  description: string;
  buttonLabel: string;
}> {
  return [
    {
      id: form.metricSource,
      label: "Metric source",
      description:
        form.metricSource === "prometheus"
          ? `Prometheus endpoint ${form.prometheusUrl || "not configured"}`
          : form.metricSource === "grafana"
            ? `Grafana endpoint ${form.grafanaUrl || "not configured"}`
            : "Simulator metric source",
      buttonLabel: "Test metric source"
    },
    {
      id: `judgment-${form.judgmentProvider}`,
      label: "Judgment provider",
      description: `Active judgment brain: ${form.judgmentProvider}`,
      buttonLabel: "Test judgment"
    },
    {
      id: `deploy-${form.deployTarget}`,
      label: "Deploy target",
      description:
        form.deployTarget === "kubernetes"
          ? `Kubernetes context ${form.kubernetesContext || "default"}`
          : form.deployTarget === "docker"
            ? `Docker service ${form.dockerService || "app"}`
            : "Simulator deploy target",
      buttonLabel: "Test deploy target"
    },
    {
      id: "slack",
      label: "Slack channel",
      description: form.slackChannel || "Slack channel not configured yet.",
      buttonLabel: "Test Slack"
    },
    {
      id: "github",
      label: "Tracked repositories",
      description: linesToArray(form.trackedReposText).join(", ") || "No tracked repositories configured yet.",
      buttonLabel: "Test GitHub"
    }
  ];
}

function ConfigField({
  label,
  onChange,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  value: string;
}): JSX.Element {
  return (
    <label className="grid gap-2 text-sm text-slate-200">
      <span>{label}</span>
      <input
        className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        type={type}
        value={value}
      />
    </label>
  );
}

function ConfigTextArea({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}): JSX.Element {
  return (
    <label className="grid gap-2 text-sm text-slate-200">
      <span>{label}</span>
      <textarea
        className="min-h-24 rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      />
    </label>
  );
}

function CurrentConfigSummary({
  config,
  guardrails
}: {
  config: OperatorConfigClient;
  guardrails: GuardrailPolicyConfig | null;
}): JSX.Element {
  return (
    <dl className="mt-4 grid gap-3 text-sm text-slate-300">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Tracked repos</dt>
        <dd className="mt-2 text-white">{config.trackedRepos.join(", ")}</dd>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Judgment provider</dt>
        <dd className="mt-2 text-white">{config.judgmentProvider}</dd>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Metric source</dt>
        <dd className="mt-2 text-white">{config.metricSource}</dd>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Deploy target</dt>
        <dd className="mt-2 text-white">{config.deployTarget}</dd>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Slack channel</dt>
        <dd className="mt-2 text-white">{config.slackChannel}</dd>
      </div>
      {guardrails ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">Guardrails</dt>
          <dd className="mt-2 text-white">
            Risk {guardrails.thresholds.medium}/{guardrails.thresholds.high}/{guardrails.thresholds.critical}
          </dd>
          <dd className="mt-2 text-slate-300">
            Rollback {guardrails.rollback.minConfidence}% confidence, error {guardrails.rollback.maxErrorRate},
            latency {guardrails.rollback.maxLatencyP95}ms, approval{" "}
            {guardrails.rollback.requireHumanApproval ? "required" : "optional"}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
