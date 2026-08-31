# PULSE — Design & Architecture

> **Data Resilience Digital Twin** — *See failure before it spreads.*
> This document is the "First Output" (sections A–N). It is the contract the
> implementation follows. Telemetry in PULSE is **SIMULATION / DEMO** data.

---

## A. Reference Website Analysis — *seunghyuk.com ("well · dots · lines · planes")*

Studied live. The reference is an Awwwards / FWA award winner. Its design system:

| Dimension | What the reference does | What PULSE borrows (adapted, not copied) |
|---|---|---|
| **Palette** | Monochrome: ink-black ↔ paper-white, full-bleed inversions between scenes | A near-monochrome graphite/paper base + **restrained state accents** (teal/amber/red) that only appear where the product logic needs them |
| **Hero object** | One tiny geometric primitive (dot → line → plane) centered, everything orbits it | The **data system itself** is the hero object — a 3D dependency graph |
| **Atmosphere** | Film-grain/noise texture, soft vignette, deep negative space | Subtle grain + volumetric fog "server-room" depth; no stars, no neon grids |
| **Motion** | Damped WebGL camera, long scroll distances between beats, weighted easing | Damped/spring camera, scroll-driven scene progression, no bounce/no idle float |
| **Typography** | Hairline uppercase letter-spaced sans; editorial corner metadata | Editorial display type for marketing; compact mono/technical type in-product |
| **Interaction** | "Scroll or drag to explore"; click-to-focus; contextual cursor; sound toggle | Scroll = travelling through infrastructure; contextual cursor (EXPLORE/INSPECT/SIMULATE/TRACE); optional muted sound |
| **Pacing** | Cinematic, gallery-like, one idea per viewport, generous holds | One narrative beat per scroll scene; failure/recovery told as a story |
| **Structure** | Fixed canvas, virtualised scroll driving a single 3D scene | One WebGL context; scroll progress drives camera + graph state |

**Principle inherited:** *the beauty comes from the subject being animated, not from decoration layered on top.* In PULSE the subject is the data system and its failure propagation.

---

## B. PULSE Product Architecture

Three surfaces over one deterministic engine:

```
                    ┌───────────────────────────────────────────┐
                    │             FAILURE-SIM ENGINE             │
                    │  topology · graph · blast radius ·         │
                    │  recovery · resilience · scenarios         │  (pure Python, 0 deps, tested)
                    └───────────────────────────────────────────┘
                        ▲                 ▲                 ▲
             ┌──────────┴──────┐  ┌───────┴───────┐  ┌──────┴──────────┐
             │  FastAPI REST   │  │  Seed / dbt    │  │  Airflow-style  │
             │  + Pydantic     │  │  demo topology │  │  run simulator  │
             └──────────┬──────┘  └───────────────┘  └─────────────────┘
                        │ JSON
             ┌──────────┴───────────────────────────────────────────────┐
             │                    Next.js (App Router)                    │
             │  Marketing (cinematic scroll story, R3F)                   │
             │  Control Room · Asset Inspector · Chaos Lab ·              │
             │  Scenario Compare · Incident Replay  (React Three Fiber)   │
             └────────────────────────────────────────────────────────────┘
```

Marketing site is *cinematic*; the authenticated app dials intensity down but keeps the 3D topology as the primary object with practical UI around it.

---

## C. User Flow

```
Landing (cinematic scroll story) ──▶ ENTER SYSTEM ──▶ Control Room
                                                          │
   ┌──────────────────────────────────────┬──────────────┼───────────────┐
   ▼                                       ▼              ▼               ▼
Asset Inspector  ── SIMULATE FAILURE ──▶ Chaos Lab   Scenario Compare  Incident Replay
   │  (lineage, health, consumers)         │ (target/type/param/run)    (scrub timeline)
   └──────────── VIEW LINEAGE / INCIDENTS ─┘
                          │
                          ▼
             Blast radius ▶ Business impact ▶ Recovery plan ▶ Resolve
```

