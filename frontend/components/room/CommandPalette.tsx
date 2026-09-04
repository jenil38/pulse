"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePulse } from "@/lib/store";
import { NODE_LABEL, STATE } from "@/lib/visual";
import { Kbd } from "@/components/ui/Button";
import { Icon, NodeGlyph } from "@/components/ui/Icon";

/**
 * Command palette (⌘K).
 *
 * Every command here maps to a route or store action that already exists —
 * nothing is stubbed. Two groups:
 *
 *   Commands  navigation and actions, filtered by fuzzy-ish substring match
 *   Assets    live search across the loaded topology, selecting on the map
 *
 * Keyboard: ↑/↓ move, ⏎ run, Esc close. Focus is trapped in the input, and the
 * active row is scrolled into view so long lists stay navigable.
 */
interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
  /** Extra terms that should match this command. */
  keywords?: string;
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const topology = usePulse((s) => s.topology);
  const select = usePulse((s) => s.select);
  const stateOf = usePulse((s) => s.stateOf);
  const setSystemFilter = usePulse((s) => s.setSystemFilter);
  const clearSimulation = usePulse((s) => s.clearSimulation);
  const simulation = usePulse((s) => s.simulation);
  const selectedId = usePulse((s) => s.selectedId);

  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      // Remember where focus came from so we can hand it back on close.
      restoreRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
      // Defer so the element exists before we focus it.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      restoreRef.current?.focus?.();
    }
  }, [open]);

  // While the palette is open, the page behind it must not scroll.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "nav-room",
        label: "Open Control Room",
        group: "Navigate",
        keywords: "topology map home",
        run: () => router.push("/control-room"),
      },
      {
        id: "nav-chaos",
        label: "Open Chaos Lab",
        group: "Navigate",
        keywords: "simulate failure inject",
        run: () => router.push("/chaos-lab"),
      },
      {
        id: "nav-incidents",
        label: "View incidents",
        group: "Navigate",
        keywords: "history outage",
        run: () => router.push("/incidents"),
      },
      {
        id: "nav-compare",
        label: "Compare scenarios",
        group: "Navigate",
        keywords: "blast radius versus",
        run: () => router.push("/compare"),
      },
    ];

    // Contextual: only offered when they can actually do something.
    if (selectedId) {
      const asset = topology?.assets.find((a) => a.id === selectedId);
      if (asset) {
        list.push({
          id: "act-simulate",
          label: `Simulate failure on ${asset.name}`,
          hint: "Chaos Lab",
          group: "Actions",
          keywords: "break inject chaos",
          run: () => router.push(`/chaos-lab?target=${asset.id}`),
        });
      }
    }

    if (simulation) {
      list.push({
        id: "act-exit-sim",
        label: "Exit simulation",
        hint: "Return to normal mode",
        group: "Actions",
        keywords: "clear stop reset chaos",
        run: () => clearSimulation(),
      });
    }

    for (const s of topology?.systems ?? []) {
      list.push({
        id: `filter-${s.name}`,
        label: `Filter to ${s.name}`,
        hint: `${s.asset_count} assets`,
        group: "Filter",
        keywords: "system scope",
        run: () => {
          setSystemFilter(s.name);
          router.push("/control-room");
        },
      });
    }

    return list;
  }, [router, topology, selectedId, simulation, clearSimulation, setSystemFilter]);

  const q = query.trim().toLowerCase();

  const matchedCommands = useMemo(
    () =>
      commands.filter(
        (c) =>
          !q ||
          c.label.toLowerCase().includes(q) ||
          (c.keywords ?? "").includes(q) ||
          c.group.toLowerCase().includes(q)
      ),
    [commands, q]
  );

  const matchedAssets = useMemo(() => {
    if (!q) return [];
    return (topology?.assets ?? [])
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.owner.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [topology, q]);

  // One flat list so arrow keys traverse both groups naturally.
  const rows = useMemo(
    () => [
      ...matchedCommands.map((c) => ({ kind: "command" as const, cmd: c })),
      ...matchedAssets.map((a) => ({ kind: "asset" as const, asset: a })),
    ],
    [matchedCommands, matchedAssets]
  );

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const run = (i: number) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === "command") row.cmd.run();
    else {
      select(row.asset.id);
      router.push("/control-room");
    }
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // The palette is a modal surface: keep focus inside it.
      e.preventDefault();
      inputRef.current?.focus();
    }
  };

  let cursor = -1;
  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-primary/20 p-4 pt-[12vh] animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-surface shadow-overlay animate-scale-in"
      >
        <div className="flex h-12 items-center gap-2.5 border-b border-border-subtle px-4">
          <Icon name="search" size={16} className="text-quaternary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets or run a command…"
            aria-label="Search assets or run a command"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-autocomplete="list"
            aria-activedescendant={rows.length ? `command-row-${active}` : undefined}
            className="h-full flex-1 bg-transparent text-body text-primary outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div
          ref={listRef}
          id="command-list"
          role="listbox"
          aria-label="Commands and assets"
          className="max-h-[52vh] overflow-y-auto py-1.5"
        >
          <p aria-live="polite" className="sr-only">
            {rows.length} result{rows.length === 1 ? "" : "s"}
          </p>
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-small text-quaternary">
              No matches for “{query}”
            </p>
          )}

          {matchedCommands.map((c) => {
            cursor += 1;
            const i = cursor;
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {showGroup && (
                  <p role="presentation" className="px-4 pb-1 pt-2 text-micro uppercase text-quaternary">
                    {c.group}
                  </p>
                )}
                <Row
                  index={i}
                  active={i === active}
                  onHover={() => setActive(i)}
                  onClick={() => run(i)}
                >
                  <span className="truncate text-small text-primary">{c.label}</span>
                  {c.hint && (
                    <span className="ml-auto shrink-0 text-caption text-quaternary">
                      {c.hint}
                    </span>
                  )}
                </Row>
              </div>
            );
          })}

          {matchedAssets.length > 0 && (
            <p role="presentation" className="px-4 pb-1 pt-2 text-micro uppercase text-quaternary">Assets</p>
          )}
          {matchedAssets.map((a) => {
            cursor += 1;
            const i = cursor;
            const st = stateOf(a.id);
            return (
              <Row
                key={a.id}
                index={i}
                active={i === active}
                onHover={() => setActive(i)}
                onClick={() => run(i)}
              >
                <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${STATE[st].dot}`} />
                <NodeGlyph type={a.type} className="text-quaternary" />
                <span className="truncate text-small text-primary">{a.name}</span>
                <span className="ml-auto shrink-0 text-caption text-quaternary">
                  {NODE_LABEL[a.type]}
                </span>
              </Row>
            );
          })}
        </div>

        <div className="flex h-9 items-center gap-3 border-t border-border-subtle px-4">
          <span className="flex items-center gap-1 text-caption text-quaternary">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1 text-caption text-quaternary">
            <Kbd>⏎</Kbd> select
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  index,
  active,
  onHover,
  onClick,
  children,
}: {
  index: number;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`command-row-${index}`}
      data-index={index}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onClick}
      className={`mx-1.5 flex h-9 w-[calc(100%-12px)] cursor-pointer items-center gap-2.5 rounded px-2.5 text-left transition-colors duration-instant ${
        active ? "bg-muted" : ""
      }`}
    >
      {children}
    </div>
  );
}
