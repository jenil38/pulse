# PULSE

**Data Resilience Digital Twin**

> **See failure before it spreads.**
> Break your data system before reality does.

PULSE models a company's data platform as a living dependency network, then lets
you **break it on purpose** — simulating failures and computing, deterministically,
exactly what would go wrong downstream.

> **All telemetry in PULSE is SIMULATION / DEMO data** generated from a synthetic
> topology (NOVA COMMERCE). PULSE does not monitor real external systems, and
> simulations never touch real data.

---

## What it does

PULSE answers one question precisely:

> **"What will break if this component fails?"**

- **Map** a data system as a directed dependency graph — sources, ingestion, raw
  tables, transformations, warehouse tables, models, dashboards, ML systems,
  business processes and teams.
- **Simulate** ten failure types against any node, before they happen.
- **Compute** the blast radius: which assets degrade, which dashboards become
  untrustworthy, which teams are affected — with an explainable severity per node.
- **Plan recovery** in dependency order, generated from the topology.
- **Score resilience** 0–100 with a fully documented, ML-free formula.
- **Compare** two failure scenarios to find the real single point of failure.
- **Replay** past incidents on a scrubable timeline.

## Why it exists

Most data-quality tools tell you something *already* broke. The interesting
question is the one you can answer *before* an outage: which single component is
the biggest liability, and what does its failure actually cost?

Lineage graphs show you connections. PULSE shows you **consequences**.

---

## Product demo

| Surface | What it proves |
|---|---|
| **Control Room** | Live 3D topology, health rollups, asset inspector with real lineage counts |
| **Chaos Lab** | Configure and inject a failure; watch propagation travel the graph hop by hop |
| **Incident Replay** | Scrub a timeline and watch the failure spread and recover |
| **Scenario Comparison** | Quantified verdict: *"Orders DB outage has 1.53× greater blast radius"* |
| **Landing** | A nine-scene scroll film of one system failing and recovering |

### Verified demo numbers

Computed by the engine on the NOVA COMMERCE topology (43 assets, 47 dependencies):

```
SYSTEM RESILIENCE            65 / 100
Weakest component            Orders API
Reason                       19 downstream assets, 3 critical dashboards,
                             limited redundancy

Payments API outage          11 assets · blast score 102 · 1 critical dashboard · 2 teams
Orders API outage            19 assets · blast score 156 · 3 critical dashboards · 4 teams
Verdict                      Orders outage = 1.53× the blast radius of Payments

Single points of failure     8
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  FAILURE-SIMULATION ENGINE   (pure Python, zero deps)     │
│  graph · states · blast_radius · recovery · resilience    │
│  scenarios · simulation · health · layout · topology      │
└──────────────────────────────────────────────────────────┘
                          ▲
              ┌───────────┴────────────┐
              │  FastAPI + Pydantic v2 │  REST, all telemetry tagged SIMULATED
              └───────────┬────────────┘
                          │ JSON
        ┌─────────────────┴──────────────────┐
        │  Next.js 16 · React 19 · Tailwind  │
        │  React Three Fiber (one WebGL ctx) │
        │  Control Room · Chaos Lab ·        │
        │  Incident Replay · Compare · Film  │
        └────────────────────────────────────┘
```

The engine is framework-free and has **no runtime dependencies** — the API is a
thin transport layer over deterministic functions, which is what makes the whole
system testable.

## Digital Twin

The topology (`backend/app/engine/topology.py`) is deliberately cross-wired so
the graph has genuine structural weaknesses:

```
Payments API → ingestion → raw_payments → stg_payments → fact_payments ─┐
                                                                        ├→ daily_revenue → Executive Revenue Dashboard → Board Reporting → Finance
Orders API  → ingestion → raw_orders  → stg_orders  → fact_orders ─────┤
                                                                        ├→ customer_metrics     → Customer Analytics Dashboard → Growth
                                                                        ├→ marketing_attribution → Marketing Dashboard        → Marketing
                                                                        └→ Demand Forecast Model → Stock Replenishment        → Operations
```

`daily_revenue` needs **both** payments and orders, so either failing makes the
Executive Revenue Dashboard untrustworthy — which is why both register as SPOFs.

## Failure Simulation

Ten failure types, each mapped to exactly one **propagation mode**:

| Mode | Failure types | Downstream effect |
|---|---|---|
| **STARVE** | source outage · API latency · warehouse delay · stale data | data assets → **STALE** |
| **BREAK** | schema drift · transformation failure · datatype change | transformations → **FAILED**, tables → **DEGRADED** |
| **CORRUPT** | null spike · duplicate spike · volume drop | data assets → **DEGRADED** |

Dashboards and ML models never "fail" — they become **untrustworthy**. Teams and
business processes become **impacted**.

```
stg_payments   amount: DECIMAL → STRING     ✕ FAILED
   ↓
fact_payments                               ⚠ DEGRADED
   ↓
daily_revenue                               ⚠ DEGRADED
   ↓
Executive Revenue Dashboard                 ⚠ UNTRUSTWORTHY
   ↓
Finance Team                                ⚠ IMPACTED
```

## Blast Radius

Deterministic, and never faked:

1. Origin takes its declared `ORIGIN_STATE`.
2. Descendants are walked in **topological order** (stable Kahn sort).
3. Each node takes the **worst incoming state**, transformed by the failure's
   propagation mode and the node's type.
