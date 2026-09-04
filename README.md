# PULSE

**Data Resilience Digital Twin**

> **See failure before it spreads.**
> Break your data system before reality does.

PULSE is an **interactive infrastructure resilience and failure-propagation
simulation prototype**. It models a data platform as a dependency graph, then
lets you break it on purpose and computes — deterministically — exactly what
would go wrong downstream.

> **What this is, precisely.** All telemetry is SIMULATION data. PULSE does not
> monitor real systems and discovers nothing on its own — you describe your
> architecture to it, by hand or as JSON. The simulation engine is rule-based
> and deterministic (not machine learning or prediction), and authentication is
> demo authentication (see below). Nothing here is production infrastructure
> software.

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

## Workspaces: the demo and your own systems

PULSE holds many systems, and keeps a hard line between two kinds:

| | **Demo system** | **Your systems** |
|---|---|---|
| What it is | `NOVA COMMERCE` — a fictional e-commerce data platform, 43 assets | Whatever you build or import |
| Who owns it | Nobody; shared by every visitor | Exactly one account |
| Editable | No — read-only | Yes |
| Where it lives | Rebuilt from code on every boot, never persisted | `backend/data/workspace.json` |

A new account starts with an **empty workspace**. Nothing is copied into it from
the demo, and no placeholder systems or invented metrics are shown — the empty
state is the onboarding, offering *Create a system*, *Import JSON* and
*Explore the demo*.

**Ownership is enforced server-side, in one place.** Every route resolves its
system through `workspace.resolve(system_id, viewer)`
(`backend/app/api/workspace.py`), which returns a system only if it is the demo
or the viewer's own. Anything else raises, and the API answers **404 rather than
403** — so it never confirms that another account's system id exists. Ids
supplied by the frontend are never trusted; see `test_workspace.py` for the
cross-user tests.

### Getting a system in

Three inputs, and only three — PULSE does not discover infrastructure:

1. **The builder** — name components, choose types, declare dependencies.
2. **JSON import** — paste or upload a definition. Each edge reads
   `source depends on target`, so failure propagates from the target outward:

   ```json
   {
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
   }
   ```

   Failing `Payment DB` then reaches Payment Service, Order Service and the
   Website — computed by the same engine the demo uses, from your own graph.
   Types accept PULSE's own `NodeType` values or common words (`service`,
   `database`, `api`, `queue`, `storage`). Imports are validated for unknown
   references, duplicate names, self-edges, cycles and size before anything is
   saved.
3. **The demo**, for a system that is already interesting to break.

Simulations, blast radius, recovery plans, resilience scores, incidents and
saved scenarios all operate on the selected system. Scenarios and incidents
belong to the system they were created against and are never visible from
another.

---

## Product demo

| Surface | What it proves |
|---|---|
| **Sign up / Sign in** | Register a real account (PBKDF2, per-user salt) or use a seeded demo login; both issue a signed, expiring token |
| **Systems** | Your own workspace — create, import, open, delete; intentional empty state |
| **Builder** | Components, types and dependencies, validated server-side |
| **Control Room** | 2.5D topology, live health rollups, dense asset table, asset inspector |
| **Scenarios** | The demo's curated library, or the ones you saved against your system |
| **Resilience** | Full score breakdown, contributing factors, and every single point of failure |
| **Chaos Lab** | Configure and inject a failure; watch propagation travel the graph hop by hop |
| **Incident Replay** | Scrub a timeline and watch the failure spread and recover |
| **Scenario Comparison** | Quantified verdict: *"Orders DB outage has 1.53× greater blast radius"* |
| **Landing** | A five-scene scroll story driven by the real engine output |

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
| `incident_history` | 10 | the system's own incidents in the last 30 days, and how many are still unresolved |
| `recovery_complexity` | 8 | average recovery steps for a critical consumer |

Five of the six are read straight off your graph. The sixth, `incident_history`,
is the only one that needs a record of the past, and **a system is only ever
scored against its own**: a system you just created has no incidents, so that
penalty is zero and the score says so. Recording an incident in the Chaos Lab is
what creates it. The demo carries a stated history (2 recent, 1 unresolved) so
that it scores the 65 documented above; no system you build inherits it.

