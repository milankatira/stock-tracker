---
phase: 07-ask-finsight-chat-comparison
verified: 2026-06-05T00:00:00Z
status: human_needed
score: 7/7
overrides_applied: 0
gaps: []
human_verification:
  - test: "Live streamed conversation — sign in, create chat scoped to RELIANCE.NS, ask 'What is the FinSight Score for RELIANCE.NS?'"
    expected: "Token-by-token SSE stream in the browser; tool breadcrumb appears then resolves; citation pill shows sourceTag + asOfDate; mandatory disclaimer visible on assistant bubble; stream ends with event:done. Then send 'Should I buy AAPL?' and confirm amber RefusalBanner with category OUT_OF_SCOPE_GEO appears."
    why_human: "SSE-over-HTTP streaming with live Gemini key was explicitly deferred across all plans (07-02/03 SUMMARY: 'excluded from default vitest run, deferred to running-instance smoke'). The 3 live-Gemini tests are gated-skip (skipped, never executed). Mocked unit tests prove the contract but not the real Gemini round-trip + browser rendering."
  - test: "Live compare verdict — visit /compare, pick RELIANCE.NS and TCS.NS, submit"
    expected: "VerdictCard renders with the higher-scoring pick labelled 'Higher-scoring pick', scoreDelta >= 0 (never negative), sanitised rationale with no buy/sell/recommend language, disclaimer footer, ScoreTable with both symbols. If a score is pending, friendly 'Score pending for {symbol}' card with no broken UI."
    why_human: "AiService.compare + responseSchema one-shot Gemini call was unit-tested 19/19 against mocks (including argmax + auditNumbers) but the live generateContent + responseJsonSchema round-trip with a real Gemini key was never executed (gated-skip pattern consistent with all phases)."
---

# Phase 7: Ask FinSight Chat + Comparison — Verification Report

