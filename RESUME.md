# PULSE — Resume Notes

**To continue this build:** open Claude Code in `D:\PULSE` and say **"continue building PULSE"**.
Everything needed is on disk. Read `docs/DESIGN.md` first (full A–N architecture).

---

## Product

**PULSE — Data Resilience Digital Twin.** *"See failure before it spreads."*
Model a data system as a dependency graph → simulate failures → compute
deterministic blast radius, recovery plan, resilience score.
Demo company: **NOVA COMMERCE** (43 assets, 47 dependencies). All telemetry is
**SIMULATED / DEMO** — never claim real monitoring.

## Confirmed visual identity (do not deviate)

- near-black / graphite base, layered depth, subtle volumetric haze
- **healthy** `#3FC8BC` · **degraded** `#C8933F` · **failed** `#C85A4E`
  · **stale** `#7E8A93` · **recovering** `#5FA8C8`
- soft neutral whites/greys for type
- NO purple AI gradients, NO cyberpunk/gaming HUD, NO heavy glassmorphism
- Reference (seunghyuk.com) informs **motion, pacing, composition, polish only** — never colors
- Metaphor: healthy = smooth flow · degraded = irregular flow · failed = stopped · recovery = returning

## Status — ALL MAJOR FEATURES BUILT ✅

| Phase | State |
|---|---|
| 1. Engine | ✅ deterministic, zero runtime deps |
| 2. API | ✅ FastAPI, all routes |
| 3. Control Room | ✅ 3D topology + systems panel + inspector |
| 4. Chaos Lab | ✅ configure/inject, hop-by-hop propagation |
| 5. Incident Replay | ✅ scrubable timeline drives topology |
| 6. Scenario Comparison | ✅ split config + proportional bars + verdict |
| 7. Cinematic Landing | ✅ 9 scenes, scroll-driven camera |
| 8. Responsive/a11y/perf | ✅ MobileRoom, MobileStory, cursor, offscreen pause |
| 9. Docker/CI/README/dbt/Airflow | ✅ (Docker authored but unrunnable here) |

**Tests: 35 backend + 13 frontend, all passing. Typecheck clean (incl. `--noUnusedLocals`). Build clean (7 routes).**

Per the stop condition: **no more major features.** Remaining work is bugs,
performance, testing, documentation and polish only.

## Verified end-to-end (screenshots taken while browser pane was visible)

- Control Room: topology renders, node selection focuses camera, Inspector shows
  Orders API with **0 upstream / 19 downstream** (matches engine)
- Chaos Lab: `stg_payments` schema drift → **8 downstream affected**, amber
  propagation, Exec Revenue Dashboard + Finance Team CRITICAL
- Compare: Payments 11/102 vs Orders 19/156 → **verdict 1.53×**
- Incident Replay: scrubbing to 15:00 shows the STALE cascade through payments
  lineage ending at "Fraud Detection Model becomes untrustworthy"
- Landing: scene 1 renders cinematically; scene 1→2 transition confirmed via DOM

## Known gaps / next steps

1. **Landing scenes 3–9 never visually verified.** The browser pane was hidden
   for the later part of the session, which pauses `requestAnimationFrame`, so
   scroll progress freezes and screenshots come back black. Camera keyframes in
   `components/marketing/CinematicScene.tsx` (`KEYS`) are reasoned but unproven —
   **open the landing page in a real browser and tune them.**
2. Keyboard navigation of the 3D graph (arrow-key traversal of lineage) would
   strengthen a11y beyond the current panel-based parity.
3. Docker compose/Dockerfiles authored but never executed (Docker not installed).
4. Incidents are in-memory; SQLAlchemy models exist but aren't wired up.

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

App → http://localhost:3000 · API docs → http://127.0.0.1:8000/docs

## Key engine facts (verified — don't re-derive)

- Resilience **65/100**, weakest = **Orders API** (19 downstream, 3 critical dashboards)
- Orders outage 19 affected / score 156 · Payments outage 11 / 102 → **1.53×**
- 8 SPOFs · 10 failure types → 3 modes: **STARVE / BREAK / CORRUPT**

## Environment notes

- Windows, Node 24, Python 3.12. **Docker NOT installed.**
- Next.js 16.3.4 + React 19.2.8 (upgraded off 15.1.6 for CVE-2025-66478).
- R3F v9 + drei v10 (drei v9 is incompatible with fiber 9).
- Tailwind JIT occasionally misses classes in newly created files → restart `npm run dev`.
- `next dev` regenerates `frontend/AGENTS.md` / `CLAUDE.md`; both are gitignored.
