# PULSE — Resume Notes

**To continue:** open Claude Code in `D:\PULSE` and say **"continue building PULSE"**.
Read `docs/DESIGN-SYSTEM.md` (current visual direction) and `docs/DESIGN.md`
(product architecture) first.

---

## Product

**PULSE — Data Resilience Digital Twin.** *"See failure before it spreads."*
Model a data system as a dependency graph → simulate failures → compute
deterministic blast radius, recovery plan, resilience score.
Demo company **NOVA COMMERCE** (43 assets, 47 dependencies). All telemetry is
**SIMULATED / DEMO** — never claim real monitoring.

## Visual direction (v2 — CURRENT, do not revert)

Informed by **Linear** and **Raycast**; principles extracted, nothing copied.
Target ratio **70% professional product / 30% cinematic**.

- **Light is the default.** `--canvas #FCFCFD`, 4-step surface + 4-step text scales.
- **Colour means state.** Chrome is neutral; hue appears only for health or the
  single cobalt accent `#2B5CE0` on a primary action.
- **Structure before surfaces.** Sections, hairlines, lists, tables — a card must
  justify itself.
- **Motion must explain.** Flow, propagation, selection, navigation. Nothing else.
- Radius ladder tops out at 16px. Weight 510 for emphasis, never 700.
- **Chaos mode** (`data-mode="chaos"` on `<html>`) darkens the whole environment
  *only* while a simulation runs or an incident is replayed. This is the
  signature interaction; the contrast is the point.

**Banned** (enforced by `tests/design-system.test.ts`): gradients, glassmorphism,
glow/emissive, `rounded-2xl`+, hard-coded hex in components, mono-everywhere,
uppercase-everywhere.

## Status — APPLICATION COMPLETE ✅

**v4 (visual craft + telemetry)**
- time-series throughout: `engine/history.py` (deterministic, hash-seeded) plus
  `/health/history`, `/health/resilience-history`, `/incidents/stats/frequency`,
  `/assets/{id}/history`; `/health/metrics` carries a trend so the table draws
  43 sparklines from one request
- `components/ui/Chart.tsx`: Sparkline, AreaChart, BarSeries, StackedBar
- `OverviewPanel` fills the previously-empty inspector column
- visual pass: darker text scale (the UI read washed out), real elevation,
  roomier tables/panels
- topology: layout aspect 5.2:1 -> 2.6:1, node geometry +40%, three-point
  lighting, camera pulled in
- landing: 6.8 -> 10.2 viewports (capabilities with real UI fragments, how it
  works, engineering, FAQ, full footer)

**Tests: 48 backend + 36 frontend. Build clean (10 routes).**


**v3 (completeness pass)** added: demo authentication + login + user menu + route
guard, one shared responsive AppShell across every route (mobile drawer),
loading/error/retry primitives (`Async`, `ErrorState`, `ErrorBanner`, `useAsync`),
live simulation health counts, `/resilience` (score breakdown + SPOFs),
`/scenarios` (library, read/run only), topology reset + selected-node context +
smart labels, replay responsive + error states, palette/table/tab a11y, and a
five-scene scroll story on the landing.

**Tests: 48 backend + 36 frontend. Typecheck clean. Build clean (10 routes).**

### Earlier: REDESIGN COMPLETE ✅

| Phase | State |
|---|---|
| 1. Foundation (tokens, globals, fonts, mode) | ✅ |
| 2. Primitives (Button, Status, Badge, Table, Tabs, Property…) | ✅ |
| 3. Control Room (sidebar / toolbar / stage / table / inspector) | ✅ |
| 4. Command palette (⌘K, `/`) | ✅ |
| 5. Topology 2.5D + chaos-mode transition | ✅ |
| 6. Chaos Lab, Incidents, Replay, Compare | ✅ |
| 7. Landing | ✅ |
| 8. Responsive / MobileRoom | ✅ |
| 9. Accessibility (skip link, landmarks, focus trap/restore, aria-live) | ✅ |
| 10. Performance (indexed lookups, per-frame memo, DPR cap, offscreen pause) | ✅ |
| 11. QA | ✅ |

**Tests: 91 backend + 52 frontend. Typecheck clean. Build clean (13 routes).**

Discipline metrics (before → after): `font-mono` 158→22 · `uppercase` 87→8 ·
bordered panels 49→17 · gradients 0 · `rounded-2xl+` 0 · emissive 0.

## Verified visually

- Control Room: light, dense, Linear-like; sortable asset table; topology renders
  graphite-on-paper; inspector with tabs
- Chaos Lab → **Inject failure** → whole environment inverts to dark, topology
  gains depth, 8 affected / hop 4 of 4, "1 critical dashboard becomes
  untrustworthy · Finance Team, Risk Team impacted"
- Command palette: Navigate / Filter groups, asset search, ↑↓/⏎ footer
- Landing: real engine output (11 assets, real hop sequence)
- Mobile (375px): 2D room, no WebGL

## Known gaps

1. **Browser pane screenshots are unreliable** here (rAF pauses when the pane is
   not compositing), so WebGL frames often capture blank. DOM verification was
   used instead. Worth a real-browser pass on the landing hero + topology.
2. Docker compose/Dockerfiles authored but never executed (Docker not installed).
3. Incidents are in-memory; SQLAlchemy models exist but aren't wired up.

## Run it

```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```

```bash
cd frontend && npm run dev
```

```bash
python -m pytest backend/tests -q
```

```bash
cd frontend && npm test && npx tsc --noEmit && npm run build
```

## Key engine facts (verified — don't re-derive)

- Resilience **65/100**, weakest = **Orders API** (19 downstream, 3 critical dashboards)
- Orders outage 19 affected / score 156 · Payments outage 11 / 102 → **1.53×**
- 8 SPOFs · 10 failure types → 3 modes: **STARVE / BREAK / CORRUPT**

## Environment notes

- Windows, Node 24, Python 3.12. **Docker NOT installed.**
- Next.js 16.3.4 + React 19.2.8 · R3F v9 + drei v10.
- **Deleting components requires clearing `.next`** — Tailwind caches the file
  list and throws ENOENT on removed files otherwise.
- `next dev` regenerates `frontend/AGENTS.md` / `CLAUDE.md`; both are gitignored.
