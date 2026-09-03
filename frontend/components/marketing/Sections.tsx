"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { Icon, NodeGlyph } from "@/components/ui/Icon";
import { Badge, StatusDot } from "@/components/ui/primitives";
import { Sparkline } from "@/components/ui/Chart";
import type { NodeType } from "@/lib/types";

/**
 * Landing page sections.
 *
 * Product marketing built the way the product is: real interface fragments
 * rather than illustrations, honest claims, and enough depth that the page
 * reads as a product rather than a screenshot with a headline.
 */

/* ------------------------------------------------------------ capabilities */

export function CapabilityRow({
  eyebrow,
  title,
  body,
  bullets,
  visual,
  reverse,
  href,
  linkLabel,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  visual: ReactNode;
  reverse?: boolean;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="grid items-center gap-8 py-14 md:grid-cols-2 md:gap-14 md:py-20">
      <div className={reverse ? "md:order-2" : ""}>
        <p className="text-caption text-tertiary">{eyebrow}</p>
        <h3 className="max-w-[22ch] pt-2 text-[1.625rem] font-medium leading-tight tracking-[-0.02em] text-primary md:text-[2rem]">
          {title}
        </h3>
        <p className="max-w-[52ch] pt-3 text-body leading-relaxed text-secondary">{body}</p>
        <ul className="space-y-2 pt-5">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2.5">
              <Icon name="check" size={15} className="mt-[3px] shrink-0 text-healthy" />
              <span className="text-small leading-relaxed text-secondary">{b}</span>
            </li>
          ))}
        </ul>
        {href && (
          <Link
            href={href}
            className="mt-6 inline-flex items-center gap-1.5 text-small font-medium text-accent transition-colors hover:text-accent-hover"
          >
            {linkLabel ?? "Explore"}
            <Icon name="arrowRight" size={14} />
          </Link>
        )}
      </div>

      <div className={reverse ? "md:order-1" : ""}>
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-raised">
          {visual}
        </div>
      </div>
    </div>
  );
}

/** Chrome that makes an interface fragment read as a real screen. */
export function MockWindow({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex h-9 items-center gap-2 border-b border-border bg-canvas px-3">
        <span className="text-caption text-tertiary">{title}</span>
        <span className="ml-auto flex gap-1" aria-hidden>
          <span className="h-[6px] w-[6px] rounded-full bg-border-strong" />
          <span className="h-[6px] w-[6px] rounded-full bg-border-strong" />
        </span>
      </div>
      {children}
    </>
  );
}

