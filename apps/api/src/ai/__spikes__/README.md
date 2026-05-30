# Wave-0 spike — Gemini 2.6 streaming + function-calling

Verifies the `@google/genai` 2.6 streaming + function-calling interleave loop that Plan 02's production `chatStream` builds on.

## How to run

```bash
GEMINI_API_KEY=xxx npx tsx apps/api/src/ai/__spikes__/streaming-tools.spike.ts
```

Without a key (or without `tsx` installed) it exits 0 with a notice — safe to invoke anywhere.

## Findings (grounded in `@google/genai@2.6.0` type definitions)

> The live run could not be executed in the build environment (no `GEMINI_API_KEY`, no `tsx` binary). The chunk shape below is taken from the installed SDK's `dist/genai.d.ts` — the authoritative contract — rather than a transcript, and the spike script is shaped to match it so a later live run is a confirmation, not a discovery.

**Streaming entry point**
```ts
ai.models.generateContentStream(params): Promise<AsyncGenerator<GenerateContentResponse>>
// NOTE: returns a Promise of an async generator → `for await (const chunk of await ai.models.generateContentStream(...))`
```

**Per-chunk accessors** (`class GenerateContentResponse`)
```ts
get text(): string | undefined            // incremental text delta for this chunk
get functionCalls(): FunctionCall[] | undefined   // present on the chunk(s) carrying tool calls
```

**FunctionCall shape**
```ts
interface FunctionCall {
  id?: string;                       // present on some surfaces; echo back on the response if set
  name?: string;                     // matches FunctionDeclaration.name
  args?: Record<string, unknown>;    // UNTRUSTED — validate in the tool handler
}
```

**Replying to a tool call** — append two turns to `contents` and re-stream:
```ts
{ role: "model", parts: [{ functionCall }] }
{ role: "user",  parts: [{ functionResponse: { name, response } }] }
```

## Decision: manual interleave loop

`ai.chats.create(...)` exists in 2.6 and can auto-execute tools, but Plan 02 needs **explicit** control over each tool turn (compliance interception of every tool result, per-tool timeout, N≤5 cap, heartbeats, abort). So the production handler uses the **manual `generateContentStream` interleave loop** shown in the spike — not `ai.chats` automatic function calling. The registry's `TOOL_REGISTRY.execute(fc, ctx)` plugs straight into the `functionCalls` branch.

## Reference loop (what Plan 02 copies)

1. `contents = [{ role: "user", parts: [{ text }] }]`
2. `for await (chunk of await generateContentStream({ contents, config: { tools, systemInstruction } }))`
   - accumulate `chunk.text`; collect `chunk.functionCalls`.
3. If no function calls → stream is the final answer.
4. Else append the `model` functionCall turn + a `user` functionResponse turn (one `functionResponse` per call, `name` + `response` = `TOOL_REGISTRY.execute(...)` data), then loop. Cap at 5 turns.
