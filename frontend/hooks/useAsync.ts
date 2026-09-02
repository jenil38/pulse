"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch-with-states hook.
 *
 * Deliberately keeps the previous `data` while refetching, so a background
 * refresh that fails leaves the user's current view intact and surfaces the
 * problem as a banner rather than wiping the screen.
 */
export interface AsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
  /** True when refreshing while data is already on screen. */
  refreshing: boolean;
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
  dismissError: () => void;
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean } = {}
): AsyncResult<T> {
  const enabled = options.enabled ?? true;
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);

  // Guards against a slow earlier request overwriting a newer result.
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    fn()
      .then((result) => {
        if (!mounted.current || id !== requestId.current) return;
        setDataState(result);
        setError(null);
      })
      .catch((e) => {
        if (!mounted.current || id !== requestId.current) return;
        setError(e);
      })
      .finally(() => {
        if (!mounted.current || id !== requestId.current) return;
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const setData = useCallback(
    (updater: T | ((prev: T | null) => T | null)) =>
      setDataState((prev) =>
        typeof updater === "function" ? (updater as (p: T | null) => T | null)(prev) : updater
      ),
    []
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    data,
    loading,
    error,
    refreshing: loading && data !== null,
    reload,
    setData,
    dismissError,
  };
}
