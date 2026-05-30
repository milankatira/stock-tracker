# 07-01 Summary — Streaming Spike + Read-Only Tool Registry

**Plan:** 07-PLAN-01-spike-tools.md · **Requirement:** CHAT-02 · **Status:** complete, green

## Files created
```
apps/api/src/ai/__spikes__/streaming-tools.spike.ts   (runnable, key+tsx gated)
apps/api/src/ai/__spikes__/README.md                  (SDK-grounded chunk shape + decision)
apps/api/src/ai/tools/tool.types.ts                   (ToolContext/ToolResult/ToolDefinition/ToolError + arg validators)
apps/api/src/ai/tools/tools.registry.ts               (TOOL_REGISTRY + ALL_TOOLS + TOOL_REGISTRY_TOKEN)
apps/api/src/ai/tools/get-instrument-score.tool.ts
apps/api/src/ai/tools/get-instrument-fundamentals.tool.ts
apps/api/src/ai/tools/get-instrument-technicals.tool.ts
apps/api/src/ai/tools/get-fund-returns.tool.ts
apps/api/src/ai/tools/get-recent-news.tool.ts
apps/api/src/ai/tools/compare-peers.tool.ts
apps/api/src/ai/tools/search-instruments.tool.ts
apps/api/src/ai/tools/__tests__/  (_fixtures + 7 tool specs + tool.types.spec + tools.no-compute.spec)
apps/api/src/ai/ai.module.ts        (TOOL_REGISTRY value provider + export)
apps/api/tsconfig.build.json        (exclude **/__spikes__/**)
```

## Confirmed chunk shape (from `@google/genai@2.6.0` `dist/genai.d.ts`)
- `ai.models.generateContentStream(params)` → **`Promise<AsyncGenerator<GenerateContentResponse>>`** (await before `for await`).
- Per chunk: `get text(): string | undefined`, `get functionCalls(): FunctionCall[] | undefined`.
- `FunctionCall { id?: string; name?: string; args?: Record<string, unknown> }` — args are UNTRUSTED.
- Reply turns: `{ role: "model", parts: [{ functionCall }] }` then `{ role: "user", parts: [{ functionResponse: { name, response } }] }`.
- **Decision: manual interleave loop** (not `ai.chats` auto-calling) — Plan 02 needs per-tool compliance/timeout/N-cap/heartbeat/abort control. `TOOL_REGISTRY.execute(fc, ctx)` plugs into the `functionCalls` branch.

## The 7 tools (final signatures + sourceTag)
| name | args | sourceTag | read-path service |
|------|------|-----------|-------------------|
| getInstrumentScore | {symbolOrSchemeCode, type} | `score:{type}:{sym}` | reports.getStock / fundReports.getFund |
| getInstrumentFundamentals | {symbol} | `fundamentals:{sym}` | reports.getStock |
| getInstrumentTechnicals | {symbol} | `technicals:{sym}` | reports.getStock (rsi14→rsi) |
| getFundReturns | {schemeCode} | `returns:{schemeCode}` | fundReports.getFund |
| getRecentNews | {symbol, sinceDays?=7} | `news:{sym}:{n}d` | news.getRecentForTicker (sentiment pre-joined) |
| comparePeers | {symbol, count?=3} | `peers:{sym}:n{count}` | reports.getStock (.peers) |
| searchInstruments | {query, limit?=5} | `search:{normalisedQuery}` | search.searchInstruments |

Every tool returns `{ data, sourceTag, asOfDate, dataVersionHash }`. NOT_FOUND/INVALID_ARGS throw `ToolError`; projections are key-locked (no `_id` leak); `getRecentNews` defaults missing sentiment to `NEUTRAL`.

## Verification
- `vitest run src/ai/tools` → 47 pass (9 files). Full API suite **639 pass / 3 gated-skip**.
- `tsc --noEmit` (default) clean; `tsc -p tsconfig.build.json` clean (spike excluded). `eslint src` clean.
- `tools.no-compute.spec` statically blocks any `from '.../scoring/...'` import or `.compute()/.forecast()/.predict()/.recompute()` call in a tool body → CHAT-02 read-only invariant enforced.

## Deviations (primary-source reconciliation)
1. **Tools wired to the real materialised read path**, not the plan's assumed `stocks.repo.ts`/`funds.repo.ts` (which don't exist). `ToolContext` uses narrow structural readers (`StockReportReader`/`FundReportReader`/`NewsReader`/`SearchReader`) over `reports.getStock`, `fundReports.getFund`, `news.getRecentForTicker`, `search.searchInstruments`. No separate `sentimentRepo` — `getRecentForTicker` already joins sentiment.
2. **Vitest, not Jest** (project standard); specs use `vi.fn()` + a shared `_fixtures.ts`.
3. **Live spike not executed** — no `GEMINI_API_KEY` and no `tsx` in the build env. The spike is runnable + key-gated; the chunk shape is grounded in the installed 2.6 SDK type defs (authoritative), so a later live run is confirmation, not discovery. (Consistent with Phase 6's gated live-Gemini smokes.)
4. **`ToolDefinition<TData>`** (single type param) — `handler` takes `unknown` args by contract since Gemini emits runtime-`unknown` args; per-tool `*Args` interfaces are documentary.
5. **`nanoid` deferred to Plan 02** (its only consumer) rather than added now, to avoid an unused-dependency flag.
6. **`eslint.config.mjs` is hook-protected** — spike excluded from the build via `tsconfig.build.json` only; it is lint+typecheck clean so no eslint ignore was needed.

## Notes for Plan 02 / 04
- Inject the registry with `@Inject(TOOL_REGISTRY_TOKEN)` (token = `"TOOL_REGISTRY"`), exported from `AiModule`.
- `ToolContext` must be assembled per-request with the real Nest services + server-derived `userId` + scope.
- Add `nanoid@^5` when Plan 02 lands (messageId generation).
