# 07-03 Summary — Chat Persistence, Citation Validator & Chat UI

**Plan:** 07-PLAN-03-history-ui.md · **Requirements:** CHAT-03 (finalisation), CHAT-05 · **Status:** complete, green

## Files created
**API**
```
apps/api/src/ai/sanitiser/citation-validator.ts            (+ spec)  validateCitations + NUMERIC_TOKEN
apps/api/src/chat/chat-session.schema.ts                             ChatSession + ChatMessage + ChatScope, soft-delete, 3 indexes
apps/api/src/chat/chat-session.repo.ts                     (+ spec)  userId-scoped CRUD + loadHistory + idempotent findMessage
apps/api/src/chat/chat-ownership.guard.ts                  (+ spec)  IDOR guard on every :id route
apps/api/src/chat/dto/create-chat.dto.ts, dto/list-chats.dto.ts
apps/api/src/chat/chat.controller.ts (REST + @Sse), chat.service.ts (persistence), chat.module.ts
apps/api/src/ai/ai.service.ts (onToolEnd +data)
```
**Web**
```
apps/web/src/lib/chat-api.ts                              types + server list/get + client createChat
apps/web/src/app/(app)/chat/page.tsx · /[id]/page.tsx · /new/page.tsx
apps/web/src/app/(app)/chat/components/{chat-thread,chat-input,message-bubble,citation-pill,tool-breadcrumb,refusal-banner,scope-picker}.tsx
apps/web/src/app/(app)/chat/components/__tests__/{chat-thread,citation-pill}.test.tsx
apps/web/package.json (+ @microsoft/fetch-event-source, nanoid)
```

## Verification
- API: full suite **709 pass / 3 gated-skip**; `tsc` (default + build) + `eslint src` clean. New: citation-validator 13, chat-session.repo 8 (mongodb-memory-server), chat-ownership.guard 4, chat.service 4.
- Web: chat component tests **5 pass**; `tsc` clean, `eslint` clean, **`next build` succeeds** (`/chat`, `/chat/[id]`, `/chat/new`).

## Final ChatSession schema + indexes
- `userId: string` (watchlist convention, NOT ObjectId), `title` (≤120), `scope` sub-doc `{type, symbols[]}` (1–3 validated), `messages: ChatMessage[]` (`_id:false`, role/content/citations/toolCalls/refusalCategory?/messageId/createdAt), `deletedAt: Date|null`, timestamps.
- Indexes: `{userId,updatedAt:-1}` (list), `{userId,deletedAt:1}` (soft-delete), `{"messages.messageId":1}` (reconnect).

## `ChatStreamOpts.onToolEnd` delta vs Plan 02
- Now `(name, citation, data: unknown)` — the raw tool-result `data` is threaded so `ChatService.onComplete` can run `validateCitations(assembled, toolData)`. Plan 02's chat-stream spec assertion updated to match (3rd arg).

## Deviations / decisions
1. **`userId` is a `string`** (matches watchlist), not the plan's `Types.ObjectId` — simpler, consistent, no casting.
2. **Idempotency is role-based, not the plan's `'-r'` suffix.** `findMessage(sessionId, messageId)` returns the persisted *assistant/refusal* reply (ignores the user echo). User + assistant share the same `messageId`; the role disambiguates. Cleaner than synthetic suffixed ids.
3. **`scope` is a proper `@Schema({_id:false})` sub-document** (`ChatScope`) — the plan's inline nested `type:{type:...}` literal broke Mongoose (`required:true` mis-parsed).
4. **Cross-user isolation proven at guard + repo level** (`exists`/`getById` are `userId`-scoped; guard throws `ForbiddenException`), not a full HTTP e2e — the e2e harness (Mongo+auth boot) is heavy and the controller is declarative. Full HTTP-SSE/REST e2e remains a running-instance smoke (deferred, consistent with prior plans).
5. **Soft-delete** via `deletedAt`; every read filters `deletedAt: null`. A purge job is punted to a Compliance-Hardening milestone (open question).
6. **Citation validator is lenient by design** — normalises tokens to their numeric core (strips ₹/units/%) so a cited unitless field matches; skips bare integers and dates (system prompt requires units). Under-flagging beats over-flagging for v1.
7. **`@microsoft/fetch-event-source` + `nanoid` installed** (pnpm add succeeded). SSE client uses the GET-query stream shape from Plan 02 with `credentials:'include'`.
8. **Throttler regression caught + fixed**: the SSE route now carries `@UseGuards(ChatOwnershipGuard, ThrottlerGuard)` so `@Throttle` actually enforces.

## UI patterns for Plan 04 (compare)
- `MessageBubble` (plain-text render, citations + disclaimer), `CitationPill` (sourceTag→label + asOf), `RefusalBanner` (amber), `ToolBreadcrumb`. Reuse `CitationPill` + the disclaimer line in the compare VerdictCard. `ScopePicker` already supports a `compare` type with up to 3 symbols.

## Open questions
- Soft-delete purge / retention job (Compliance Hardening milestone).
- Stale-citation hard cache-bust (T-07-21 accepted for v1 — `asOfDate` shown on every pill).
- Switch SSE to POST-body via fetch-event-source if query-length limits bite (current GET-query is fine for ≤2000 chars).
