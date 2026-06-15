import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

describe("route pages", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the automation workspace route with live jobs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path === "/api/automation/pipeline") {
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  job: {
                    id: "job-1",
                    runId: "run-1",
                    source: "github_issue",
                    serviceId: "svc-api",
                    githubIssueUrl: "https://github.com/example/repo/issues/77",
                    status: "awaiting_approval",
                    approvalMessageId: null,
                    execution: null,
                    createdAt: "2026-06-14T00:00:00.000Z",
                    updatedAt: "2026-06-14T00:10:00.000Z"
                  },
                  summary: "Investigate checkout failures",
                  githubTarget: "https://github.com/example/repo/issues/77",
                  risk: {
                    level: "high",
                    score: 72,
                    reasons: ["deploy risk"]
                  },
                  approvals: [],
                  latestApproval: null,
                  testSummary: {
                    passed: 0,
                    failed: 0,
                    notRun: 1
                  },
                  guard: {
                    status: "blocked",
                    summary: "This run needs approval before protected actions.",
                    violations: ["APPROVAL_REQUIRED"]
                  },
                  stages: [
                    {
                      id: "intake",
                      label: "Issue intake",
                      status: "completed",
                      detail: "GitHub issue arrived and created an automation job."
                    },
                    {
                      id: "approval",
                      label: "Approval",
                      status: "active",
                      detail: "Waiting for an operator decision."
                    },
                    {
                      id: "execution",
                      label: "Agent execution",
                      status: "pending",
                      detail: "Execution has not started."
                    },
                    {
                      id: "guard",
                      label: "Guard gate",
                      status: "blocked",
                      detail: "This run needs approval before protected actions."
                    }
                  ],
                  transcriptPreview: null,
                  events: [
                    {
                      id: "evt-1",
                      kind: "github.issue.opened",
                      at: "2026-06-14T00:00:00.000Z",
                      payload: {
                        githubIssueUrl: "https://github.com/example/repo/issues/77"
                      }
                    }
                  ]
                }
              ]
            })
          };
        }

        if (path === "/api/deploys") {
          return {
            ok: true,
            json: async () => ({
              deploys: [
                {
                  id: "dep-1",
                  serviceId: "svc-api",
                  status: "degraded",
                  version: "2026.06.14.1",
                  target: "prod-cluster",
                  timestamp: "2026-06-14T00:00:00.000Z",
                  judgment: {
                    decision: {
                      action: "hold",
                      confidence: 67,
                      reasoning: "Traffic is degraded but not severe enough for an automatic rollback.",
                      evidence: ["Error rate still below hard rollback threshold.", "Similar incident stabilized without rollback."],
                      similarIncidentId: "inc-memory-1"
                    },
                    metricSourceId: "prometheus",
                    metrics: {
                      timestamp: 1718323200000,
                      errorRate: 0.021,
                      latencyP95: 680,
                      requestsPerSec: 290
                    },
                    mode: "needs_review",
                    capturedAt: "2026-06-14T00:00:00.000Z"
                  }
                }
              ]
            })
          };
        }

        throw new Error(`Unexpected fetch path in test: ${path}`);
      })
    );

    window.history.replaceState({}, "", "/automation");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Automation Workspace" })).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Automation pipeline" })).toBeInTheDocument();
    expect(screen.getByText("Investigate checkout failures")).toBeInTheDocument();
    expect(screen.getAllByText("This run needs approval before protected actions.").length).toBeGreaterThan(0);
    expect(screen.getByText("No transcript has been captured yet.")).toBeInTheDocument();
    expect(screen.getByText("github issue opened")).toBeInTheDocument();
    expect(screen.getByText("Deploy detail")).toBeInTheDocument();
    expect(screen.getByText("Traffic is degraded but not severe enough for an automatic rollback."))
      .toBeInTheDocument();
  });

  it("renders the approvals workspace route with full evidence details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);

        if (path === "/api/approvals" && (!init || init.method === undefined)) {
          return {
            ok: true,
            json: async () => ({
              approvals: [
                {
                  runId: "run-1",
                  summary: "Review production rollback",
                  risk: { level: "high", score: 88 },
                  githubTarget: "https://github.com/example/repo/issues/77"
                }
              ]
            })
          };
        }

        if (path === "/api/approvals/run-1" && (!init || init.method === undefined)) {
          return {
            ok: true,
            json: async () => ({
              runId: "run-1",
              summary: "Review production rollback",
              risk: { level: "high", score: 88, reasons: ["prod deploy"] },
              githubTarget: "https://github.com/example/repo/issues/77",
              approvals: [],
              latestApproval: null,
              tests: [
                {
                  name: "npm test",
                  status: "passed",
                  detail: "All tests passed"
                }
              ],
              policyViolations: [
                {
                  id: "APPROVAL_REQUIRED",
                  severity: "high",
                  message: "This run needs approval before protected actions."
                }
              ],
              plan: {
                summary: "Rollback prod safely",
                steps: ["Verify health", "Revert revision"],
                criticalQuestions: ["Does this touch production?"],
                risk: { level: "high", score: 88, reasons: ["prod deploy"] }
              },
              diff: "diff --git a/src/service.ts b/src/service.ts",
              slackPreview: "SentinelOps approval request for run-1",
              requiresApproval: true
            })
          };
        }

        throw new Error(`Unexpected fetch path in test: ${path}`);
      })
    );

    window.history.replaceState({}, "", "/approvals");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Approvals Workspace" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText("Review production rollback").length).toBeGreaterThan(0);
      expect(screen.getByRole("heading", { name: "Approval evidence" })).toBeInTheDocument();
      expect(screen.getByText("Verify health")).toBeInTheDocument();
      expect(screen.getByText("SentinelOps approval request for run-1")).toBeInTheDocument();
    });
  });

  it("renders the integrations workspace route with runtime failures", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);

      if (path === "/api/runtime/live") {
        return { ok: false };
      }

      if (path === "/api/integrations/health") {
        return {
          ok: true,
          json: async () => ({
            health: [
              {
                id: "prometheus",
                status: "ready",
                detail: "Prometheus reachable.",
                checkedAt: 1718323200000
              }
            ]
          })
        };
      }

      if (path === "/api/services") {
        return {
          ok: true,
          json: async () => ({
            services: [
              {
                id: "svc-api",
                name: "API",
                environment: "prod",
                health: "degraded",
                linkedGithub: null
              }
            ]
          })
        };
      }

      throw new Error(`Unexpected fetch path in test: ${path}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    window.history.replaceState({}, "", "/integrations");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Integrations Workspace" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Test connections" })).toBeInTheDocument();
    expect(screen.getByText("Runtime snapshot unavailable: Request failed for /api/runtime/live."))
      .toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Test connections" }));

    await waitFor(() => {
      expect(screen.getByText("Prometheus reachable.")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/health", undefined);
  });

  it("renders the audit and memory workspace route with audit data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path === "/api/audit/log") {
          return {
            ok: true,
            json: async () => ({
              entries: [
                {
                  timestamp: 1718323200000,
                  actor: "dashboard",
                  action: "config",
                  detail: "operator-config save (ALLOWED)"
                }
              ]
            })
          };
        }

        if (path === "/api/audit/runs") {
          return {
            ok: true,
            json: async () => ({
              runs: [
                {
                  id: "run-123",
                  status: "approved",
                  updatedAt: "2026-06-14T00:10:00.000Z"
                }
              ]
            })
          };
        }

        if (path === "/api/memory/repo") {
          return {
            ok: true,
            json: async () => ({
              entries: [
                {
                  runId: "run-123",
                  summary: "Investigate linked GitHub target",
                  serviceId: "svc-api",
                  githubTarget: "https://github.com/example/repo/issues/77",
                  updatedAt: "2026-06-14T00:12:00.000Z",
                  tags: ["svc", "api", "repo"]
                }
              ]
            })
          };
        }

        if (path === "/api/memory/incidents") {
          return {
            ok: true,
            json: async () => ({
              incidents: [
                {
                  id: "inc-memory-1",
                  deployId: "dep-123",
                  summary: "Rollback fixed a latency regression",
                  errorRate: 0.12,
                  latencyP95: 1400,
                  agentAction: "rollback",
                  agentConfidence: 92,
                  humanOverride: null,
                  outcome: "Recovered"
                }
              ]
            })
          };
        }

        throw new Error(`Unexpected fetch path in test: ${path}`);
      })
    );

    window.history.replaceState({}, "", "/memory");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Audit and Memory Workspace" })).toBeInTheDocument();
    });

    expect(screen.getByText("operator-config save (ALLOWED)")).toBeInTheDocument();
    expect(screen.getByText("Investigate linked GitHub target")).toBeInTheDocument();
    expect(screen.getByText("Rollback fixed a latency regression")).toBeInTheDocument();
  });

  it("renders the service workspace route with live-versus-baseline metrics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path === "/api/services/svc-api/metrics") {
          return {
            ok: true,
            json: async () => ({
              service: {
                id: "svc-api",
                name: "Payments API",
                environment: "production",
                health: "degraded",
                linkedGithub: null
              },
              metricSourceId: "prometheus",
              baselineLookbackHours: 168,
              runtime: {
                serviceId: "svc-api",
                revision: "abc123def456",
                revisionDetail: "Deploy target kubernetes reports revision abc123def456.",
                deployState: "degraded"
              },
              current: {
                timestamp: 1718323200000,
                errorRate: 0.021,
                latencyP95: 680,
                requestsPerSec: 290
              },
              baseline: {
                timestamp: 1718319600000,
                errorRate: 0.005,
                latencyP95: 180,
                requestsPerSec: 340
              },
              delta: {
                errorRate: {
                  current: 0.021,
                  baseline: 0.005,
                  absolute: 0.016,
                  percent: 320,
                  direction: "up"
                },
                latencyP95: {
                  current: 680,
                  baseline: 180,
                  absolute: 500,
                  percent: 277.77,
                  direction: "up"
                },
                requestsPerSec: {
                  current: 290,
                  baseline: 340,
                  absolute: -50,
                  percent: -14.7,
                  direction: "down"
                }
              },
              series: [
                {
                  timestamp: 1718320500000,
                  errorRate: 0.009,
                  errorRateBaseline: 0.005,
                  latencyP95: 240,
                  latencyP95Baseline: 180,
                  requestsPerSec: 332,
                  requestsPerSecBaseline: 340
                },
                {
                  timestamp: 1718321400000,
                  errorRate: 0.013,
                  errorRateBaseline: 0.005,
                  latencyP95: 360,
                  latencyP95Baseline: 180,
                  requestsPerSec: 318,
                  requestsPerSecBaseline: 340
                },
                {
                  timestamp: 1718322300000,
                  errorRate: 0.018,
                  errorRateBaseline: 0.005,
                  latencyP95: 520,
                  latencyP95Baseline: 180,
                  requestsPerSec: 301,
                  requestsPerSecBaseline: 340
                },
                {
                  timestamp: 1718323200000,
                  errorRate: 0.021,
                  errorRateBaseline: 0.005,
                  latencyP95: 680,
                  latencyP95Baseline: 180,
                  requestsPerSec: 290,
                  requestsPerSecBaseline: 340
                }
              ],
              updatedAt: "2026-06-14T00:20:00.000Z"
            })
          };
        }

        throw new Error(`Unexpected fetch path in test: ${path}`);
      })
    );

    window.history.replaceState({}, "", "/services/svc-api");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Payments API workspace" })).toBeInTheDocument();
    });

    expect(screen.getByText("Above baseline (320.0%)")).toBeInTheDocument();
    expect(screen.getByText("Slower than baseline (277.8%)")).toBeInTheDocument();
    expect(screen.getByText("Deploy target kubernetes reports revision abc123def456."))
      .toBeInTheDocument();
    expect(screen.getByText(/rolling 168-hour baseline window/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Error trend trend chart" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Latency trend trend chart" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Traffic trend trend chart" })).toBeInTheDocument();
  });

  it("lets operators open an incident from the incident workspace backlog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path === "/api/incidents") {
          return {
            ok: true,
            json: async () => ({
              incidents: [
                {
                  id: "inc-1",
                  serviceId: "svc-api",
                  status: "investigating",
                  summary: "API error burst",
                  linkedGithub: {
                    issueUrl: "https://github.com/example/repo/issues/99",
                    prUrl: null
                  },
                  timestamp: "2026-06-14T00:00:00.000Z"
                }
              ]
            })
          };
        }

        if (path === "/api/incidents/inc-1") {
          return {
            ok: true,
            json: async () => ({
              incident: {
                id: "inc-1",
                serviceId: "svc-api",
                status: "investigating",
                summary: "API error burst",
                linkedGithub: {
                  issueUrl: "https://github.com/example/repo/issues/99",
                  prUrl: null
                },
                timestamp: "2026-06-14T00:00:00.000Z"
              }
            })
          };
        }

        throw new Error(`Unexpected fetch path in test: ${path}`);
      })
    );

    window.history.replaceState({}, "", "/incidents");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Incident Workspace" })).toBeInTheDocument();
      expect(screen.getByText("API error burst")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("heading", { name: "Operator event feed" }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("link", { name: /API error burst/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Incident detail" })).toBeInTheDocument();
      expect(screen.getByText("Status: investigating")).toBeInTheDocument();
    });
  });

  it("saves operator config and submits live onboarding from the settings workspace", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);

      if (path === "/api/operator-config" && (!init || init.method === undefined)) {
        return {
          ok: true,
          json: async () => ({
            config: {
              trackedRepos: ["example/repo"],
              slackChannel: "#ops-approvals",
              agentCommand: "codex",
              agentArgs: ["exec", "--json"],
              judgmentProvider: "canned",
              openai: { model: "gpt-4o-2024-08-06" },
              anthropic: { model: "claude-3-5-sonnet-latest" },
              aiCli: { command: "codex", args: ["exec", "--json"], healthArgs: ["--help"] },
              deployTarget: "simulator",
              kubernetes: {
                command: "kubectl",
                context: "",
                namespace: "default",
                deployment: "",
                service: "app"
              },
              docker: {
                command: "docker",
                composeFile: "",
                service: "app",
                container: ""
              },
              metricSource: "simulator",
              prometheus: {
                url: "",
                errorRateExpr: "",
                latencyP95Expr: "",
                requestsPerSecExpr: "",
                baselineErrorRateExpr: "",
                baselineLatencyP95Expr: "",
                baselineRequestsPerSecExpr: "",
                baselineLookbackHours: 168
              },
              grafana: {
                url: "",
                token: "",
                datasourceUid: "",
                dashboardUid: "",
                errorRateExpr: "",
                latencyP95Expr: "",
                requestsPerSecExpr: "",
                baselineErrorRateExpr: "",
                baselineLatencyP95Expr: "",
                baselineRequestsPerSecExpr: "",
                baselineLookbackHours: 168
              },
              enabled: true,
              updatedAt: "2026-06-14T00:00:00.000Z"
            }
          })
        };
      }

      if (path === "/api/policy-config" && (!init || init.method === undefined)) {
        return {
          ok: true,
          json: async () => ({
            policy: {
              thresholds: {
                medium: 35,
                high: 60,
                critical: 80
              },
              rollback: {
                minConfidence: 90,
                maxErrorRate: 0.25,
                maxLatencyP95: 2000,
                requireHumanApproval: false
              }
            }
          })
        };
      }

      if (path === "/api/operator-config" && init?.method === "POST") {
        expect(init.body).toBeTruthy();

        return {
          ok: true,
          json: async () => ({
            config: {
              trackedRepos: ["example/platform"],
              slackChannel: "#platform-ops",
              agentCommand: "codex",
              agentArgs: ["exec", "--json"],
              judgmentProvider: "openai",
              openai: { model: "gpt-4.1" },
              anthropic: { model: "claude-3-5-sonnet-latest" },
              aiCli: { command: "codex", args: ["exec", "--json"], healthArgs: ["--help"] },
              deployTarget: "kubernetes",
              kubernetes: {
                command: "kubectl",
                context: "prod-cluster",
                namespace: "payments",
                deployment: "svc-api",
                service: "svc-api"
              },
              docker: {
                command: "docker",
                composeFile: "",
                service: "app",
                container: ""
              },
              metricSource: "prometheus",
              prometheus: {
                url: "http://127.0.0.1:9090",
                errorRateExpr: "sum(rate(errors_total[5m]))",
                latencyP95Expr: "histogram_quantile(0.95, latency)",
                requestsPerSecExpr: "sum(rate(requests_total[5m]))",
                baselineErrorRateExpr: "",
                baselineLatencyP95Expr: "",
                baselineRequestsPerSecExpr: "",
                baselineLookbackHours: 168
              },
              grafana: {
                url: "",
                token: "",
                datasourceUid: "",
                dashboardUid: "",
                errorRateExpr: "",
                latencyP95Expr: "",
                requestsPerSecExpr: "",
                baselineErrorRateExpr: "",
                baselineLatencyP95Expr: "",
                baselineRequestsPerSecExpr: "",
                baselineLookbackHours: 168
              },
              enabled: true,
              updatedAt: "2026-06-14T00:05:00.000Z"
            }
          })
        };
      }

      if (path === "/api/policy-config" && init?.method === "POST") {
        expect(init.body).toBeTruthy();

        return {
          ok: true,
          json: async () => ({
            policy: {
              thresholds: {
                medium: 30,
                high: 55,
                critical: 80
              },
              rollback: {
                minConfidence: 92,
                maxErrorRate: 0.2,
                maxLatencyP95: 1800,
                requireHumanApproval: true
              }
            }
          })
        };
      }

      if (path === "/api/onboard/live") {
        expect(init?.method).toBe("POST");

        return {
          ok: true,
          json: async () => ({
            repo: "example/platform",
            slackChannel: "#live-demo",
            dashboardPath: "/automation",
            codexPrompt: "Use SentinelOps live mode",
            pluginFlow: ["Use GitHub plugin"],
            config: {
              trackedRepos: ["example/platform"],
              slackChannel: "#live-demo",
              agentCommand: "codex",
              agentArgs: ["exec", "--json"],
              judgmentProvider: "canned",
              openai: { model: "gpt-4o-2024-08-06" },
              anthropic: { model: "claude-3-5-sonnet-latest" },
              aiCli: { command: "codex", args: ["exec", "--json"], healthArgs: ["--help"] },
              deployTarget: "simulator",
              kubernetes: {
                command: "kubectl",
                context: "",
                namespace: "default",
                deployment: "",
                service: "app"
              },
              docker: {
                command: "docker",
                composeFile: "",
                service: "app",
                container: ""
              },
              metricSource: "simulator",
              prometheus: {
                url: "",
                errorRateExpr: "",
                latencyP95Expr: "",
                requestsPerSecExpr: "",
                baselineErrorRateExpr: "",
                baselineLatencyP95Expr: "",
                baselineRequestsPerSecExpr: "",
                baselineLookbackHours: 168
              },
              grafana: {
                url: "",
                token: "",
                datasourceUid: "",
                dashboardUid: "",
                errorRateExpr: "",
                latencyP95Expr: "",
                requestsPerSecExpr: "",
                baselineErrorRateExpr: "",
                baselineLatencyP95Expr: "",
                baselineRequestsPerSecExpr: "",
                baselineLookbackHours: 168
              },
              enabled: true,
              updatedAt: "2026-06-14T00:00:00.000Z"
            }
          })
        };
      }

      if (path === "/api/integrations/health/prometheus") {
        return {
          ok: true,
          json: async () => ({
            health: {
              id: "prometheus",
              status: "ready",
              detail: "Prometheus reachable.",
              checkedAt: 1718323200000
            }
          })
        };
      }

      throw new Error(`Unexpected fetch path in test: ${path}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    window.history.replaceState({}, "", "/settings");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Settings Workspace" })).toBeInTheDocument();
    });

    const controlPlaneForm = screen.getByRole("heading", { name: "Operator control plane" }).closest("form");
    expect(controlPlaneForm).not.toBeNull();
    const controlPlane = within(controlPlaneForm as HTMLFormElement);

    await userEvent.clear(controlPlane.getByLabelText("Tracked repositories"));
    await userEvent.type(controlPlane.getByLabelText("Tracked repositories"), "example/platform");
    await userEvent.clear(controlPlane.getByLabelText("Slack approvals channel"));
    await userEvent.type(controlPlane.getByLabelText("Slack approvals channel"), "#platform-ops");
    await userEvent.selectOptions(controlPlane.getByLabelText("Provider"), "openai");
    await userEvent.clear(controlPlane.getByLabelText("OpenAI model"));
    await userEvent.type(controlPlane.getByLabelText("OpenAI model"), "gpt-4.1");
    await userEvent.selectOptions(controlPlane.getByLabelText("Source"), "prometheus");
    await userEvent.clear(controlPlane.getByLabelText("Prometheus URL"));
    await userEvent.type(controlPlane.getByLabelText("Prometheus URL"), "http://127.0.0.1:9090");
    await userEvent.selectOptions(controlPlane.getByLabelText("Target"), "kubernetes");
    await userEvent.clear(controlPlane.getByLabelText("Context"));
    await userEvent.type(controlPlane.getByLabelText("Context"), "prod-cluster");
    await userEvent.click(controlPlane.getByRole("button", { name: "Save operator config" }));

    await waitFor(() => {
      expect(screen.getByText("Saved openai settings for example/platform.")).toBeInTheDocument();
    });

    const guardrailForm = screen.getByRole("heading", { name: "Guardrails and thresholds" }).closest("form");
    expect(guardrailForm).not.toBeNull();
    const guardrails = within(guardrailForm as HTMLFormElement);

    await userEvent.clear(guardrails.getByLabelText("Medium threshold"));
    await userEvent.type(guardrails.getByLabelText("Medium threshold"), "30");
    await userEvent.clear(guardrails.getByLabelText("High threshold"));
    await userEvent.type(guardrails.getByLabelText("High threshold"), "55");
    await userEvent.clear(guardrails.getByLabelText("Minimum confidence"));
    await userEvent.type(guardrails.getByLabelText("Minimum confidence"), "92");
    await userEvent.clear(guardrails.getByLabelText("Max error rate"));
    await userEvent.type(guardrails.getByLabelText("Max error rate"), "0.2");
    await userEvent.clear(guardrails.getByLabelText("Max latency p95 (ms)"));
    await userEvent.type(guardrails.getByLabelText("Max latency p95 (ms)"), "1800");
    await userEvent.click(guardrails.getByLabelText("Require human approval"));
    await userEvent.click(guardrails.getByRole("button", { name: "Save guardrails" }));

    await waitFor(() => {
      expect(screen.getByText("Saved guardrails. Medium/high/critical risk now start at 30/55/80."))
        .toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Test metric source" }));

    await waitFor(() => {
      expect(screen.getByText("Prometheus reachable.")).toBeInTheDocument();
    });

    const onboardingForm = screen.getByRole("heading", { name: "Live onboarding" }).closest("form");
    expect(onboardingForm).not.toBeNull();
    const onboarding = within(onboardingForm as HTMLFormElement);

    await userEvent.clear(onboarding.getByLabelText("GitHub repo"));
    await userEvent.type(onboarding.getByLabelText("GitHub repo"), "https://github.com/example/platform");
    await userEvent.clear(onboarding.getByLabelText("Slack channel"));
    await userEvent.type(onboarding.getByLabelText("Slack channel"), "#live-demo");
    await userEvent.click(onboarding.getByRole("button", { name: "Start live mode" }));

    await waitFor(() => {
      expect(screen.getByText("Tracking example/platform and posting approvals to #live-demo."))
        .toBeInTheDocument();
    });
  }, 15000);
});
