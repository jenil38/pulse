/**
 * Design-system guardrails.
 *
 * The redesign moved PULSE away from a generic dark-glow SaaS look. These tests
 * read the actual source and fail if the patterns we removed creep back in —
 * the cheapest way to keep the direction from eroding over time.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "lib"];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  for (const d of DIRS) walk(join(ROOT, d));
  return out;
}

const FILES = sourceFiles().map((f) => ({
  path: f.replace(ROOT, "").replace(/\\/g, "/"),
  src: readFileSync(f, "utf8"),
}));

/** Strip comments so prose about a banned pattern doesn't fail the test. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The auth scene is the one place with a licence the rest of the app does not
 * have: it is a lit room, so it needs gradients for its lamps, vignette and
 * floor, and a panel large enough to carry a 20px radius. Confining that licence
 * to these files is what stops it leaking back into the product surfaces.
 */
const SCENE = /^\/(components\/auth|app\/(login|signup))\//;

describe("no AI-SaaS visual tropes", () => {
  it("uses no decorative gradients", () => {
    // Tailwind's gradient utilities are banned outright — a two-stop colour
    // wash is the single loudest tell of a generated marketing page.
    const bad = FILES.filter((f) => /gradient-to-|bg-gradient|\bvia-\[/.test(code(f.src)));
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it("uses raw CSS gradients only as light, in the auth scene", () => {
    // linear-/radial-gradient survive as lighting and masking primitives, not
    // as decoration, so they are allowed exactly where the room is built.
    const bad = FILES.filter(
      (f) => !SCENE.test(f.path) && /(linear|radial|conic)-gradient/.test(code(f.src))
    );
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it("routes translucency through the glass material, not ad-hoc blur", () => {
    // Panels use the `.glass` / `.glass-quiet` classes, which carry the tint,
    // edge and sheen together. A bare backdrop-blur produces the milky
    // rectangle that gives glassmorphism its bad name.
    const bad = FILES.filter((f) =>
      /backdrop-blur-(md|lg|xl|2xl|3xl)|bg-white\/\d0\s+backdrop/.test(code(f.src))
    );
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it("uses no glow or drop shadows outside the token system", () => {
    const bad = FILES.filter((f) =>
      /shadow-(sm|md|lg|xl|2xl)\b|drop-shadow|box-shadow:\s*0 0/.test(code(f.src))
    );
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it("uses no oversized border radii", () => {
    // The product ladder tops out at 16px (rounded-xl); 26px is never right.
    // rounded-2xl (20px) is allowed only on the auth scene's glass panels,
    // which are large enough for the corner to read as intended rather than
    // as the puffy card of a generated SaaS page.
    const bad = FILES.filter(
      (f) => /rounded-3xl/.test(code(f.src)) || (!SCENE.test(f.path) && /rounded-2xl/.test(code(f.src)))
    );
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it("uses no emissive materials in the 3D scenes", () => {
    // State is carried by colour and value, never by glow.
    const bad = FILES.filter((f) => /emissive/i.test(code(f.src)));
    expect(bad.map((f) => f.path)).toEqual([]);
  });
});

describe("token discipline", () => {
  it("hard-codes no hex colours in components", () => {
    // Every colour must resolve through a CSS variable so chaos mode works.
    const bad = FILES.filter(
      (f) => f.path.startsWith("/components") && /#[0-9a-fA-F]{6}\b/.test(code(f.src))
    );
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it("keeps monospace for data, not for everything", () => {
    // Before the redesign this was 158 occurrences across the app.
    const total = FILES.reduce(
      (n, f) => n + (code(f.src).match(/font-mono/g)?.length ?? 0),
      0
    );
    expect(total).toBeLessThan(45);
  });

  it("reserves uppercase for the micro label style", () => {
    // Previously 87 shouty labels; now caps belong to `text-micro` only.
    const shouty = FILES.reduce((n, f) => {
      const matches = code(f.src).match(/\buppercase\b/g)?.length ?? 0;
      const withMicro = code(f.src).match(/text-micro[^"'`]*uppercase|uppercase[^"'`]*text-micro/g)?.length ?? 0;
      return n + Math.max(0, matches - withMicro);
    }, 0);
    expect(shouty).toBeLessThan(6);
  });
});
