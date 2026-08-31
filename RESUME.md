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

## Confirmed build order (user-specified)

1. ✅ Engine
2. ✅ API
3. ⏳ **Control Room**  ← current
4. Chaos Lab
5. Incident Replay
6. Scenario Comparison
7. Cinematic Landing Page
8. Responsive / mobile polish
9. Docker, CI, README, final polish

## Confirmed visual identity (do not deviate)

- near-black / graphite base, layered depth, subtle volumetric haze
- **healthy** = mineral cyan `#3FC8BC` · **degraded** = muted amber `#C8933F`
- **failed** = restrained red `#C85A4E` · **stale** = grey `#7E8A93` · **recovering** = `#5FA8C8`
- soft neutral whites/greys for type
- NO purple AI gradients, NO cyberpunk/gaming HUD, NO heavy glassmorphism
- Reference site (seunghyuk.com) informs **motion, pacing, composition, polish only** — never colors.
- Metaphor: healthy = smooth flow · degraded = irregular/slow flow · failed = stopped flow · recovery = flow returning

## Status

| Area | State |
|---|---|
| `backend/app/engine/` | ✅ done — deterministic, 0 runtime deps |
| `backend/app/api/` | ✅ done — FastAPI, all routes |
| `backend/tests/` | ✅ **35/35 passing** |
| `frontend/` | ⏳ scaffold + design tokens + api client + types done |
| Control Room | ⏳ in progress |
| Landing / Chaos Lab / Replay / Compare | ❌ not started |
| Docker / CI / README / dbt / airflow | ❌ not started |

## Run it

```bash
# backend  (from D:\PULSE)
python -m uvicorn backend.app.main:app --reload --port 8000
# tests
python -m pytest backend/tests -q
# frontend (from D:\PULSE\frontend)
npm run dev
```

Backend docs at http://127.0.0.1:8000/docs · frontend at http://localhost:3000

## Key engine facts (verified, don't re-derive)

- Resilience **65/100**, weakest = **Orders API** (19 downstream, 3 critical dashboards)
- Orders outage: 19 affected / score 156 · Payments outage: 11 affected / score 102
- → **Orders = 1.53× blast radius of Payments**
- 8 SPOFs detected
- 10 failure types → 3 propagation modes: **STARVE / BREAK / CORRUPT**

## Environment notes

- Windows, Node 24, Python 3.12. **Docker NOT installed** — author compose/Dockerfiles but they can't be run/verified here.
- Next.js 16.3.4 + React 19.2.8 (upgraded off 15.1.6 for CVE-2025-66478).
- R3F v9 + drei v10 (v9 drei is incompatible with fiber 9).
