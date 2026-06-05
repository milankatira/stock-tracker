---
status: partial
phase: 07-ask-finsight-chat-comparison
source: [07-VERIFICATION.md]
started: 2026-06-05T00:00:00Z
updated: 2026-06-05T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live streamed conversation (Ask FinSight chat)
expected: With a real GEMINI_API_KEY and the app running, send a stock query in /chat — tokens stream in, tool breadcrumbs and citation pills render, disclaimer visible. Send "Should I buy AAPL?" — amber RefusalBanner appears, no BUY/SELL language anywhere.
result: [pending]

### 2. Live compare verdict
expected: /compare with RELIANCE.NS vs TCS.NS (real key) renders VerdictCard with scoreDelta >= 0, sanitised rationale (no buy/sell/recommend), score table, disclaimer. A symbol without a persisted score returns the friendly 422 "score pending" card.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
