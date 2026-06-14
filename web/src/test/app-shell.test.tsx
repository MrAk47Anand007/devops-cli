import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "../App";

describe("app shell", () => {
  it("renders the dashboard shell landmarks and placeholder navigation", () => {
    render(<App />);

    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const main = screen.getByRole("main");

    expect(navigation).toBeInTheDocument();
    expect(main).toBeInTheDocument();
    expect(within(navigation).getByText("Overview")).toBeInTheDocument();
    expect(within(navigation).getByText("Automation")).toBeInTheDocument();
    expect(within(navigation).getByText("Approvals")).toBeInTheDocument();
    expect(within(navigation).getByText("Integrations")).toBeInTheDocument();
    expect(within(navigation).queryAllByRole("link")).toHaveLength(0);
    expect(within(main).getByText("Runtime health")).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: "Approvals" })).toBeInTheDocument();
  });
});
