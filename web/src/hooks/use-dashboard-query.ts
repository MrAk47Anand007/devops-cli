import { useEffect, useRef, useState, type DependencyList } from "react";

interface DashboardQueryState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export function useDashboardQuery<T>(
  queryFn: () => Promise<T>,
  deps: DependencyList = []
): DashboardQueryState<T> {
  const queryRef = useRef(queryFn);
  const [state, setState] = useState<DashboardQueryState<T>>({
    data: null,
    error: null,
    loading: true
  });

  queryRef.current = queryFn;

  useEffect(() => {
    let cancelled = false;

    setState({
      data: null,
      error: null,
      loading: true
    });

    void queryRef.current()
      .then((data) => {
        if (!cancelled) {
          setState({
            data,
            error: null,
            loading: false
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            error: error instanceof Error ? error : new Error("Query failed."),
            loading: false
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return state;
}