**Phase Goal:** Users can have a streamed, compliance-safe conversation about a stock/fund/portfolio using read-only data tools, review past chats, and compare 2–3 instruments with an AI verdict on the higher-scoring pick.
**Verified:** 2026-06-05T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can send a message and receive a streamed, compliance-safe SSE answer | ✓ VERIFIED | `ChatController @Sse(':id/messages')` wired to `ChatService.streamReply` → `AIService.chatStream`. Heartbeat at 15s constant (`HEARTBEAT_MS = 15_000`), AbortController on disconnect. chatStream unit spec 6 cases green. |
| 2 | Streaming loop uses read-only data tools and caps tool turns at N=5 | ✓ VERIFIED | `MAX_TOOL_TURNS = 5` in `ai.service.ts:58`; `tools.no-compute.spec.ts` CI lint blocks `scoring/` imports in all 7 tool bodies; 7 tool files confirmed (no `.compute(` calls) |
| 3 | Compliance guardrails active: pre-stream refusal classifier + in-stream FSM + forbidden-verb sanitiser | ✓ VERIFIED | `RefusalDetector.classify()` called before Gemini in `chat.service.ts:80`; `SentenceBuffer` (IN_NUMBER/IN_ABBREV/OUT) feeds `chatStream`; `containsForbidden` + `applyReplacements` exported from `forbidden-verbs.ts` |
| 4 | Past chats: user can list sessions and read any session with ownership guard | ✓ VERIFIED | `ChatController` has `@Get()` list + `@Get(':id') @UseGuards(ChatOwnershipGuard)`; `ChatSessionRepo` filters by `userId` + `deletedAt: null` on every read path |
| 5 | Chat messages persisted with citations; idempotent reconnect returns persisted reply | ✓ VERIFIED | `sessions.findMessage(messageId)` checked first in `streamReply`; `appendAssistant` persists `citations` + `refusalCategory`; three indexes on ChatSessionSchema |
| 6 | Numeric citations validated against tool results; orphaned numbers emit `CITATION_MISSING` | ✓ VERIFIED | `validateCitations(assembled, toolData)` called in `onComplete` in `chat.service.ts:130`; `NUMERIC_TOKEN` regex exported from `citation-validator.ts` |
| 7 | Compare 2–3 instruments: deterministic argmax winner + server-computed scoreDelta; Gemini writes only audited prose | ✓ VERIFIED | `compare()` in `ai.service.ts`: `ranked = [...scores].sort((a,b) => b.value - a.value \|\| a.symbol.localeCompare(b.symbol))`, winner = `ranked[0]`, `scoreDelta = Number((winner.value - ranked[1].value).toFixed(2))`; `auditNumbers()` + `buildCompareFallbackRationale()` applied; Gemini's `winnerSymbol` and `scoreDelta` discarded |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Notes |
|----------|----------|--------|-------|
| `apps/api/src/ai/__spikes__/streaming-tools.spike.ts` | Gemini streaming + FC reference spike | ✓ VERIFIED | File exists, contains `generateContentStream` manual interleave loop |
| `apps/api/src/ai/tools/tool.types.ts` | ToolDefinition / ToolResult / ToolContext / ToolError | ✓ VERIFIED | All exported types present |
| `apps/api/src/ai/tools/tools.registry.ts` | TOOL_REGISTRY + ALL_TOOLS + TOOL_REGISTRY_TOKEN | ✓ VERIFIED | All three exported; declarations from 7 tools |
| `apps/api/src/ai/tools/*.tool.ts` (7 files) | 7 read-only tool implementations | ✓ VERIFIED | compare-peers, get-fund-returns, get-instrument-fundamentals, get-instrument-score, get-instrument-technicals, get-recent-news, search-instruments |
| `apps/api/src/ai/tools/__tests__/tools.no-compute.spec.ts` | CI lint — no scoring/ imports | ✓ VERIFIED | Expects `toolFiles.length === 7`; checks no `scoring/` import and no `.compute(` call |
| `apps/api/src/ai/sanitiser/sentence-buffer.ts` | 3-state FSM (IN_NUMBER/IN_ABBREV/OUT) | ✓ VERIFIED | All 3 states present; `export class SentenceBuffer` |
| `apps/api/src/ai/sanitiser/forbidden-verbs.ts` | FORBIDDEN_VERBS + REPLACEMENTS + containsForbidden | ✓ VERIFIED | All 3 exported |
| `apps/api/src/ai/refusal/refusal.enum.ts` | RefusalCategory typed enum (10 categories) | ✓ VERIFIED | 10 values from OUT_OF_SCOPE_GEO through RATE_LIMITED |
| `apps/api/src/ai/refusal/refusal-detector.ts` | RefusalDetector.classify() | ✓ VERIFIED | Priority-ordered regex chain; exports `RefusalDetector` |
| `apps/api/src/ai/ai.service.ts` | AIService.chatStream + AIService.compare | ✓ VERIFIED | Both methods; chatStream N=5 cap; compare with argmax + scoreDelta + auditNumbers |
| `apps/api/src/chat/chat.controller.ts` | POST /chats, GET /chats, GET /chats/:id, SSE :id/messages | ✓ VERIFIED | All 4 routes; AccessTokenGuard on class; ChatOwnershipGuard on :id routes |
| `apps/api/src/chat/chat.service.ts` | Persistence + idempotency + citation validation | ✓ VERIFIED | sessions.findMessage (idempotent), sessions.loadHistory + getScope, validateCitations in onComplete |
| `apps/api/src/ai/sanitiser/citation-validator.ts` | validateCitations + NUMERIC_TOKEN | ✓ VERIFIED | Both exported |
| `apps/api/src/chat/chat-session.schema.ts` | ChatSession + ChatMessage + deletedAt + 3 indexes | ✓ VERIFIED | deletedAt present; indexes: (userId,updatedAt), (userId,deletedAt), (messages.messageId) |
| `apps/api/src/chat/chat-session.repo.ts` | ChatSessionRepo with full CRUD + loadHistory + findMessage | ✓ VERIFIED | All required methods including loadHistory and findMessage |
| `apps/api/src/chat/chat-ownership.guard.ts` | ChatOwnershipGuard throws ForbiddenException | ✓ VERIFIED | ForbiddenException thrown on both missing and cross-user access |
| `apps/api/src/chat/compare.controller.ts` | POST /compare + CompareController | ✓ VERIFIED | `@Post()`, `@UseGuards(AccessTokenGuard)`, `@Throttle(10/60s)`, 422 path confirmed |
| `apps/api/src/chat/compare.service.ts` | CompareService pre-loads scores, calls aiService.compare | ✓ VERIFIED | `ReportsService.getStock` → scores[] → `aiService.compare(scores)` |
| `apps/api/src/ai/prompts/compare-system.prompt.ts` | COMPARE_SYSTEM_PROMPT + buildComparePrompt | ✓ VERIFIED | Both exported |
| `packages/shared/src/comparison.ts` | ComparisonVerdict + CompareInput + PendingScoreResponse | ✓ VERIFIED | All 3 interfaces exported. Path is `comparison.ts` not `types/comparison.ts` — accepted deviation per 07-04 SUMMARY |
| `apps/web/src/app/(app)/chat/components/chat-thread.tsx` | fetchEventSource SSE client (min 80 lines) | ✓ VERIFIED | 200 lines; `@microsoft/fetch-event-source` with `credentials: "include"` |
| `apps/web/src/app/(app)/chat/page.tsx` | Past conversations list (min 30 lines) | ✓ VERIFIED | 101 lines; `listChats()` called; session list + empty state |
| `apps/web/src/app/(app)/compare/page.tsx` | Compare picker page (min 30 lines) | ✓ VERIFIED | 30 lines (exactly meets minimum) |
| `apps/web/src/app/(app)/compare/components/verdict-card.tsx` | winnerSymbol + scoreDelta + rationale + disclaimer (min 40 lines) | ✓ VERIFIED | 52 lines; "Higher-scoring pick" label, scoreDelta, rationale, disclaimer |
| `apps/api/src/app.module.ts` | ChatModule + CompareModule registered | ✓ VERIFIED | Both imported and in `imports` array |
| `apps/api/src/ai/ai.module.ts` | TOOL_REGISTRY_TOKEN provided and exported | ✓ VERIFIED | `{ provide: TOOL_REGISTRY_TOKEN, useValue: TOOL_REGISTRY }` + exported |

