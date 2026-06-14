import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";

describe("app shell", () => {
  it("renders navigation and live status regions", () => {
    render(<App />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByText("Runtime health")).toBeInTheDocument();
    expect(screen.getByText("Approvals")).toBeInTheDocument();
  });
});
