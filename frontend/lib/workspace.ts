/**
 * PULSE — the workspace: which system the product is currently looking at.
 *
 * Every analysis screen reads one system. Rather than thread an id through
 * every component, the active id lives here and `lib/api` attaches it to each
 * request, so a screen written before workspaces existed keeps working.
 *
 * The id is remembered per browser, not per account, so signing out clears it —
 * otherwise the next person to sign in on this machine would land on a system
 * they cannot open.
 */
"use client";

import { create } from "zustand";
import { api } from "./api";

export const DEMO_SYSTEM_ID = "demo";

const KEY = "pulse.system";

export interface SystemSummary {
  id: string;
  name: string;
  description: string;
  kind: "demo" | "user";
  read_only: boolean;
  component_count: number;
  dependency_count: number;
  scenario_count: number;
  incident_count: number;
  resilience_score: number;
  created_at: string;
  updated_at: string;
}

export interface SystemComponent {
  key: string;
  name: string;
  type: ComponentType;
  group: string;
  criticality: Criticality;
  owner: string;
  description: string;
}

/** `source` depends on `target` — failure travels from target out to source. */
export interface SystemDependency {
  source: string;
  target: string;
  kind: string;
}

export interface SystemDetail extends SystemSummary {
  components: SystemComponent[];
  dependencies: SystemDependency[];
}

export type ComponentType =
  | "SOURCE"
  | "INGESTION"
  | "RAW_TABLE"
  | "TRANSFORMATION"
  | "WAREHOUSE_TABLE"
  | "DATA_MODEL"
  | "DASHBOARD"
  | "ML_MODEL"
  | "BUSINESS_PROCESS"
  | "TEAM";

export type Criticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const COMPONENT_TYPES: ComponentType[] = [
  "SOURCE",
  "INGESTION",
  "RAW_TABLE",
  "TRANSFORMATION",
  "WAREHOUSE_TABLE",
  "DATA_MODEL",
  "DASHBOARD",
  "ML_MODEL",
  "BUSINESS_PROCESS",
  "TEAM",
];

/**
 * The same generic words the importer accepts server-side.
 *
 * The server is still the authority — it re-resolves every type on save. This
 * copy exists so an imported "database" shows as a database in the builder's
 * dropdown instead of silently falling back to whatever option happens to be
 * first, which would misrepresent the file the user just handed us.
 */
const TYPE_ALIASES: Record<string, ComponentType> = {
  api: "SOURCE",
  external: "SOURCE",
  external_dependency: "SOURCE",
  infrastructure: "SOURCE",
  third_party: "SOURCE",
  queue: "INGESTION",
  stream: "INGESTION",
  topic: "INGESTION",
  job: "INGESTION",
  storage: "RAW_TABLE",
  bucket: "RAW_TABLE",
  file: "RAW_TABLE",
  raw: "RAW_TABLE",
  service: "TRANSFORMATION",
  worker: "TRANSFORMATION",
  function: "TRANSFORMATION",
  database: "WAREHOUSE_TABLE",
  db: "WAREHOUSE_TABLE",
  table: "WAREHOUSE_TABLE",
  cache: "WAREHOUSE_TABLE",
  warehouse: "WAREHOUSE_TABLE",
  model: "DATA_MODEL",
  metric: "DATA_MODEL",
  report: "DASHBOARD",
  ml: "ML_MODEL",
  process: "BUSINESS_PROCESS",
};

/** Resolve a written type onto the vocabulary, or null if it is not one. */
export function normalizeComponentType(raw: unknown): ComponentType | null {
  if (typeof raw !== "string" || !raw.trim()) return "TRANSFORMATION";
  const token = raw.trim();
  const upper = token.toUpperCase() as ComponentType;
  if (COMPONENT_TYPES.includes(upper)) return upper;
  return TYPE_ALIASES[token.toLowerCase().replace(/-/g, "_")] ?? null;
}

export interface ComponentTypeInfo {
  value: ComponentType;
  label: string;
  hint: string;
}

export interface SavedScenario {
  id: string;
  name: string;
  origin: string;
  origin_name: string;
  failure_type: string;
  duration_minutes: number;
  parameter: string | null;
  created_at: string;
}

/** Draft shapes the builder and importer post. */
export interface ComponentDraft {
  name: string;
  type?: string;
  key?: string;
  group?: string;
  criticality?: string;
  owner?: string;
  description?: string;
}

export interface DependencyDraft {
  source: string;
  target: string;
  kind?: string;
}

/**
 * The id `lib/api` stamps onto requests.
 *
 * Read straight from storage rather than from the store so a request issued
 * before React has hydrated still targets the right system.
 */
export function activeSystemId(): string {
  if (typeof window === "undefined") return DEMO_SYSTEM_ID;
  try {
    return window.localStorage.getItem(KEY) || DEMO_SYSTEM_ID;
  } catch {
    return DEMO_SYSTEM_ID;
  }
}

function persist(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable — the choice lasts this page only */
  }
}

/**
 * Point the workspace at a system before the store exists.
 *
 * Sign-in uses this: the choice has to be recorded before the destination
 * route mounts, otherwise its first request goes to the previous system.
 */
export function setActiveSystem(id: string) {
  persist(id);
}

export function clearActiveSystem() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

interface WorkspaceState {
  /** The caller's own systems. Never contains the demo. */
  systems: SystemSummary[];
  active: SystemSummary | null;
  loading: boolean;
  /** False until the first load settles, so screens don't flash an empty state. */
  ready: boolean;
  error: string | null;

  load: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  reset: () => void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  systems: [],
  active: null,
  loading: false,
  ready: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [mine, demo] = await Promise.all([api.mySystems(), api.demoSystem()]);
      const wanted = activeSystemId();
      // A remembered id that no longer resolves (deleted, or another account's)
      // must not strand the app on a system it cannot read.
      const active =
        mine.find((s) => s.id === wanted) ??
        (wanted === DEMO_SYSTEM_ID ? demo : null) ??
        mine[0] ??
        demo;
      persist(active.id);
      set({ systems: mine, active, loading: false, ready: true });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Could not load your workspace",
        loading: false,
        ready: true,
      });
    }
  },

  setActive: async (id) => {
    persist(id);
    const known = get().systems.find((s) => s.id === id);
    if (known) {
      set({ active: known });
      return;
    }
    try {
      set({ active: id === DEMO_SYSTEM_ID ? await api.demoSystem() : await api.system(id) });
    } catch {
      set({ active: null });
    }
  },

  reset: () => {
    clearActiveSystem();
    set({ systems: [], active: null, ready: false, error: null });
  },
}));
