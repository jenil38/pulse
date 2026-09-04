"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  normalizeComponentType,
  useWorkspace,
  type ComponentDraft,
  type ComponentTypeInfo,
  type DependencyDraft,
  type SystemDetail,
} from "@/lib/workspace";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/AsyncState";
import { Tabs } from "@/components/ui/primitives";

/**
 * The system builder.
 *
 * Deliberately a tool, not a scene: a form, two tables and a save button. The
 * cinematic surfaces in PULSE (topology, propagation, incident replay) earn
 * their motion by explaining something. Defining a component does not, and a
 * builder that performs would be slower to use every single time.
 *
 * Rows carry a client-side `uid` so React keys survive renaming — without it,
 * editing a component's name would remount the row and drop focus mid-word.
 */
export interface Row extends ComponentDraft {
  uid: string;
}

export interface EdgeRow {
  uid: string;
  /** uid of the component that depends on `target`. */
  source: string;
  target: string;
}

let counter = 0;
const uid = () => `r${++counter}`;

function emptyRow(): Row {
  return { uid: uid(), name: "", type: "TRANSFORMATION", criticality: "MEDIUM" };
}

export type BuilderMode = "build" | "import";

export function SystemBuilder({
  existing,
  initialMode = "build",
}: {
  /** Set when editing a saved system; absent when creating one. */
  existing?: SystemDetail;
  initialMode?: BuilderMode;
}) {
  const router = useRouter();
  const loadWorkspace = useWorkspace((s) => s.load);
  const setActive = useWorkspace((s) => s.setActive);

  const [mode, setMode] = useState<BuilderMode>(existing ? "build" : initialMode);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    existing
      ? existing.components.map((c) => ({
          uid: uid(),
          name: c.name,
          type: c.type,
          criticality: c.criticality,
          group: c.group,
          description: c.description,
        }))
      : [emptyRow(), emptyRow()]
  );
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [types, setTypes] = useState<ComponentTypeInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing dependencies reference components by key; the editor works in
  // uids, so they are matched up once the rows exist.
  const seeded = useRef(false);
  useEffect(() => {
    if (!existing || seeded.current) return;
    seeded.current = true;
    const byName = new Map(
      existing.components.map((c, i) => [c.key, rows[i]?.uid ?? ""])
    );
    setEdges(
      existing.dependencies
        .map((d) => ({
          uid: uid(),
          source: byName.get(d.source) ?? "",
          target: byName.get(d.target) ?? "",
        }))
        .filter((e) => e.source && e.target)
    );
  }, [existing, rows]);

  useEffect(() => {
    api.componentTypes().then(setTypes).catch(() => setTypes([]));
  }, []);

  const named = useMemo(() => rows.filter((r) => r.name.trim().length > 0), [rows]);

  const setRow = useCallback((id: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.uid === id ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((rs) => rs.filter((r) => r.uid !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  }, []);

  const payload = useCallback(() => {
    const components: ComponentDraft[] = named.map((r) => ({
      name: r.name.trim(),
      type: r.type,
      criticality: r.criticality,
      group: r.group?.trim() || undefined,
      description: r.description?.trim() || undefined,
    }));
    // Edges are held as uids so a rename cannot orphan them, but they are sent
    // by name: the server derives readable component keys from the names, and
    // a uid would leak this editor's bookkeeping into the saved topology.
    const nameOf = new Map(named.map((r) => [r.uid, r.name.trim()]));
    const dependencies: DependencyDraft[] = edges
      .filter((e) => e.source && e.target && e.source !== e.target)
      .filter((e) => nameOf.has(e.source) && nameOf.has(e.target))
      .map((e) => ({ source: nameOf.get(e.source)!, target: nameOf.get(e.target)! }));
    return { components, dependencies };
  }, [named, edges]);

  const save = useCallback(async () => {
    setError(null);
    if (name.trim().length < 2) {
      setError("Give the system a name.");
      return;
    }
    if (named.length === 0) {
      setError("Add at least one component.");
      return;
    }

    setSaving(true);
    try {
      const body = payload();
      const saved = existing
        ? await (async () => {
            await api.saveSystemGraph(existing.id, body);
            return api.renameSystem(existing.id, { name: name.trim(), description });
          })()
        : await api.createSystem({ name: name.trim(), description, ...body });

      await loadWorkspace();
      await setActive(saved.id);
      router.push("/control-room");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Could not save the system. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }, [name, description, named, payload, existing, loadWorkspace, setActive, router]);

  const applyImport = useCallback((imported: { name?: string; rows: Row[]; edges: EdgeRow[] }) => {
    if (imported.name) setName(imported.name);
    setRows(imported.rows);
    setEdges(imported.edges);
    setMode("build");
    setError(null);
  }, []);

  return (
    <div className="mx-auto max-w-[840px] px-6 py-7">
      {!existing && (
        <div className="pb-6">
          <Tabs<BuilderMode>
            value={mode}
            onChange={setMode}
            tabs={[
              { value: "build", label: "Build" },
              { value: "import", label: "Import JSON" },
            ]}
          />
        </div>
      )}

      {mode === "import" ? (
        <ImportPanel onApply={applyImport} />
      ) : (
        <>
          <Field label="System name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme E-commerce"
              autoFocus={!existing}
              className="h-control w-full rounded border border-border bg-surface px-2.5 text-body text-primary outline-none transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Description" hint="Optional">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="The checkout path and everything it touches"
              className="h-control w-full rounded border border-border bg-surface px-2.5 text-body text-primary outline-none transition-colors focus:border-accent"
            />
          </Field>

          <ComponentTable
            rows={rows}
            types={types}
            onChange={setRow}
            onRemove={removeRow}
            onAdd={() => setRows((rs) => [...rs, emptyRow()])}
          />

          <DependencyTable
            rows={named}
            edges={edges}
            onChange={(id, patch) =>
              setEdges((es) => es.map((e) => (e.uid === id ? { ...e, ...patch } : e)))
            }
            onRemove={(id) => setEdges((es) => es.filter((e) => e.uid !== id))}
            onAdd={() =>
              setEdges((es) => [...es, { uid: uid(), source: "", target: "" }])
            }
          />

          {error && (
            <p
              role="alert"
              className="mt-5 flex items-start gap-2 rounded border border-failed-border bg-failed-bg px-3 py-2.5 text-small text-primary"
            >
              <Icon name="warning" size={14} className="mt-[3px] shrink-0 text-failed" />
              {error}
            </p>
          )}

          <div className="mt-7 flex items-center gap-2.5 border-t border-border pt-5">
            <Button variant="primary" size="lg" onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Spinner size={14} /> Saving…
                </>
              ) : existing ? (
                "Save changes"
              ) : (
                "Create system"
              )}
            </Button>
            <Button size="lg" onClick={() => router.push("/systems")}>
              Cancel
            </Button>
            <span className="pl-1 text-caption text-quaternary">
              {named.length} components · {edges.filter((e) => e.source && e.target).length}{" "}
              dependencies
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block pb-4">
      <span className="flex items-baseline justify-between pb-1.5">
        <span className="text-small font-medium text-secondary">{label}</span>
        {hint && <span className="text-caption text-quaternary">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ComponentTable({
  rows,
  types,
  onChange,
  onRemove,
  onAdd,
}: {
  rows: Row[];
  types: ComponentTypeInfo[];
  onChange: (id: string, patch: Partial<Row>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="pt-3">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-heading text-primary">Components</h2>
        <span className="text-caption text-quaternary">
          What the system is made of
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {/* The column header only makes sense while the row is one line. */}
        <div className="hidden items-center gap-2 border-b border-border-subtle bg-subtle px-3 py-2 text-caption text-tertiary sm:flex">
          <span className="flex-1">Name</span>
          <span className="w-[190px]">Type</span>
          <span className="w-[104px]">Criticality</span>
          <span className="w-7" />
        </div>

        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-small text-tertiary">
            No components yet.
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.uid}
              className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0"
            >
              <input
                value={r.name}
                onChange={(e) => onChange(r.uid, { name: e.target.value })}
                placeholder="Payment Service"
                className="h-control-sm w-full min-w-0 rounded border border-border bg-surface px-2 text-small text-primary outline-none transition-colors focus:border-accent sm:w-auto sm:flex-1"
              />
              <select
                value={r.type}
                onChange={(e) => onChange(r.uid, { type: e.target.value })}
                className="h-control-sm min-w-0 flex-1 rounded border border-border bg-surface px-1.5 text-small text-secondary outline-none transition-colors focus:border-accent sm:w-[190px] sm:flex-none"
              >
                {types.map((t) => (
                  <option key={t.value} value={t.value} title={t.hint}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select
                value={r.criticality}
                onChange={(e) => onChange(r.uid, { criticality: e.target.value })}
                className="h-control-sm w-[104px] shrink-0 rounded border border-border bg-surface px-1.5 text-small text-secondary outline-none transition-colors focus:border-accent"
              >
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((c) => (
                  <option key={c} value={c}>
                    {c[0] + c.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onRemove(r.uid)}
                aria-label={`Remove ${r.name || "component"}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-quaternary transition-colors hover:bg-subtle hover:text-failed"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <Button size="sm" className="mt-2" icon={<Icon name="plus" size={13} />} onClick={onAdd}>
        Add component
      </Button>
    </section>
  );
}

function DependencyTable({
  rows,
  edges,
  onChange,
  onRemove,
  onAdd,
}: {
  rows: Row[];
  edges: EdgeRow[];
  onChange: (id: string, patch: Partial<EdgeRow>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="pt-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2">
        <h2 className="text-heading text-primary">Dependencies</h2>
        <span className="text-caption text-quaternary">
          Failure travels from the right-hand side outward
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {edges.length === 0 ? (
          <p className="px-3 py-6 text-center text-small text-tertiary">
            No dependencies yet. Without them every component fails alone.
          </p>
        ) : (
          edges.map((e) => (
            <div
              key={e.uid}
              className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0"
            >
              <ComponentSelect
                rows={rows}
                value={e.source}
                onChange={(v) => onChange(e.uid, { source: v })}
              />
              <span className="shrink-0 text-caption text-tertiary">depends on</span>
              <ComponentSelect
                rows={rows.filter((r) => r.uid !== e.source)}
                value={e.target}
                onChange={(v) => onChange(e.uid, { target: v })}
              />
              <button
                onClick={() => onRemove(e.uid)}
                aria-label="Remove dependency"
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-quaternary transition-colors hover:bg-subtle hover:text-failed"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <Button
        size="sm"
        className="mt-2"
        icon={<Icon name="plus" size={13} />}
        onClick={onAdd}
        disabled={rows.length < 2}
      >
        Add dependency
      </Button>
      {rows.length < 2 && (
        <span className="pl-2 text-caption text-quaternary">
          Name two components first
        </span>
      )}
    </section>
  );
}

function ComponentSelect({
  rows,
  value,
  onChange,
}: {
  rows: Row[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-control-sm min-w-[120px] flex-1 rounded border border-border bg-surface px-2 text-small text-primary outline-none transition-colors focus:border-accent"
    >
      <option value="">Choose…</option>
      {rows.map((r) => (
        <option key={r.uid} value={r.uid}>
          {r.name || "(unnamed)"}
        </option>
      ))}
    </select>
  );
}

const SAMPLE = `{
  "name": "Acme E-commerce",
  "components": [
    { "name": "Website", "type": "service" },
    { "name": "Order Service", "type": "service" },
    { "name": "Payment Service", "type": "service" },
    { "name": "Payment DB", "type": "database" }
  ],
  "dependencies": [
    { "source": "Website", "target": "Order Service" },
    { "source": "Order Service", "target": "Payment Service" },
    { "source": "Payment Service", "target": "Payment DB" }
  ]
}`;

/**
 * Import.
 *
 * Parsing happens here so a malformed file reports a sentence rather than
 * throwing; the server validates again on save, because a client-side check is
 * a convenience and never a control.
 */
function ImportPanel({
  onApply,
}: {
  onApply: (v: { name?: string; rows: Row[]; edges: EdgeRow[] }) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = () => {
    setError(null);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      setError("That is not valid JSON.");
      return;
    }

    const doc = data as {
      name?: unknown;
      components?: unknown;
      dependencies?: unknown;
    };
    if (!Array.isArray(doc.components) || doc.components.length === 0) {
      setError("The file needs a non-empty “components” array.");
      return;
    }

    const rows: Row[] = [];
    const byName = new Map<string, string>();
    for (const raw of doc.components) {
      const c = raw as { name?: unknown; type?: unknown; criticality?: unknown };
      const componentName = typeof c.name === "string" ? c.name.trim() : "";
      if (!componentName) {
        setError("Every component needs a “name”.");
        return;
      }
      if (byName.has(componentName.toLowerCase())) {
        setError(`Two components are both named “${componentName}”.`);
        return;
      }
      const type = normalizeComponentType(c.type);
      if (!type) {
        setError(`“${String(c.type)}” is not a component type PULSE recognises.`);
        return;
      }
      const criticality =
        typeof c.criticality === "string" ? c.criticality.toUpperCase() : "MEDIUM";
      const row: Row = { uid: uid(), name: componentName, type, criticality };
      byName.set(componentName.toLowerCase(), row.uid);
      rows.push(row);
    }

    const edges: EdgeRow[] = [];
    for (const raw of Array.isArray(doc.dependencies) ? doc.dependencies : []) {
      const d = raw as { source?: unknown; target?: unknown };
      const from = typeof d.source === "string" ? d.source.trim() : "";
      const to = typeof d.target === "string" ? d.target.trim() : "";
      const sourceUid = byName.get(from.toLowerCase());
      const targetUid = byName.get(to.toLowerCase());
      if (!sourceUid || !targetUid) {
        setError(
          `Dependency references a component that is not in the file: “${
            sourceUid ? to : from
          }”.`
        );
        return;
      }
      edges.push({ uid: uid(), source: sourceUid, target: targetUid });
    }

    onApply({
      name: typeof doc.name === "string" ? doc.name : undefined,
      rows,
      edges,
    });
  };

  const readFile = (file: File | undefined) => {
    if (!file) return;
    file.text().then(setText).catch(() => setError("Could not read that file."));
  };

  return (
    <div>
      <h2 className="text-heading text-primary">Import a system definition</h2>
      <p className="max-w-[64ch] pt-1.5 text-small leading-relaxed text-secondary">
        Paste JSON or choose a file. Each dependency reads{" "}
        <span className="text-primary">source depends on target</span>, so a
        failure in the target propagates outward to the source. Component types
        accept PULSE&rsquo;s own names or common words like{" "}
        <span className="text-primary">service</span>,{" "}
        <span className="text-primary">database</span>,{" "}
        <span className="text-primary">api</span> and{" "}
        <span className="text-primary">queue</span>.
      </p>

      <div className="flex items-center gap-2 pt-4">
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          Choose file
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setText(SAMPLE)}>
          Use the example
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => readFile(e.target.files?.[0])}
        />
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={16}
        placeholder={SAMPLE}
        className="mt-3 w-full rounded-lg border border-border bg-surface p-3 font-mono text-small leading-relaxed text-primary outline-none transition-colors focus:border-accent"
      />

      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded border border-failed-border bg-failed-bg px-3 py-2.5 text-small text-primary"
        >
          <Icon name="warning" size={14} className="mt-[3px] shrink-0 text-failed" />
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2.5">
        <Button variant="primary" size="lg" onClick={parse} disabled={!text.trim()}>
          Review import
        </Button>
        <span className="text-caption text-quaternary">
          You will see the components before anything is saved
        </span>
      </div>
    </div>
  );
}
