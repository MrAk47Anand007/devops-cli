import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "../App";

describe("app shell", () => {
  it("renders the dashboard shell landmarks and accessible navigation", () => {
    window.history.replaceState({}, "", "/");
    render(<App />);

    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const main = screen.getByRole("main");
    const liveStatus = within(main).getByRole("region", { name: "Live status" });
    const statusAnnouncer = within(main).getByRole("status", { name: "Live status updates" });

    expect(navigation).toBeInTheDocument();
    expect(main).toBeInTheDocument();
    expect(liveStatus).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Automation" })).toHaveAttribute(
      "href",
      "/automation"
    );
    expect(within(navigation).getByRole("link", { name: "Approvals" })).toHaveAttribute(
      "href",
      "/approvals"
    );
    expect(within(navigation).getByRole("link", { name: "Integrations" })).toHaveAttribute(
      "href",
      "/integrations"
    );
    expect(within(navigation).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(statusAnnouncer).toHaveTextContent("Runtime health 98.6%.");
    expect(statusAnnouncer).toHaveTextContent("Approval load 3 pending.");
    expect(statusAnnouncer).toHaveTextContent("Automation 14 active.");
    expect(within(liveStatus).getAllByRole("article")).toHaveLength(3);
    expect(within(liveStatus).getByRole("heading", { name: "Runtime health" })).toBeInTheDocument();
    expect(within(liveStatus).getByRole("heading", { name: "Approval load" })).toBeInTheDocument();
    expect(within(liveStatus).getByRole("heading", { name: "Automation" })).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: "Approvals" })).toBeInTheDocument();
  });

  it("renders route-specific workspace content for each sidebar destination", () => {
    const routes = [
      { path: "/", heading: "SentinelOps Control Center", current: "Overview" },
      { path: "/automation", heading: "Automation Workspace", current: "Automation" },
      { path: "/approvals", heading: "Approvals Workspace", current: "Approvals" },
      { path: "/integrations", heading: "Integrations Workspace", current: "Integrations" }
    ];

    for (const route of routes) {
      window.history.replaceState({}, "", route.path);
      const view = render(<App />);
      const rendered = within(view.container);

      expect(rendered.getByRole("heading", { name: route.heading })).toBeInTheDocument();
      expect(
        rendered.getByRole("navigation", { name: "Primary navigation" }).querySelector(
          '[aria-current="page"]'
        )
      ).toHaveTextContent(route.current);

      view.unmount();
    }
  });
});
