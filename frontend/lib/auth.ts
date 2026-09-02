/**
 * PULSE — demo session handling.
 *
 * The token is issued and verified by the backend (see backend/app/api/auth.py).
 * This module only stores it and attaches it to requests.
 *
 * Storage choice: `localStorage` when "keep me signed in" is checked, otherwise
 * `sessionStorage` so the session ends with the tab. Neither is appropriate for
 * a production auth system handling real credentials — an httpOnly cookie would
 * be — and the project documentation says so plainly.
 */
"use client";

import { create } from "zustand";

const KEY = "pulse.session";

export interface SessionUser {
  email: string;
  name: string;
  role: string;
  initials: string;
  description: string;
}

interface StoredSession {
  token: string;
  expiresAt: number;
  user: SessionUser;
}

function read(): StoredSession | null {
  if (typeof window === "undefined") return null;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const raw = store.getItem(KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredSession;
      // Expired tokens are discarded rather than sent and rejected.
      if (parsed.expiresAt * 1000 <= Date.now()) {
        store.removeItem(KEY);
        continue;
      }
      return parsed;
    } catch {
      /* corrupt entry — treat as signed out */
    }
  }
  return null;
}

function write(session: StoredSession, remember: boolean) {
  if (typeof window === "undefined") return;
  const store = remember ? window.localStorage : window.sessionStorage;
  const other = remember ? window.sessionStorage : window.localStorage;
  try {
    store.setItem(KEY, JSON.stringify(session));
    other.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) — the session lasts this page only */
  }
}

function clear() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Read the raw token for request headers, without subscribing to the store. */
export function authToken(): string | null {
  return read()?.token ?? null;
}

interface AuthState {
  user: SessionUser | null;
  /** null until the stored session has been read on the client. */
  ready: boolean;
  hydrate: () => void;
  signIn: (session: { token: string; expires_at: number; user: SessionUser }, remember: boolean) => void;
  signOut: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,

  hydrate: () => {
    const s = read();
    set({ user: s?.user ?? null, ready: true });
  },

  signIn: (session, remember) => {
    write(
      { token: session.token, expiresAt: session.expires_at, user: session.user },
      remember
    );
    set({ user: session.user, ready: true });
  },

  signOut: () => {
    clear();
    set({ user: null, ready: true });
  },
}));
