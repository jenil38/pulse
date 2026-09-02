"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api, ApiError, type DemoAccount } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync } from "@/hooks/useAsync";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/AsyncState";

/**
 * Sign in — demo authentication.
 *
 * Honest by construction: the demo accounts and the password are printed on the
 * page, and the page says in plain language that this is demo auth. Credentials
 * are still verified server-side against a signed, expiring token, so the flow
 * is real even though the user store is fixed.
 */
function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const signIn = useAuth((s) => s.signIn);
  const user = useAuth((s) => s.user);
  const hydrate = useAuth((s) => s.hydrate);

  const [email, setEmail] = useState("analyst@pulse.demo");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const accounts = useAsync<DemoAccount[]>(() => api.demoAccounts(), []);

  const next = params.get("next") || "/control-room";

  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => {
    if (user) router.replace(next);
  }, [user, router, next]);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const showEmailError = touched && !emailValid;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!emailValid || !password || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      signIn(res, remember);
      router.replace(next);
    } catch (err) {
      setError(
        err instanceof ApiError && err.kind === "auth"
          ? "Incorrect email or password."
          : err instanceof ApiError && err.kind === "network"
            ? "Cannot reach the PULSE API. Is the backend running?"
            : "Sign in failed. Please try again."
      );
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  /** One click fills the form so a reviewer never has to type credentials. */
  const useAccount = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword("pulse-demo");
    setError(null);
    setTouched(false);
    passwordRef.current?.focus();
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-2.5 px-6">
        <span className="grid h-[22px] w-[22px] place-items-center rounded-sm bg-primary text-[11px] font-semibold text-canvas">
          P
        </span>
        <span className="text-body font-medium text-primary">PULSE</span>
        <span className="hidden text-caption text-tertiary sm:inline">
          Data Resilience Digital Twin
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-[880px] gap-10 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:gap-16">
          {/* Sign-in form */}
          <section className="min-w-0">
            <h1 className="text-title-lg text-primary">Sign in</h1>
            <p className="pt-1.5 text-small text-tertiary">
              Use a demo account to explore the Control Room.
            </p>

            <form onSubmit={submit} className="pt-6" noValidate>
              <label htmlFor="email" className="block text-caption font-medium text-secondary">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={showEmailError}
                aria-describedby={showEmailError ? "email-error" : undefined}
                className={`mt-1.5 h-control-lg w-full rounded border bg-surface px-2.5 text-small text-primary transition-colors duration-instant focus:outline-none ${
                  showEmailError
                    ? "border-failed focus:border-failed"
                    : "border-border hover:border-border-strong focus:border-accent"
                }`}
              />
              {showEmailError && (
                <p id="email-error" className="pt-1 text-caption text-failed">
                  Enter a valid email address.
                </p>
              )}

              <label
                htmlFor="password"
                className="mt-4 block text-caption font-medium text-secondary"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="password-hint"
                  className="h-control-lg w-full rounded border border-border bg-surface pl-2.5 pr-16 text-small text-primary transition-colors duration-instant hover:border-border-strong focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 h-7 -translate-y-1/2 rounded px-2 text-caption text-tertiary transition-colors duration-instant hover:bg-subtle hover:text-primary"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p id="password-hint" className="pt-1 text-caption text-quaternary">
                Demo password:{" "}
                <code className="rounded-xs bg-subtle px-1 font-mono text-primary">
                  pulse-demo
                </code>
              </p>

              <label className="mt-4 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                <span className="text-small text-secondary">Keep me signed in</span>
              </label>

              {error && (
                <p
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded border border-failed-border bg-failed-bg px-2.5 py-2 text-small text-primary"
                >
                  <Icon name="warning" size={14} className="mt-[3px] shrink-0 text-failed" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                full
                className="mt-5"
                disabled={submitting || !password}
              >
                {submitting ? (
                  <>
                    <Spinner size={14} /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </section>

          {/* Demo accounts + honesty note */}
          <section className="min-w-0">
            <div className="rounded-lg border border-border bg-surface">
              <div className="flex h-10 items-center justify-between border-b border-border px-4">
                <h2 className="text-small font-medium text-primary">Demo accounts</h2>
                <span className="rounded-xs border border-border bg-subtle px-1.5 py-[1px] text-micro text-quaternary">
                  Demo auth
                </span>
              </div>

              {accounts.loading && !accounts.data ? (
                <div className="px-4 py-6">
                  <Spinner />
                </div>
              ) : accounts.error ? (
                <div className="px-4 py-4">
                  <p className="text-small text-tertiary">
                    Could not load the demo accounts. You can still sign in with{" "}
                    <code className="font-mono text-primary">analyst@pulse.demo</code>.
                  </p>
                  <Button size="xs" className="mt-2" onClick={accounts.reload}>
                    Retry
                  </Button>
                </div>
              ) : (
                <ul>
                  {(accounts.data ?? []).map((a) => (
                    <li key={a.email} className="border-b border-border-subtle last:border-b-0">
                      <button
                        type="button"
                        onClick={() => useAccount(a)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-instant hover:bg-subtle"
                      >
                        <span className="mt-[2px] grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-subtle text-caption font-medium text-secondary">
                          {a.name
                            .split(" ")
                            .map((p) => p[0])
                            .join("")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="text-small font-medium text-primary">{a.name}</span>
                            <span className="text-caption text-tertiary">{a.role}</span>
                          </span>
                          <span className="block truncate font-mono text-caption text-tertiary">
                            {a.email}
                          </span>
                          <span className="block pt-0.5 text-caption leading-relaxed text-quaternary">
                            {a.description}
                          </span>
                        </span>
                        <Icon name="arrowRight" size={14} className="mt-2 text-quaternary" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="pt-4 text-caption leading-relaxed text-quaternary">
              <strong className="font-medium text-tertiary">This is demo authentication.</strong>{" "}
              Credentials are verified by the API and the session is a signed,
              expiring token — but the account list is fixed, every account shares
              one published password, and there is no registration or password
              reset. It exists to make the product walkthrough realistic, not to
              secure anything.
            </p>
          </section>
        </div>
      </main>

      <footer className="shrink-0 px-6 py-5 text-caption text-quaternary">
        Nova Commerce is a fictional company · all telemetry is simulated
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas">
          <Spinner />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