### Key Link Verification

| From | To | Via | Status | Notes |
|------|----|-----|--------|-------|
| `chat.controller.ts` | `chat.service.ts` | `@Sse` route → `streamReply()` | ✓ WIRED | Confirmed |
| `chat.service.ts` | `ai.service.ts` | `aiService.chatStream({...})` | ✓ WIRED | Direct call with all callbacks |
| `ai.service.ts` | `tools.registry.ts` | `@Inject(TOOL_REGISTRY_TOKEN)` | ✓ WIRED | Constructor injection confirmed |
| `ai.service.ts` | `sentence-buffer.ts` | `new SentenceBuffer()` in chatStream | ✓ WIRED | Imported and instantiated |
| `chat.service.ts` | `refusal-detector.ts` | `refusalDetector.classify(opts.content)` | ✓ WIRED | Called before Gemini in async IIFE |
| `chat.controller.ts` | `chat-ownership.guard.ts` | `@UseGuards(ChatOwnershipGuard)` on :id routes | ✓ WIRED | Applied to `@Get(':id')` and `@Sse(':id/messages')` |
| `chat.service.ts` | `chat-session.repo.ts` | `sessions.loadHistory + appendUser + appendAssistant + findMessage` | ✓ WIRED | All 4 calls confirmed in streamReply |
| `chat.service.ts` | `citation-validator.ts` | `validateCitations()` in onComplete | ✓ WIRED | Line 130 of chat.service.ts |
| `chat-thread.tsx` | `chat.controller.ts` (SSE) | `fetchEventSource` with `credentials:'include'` | ✓ WIRED | `@microsoft/fetch-event-source` confirmed |
| `chat/page.tsx` | `chat.controller.ts` (GET /chats) | `listChats()` server fetch | ✓ WIRED | RSC calls listChats |
| `compare.controller.ts` | `compare.service.ts` | `compareService.compare(dto.symbols)` | ✓ WIRED | Confirmed |
| `compare.service.ts` | `ai.service.ts` | `aiService.compare(scores)` (pre-loaded) | ✓ WIRED | ReportsService.getStock → scores[] → aiService.compare(scores) |
| `ai.service.ts` | `@google/genai responseJsonSchema` | `generateContent({ responseMimeType, responseSchema })` | ✓ WIRED | responseMimeType + responseSchema confirmed in compare() at line 314-315 |
| `compare/result/page.tsx` | `compare.controller.ts` | `compareInstruments(symbols)` → POST /compare | ✓ WIRED | compare-api.ts fetch to INTERNAL_BASE/compare; consumed in result RSC |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `chat-thread.tsx` | `messages` state | `fetchEventSource` → `ChatService` → `AIService.chatStream` → real Gemini + tools | Yes — tools read from ReportsService/MongoDB; Gemini only writes prose | ✓ FLOWING |
| `chat/page.tsx` | `items` (ChatSessionSummary[]) | `listChats()` → `GET /chats` → `ChatSessionRepo.listByUser` (userId-scoped, deletedAt: null) | Yes — MongoDB query with pagination | ✓ FLOWING |
| `compare/result/page.tsx` | `result` (ComparisonVerdict) | `compareInstruments()` → `POST /compare` → `CompareService` → `ReportsService.getStock` | Yes — reads persisted StockReportDoc; argmax is server-computed | ✓ FLOWING |
| `verdict-card.tsx` | `verdict` prop | Passed from compare/result RSC after server fetch | Yes — winnerSymbol = server argmax, scoreDelta = deterministic arithmetic | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — entry points require a running server with live Gemini API key and MongoDB connection. Orchestrator confirmed API suite 724 pass (3 live-Gemini gated-skip) and `next build` clean. These gated skips are the exact tests that would exercise real streaming; they are deferred to human verification below.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CHAT-01 | 07-02 | Streamed SSE AI answer for free-text questions | ✓ SATISFIED | `@Sse(':id/messages')` wired to chatStream; token/tool_start/tool_end/done event types; chatStream spec 6 cases green |
| CHAT-02 | 07-01 | Read-only function-calling tools; never computes or invents numbers | ✓ SATISFIED | 7 read-only tools; `tools.no-compute.spec.ts` CI lint; ToolResult carries sourceTag/dataVersionHash |
| CHAT-03 | 07-02 + 07-03 | Citations + compliance interceptor (incl. streaming) | ✓ SATISFIED | SentenceBuffer FSM (Plan 02) + validateCitations + CITATION_MISSING event + refusalCategory persisted (Plan 03) |
| CHAT-04 | 07-02 | Refuses out-of-scope / non-compliant queries | ✓ SATISFIED | RefusalDetector 9-category priority chain; in-stream forbidden-verb detection → NON_COMPLIANT_BUYSELL |
| CHAT-05 | 07-03 | User can view past chat conversations | ✓ SATISFIED | `GET /chats` + `GET /chats/:id` + ChatOwnershipGuard + `/chat` RSC list page + `/chat/[id]` detail page |
| STOCK-07 | 07-04 | Compare 2–3 stocks with AI verdict on higher-scoring pick | ✓ SATISFIED | `POST /compare`; argmax winner; server-computed scoreDelta (always >= 0); auditNumbers on rationale; `/compare` + `/compare/result` UI |

