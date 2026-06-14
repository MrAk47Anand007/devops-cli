import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "../App";

describe("app shell", () => {
  it("renders the dashboard shell landmarks and accessible navigation", () => {
    render(<App />);

    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const main = screen.getByRole("main");
    const liveStatus = within(main).getByRole("region", { name: "Live status" });

    expect(navigation).toBeInTheDocument();
    expect(main).toBeInTheDocument();
    expect(liveStatus).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Overview Live" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(within(navigation).getByRole("link", { name: "Automation Queue" })).toHaveAttribute(
      "href",
      "/automation"
    );
    expect(within(navigation).getByRole("link", { name: "Approvals Queue" })).toHaveAttribute(
      "href",
      "/approvals"
    );
    expect(within(navigation).getByRole("link", { name: "Integrations Queue" })).toHaveAttribute(
      "href",
      "/integrations"
    );
    expect(within(navigation).getByRole("link", { name: "Overview Live" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(liveStatus).toHaveAttribute("aria-live", "polite");
    expect(liveStatus).toHaveAttribute("aria-atomic", "false");
    expect(liveStatus).toHaveAttribute("aria-relevant", "text");
    expect(within(liveStatus).getAllByRole("article")).toHaveLength(3);
    expect(within(liveStatus).getByRole("heading", { name: "Runtime health" })).toBeInTheDocument();
    expect(within(liveStatus).getByRole("heading", { name: "Approval load" })).toBeInTheDocument();
    expect(within(liveStatus).getByRole("heading", { name: "Automation" })).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: "Approvals" })).toBeInTheDocument();
  });
});
