"use client";

import type { Asset } from "@/lib/types";
import type { Stake } from "@/lib/lineage";
import { Icon } from "@/components/ui/Icon";

/**
 * What is at stake: the beat before the button.
 *
 * A chaos tool that goes straight from "pick a target" to "watch it burn"
 * skips the only question that makes the result mean anything: did you already
 * know this was load-bearing? So the moment a target is chosen, the panel
 * states what sits underneath it, and the map lights the same set.
 *
 * Everything here is STRUCTURAL: counts of what depends on the target, walked
 * from the dependency graph already in the browser. It deliberately never says
 * what *would break*, because that answer belongs to the engine and does not
 * exist until the failure is actually run. The wording is chosen to keep that
 * line visible: "depend on", not "would fail".
 */
export function TargetBrief({
  target,
  stake,
  isSpof,
  gated,
}: {
  target: Asset;
  stake: Stake;
  /** The engine's resilience pass named this a single point of failure. */
  isSpof: boolean;
  /** Critical consumers that SPOF gates, by name. */
  gated: string[];
}) {
  const consumers = stake.criticalConsumers;

  return (
    <section
      aria-label={`What depends on ${target.name}`}
      className="reveal glass shrink-0 overflow-hidden rounded-xl"
    >
      <header className="flex items-center justify-between gap-2 px-3.5 pb-1.5 pt-3">
        <h2 className="text-micro uppercase text-quaternary">Downstream of this</h2>
        {isSpof && (
          <span className="inline-flex items-center gap-1 rounded-xs border border-degraded-border bg-degraded-bg px-1.5 py-[1px] text-micro text-degraded">
            <Icon name="warning" size={10} />
            Single point of failure
          </span>
        )}
      </header>

      <div className="px-3.5 pb-3.5">
        <div className="flex items-baseline gap-2">
          <span className="text-title-lg tnum text-primary">{stake.reach}</span>
          <span className="text-small text-tertiary">
            {stake.reach === 1 ? "asset depends on it" : "assets depend on it"}
          </span>
        </div>

        {stake.reach === 0 ? (
          <p className="pt-1.5 text-caption leading-relaxed text-tertiary">
            Nothing reads from {target.name}. Breaking it is contained, which is
            a result worth having.
          </p>
        ) : (
          <>
            <p className="pt-1 text-caption text-quaternary">
              reaching {stake.depth} {stake.depth === 1 ? "hop" : "hops"} downstream
            </p>

            <dl className="space-y-1.5 pt-3">
              {consumers.length > 0 && (
                <Line
                  label={
                    consumers.length === 1 ? "Critical consumer" : "Critical consumers"
                  }
                  names={consumers.map((c) => c.name)}
                />
              )}
              {stake.processes.length > 0 && (
                <Line
                  label={stake.processes.length === 1 ? "Process" : "Processes"}
                  names={stake.processes.map((p) => p.name)}
                />
              )}
              {stake.teams.length > 0 && (
                <Line
                  label={stake.teams.length === 1 ? "Team" : "Teams"}
                  names={stake.teams.map((t) => t.name)}
                />
              )}
            </dl>
          </>
        )}

        {isSpof && gated.length > 0 && (
          <p className="pt-3 text-caption leading-relaxed text-secondary">
            Every path from a source to {listed(gated, 2)} runs through this
            component.
          </p>
        )}
      </div>
    </section>
  );
}

function Line({ label, names }: { label: string; names: string[] }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-[104px] shrink-0 text-caption text-quaternary">{label}</dt>
      <dd className="min-w-0 flex-1 text-caption leading-relaxed text-secondary">
        {listed(names, 3)}
      </dd>
    </div>
  );
}

/** "a, b and 2 more", never a bare truncation with an ellipsis. */
function listed(names: string[], limit: number): string {
  if (names.length <= limit) {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const rest = names.length - limit;
  return `${names.slice(0, limit).join(", ")} and ${rest} more`;
}