No orphaned requirements. REQUIREMENTS.md Phase 7 lists exactly CHAT-01 through CHAT-05 and STOCK-07 — all 6 claimed by plan frontmatter.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None detected | — | — | — |

Scan notes:
- Nest `Logger` used throughout; no `console.log` in API source files.
- No hardcoded API keys or secrets in modified files.
- No bare `any` types in tool handlers (`unknown` + narrowing guards used).
- No empty catch blocks — errors logged and re-emitted via onRefusal or rethrown.
- No stub return patterns (`return null`, `return []`) in critical path.
- `scoreDelta` always `>= 0` post CR-01 fix (argmax guarantees winner has highest value; ties give delta = 0).

### Human Verification Required

#### 1. Live Streamed Conversation

**Test:** With real `GEMINI_API_KEY` + MongoDB + running `pnpm dev`, sign in, navigate to `/chat/new`, scope to Stock / RELIANCE.NS, send "What is the FinSight Score for RELIANCE.NS?"
**Expected:** Token-by-token SSE stream visible in the browser; tool breadcrumb appears (e.g. "Looking up getInstrumentScore…") then resolves to "Looked up ✓"; citation pill appears below the assistant bubble showing sourceTag + asOfDate; mandatory "Analysis only — not investment advice" disclaimer visible; stream ends cleanly with no console errors. Then send "Should I buy AAPL?" — expect amber RefusalBanner with category `OUT_OF_SCOPE_GEO`. Then refresh `/chat` — expect past conversation visible in the list.
**Why human:** SSE-over-HTTP with live Gemini was explicitly deferred across all plans as a running-instance smoke. 07-02 SUMMARY states it is "excluded from the default vitest run, deferred to running-instance smoke." The 3 live-Gemini tests are gated-skip (never executed by CI). Mocked unit tests prove the contract; they do not exercise the real Gemini API, real SSE chunking in a browser, or the visual rendering of streaming tokens.

