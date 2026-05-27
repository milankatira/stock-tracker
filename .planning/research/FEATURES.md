# Feature Research

**Domain:** AI-powered investment-research / advisory web app for Indian retail investors (stocks + mutual funds)
**Researched:** 2026-05-27
**Confidence:** HIGH on table-stakes/differentiator categorization (grounded in live competitor products + PROJECT.md MVP); MEDIUM on Ask-FinSight conversational guardrails (no strong incumbent reference pattern found — flagged for phase-specific research)

## How This Domain Works (Context for the Roadmap)

Indian retail-research products fall into two camps:

1. **Data-first platforms** (Screener.in, Tickertape, Trendlyne, StockEdge) — raw tables, ratios, screeners, and a *composite score* the user must still interpret. They give you everything and expect you to form the opinion.
2. **Super-apps** (INDmoney, Groww, Smallcase) — research bolted onto execution/portfolio.

The whitespace FinSight targets (per PROJECT.md) is **opinion-first, AI-native, broker-agnostic, covering BOTH stocks AND funds** with a *single human-readable verdict*. The closest reference is **Trackk.in** (six insight cards + opinionated verdict) — but it is stocks-only. No incumbent unifies a 1–10 score + worded verdict across stocks *and* mutual funds, and none ships a conversational research chat with function-calling into a deterministic data layer. That gap is the product's wedge.

**How competitors present a score** (directly informs the Stock Report screen):
- **Tickertape Scorecard:** rates Performance, Valuation, Profitability, Growth, and **Red Flags** (a bundle: promoter pledged holding, ASM/GSM lists, default probability, unsolicited messages). Multi-axis, no single number, clean card UI.
- **Trendlyne DVM:** Durability / Valuation / Momentum, each 0–100, color-coded Good/Medium/Bad (G/M/B), recomputed end-of-day with intraday updates on new filings. This is the cleanest precedent for FinSight's "deterministic score + recompute job" + "worded verdict" model.
- **Screener.in:** no score — an automated **pros/cons "x-ray checklist"** plus 10–12 years of standardized financials and customizable peer comparison. The pros/cons pattern is a useful, compliance-safe verdict primitive.

FinSight's differentiation is collapsing all of this into **one 1–10 score + one plain-English verdict + a one-paragraph Gemini summary**, then letting the curious drill into the six cards and strips. Opinion on top, data underneath.

## Feature Landscape

### Table Stakes (Users Expect These)

Parity features. Every incumbent has them; missing any makes FinSight feel like a toy and users bounce back to Screener/Tickertape.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Search + autocomplete (stocks + funds) | The entry point to every flow; instant ticker/scheme lookup is universal | MEDIUM | Needs a unified symbol index (NSE/BSE tickers + AMFI scheme codes) with fuzzy match. Foundational dependency — everything starts here. |
| Interactive price chart (1D/1W/1M/6M/1Y/5Y/MAX) | Standard on every platform; users expect to see the line before reading anything | MEDIUM | Yahoo Finance historical (15-min delayed OK per constraints). Timeframe toggles are the expected control set. Lightweight charting lib (e.g. lightweight-charts/Recharts). |
| Fundamentals strip (P/E, P/B, ROE, market cap, debt, dividend yield, etc.) | Screener/Tickertape made these the baseline literacy layer | LOW–MEDIUM | Deterministic pull from Yahoo fundamentals. Display-only strip; no compute risk. |
| Technicals strip (RSI, MACD, moving averages, 52w high/low, volume) | StockEdge/Trendlyne set this expectation for the "is it overbought" glance | MEDIUM | Computed deterministically from price history. Powers the Technical/Momentum scoring input too — shared compute. |
| Peer comparison (2–3 way) | Screener's customizable peer table is the genre standard | MEDIUM | Side-by-side fundamentals + the FinSight score. MVP scope is 2–3 stocks. AI verdict on "better pick" elevates it (see differentiators). |
| Watchlist (add/remove, daily refresh) | Every platform has one; the return-visit hook | LOW–MEDIUM | Per-user persistence (Mongo). Daily refresh depends on the nightly recompute job. |
| News feed per item | Trendlyne/StockEdge/Tickertape all surface company news inline | MEDIUM | MoneyControl/ET RSS + NewsData.io free tier. Sentiment tags lift it into a differentiator (below). |
| MF metrics: returns vs benchmark/category, Sharpe, Sortino, alpha, beta, max drawdown, std dev, expense ratio, AUM, holdings | Tickertape MF screener made these the literacy baseline for funds | MEDIUM | MFAPI.in + AMFI NAV history; risk metrics computed deterministically. "Past performance" disclaimer mandatory on every returns view. |
| Auth — email/password + Google OAuth | Gate to watchlist/personalization; OAuth is the expected low-friction default | MEDIUM | NestJS-owned JWT (per constraints, not Clerk). DPDP consent on first launch. |
| Public marketing landing page | Conversion surface; every fintech has one | LOW | Value prop, pricing teaser, CTA. Next.js static/SSR. |
| Disclaimers + "analysis not advice" framing | Not just expected by users — legally required pre-SEBI-RA | LOW | See Compliance-as-Feature below. Pervasive, not a screen. |

