# 07-02 Summary — SSE Chat Streaming + Compliance Guardrails

**Plan:** 07-PLAN-02-sse-streaming.md · **Requirements:** CHAT-01, CHAT-03 (in-stream), CHAT-04 · **Status:** complete, green

## Files created
```
apps/api/src/ai/sanitiser/sentence-buffer.ts          (+ spec)  FSM OUT/IN_NUMBER/IN_ABBREV
apps/api/src/ai/sanitiser/forbidden-verbs.ts          (+ spec)  regex + replacements + containsForbidden
apps/api/src/ai/refusal/refusal.enum.ts                          10-category RefusalCategory
apps/api/src/ai/refusal/refusal-templates.ts                     user-facing copy per category
apps/api/src/ai/refusal/refusal-detector.ts           (+ spec)  pre-stream classifier (priority order)
apps/api/src/ai/prompts/chat-system.prompt.ts                    buildChatSystemPrompt(scope)
apps/api/src/ai/ai.service.ts (chatStream + ChatStreamOpts)  (+ chat-stream.spec)
apps/api/src/ai/ai.module.ts (already provided TOOL_REGISTRY in 07-01)
apps/api/src/chat/chat.service.ts                     (+ spec)  Observable<MessageEvent> orchestration
apps/api/src/chat/chat.controller.ts                            @Sse(':id/messages') + guards + throttle
apps/api/src/chat/chat.module.ts                      (+ spec)
apps/api/src/chat/dto/send-message.dto.ts
apps/api/src/app.module.ts (ChatModule registered)
```

## Verification
- New tests: SentenceBuffer 12, forbidden-verbs 10, refusal-detector 12, chatStream 6, chat.service 4, chat.module 1.
- Full API suite **683 pass / 3 gated-skip**. `tsc` (default + build) clean. `eslint src` clean.
- SentenceBuffer correctly keeps `7.2%`, `₹1,23,456`, `vs.`, multi-`%` sentences intact and splits a bare `7. ` boundary; forbidden phrases split across chunks are caught on assembly.
- chatStream: N=5 tool cap → `TOOL_LIMIT_EXCEEDED`; forbidden verb mid-stream → `NON_COMPLIANT_BUYSELL`; tool error → structured `{error}` fed back to Gemini (no abort); pre-aborted signal → clean exit.

## Final loop shape (manual interleave, per the 07-01 spike)
`chatStream` awaits `generateContentStream`, iterates chunks collecting `chunk.functionCalls` and feeding `chunk.text` through the `SentenceBuffer`. On tool calls it appends a `{role:"model", parts:[{functionCall}]}` turn + a `{role:"user", parts:[{functionResponse}]}` turn and re-streams. No `ai.chats` auto-calling — explicit control is needed for per-tool compliance/citation/cap. `config.abortSignal` carries the client-disconnect abort.

## Deviations / decisions (reconciliation)
1. **`ToolContext` is supplied by the caller**, not assembled inside AiService. `ChatStreamOpts.toolContext` is built by `ChatService` from the real read-path services (`ReportsService`, `FundReportsService`, `NewsService`, `SearchService`) — which satisfy the narrow reader interfaces structurally. This keeps `AiModule` from depending on every read-path module (no cycles). AiService injects only `GeminiClient` + `TOOL_REGISTRY` (via `TOOL_REGISTRY_TOKEN`).
2. **AiService constructor gained a 2nd param** (`@Inject(TOOL_REGISTRY_TOKEN)`). Updated the three existing AiService specs (`ai.service.spec`, `ai.service.sentiment.spec`, `ai.service.smoke.spec`) to pass a stub registry.
3. **Vitest, not Jest** (project standard). The SSE HTTP e2e (`*.e2e-spec.ts`) is excluded from the default vitest run; instead `chat.service.spec.ts` proves the `Observable<MessageEvent>` event sequence deterministically (refusal short-circuit, token/tool_start/tool_end/done mapping, in-stream refusal, error path). Full HTTP-SSE boot is a running-instance smoke (deferred, like the plan's curl check).
4. **Throttler**: `ThrottlerModule` is already configured app-wide (Redis-backed, 100/min) in `app.module`; no APP_GUARD is registered, so `ChatController` opts in with `@UseGuards(AccessTokenGuard, ThrottlerGuard)` + `@Throttle({ default: { limit: 30, ttl: 60_000 } })`. Functional throttle test deferred to Plan 03 (per plan).
5. **`NewsReadItem.sentiment` widened to include `undefined`** so `NewsService.getRecentForTicker` satisfies the `NewsReader` structurally; the tool already defaults missing sentiment to `NEUTRAL`.
6. **`nanoid` not needed in Plan 02** (no server-side id generation; `messageId` is client-supplied and regex-validated). Carry to Plan 03.

## For Plan 03
- `ChatController` owns only `@Sse(':id/messages')`. Plan 03 adds `@Post`/`@Get`/`@Get(':id')` + `ChatOwnershipGuard`, loads `history` + real `scope` from the `ChatSession`, and consumes `onComplete(fullText, citations)` for the citation validator + message persistence.
- `RefusalCategory.CITATION_MISSING` is defined and ready for the Plan 03 validator.
