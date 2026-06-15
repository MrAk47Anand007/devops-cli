import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApprovalsPage } from "../routes/approvals-page";

describe("approvals page", () => {
  it("renders a pending approval and exposes approve, hold, and reject actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);

        if (path === "/api/approvals" && (!init || init.method === undefined)) {
          return {
            ok: true,
            json: async () => ({
              approvals: [
                {
                  runId: "run-1",
                  summary: "Rollback risk",
                  risk: { level: "high", score: 82 },
                  githubTarget: "https://github.com/example/repo/issues/77"
                }
              ]
            })
          };
        }

        if (path === "/api/approvals/run-1" && (!init || init.method === undefined)) {
          return {
            ok: true,
            json: async () => ({
              runId: "run-1",
              summary: "Rollback risk",
              risk: { level: "high", score: 82, reasons: ["deploy regression"] },
              githubTarget: "https://github.com/example/repo/issues/77",
              approvals: [],
              latestApproval: null,
              tests: [
                {
                  name: "npm test",
                  status: "passed",
                  detail: "All tests passed"
                }
              ],
              policyViolations: [
                {
                  id: "APPROVAL_REQUIRED",
                  severity: "high",
                  message: "This run needs approval before protected actions."
                }
              ],
              plan: {
                summary: "Prepare rollback path",
                steps: ["Inspect deploy", "Verify metrics"],
                criticalQuestions: ["Does this change touch production?"],
                risk: { level: "high", score: 82, reasons: ["deploy regression"] }
              },
              diff: "diff --git a/src/app.ts b/src/app.ts",
              slackPreview: "SentinelOps approval request for run-1",
              requiresApproval: true
            })
          };
        }

        if (path === "/api/approvals/run-1" && init?.method === "POST") {
          return {
            ok: true,
            json: async () => ({})
          };
        }

        throw new Error(`Unexpected fetch path in test: ${path}`);
      })
    );

    render(<ApprovalsPage />);

    expect(await screen.findByText("Rollback risk")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Approval evidence" })).toBeInTheDocument();
    expect(screen.getByText("Prepare rollback path")).toBeInTheDocument();
    expect(screen.getByText("SentinelOps approval request for run-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
  });
});
