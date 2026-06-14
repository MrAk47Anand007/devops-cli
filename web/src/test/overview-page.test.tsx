import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

describe("overview page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads services from the dashboard API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
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
      }))
    );

    window.history.replaceState({}, "", "/");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("svc-api")).toBeInTheDocument();
    });

    expect(screen.getByText("API")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByText("degraded")).toBeInTheDocument();
  });

  it("shows a service loading failure from the dashboard API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false
      }))
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
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          services: [
            {
              id: 123
            }
          ]
        })
      }))
    );

    window.history.replaceState({}, "", "/");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Invalid services response.")).toBeInTheDocument();
    });
  });
});
