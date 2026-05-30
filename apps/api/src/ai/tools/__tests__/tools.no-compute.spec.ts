import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAT-02 read-only invariant. Statically asserts that no Ask FinSight
 * tool body imports from `scoring/` or invokes a compute/forecast path —
 * the structural guarantee that Gemini can never trigger a recompute or
 * see a freshly-invented number. Adding `import { scoreStock } from
 * "../../scoring"` to any tool makes this fail.
 *
 * Resolved from `process.cwd()` (vitest runs from `apps/api`) to stay
 * agnostic to CJS/ESM `__dirname` handling under the swc transform.
 */
const TOOLS_DIR = path.resolve(process.cwd(), "src/ai/tools");

const toolFiles = readdirSync(TOOLS_DIR)
  .filter((f) => f.endsWith(".tool.ts"))
  .map((f) => path.join(TOOLS_DIR, f));

describe("Tool registry — read-only invariant (CHAT-02)", () => {
  it("finds the 7 declared tools on disk", () => {
    expect(toolFiles).toHaveLength(7);
  });

  it.each(toolFiles)("%s does NOT import from scoring/", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/from\s+['"][^'"]*\/scoring(\/[^'"]*)?['"]/);
    expect(src).not.toMatch(/from\s+['"]\.\.\/\.\.\/scoring/);
  });

  it.each(toolFiles)("%s does NOT call a compute/forecast path", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/\.(compute|forecast|predict|recompute)\s*\(/);
  });

  it("tools.registry.ts does NOT import from scoring/", () => {
    const reg = readFileSync(path.join(TOOLS_DIR, "tools.registry.ts"), "utf8");
    // Match an actual import statement, not the word in a comment.
    expect(reg).not.toMatch(/from\s+['"][^'"]*\/scoring(\/[^'"]*)?['"]/);
  });
});
