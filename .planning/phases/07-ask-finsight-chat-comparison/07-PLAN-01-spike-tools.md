---
phase: 07-ask-finsight-chat-comparison
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [CHAT-02]
files_modified:
  - apps/api/package.json
  - apps/api/src/ai/__spikes__/streaming-tools.spike.ts
  - apps/api/src/ai/__spikes__/README.md
  - apps/api/src/ai/tools/tool.types.ts
  - apps/api/src/ai/tools/tools.registry.ts
  - apps/api/src/ai/tools/get-instrument-score.tool.ts
  - apps/api/src/ai/tools/get-instrument-fundamentals.tool.ts
  - apps/api/src/ai/tools/get-instrument-technicals.tool.ts
  - apps/api/src/ai/tools/get-fund-returns.tool.ts
  - apps/api/src/ai/tools/get-recent-news.tool.ts
  - apps/api/src/ai/tools/compare-peers.tool.ts
  - apps/api/src/ai/tools/search-instruments.tool.ts
  - apps/api/src/ai/tools/__tests__/tool.types.spec.ts
  - apps/api/src/ai/tools/__tests__/get-instrument-score.tool.spec.ts
  - apps/api/src/ai/tools/__tests__/get-instrument-fundamentals.tool.spec.ts
  - apps/api/src/ai/tools/__tests__/get-instrument-technicals.tool.spec.ts
  - apps/api/src/ai/tools/__tests__/get-fund-returns.tool.spec.ts
  - apps/api/src/ai/tools/__tests__/get-recent-news.tool.spec.ts
  - apps/api/src/ai/tools/__tests__/compare-peers.tool.spec.ts
  - apps/api/src/ai/tools/__tests__/search-instruments.tool.spec.ts
  - apps/api/src/ai/tools/__tests__/tools.no-compute.spec.ts
  - apps/api/src/ai/ai.module.ts

must_haves:
  truths:
    - "A runnable spike file proves the @google/genai 2.6 streaming + function-calling chunk shape against a real Gemini key, with the actual chunk transcript committed to the repo."
    - "The tool registry exposes the 7 named read-only tools (getInstrumentScore, getInstrumentFundamentals, getInstrumentTechnicals, getFundReturns, getRecentNews, comparePeers, searchInstruments)."
    - "Every tool returns the uniform shape { data, sourceTag, asOfDate, dataVersionHash }."
    - "A CI lint test fails if any file under apps/api/src/ai/tools/** imports from apps/api/src/scoring/**."
    - "Tools read persisted Mongo data via existing repos only — no recomputation, no Gemini calls inside tool handlers."
  artifacts:
    - path: "apps/api/src/ai/__spikes__/streaming-tools.spike.ts"
      provides: "Verified streaming + function-calling reference loop"
      contains: "generateContentStream"
    - path: "apps/api/src/ai/tools/tool.types.ts"
      provides: "ToolDefinition<TArgs,TData> + ToolResult<T> + ToolContext + ToolError types"
      exports: ["ToolDefinition", "ToolResult", "ToolContext", "ToolError"]
    - path: "apps/api/src/ai/tools/tools.registry.ts"
      provides: "TOOL_REGISTRY with declarations[] and execute(fc, ctx)"
      exports: ["TOOL_REGISTRY", "ALL_TOOLS"]
    - path: "apps/api/src/ai/tools/__tests__/tools.no-compute.spec.ts"
      provides: "CI lint enforcing tool-body never imports from scoring/"
      contains: "scoring"
  key_links:
    - from: "apps/api/src/ai/tools/get-instrument-score.tool.ts"
      to: "apps/api/src/stocks/stocks.repo.ts"
      via: "ctx.stocksRepo.getLatestScore"
      pattern: "stocksRepo\\.(getLatestScore|getFundamentals|getTechnicals)"
    - from: "apps/api/src/ai/tools/get-fund-returns.tool.ts"
      to: "apps/api/src/funds/funds.repo.ts"
      via: "ctx.fundsRepo.getReturns"
      pattern: "fundsRepo\\.getReturns"
    - from: "apps/api/src/ai/tools/get-recent-news.tool.ts"
      to: "apps/api/src/news/news.repo.ts + apps/api/src/sentiment/sentiment.repo.ts"
      via: "ctx.newsRepo.listRecent + ctx.sentimentRepo.getForArticles"
      pattern: "newsRepo\\.listRecent"
    - from: "apps/api/src/ai/tools/search-instruments.tool.ts"
      to: "apps/api/src/search/search.service.ts"
      via: "ctx.searchService.autocomplete (Atlas Search from Phase 5)"
      pattern: "searchService\\.autocomplete"
    - from: "apps/api/src/ai/ai.module.ts"
      to: "apps/api/src/ai/tools/tools.registry.ts"
      via: "module providers/exports TOOL_REGISTRY"
      pattern: "TOOL_REGISTRY"
