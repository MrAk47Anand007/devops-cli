import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("portable skill docs", () => {
  it("publishes a sentinelops portable skill with cli guidance", () => {
    const path = ".agents/skills/sentinelops-portable/SKILL.md";
    expect(existsSync(path)).toBe(true);
    const skill = readFileSync(path, "utf8");
    expect(skill).toContain("sentinelops judge --scenario degraded --json");
  });

  it("documents the portable cli in the README", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("sentinelops judge --scenario degraded --json");
    expect(readme).toContain("npm run cli --");
  });
});
