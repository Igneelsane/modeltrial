# Product Requirements Document (v4 — identification-first)
## KPI Analyzer — "Upload a dataset, understand what it is, then what to measure"

**Owner:** Rohith · **Doc status:** v4 (revised to match the current build) · **Last updated:** 11 Aug 2026
**Changelog:** v1 → v2: build-ready specs (algorithms, schema, cleaning, corpus, DoD). v2 → v3: hybrid KPI sourcing (see `KPI-Library-Architecture-Decision.md`). v3.1: evidence-floor confidence, honest `beforeunload`, 1a/1b scope split. **v4: architectural pivot per the revised brief — identification is the core, not a preliminary step.** No per-dataset-type branches anywhere: the agent inspects whatever dataset is dropped in (columns, value patterns, structure), works out for itself what it is, and *derives* everything downstream from that evidence. If it isn't confident, it says so and shows its reasoning. Proposals are derived, cited, and never auto-executed; data gaps are stated. Sections rewritten: §5 flow, §6 architecture, §7 identification, §8 derived analysis, §9 proposals & gaps, §12 metrics, §14 edge cases, §16 corpus, §17 DoD, §18 roadmap, §19 risks, §21 open questions.

---

## 1. Problem Statement

Students, early-stage founders, and small marketing teams sit on datasets — campaign exports, email/CRM blasts, web analytics pulls, social media performance sheets — and don't reliably know **what kind of data they're looking at**, which metrics actually apply, or how to compute them correctly (right formula, right columns, right time grouping). Existing BI tools assume the user already knows what to measure and how to build it.

This tool inverts that. It identifies the dataset first — **the dataset tells the user what it is, and then what to measure** — and everything downstream is derived from that identification, with the reasoning shown and the uncertainty admitted.

## 2. Goal

Build a lightweight web tool where a user uploads a dataset → the tool inspects columns, values, and structure; **works out on its own what kind of data it is** (campaign performance, email/CRM, web & funnel, social, sales/revenue, something outside that list, or honestly "I'm not sure") → derives which analyses and KPIs are supported by the evidence → computes them → shows the numbers, the formulas, and the decisions the numbers can ground — and explicitly lists what the data **can't** tell us.

**Success in one sentence:** a user uploads any CSV export and walks away knowing what it is, what's worth measuring in it, the numbers behind each finding, and what decisions those numbers can — and cannot — ground.

## 3. Non-Goals (explicitly out of scope)

- Not a general-purpose BI/dashboard builder (no drag-drop chart building)
- Not a data-cleaning suite (basic cleaning only, not a full ETL tool)
- Not real-time/streaming analytics — batch file upload only
- Not multi-user collaboration / teams / auth in v1
- Not predictive modeling or forecasting (descriptive only; no trend extrapolation)
- Not a replacement for domain expertise — it's a starting point, not an auditor's judgment
- **No autonomous execution — the tool proposes, it never acts.** No buttons that "do" anything beyond the analysis itself; proposals are explicitly framed as numbers for the user to act on
- **No pre-baked analysis menus keyed to a fixed set of dataset types** — the analysis plan is always derived from the columns actually present
- No server-side processing of any kind in v1 (everything computes in the browser)
- No persistence: results, uploads, and analysis live only in memory for the session; refreshing clears everything (by design, §13)

## 4. Target User & Core User Story

**Primary persona:** MBA/business student or small marketing-team operator who has a CSV export (campaign manager, email tool, GA, social dashboard, POS) and wants a fast, credible read on "what is this data, what does it say, and what should I do about it" — without analytics jargon.

**Secondary persona (portfolio-stage):** the recruiter/interviewer who tries the demo — it must be impressive on the *first* upload with *any* reasonable file, and must handle a confusing file honestly.

**Core story:**
> "I have this marketing export. I don't know what it is or what to look at. Tell me what kind of data it is, what I should be measuring, and what the numbers actually support — and tell me when you're not sure."

## 5. Core User Flow — with the honesty path as a first-class branch

