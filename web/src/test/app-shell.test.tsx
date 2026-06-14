import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "../App";

describe("app shell", () => {
  it("renders the dashboard shell landmarks and placeholder navigation", () => {
    render(<App />);

    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const main = screen.getByRole("main");
    const liveStatus = within(main).getByRole("region", { name: "Live status" });

    expect(navigation).toBeInTheDocument();
    expect(main).toBeInTheDocument();
    expect(liveStatus).toBeInTheDocument();
    expect(within(navigation).getByText("Overview")).toBeInTheDocument();
    expect(within(navigation).getByText("Automation")).toBeInTheDocument();
    expect(within(navigation).getByText("Approvals")).toBeInTheDocument();
    expect(within(navigation).getByText("Integrations")).toBeInTheDocument();
    expect(within(navigation).queryAllByRole("link")).toHaveLength(0);
    expect(within(liveStatus).getAllByRole("article")).toHaveLength(3);
    expect(within(liveStatus).getByRole("heading", { name: "Runtime health" })).toBeInTheDocument();
    expect(within(liveStatus).getByRole("heading", { name: "Approval load" })).toBeInTheDocument();
    expect(within(liveStatus).getByRole("heading", { name: "Automation" })).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: "Approvals" })).toBeInTheDocument();
  });
});