### Differentiators (Competitive Advantage)

Where FinSight competes. Each maps directly to the Core Value ("plain-English score, verdict, reasoning… in <2s").

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Single 1–10 FinSight Score + worded verdict** | Incumbents give multi-axis scores (Tickertape 5-axis, Trendlyne DVM) the user must synthesize. FinSight gives ONE number + ONE verdict. The "Zomato rating" for a stock/fund. | HIGH | The core IP. Deterministic weighted compute (Fundamentals 35 / Valuation 20 / Technical 20 / Sentiment 10 / Risk 10 / Event 5). Verdict bands are worded compliantly: **Strong Score / Caution / Weak Score** — never BUY/SELL. |
| **Cross-asset parity (same score model for stocks AND funds)** | Tickertape splits stock vs MF UX; Trendlyne DVM is stocks-only; Trackk is stocks-only. FinSight scores both with a unified mental model. The wedge. | HIGH | Parallel MF framework (Returns / Risk-adjusted / Consistency / Costs / Manager / Portfolio). Same card grammar, same verdict bands. |
| **Six Insight Cards as the report hero** (Score, Volatility, Profit Consistency, Event Sensitivity, SWOT, Promoter Holdings) | Trackk-style framework as the *primary* layout, not buried under tables. Opinionated, scannable, beginner-friendly. | HIGH | Each card = deterministic metric + Gemini-written 1–2 line narrative. SWOT bullets are Gemini-generated from cited data (AI invariant: no invented numbers). Promoter Holdings card surfaces pledge % as a red-flag signal (Tickertape parity). |
| **One-paragraph Gemini summary on top of every report** | Screener/Trendlyne are tables-first; FinSight leads with a human verdict the user reads in 5 seconds. | MEDIUM | Gemini Flash for narrative. Context-cached per stock/fund (24h/7d TTL) for cost + speed. Always cites the underlying data sources. |
| **Ask FinSight — conversational chat with function-calling into the data layer** | No 2026 Indian incumbent ships a native research chatbot that pulls live deterministic data and cites it. General LLMs hallucinate figures; FinSight grounds them. | HIGH | Gemini function-calling → scoring/data layer. Scoped to a stock/fund/portfolio. Expected query types: "why is the score 6?", "compare this to its peers", "is the expense ratio high?", "what changed this quarter?". MUST cite data, refuse out-of-scope, never emit BUY/SELL. **Guardrail patterns are MEDIUM confidence — flag for phase-specific research.** |
| **MF "Better Alternatives"** | Tickertape offers a screener filter; FinSight proactively suggests a higher-scored same-category fund with a reasoned why. Intent-aware, not a filter. | MEDIUM–HIGH | Same-category + same-risk-bucket funds ranked by FinSight Fund Score. Gemini explains the delta (lower cost / better Sharpe / more consistent). Compliance-sensitive — frame as "higher-scoring peers," not "switch to this." |
| **News sentiment tags (Positive / Negative / Neutral)** | Turns a generic news feed into a signal; feeds the Sentiment 10% scoring input. | MEDIUM | Gemini classifies each headline; the tag *taxonomy* is a fixed deterministic enum (AI invariant — Gemini labels, doesn't invent the scale). Powers a per-stock sentiment roll-up. |
| **AI verdict on comparison ("better pick")** | Elevates the table-stakes peer compare into an opinion. | MEDIUM | Deterministic scores decide; Gemini narrates the reasoning with citations. Compliance: "higher FinSight Score," not "buy this one." |
| **Compliance-as-a-feature (trust moat)** | "Analysis not advice" + cited sources + deterministic numbers = the credibility incumbents' AI bolt-ons lack. | MEDIUM | Verdict bands (Strong/Caution/Weak), prominent per-screen disclaimer, "past performance" on returns, AI-output sanitization filter that strips any BUY/SELL/guaranteed-return language from Gemini output before render. This is a defensible feature, not just legal cover. |
| **Public, indexable SEO pages (1 URL per stock/fund)** | The distribution moat. Server-rendered analysis pages capture "is X a good stock" search intent. | MEDIUM | Next.js SSR/ISR. **Structured data:** `FinancialProduct`/`Article`/`Dataset` JSON-LD, OG/Twitter cards, canonical URLs. Competitors expose financials + peer data on indexable pages; FinSight exposes the *verdict*, which is more clickable. Renders the same Stock/MF Report content (shared dependency). |

### Anti-Features (Deliberately NOT Building in v1)

Sourced from PROJECT.md "Out of Scope" with reasoning to prevent re-adding.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Branded BUY / SELL recommendations | Users want a direct call; feels like the "real answer" | Legally gated behind SEBI RA registration; personalized calls trigger IA/RA licensing | Worded verdict bands: **Strong Score / Caution / Weak Score** |
| Real-time tick / sub-minute prices | "Live" feels premium | Needs paid NSE/BSE data licence; cost + licensing surface | 15-min delayed free data, clearly labeled |
| Broker portfolio sync (Zerodha/Groww/Upstox OAuth) | Personalized portfolio scoring | Per-broker OAuth integrations + execution liability + PII surface | Manual watchlist now; broker sync is a later milestone |
| Native order placement / "open in broker" deep links | Convenience to act | Execution = regulated activity, out of research scope | Research only; no execution path |
| Portfolio score + rebalance AI | Logical next step from scoring | Depends on broker sync (not in v1); compounds liability | Defer to post-sync milestone |
| Risk-profile questionnaire + AI portfolio builder | Personalization | Crosses into personalized *advice* (IA territory) | Generic analysis only in v1 |
| Native mobile apps (React Native) | Mobile-first market | Splits build effort; loses SEO moat; constraint says no RN | Web-first, responsive; native is a future milestone |
| AMFI ARN / direct MF distribution + payments | Monetization | Requires ARN registration + Razorpay billing surface | Research-only; monetization is a separate milestone |
| AI prompt-based screener | Power-user appeal | V2 scope; adds query-planning complexity over the data layer | Fixed search + comparison in v1 |
| Multi-language (Hindi/Marathi/etc.) | Mass-market reach | V2; adds i18n + Gemini multilingual eval surface | English v1 |
| IPO verdicts, F&O module, goal planner, tax reports | Frequently asked | V2/V3; each is a distinct data + compliance domain | Out of v1 scope |

## Feature Dependencies

```
Search + Autocomplete (symbol/scheme index)
    └──gates──> EVERYTHING (Stock Report, MF Report, Watchlist, Comparison, Chat)

Scoring Engine (deterministic compute + nightly recompute job)
    ├──requires──> Data layer (Yahoo / MFAPI / AMFI / NSE-BSE wrappers + cache)
    ├──powers──> Stock Report (Score + 6 cards)
    ├──powers──> MF Report (Fund Score + better alternatives)
    ├──powers──> Watchlist (daily score refresh)
    └──powers──> Comparison (AI "better pick" verdict)

Stock Report / MF Report (rendered content)
    └──requires──> Scoring Engine + Fundamentals/Technicals strips + Chart
    └──reused-by──> Public SEO Pages (same content, SSR + structured data)

News Feed (RSS + NewsData.io)
    └──enables──> Sentiment Tags (Gemini classify)
                      └──feeds──> Scoring Engine (Sentiment 10% input)

Ask FinSight (chat)
    └──requires──> Scoring Engine + Data layer (function-calling targets)
    └──requires──> News Feed + Sentiment (for "why" queries)
    └──requires──> Compliance sanitization filter (output gate)

Compliance Layer (disclaimers + verdict bands + AI sanitization)
    └──wraps──> Every report, returns view, and Gemini output

Auth (JWT + Google OAuth)
    └──gates──> Watchlist, personalization, chat history persistence
```

### Dependency Notes

- **Search/autocomplete is the universal prerequisite** — build the unified symbol/scheme index early; every downstream screen needs it. The symbol resolver (NSE/BSE ticker ↔ AMFI scheme code) is the riskiest data-plumbing item.
- **Scoring Engine is the spine** — Stock Report, MF Report, Watchlist refresh, and Comparison all consume it. It must precede those screens in the roadmap. It in turn depends on the multi-source data layer with caching/fallback (free-tier rate limits make this non-optional).
- **SEO pages reuse Report rendering** — don't build a parallel renderer; the public page is the same Report component server-rendered with structured data + auth gating removed. SEO pages must come *after* Report screens.
- **Sentiment tags sit between News Feed and Scoring** — News Feed must exist before sentiment classification, which then feeds the 10% sentiment weight. If News Feed slips, the scoring engine needs a graceful zero/neutral fallback for that input.
- **Ask FinSight is the deepest dependency** — it needs the data layer, scoring, news/sentiment, AND the compliance filter all in place. It should be among the *last* MVP features; it's also the one with the weakest external reference pattern (guardrails research needed).
- **Compliance layer conflicts with naive Gemini output** — the sanitization filter must intercept *every* AI surface (summary, SWOT, sentiment, chat, comparison verdict). Treat it as cross-cutting middleware, not a per-feature add-on.

## MVP Definition

All of the below are in PROJECT.md "Active" — this is a full-PRD MVP, not a thin slice. Ordering reflects dependencies.

### Launch With (v1) — Foundations First

- [ ] Data layer + multi-source fallback/cache — everything depends on real data surviving free-tier limits
- [ ] Search + autocomplete (unified symbol/scheme index) — universal entry point
- [ ] Auth (JWT + Google OAuth) + DPDP consent — gates personalization
- [ ] Scoring engine (stock + fund, deterministic, nightly recompute) — the core IP/spine
- [ ] Compliance layer (verdict bands, disclaimers, AI sanitization filter) — cross-cutting, must wrap all output
- [ ] Stock Report (Score + 6 cards + Gemini summary + chart + fundamentals/technicals strips)
- [ ] MF Report (Fund Score + returns vs benchmark + risk profile + holdings + better alternatives)
- [ ] News feed + AI sentiment tags
- [ ] Watchlist (add/remove + daily refresh)
- [ ] Stock comparison (2–3 way + AI verdict)
- [ ] Ask FinSight chat (function-calling + citations + guardrails) — last; deepest dependency
- [ ] Public SEO pages (SSR + structured data) — reuses Report rendering
- [ ] Marketing landing page

### Add After Validation (v1.x)

- [ ] Smart push alerts (score-change / news triggers) — needs a notification channel; trigger: users return for refresh
- [ ] Broker portfolio sync — trigger: validated demand for personalized portfolio scoring
- [ ] AI prompt-based screener — trigger: chat usage shows users want discovery, not just lookup

### Future Consideration (v2+)

- [ ] Multi-language — defer until English PMF proven; large i18n + Gemini eval surface
- [ ] Portfolio score + rebalance AI — depends on broker sync
- [ ] IPO verdicts — distinct data + compliance domain
- [ ] SEBI RA registration → branded BUY/SELL — unlocks the strongest verdict language; major regulatory milestone
- [ ] MF distribution (ARN) + subscription billing — monetization milestone

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Scoring engine (stock + fund) | HIGH | HIGH | P1 |
| Search + autocomplete | HIGH | MEDIUM | P1 |
| Stock Report (score + 6 cards + summary) | HIGH | HIGH | P1 |
| MF Report (+ better alternatives) | HIGH | HIGH | P1 |
| Compliance layer | HIGH (trust + legal) | MEDIUM | P1 |
| Auth (JWT + OAuth) | MEDIUM | MEDIUM | P1 |
| Data layer + fallback/cache | HIGH (enabling) | HIGH | P1 |
| Price chart + fundamentals/technicals strips | MEDIUM | MEDIUM | P1 |
| News feed + sentiment tags | MEDIUM | MEDIUM | P1 |
| Watchlist | MEDIUM | LOW–MEDIUM | P1 |
| Comparison (+ AI verdict) | MEDIUM | MEDIUM | P1 |
| Ask FinSight chat | HIGH (differentiator) | HIGH | P1 |
| Public SEO pages | HIGH (distribution) | MEDIUM | P1 |
| Marketing landing page | MEDIUM | LOW | P1 |
| Smart alerts | MEDIUM | MEDIUM | P2 |
| Broker sync | HIGH | HIGH | P2 |
| Multi-language | MEDIUM | HIGH | P3 |

*Note: this is a full-PRD MVP, so nearly all items are P1 by user directive. Priority within P1 should follow the dependency graph (data layer → search → scoring → reports → chat/SEO), not raw value.*

## Competitor Feature Analysis

| Feature | Tickertape | Trendlyne | Screener.in | Our Approach |
|---------|-----------|-----------|-------------|--------------|
| Composite score | 5-axis Scorecard (Perf/Val/Profit/Growth/Red Flags) | DVM 0–100, color-coded G/M/B, EOD recompute | None — pros/cons checklist | Single 1–10 + worded verdict (Strong/Caution/Weak) |
| Stocks + funds parity | Separate stock & MF UX | Stocks only (DVM) | Stocks only | One unified score model across both — the wedge |
| Verdict language | Quantitative ratings | Color bands | Auto pros/cons | Plain-English verdict + Gemini paragraph, compliance-bounded |
| Insight cards | Scorecard tiles + Red Flags | DVM tiles | Tables | Six cards as the report hero (Trackk-style, extended to MFs) |
| Promoter holdings | Pledge % in Red Flags | Shareholding trends | Shareholding table | Dedicated Promoter Holdings card (pledge as red flag) |
| Peer comparison | Built-in | Built-in | Customizable peer table | 2–3 way + AI "better pick" verdict |
| MF risk metrics | Full screener (Sharpe/Sortino/alpha/drawdown) | Limited | None | Same metrics + Fund Score + "better alternatives" |
| News sentiment | MMI (market mood, sentiment-only) | News + analyst consensus | Announcements feed | Per-headline Gemini Positive/Negative/Neutral tags feeding score |
| Conversational AI | None native | None native | None | Ask FinSight: function-calling + citations + guardrails (no incumbent has this) |
| Public SEO pages | Collections + company pages | Stock pages | Company pages (financials) | Verdict-led SSR pages w/ structured data |
| Execution/broker | No | No | No | No (research-only by design) |

## Research Flags for Roadmap

- **Ask FinSight guardrails (MEDIUM confidence):** searches returned no strong Indian-incumbent reference for a grounded financial research chatbot with function-calling + citations. The phase that builds chat needs dedicated research on: prompt-injection defense, out-of-scope refusal, citation-grounding verification, and SEBI-safe response templating. Treat as the highest-uncertainty MVP feature.
- **Free-data rate limits (operational risk):** Yahoo/MFAPI/AMFI/NewsData free tiers will throttle. The data-layer phase needs explicit fallback + cache strategy research (already partly in PROJECT.md constraints).
- **Compliance verb taxonomy:** the exact wording of verdict bands and the AI-sanitization blocklist should be validated against current SEBI RA/IA framework (amended 2024–2025) before launch — definitions of "advice" vs "research" are precise.

## Sources

- [Tickertape Scorecard / Red Flags / promoter holdings](https://www.tickertape.in/blog/introducing-scorecard-stock-analysis-got-quicker-and-better-with-quantitative-insights/) — HIGH (official product blog)
- [Tickertape review 2026 (features overview)](https://www.strike.money/reviews/tickertape) — MEDIUM
- [Trendlyne DVM score details](https://trendlyne.com/score-details/) and [DVM how-it-works FAQ](https://help.trendlyne.com/support/solutions/articles/84000347982-what-is-the-trendlyne-dvm-score-and-how-does-it-work-) — HIGH (official docs)
- [Tickertape MF screener metrics (Sharpe/Sortino/alpha/drawdown)](https://www.tickertape.in/screener/home/mutual-fund) — HIGH (official) + [ICICIdirect on MF metrics](https://www.icicidirect.com/research/equity/finace/how-to-compare-mutual-funds-alpha-sharpe-ratio-sortino-ratio-standard-deviation-and-more) — MEDIUM
- [Screener.in features / pros-cons x-ray / peer comparison](https://www.screener.in/features/) — HIGH (official) + [Screener.in review 2026](https://www.strike.money/reviews/screener-in) — MEDIUM
- [SEBI RA/IA framework amendments 2024–2025 (advice vs research distinction)](https://corporate.cyrilamarchandblogs.com/2024/08/revamping-the-investment-advisers-and-research-analysts-frameworks-the-sebi-way/) — MEDIUM + [Business Standard SEBI new guidelines](https://www.business-standard.com/markets/news/sebi-issues-new-guidelines-for-research-analysts-investment-advisers-125010801273_1.html) — MEDIUM
- [StockEdge / Trendlyne feature comparison + sentiment](https://univest.in/blogs/best-stock-analysis-app-india-2026-top-7-picks-for-research-screeners-amp-advisory) — LOW–MEDIUM
- [Gemini as financial research assistant 2026](https://www.investing.com/academy/investing-pro/best-finance-chatbots/) — LOW (general, not India-specific)
- PROJECT.md (MVP scope, scoring framework, compliance constraints, free-data ecosystem) — authoritative project spec

---
*Feature research for: AI investment-research web app (Indian retail, stocks + funds)*
*Researched: 2026-05-27*
