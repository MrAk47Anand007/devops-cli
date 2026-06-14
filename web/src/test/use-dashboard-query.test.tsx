import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDashboardQuery } from "../hooks/use-dashboard-query";

describe("useDashboardQuery", () => {
  it("does not refetch only because an inline query callback gets recreated", async () => {
    const query = vi.fn(async (token: string) => ({ token }));

    const { result, rerender } = renderHook(
      ({ token }) => useDashboardQuery(() => query(token), [token]),
      {
        initialProps: { token: "alpha" }
      }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ token: "alpha" });
    });

    expect(query).toHaveBeenCalledTimes(1);

    rerender({ token: "alpha" });

    await waitFor(() => {
      expect(result.current.data).toEqual({ token: "alpha" });
    });

    expect(query).toHaveBeenCalledTimes(1);

    rerender({ token: "beta" });

    await waitFor(() => {
      expect(result.current.data).toEqual({ token: "beta" });
    });

    expect(query).toHaveBeenCalledTimes(2);
  });
});
