# PULSE — Design System v2

> Revision brief: move from "generic AI SaaS" to a **70% professional product /
> 30% cinematic** system, informed by Linear and Raycast — principles extracted,
> nothing copied.

---

## 1. Current UI problems

Audited across 26 `.tsx` files. These are counts, not impressions:

| Problem | Evidence | Why it reads as AI-generated |
|---|---|---|
| **Mono is the default, not the exception** | **158** `font-mono` usages | Real products use mono for IDs, metrics and timestamps only. Using it everywhere flattens hierarchy into one texture. |
| **Uppercase + wide tracking everywhere** | **87** `uppercase tracking-[0.1–0.22em]` | Every label shouts equally, so nothing leads. Linear/Raycast use sentence case and reserve caps for rare column headers. |
| **Everything is a bordered box** | **49** bordered panels | Structure comes from boxes rather than hierarchy, spacing and rules. Produces the "floating card grid" look. |
| **Dark-by-default as a premium shortcut** | `bg-void` / `bg-panel` / `bg-base` throughout | Dark + neon accents is the single most recognisable AI-dashboard signature. |
| **Decorative atmosphere** | `grain` overlay, `haze` radial gradients (9 uses) | Neither communicates system state; both are "premium" costume. |
| **Emissive glow as the state channel** | `emissiveIntensity` pulsing in the 3D nodes | Reads as a gaming HUD, not an engineering instrument. |
| **No type scale** | Sizes are ad-hoc `text-[9px]`…`text-[13px]` | No rhythm, so nothing feels deliberate. |
| **Symmetric three-column dashboard** | Control Room, Chaos Lab | The default LLM layout. Linear's power comes from asymmetry and density. |
| **No command surface** | none | The single strongest signal of a keyboard-first professional tool is missing. |

**Also true right now:** a partial light-editorial redesign was started, so **262
references to deleted tokens** (`bg-void`, `border-line`, `text-ink-dim`, …)
remain. The frontend is mid-migration and must be finished as part of this work.

---

## 2. What to learn from Linear

Measured from the live site, not recalled:

| Token | Value | Principle |
|---|---|---|
| Background scale | `#08090a` → `#1c1c1f` → `#232326` → `#28282c` | **Exactly 4 surface steps.** Elevation is a small, finite ladder — not arbitrary. |
| Text scale | `#f7f8f8` → `#d0d6e0` → `#8a8f98` → `#62666d` | **4 text weights of emphasis.** Hierarchy is carried by *value*, not size or caps. |
| Borders | `#23252a`, `#34343a`, plus `#ffffff0d` / `#ffffff14` | Translucent hairlines that sit *on* the surface rather than fencing it. |
| Weight | `--font-weight-medium: 510` | **510, not 600/700.** Emphasis without shouting — the most copyable detail here. |
| Display type | 64px / lh 1.0 / **-1.4px tracking** | Large type gets *negative* tracking and 1.0 line-height. |
| Radius | `--border-radius: 8px` | One base radius. Pills reserved for chips. |
| Controls | 28px and 32px heights, 13–14px text | Compact, consistent control sizing. |
| Semantic colour | `bg` ~96% L, `border` ~87% L, `text` ~45% L | Status = **triad** (tint bg + border + saturated text), never a solid block. |
| Layout | `--page-max-width: 1024px` | Marketing is narrow and readable, not full-bleed. |

**The meta-lesson:** Linear's hero visual is *the actual product UI* — dense
issue lists, real IDs (`ENG-2085`), status counts, a properties panel. It sells
by showing the tool working, not by abstract 3D. Density plus hierarchy reads as
premium; big glowing cards do not.

---

## 3. What to learn from Raycast