4. A node is affected only if ≥1 upstream is affected — unrelated branches stay healthy.
5. Severity = f(criticality weight × state rank), with consumer escalation.
6. **Blast score** = Σ(criticality × state severity) → one comparable number.

Same input always produces the same output (there is a test for exactly this).

## Recovery Planning

Generated **from the topology**, not hardcoded UI text: restore the origin →
validate landed data → backfill (STARVE-mode failures only) → rebuild every
affected data asset in dependency order → verify each consumer → notify teams
and resolve.

## Resilience Score

`score = 100 − penalties`, every component returned in the API response:

| Component | Max | Basis |
|---|---|---|
| `single_points_of_failure` | 18 | nodes whose failure degrades a critical consumer |
| `blast_concentration` | 12 | share of critical consumers depending on one source |
| `source_redundancy` | 8 | critical consumers with no alternate source |
| `dependency_depth` | 10 | average depth to critical consumers |
| `incident_history` | 10 | recent incidents & stale pipelines (demo values) |
| `recovery_complexity` | 8 | average recovery steps for a critical consumer |

**No machine learning, no invented probability, no fake precision.**

## Technology Stack

**Backend** — Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy · PostgreSQL
**Engine** — pure Python directed graph (stable Kahn topological sort, BFS traversals)
**Data** — dbt models + contracts · Airflow DAG mirroring the topology · SQL
**Frontend** — Next.js 16 · React 19 · TypeScript · Tailwind · React Three Fiber · Framer Motion · Zustand
**Infra** — Docker Compose · GitHub Actions

## Local Setup

Requires Python 3.12+ and Node 20+.

```bash
pip install -r backend/requirements.txt
```

```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

- App → http://localhost:3000
- API docs → http://127.0.0.1:8000/docs

No database is required for the demo — the engine and API run entirely in memory.

## Docker

```bash
docker compose up --build
```

> Docker was **not installed** on the development machine, so the compose file
> and Dockerfiles are provided and reviewed but have not been executed
> end-to-end. The non-Docker path above is the verified one.

## Testing

```bash
python -m pytest backend/tests -q
```

**35 tests, all passing** — 15 engine, 20 API:

- graph traversal, acyclicity, ancestors/descendants
- blast-radius propagation per mode, unaffected-branch isolation
- determinism (same input → same output)
- recovery ordering (origin first, consumers verified after rebuilds, backfill only for STARVE)
- resilience score range, penalty accounting, SPOF detection
- all six demo scenarios, timeline ordering
- API validation (404s, 422s, 409 on double-resolve) and the full incident lifecycle

Frontend:

```bash
cd frontend && npm test && npx tsc --noEmit && npm run build
```

**31 tests passing**, typecheck clean (including `--noUnusedLocals`), 7 routes
build successfully. The frontend tests guard the parts where a silent regression
would change what the product *communicates*:

- the flow metaphor (healthy flows evenly, degraded stutters, failed stops)
- the confirmed PULSE palette (so it can't drift back toward the reference site)
- distinct geometry per node type
- scroll choreography: contiguous scene coverage, and the regression guard that
  kept the hero headline visible at scroll position zero
- the landing camera path: no NaNs, no hard cuts, keyframes hit exactly, and the
  blast-radius pull-back stays the film's largest gesture
- story phases: the system is fully revealed before the failure starts, fully
  propagated before recovery begins, and fully recovered by the final scene

## Demo Scenarios

| # | Scenario | Target | Type |
|---|---|---|---|
| 1 | Payments schema drift | `stg_payments` | `amount: DECIMAL → STRING` |
| 2 | Orders source outage | `src_orders` | Orders API unreachable |
| 3 | Inventory freshness delay | `src_inventory` | snapshot age > 24h |
| 4 | Customer ID null spike | `stg_customers` | null ratio → 22% |
| 5 | Revenue transformation failure | `daily_revenue` | model build error |
| 6 | Orders volume collapse | `src_orders` | row count −87% |

Each has a deterministic, reproducible impact.

## Limitations

Stated plainly, because overclaiming would undermine the point of the project:

- **Telemetry is simulated.** PULSE does not connect to Stripe, a warehouse, or
  any real system. Health metrics come from a deterministic generator.
- **Topology is authored, not discovered.** A production version would parse dbt
  manifests, warehouse query logs or Airflow DAGs to build the graph.
- **Incidents are in-memory.** SQLAlchemy models exist for the Postgres path, but
  the demo runs without a database.
- **No authentication.** There is a single implicit demo organisation.
- **dbt/Airflow assets are illustrative.** They show the shape of the pipeline the
  twin represents; they are not wired to a live warehouse.
- **Docker unverified** (see above).
- Propagation timing (180s per hop) is a presentation choice, not a measurement.

## Future Improvements

- Build the graph automatically from a dbt `manifest.json`
- Persist incidents/simulations to Postgres and expose historical resilience trends
- Weight blast radius by real business metrics (revenue per dashboard, SLA tier)
- Alternate-path modelling so redundancy actually reduces the SPOF count
- Multi-tenant auth and per-team ownership views

---

*PULSE is a portfolio project. The engine, API and tests are real; the data is synthetic and labelled as such throughout the product.*
