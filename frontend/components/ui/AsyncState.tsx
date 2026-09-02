"use client";

import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * Loading / empty / error / retry — one consistent primitive.
 *
 * The rule this enforces: a failed request must NEVER render as an empty state.
 * "No incidents" and "we couldn't load incidents" mean completely different
 * things to someone evaluating whether their system is healthy, and conflating
 * them is how monitoring tools lose trust.
 */

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-8 py-10"
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <p className="text-small text-tertiary">{label}</p>
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="motion-safe:animate-spin"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.75" />
      <path
        d="M14.25 8A6.25 6.25 0 0 0 8 1.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="text-accent"
      />
    </svg>
  );
}

/**
 * Error state. Explains what failed in one sentence, offers a retry, and never
 * shows a stack trace. Auth failures get a sign-in route instead of a retry,
 * because retrying an expired session cannot succeed.
 */
export function ErrorState({
  error,
  onRetry,
  what,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  /** What we were trying to load, e.g. "incidents". */
  what?: string;
  compact?: boolean;
}) {
  const api = error instanceof ApiError ? error : null;
  const kind = api?.kind ?? "server";
  const title = api?.title ?? "Something went wrong";

  // A 5xx reaching the browser through the dev proxy usually means the API
  // itself is unavailable, so both cases get the same actionable hint.
  const apiUnreachable =
    kind === "network" || (kind === "server" && (api?.status ?? 0) >= 500);

  const hint = apiUnreachable
    ? "The PULSE API did not respond. Check that the backend is running, then retry."
    : kind === "auth"
      ? "Sign in again to continue."
      : api?.message
        ? api.message
        : what
          ? `PULSE could not load ${what}.`
          : "Please try again.";

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${
        compact ? "px-4 py-6" : "h-full min-h-[160px] px-8 py-10"
      }`}
      role="alert"
    >
      <span className="grid h-8 w-8 place-items-center rounded-full border border-failed-border bg-failed-bg text-failed">
        <Icon name="warning" size={16} />
      </span>
      <p className="pt-1 text-body font-medium text-primary">
        {apiUnreachable ? "Cannot reach the PULSE API" : title}
      </p>
      <p className="max-w-[42ch] text-small text-tertiary">{hint}</p>

      {apiUnreachable && (
        <code className="mt-1 rounded border border-border bg-subtle px-2 py-1 font-mono text-caption text-secondary">
          python -m uvicorn backend.app.main:app --port 8000
        </code>
      )}

      <div className="flex gap-2 pt-3">
        {kind === "auth" ? (
          <a href="/login">
            <Button size="sm" variant="primary">
              Sign in
            </Button>
          </a>
        ) : (
          onRetry && (
            <Button size="sm" onClick={onRetry} icon={<Icon name="reset" size={13} />}>
              Retry
            </Button>
          )
        )}
      </div>
    </div>
  );
}

/**
 * A non-blocking failure banner.
 *
 * Used when we already have content on screen and a refresh failed — replacing
 * good data with a full-page error would destroy context the user is mid-way
 * through reading.
 */
export function ErrorBanner({
  error,
  onRetry,
  onDismiss,
}: {
  error: unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const api = error instanceof ApiError ? error : null;
  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 border-b border-failed-border bg-failed-bg px-4 py-2"
    >
      <Icon name="warning" size={14} className="text-failed" />
      <p className="min-w-0 flex-1 truncate text-small text-primary">
        <span className="font-medium">{api?.title ?? "Something went wrong"}</span>
        {api?.message && <span className="text-secondary"> — {api.message}</span>}
      </p>
      {onRetry && (
        <Button size="xs" variant="ghost" onClick={onRetry}>
          Retry
        </Button>
      )}
      {onDismiss && (
        <Button size="xs" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="close" size={13} />
        </Button>
      )}
    </div>
  );
}

/**
 * Which state an async resource should render.
 *
 * Extracted as a pure function so the precedence rule is unit-testable: an
 * error ALWAYS beats empty. A failed request that happens to return no rows
 * must never be presented as "there is nothing here" — that is how a
 * monitoring tool quietly tells someone their system is fine when it is not.
 */
export type AsyncPhase = "error" | "loading" | "empty" | "content";

export function resolveAsyncState(input: {
  loading: boolean;
  hasError: boolean;
  hasData: boolean;
  isEmpty: boolean;
}): AsyncPhase {
  // Error first, and specifically when we have nothing good to show.
  if (input.hasError && !input.hasData) return "error";
  if (!input.hasData) return "loading";
  if (input.isEmpty) return input.hasError ? "error" : "empty";
  return "content";
}

/**
 * Renders the correct state for an async resource.
 */
export function Async<T>({
  loading,
  error,
  data,
  onRetry,
  what,
  isEmpty,
  empty,
  children,
}: {
  loading: boolean;
  error: unknown;
  data: T | null | undefined;
  onRetry?: () => void;
  what?: string;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const phase = resolveAsyncState({
    loading,
    hasError: !!error,
    hasData: data !== null && data !== undefined,
    isEmpty: data ? (isEmpty?.(data) ?? false) : false,
  });

  if (phase === "error") return <ErrorState error={error} onRetry={onRetry} what={what} />;
  if (phase === "loading")
    return <LoadingState label={what ? `Loading ${what}…` : undefined} />;
  if (phase === "empty") return <>{empty}</>;
  return <>{children(data as T)}</>;
}