/** A miniature of the real asset table, using the real design system. */
export function MockAssetTable() {
  const rows: {
    name: string;
    type: NodeType;
    state: "HEALTHY" | "DEGRADED" | "STALE";
    fresh: string;
    trend: number[];
  }[] = [
    { name: "fact_orders", type: "WAREHOUSE_TABLE", state: "HEALTHY", fresh: "12m", trend: [4, 5, 3, 6, 4, 5, 3, 4] },
    { name: "daily_revenue", type: "DATA_MODEL", state: "HEALTHY", fresh: "1.1h", trend: [3, 4, 5, 4, 6, 5, 4, 5] },
    { name: "stg_marketing", type: "TRANSFORMATION", state: "DEGRADED", fresh: "9h", trend: [3, 4, 5, 6, 7, 8, 9, 11] },
    { name: "Inventory System", type: "SOURCE", state: "STALE", fresh: "26h", trend: [4, 6, 8, 10, 12, 14, 16, 19] },
    { name: "dim_customers", type: "WAREHOUSE_TABLE", state: "HEALTHY", fresh: "34m", trend: [5, 4, 5, 4, 5, 4, 5, 4] },
  ];

  return (
    <table className="w-full text-small">
      <thead>
        <tr>
          <th className="border-b border-border px-3 py-2 text-left text-micro uppercase text-quaternary">
            Asset
          </th>
          <th className="border-b border-border px-3 py-2 text-left text-micro uppercase text-quaternary">
            Health
          </th>
          <th className="border-b border-border px-3 py-2 text-right text-micro uppercase text-quaternary">
            Fresh
          </th>
          <th className="border-b border-border px-3 py-2 text-left text-micro uppercase text-quaternary">
            Trend
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td className="border-b border-border-subtle px-3 py-2">
              <span className="flex items-center gap-2">
                <StatusDot state={r.state} />
                <NodeGlyph type={r.type} className="text-quaternary" />
                <span className="truncate text-primary">{r.name}</span>
              </span>
            </td>
            <td className="border-b border-border-subtle px-3 py-2">
              <span
                className={
                  r.state === "HEALTHY"
                    ? "text-healthy"
                    : r.state === "DEGRADED"
                      ? "text-degraded"
                      : "text-stale"
                }
              >
                {r.state === "HEALTHY" ? "Healthy" : r.state === "DEGRADED" ? "Degraded" : "Stale"}
              </span>
            </td>
            <td className="border-b border-border-subtle px-3 py-2 text-right font-mono text-caption tnum text-secondary">
              {r.fresh}
            </td>
            <td className="border-b border-border-subtle px-3 py-2">
              <Sparkline
                points={r.trend.map((v, i) => ({ t: i, value: v }))}
                width={56}
                height={16}
                tone={r.state === "HEALTHY" ? "healthy" : "degraded"}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A miniature of the blast-radius propagation list. */
export function MockBlastRadius() {
  const steps = [
    { name: "Stripe Payments API", state: "Failed", hop: 0, tone: "text-failed", dot: "bg-failed" },
    { name: "raw_payments", state: "Stale", hop: 2, tone: "text-stale", dot: "bg-stale" },
    { name: "fact_payments", state: "Stale", hop: 4, tone: "text-stale", dot: "bg-stale" },
    { name: "daily_revenue", state: "Stale", hop: 5, tone: "text-stale", dot: "bg-stale" },
    { name: "Executive Revenue Dashboard", state: "Untrustworthy", hop: 6, tone: "text-degraded", dot: "bg-degraded" },
    { name: "Finance Team", state: "Impacted", hop: 7, tone: "text-degraded", dot: "bg-degraded" },
  ];
  return (
    <ol className="p-1">
      {steps.map((s, i) => (
        <li
          key={s.name}
          className="flex items-center gap-2.5 rounded px-2.5 py-2"
          style={{ paddingLeft: 10 + i * 8 }}
        >
          <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${s.dot}`} />
          <span className="min-w-0 flex-1 truncate text-small text-primary">{s.name}</span>
          <span className={`shrink-0 text-caption ${s.tone}`}>{s.state}</span>
          <span className="w-10 shrink-0 text-right font-mono text-caption tnum text-quaternary">
            hop {s.hop}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A miniature of the recovery plan. */
export function MockRecovery() {
  const steps = [
    "Restore Stripe Payments API",
    "Validate freshly landed data in raw_payments",
    "Backfill the missing time window",
    "Rebuild stg_payments",
    "Rebuild fact_payments",
    "Rebuild daily_revenue",
    "Verify Executive Revenue Dashboard",
  ];
  return (
    <ol className="p-1">
      {steps.map((s, i) => (
        <li key={s} className="flex gap-3 rounded px-2.5 py-[7px]">
          <span className="w-5 shrink-0 font-mono text-caption tnum text-quaternary">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="text-small leading-snug text-primary">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------- how it works */

export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Model the system",
      body: "Declare sources, pipelines, tables, models, dashboards and the teams that consume them as a directed graph.",
    },
    {
      n: "02",
      title: "Choose a failure",
      body: "Ten failure types across three propagation modes. Schema drift breaks differently from an outage.",
    },
    {
      n: "03",
      title: "Propagate deterministically",
      body: "PULSE walks descendants in topological order. Each node takes the worst incoming state, transformed by the failure mode and its own type.",
    },
    {
      n: "04",
      title: "Read the consequence",
      body: "Blast radius, business impact, a recovery order derived from the topology, and an explainable resilience score.",
    },
  ];

  return (
    <section className="mx-auto max-w-[1120px] px-6 py-20">
      <p className="text-caption text-tertiary">How it works</p>
      <h2 className="max-w-[22ch] pt-3 text-[2rem] font-medium leading-tight tracking-[-0.025em] text-primary md:text-display">
        Four steps, no black box.
      </h2>
      <div className="grid gap-x-10 gap-y-8 pt-12 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="border-t border-border pt-4">
            <span className="font-mono text-caption tnum text-quaternary">{s.n}</span>
            <h3 className="pt-2 text-heading text-primary">{s.title}</h3>
            <p className="pt-1.5 text-small leading-relaxed text-secondary">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- engineering */

export function Engineering() {
  const groups = [
    {
      label: "Engine",
      items: ["Python", "Deterministic graph traversal", "Zero runtime dependencies", "Stable Kahn topological sort"],
    },
    { label: "Backend", items: ["FastAPI", "Pydantic v2", "SQLAlchemy models", "HMAC session tokens"] },
    { label: "Frontend", items: ["Next.js (App Router)", "TypeScript", "Tailwind CSS", "React Three Fiber"] },
    { label: "Quality", items: ["48 backend tests", "36 frontend tests", "Typed API client", "GitHub Actions CI"] },
  ];

  return (
    <section className="border-y border-border bg-subtle">
      <div className="mx-auto max-w-[1120px] px-6 py-20">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-16">
          <div>
            <p className="text-caption text-tertiary">Engineering</p>
            <h2 className="max-w-[18ch] pt-3 text-[2rem] font-medium leading-tight tracking-[-0.025em] text-primary">
              The interesting part is the engine.
            </h2>
            <p className="max-w-[46ch] pt-4 text-body leading-relaxed text-secondary">
              Propagation is a pure function over a directed graph: same topology and
              same failure, same blast radius, every time. No model, no probability,
              nothing to retrain — and every number the interface shows can be traced
              back to a traversal you could do by hand.
            </p>
            <a
              href="https://github.com/jenil249"
              target="_blank"
              rel="noreferrer noopener"
              className="mt-6 inline-flex items-center gap-1.5 text-small font-medium text-accent transition-colors hover:text-accent-hover"
            >
              View the source
              <Icon name="external" size={13} />
            </a>
          </div>

          <dl className="grid grid-cols-2 gap-x-8 gap-y-7">
            {groups.map((g) => (
              <div key={g.label}>
                <dt className="border-b border-border pb-2 text-micro uppercase text-quaternary">
                  {g.label}
                </dt>
                <dd>
                  <ul className="space-y-1.5 pt-2.5">
                    {g.items.map((i) => (
                      <li key={i} className="text-small text-secondary">
                        {i}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- FAQ */

export function FAQ() {
  const qa = [
    {
      q: "Does PULSE monitor real systems?",
      a: "No. Every asset, metric and trend comes from a synthetic topology called NOVA COMMERCE, generated by a deterministic simulator. PULSE is a modelling and simulation tool, not an agent that connects to your warehouse.",
    },
    {
      q: "Is the blast radius predicted by a model?",
      a: "No, and deliberately so. It is a graph traversal: the origin takes a declared state, then descendants are visited in topological order, each taking the worst incoming state transformed by the failure's propagation mode. The same input always produces the same output.",
    },
    {
      q: "How is the resilience score calculated?",
      a: "It starts at 100 and subtracts capped penalties for structural weaknesses — single points of failure, blast concentration, source redundancy, dependency depth, incident history and recovery complexity. Every penalty and its maximum is shown in the interface.",
    },
    {
      q: "What does the authentication actually do?",
      a: "Credentials are verified server-side and the session is a real HMAC-signed, expiring token. But the account list is fixed, every demo account shares one published password, and roles are labels that do not restrict access. It is demo authentication and is labelled as such.",
    },
    {
      q: "Can I create my own scenarios?",
      a: "The scenario library is predefined and read-only, because the API exposes list and run but not create. The Chaos Lab is where you configure an arbitrary failure against any asset with your own parameters and duration.",
    },
    {
      q: "Why is there 3D at all?",
      a: "Because dependency structure is the product. The topology shows flow along real lineage paths, and stops it where a failure lands. Everywhere the 3D would be decorative — tables, lists, settings — there isn't any.",
    },
  ];

  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto max-w-[820px] px-6 py-20">
      <p className="text-caption text-tertiary">Questions</p>
      <h2 className="pt-3 text-[2rem] font-medium leading-tight tracking-[-0.025em] text-primary">
        What this is, precisely.
      </h2>

      <dl className="pt-10">
        {qa.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className="border-b border-border">
              <dt>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 py-4 text-left transition-colors duration-instant hover:text-primary"
                >
                  <span className="flex-1 text-body font-medium text-primary">{item.q}</span>
                  <Icon
                    name={isOpen ? "chevronDown" : "chevronRight"}
                    size={16}
                    className="shrink-0 text-quaternary"
                  />
                </button>
              </dt>
              {isOpen && (
                <dd className="max-w-[68ch] pb-5 text-small leading-relaxed text-secondary">
                  {item.a}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ footer */

export function SiteFooter() {
  const columns = [
    {
      label: "Product",
      links: [
        { href: "/control-room", text: "Control Room" },
        { href: "/scenarios", text: "Scenarios" },
        { href: "/chaos-lab", text: "Chaos Lab" },
        { href: "/resilience", text: "Resilience" },
        { href: "/incidents", text: "Incidents" },
        { href: "/compare", text: "Compare" },
      ],
    },
    {
      label: "Concepts",
      links: [
        { href: "/resilience", text: "Blast radius" },
        { href: "/resilience", text: "Single points of failure" },
        { href: "/scenarios", text: "Propagation modes" },
        { href: "/incidents", text: "Incident replay" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border bg-canvas">
      <div className="mx-auto max-w-[1120px] px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-sm bg-primary text-[11px] font-semibold text-canvas">
                P
              </span>
              <span className="text-body font-medium text-primary">PULSE</span>
            </div>
            <p className="max-w-[38ch] pt-3 text-small leading-relaxed text-secondary">
              An interactive infrastructure resilience and failure-propagation
              simulation prototype.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-4">
              <Badge>Simulated telemetry</Badge>
              <Badge>Demo authentication</Badge>
              <Badge>Deterministic engine</Badge>
            </div>
          </div>

          {columns.map((c) => (
            <nav key={c.label} aria-label={c.label}>
              <p className="text-micro uppercase text-quaternary">{c.label}</p>
              <ul className="space-y-2 pt-3">
                {c.links.map((l) => (
                  <li key={l.text}>
                    <Link
                      href={l.href}
                      className="text-small text-secondary transition-colors hover:text-primary"
                    >
                      {l.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <p className="text-caption text-quaternary">
            NOVA COMMERCE is a fictional company. All telemetry is simulated.
          </p>
          <p className="text-caption text-quaternary">
            Built as a portfolio project · {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}
