# Pitfalls Research

**Domain:** AI-powered investment-research web app for Indian retail investors (stocks + mutual funds) on Next.js 15 / NestJS / MongoDB / Gemini
**Researched:** 2026-05-27
**Confidence:** HIGH on compliance + AI invariants (verified against SEBI 2024/2025 guidance, DPDP Rules 2025, Gemini caching docs, MongoDB Atlas docs); MEDIUM on free-data fragility and scoring correctness (stable engineering knowledge, not single-source verified)

> This domain has an unusual property: the most dangerous pitfalls are **legal and correctness**, not performance. A slow report annoys a user; a hallucinated EPS or an implied BUY recommendation pre-registration is an existential regulatory and reputational risk. Treat the compliance layer and the AI-number split as load-bearing architecture, not a final-phase veneer.

## Critical Pitfalls

### Pitfall 1: Treating compliance framing as a final-phase "disclaimer banner"

**What goes wrong:**
Teams build the full report UI, scoring, and AI narrative first, then bolt on disclaimers and re-word verdicts at the end. By then "BUY/SELL/HOLD" verbs, "you should invest," "recommended pick," and target-price language are baked into UI copy, AI prompts, comparison logic, and SEO page templates. Retrofitting compliance means rewriting prompts, re-testing AI output, and re-crawling SEO pages.

**Why it happens:**
Compliance feels like a content/legal concern, not an engineering one. The PRD's own competitors (Tickertape, Trackk) display opinionated verdicts, so the natural instinct is to copy their verb choices — but several incumbents are SEBI-registered RAs and you are not (yet).

