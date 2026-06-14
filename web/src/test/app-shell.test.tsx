import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";

describe("app shell", () => {
  it("renders the SentinelOps workspace frame", () => {
    render(<App />);
    expect(screen.getByText("SentinelOps Control Center")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });
});