**No machine learning, no invented probability, no fake precision.**

## Technology Stack

**Backend** — Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy models (unused — see Limitations)
**Engine** — pure Python directed graph (stable Kahn topological sort, BFS traversals)
**Data** — dbt models + contracts · Airflow DAG mirroring the topology · SQL
**Frontend** — Next.js 16 · React 19 · TypeScript · Tailwind · React Three Fiber · Framer Motion · Zustand
**Persistence** — a JSON file (`backend/data/workspace.json`). Postgres is *not*
used; the SQLAlchemy models describe that path but nothing imports them.
**Infra** — Docker Compose (unverified — see below) · GitHub Actions running
pytest, `tsc --noEmit`, the frontend tests and a production build

## Authentication

PULSE has **two ways in**, and both are verified server-side
(`backend/app/api/auth.py`) rather than faked in the browser:

**Register an account** — `POST /api/auth/register`. This is the normal path
and the one the product is built around. The password you choose is salted with
16 fresh random bytes and hashed with PBKDF2-HMAC-SHA256 (120,000 rounds); the
salt and hash are stored, the password never is. Registering signs you straight
in and gives you an empty workspace that is yours.

**Or use a seeded demo account** — three fixed accounts share one published
password so a reviewer never has to sign up to look around.

| Account | Role | Password |
|---|---|---|
| `analyst@pulse.demo` | Analyst | `pulse-demo` |
| `operator@pulse.demo` | Operator | `pulse-demo` |
| `admin@pulse.demo` | Admin | `pulse-demo` |

Either way the session is a real **HMAC-signed, expiring token** (12h),
verified with a constant-time comparison on every protected request; tampered
and expired tokens are rejected.

What is deliberately **not** production-grade, and why it is fair to call this
demo authentication:

- `SECRET_KEY` defaults to a well-known development value — anyone who reads
  the source can forge a token unless it is set in the environment
- the token is stored in `localStorage`/`sessionStorage`, not an httpOnly
  cookie, so it is reachable from JavaScript
- there is **no rate limiting** on login or registration, and registration is
  capped only by a blunt 200-account ceiling
- there is no password reset, email verification or key rotation
- accounts live in a JSON file, not a user store
- the three seeded demo accounts share one constant salt (registered accounts
  each get their own random one)
- **roles are labels only.** Ownership is enforced and tested; Analyst /
  Operator / Admin do not restrict anything. There is no RBAC behind them.

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

No database is required. The engine runs in memory, and systems you create are
written to `backend/data/workspace.json` (override the directory with
`PULSE_DATA_DIR`). Deleting that file resets every workspace and account; the
demo system is rebuilt from code and is never stored there, so it cannot be
lost. There is no migration to run.

### Configuration

Three environment variables are all that stand between the local setup above
and a hosted one:

| Variable | Default | Set it when |
|---|---|---|
| `SECRET_KEY` | `pulse-dev-secret-not-for-production` | **Always, off localhost.** Session tokens are signed with it; the default is published in this repository, so anyone could forge one. |
| `CORS_ORIGINS` | `http://localhost:3000` | The frontend is served from anywhere else. Comma-separated. |
| `PULSE_DATA_DIR` | `backend/data` | The working directory is not writable or not durable — a container, for instance. |

`DATABASE_URL` is read into settings but **nothing connects to it**; it is there
for the SQLAlchemy path that is not wired up.

## Docker

```bash
docker compose up --build
```

The compose file mounts a named volume at `PULSE_DATA_DIR` so created systems
survive a rebuild, and passes `SECRET_KEY` through from the environment.

> Docker was **not installed** on the development machine, so the compose file
> and Dockerfiles are provided and reviewed but have not been executed
> end-to-end. The non-Docker path above is the verified one.

## Testing

```bash
python -m pytest backend/tests -q
```

**91 tests, all passing** — 15 engine, 20 API, 20 auth, 35 workspace,
1 camera-framing:

