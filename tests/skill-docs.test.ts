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

  it("publishes the dedicated SentinelOps workflow skills", () => {
    const expectedSkills = [
      [".agents/skills/sentinelops-core/SKILL.md", "Never push, update PR branch, merge, close issue, deploy, rollback, or mark an incident resolved until `sentinelops push gate` succeeds."],
      [".agents/skills/sentinelops-dashboard/SKILL.md", "dashboard ingest --service"],
      [".agents/skills/sentinelops-github/SKILL.md", "github result-package --run"],
      [".agents/skills/sentinelops-slack-approval/SKILL.md", "approval package --run"],
      [".agents/skills/sentinelops-troubleshooting/SKILL.md", "plan create --context"],
      [".agents/skills/sentinelops-testing/SKILL.md", "test generate-plan --target"],
      [".agents/skills/sentinelops-security/SKILL.md", "policy check --plan latest"],
      [".agents/skills/sentinelops-pipeline-detection/SKILL.md", "repo understand --context"]
    ] as const;

    for (const [path, marker] of expectedSkills) {
      expect(existsSync(path)).toBe(true);
      const skill = readFileSync(path, "utf8");
      expect(skill).toContain(marker);
    }
  });

  it("documents the SentinelOps skill suite in the README", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("sentinelops-core");
    expect(readme).toContain("sentinelops-dashboard");
    expect(readme).toContain("sentinelops-slack-approval");
  });

  it("encodes plugin-first workflow rules in the SentinelOps skills", () => {
    const githubSkill = readFileSync(".agents/skills/sentinelops-github/SKILL.md", "utf8");
    expect(githubSkill).toContain("Use the GitHub plugin for live GitHub reads and writes when available.");

    const slackSkill = readFileSync(".agents/skills/sentinelops-slack-approval/SKILL.md", "utf8");
    expect(slackSkill).toContain("Slack is plugin-first, not CLI-implemented.");

    const dashboardSkill = readFileSync(".agents/skills/sentinelops-dashboard/SKILL.md", "utf8");
    expect(dashboardSkill).toContain("Ingest dashboard context for the affected service.");

    const coreSkill = readFileSync(".agents/skills/sentinelops-core/SKILL.md", "utf8");
    expect(coreSkill).toContain("Collect tests and approval evidence before protected mutations.");
    expect(coreSkill).toContain("automation seed-issue --target");
  });

  it("documents the intended SentinelOps workflow ordering in skills", () => {
    const dashboardSkill = readFileSync(".agents/skills/sentinelops-dashboard/SKILL.md", "utf8");
    expect(dashboardSkill).toContain("Read the normalized context before planning.");

    const troubleshootingSkill = readFileSync(".agents/skills/sentinelops-troubleshooting/SKILL.md", "utf8");
    expect(troubleshootingSkill).toContain("Create a plan from context or target.");

    const testingSkill = readFileSync(".agents/skills/sentinelops-testing/SKILL.md", "utf8");
    expect(testingSkill).toContain("High-risk changes require passing test evidence before push.");
  });
});