```
1. UPLOAD ──► 2. INSPECT ──► 3. IDENTIFY (the core step)
                                    │
                    ┌───────────────┴────────────────┐
                    ▼                                ▼
           confident enough                    NOT confident
           ("campaign data — 80%")            ("I can't confidently say what this is"
                    │                            + full reasoning, exploratory mode)
                    ▼                                ▼
        4. DERIVED PLAN ────────────────────────────► (same derived plan, marked directional)
           (only what the columns support;
            blocked items show why + unlock)
                    │
                    ▼
        5. RESULTS — analyses (insights cite numbers)
                   + PROPOSALS (cited, strength-labeled, propose-don't-act)
                   + DATA GAPS ("can't ground X — unlock by adding Y")
                    │
                    ▼
        6. EXPORT (CSV: analyses + proposals + gaps)
```

**Step details:**

1. **Upload** — drag-drop or file picker. Phase 1: `.csv` only. Caps: **10 MB / 50,000 rows / 200 columns**, rejected with a clear message, never silently truncated.
2. **Inspect** — client-side parse + clean: encoding detection (UTF-8/BOM/Latin-1), delimiter sniffing (`,` `;` `\t`), quoted-field handling, header detection (headerless files get generated names + user confirm), type coercion with visible warnings, duplicate removal with counts. File facts shown as a stat strip (rows, columns, delimiter, encoding, duplicates removed). First 5 rows previewed.
3. **Identify — the core step** — every column is assigned a semantic **role** from evidence (header tokens, value patterns, statistics), each with confidence and its evidence string; the dataset is then characterized from the role evidence (§7). Result: an archetype label with **evidence-weighted confidence**, the matched signals shown as chips, the column-role table in full (transparency), and — critically —
   - if confidence is low/thin, a **"Modest signal"** banner (confidence capped at 70%, user asked to sanity-check);
   - if no archetype reaches the evidence threshold, the tool **says so explicitly**: "I can't confidently say what this is" + the reasoning (what it *could* confirm, what it couldn't) + a commitment to proceed in exploratory mode from the confirmed evidence. **It never silently defaults.**
   - An optional label override ("tell us what you think it is") is **informational only** — the analysis plan derives from the columns regardless; overriding only changes what we call the dataset.
4. **Derived plan** — the analysis plan is a pure function of the role profile (§8): trends appear only if a date column exists; breakdowns only if a dimension exists; cost-per-outcome/ROAS only if cost+outcome/revenue exist; conversion/engagement/bounce rates only if their inputs exist; stock-gap analysis only if stock+reorder columns exist; distinct counts only if id+time exist. Every blocked analysis states *why* and what column would unlock it.
5. **Results** — three sections:
   - **Analysis** — derived analyses, each with a headline number, trend where supported, tables where relevant, an **insight that cites the actual numbers**, the formula used, the source columns, and confidence/flags.
   - **What's worth considering** — decision proposals derived from the computed results (§9), each citing its numbers and labeled by strength (high / medium / directional). Nothing is proposed if nothing clears the evidence threshold.
   - **What this data can't tell us** — explicit gaps: e.g. "no cost column → cannot ground cost-per-outcome or budget allocation; unlocked by adding a spend column."
6. **Export** — CSV with analyses, proposals, and gaps (client-side).

## 6. System Architecture

```
 [CSV file]
    │
    ▼
┌────────────┐  ┌────────────┐  ┌─────────────────────────────┐  ┌──────────────┐
│ 1. PARSER │─►│ 2. CLEANER │─►│ 3. ROLES  (per-column)      │─►│ 4. IDENTIFY  │
│ generic   │  │ coercion,  │  │ time/id/dimension/text/     │  │ archetype +  │
│ CSV       │  │ dupes,     │  │ metric w/ sub-roles,        │  │ confidence,  │
│           │  │ warnings   │  │ evidence, confidence        │  │ unclear path │
└────────────┘  └────────────┘  └─────────────────────────────┘  └──────┬───────┘
                                                                       ▼
┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────────────────────┐
│ 8. EXPORT  │◄─│ 7. UI      │◄─│ 6. PROPOSE   │◄─│ 5. ANALYZE (derived plan) │
│ CSV        │  │ monochrome │  │ cited        │  │ trends/breakdowns/        │
│            │  │ screens    │  │ proposals +  │  │ efficiency/rates/stock    │
└────────────┘  └────────────┘  └ gaps         │  └──────────────────────────┘
                                └──────────────┘
```

**Modules (Phase 1):**

| Module | Responsibility | Input → Output |
|---|---|---|
| `parser` | Generic CSV: encoding, delimiter sniffing, RFC-style quotes (quotes open only at field start), header detection, caps | file → `{columns, rows, warnings[]}` |
| `cleaner` | Type coercion (dates/₹/parentheses-negative/Indian grouping), null stats, numeric stats, de-dup, granularity sniff | table → cleaned table + `cleaningReport` (3-level warnings) |
| **`roles`** | **The core.** Per-column semantic role assignment from header tokens, value patterns (email/URL/code/currency), statistics (parse rate, distinct, null %) | cleaned table → `{columns:[{role, sub, identity, confidence, evidence[]}], summary}` |
| **`identify`** | Dataset characterization from the role summary: facet detection → weighted archetype scoring → confidence (dampened runner-up + absolute floor) → reasoning list; **unclear path when evidence is thin** | roles → `{archetype, label, confidence, tier, unclear, unclearReason, reasoning, facets}` |
| **`analyze`** | Derives the analysis plan from the role profile; computes each item; every result carries numbers-citing insight, formula, source columns, confidence, flags | roles → plan items → `results[]` |
| **`propose`** | Proposals derived from results with cited evidence + strength; gaps list with unlock hints; never forces | results → `{proposals[], gaps[]}` |
| `exporter` | CSV serialization (analyses + proposals + gaps) | results → Blob |
| `ui` / `app` | Monochrome screens, processing log, state machine, `beforeunload` | state → DOM |

**Key constraints:** modules are pure functions over plain data (unit-testable, demoable); nothing fails silently — every decision surfaces in the processing log and, where it affects a result, on the result itself; the archetype label **never** selects analyses (derivation is role-driven, so the label can be overridden without changing the analysis).

## 7. Identification — the core step (spec)

### 7.1 Role assignment (`roles`) — identical logic on any CSV, zero per-type branches

For every column, in order:
1. **Header tokens** — split the header on non-alphanumerics, lowercase (`order_id` → `order`, `id`; `CTC (₹)` → `ctc`). Exact token matching against curated vocabulary tables (id, rate, cost, revenue, volume, outcome, engagement, stock, campaign, channel, platform, region, segment, product, category, warehouse, order, customer, post, email).
2. **Value patterns** — email regex, URL regex, code-like pattern (`SKU-123`, `CB-01`), currency symbols (`₹ $ € £`), domain vocabularies (channel words: google/meta/organic/paid…; platform words: instagram/linkedin/youtube…; region words: north/south/east…).
3. **Statistics** — parse rate, non-null %, distinct count, distinct ratio, numeric min/max/mean/median (computed in the cleaner).

**Role decisions:**
- **`time`** — column parses as dates (≥50% parse rate or header signals date semantics). Confidence high; evidence: parse rate + header signal.
- **`id`** — header has an id token *or* the column is highly distinct and code-like *or* numeric with an id token (numeric identifiers like `order_id` as integers). Identity from header: order / campaign / customer / post / segment / product / email / generic identifier. Evidence: distinct count + identity.
- **`metric`** — numeric. Sub-role from header tokens: `cost` (spend/cost/budget/price), `revenue` (revenue/sales/gmv/amount/aov), `volume` (impressions/sessions/clicks/opens/sent/reach/users…), `outcome` (conversions/orders/leads/signups/goal completions…), `engagement` (likes/comments/shares…), `rate` (ctr/cvr/roas/score/avg), `stock` / `reorder`, `plain` (no signal). Negative-outcome flag for attrition metrics (unsubscribes, bounces).
- **`dimension`** — string, low cardinality. Identity from header + value vocabularies: channel / platform / region / segment / product / category / warehouse / campaign / post / categorical (generic).
- **`text`** — email or URL columns (identity: email/url).

Every role carries a confidence (high/medium/low) and its evidence strings, all displayed in the identification screen's role table.

### 7.2 Characterization (`identify`) — the archetype is an OUTPUT, never a router

1. **Facets** are derived from the role summary: time, campaign_dim, channel_dim, platform_dim, order_id, email_signal, segment, cost, revenue, volume, outcome, unsub_bounce, engagement, rate. Each facet: found?, detail (which columns), confidence.
2. **Archetype scoring** — six archetypes (campaign performance, email/CRM engagement, web & funnel, social, sales/revenue, generic business data) each weight the facets it implies (e.g. campaign ← campaign_dim + cost + outcome + volume + revenue + time). `other` (generic) scores structural facets (id + dimension + metric + time).
3. **Confidence** — `relative = top / (top + 0.35·runner)`; tiers by absolute evidence floor: top ≥ 2.2 → strong (min(rel, 0.99)); top ≥ 1.5 → weak (min(rel, 0.70), "Modest signal" banner); else → **unclear**.
4. **The unclear path (normative):** when no archetype reaches the floor, the tool displays *"I can't confidently say what this is"*, lists what it could confirm (found facets with evidence), what it couldn't, and proceeds in **exploratory mode** — the same derived analysis, every result marked directional. **It must never silently pick a best guess and proceed as if certain.**
5. **Label override** — user may pick any archetype (or "I'm not sure"); this only renames the dataset, never re-routes the analysis (§6 key constraints).

## 8. Derived Analysis Engine (`analyze`) — no menu, only evidence

The plan is built purely from the role profile. Derivation rules (each with its blocked-state message):

| Analysis | Requires | Derived from | Blocked-state (example) |
|---|---|---|---|
| Trend over time (per metric) | time column | every metric column | "No date column found — trends need a time dimension. Add a date column to unlock this." |
| Breakdown by dimension (per dimension, primary metric) | dimension + metric | outcome > revenue > volume > engagement > rate > plain | "No categorical dimension column found (e.g. channel, region, product)…" |
| Cost per outcome (CPO) | cost + outcome | both | "Spend data exists (spend) but no outcome column (conversions, orders, …)…" |
| Return on ad spend (ROAS) | cost + revenue | both | "…no revenue column — ROAS cannot be computed." |
| Conversion rate | volume + outcome | both | (blocked via the CPO/outcome messaging) |
| Unsubscribe / bounce rate | volume + negative outcome | both | — |
| Engagement rate | volume + engagement | both | — |
| Stock gaps | stock + reorder columns | both | — |
| Distinct counts per period | id + time | both | — |
| Distribution summary (min/max/mean/median + extremes with context) | metric | every metric | — |

**Computation rules:**
- Granularity: date span < 45 days → weekly; > 730 days → quarterly; else monthly (per-KPI override deferred to Phase 2).
- **Every computed result must carry:** a headline value, an **insight sentence that cites the actual numbers** (e.g. "spend: ₹14,40,000 in Aug 2026 — up 9% vs Jul 2026 (₹13,25,000). Trend over 6 periods: rising."), the formula used, the source columns, a confidence level (high/directional), and flags (small sample, etc.).
- Breakdown tables: top 8 rows + "N others" rollup; share % always shown.
- Trend: only if ≥ 3 periods; otherwise values only with "no trend claimed."
- Small sample: < 30 rows total → all results flagged "directional only."
- Nothing fails silently: every excluded row is counted; every blocked analysis explains itself.

## 9. Proposals & Data Gaps (`propose`) — derive, cite, don't act

**Proposal derivation rules (all derived from computed results, none hardcoded per archetype):**

| Trigger (evidence-based) | Proposal | Strength |
|---|---|---|
| Channel with CPO < 0.8× overall (≥8% spend share) | "Shift budget toward X" with cited CPO comparison | high |
| Channel with CPO > 1.6× overall | "Review X spend" | medium |
| Channel with ROAS ≥ 1.8× overall | "Reallocate toward X" | high |
| Channel with ROAS ≤ 0.5× overall | "Reassess X" | medium |
| Outcome metric down ≥15% MoM | "X dropped Y% — investigate" | high |
| Outcome metric up ≥15% MoM | "X up Y% — understand what worked" | medium |
| Single dimension > 60% of a metric | "Concentration risk" | medium |
| Engagement rate < 2% | "Engagement low relative to reach" | medium |
| Bounce rate > 5% | "List hygiene work" | medium |
| Stock below reorder | "Restock N items" | high |

**Normative rules:**
1. **Every proposal's evidence must cite the actual numbers** (enforced by test: evidence strings must contain digits and currency markers where relevant).
2. Proposals carry strength labels (high / medium / directional) and are framed as **proposals, never instructions** — "numbers are yours to act on, nothing runs automatically."
3. If nothing clears the evidence threshold, **no proposal is made** — an empty "What's worth considering" with a note, never a forced recommendation.
4. **Data gaps are stated, not hidden:** no cost column → cannot ground cost-per-outcome, ROAS, or budget allocation (unlock: add a spend column); no outcome column → cannot show results produced; no volume column → no rates; no date column → no trends; <30 rows → everything directional. Each gap lists its unlock.

## 10. Ingestion & Cleaning Spec

### 10.1 File rules (Phase 1)
CSV only. Caps: 10 MB / 50k rows / 200 columns (reject with message, §5). Encoding: UTF-8 (BOM strip) with Latin-1 fallback, detected and logged. Delimiters: sniff `,` `;` `\t`. **Quoted fields: quotes only open a quoted field at the start of a field (RFC-style) — a stray `"` inside an unquoted value (e.g. `27" Monitor`) is literal text.**

### 10.2 Header detection
First row ≥60% non-numeric → header. Else: generate `col_1…col_n`, warn, and ask the user to confirm (generated names vs row-1-as-header). Duplicate headers suffix-disambiguated and logged.

### 10.3 Type coercion
- Dates: ISO, DD/MM/YYYY, MM/DD/YYYY, DD-MMM-YYYY, Excel serials. Ambiguity rule: both plausible → **DD/MM default** (non-US), logged; toggle deferred to Phase 2.
- Numbers: strip `₹ $ € £ % ,`; Indian grouping (`12,34,567`); parentheses-negative `(1,234)`.
- Unparseable cells → null + count in the log; never silent.

### 10.4 Duplicates
Exact-duplicate rows removed with count logged, before analysis. Duplicate-ID rows flagged, kept (may be legitimate line items).

### 10.5 Granularity
Span < 45 days → weekly; > 730 days → quarterly; else monthly. Mixed cadences warned before trends.

### 10.6 Warning model
`info` (decision, no risk) · `warn` (result affected, computed anyway — e.g. "3 rows couldn't be parsed as dates and were excluded") · `error` (analysis skipped). All surfaced in the processing log and on affected results.

## 11. Results, Interpretation & Export

### 11.1 Result object model
```json
{
  "id": "trend_4", "title": "Spend over time", "kind": "trend",
  "periods": [{ "period": "Jul 2026", "value": 1325000, "n": 7 }, ...],
  "value": 1440000, "unit": "currency",
  "insight": "spend: ₹14,40,000 in Aug 2026 — up 9% vs Jul 2026 (₹13,25,000). Trend over 6 periods: rising.",
  "formula": "Σ spend per monthly period",
  "columns": { "metric": "spend", "time": "date" },
  "confidence": "high", "flags": []
}
```

### 11.2 Display
Monochrome card per analysis: headline value + unit, trend line with delta vs prior period + sparkline (≥2 periods), insight in serif-italic, flags, tables (breakdowns/rates/summaries), formula block, source columns. Proposals: title + strength badge + bulleted cited evidence + "proposal — nothing runs automatically" note. Gaps: dashed-border cards with reason + unlock. All text observable-language, never verdicts.

### 11.3 Export (Phase 1: CSV)
One row per analysis / proposal / gap: section, id, title, value, unit, insight/evidence, formula, sources, confidence, flags. Client-side Blob. PDF deferred to Phase 2.

## 12. UI/UX

- **Monochrome only** — warm paper + near-black ink + greys; the single muted accent (amber) reserved for warnings/flags only, always with a non-color companion cue.
- Typography-led: serif display/values, sans UI, mono for data/formulas/log. Hairline rules, numbered step rail (01 Upload · 02 Inspect · 03 Identify · 04 Plan · 05 Results).
- **State list:** initial / parsing / inspect / identify / plan / results / error (bad file, over-cap, unreadable) / unclear-identification (same screens, exploratory framing). None blank.
- **Session behavior:** everything in-memory; "Clear & start over" always visible; `beforeunload` triggers the browser's own generic prompt (custom text unsupported — never claim it).
- Responsive: desktop-first, single-column stacking, touch targets ≥ 44 px, tables scroll inside cards on mobile (`min-width: 0` grid discipline).
- Privacy statement on the upload screen; it is true (zero network, §13).
- A11y: keyboard navigation, visible focus, no color-only signaling (WCAG 2.1 AA target).

## 13. Success Metrics (measurable versions)

| Metric | Definition | Target |
|---|---|---|
| Identification accuracy | Archetype correct on clean fixtures; honest-unclear on ambiguous fixtures (§16) | 100% on the 7-fixture corpus |
| Honest-uncertainty rate | Ambiguous/thin datasets take the unclear path instead of silent default | 100% of such fixtures |
| Insight citation | % of computed results whose insight contains ≥ 1 number | 100% (test-enforced) |
| Proposal citation | % of proposals whose evidence contains ≥ 1 number | 100% (test-enforced) |
| No-forced-proposals | % of runs where the gaps section lists every ungrooveable decision dimension | 100% (test-enforced) |
| Time to first result | `performance.now()` from file-selected to results, files ≤ 5 MB | < 5 s on a mid-range 2022 laptop |
| Privacy | Static scan + runtime stubs: zero network calls on the full pipeline (§13) | 100% pass |
| Corpus coverage | All 7 fixtures produce result screens — never an error/blank | 100% |

## 14. Privacy & Security (verifiable requirements)

1. **Zero network on the default path.** Enforced by: (a) static scan — no network APIs/URLs anywhere in `src/`; (b) runtime test — full pipeline under stubbed `fetch`/XHR/`sendBeacon`/WebSocket/EventSource/Image must make zero calls; both run in CI. Manual check: DevTools Network shows nothing during a full run.
2. **No persistence:** no `localStorage`/`sessionStorage`/`indexedDB` writes; session-only state; `beforeunload` (generic prompt) warns before losing loaded data.
3. **Layer 2 (Phase 2) sends headers only** — normalized headers + candidate labels, never values/counts/file name; timeout ≤ 4 s; cache identical header sets; failure degrades to the unclear path.
4. **Dependency hygiene:** pinned versions; SheetJS ≥ 0.19.3 (CVE-2023-30533) only when `.xlsx` arrives in Phase 2; CSP `default-src 'self'` on the static host.
5. **The privacy claim is a feature** — the upload screen says "nothing leaves your browser," and the architecture and tests back it.

## 15. Flaws, Edge Cases & Mitigations

| # | Flaw | Mitigation |
|---|---|---|
| 1 | Column names don't match expectations ("spend" vs "media_cost") | Token vocabularies + value patterns; per-column evidence shown; identity assignment is per-column, not per-dataset |
| 2 | Misclassification risk (mixed/blended data) | Dampened runner-up confidence; top-2 shown; "Modest signal" banner; label override (informational); never auto-locks |
| 3 | Missing/null values in required columns | Per-column non-null % in the inspect screen; low-completeness flags (date columns exempt) |
| 4 | Wrong data types (dates as text, currency strings) | Type coercion with visible warnings + row counters (§10.3) |
| 5 | Small sample (<30 rows) | All results flagged "directional only" |
| 6 | File too large for free-tier hosting/memory | Hard caps 10 MB / 50k rows / 200 cols, clear rejection |
| 7 | Sensitive data uploaded to a web tool | Client-side processing; zero network; no persistence; visible, true privacy statement; tests enforce (§14) |
| 8 | Numbers "wrong" for the user's context | Formula + source columns on every result; interpretations are observations, never verdicts |
| 9 | Dataset outside the known list (inventory, logistics, …) | `other` archetype with derived generic analyses (stock gaps, distributions) — never pretends to have domain KPIs it doesn't have |
| 10 | **Dataset the tool can't identify** | **Honest unclear path with reasoning; exploratory mode; never a silent default (§7.2)** |
| 11 | Irregular date granularity | Granularity sniffing + warning before trend |
| 12 | Overconfidence / false authority | Confidence floor + tiers; "Modest signal" banner; observations not verdicts; cited numbers |
| 13 | Free-tier API rate limits (Layer 2, Phase 2) | Layer 1 (rule-based) fully standalone; Layer 2 degrades to the unclear path |
| 14 | Duplicate rows / IDs skewing counts | De-dup before compute, visible counts |
| 15 | Non-UTF-8 encodings | Encoding detection + Latin-1 fallback |
| 16 | Non-comma delimiters | Delimiter sniffing |
| 17 | Headerless files | Generated names + user confirmation |
| 18 | Duplicate column names | Suffix disambiguation, logged |
| 19 | Ambiguous date formats | DD/MM default + logged choice; toggle in Phase 2 |
| 20 | Stray quotes in unquoted values (`27" Monitor`) | RFC-style quoting: quotes open only at field start |
| 21 | Numeric identifier columns (`order_id` as integers) | id-role detection for numeric columns with id tokens |
| 22 | Low-end device memory | Caps + chunked parse; wide tables scroll inside cards |
| 23 | Proposals that sound like instructions | "propose, don't act" framing; strength labels; cited evidence; nothing auto-executes |

## 16. Test Corpus & Evaluation (Phase 1)

- **7 labeled fixture datasets** committed to the repo (`fixtures/`, deterministic generator): campaign (42 rows), email/CRM (24), web & funnel (48), social (60), sales/revenue (80), **inventory (14 — deliberately outside the marketing list)**, **mystery (24 — deliberately thin/mixed signals)**. All synthetic.
- **Eval harness** (`test-fixtures.js`): every fixture must parse → identify (correct archetype OR honest unclear) → derive a plan (≥2 computable) → compute all items with numbers-citing insights — **under zero-network stubs**. "If it's not in the harness, it's not a metric."
- **test-identify.js** — role/characterization/plan/proposal assertions per sample + parser/coercion edges. **test-privacy.js** — static scan + runtime stubs. **test-dom.js** — state-machine flow. **e2e/walkthrough.js** — real-Chromium walkthrough (19 checks incl. unclear path, generic path, mobile, beforeunload).
- Fixtures double as the portfolio demo set.

## 17. Phase 1 Definition of Done

- [ ] Upload/inspect: CSV caps + clear rejection; BOM/Latin-1/semicolon/headerless/stray-quote fixtures parse correctly; stat strip + preview
- [ ] **Identification:** per-column roles with evidence + confidence; archetype + confidence + runner-up; "Modest signal" banner when weak; **unclear path with full reasoning when evidence is thin — never a silent default**; label override proven informational (analysis unchanged)
- [ ] **Derived plan:** items appear only when their columns exist; blocked items show why + unlock; no per-archetype menus
- [ ] **Results:** every analysis shows value, trend (≥3 periods), numbers-citing insight, formula, source columns, confidence, flags; small-sample flags; processing log complete
- [ ] **Proposals:** cited numbers in every evidence; strength labels; empty-when-nothing-clears; "propose, don't act" framing
- [ ] **Gaps:** every ungrooveable decision listed with its unlock
- [ ] Export CSV matches rendered results (analyses + proposals + gaps)
- [ ] Tests green: identify / fixtures / privacy / dom / E2E (Chromium, incl. mobile no-overflow)
- [ ] Manual QA pass on Chrome/Edge/Firefox/Safari (last 2 versions), keyboard nav, 390 px viewport

## 18. Phased Roadmap

**Phase 1 (this build — identification-first MVP):** CSV only; parser/cleaner; roles + identify (evidence-based, unclear path); derived analysis engine; proposals + gaps; monochrome UI; CSV export; 7-fixture corpus; zero-network tests; E2E walkthrough. Marketing-focused demo set; engine is general.

**Phase 2:** `.xlsx` (SheetJS ≥0.19.3, first sheet + picker); Layer 2 optional LLM fallback for the unclear path (headers-only, budgeted, degrades gracefully); PDF export; expanded vocabularies (finance, operations, education); per-KPI granularity override; date-format toggle in the mapping UI; richer unclear-path UX (suggest what to add to make it identifiable).

**Phase 3 (stretch):** opt-in save/history (Supabase, explicit consent); benchmark comparisons (industry averages from free public datasets); editable formula assumptions; additional archetypes with dedicated vocabularies; "explain like I'm five" interpretations toggle.

## 19. Key Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Vocabulary too shallow → misidentification | Wrong archetype label, user distrust | Value-pattern + structural facets (not just headers); confidence floor; unclear path; per-column evidence visible; corpus grows |
| "Sounds authoritative but is wrong" | Trust damage | Cited numbers everywhere; observations not verdicts; formula + sources visible; flags |
| Honest-unclear reads as "broken" | Users bounce | Unclear path is a designed, well-copywritten state with reasoning + exploratory analysis — it demonstrates rigor, not failure |
| Scope creep toward a full BI tool | Never ships | Hold §3; DoD (§17) and harness (§16) are the gate |
| Metrics that can't be measured | False confidence | Corpus + harness in Phase 1; "not in the harness, not a metric" |
| Dependency security (SheetJS history) | Supply-chain exposure | Pinned versions, CSP, no dynamic loading |
| Client memory on low-end devices | Crashes on big files | Caps + chunked parse + CI parse test at cap size |

## 20. Open Questions (owner decisions — recommended defaults in bold)

1. **Identification vocabulary breadth:** ship with the current 6-archetype vocabulary (marketing + generic) and grow via corpus, or expand vocabularies (finance/ops) before demo? — **Current breadth; corpus grows it.**
2. **Unclear-path depth:** minimal (current: reasoning + exploratory mode) or enhanced (suggest missing columns to make it identifiable)? — **Minimal in Phase 1; enhanced in Phase 2.**
3. **Label override semantics:** informational (analysis unchanged — current) or opinionated (override also biases role interpretation)? — **Informational; it's more honest.**
4. **Proposal thresholds** (CPO 0.8×/1.6×, ROAS 1.8×/0.5×, MoM ±15%, share 60%): tune on the corpus before demo? — **Yes, after the first real uploads.**
5. **Benchmarks in interpretations?** — **No in v1** (no benchmark data); Phase 3 when data exists.
6. **Phase 1 CSV only, or sneak in xlsx?** — **CSV only** (roadmap holds; SheetJS pin already spec'd).
7. **Strict no-persistence vs opt-in later?** — **Strict in v1**; opt-in Supabase in Phase 3.
8. **Language:** English only in v1? — **Yes.**
9. **Product name "KPI Analyzer"** — still right given identification-first positioning? Alternatives: "Data Recognizer", "What Is This?", "Measure This". Owner's call.
