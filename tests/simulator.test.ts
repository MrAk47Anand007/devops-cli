import { describe, expect, it } from "vitest";
import { generateMetrics } from "../src/simulator.js";

describe("generateMetrics", () => {
  it("healthy scenario stays near baseline", () => {
    const metrics = generateMetrics("healthy");
    expect(metrics.errorRate).toBeLessThan(0.01);
    expect(metrics.latencyP95).toBeLessThan(200);
  });

  it("crash scenario spikes error rate well above baseline", () => {
    const metrics = generateMetrics("crash");
    expect(metrics.errorRate).toBeGreaterThan(0.1);
    expect(metrics.latencyP95).toBeGreaterThan(500);
  });

  it("degraded scenario is between healthy and crash", () => {
    const metrics = generateMetrics("degraded");
    expect(metrics.errorRate).toBeGreaterThan(0.01);
    expect(metrics.errorRate).toBeLessThan(0.1);
  });
});