---

<objective>
Wave-0 spike to verify the @google/genai 2.6 streaming + function-calling loop chunk shape against a live Gemini key (closes Research Assumptions A1, A2), then implement the typed read-only tool registry that physically enforces the "Gemini never computes a number" invariant. The CI lint test asserting no `ai/tools/**` imports from `scoring/**` ships with this plan.

Purpose: De-risk the most uncertain piece (streaming + tools interleave) before Plan 02 builds the production SSE handler on top, and lock down the tool registry contract that Plan 02's chat loop, Plan 03's history persistence, and Plan 04's comparison endpoint will all consume.

Output: Reference spike artifact, 7 typed tool definitions, TOOL_REGISTRY with execute(), uniform ToolResult shape, CI lint test, AIModule wiring.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/research/SUMMARY.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/phases/07-ask-finsight-chat-comparison/07-RESEARCH.md

<decision_coverage_matrix>
Phase 7 requirement → Plan/Task mapping (every REQ-ID lands in exactly one plan):

| REQ-ID   | Plan | Task | Full/Partial | Notes |
|----------|------|------|--------------|-------|
| CHAT-01  | 02   | 1,2  | Full         | SSE endpoint + Gemini streaming + N-turn loop + heartbeats + abort |
| CHAT-02  | 01   | 2,3  | Full         | Read-only tool registry + CI lint enforcing no scoring/ imports |
| CHAT-03  | 02   | 2    | Partial      | Streaming sanitiser FSM + refusal taxonomy enum (in-stream) |
| CHAT-03  | 03   | 1    | Finalisation | Citation validator + persisted citations in ChatSession |
| CHAT-04  | 02   | 2,3  | Full         | Pre-stream refusal classifier + in-stream FSM detection + RefusalCategory enum |
| CHAT-05  | 03   | 2,3  | Full         | ChatSession Mongo schema + history list/get APIs + chat UI past-conversations |
| STOCK-07 | 04   | 1,2  | Full         | One-shot generateContent + responseJsonSchema + compare controller + compare UI |
</decision_coverage_matrix>

<interfaces>
Interfaces this plan consumes from prior phases (already exist; do not re-create):

```typescript
// From apps/api/src/stocks/stocks.repo.ts (Phase 4)
export interface StocksRepo {
  getLatestScore(symbol: string): Promise<{
    value: number;
    verdict: 'STRONG_SCORE' | 'CAUTION' | 'WEAK_SCORE';
    pillars: PillarBreakdown;
    computedAt: Date;
    dataVersionHash: string;
  } | null>;
  getFundamentals(symbol: string): Promise<{ pe, pb, roe, roce, debtEquity, marketCap, asOf: Date } | null>;
  getTechnicals(symbol: string): Promise<{ rsi, macdSignal, dma50, dma200, beta, asOf: Date } | null>;
  getPeers(symbol: string, count: number): Promise<{ symbol, name, score, sector }[]>;
}

// From apps/api/src/funds/funds.repo.ts (Phase 4)
export interface FundsRepo {
  getReturns(schemeCode: string): Promise<{
    returns: { '1y': number; '3y': number; '5y': number; '10y': number };
    benchmarkReturns: { '1y': number; '3y': number; '5y': number; '10y': number };
    category: string;
    asOf: Date;
  } | null>;
}

// From apps/api/src/news/news.repo.ts + apps/api/src/sentiment/sentiment.repo.ts (Phase 6)
export interface NewsRepo {
  listRecent(symbol: string, sinceDays: number): Promise<{ title, url, publishedAt: Date, articleId: string }[]>;
}
export interface SentimentRepo {
  getForArticles(articleIds: string[]): Promise<Record<string, 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'>>;
}

// From apps/api/src/search/search.service.ts (Phase 5)
export interface SearchService {
  autocomplete(query: string, limit: number): Promise<{ symbol, name, type: 'stock' | 'fund', price?: number, nav?: number }[]>;
}

// From apps/api/src/ai/ai.module.ts (Phase 4 — extend, do NOT replace)
// AIModule already exists with the private gemini.client.ts facade and ComplianceInterceptor wiring.
// This plan adds the tools/ subdirectory and re-exports TOOL_REGISTRY from ai.module.ts providers.
```

