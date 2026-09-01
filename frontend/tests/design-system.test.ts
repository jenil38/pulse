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

describe("no AI-SaaS visual tropes", () => {
  it("uses no gradients", () => {
    const bad = FILES.filter((f) => /gradient-to-|bg-gradient|linear-gradient/.test(code(f.src)));
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it("uses no glassmorphism or heavy blur", () => {
    // A light backdrop-blur on a sticky header is fine; blur panels are not.
    const bad = FILES.filter((f) => /backdrop-blur-(md|lg|xl|2xl|3xl)|bg-white\/\d0\s+backdrop/.test(code(f.src)));
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it("uses no glow or drop shadows outside the token system", () => {
    const bad = FILES.filter((f) =>
      /shadow-(sm|md|lg|xl|2xl)\b|drop-shadow|box-shadow:\s*0 0/.test(code(f.src))
    );
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it("uses no oversized border radii", () => {
    // The ladder tops out at 16px (rounded-xl). rounded-2xl/3xl are the
    // giveaway of generated SaaS cards.
    const bad = FILES.filter((f) => /rounded-(2xl|3xl)/.test(code(f.src)));
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
