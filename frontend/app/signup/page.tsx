"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, type LoginResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clearActiveSystem } from "@/lib/workspace";
import { AuthRoom } from "@/components/auth/AuthRoom";
import {
  LightField,
  RevealToggle,
  StrengthMeter,
} from "@/components/auth/LightField";
import { WelcomeCurtain } from "@/components/auth/WelcomeCurtain";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/AsyncState";

/**
 * Create an account.
 *
 * The registration is real to the extent it can honestly be: the password is
 * salted with fresh random bytes, hashed server-side, and checked on every
 * later sign-in. What it is not is durable — the account lives in the API
 * process and is gone when it restarts. The page says so rather than implying
 * a user database that does not exist.
 */
function SignupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const signIn = useAuth((s) => s.signIn);
  const user = useAuth((s) => s.user);
  const hydrate = useAuth((s) => s.hydrate);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ name: false, email: false, password: false });
  const [session, setSession] = useState<LoginResponse | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  // A new account owns nothing yet, so it lands in the workspace rather than in
  // a Control Room that would have to show somebody else's estate.
  const next = params.get("next") || "/systems";

  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => clearActiveSystem(), []);
  useEffect(() => {
    if (user && !session) router.replace(next);
  }, [user, session, router, next]);

  const nameValid = name.trim().length >= 2;
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const passwordValid = password.length >= 8;
  const canSubmit = nameValid && emailValid && passwordValid && !submitting;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched({ name: true, email: true, password: true });
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.register(name.trim(), email.trim(), password);
      signIn(res, true);
      router.prefetch(next);
      setSession(res);
    } catch (err) {
      setError(
        err instanceof ApiError && err.kind === "validation"
          ? err.message || "That email is already registered."
          : err instanceof ApiError && err.kind === "network"
            ? "Cannot reach the PULSE API. Is the backend running?"
            : "Could not create the account. Please try again."
      );
      if (err instanceof ApiError && err.kind === "validation") emailRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
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
          <h1 className="text-title-lg text-primary">Create your workspace</h1>
          <p className="pt-2 text-small text-tertiary">
            Your workspace starts empty. Bring your own system into it.
          </p>

          <form
            onSubmit={submit}
            noValidate
            className="glass mt-7 space-y-5 rounded-2xl p-6 sm:p-7"
          >
            <LightField
              label="Full name"
              icon="user"
              autoComplete="name"
              placeholder="Ada Okafor"
              value={name}
              onChange={setName}
              autoFocus
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              error={
                touched.name && !nameValid ? "Enter at least two characters." : undefined
              }
            />

            <LightField
              label="Email"
              icon="mail"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={setEmail}
              inputRef={emailRef}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              error={
                touched.email && !emailValid ? "Enter a valid email address." : undefined
              }
            />

            <div>
              <LightField
                label="Password"
                icon="lock"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                error={
                  touched.password && !passwordValid
                    ? "Use at least 8 characters."
                    : undefined
                }
                trailing={
                  <RevealToggle
                    shown={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                  />
                }
              />
              <StrengthMeter password={password} />
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
              disabled={!canSubmit}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-body font-medium text-accent-fg transition-all duration-base ease-standard hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <Spinner size={14} /> Creating account…
                </>
              ) : (
                <>
                  Create account
                  <Icon name="arrowRight" size={15} />
                </>
              )}
            </button>

            <p className="text-caption leading-relaxed text-quaternary">
              Your password is salted and hashed before it is stored, and no
              email is ever sent. This is demo authentication over a file, not a
              production user store — the project documentation says so plainly.
            </p>
          </form>

          <p className="pt-7 text-small text-tertiary">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-accent-text underline-offset-4 transition-colors hover:text-accent-hover hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {session && (
        <WelcomeCurtain
          name={session.user.name}
          returning={false}
          role={session.user.role}
          onDone={() => router.replace(next)}
        />
      )}
    </AuthRoom>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas">
          <Spinner />
        </div>
      }
    >
      <SignupInner />
    </Suspense>
  );
}