Core question at every step: **"What breaks if this fails?"**

---

## D. Backend Architecture

- **FastAPI** app, routers per resource, **Pydantic v2** schemas, dependency-injected DB session.
- **Engine** (`app/engine/`) is framework-free and imported by the API — the API is a thin transport layer over deterministic functions.
- **SQLAlchemy 2.0** models + **PostgreSQL** (SQLite fallback for local/dev/tests) persist organizations, systems, assets, dependencies, health metrics, simulations, incidents, recovery steps.
- **Seed**: the Nova Commerce topology is loaded from the engine into the DB idempotently.
- Blast radius / recovery / resilience are always computed **from the graph**, never stored as UI strings.

---

## E. Database Model

```
organizations(id, name, slug)
users(id, org_id, email, name, role)
systems(id, org_id, name, domain)                         -- Payments, Commerce, …
assets(id, system_id, key, name, type, criticality,
       owner, description, health_state, last_updated)
dependencies(id, upstream_asset_id, downstream_asset_id, kind)
health_metrics(id, asset_id, ts, freshness_s, row_volume,
       null_ratio, schema_version, latency_ms, run_status) -- SIMULATED
pipeline_runs(id, asset_id, started_at, finished_at, status, rows)
simulation_scenarios(id, org_id, name, origin_asset_id,
       failure_type, params_json)
simulations(id, scenario_id, origin_asset_id, failure_type,
       duration_min, created_at, result_json)              -- cached engine output
simulation_events(id, simulation_id, t_seconds, asset_id, label, kind)
incidents(id, org_id, origin_asset_id, failure_type, status,
       started_at, acknowledged_at, resolved_at, resilience_before)
incident_events(id, incident_id, t_seconds, asset_id, label, kind)
recovery_steps(id, incident_id, ordinal, action, target_asset_id, kind, done)
business_consumers(id, asset_id, team, process)            -- derived from TEAM/BP nodes
```

`asset.type ∈ {SOURCE, INGESTION, RAW_TABLE, TRANSFORMATION, WAREHOUSE_TABLE, DATA_MODEL, DASHBOARD, ML_MODEL, BUSINESS_PROCESS, TEAM}`.

---

## F. Failure Simulation Engine  ✅ *built & tested*

Ten failure types, each mapped to exactly one **propagation mode**:

| Mode | Failure types | Effect on downstream |
|---|---|---|
| **STARVE** | source_outage, api_latency, warehouse_delay, stale_data | data assets → **STALE** (no fresh data) |
| **BREAK** | schema_drift, transformation_failure, datatype_change | transformations → **FAILED**, other tables → **DEGRADED** |
| **CORRUPT** | null_spike, duplicate_spike, volume_drop | data assets → **DEGRADED** (wrong values) |

- Dashboards / ML never "fail" — they become **untrustworthy** (DEGRADED + flag).
- Business processes / teams become **impacted**.
- The origin takes a declared `ORIGIN_STATE`; a node is only affected if ≥1 upstream is affected → unrelated branches stay **HEALTHY**.

Example: `stg_payments.amount DECIMAL → STRING` (schema drift, BREAK) →
`fact_payments` DEGRADED → `daily_revenue` DEGRADED → **Executive Revenue Dashboard UNTRUSTWORTHY** → Finance Team impacted.

---

## G. Blast Radius Logic  ✅ *built & tested*

1. Origin = `ORIGIN_STATE[failure_type]`.
2. Walk descendants in **topological order** (stable Kahn); each node takes the **worst incoming state** transformed by its `PropagationMode` + node type.
3. Classify per-node **severity** = f(criticality weight × state rank), with consumer escalation.
4. Aggregate: affected assets, critical dashboards, ML models, business processes, teams.
5. **Blast score** = Σ(criticality_weight × state_rank) → single comparable number.
6. Recovery order = reverse of propagation (restore origin → topological rebuild → verify consumers).

