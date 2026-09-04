"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_SYSTEM_ID, useWorkspace } from "@/lib/workspace";
import { Icon } from "@/components/ui/Icon";

/**
 * Which system the product is looking at.
 *
 * It sits at the very top of the sidebar because every number below it — the
 * asset counts, the resilience score, the incident badge — is a fact about
 * this system and nothing else. The DEMO tag is not decoration: it is the one
 * thing that stops a sample estate being mistaken for the user's own.
 */
export function SystemSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const systems = useWorkspace((s) => s.systems);
  const active = useWorkspace((s) => s.active);
  const load = useWorkspace((s) => s.load);
  const setActive = useWorkspace((s) => s.setActive);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = async (id: string) => {
    setOpen(false);
    await setActive(id);
    onNavigate?.();
    router.refresh();
    // The topology, health and incident stores all key off the active system,
    // so the surface has to re-read rather than re-render.
    window.location.reload();
  };

  const isDemo = active?.kind === "demo";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2 border-b border-border-subtle px-3 text-left transition-colors duration-instant hover:bg-subtle"
      >
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-sm bg-primary text-[11px] font-semibold text-canvas">
          P
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-primary">
            {active?.name ?? "PULSE"}
          </span>
        </span>
        {isDemo && (
          <span className="shrink-0 rounded-xs border border-degraded-border bg-degraded-bg px-1.5 text-micro uppercase text-degraded">
            Demo
          </span>
        )}
        <Icon name="chevronDown" size={13} className="shrink-0 text-quaternary" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute inset-x-1.5 top-[46px] z-50 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-overlay"
        >
          <p className="px-3 pb-1 pt-1.5 text-micro uppercase text-quaternary">
            Your systems
          </p>
          {systems.length === 0 ? (
            <p className="px-3 pb-2 text-caption text-tertiary">
              None yet — create one below.
            </p>
          ) : (
            systems.map((s) => (
              <MenuItem
                key={s.id}
                label={s.name}
                meta={`${s.component_count} components`}
                selected={active?.id === s.id}
                onSelect={() => choose(s.id)}
              />
            ))
          )}

          <div className="my-1 border-t border-border-subtle" />
          <MenuItem
            label="Nova Commerce"
            meta="Sample system"
            selected={active?.id === DEMO_SYSTEM_ID}
            onSelect={() => choose(DEMO_SYSTEM_ID)}
          />
          <div className="my-1 border-t border-border-subtle" />
          <MenuItem
            label="Manage systems"
            onSelect={() => {
              setOpen(false);
              onNavigate?.();
              router.push("/systems");
            }}
          />
          <MenuItem
            label="Create a system"
            onSelect={() => {
              setOpen(false);
              onNavigate?.();
              router.push("/systems/new");
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  meta,
  selected,
  onSelect,
}: {
  label: string;
  meta?: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-small text-secondary transition-colors duration-instant hover:bg-subtle hover:text-primary"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="shrink-0 text-caption text-quaternary">{meta}</span>}
      {selected && <Icon name="check" size={13} className="shrink-0 text-accent" />}
    </button>
  );
}
