"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { DEMO_SYSTEM_ID, useWorkspace, type SystemSummary } from "@/lib/workspace";
import { AppShell } from "@/components/room/AppShell";
import { Toolbar } from "@/components/room/Toolbar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/AsyncState";
import { scoreBand } from "@/lib/visual";

/**
 * My Systems — the workspace.
 *
 * This is the screen that decides whether PULSE reads as a product or as a
 * demo. A new account lands here with nothing in it, and that emptiness is the
 * onboarding: three real choices, no placeholder rows, and no invented metrics
 * standing in for a system that does not exist yet.
 */
export default function SystemsPage() {
  const router = useRouter();
  const systems = useWorkspace((s) => s.systems);
  const ready = useWorkspace((s) => s.ready);
  const error = useWorkspace((s) => s.error);
  const load = useWorkspace((s) => s.load);
  const setActive = useWorkspace((s) => s.setActive);

  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const open = useCallback(
    async (id: string) => {
      await setActive(id);
      router.push("/control-room");
    },
    [setActive, router]
  );

  const remove = useCallback(
    async (sys: SystemSummary) => {
      if (!window.confirm(`Delete “${sys.name}” and everything saved against it?`)) {
        return;
      }
      setBusy(sys.id);
      try {
        await api.deleteSystem(sys.id);
        await load();
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  return (
    <AppShell>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title="Systems">
          <div className="flex items-center gap-2">
            <Link href="/systems/new?mode=import">
              <Button size="sm" icon={<Icon name="upload" size={14} />}>
                Import
              </Button>
            </Link>
            <Link href="/systems/new">
              <Button size="sm" variant="primary" icon={<Icon name="plus" size={14} />}>
                Create system
              </Button>
            </Link>
          </div>
        </Toolbar>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[860px] px-6 py-8">
            {!ready ? (
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            ) : error ? (
              <p className="text-small text-failed">{error}</p>
            ) : systems.length === 0 ? (
              <EmptyWorkspace onOpenDemo={() => open(DEMO_SYSTEM_ID)} />
            ) : (
              <>
                <p className="pb-3 text-caption text-tertiary">
                  {systems.length} {systems.length === 1 ? "system" : "systems"} in your
                  workspace
                </p>
                <ul className="space-y-2">
                  {systems.map((sys) => (
                    <SystemCard
                      key={sys.id}
                      system={sys}
                      busy={busy === sys.id}
                      onOpen={() => open(sys.id)}
                      onDelete={() => remove(sys)}
                    />
                  ))}
                </ul>

                <div className="mt-8 border-t border-border pt-5">
                  <p className="text-caption text-tertiary">
                    Looking for the sample architecture?
                  </p>
                  <button
                    onClick={() => open(DEMO_SYSTEM_ID)}
                    className="pt-1 text-small text-accent-text underline-offset-4 transition-colors hover:text-accent-hover hover:underline"
                  >
                    Open the Nova Commerce demo
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function EmptyWorkspace({ onOpenDemo }: { onOpenDemo: () => void }) {
  return (
    <div className="py-10">
      <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-subtle text-tertiary">
        <Icon name="layers" size={18} />
      </span>
      <h2 className="pt-4 text-title text-primary">No systems yet</h2>
      <p className="max-w-[56ch] pt-2 text-body leading-relaxed text-secondary">
        Bring your architecture into PULSE to start exploring dependencies,
        resilience and failure scenarios. Nothing here is pre-filled — this
        workspace holds only what you put in it.
      </p>

      <div className="flex flex-wrap gap-2.5 pt-6">
        <Link href="/systems/new">
          <Button size="lg" variant="primary" icon={<Icon name="plus" size={14} />}>
            Create a system
          </Button>
        </Link>
        <Link href="/systems/new?mode=import">
          <Button size="lg" icon={<Icon name="upload" size={14} />}>
            Import JSON
          </Button>
        </Link>
        <Button size="lg" onClick={onOpenDemo}>
          Explore the demo
        </Button>
      </div>

      <div className="mt-10 border-t border-border pt-5">
        <h3 className="text-heading text-primary">What PULSE does with it</h3>
        <ol className="max-w-[62ch] space-y-2 pt-3">
          {[
            "Model your components and how they depend on one another.",
            "Break one on purpose and watch the failure propagate outward.",
            "Read the blast radius, the recovery order and the weak points.",
            "Save the scenario and come back to it.",
          ].map((step, i) => (
            <li key={step} className="flex gap-3 text-small text-secondary">
              <span className="tnum shrink-0 text-quaternary">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function SystemCard({
  system,
  busy,
  onOpen,
  onDelete,
}: {
  system: SystemSummary;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const band = scoreBand(system.resilience_score);
  return (
    <li className="rounded-lg border border-border bg-surface px-4 py-3.5 transition-colors duration-instant hover:border-border-strong">
      <div className="flex items-start gap-4">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-body font-medium text-primary">
            {system.name}
          </span>
          {system.description && (
            <span className="block truncate pt-0.5 text-small text-tertiary">
              {system.description}
            </span>
          )}
        </button>

        <div className="shrink-0 text-right">
          <span className={`block text-title tnum ${band.text}`}>
            {system.resilience_score}
          </span>
          <span className="text-caption text-quaternary">resilience</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-2 text-caption text-quaternary">
        <span className="tnum">{count(system.component_count, "component")}</span>
        <span className="tnum">{count(system.dependency_count, "dependency", "dependencies")}</span>
        {system.scenario_count > 0 && (
          <span className="tnum">{count(system.scenario_count, "scenario")}</span>
        )}
        {system.incident_count > 0 && (
          <span className="tnum">{count(system.incident_count, "incident")}</span>
        )}
        <span>Updated {relativeDate(system.updated_at)}</span>
      </div>

      <div className="flex items-center gap-1 pt-2.5">
        <Button size="sm" onClick={onOpen}>
          Open
        </Button>
        <Link href={`/systems/${system.id}/edit`}>
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        </Link>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${system.name}`}
        >
          <Icon name="trash" size={14} />
        </Button>
      </div>
    </li>
  );
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "3 days ago" from an ISO timestamp, without pulling in a date library. */
export function relativeDate(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "recently";
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 90) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
  ];
  let label = "minute";
  let size = 60;
  for (const [s, u] of units) {
    if (seconds >= s) {
      size = s;
      label = u;
    }
  }
  const n = Math.floor(seconds / size);
  return `${n} ${label}${n === 1 ? "" : "s"} ago`;
}