Verified on Nova Commerce: **Orders outage 19 affected / score 156 / 3 critical dashboards** vs **Payments outage 11 / 102 / 1** → **Orders = 1.53× blast radius**. Deterministic (same input → same output).

---

## H. 3D Visual System

- **One WebGL context** (React Three Fiber). Nodes are `InstancedMesh` by type:

| Node type | Geometry treatment |
|---|---|
| SOURCE | faceted octahedron (external origin) |
| INGESTION / TRANSFORMATION | thin connector prism |
| RAW / WAREHOUSE TABLE | structured block / stacked slab |
| DATA_MODEL | layered lens |
| DASHBOARD | thin display plane |
| ML_MODEL | subdivided icosphere |
| BUSINESS_PROCESS / TEAM | grounded marker |

- **Edges**: directional shader lines carrying **flow particles** *along real dependency paths* — HEALTHY steady, DEGRADED slow/irregular amber, FAILED stopped, RECOVERING resuming.
- **State language**: HEALTHY cool teal-neutral · DEGRADED muted amber · FAILED restrained red · RECOVERING animated return. No HUD, no glow spam.
- Layout: layered by pipeline stage (sources → … → consumers) with a force-relaxed depth; damped `OrbitControls` clamp.
- Performance: capped DPR, instancing, frustum-culled particles, pause when offscreen / `prefers-reduced-motion`.

---

## I. Landing Page Storyboard (scroll-driven, 9 scenes)

| Scene | Beat | Camera / graph |
|---|---|---|
| 1 Dark system | near-black, tiny signals; **PULSE / See failure before it spreads** | pinhole on a single node |
| 2 Sources appear | Orders/Payments/Inventory/Customers/Marketing float in | pull back, sources ignite |
| 3 Data flow | particles flow source→ingest→raw→transform→warehouse→dashboard | dolly along the pipe |
| 4 Healthy system | full topology, everything flowing — *"Your business runs on invisible dependencies."* | wide establishing orbit |
| 5 Failure | **Payments API** degrades, flow stops | push toward origin |
| 6 Blast radius | downstream nodes illuminate in sequence — *"7 downstream assets affected."* | slow pull-back |
| 7 Business impact | trail resolves to **Executive Revenue Dashboard → Finance Team** — *"A broken column can become a broken decision."* | rack focus to consumer |
| 8 Recovery | recovery path activates, nodes return to healthy | reverse sweep |
| 9 Final | **Map. Break. Understand. Recover.** → **OPEN CONTROL ROOM** | settle wide |

Scroll drives camera + graph state via a normalized progress value; never hard-hijacked (native scroll with damping).

---

## J. Control Room Design

Three-pane, topology-first:

```
┌── Systems / Assets ──┬──────── 3D Topology (hero) ────────┬── Inspector ──┐
│ health rollups       │  live-ish simulated health          │ selected node │
│ systems tree         │  click node → select                │ lineage       │
│ active incidents     │  failure overlay when simulating    │ actions       │
│ simulations          │                                     │               │
└──────────────────────┴─────────────────────────────────────┴───────────────┘
Top strip: resilience score · healthy/degraded/failed counts · active incidents
```

Cinematic intensity reduced; grain/fog subtle; interactions crisp and practical.

---

## K. Chaos Lab Design

```
┌──── Configure ────┬──────── Topology reacts ────────┬──── Predicted impact ────┐
│ TARGET (asset)    │  origin pulses, propagation      │ affected assets          │
│ FAILURE TYPE      │  sweeps downstream in hop order  │ critical dashboards      │
│ PARAMETERS        │  edges change flow state         │ business teams           │
│ DURATION          │                                  │ recovery order           │
│ [ RUN SIMULATION ]│                                  │ severity + blast score   │
└───────────────────┴──────────────────────────────────┴──────────────────────────┘
```

