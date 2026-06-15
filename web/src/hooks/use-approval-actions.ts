import { useState } from "react";
import { submitApprovalAction } from "../lib/api";

export function useApprovalActions(onSuccess?: (runId: string) => void): {
  pendingRunId: string | null;
  error: Error | null;
  submit: (runId: string, action: "approve" | "hold" | "reject") => Promise<void>;
} {
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  async function submit(runId: string, action: "approve" | "hold" | "reject"): Promise<void> {
    setPendingRunId(runId);
    setError(null);

    try {
      await submitApprovalAction(runId, action);
      onSuccess?.(runId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error("Approval action failed."));
    } finally {
      setPendingRunId(null);
    }
  }

  return {
    pendingRunId,
    error,
    submit
  };
}