- graph traversal, acyclicity, ancestors/descendants
- blast-radius propagation per mode, unaffected-branch isolation
- determinism (same input → same output)
- recovery ordering (origin first, consumers verified after rebuilds, backfill only for STARVE)
- resilience score range, penalty accounting, SPOF detection
- all six demo scenarios, timeline ordering
- API validation (404s, 422s, 409 on double-resolve) and the full incident lifecycle
- registration, login, token signing/expiry/tampering, case-insensitive emails
- **workspace isolation**: a new account is empty; another account's system
  answers 404 from every route that touches it — read, rename, replace, delete,
  topology, health, resilience, incidents, scenarios and simulations
- **import validation**: unknown references, cycles, duplicate names, self-edges,
  unknown component types, empty systems, and the dry-run validate endpoint
- **simulation on the user's own graph**: propagation reaches the right nodes and
  stops at the edge of an unrelated branch
- **resilience history is the system's own**: a new system takes no incident
  penalty, recording one creates it, resolving it releases part of it, and the
  score on the workspace card matches the Resilience screen
- **persistence**: systems and the accounts that own them survive a store reload
- **layout**: a system whose components share one type still reads left-to-right
  (depth staging), while the demo stays staged by component type
- landing camera framing: every scene's subject is geometrically proven to be on
  screen by projecting all 43 nodes through each keyframe's perspective frustum
  (`backend/tools/check_camera_framing.py`)

Frontend:

```bash
cd frontend && npm test && npx tsc --noEmit && npm run build
```

**52 tests passing**, typecheck clean (including `--noUnusedLocals`), 13 routes
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
- keyboard lineage traversal: deterministic upstream/downstream walks that
  terminate at roots, and branch cycling that visits every alternative once
- the workspace guardrails: the component-type vocabulary an import may use, and
  the build-breaking check that **no component calls `fetch` directly** — going
  around `lib/api.ts` would skip the active-system stamp and silently render
  demo data inside somebody's own workspace

## Demo Scenarios

These six ship with the **demo system** only. Scenarios you save against your
own system are yours, listed on the same screen, and re-runnable.

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
- **Topology is authored, not discovered.** You describe your system in the
  builder or as JSON. There is no AWS, Kubernetes, OpenTelemetry or Terraform
  integration, and none is implied anywhere in the product. A production version
  would parse dbt manifests, warehouse query logs or Airflow DAGs.
- **Persistence is a JSON file, not a database.** SQLAlchemy models exist for the
  Postgres path but are unused. The file is adequate for a prototype and would
  not survive concurrent writes from multiple API processes.
- **Ownership is enforced; roles are not.** A user can only reach their own
  systems, and that is tested. But the Analyst/Operator/Admin labels are
  cosmetic — there is no RBAC behind them.
- **Simulated telemetry is generated for every system**, including yours. It is
  deterministic from the component id and labelled SIMULATED throughout; it is
  not a measurement of anything you run.
- **dbt/Airflow assets are illustrative.** They show the shape of the pipeline the
  twin represents; they are not wired to a live warehouse.
- **No rate limiting** on login or registration, and sessions live in
  `localStorage` rather than an httpOnly cookie. Both are listed under
  Authentication above; neither is production-appropriate.
- **The demo's incident history is stated, not accumulated** — two recent, one
  unresolved, which is what puts its score at 65. Your own systems are scored
  only on incidents you actually recorded, starting from none.
- **Docker unverified** (see above).
- Propagation timing (180s per hop) is a presentation choice, not a measurement.

## Future Improvements

- Build the graph automatically from a dbt `manifest.json`
- Move the workspace store from JSON to Postgres using the existing SQLAlchemy models
- Weight blast radius by real business metrics (revenue per dashboard, SLA tier)
- Alternate-path modelling so redundancy actually reduces the SPOF count
- Real RBAC behind the role labels, and sharing a system with a team

---

*PULSE is a portfolio project. The engine, API and tests are real; the data is synthetic and labelled as such throughout the product.*