Safe simulation only — never mutates real data. Example: `payments.amount DECIMAL→STRING, 30 min → INJECT`.

---

## L. Responsive Plan

| Breakpoint | Experience |
|---|---|
| **Desktop** | full 3D topology, particles, cinematic scroll |
| **Tablet** | reduced depth/particle count, simplified camera |
| **Mobile** | **2D-first**: lineage cards, dependency lists, incident timelines, a simplified 2D graph (SVG) — no forced WebGL |

Contextual cursor is desktop-only. 3D is always an *enhancement* over an accessible 2D baseline.

---

## M. Performance Plan

One WebGL context · dynamic `import()` for 3D scenes · `InstancedMesh` · capped `dpr=[1,2]` · particle budget · frustum culling · pause offscreen & on `prefers-reduced-motion` · no runaway rAF (frameloop gated) · route-level code splitting · engine results cached per (origin, failure_type).

---

## N. Exact File Structure

```
PULSE/
├─ backend/
│  ├─ app/
│  │  ├─ engine/            ✅ topology, graph, states, blast_radius,
│  │  │                        recovery, resilience, scenarios, simulation
│  │  ├─ api/               routers: systems, assets, health, simulations,
│  │  │                        incidents, recovery, scenarios, auth
│  │  ├─ db/                base, session, models, seed
│  │  ├─ schemas/           pydantic models
│  │  ├─ core/              config, security
│  │  └─ main.py            FastAPI app factory
│  ├─ tests/                ✅ test_engine.py (+ api, incident lifecycle)
│  ├─ requirements.txt / pyproject.toml
│  └─ Dockerfile
├─ frontend/
│  ├─ app/                  (marketing) / control-room / chaos-lab /
│  │                        compare / incidents/[id]
│  ├─ components/           three/ (Scene, Nodes, Edges, Particles, Camera),
│  │                        ui/, marketing/ (scenes 1-9), room/
│  ├─ lib/                  api client, topology store (zustand), state colors
│  ├─ hooks/                useScrollProgress, useReducedMotion, useCursor
│  ├─ package.json · tailwind.config · tsconfig
│  └─ Dockerfile
├─ data/                    dbt/ (staging+marts sql), airflow/ (dag), sample csv
├─ docs/                    DESIGN.md (this) · ENGINE.md · API.md
├─ .github/workflows/ci.yml
├─ docker-compose.yml
└─ README.md
```

---

## Visual identity (CONFIRMED)

Borrow the reference **only** for motion quality, pacing, spatial composition,
transitions and premium polish — **never its colors**. PULSE owns its identity:

- **Base**: near-black / graphite, layered depth, soft volumetric haze, physically
  believable light (no purple AI gradients, no cyberpunk HUD, no heavy glassmorphism).
- **Healthy / data-flow**: cool **teal / mineral cyan**.
- **Degraded**: **muted amber**.
- **Failed**: **restrained red**.
- **Typography**: soft neutral whites / greys.

The metaphor is the product itself: healthy = smooth flowing data · degraded =
irregular/slower flow · failed = broken/stopped flow · recovery = flow returning.

## Build phases & stop condition (CONFIRMED ORDER)

1. ✅ **Engine** (deterministic core) + tests.
2. **API** (FastAPI + Pydantic + SQLite/Postgres seed) + API tests.  ← *in progress*
3. **Control Room** (primary product surface + Asset Inspector) — proves topology,
   health, selection, blast radius & simulation wiring end-to-end first.
4. **Chaos Lab.**
5. **Incident Replay.**
6. **Scenario Comparison.**
7. **Cinematic Landing** (9 scenes, scroll choreography).
8. **Responsive/mobile 2D, a11y, perf pass.**
9. **Docker, CI, README, demo scenarios, polish.**

Then **stop adding features** → bugs, performance, tests, docs, portfolio polish.