| Token | Value | Principle |
|---|---|---|
| Radius scale | 0 / 4 / 6 / **8** / 12 / 16 / 20 / 24 | A named ladder with a clear default (8px). |
| Spacing scale | 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 56 / 64 / 80 / 96 … | 8px rhythm with 4px half-steps. Nothing arbitrary. |
| Foreground scale | `#f4f4f6` → `#c2c7ca` → `#78787c` → `#5e6366` | Again **4 steps**. Two independent sources converging on 4 is a strong signal. |
| Semantic + tint | `--color-red: #ff6161` with `--color-red-transparent: #ff616126` | Every semantic colour ships with a **15% alpha tint** for chip backgrounds. |
| Type usage | `14px/500` used **128×**, then `16px/400`, `14px/600`, `24px/500`, `11px/500` | One workhorse size (14px medium). Metadata at 11–12px. Very few sizes total. |
| Containers | 746 / 1064 / 1204 / 1280 | Content width is chosen per section, not one global max. |

**The meta-lesson:** Raycast's polish comes from *restraint plus consistency* —
a tiny type palette, one radius ladder, and gradients used only as accents on
key art. Keyboard-first framing (shortcuts shown inline) makes it feel like a
tool for professionals.

---

## 4. New PULSE design system

**Positioning:** an engineering instrument. It should communicate **precision,
control, reliability, clarity** — the aesthetic of an oscilloscope or a wind
tunnel, not a spaceship.

Four rules that govern everything:

1. **Light is the default.** The professional product is a bright, precise
   workspace. Dark is *earned* by the Chaos/simulation mode.
2. **Colour means state.** Chrome is neutral. Hue appears only for health,
   severity, or the single accent on a primary action.
3. **Structure before surfaces.** Prefer sections, rules, lists and tables.
   A card must justify itself by grouping genuinely related things.
4. **Motion must explain.** If an animation doesn't communicate flow,
   dependency, selection, propagation, or navigation — it's cut.

**Final quality test** (from the brief): strip gradients → still professional;
strip 3D → still an excellent app; disable animation → hierarchy still clear.

---

## 5. New colour system

### 5.1 Product mode (default — light)

```
SURFACES  (4 steps)
canvas    #FCFCFD    app background
surface   #FFFFFF    panels, rows, raised content
subtle    #F6F7F9    hover, inset, table zebra
muted     #EDEFF3    selected, pressed

BORDERS
border-subtle   #ECEEF1    internal dividers
border          #E1E4E9    default hairline
border-strong   #C8CDD5    inputs, emphasis

TEXT  (4 steps — hierarchy by value)
text-primary     #16181D
text-secondary   #4A5058
text-tertiary    #737985    metadata
text-quaternary  #9BA1AB    disabled / faint

ACCENT — deep cobalt (single product accent)
accent          #2B5CE0
accent-hover    #2450C7
accent-active   #1D44AE
accent-subtle   #EFF3FE    tint background
accent-border   #C6D6FA
accent-text     #1E4BC0    on tint
```

### 5.2 Semantic states — the triad pattern

Following Linear: each state is **tint bg + border + saturated text**, never a
solid colour block. `dot` is the small status indicator.

| State | text / dot | border | tint bg |
|---|---|---|---|
| **Healthy** | `#0F7D5C` | `#A9E2C9` | `#ECFAF4` |
| **Degraded** | `#A45B00` | `#F0CE8E` | `#FDF6E8` |
| **Failed** | `#C13B2C` | `#F2BBB4` | `#FDF1EF` |
| **Recovering** | `#2563C7` | `#BBD1F5` | `#F0F5FE` |
| **Stale** | `#737985` | `#E1E4E9` | `#F6F7F9` |

Healthy is a restrained green-teal — present but quiet, because a healthy system
should not demand attention.

### 5.3 Chaos mode (dark — simulation only)

Not a theme toggle. A **deliberate environment shift** when a simulation runs.

```
canvas   #0B0D10     surface  #14171B
subtle   #1B1F24     muted    #242A31
border   #232830     border-strong #313842
text     #F2F4F7 / #B7BEC8 / #838B96 / #626A75

STATE (raised luminance so it carries on dark)
healthy #3FD1A0   degraded #EBAE3C   failed #FF6B5B   recovering #5BA6FF
```