**How to avoid:**
- Make "analysis-not-advice" a **typed contract** at the data layer, not a copy guideline. The verdict field is an enum: `STRONG_SCORE | CAUTION | WEAK_SCORE` (never `BUY | SELL | HOLD`). The compiler enforces it.
- Centralize all user-facing verdict/score language behind a single rendering module so wording is reviewed in one place.
- Bake disclaimers into the report layout component and the SEO page template from the first render, not at the end.
- SEBI's Dec 2024 RA amendments explicitly bring "fintech enterprises, digital advisory platforms, and technology-driven research aggregators that use algorithmic or AI-based analytical tools" under RA oversight. An AI scoring app that says "Strong Buy" is squarely in scope. The line you must stay behind is **general analysis** (allowed) vs **personalized recommendation / explicit call to transact** (requires RA registration).
- The "educational content" loophole does **not** insulate you — SEBI looks at substance over labels. A disclaimer saying "for educational purposes" on top of "Buy this stock" is still treated as a recommendation. (Project constraint, confirmed consistent with SEBI's substance-over-form stance.)

**Warning signs:**
- The words "buy", "sell", "hold", "recommend", "should invest", "target price" appear anywhere in code, prompt templates, or SEO copy.
- Compliance review is scheduled "near launch."
- AI free-text output is shown to users without a server-side sanitization filter.

**Phase to address:** Foundation/Compliance Contract (define verdict enums + disclaimer components first), enforced again in every report/AI phase. A dedicated Compliance Hardening pass before SEO go-live.

---

### Pitfall 2: AI narrative leaking a wrong number even though numbers are computed deterministically

**What goes wrong:**
The team correctly computes all numbers deterministically and instructs Gemini to "only write narrative." But the narrative *restates* figures — "with a healthy ROE of around 18%…" — and Gemini paraphrases the real 14.2% into "around 18%," or rounds, or transposes a YoY growth number. The number is now wrong **and presented as analysis**, which is both a trust failure and a compliance exposure (misrepresentation). The deterministic-number guarantee silently breaks the moment a number passes *through* the LLM's prose.

**Why it happens:**
"Gemini never generates a number" is interpreted as "don't ask Gemini for a number" — but feeding real numbers into the prompt and letting it weave them into sentences re-introduces generation. LLMs are probabilistic over tokens, including digit tokens.

**How to avoid:**
- **Template the numbers, don't let the model emit them.** Have Gemini produce narrative with placeholders/structured slots (e.g. `{{roe}}`, `{{revenue_growth}}`), then the server substitutes the verified deterministic values. The model writes the sentence structure; code writes the digits.
- Where free-flowing prose is unavoidable, run a **post-generation numeric audit**: extract every numeric token from the narrative and assert each appears in the verified data set (within tolerance). Reject/regenerate on mismatch.
- **Sampled human audit**: log a random sample of generated narratives + the source data daily; eyeball for number drift, tone-of-advice creep, and hallucinated facts (e.g. invented management commentary).
- Force citations: every factual claim in narrative must map to a data source field; un-citable claims are a red flag.
- Use low temperature for narrative generation and never for anything numeric.

**Warning signs:**
- Prompts contain "summarize these financials" and the output contains digits not present verbatim in your data.
- No automated check comparing narrative numbers to source numbers.
- QA only reads the score and skips the prose.

**Phase to address:** Stock Report + AI Narrative (build the template-slot + numeric-audit guardrail with the first narrative feature). Re-applied for MF Report, Ask FinSight chat, and news sentiment.

---

### Pitfall 3: Free data sources breaking shape, rate-limiting, or going dark with no fallback

**What goes wrong:**
`yahoo-finance2`, unofficial NSE/BSE endpoints, MFAPI.in, and AMFI are unofficial/free and change without notice. Yahoo periodically alters response schemas and adds crumb/cookie auth; NSE blocks datacenter IPs and requires browser-like headers + session cookies; AMFI publishes a flat NAV text file whose format occasionally shifts. A single hard dependency means a silent upstream change takes down every report at once — and because numbers feed the deterministic scores, a malformed parse can produce *plausible-but-wrong* scores rather than an obvious error.

**Why it happens:**
Free sources work perfectly in dev, so they feel reliable. The fragility only shows under production volume (rate limits) or weeks later (schema drift). "Real data from day one" (a project decision) raises the stakes.

**How to avoid:**
- **Multi-source fallback per metric**, with an explicit source-priority chain (e.g. price: Yahoo → NSE wrapper → cached last-good).
- **Cache aggressively** (Redis hot path) so an upstream outage degrades to stale-but-labeled data, not a blank report. 15-min-delayed data is already acceptable per constraints — lean into it.
- **Schema validation at ingestion** (zod/class-validator on every external payload). Reject and alert on shape mismatch instead of writing garbage into Mongo. Never trust external data.
- **Range/sanity assertions** before a number can feed the scoring engine (P/E not negative-million, NAV within plausible band vs yesterday).
- Decouple ingestion from serving: a BullMQ ingestion job writes validated data to Mongo; the report reads from Mongo, never live from Yahoo on the request path (also fixes the < 2s latency requirement).
- Set realistic request pacing + jittered backoff; respect that these are unofficial endpoints (rotate user-agents, persist NSE session cookies, never hammer).

**Warning signs:**
- Report endpoint calls Yahoo/NSE synchronously on each request.
- No validation between "fetched JSON" and "saved document."
- Scores change but no source field/timestamp recorded.
- Works in dev, intermittent `null`/`NaN` in production.

**Phase to address:** Data Ingestion (build the source-abstraction + validation + cache layer before scoring depends on it).

---

### Pitfall 4: Synchronous Gemini calls on the report request path blowing the < 2s budget

**What goes wrong:**
The report endpoint calls Gemini live to generate the narrative/SWOT/sentiment while the user waits. Gemini Flash latency (often 1–4s, Pro much worse) plus data fetching plus rendering blows the < 2s-on-4G requirement instantly, and every concurrent user multiplies cost.

**Why it happens:**
The naive flow is "fetch data → call AI → return." It works fine for one user in dev. The latency and cost only bite under real traffic.

**How to avoid:**
- **Precompute narratives in the nightly recompute job** and store them in Mongo alongside the score. The report read becomes a cache hit, not an AI call. Re-generate narrative only when score/data materially changes.
- The < 2s path should be: Redis/Mongo read → render. Zero synchronous LLM calls.
- Reserve live Gemini for **Ask FinSight chat only** (genuinely interactive), and stream tokens there so perceived latency is low.
- Use **Gemini Flash / Flash-Lite** for high-volume narrative + sentiment; reserve 2.5 Pro for the rare deep-reasoning path. Calling Pro where Flash suffices is the single biggest cost mistake.
- **Context caching caveat:** explicit context caching has a **32,768-token minimum** — a single stock's context almost certainly won't reach it, so explicit caching is the *wrong tool* for per-stock context and you'll pay storage for nothing. **Implicit caching** (automatic, no storage cost, 1,024-token min on Flash / 2,048 on Pro) is what actually saves money on repeated similar prompts. Don't architect around explicit caching expecting the "90% discount" unless you batch many stocks into one large cached context.

**Warning signs:**
- `await gemini.generate()` inside the GET report handler.
- p95 report latency creeps up as traffic grows.
- Gemini bill scales linearly with page views, not with unique stocks.
- Explicit cache created per-stock and immediately discarded (token count below minimum → silently no cache).

**Phase to address:** Scoring Engine / nightly job (precompute narratives), Performance/Caching (enforce no-LLM-on-read-path), Ask FinSight (streaming).

---

### Pitfall 5: Scoring engine correctness — survivorship bias, stale fundamentals, NAV timing, peer selection

**What goes wrong:**
The deterministic score is the core IP, and it can be confidently wrong:
- **Survivorship bias:** peer-group/benchmark comparisons computed only over currently-listed stocks or surviving funds make everything look better than reality.
- **Stale fundamentals:** quarterly results lag; scoring last-year's EPS against today's price produces a misleading valuation score, especially right after results season.
- **NAV timing:** MF NAVs are end-of-day and cutoff-dependent; comparing a fund's NAV-based return against an intraday index level mixes timeframes.
- **Peer-group selection:** wrong sector/market-cap bucket makes a midcap look cheap vs largecaps. Garbage peer set → garbage relative score.
- **Inconsistency:** two near-identical stocks get wildly different scores, or the same stock's score swings without a real data change — destroying user trust and explainability.

**Why it happens:**
Scoring "works" on a few hand-checked names. The biases are systematic and invisible without deliberate testing against known-good references. Indian-market specifics (corporate actions, scheme mergers) corrupt time series quietly.

**How to avoid:**
- **Explainability first:** every score must decompose into its weighted components (Fundamentals 35% / Valuation 20% / Technical 20% / Sentiment 10% / Risk 10% / Event 5%) with the inputs shown. If you can't explain it, you can't debug it or defend it.
- **Determinism tests:** same inputs → same score, every time. Snapshot-test scores for a fixed basket of names; any drift must be traceable to a data change.
- **Point-in-time data discipline:** stamp every fundamental with its report date; never compare across mismatched periods. Use as-of-date for backtest-style peer comparisons to avoid survivorship bias.
- **Corporate-action handling:** adjust historical prices for splits/bonuses/dividends (Pitfall 8) before any momentum/volatility calc.
- **Peer-group definition is explicit and reviewable** (sector + market-cap band), not implicit.
- For funds, compare NAV-return to benchmark **total-return** index over matched periods; respect NAV cutoff timing.

**Warning signs:**
- Score changes with no corresponding data change.
- Can't answer "why is this a 7?" from stored component breakdown.
- Peer comparisons exclude delisted/merged entities.
- Valuation score looks great the day before results, terrible the day after.

**Phase to address:** Scoring Engine (build explainability + determinism tests + point-in-time discipline as core, not later). Corporate-action handling in Data Ingestion.

---

### Pitfall 6: DPDP / data-handling missteps (over-collection, broker passwords, weak consent)

**What goes wrong:**
The app collects/stores more PII than needed, stores it without a clear consent record, or (worst) ever touches broker credentials. India's DPDP Rules 2025 were notified Nov 2025; full consent-notice, breach-reporting (72h), and data-principal-rights obligations come into force **13 May 2027** — meaning you are building *into* an active, near-term regulatory regime, not ahead of a hypothetical one.

**Why it happens:**
Auth/onboarding is built for convenience; consent is an afterthought checkbox. Data-residency is assumed to be a hard legal mandate when it's actually (today) a self-imposed best practice.

**How to avoid:**
- **Data minimization:** collect only what the product needs (email, name, watchlist). No broker passwords, ever (already out of scope — keep it that way).
- **Explicit consent flow on first launch** with a stored, timestamped consent record (DPDP requires free, specific, informed, affirmative consent). Build it as a real artifact, not a checkbox.
- **Secrets in a secret manager**, never in code/config (also a hard platform rule). JWT signing keys, Gemini keys, DB creds.
- **Data residency nuance:** DPDP uses a *negative-list* model for cross-border transfer; as of May 2026 no restricted jurisdictions are published, so ap-south-1 hosting is a sensible self-imposed default and latency win, **not** a current legal blocker. Don't over-engineer geo-fencing for a mandate that doesn't yet exist — but keep PII in Mumbai as planned.
- Plan for data-principal rights (access/erasure) in the user-data schema now (soft-delete, exportable) so 2027 obligations aren't a rewrite.

**Warning signs:**
- Consent is a single checkbox with no stored record.
- PII fields collected "just in case."
- Any code path that would store a broker password.
- Secrets in `.env` committed or in Helm/config.

**Phase to address:** Foundation/Auth (consent record + minimization + secret manager), revisited in Compliance Hardening.

---

### Pitfall 7: Next.js SSR/SEO and NestJS auth security mistakes

**What goes wrong:**
- **SEO pages not actually indexable:** per-stock/fund pages rendered client-side (or with `dynamic = 'force-dynamic'` calling slow APIs) so crawlers get empty shells or time out — killing the SEO distribution moat that is the core go-to-market.
- **Leaking secrets to the client:** Gemini/DB keys imported into a Client Component or `NEXT_PUBLIC_` exposed.
- **JWT/OAuth holes:** tokens in `localStorage` (XSS-stealable), no refresh rotation, Google OAuth `state`/redirect not validated, no rate limiting on auth + report endpoints (free data sources get you blocked *and* you get scraped).

**Why it happens:**
App Router's Server/Client boundary is subtle; it's easy to render dynamically and lose static/ISR benefits. Auth "works" without the hardening.

**How to avoid:**
- SEO pages = **statically generated or ISR** with data read from Mongo (not live external APIs), so HTML is complete and fast for crawlers. Add structured data (JSON-LD) + canonical URLs.
- Keep Gemini/DB access **server-side only** (NestJS owns it); Next.js calls NestJS, never external AI/DB directly from the browser.
- JWT in **HttpOnly, Secure, SameSite=Strict cookies**; short-lived access + refresh rotation. Validate OAuth `state` and redirect URI allow-list.
- **Rate-limit** auth, search, and report endpoints (Redis) — protects both your free-data quotas and your own infra.
- Never expose stack traces / internal errors in API responses.

**Warning signs:**
- View-source on a stock page shows no content.
- `NEXT_PUBLIC_GEMINI_KEY` exists.
- Tokens in `localStorage`.
- No rate limiter on report/search.

**Phase to address:** Foundation/Auth (JWT/OAuth/rate-limit/secrets), SEO Pages (SSG/ISR + structured data).

---

### Pitfall 8: Indian-market data quirks corrupting prices, symbols, and fund mapping

**What goes wrong:**
- **NSE vs BSE symbols:** same company, different symbol/format (`RELIANCE` on NSE vs `500325` on BSE); Yahoo wants suffixes (`.NS` / `.BO`). Mismatched symbols → wrong company's data, or duplicates.
- **Corporate actions:** splits/bonuses/dividends create huge artificial price gaps. Unadjusted history makes volatility/momentum scores nonsense and charts show fake crashes.
- **MF scheme-code mapping:** AMFI scheme codes vs MFAPI codes vs fund-house names drift; direct vs regular plans, growth vs IDCW variants get conflated → wrong NAV/returns.
- **Market hours / holidays:** Indian market calendar (NSE/BSE holidays, muhurat trading) differs from any built-in calendar; "today's" data on a holiday or pre-open is stale/empty and naive code treats it as a real move.

**Why it happens:**
Devs unfamiliar with Indian market microstructure assume one symbol per company and continuous adjusted data. The quirks only surface on specific names/dates.

**How to avoid:**
- Maintain a **canonical instrument master** (one internal ID → NSE symbol, BSE code, Yahoo ticker, ISIN). All lookups go through it.
- **Always use split/bonus/dividend-adjusted price series** for any technical/volatility/momentum calc and charts. Verify adjustment on known split events (e.g. a recent 1:5 split).
- For funds, key on **AMFI scheme code + plan/option** (direct/growth) explicitly; store the mapping and validate NAV continuity across scheme mergers.
- Use the **official NSE/BSE trading-holiday calendar**; label data freshness and don't compute "daily change" on non-trading days.

**Warning signs:**
- A chart shows a 50% "crash" on a split date.
- Search returns the wrong company or duplicate listings.
- A fund's returns look impossible (regular vs direct mixed).
- "Today's change" is huge on a market holiday.

**Phase to address:** Data Ingestion (instrument master + adjustment + holiday calendar), validated in Scoring Engine.

---

### Pitfall 9: MongoDB schema/index/feature misuse

**What goes wrong:**
- **Time-series collection misuse:** using a regular collection for tick/price history (or a TS collection with wrong `timeField`/`metaField`/granularity) → bloated storage, slow range queries on charts. Or worse, trying to *update* documents in a TS collection (limited support).
- **Missing indexes on the hot read path:** report/search/watchlist queries do collection scans → slow report loads, blowing < 2s.
- **Atlas Vector Search misconfig:** wrong `numDimensions` vs the embedding model, missing the vector index definition, `M:1` shared-tier limits, or expecting it on a free/shared cluster where it isn't supported/performant.
- **Schema for high-read reports:** over-normalized report data requiring multiple round-trips per page load.

**Why it happens:**
Mongo's flexibility hides modeling decisions; it all "works" on tiny dev data. TS collections and Vector Search have specific configuration that's easy to get subtly wrong.

**How to avoid:**
- **Time-series collections** for price/NAV history with correct `timeField`, `metaField` (symbol), and appropriate `granularity`; treat them as append-only.
- **Index the read path deliberately:** compound indexes on report lookups (symbol + date), search prefix index/autocomplete, watchlist by user. Run `explain()` on every hot query.
- **Denormalize the report document** so a single read renders the page (embed score components, narrative, latest fundamentals). Reads dominate; optimize for them.
- **Atlas Vector Search:** match `numDimensions` to the chosen embedding model exactly; define the vector index in the search index config; verify your cluster tier supports it; consider quantization only at scale. For v1's volume a dedicated Search Node is likely premature — but get the index *definition* right from the start.
- Add TTLs to Redis cache keys (platform rule: no unbounded cache keys).

**Warning signs:**
- Report load slow with realistic data; `explain()` shows `COLLSCAN`.
- Vector search returns nonsense or errors on dimension mismatch.
- TS collection update attempts failing.
- Report page makes many DB round-trips.

**Phase to address:** Data Ingestion / Foundation (schema + TS collections + indexes), Ask FinSight (vector index for news/filing semantic search), Performance/Caching.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Live Gemini call on report request | Simple flow, ships fast | Blows < 2s budget; cost scales with page views; outage = no report | Never for the report path; only for interactive chat |
| Single free data source, no fallback | Less integration code | Silent outage/shape-drift takes down all reports + corrupts scores | Spike/prototype only — never in the data layer that feeds scores |
| Letting AI restate numbers in prose | Natural-sounding narrative | Wrong numbers presented as analysis (trust + compliance risk) | Never — always template/audit numbers |
| "Educational purposes" disclaimer over opinionated verdicts | Feels safer | Doesn't satisfy SEBI (substance over form); recommendation exposure remains | Never — stay on analysis side via enum verdicts |
| Regular collection for price history | One less config | Storage bloat + slow chart queries | Tiny dev datasets only |
| JWT in localStorage | Easy client access | XSS token theft | Never — HttpOnly cookies |
| No instrument master (ad-hoc symbol strings) | Faster first integration | Wrong-company data, dedupe hell, NSE/BSE/Yahoo drift | Single-source prototype only |
| Explicit context cache per stock | Assumes "90% discount" | Below 32,768-token min → no cache, paid storage for nothing | Only when batching many stocks into one large context |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Yahoo Finance (`yahoo-finance2`) | Calling synchronously per request; no schema validation | Background ingestion job → validate → Mongo; report reads Mongo; handle crumb/cookie auth changes |
| NSE/BSE unofficial wrappers | Datacenter IP + no headers → blocked; treating as primary | Browser-like headers + persisted session cookies; use as *fallback* only; jittered backoff |
| AMFI / MFAPI.in NAV | Parsing the flat NAV text naively; conflating direct/regular, growth/IDCW | Key on scheme code + plan/option; validate NAV continuity; multi-source |
| Gemini Flash/Pro | Using Pro where Flash suffices; expecting explicit-cache discount per stock | Flash/Flash-Lite default; Pro only for deep reasoning; rely on implicit caching |
| Google OAuth | Unvalidated `state`/redirect; trusting client-supplied identity | Validate `state`, allow-list redirect URIs, NestJS owns session issuance |
| News (RSS / NewsData.io free) | Hitting rate limits; trusting AI sentiment without audit | Poll on schedule + cache; sampled audit of sentiment labels |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous AI on read path | p95 latency > 2s; cost ∝ page views | Precompute narratives nightly; read-only report path | Immediately under any real concurrency |
| Missing hot-path indexes | Slow report/search; `COLLSCAN` in explain | Compound indexes on symbol+date, search prefix, user watchlist | A few thousand documents / first traffic |
| Live external API per report | Latency spikes, rate-limit blocks | Ingestion job → Mongo + Redis cache | First burst of concurrent users |
| Unbounded Redis cache keys | Memory growth, eviction surprises | TTLs on every key (platform rule) | Weeks of accumulation |
| Vector search on shared tier | Errors / poor latency for chat | Right cluster tier; correct dimensions; quantize at scale | When Ask FinSight semantic search gets real volume |
| Calling Gemini Pro everywhere | Cost blowup, higher latency | Flash default, Pro reserved | As narrative/sentiment volume grows |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Gemini/DB keys reachable from browser (`NEXT_PUBLIC_`, client import) | Key theft, abuse, billing attack | Server-side only; NestJS owns AI/DB; Next.js proxies |
| Storing broker credentials | Catastrophic breach + regulatory | Never store; broker sync is out of scope — keep it out |
| Logging PII (email/phone/name) in structured logs | DPDP exposure | Redact PII from logs (platform rule) |
| No rate limiting on auth/report/search | Free-data quota burn, scraping, brute force | Redis rate limits per IP/user |
| Weak consent record | DPDP non-compliance (rules active, full obligations May 2027) | Timestamped, specific, affirmative consent artifact |
| Exposing AI raw output without sanitization | Injected/advice-like text reaching users unfiltered | Server-side AI output sanitization filter (verdict-language + number audit) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing a score with no "why" | Distrust; can't act on opaque number | Always show the 6-component breakdown + plain-English reasoning |
| Hiding data freshness/delay | User thinks 15-min-delayed price is live; bad decisions | Label "15-min delayed" + last-updated timestamp prominently |
| Advice-sounding verdicts | Misleads users + regulatory risk | "Strong Score / Caution / Weak Score" enum, never Buy/Sell |
| No "past performance" caveat on returns | Users extrapolate fund returns | Mandatory past-performance disclaimer on every returns view |
| Stale watchlist scores shown as fresh | Decisions on old data | Daily refresh + visible refresh timestamp |
| Blank/error report on upstream outage | Looks broken | Degrade to cached last-good data, clearly labeled stale |

## "Looks Done But Isn't" Checklist

- [ ] **Report verdict:** Often missing the enum constraint — verify no Buy/Sell/Hold can be emitted anywhere (grep code + prompts + SEO templates).
- [ ] **AI narrative:** Often missing numeric audit — verify every number in prose matches verified source data within tolerance.
- [ ] **SEO page:** Often missing real SSR content — verify view-source shows full HTML + JSON-LD, and crawler sees it within budget.
- [ ] **Data layer:** Often missing schema validation — verify malformed upstream payloads are rejected, not silently stored.
- [ ] **Scoring:** Often missing determinism — verify identical inputs reproduce identical scores; component breakdown stored.
- [ ] **Prices:** Often missing corporate-action adjustment — verify a known recent split shows no fake gap.
- [ ] **Consent:** Often missing a stored record — verify a timestamped consent artifact exists per user.
- [ ] **Secrets:** Often missing manager usage — verify no keys in code/config/`NEXT_PUBLIC_`.
- [ ] **Latency:** Often missing under load — verify p95 report < 2s with no synchronous LLM call on the read path.
- [ ] **Disclaimers:** Often missing on returns/MF views — verify past-performance + analysis-not-advice on every report and SEO page.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Advice-language baked in everywhere | HIGH | Centralize verdict rendering, swap to enums, re-audit prompts, re-crawl SEO pages |
| AI leaked wrong numbers in prod | MEDIUM | Add template-slot + numeric audit, regenerate all narratives, run sampled audit, issue corrections |
| Data source schema change broke reports | LOW–MEDIUM | Fix validator + parser; fallback source covers gap; backfill from cache |
| Scoring found to be biased/inconsistent | HIGH | Add point-in-time + survivorship-safe peer sets; recompute history; communicate score methodology change |
| Synchronous AI blowing latency | MEDIUM | Move narrative to nightly precompute; make report read-only |
| Missing indexes | LOW | Add compound indexes; verify with `explain()` |
| Vector index dimension mismatch | LOW | Recreate index with correct `numDimensions`; re-embed |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Advice vs analysis / SEBI framing | Foundation/Compliance Contract + Compliance Hardening | Grep: no Buy/Sell/Hold/recommend in code/prompts/SEO; enum verdict type |
| AI number leakage | Stock Report + AI Narrative | Automated numeric audit passes on sampled narratives |
| Free-data fragility | Data Ingestion | Kill primary source in staging → reports degrade to cached, not break |
| AI latency/cost on read path | Scoring Engine (precompute) + Performance/Caching | p95 report < 2s; no `gemini.generate` in GET handler |
| Scoring correctness/bias | Scoring Engine | Determinism snapshot tests; point-in-time + peer-set review |
| DPDP / data handling | Foundation/Auth + Compliance Hardening | Consent record exists; data minimization audit; secret manager |
| Next.js SSR/SEO + auth security | Foundation/Auth + SEO Pages | View-source full HTML + JSON-LD; HttpOnly cookies; rate limits active |
| Indian-market data quirks | Data Ingestion | Instrument master resolves NSE/BSE/Yahoo; split shows no fake gap; holiday calendar |
| MongoDB schema/index/vector | Data Ingestion/Foundation + Ask FinSight | `explain()` no COLLSCAN; TS collection configured; vector dims match model |

## Sources

- [Understanding SEBI's 2025 FAQs on Research Analysts (Mondaq)](https://www.mondaq.com/india/securities/1695408/understanding-sebis-2025-faqs-on-research-analysts-a-business-centric-analysis) — AI/algorithmic research aggregators under RA oversight; Dec 16 2024 amendments; AI-use disclosure by Apr 30 2025
- [Overhaul of the Regulatory Framework for IAs and RAs (AZB Partners)](https://www.azbpartners.com/bank/overhaul-of-the-regulatory-framework-for-investment-advisers-and-research-analysts/) — research vs advisory distinction
- [SEBI FAQs 2025 Key Clarifications (LKS Attorneys)](https://www.lkslaw.com/insights/articles/key-clarifications-under-the-sebi-issued-faqs-2025)
- [DPDP Rules 2025 Notified (PIB, Gazette)](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf) — notified Nov 13 2025
- [Transforming data privacy: DPDP Act 2023 and DPDP Rules 2025 (EY India)](https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025) — phased timeline; Phase 3 obligations May 13 2027; negative-list cross-border model
- [Gemini API Context Caching docs (Google)](https://ai.google.dev/gemini-api/docs/caching) — implicit vs explicit; 1,024/2,048-token implicit min (Flash/Pro), 32,768 explicit min; TTL default 1h; ~90% cached-token discount
- [Gemini API pricing (Google)](https://ai.google.dev/gemini-api/docs/pricing) — Flash vs Pro cost
- [MongoDB Atlas Vector Search benchmark/perf docs](https://www.mongodb.com/docs/atlas/atlas-vector-search/benchmark/overview/) — dimension limits, quantization, dedicated Search Nodes
- `.planning/PROJECT.md` — compliance + AI invariants, stack constraints, free-data ecosystem (project source of truth)

---
*Pitfalls research for: AI investment-research web app for Indian retail investors (Next.js/NestJS/MongoDB/Gemini)*
*Researched: 2026-05-27*
