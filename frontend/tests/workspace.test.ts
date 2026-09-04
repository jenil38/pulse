/**
 * Workspace guardrails.
 *
 * The product now holds many systems, and which one a request is about is
 * decided in exactly one place. These tests protect that: the type vocabulary
 * an import is allowed to use, and the invariant that nothing reaches the API
 * around the client that stamps the active system onto every call.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeComponentType } from "../lib/workspace";

const ROOT = join(__dirname, "..");

function sourceFiles(dirs: string[]): { path: string; src: string }[] {
  const out: { path: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) {
        out.push({
          path: full.replace(ROOT, "").replace(/\\/g, "/"),
          src: readFileSync(full, "utf8"),
        });
      }
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  return out;
}

/** Every `.py`/`.ts` file's source under an absolute directory. */
function sourceFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /\.(py|ts)$/.test(f))
    .map((f) => readFileSync(join(dir, f), "utf8"));
}

describe("component type vocabulary", () => {
  it("accepts PULSE's own node types, in any case", () => {
    expect(normalizeComponentType("SOURCE")).toBe("SOURCE");
    expect(normalizeComponentType("warehouse_table")).toBe("WAREHOUSE_TABLE");
    expect(normalizeComponentType("Dashboard")).toBe("DASHBOARD");
  });

  it("accepts the everyday words people write in a definition file", () => {
    // These are exactly the words the specification's own example JSON uses.
    expect(normalizeComponentType("service")).toBe("TRANSFORMATION");
    expect(normalizeComponentType("database")).toBe("WAREHOUSE_TABLE");
    expect(normalizeComponentType("api")).toBe("SOURCE");
    expect(normalizeComponentType("queue")).toBe("INGESTION");
    expect(normalizeComponentType("external-dependency")).toBe("SOURCE");
  });

  it("defaults an unstated type rather than failing the import", () => {
    expect(normalizeComponentType(undefined)).toBe("TRANSFORMATION");
    expect(normalizeComponentType("")).toBe("TRANSFORMATION");
  });

  it("refuses a word it does not know instead of guessing", () => {
    expect(normalizeComponentType("quantum-flux")).toBeNull();
    expect(normalizeComponentType("microservice-mesh")).toBeNull();
  });
});

describe("every request carries the active system", () => {
  it("routes all API traffic through the one client", () => {
    // A component calling fetch() directly would skip `scoped()` and read
    // whichever system the server defaults to — the demo — silently showing
    // sample data inside somebody's own workspace.
    const offenders = sourceFiles(["app", "components"]).filter((f) =>
      /\bfetch\s*\(/.test(f.src)
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("stamps the system onto analysis paths but not auth or workspace ones", () => {
    const api = readFileSync(join(ROOT, "lib/api.ts"), "utf8");
    expect(api).toMatch(/function scoped/);
    // Auth carries no system, and workspace routes name theirs in the path.
    expect(api).toMatch(/path\.startsWith\("\/auth"\)/);
    expect(api).toMatch(/path\.startsWith\("\/workspace"\)/);
    // And the single fetch call site goes through it.
    expect(api).toMatch(/fetch\(`\$\{BASE\}\/api\$\{scoped\(path\)\}`/);
  });

  it("keeps the landing page's test counts honest", () => {
    // The landing page states how many tests back the project. A number that
    // drifts as tests are added is a claim the repository no longer supports,
    // and it is the first thing a reviewer can check. So it is counted, not
    // trusted: `def test_` in backend/tests, `it(` in this directory.
    const quality = readFileSync(
      join(ROOT, "components/marketing/Sections.tsx"),
      "utf8"
    );

    const countIn = (dir: string, pattern: RegExp) =>
      sourceFilesIn(dir).reduce((n, f) => n + (f.match(pattern)?.length ?? 0), 0);

    // Anchored to the start of a line so a mention of `it(` in prose like this
    // one is not counted as a test.
    const backend = countIn(join(ROOT, "..", "backend", "tests"), /^def test_/gm);
    const frontend = countIn(join(ROOT, "tests"), /^\s*it\(/gm);

    expect(quality).toContain(`${backend} backend tests`);
    expect(quality).toContain(`${frontend} frontend tests`);
  });

  it("keeps the landing page pinned to the demo", () => {
    // The scroll story names Nova Commerce's own assets, so a signed-in
    // visitor's system must never be substituted into it.
    const landing = readFileSync(join(ROOT, "app/page.tsx"), "utf8");
    expect(landing).toMatch(/api\.demoTopology\(\)/);
    expect(landing).toMatch(/api\s*\n?\s*\.demoSimulate\(/);
    expect(landing).not.toMatch(/api\.topology\(\)/);
  });
});