Same hues, re-tuned for the ground they sit on — so the state language survives
the transition and the *meaning* never changes.

---

## 6. Typography system

**Faces — two, with strict jobs:**

- **Inter** (variable) — all interface and marketing text.
- **JetBrains Mono** — *only* asset IDs, metrics, timestamps, schema versions,
  and keyboard shortcuts. Everything else is Inter.

This alone removes 158 mono usages down to roughly 30 legitimate ones.

**Scale** (weights: 400 regular, 510 medium, 600 semibold — never 700):

| Token | Size / line-height / tracking / weight | Use |
|---|---|---|
| `display-xl` | 60 / 1.0 / −0.03em / 500 | landing hero only |
| `display` | 40 / 1.05 / −0.025em / 500 | landing section heads |
| `title-lg` | 28 / 1.15 / −0.02em / 510 | page titles |
| `title` | 20 / 1.3 / −0.015em / 510 | panel titles |
| `heading` | 16 / 1.4 / −0.01em / 510 | section heads, inspector name |
| **`body`** | **14 / 1.5 / 0 / 400** | **the workhorse** |
| `body-med` | 14 / 1.5 / 0 / 510 | buttons, active nav, table headers |
| `small` | 13 / 1.45 / 0 / 400 | secondary UI, dense rows |
| `caption` | 12 / 1.35 / 0 / 400 | metadata |
| `micro` | 11 / 1.3 / +0.02em / 510 | column labels, badges (**sentence case**) |
| `mono` | 12 / 1.4 / 0 / 400 tabular | IDs, metrics, timestamps |

**Rules:** uppercase is allowed only on `micro` badges and table column headers —
nowhere else. Tracking is negative above 20px, zero in body, slightly positive
only at 11px. All comparable numbers use `tabular-nums`.

---

## 7. Surface / border / radius system

**Radius ladder** — one scale, default 8:

```
xs  4   badges, dots, tiny chips
sm  6   inputs, small buttons
md  8   DEFAULT — buttons, panels, dropdowns, menu items
lg  12  modals, command palette, drawers
xl  16  large visual surfaces (topology stage) — only when justified
full    status pills only
```

Nothing above 16px. No 20–30px "AI SaaS" corners.

**Elevation** — three levels, and shadows are nearly invisible:

```
flat      no shadow; separated by a hairline        ← default for panels
raised    0 1px 2px rgba(16,24,40,.05)              ← dropdowns, popovers
overlay   0 12px 32px rgba(16,24,40,.12)            ← command palette, modals
```

No blur, no glass, no glow, no gradient borders.

**Control heights:** 24 (xs) / 28 (sm) / 32 (md, default) / 36 (lg).
**Spacing:** 4px base — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96.
**Density target:** table rows 32–36px; list rows 28–32px.

**Card policy:** a card exists only when it groups genuinely related content that
needs a boundary. Default is a **section**: a heading, a hairline, content.

---

## 8. Motion system

```
instant  100ms   colour, hover, focus ring
fast     150ms   selection, tab switch, chip change
base     200ms   dropdown, popover, inline expand
slow     300ms   inspector/drawer, panel transition
mode     600ms   Normal ⇄ Chaos environment shift (the one exception)

standard  cubic-bezier(0.2, 0, 0, 1)      enter / move
exit      cubic-bezier(0.4, 0, 1, 1)      leave
```

**Permitted animations** (each explains something):
data flow along edges · failure propagation by hop · selection & focus ·
panel/drawer entry · mode transition · number transitions on recompute.

**Banned:** idle floating, decorative particles, looping glows, parallax for its
own sake, spring bounce, anything that animates on load without meaning.

Everything respects `prefers-reduced-motion`.

---

## 9. Professional vs cinematic breakdown

