import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

describe("overview page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads services from the dashboard API", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const path = String(input);

        if (path === "/api/services") {
          return {
            ok: true,
            json: async () => ({
              services: [
                {
                  id: "svc-api",
                  name: "API",
                  environment: "production",
                  health: "degraded",
                  linkedGithub: null
                }
              ]
            })
          };
        }

        if (path === "/api/runtime/live") {
          return {
            ok: true,
            json: async () => ({
              config: null,
              health: [
                {
                  id: "slack",
                  status: "ready",
                  detail: "Ready",
                  checkedAt: 1718323200000
                }
              ],
              services: [
                {
                  serviceId: "svc-api",
                  revision: "abc1234",
                  revisionDetail: "deploy target reports abc1234",
                  deployState: "running"
                }
              ],
              updatedAt: "2026-06-14T00:00:00.000Z"
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
                  timestamp: "2026-06-14T00:00:00.000Z"
                }
              ]
            })
          };
        }

        if (path === "/api/automation/jobs") {
          return {
            ok: true,
            json: async () => ({
              jobs: [
                {
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
                }
              ]
            })
          };
        }

        throw new Error(`Unexpected fetch path in test: ${path}`);
      }
    );

    vi.stubGlobal("fetch", fetchMock);

    window.history.replaceState({}, "", "/");
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: "Runtime health" }).length).toBeGreaterThan(0);
      expect(screen.getByRole("heading", { name: "Deploy timeline" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Automation queue" })).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        "/api/services",
        "/api/runtime/live",
        "/api/deploys",
        "/api/automation/jobs"
      ])
    );
    expect(screen.getByText("API")).toBeInTheDocument();
    expect(screen.getAllByText("svc-api").length).toBeGreaterThan(0);
    expect(screen.getAllByText("production").length).toBeGreaterThan(0);
    expect(screen.getAllByText("degraded").length).toBeGreaterThan(0);
    expect(screen.getByText("2026.06.14.1")).toBeInTheDocument();
    expect(screen.getByText("awaiting approval")).toBeInTheDocument();
  });

  it("shows a service loading failure from the dashboard API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/services") {
          return { ok: false };
        }
        if (path === "/api/runtime/live") {
          return {
            ok: true,
            json: async () => ({
              config: null,
              health: [],
              services: [],
              updatedAt: "2026-06-14T00:00:00.000Z"
            })
          };
        }
        if (path === "/api/deploys") {
          return { ok: true, json: async () => ({ deploys: [] }) };
        }
        if (path === "/api/automation/jobs") {
          return { ok: true, json: async () => ({ jobs: [] }) };
        }
        throw new Error(`Unexpected fetch path in test: ${path}`);
      })
    );

    window.history.replaceState({}, "", "/");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Request failed for /api/services.");
    });
  });

  it("shows an invalid services payload error from the dashboard API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/services") {
          return {
            ok: true,
            json: async () => ({
              services: [
                {
                  id: 123
                }
              ]
            })
          };
        }
        if (path === "/api/runtime/live") {
          return {
            ok: true,
            json: async () => ({
              config: null,
              health: [],
              services: [],
              updatedAt: "2026-06-14T00:00:00.000Z"
            })
          };
        }
        if (path === "/api/deploys") {
          return { ok: true, json: async () => ({ deploys: [] }) };
        }
        if (path === "/api/automation/jobs") {
          return { ok: true, json: async () => ({ jobs: [] }) };
        }
        throw new Error(`Unexpected fetch path in test: ${path}`);
      })
    );

    window.history.replaceState({}, "", "/");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Invalid services response.")).toBeInTheDocument();
    });
  });
});
