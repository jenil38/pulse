"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Signed-in identity and the sign-out action.
 *
 * Small but important for completeness: without it a user simply materialises
 * inside the system with no sense of who they are or how to leave.
 */
export function UserMenu({ compact }: { compact?: boolean }) {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const handleSignOut = async () => {
    // Best-effort: the token is stateless, so the client discard is what counts.
    try {
      await api.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    signOut();
    router.replace("/login");
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          compact
            ? "grid h-8 w-8 place-items-center rounded-full border border-border bg-subtle text-caption font-medium text-secondary transition-colors duration-instant hover:border-border-strong"
            : "flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors duration-instant hover:bg-subtle"
        }
      >
        <span
          className={
            compact
              ? ""
              : "grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-subtle text-caption font-medium text-secondary"
          }
        >
          {user.initials}
        </span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-small text-primary">{user.name}</span>
            <span className="block truncate text-caption text-tertiary">{user.role}</span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-[248px] overflow-hidden rounded-lg border border-border bg-surface shadow-overlay animate-scale-in ${
            compact ? "right-0 top-10" : "bottom-full left-0 mb-1"
          }`}
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-small font-medium text-primary">{user.name}</p>
            <p className="truncate font-mono text-caption text-tertiary">{user.email}</p>
            <p className="pt-1.5 text-caption leading-relaxed text-quaternary">
              {user.description}
            </p>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-caption text-tertiary">Role</span>
            <span className="rounded-xs border border-border bg-subtle px-1.5 py-[1px] text-micro text-secondary">
              {user.role}
            </span>
          </div>
          <div className="border-t border-border px-3 py-2">
            <p className="text-caption leading-relaxed text-quaternary">
              Demo session — roles are labels only and do not restrict access.
            </p>
          </div>
          <button
            role="menuitem"
            onClick={handleSignOut}
            className="w-full border-t border-border px-3 py-2.5 text-left text-small text-primary transition-colors duration-instant hover:bg-subtle"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