Interfaces this plan PRODUCES (consumed by Plan 02 + Plan 04):

```typescript
// apps/api/src/ai/tools/tool.types.ts
export interface ToolContext {
  stocksRepo: StocksRepo;
  fundsRepo: FundsRepo;
  newsRepo: NewsRepo;
  sentimentRepo: SentimentRepo;
  searchService: SearchService;
  userId: string;
  scope: { type: 'stock' | 'fund' | 'portfolio' | 'compare'; symbols: string[] };
}

export interface ToolResult<T> {
  data: T;
  sourceTag: string;          // e.g., "score:stock:RELIANCE.NS"
  asOfDate: Date;
  dataVersionHash: string;    // links to last EOD recompute
}

export interface ToolDefinition<TArgs, TData> {
  declaration: FunctionDeclaration; // @google/genai shape
  handler: (args: TArgs, ctx: ToolContext) => Promise<ToolResult<TData>>;
}

export class ToolError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_ARGS' | 'UNKNOWN_TOOL' | 'NO_SCORE_YET', message?: string);
}

// apps/api/src/ai/tools/tools.registry.ts
export const TOOL_REGISTRY: {
  declarations: FunctionDeclaration[];                                 // passed to Gemini config.tools
  execute(fc: { name: string; args: unknown }, ctx: ToolContext): Promise<ToolResult<unknown>>;
};
export const ALL_TOOLS: Record<string, ToolDefinition<any, any>>;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wave-0 spike — verify Gemini 2.6 streaming + function-calling chunk shape</name>
  <files>
    apps/api/package.json
    apps/api/src/ai/__spikes__/streaming-tools.spike.ts
    apps/api/src/ai/__spikes__/README.md
  </files>
  <action>
    Add `nanoid@^5` to apps/api/package.json (Plan 02 + Plan 03 need it; install now so subsequent plans have it). `@google/genai@^2.6.0` is already installed from Phase 4.

    Create `apps/api/src/ai/__spikes__/streaming-tools.spike.ts` as a runnable Node script (NOT a Jest test, NOT a NestJS module — pure standalone). Goals (closes RESEARCH Assumptions A1 + A2):

    1. Instantiate `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })`.
    2. Define ONE FunctionDeclaration named `getInstrumentScore` with parameters `{ symbolOrSchemeCode: string, type: 'stock'|'fund' }`.
    3. Call `ai.models.generateContentStream({ model: 'gemini-2.5-flash', contents, config: { tools: [{ functionDeclarations: [decl] }], systemInstruction: 'You are a research analyst. Use the getInstrumentScore tool when asked about a stock.' } })` with the user prompt: `"What is the FinSight Score for RELIANCE.NS?"`.
    4. `for await (const chunk of stream)` loop — LOG every chunk verbatim using `JSON.stringify(chunk, null, 2)` so we can SEE whether the SDK exposes `chunk.functionCalls`, `chunk.candidates[0].content.parts[].functionCall`, or both. Also log `chunk.text` access patterns.
    5. When a functionCall chunk arrives: build a hardcoded fake response `{ score: 7.2, verdict: 'STRONG_SCORE', pillarBreakdown: {...}, asOfDate: '2026-05-28' }`, append a Content turn of role `'user'` with `parts: [{ functionResponse: { name: 'getInstrumentScore', response: { ... } } }]`, and recurse by calling `generateContentStream` again with the appended history.
    6. Cap the recursion at 5 iterations. Log "tool turn N" before each.
    7. On final text chunks, accumulate and print the full assistant text at the end.
    8. Wrap entire body in try/catch; on error log `{ message, name, stack: stack.split('\n')[0] }` (no stack flooding).

    Also try the higher-level `ai.chats.create({ ... })` API IF it exists in 2.6 — call it with `tools` and `systemInstruction`, then `chat.sendMessageStream(...)`. Log whether automatic function calling fires. If `ai.chats` doesn't expose streaming + automatic tool execution, document that in the README and stay with the manual interleave loop. (Research §Pattern B documents both possibilities.)

    Add `apps/api/src/ai/__spikes__/README.md` with:
    - How to run: `GEMINI_API_KEY=xxx tsx apps/api/src/ai/__spikes__/streaming-tools.spike.ts`
    - Findings section (fill in after running): chunk shape, whether `ai.chats` works, decision: "manual interleave" or "ai.chats automatic".
    - A "Reference loop transcript" section — paste the actual logged chunks so Plan 02 has ground truth.
    - Note that the spike file is excluded from the build (add `**/__spikes__/**` to `apps/api/.eslintignore` and verify `apps/api/tsconfig.build.json` `exclude` already covers `**/__spikes__/**` — add if missing).

    DO NOT use `any` (per CLAUDE.md universal rules) — type chunks as `unknown` and narrow with `in` checks for logging. This spike is intentionally non-Jest and non-TDD — it is exploratory code that produces a reference transcript.
  </action>
  <verify>
    <automated>cd apps/api &amp;&amp; GEMINI_API_KEY="${GEMINI_API_KEY:-}" npx tsx src/ai/__spikes__/streaming-tools.spike.ts | tee /tmp/spike-out.txt &amp;&amp; grep -q "tool turn" /tmp/spike-out.txt &amp;&amp; grep -q "functionCall" /tmp/spike-out.txt</automated>
  </verify>
  <done>
    Spike runs end-to-end against the real Gemini API and prints at least one `functionCall` chunk plus the recursive turn log. README.md "Findings" + "Reference loop transcript" sections are filled in with the actual chunk shape observed. `apps/api/src/ai/__spikes__/` is excluded from the production build (verify with `cd apps/api &amp;&amp; npx tsc --noEmit -p tsconfig.build.json` does not error on spike files).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Tool registry types + 7 read-only tool implementations</name>
  <files>
    apps/api/src/ai/tools/tool.types.ts
    apps/api/src/ai/tools/tools.registry.ts
    apps/api/src/ai/tools/get-instrument-score.tool.ts
    apps/api/src/ai/tools/get-instrument-fundamentals.tool.ts
    apps/api/src/ai/tools/get-instrument-technicals.tool.ts
    apps/api/src/ai/tools/get-fund-returns.tool.ts
    apps/api/src/ai/tools/get-recent-news.tool.ts
    apps/api/src/ai/tools/compare-peers.tool.ts
    apps/api/src/ai/tools/search-instruments.tool.ts
    apps/api/src/ai/tools/__tests__/tool.types.spec.ts
    apps/api/src/ai/tools/__tests__/get-instrument-score.tool.spec.ts
    apps/api/src/ai/tools/__tests__/get-instrument-fundamentals.tool.spec.ts
    apps/api/src/ai/tools/__tests__/get-instrument-technicals.tool.spec.ts
    apps/api/src/ai/tools/__tests__/get-fund-returns.tool.spec.ts
    apps/api/src/ai/tools/__tests__/get-recent-news.tool.spec.ts
    apps/api/src/ai/tools/__tests__/compare-peers.tool.spec.ts
    apps/api/src/ai/tools/__tests__/search-instruments.tool.spec.ts
  </files>
  <behavior>
    For each tool, test before implementing:
    - **Happy path:** Given a stub `ToolContext` with mocked repos returning a valid record, `handler(validArgs, ctx)` returns a `ToolResult<T>` whose `data` matches the projected shape, `sourceTag` is the documented pattern (e.g. `score:stock:RELIANCE.NS`), `asOfDate` is the repo's record date, and `dataVersionHash` echoes the repo value.
    - **Not-found path:** Repo returns `null` → handler throws `ToolError` with code `NOT_FOUND` (do NOT return null — Gemini SDK expects either a response or an error so it can recover).
    - **Invalid args:** Tool receives `args` missing a required field → throws `ToolError('INVALID_ARGS')`. (TS would catch this at compile time, but FunctionCall args are runtime `unknown` from Gemini; validate explicitly.)
    - **Source tag determinism:** Same input twice → same `sourceTag` string. (Used downstream by citation validator + UI deduplication.)
    - **Projection shape locked:** `getInstrumentFundamentals` must return ONLY {pe, pb, roe, roce, debtEquity, marketCap, asOf} — no leaking of internal repo fields, no raw Mongo `_id`. Test asserts exact key set.
    - **getRecentNews:** default `sinceDays=7`, max 10 articles, joins sentiment by `articleId`. Test asserts when sentiment is missing for an article the field is `'NEUTRAL'` (graceful default, not crash).

    Each `*.tool.spec.ts` uses Jest + jest-mock for repos. No real Mongo, no real Gemini. Tests under 60s combined.
  </behavior>
  <action>
    Create `apps/api/src/ai/tools/tool.types.ts`:
    - `ToolContext` interface (see `<interfaces>` block above).
    - `ToolResult<T>` interface (`{ data: T; sourceTag: string; asOfDate: Date; dataVersionHash: string }`).
    - `ToolDefinition<TArgs, TData>` interface with `declaration: FunctionDeclaration` (import type from `@google/genai`) and `handler: (args: TArgs, ctx: ToolContext) => Promise<ToolResult<TData>>`.
    - `ToolError extends Error` with codes `'NOT_FOUND' | 'INVALID_ARGS' | 'UNKNOWN_TOOL' | 'NO_SCORE_YET'`.

    Write the 7 tool files matching the RESEARCH §Pattern C registry table EXACTLY:

    | File | name (Gemini decl) | args | returns shape (data) | sourceTag pattern | repo call |
    |------|--------------------|------|----------------------|-------------------|-----------|
    | get-instrument-score.tool.ts | `getInstrumentScore` | `{symbolOrSchemeCode, type}` | `{score, verdict, pillarBreakdown, asOfDate}` | `score:{type}:{sym}` | `stocksRepo.getLatestScore` or `fundsRepo.getLatestScore` |
    | get-instrument-fundamentals.tool.ts | `getInstrumentFundamentals` | `{symbol}` | `{pe, pb, roe, roce, debtEquity, marketCap, asOf}` | `fundamentals:{sym}` | `stocksRepo.getFundamentals` |
    | get-instrument-technicals.tool.ts | `getInstrumentTechnicals` | `{symbol}` | `{rsi, macdSignal, dma50, dma200, beta, asOf}` | `technicals:{sym}` | `stocksRepo.getTechnicals` |
    | get-fund-returns.tool.ts | `getFundReturns` | `{schemeCode}` | `{returns, benchmarkReturns, category}` | `returns:{schemeCode}` | `fundsRepo.getReturns` |
    | get-recent-news.tool.ts | `getRecentNews` | `{symbol, sinceDays?=7}` | `[{title, sentiment, url, publishedAt}]` (max 10) | `news:{sym}:{sinceDays}d` | `newsRepo.listRecent` + `sentimentRepo.getForArticles` |
    | compare-peers.tool.ts | `comparePeers` | `{symbol, count?=3}` | `[{symbol, name, score, sector}]` | `peers:{sym}:n{count}` | `stocksRepo.getPeers` |
    | search-instruments.tool.ts | `searchInstruments` | `{query, limit?=5}` | `[{symbol, name, type, price?}]` | `search:{normalisedQuery}` | `searchService.autocomplete` |

    Each tool's `declaration.description` must mention "READ-ONLY accessor — never computes anything new" so the system prompt + Gemini self-grounding reinforces the contract.

    `tools.registry.ts`:
    - `import` each tool module.
    - `export const ALL_TOOLS: Record<string, ToolDefinition<any, any>>` keyed by declaration name.
    - `export const TOOL_REGISTRY = { declarations: [...ALL_TOOLS.values()].map(t => t.declaration), async execute(fc, ctx) { const tool = ALL_TOOLS[fc.name]; if (!tool) throw new ToolError('UNKNOWN_TOOL', fc.name); return tool.handler(fc.args, ctx); } }`.
    - The registry MUST NOT import from `../../scoring/` (CI lint will catch — see Task 3).

    Tests: 7 spec files matching the behaviour table above. Use Jest's `jest.fn()` for repo mocks; no `any` in test bodies (use `Partial<StocksRepo>` etc. with type-cast at the call site).

    Tool handlers use `args: TArgs` but at runtime Gemini gives unknown; the handler validates with simple `typeof` / `in` checks then casts. Do NOT pull in zod here (overkill for 7 tools).
  </action>
  <verify>
    <automated>cd apps/api &amp;&amp; npx jest --testPathPattern="src/ai/tools/__tests__" --maxWorkers=2 --bail</automated>
  </verify>
  <done>
    All 7 tool files exist, all 7 spec files pass (~30+ assertions total). Each tool returns the documented `ToolResult` shape; not-found cases throw `ToolError('NOT_FOUND')`; projection shapes do not leak `_id` or internal fields; `getRecentNews` defaults sentiment to `'NEUTRAL'` when missing. `TOOL_REGISTRY.declarations.length === 7`. `TOOL_REGISTRY.execute({name:'unknown',args:{}}, ctx)` throws `ToolError('UNKNOWN_TOOL')`.
  </done>
</task>

<task type="auto">
  <name>Task 3: CI lint test — tool bodies cannot import from scoring/ + wire TOOL_REGISTRY into AIModule</name>
  <files>
    apps/api/src/ai/tools/__tests__/tools.no-compute.spec.ts
    apps/api/src/ai/ai.module.ts
  </files>
  <action>
    Create `apps/api/src/ai/tools/__tests__/tools.no-compute.spec.ts`:

    ```ts
    import { readFileSync } from 'node:fs';
    import { glob } from 'glob';
    import path from 'node:path';

    describe('Tool registry — read-only invariant (CHAT-02)', () => {
      const toolFiles = glob.sync(
        path.resolve(__dirname, '..', '*.tool.ts'),
      );

      it('finds the 7 declared tools on disk', () => {
        expect(toolFiles.length).toBe(7);
      });

      it.each(toolFiles)('%s does NOT import from scoring/', (file) => {
        const src = readFileSync(file, 'utf8');
        // Match any relative or absolute import from scoring/*
        expect(src).not.toMatch(/from\s+['"][^'"]*\/scoring\/[^'"]*['"]/);
        expect(src).not.toMatch(/from\s+['"]\.\.\/\.\.\/scoring/);
      });

      it.each(toolFiles)('%s does NOT call .compute(', (file) => {
        const src = readFileSync(file, 'utf8');
        // Belt-and-braces — flags any compute/forecast/predict invocation
        expect(src).not.toMatch(/\.(compute|forecast|predict|recompute)\s*\(/);
      });

      it('tools.registry.ts does NOT import from scoring/', () => {
        const reg = readFileSync(
          path.resolve(__dirname, '..', 'tools.registry.ts'),
          'utf8',
        );
        expect(reg).not.toMatch(/scoring/);
      });
    });
    ```

    `glob` is already a transitive dep; if Jest can't resolve it, add `glob@^11` as a dev-dep in apps/api/package.json.

    Wire registry into `apps/api/src/ai/ai.module.ts` (extend, do not replace — Phase 4 already created this module with the gemini.client + ComplianceInterceptor):
    - Add `TOOL_REGISTRY` to providers as a value provider: `{ provide: 'TOOL_REGISTRY', useValue: TOOL_REGISTRY }`.
    - Add to `exports` so `AIService` (Plan 02 extends) and the compare service (Plan 04) can `@Inject('TOOL_REGISTRY')` it.
    - Do NOT modify the existing gemini.client.ts or ComplianceInterceptor wiring.
  </action>
  <verify>
    <automated>cd apps/api &amp;&amp; npx jest --testPathPattern="tools.no-compute.spec" --bail &amp;&amp; npx tsc --noEmit -p tsconfig.build.json</automated>
  </verify>
  <done>
    `tools.no-compute.spec.ts` passes; deliberately adding `import { scoreStock } from '../../scoring/stock-scoring'` to any tool file makes the test fail (manually verified by the executor and then reverted). `ai.module.ts` exports `TOOL_REGISTRY` provider. `npx tsc --noEmit` clean. Full chat-tools test suite green: `npx jest --testPathPattern="src/ai/tools"`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Gemini API ↔ tool registry | Gemini emits FunctionCall args as untrusted `unknown` — must validate at the tool handler boundary |
| Tool handler ↔ Mongo repos | Tools call existing repo methods; repos already enforce `userId`/scope filters from prior phases — Phase 7 tools only READ |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-01 | Tampering | Tool body imports scoring/ → AI can trigger live recompute | mitigate | CI lint test in Task 3 (tools.no-compute.spec.ts) blocks merge on violation |
| T-07-02 | Information Disclosure | Tool returns raw repo doc with internal fields (`_id`, internal hashes) | mitigate | Projection-shape unit tests (Task 2) lock exact key sets per tool |
| T-07-03 | Tampering | Gemini passes malicious args (`symbol: "../../etc/passwd"`) | mitigate | Tool handlers validate via `typeof`/regex; repos parameterise Mongo queries (Phase 1 invariant) |
| T-07-04 | Denial of Service | Tool execution slow → SSE timeout | mitigate (Plan 02) | Plan 02 adds 15s heartbeat + per-tool 10s timeout |
| T-07-05 | Repudiation | Tool result lacks lineage → cannot prove which data backed a citation | mitigate | Every ToolResult carries `sourceTag` + `asOfDate` + `dataVersionHash` (Task 2 enforced) |
| T-07-06 | Information Disclosure | Spike file leaks `GEMINI_API_KEY` in committed transcript | mitigate | README explicitly instructs running with env var; transcript section template excludes auth headers |
</threat_model>

<verification>
- `npx tsc --noEmit -p apps/api/tsconfig.build.json` succeeds (spike directory excluded).
- `cd apps/api && npx jest --testPathPattern="src/ai/tools"` — all 8 spec files pass (7 tool specs + no-compute lint).
- Manual: deliberately add `import { scoreStock } from '../../scoring/stock-scoring'` to any tool, run no-compute spec → MUST fail. Revert.
- Spike transcript in `__spikes__/README.md` shows actual logged chunk shape for `chunk.functionCalls` and the recursion log.
- `TOOL_REGISTRY.declarations.length === 7` and Plan 02 can `@Inject('TOOL_REGISTRY')` it.
</verification>

<success_criteria>
- Wave-0 spike artifact committed with chunk-shape findings — Plan 02 can copy the proven loop shape.
- 7 read-only tools implemented with uniform `ToolResult<T>` shape and locked projection shapes.
- CI lint test passes and would fail on any future scoring/ import under `ai/tools/**`.
- TOOL_REGISTRY exported from AIModule, ready for injection in Plan 02 + Plan 04.
- CHAT-02 fully satisfied at the contract level (the streaming consumption of these tools comes in Plan 02).
</success_criteria>

<output>
After completion, create `.planning/phases/07-ask-finsight-chat-comparison/07-01-SUMMARY.md` covering:
- Confirmed chunk shape from the spike (manual interleave vs ai.chats).
- The 7 tools' final signatures and `sourceTag` patterns.
- Note any tool whose repo dependency from a prior phase was missing or under-built — Plan 02/04 may need a patch.
</output>