#### 2. Live Compare Verdict

**Test:** With real key, navigate to `/compare`, select RELIANCE.NS and TCS.NS, submit.
**Expected:** `/compare/result` renders a VerdictCard with: "Higher-scoring pick" label + the symbol with the higher persisted FinSight Score; `scoreDelta >= 0` (never negative); rationale prose with no "buy", "sell", "recommend", or "target price" language; mandatory disclaimer footer; ScoreTable with both symbols + verdict badges. Submitting with a newly-added symbol that has no score yet (e.g. a freshly ingested ticker) should render a friendly "Score pending for {symbol}" card instead of an error.
**Why human:** `AiService.compare` with responseSchema was unit-tested 19/19 against mocks (including argmax, auditNumbers, 422 SCORE_PENDING, throttle). The live `generateContent` + `responseJsonSchema` round-trip against the real Gemini API was never executed (same gated-skip pattern as all Gemini live paths).

### Gaps Summary

No gaps found. All 7 truths verified, all 26 artifacts exist and are substantive, all 14 key links are wired, all 6 requirement IDs satisfied.

Post-review fixes confirmed in code (not just FIX report):
- **CR-01 fix confirmed:** `ai.service.ts` line 297-302 — `ranked = [...scores].sort((a,b) => b.value - a.value || a.symbol.localeCompare(b.symbol))`, winner = ranked[0], Gemini's winnerSymbol discarded
- **WR-01 fix confirmed:** `auditNumbers()` imported at line 12 and called at line 345; `buildCompareFallbackRationale()` at line 351-353 as template fallback
- **WR-02 fix confirmed:** `compare.controller.ts` lines 41-51 — try/catch maps thrown `ToolError('NO_SCORE_YET')` to HTTP 422 `{ error: 'SCORE_PENDING', symbol: err.message }`

The two human verification items are runtime smokes consistent with how all prior AI phases deferred live-key validation. They do not represent code gaps — they represent the real-device/real-key confirmation that the fully-wired and fully-tested code works against the live Gemini API.

---

_Verified: 2026-06-05T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