| Surface | Professional | Cinematic | Notes |
|---|---|---|---|
| Landing | 55% | 45% | Expressive hero + scroll story; the rest is clean product storytelling |
| Control Room (normal) | 90% | 10% | 2.5D topology with flow motion; everything else is precise product UI |
| Control Room (chaos) | 40% | 60% | Dark environment, depth, propagation — earned drama |
| Chaos Lab | 60% | 40% | Config/impact panels professional; the stage is cinematic |
| Incident Replay | 65% | 35% | Timeline + event log professional; topology replay cinematic |
| Scenario Compare | 90% | 10% | Data comparison — essentially no cinematic content |
| Incidents list / settings | 100% | 0% | Pure product |
| **App average** | **~80%** | **~20%** | |
| **Overall** | **~70%** | **~30%** | |

**Signature interaction — the mode shift.** In the Control Room the user hits
`Simulate failure`. Over 600ms the canvas darkens, surfaces recede, the topology
gains depth and the flow becomes prominent. The failure propagates. On exit, the
UI returns to the bright professional workspace. The *contrast* is the drama —
which is only possible because the default state is genuinely light and calm.

---

## 10. Exact components to redesign

**Foundation (new)**
- `tailwind.config.ts` — full token rebuild (colours, type scale, radius, shadow, motion)
- `app/globals.css` — remove `grain` + `haze`; light base; type utilities
- `app/layout.tsx` — Inter + JetBrains Mono; drop the serif
- `lib/theme.ts` *(new)* — mode context (`normal` | `chaos`) + CSS-variable switching
- `lib/visual.ts` — state triads for both modes

**Primitives (rewrite `components/ui/`)**
- `Button` (primary/secondary/ghost/danger; 4 sizes) · `StatusDot` · `Badge`
- `Field` / `Input` / `Select` · `Tabs` · `Tooltip` · `Kbd` *(new)*
- `Table` *(new — dense, sortable, selectable rows)* · `Section` *(new — replaces cards)*
- `Drawer` *(new)* · `EmptyState` *(new)*
- **Delete:** `SimulatedTag` styling, `StateBar`, `PanelHeading` (replaced by `Section`)

**New features**
- `CommandPalette` — ⌘K: open system, search asset, simulate failure, view
  lineage, open Chaos Lab, view incidents, compare scenarios, replay incident
- `useHotkeys` — global keyboard registry with a discoverable shortcut sheet

**Control Room**
- `NavRail` → proper sidebar: workspace header, sections, counts, active states
- `SystemsPanel` → dense tree/list with inline status + counts (no bordered boxes)
- `Inspector` → Linear-style properties panel: label/value rows, tabs, contextual actions
- `StatusBar` → compact toolbar with breadcrumb, filters, `⌘K` affordance
- `TopologyLegend` → inline caption, not a floating overlay

**Topology**
- `TopologyScene` → 2.5D default: orthographic-leaning camera, flat matte nodes,
  clear left-to-right stage progression, labels always legible on light
- `NodeMesh` → matte materials, no emission; state via fill + a thin ring
- `FlowEdges` → graphite edges on light; particles retained (they explain flow)
- `ChaosStage` *(new)* → the dark cinematic variant + mode transition

**Other surfaces**
- `chaos-lab` — config panel → proper form controls; impact → dense table
- `incidents` — list → real table with status, severity, assignee, duration
- `incidents/[id]` — replay timeline restyled; event log as a proper feed
- `compare` — comparison table + restrained bars, no cinematic treatment
- Landing — rebuilt: strong type, breathing room, product-truthful visuals

**Tests to update**
- `tests/logic.test.ts` — palette assertions now target the new tokens
- Add `tests/theme.test.ts` — state triads exist and stay legible in both modes

---

## Build order

1. Foundation: tokens, globals, fonts, theme context, `visual.ts`
2. Primitives library
3. Control Room (sidebar, list, inspector, toolbar)
4. Command palette + hotkeys
5. Topology 2.5D + chaos-mode transition
6. Chaos Lab, Incidents, Replay, Compare
7. Landing
8. Responsive, microinteraction pass, tests

Backend and simulation engine are **not touched**.
