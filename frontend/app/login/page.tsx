"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, type DemoAccount, type LoginResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEMO_SYSTEM_ID, setActiveSystem } from "@/lib/workspace";
import { useAsync } from "@/hooks/useAsync";
import { AuthRoom } from "@/components/auth/AuthRoom";
import { LightField, RevealToggle } from "@/components/auth/LightField";
import { WelcomeCurtain } from "@/components/auth/WelcomeCurtain";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/AsyncState";

/**
 * Sign in.
 *
 * Honest by construction: the demo accounts and the password are printed on the
 * page, and the page says in plain language that this is demo auth. Credentials
 * are still verified server-side against a signed, expiring token, so the flow
 * is real even though the seeded user store is fixed.
 *
 * The session is stored the moment the API answers — the welcome that plays
 * afterwards is presentation, never a gate, so the destination is already warm
 * behind it.
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
  const [session, setSession] = useState<LoginResponse | null>(null);

  const passwordRef = useRef<HTMLInputElement>(null);
  const accounts = useAsync<DemoAccount[]>(() => api.demoAccounts(), []);

  // "Explore the demo" from the landing page arrives as ?demo=1. It pins the
  // sample system so the visitor lands in it rather than in an empty workspace.
  const exploringDemo = params.get("demo") === "1";
  const next = params.get("next") || (exploringDemo ? "/control-room" : "/systems");

  useEffect(() => hydrate(), [hydrate]);

  useEffect(() => {
    if (exploringDemo) setActiveSystem(DEMO_SYSTEM_ID);
  }, [exploringDemo]);

  // An already-signed-in visitor is sent straight through; only a sign-in that
  // happens *here* earns the welcome.
  useEffect(() => {
    if (user && !session) router.replace(next);
  }, [user, session, router, next]);

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
      router.prefetch(next);
      setSession(res);
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

  const welcoming = !!session;

  return (
    <AuthRoom
      lights={welcoming ? "up" : "down"}
      footer={
        !welcoming && (
          <p className="text-caption text-quaternary">
            Nova Commerce is a fictional company · all telemetry is simulated
          </p>
        )
      }
    >
      <div
        className="w-full max-w-[420px] transition-all duration-700 ease-standard"
        style={
          welcoming
            ? { opacity: 0, transform: "scale(0.97)", filter: "blur(8px)" }
            : undefined
        }
        aria-hidden={welcoming}
      >
        <div className="lift-in">
          <h1 className="text-title-lg text-primary">Sign in</h1>
          <p className="pt-2 text-small text-tertiary">
            {exploringDemo
              ? "Sign in to open the Nova Commerce sample system."
              : "Open your workspace."}
          </p>

          <form
            onSubmit={submit}
            noValidate
            className="glass mt-7 space-y-5 rounded-2xl p-6 sm:p-7"
          >
            <LightField
              label="Email"
              icon="mail"
              type="email"
              autoComplete="username"
              value={email}
              onChange={setEmail}
              onBlur={() => setTouched(true)}
              error={showEmailError ? "Enter a valid email address." : undefined}
            />

            <LightField
              label="Password"
              icon="lock"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              inputRef={passwordRef}
              placeholder="pulse-demo"
              trailing={
                <RevealToggle
                  shown={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
              }
            />

            <div className="flex items-center justify-between pt-0.5">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                <span className="text-small text-secondary">Keep me signed in</span>
              </label>
              <span className="text-caption text-quaternary">
                Password:{" "}
                <code className="font-mono text-tertiary">pulse-demo</code>
              </span>
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-failed-border bg-failed-bg px-3 py-2.5 text-small text-primary"
              >
                <Icon name="warning" size={14} className="mt-[3px] shrink-0 text-failed" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !password}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-body font-medium text-accent-fg transition-all duration-base ease-standard hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <Spinner size={14} /> Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <Icon name="arrowRight" size={15} />
                </>
              )}
            </button>
          </form>

          {/* Demo accounts — three chips, not a second panel competing with the form */}
          <div className="pt-6">
            <p className="pb-2.5 text-caption text-quaternary">
              Or continue with a demo account
            </p>
            {accounts.loading && !accounts.data ? (
              <Spinner size={14} />
            ) : accounts.error ? (
              <p className="text-caption text-tertiary">
                Demo accounts unavailable — sign in with{" "}
                <code className="font-mono text-secondary">analyst@pulse.demo</code>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(accounts.data ?? []).map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    onClick={() => useAccount(a)}
                    title={a.description}
                    className="glass-quiet group flex items-center gap-2 rounded-pill py-1.5 pl-1.5 pr-3.5 transition-colors duration-base hover:border-accent-border"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[10px] font-medium text-secondary">
                      {a.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")}
                    </span>
                    <span className="text-caption text-secondary group-hover:text-primary">
                      {a.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="pt-7 text-small text-tertiary">
            New to PULSE?{" "}
            <Link
              href="/signup"
              className="text-accent-text underline-offset-4 transition-colors hover:text-accent-hover hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>

      {session && (
        <WelcomeCurtain
          name={session.user.name}
          returning
          role={session.user.role}
          onDone={() => router.replace(next)}
        />
      )}
    </AuthRoom>
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
