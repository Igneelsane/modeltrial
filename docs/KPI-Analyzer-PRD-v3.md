# Product Requirements Document (v3 — build-ready, hybrid KPI sourcing)
## KPI Analyzer — "Upload a dataset, get the right KPIs"

**Owner:** Rohith · **Doc status:** v3.1 (revised) · **Last updated:** 10 Aug 2026
**Changelog:** v1 → v2: algorithms, schema, cleaning spec, test corpus, DoD (see `PRD-v2-review-notes.md`). v2 → v3: **resolved the KPI-library architecture question** — evaluated the dynamic-LLM alternative (`KPI-Reference-Approach.md`) and adopted a hybrid: curated static library as backbone + optional validated AI-suggested KPIs (Phase 2) + LLM-assisted curation at dev time. Full rationale: `KPI-Library-Architecture-Decision.md`. New in v3: §8.8 (AI-suggestion layer spec), §8.9 (dev-time curation), `source` field in the library schema, updated flow/metrics/privacy/risks. **v3.1 (post-review fixes):** §7.1 confidence gains an absolute-evidence floor — the ratio alone can overstate certainty on thin signal; §11 no longer claims custom `beforeunload` text (modern browsers render their own generic prompt); §16–18 split Phase 1 into a demo gate (1a) and a release gate (1b) so tooling never blocks a first working pipeline; §19 adds the tooling-overcommit risk.

---

## 1. Problem Statement

Students, early-stage founders, and small teams sit on datasets (HR records, sales logs, marketing exports, finance sheets) but don't reliably know **which KPIs actually apply** to that data, and even if they do, computing those KPIs correctly (right formula, right columns, right time grouping) takes manual effort in Excel.

Existing BI tools (Power BI, Tableau, Looker Studio) assume the user already knows what to measure and how to build it. This tool inverts that: **the dataset tells the user what to measure.**

## 2. Goal

Build a lightweight web tool where a user uploads a dataset → the tool infers the domain (HR, Sales, Marketing, Finance, Operations, etc.) → recommends a shortlist of relevant KPIs for that domain → computes the ones that are actually computable from the given columns → shows the rest as "possible but missing data X."

**Success in one sentence:** a user who has never heard of "turnover rate" uploads an HR export and walks away knowing its value, its trend, and the exact formula used — in under 5 seconds, with no data leaving their device.

## 3. Non-Goals (explicitly out of scope for v1)

- Not a general-purpose BI/dashboard builder (no drag-drop chart building)
- Not a data-cleaning suite (basic cleaning only, not a full ETL tool)
- Not real-time/streaming analytics — batch file upload only
- Not multi-user collaboration / teams / auth / accounts in v1
- Not predictive modeling or forecasting (v1 is descriptive KPIs only; no trend extrapolation)
- Not a replacement for domain expertise — it's a starting point, not an auditor's judgment
- No server-side processing of any kind in v1 (everything computes in the browser)
- No persistence: results, uploads, and analysis live only in memory for the session; refreshing the page clears everything (by design, §13)
- **AI-generated KPIs are never automatic and never the default path** (they are opt-in, Phase 2, and clearly labeled — see §8.8)

## 4. Target User & Core User Story

**Primary persona:** MBA/business student or a small business owner who has a dataset (CSV/Excel export from HR software, POS, CRM, or a survey) and wants a fast, credible read on "what does this data actually say" without knowing analytics jargon.

**Secondary persona (portfolio-stage):** the recruiter/interviewer who tries the demo — the experience must be impressive on the *first* upload with *any* well-labeled file.

**Core story:**
> "I have an HR dataset. I don't know what to look at. Tell me what I *should* be measuring, and then measure it for me."

## 5. Core User Flow (MVP) — with decision points

```
1. UPLOAD ──► 2. PARSE & CLEAN ──► 3. DETECT DOMAIN ──► 4. CONFIRM DOMAIN
                                                        (override allowed)
                                                              │
                                                              ▼
                                       5. KPI SHORTLIST (curated: computable / missing)
                                                              │
                                                              ▼
                                       6. MAP COLUMNS (only for KPIs user wants
                                                          that are "missing")
                                                              │
                                                              ▼
                                       7. SELECT & ANALYZE ──► 8. RESULTS
                                                                    │
                                                                    ▼
                                                              9. EXPORT (CSV)
```

**Step details:**

1. **Upload** — drag-drop or file picker. Phase 1: `.csv` only. Hard caps: **10 MB / 50,000 rows / 200 columns**. Over-cap files are rejected with a clear message ("This file is 61,004 rows; v1 supports up to 50,000. Please trim and retry.") — never silently truncated.
2. **Parse & clean** — client-side (PapaParse). Encoding detection (UTF-8 / UTF-8-BOM / Latin-1), delimiter sniffing (comma, semicolon, tab), header-row detection (see §9). All cleaning decisions surface in the processing log (§9.6). File preview (first 5 rows) shown immediately.
3. **Detect domain** — Layer 1 algorithm (§7). Result: top candidate + confidence % + runner-up, e.g. "Looks like **HR data — 87% confidence** (runner-up: Generic)."
4. **Confirm domain** — user can accept or override via dropdown (all library domains + Generic). **Never auto-locked.** If confidence < 50%, the top two are within 10 points, or the evidence floor flags weak signal (§7.1 D), the override is visually prominent, not buried.
5. **KPI shortlist** — curated list for the chosen domain, split:
   - ✅ **Computable now** (all required fields matched, after cleaning)
   - ⚠️ **Possible, but missing:** [field names] — each with a "map a column" action (step 6)
   - *(Phase 2, opt-in): a "Suggest more KPIs for this dataset" button on this screen — AI-suggested KPIs appear below the curated list with a distinct badge (§8.8). Never automatic.*
6. **Map columns** (Phase 1, minimal version) — for a missing field, user picks from a dropdown of unmatched columns: "Do you have a column that means `exit_date`? → `relieving date`". Re-runs computability instantly. Mapping is per-session, not persisted.
7. **Select & analyze** — checkboxes + "Run all computable" (one click). Default: all computable pre-selected.
8. **Results view** — monochrome dashboard: KPI value, trend (if enough periods, §10.3), one-line plain-English interpretation, formula in plain sight, confidence/completeness flags, processing log collapsible.
9. **Export** — CSV download of the results table (§10.5). Client-side generation only.

**Fallbacks (mandatory, not stretch):**
- Domain detected as **Generic** (no library domain scores above threshold, or user overrides to Generic): show minimal descriptive stats (§8.6) instead of domain KPIs. *(Phase 2: the "Suggest more KPIs" button is the bridge from stats to candidate KPIs.)*
- **Zero computable KPIs**: show the missing-fields list with mapping UI first — never an empty screen.

## 6. System Architecture

**Pipeline (data flows left → right, all in-browser):**

```
 [CSV file]
    │
    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   ┌───────────────┐
│ 1. PARSER   │──►│ 2. CLEANER   │──►│ 3. DETECTOR      │──►│ 4. KPI ENGINE │
│ PapaParse   │   │ type coercion │   │ Layer 1 (rules)  │   │ reads library │
│ SheetJS (P2)│   │ de-dup, warns│   │ Layer 2 (opt, P2)│   │ match+compute │
└──────────────┘   └──────────────┘   └──────────────────┘   └──────┬────────┘
                                                                    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   ┌───────────────┐
│ 7. EXPORTER │◄──│ 6. RENDERER  │◄──│ 5. INTERPRETER  │◄──│ results model │
│ CSV/PDF(P2) │   │ monochrome UI│   │ templates       │   │ (JSON)        │
└──────────────┘   └──────────────┘   └──────────────────┘   └───────────────┘
```

**Modules (Phase 1):**

| Module | Responsibility | Input → Output |
|---|---|---|
| `parser` | CSV → row array with column metadata | file → `{columns, rows, encoding, warnings[]}` |
| `cleaner` | Type coercion, null stats, de-dup, granularity sniff | raw table → cleaned table + `cleaningReport` |
| `detector` | Layer 1 scoring | headers + 100 sampled rows → `{domain, confidence, runnerUp, reasons[]}` |
| `matcher` | Field-matching for computability + mapping resolution | KPI required fields + columns → `{match, score, missing[]}` per field |
| `engine` | KPI computation, per-period bucketing | KPI def + cleaned table → per-KPI `KpiResult` |
| `interpreter` | Template filling (value/trend/period) | `KpiResult` → interpretation sentence |
| `ui` | All screens + processing log | state → DOM |
| `exporter` | CSV serialization | results[] → Blob download |
| `suggestor` *(Phase 2)* | Opt-in AI KPI generation behind a pure interface | `suggestKpis({domain, headers}) → DraftKpi[]` (validated, labeled) |

**Key constraints:** modules are pure functions over plain data (easy to unit-test, easy to demo); the detector never receives row *values* beyond sampled pattern checks (§13); every module emits warnings to a shared log — nothing fails silently. The `suggestor` is **not on the default path**: the pipeline completes without it, and it can never block or alter curated results.

## 7. Domain Detection

### 7.1 Layer 1 — rule-based (default, free, instant, offline)

**Step A — header normalization:** for each header: lowercase → strip whitespace → remove all non-alphanumeric characters (`Date of Joining` → `dateofjoining`, `DOJ` → `doj`). Keep the original for display.

**Step B — keyword scoring:** each domain has a weighted keyword list. A header scores for a domain by the **best** match of: exact normalized equal (weight × 1.0), alias-table hit (× 0.9), or substring containment (× 0.5 — e.g. `exitdate` contains `date`).

**Phase 1 keyword lists (starter; extend during curation):**

| Domain | Keywords (weight) |
|---|---|
| **HR** | `dateofjoining`/`doj` (0.5), `exitdate`/`terminationdate`/`lastworkingday`/`relievingdate` (0.5), `ctc`/`salary`/`compensation` (0.4), `appraisal`/`rating`/`performancescore` (0.5), `designation`/`jobtitle`/`role` (0.4), `employee`/`emp`/`staff`/`personnel` (0.3), `department`/`team` (0.3), `manager`/`reportingto` (0.3), `attendance`/`absent`/`leave` (0.4), `email` (0.2) |
| **Sales** | `order`/`invoice` (0.5), `revenue`/`salesamount`/`amount`/`total` (0.5), `product`/`sku`/`item` (0.3), `quantity`/`qty` (0.4), `customer`/`client`/`account` (0.3), `region`/`territory` (0.3), `salesrep`/`salesperson`/`agent` (0.4), `channel` (0.3), `discount` (0.3), `commission` (0.3) |
| Marketing / Finance / Operations | Reserved for Phase 2 — same structure |

**Step C — value-pattern checks (bonus, × 0.1 each, max 0.5):** sampled rows (≤100) are checked without sending them anywhere:
- ≥80% of rows in a "date-like" column parse as dates → date-field bonus for HR (joining/exit), Sales (order date)
- `email` regex matches in a column → HR/CRM-ish bonus
- currency symbols present (₹ $ € £) → Finance/Sales bonus
- categorical tokens like `terminated`, `resigned`, `active` in a column → strong HR signal (weight 0.5)

**Step D — score & confidence (two-part rule: relative ratio + absolute evidence floor):** `rawScore(domain) = Σ header keyword hits + value bonuses`. Domain with highest raw score wins. The ratio alone can overstate certainty on thin evidence (HR 0.3 vs Sales 0.1 would otherwise display ~75% "confidence" on almost no signal), so the displayed value is capped by an evidence tier:

```
relative = topScore / (topScore + runnerUpScore)        // runnerUpScore = 0 if none
displayConfidence = min(relative, tierCap)

Evidence tiers (by topScore):
  < 1.0     → Generic — no domain claim at all (skip to §8.6)
  1.0–1.99  → "weak signal": tierCap = 70%; UI shows a low-signal note,
              the matched-keyword count, and a prominent override
  ≥ 2.0     → tierCap = 99% (full ratio confidence)
```

The confidence display always shows its basis (e.g. "87% — based on 6 matched column headers"), so the number is explainable, never a magic value.

**Worked example (strong signal)** — headers `["doj", "emp_name", "ctc", "appraisal_score", "designation", "email_id"]`:
- HR: `doj`→dateofjoining 0.5, `empname`→employee 0.3, `ctc` 0.4, `appraisalscore` 0.5, `designation` 0.4, `emailid` 0.2 → **raw 2.3** (plus likely date & email bonuses)
- Sales: no hits ≥ 0.3 → **raw ~0**
- Result: HR, ratio ≈ 99%, tier ≥ 2.0 → displays ~99%.

**Worked example (weak signal)** — headers `["doj", "ctc", "designation"]`:
- HR: 0.5 + 0.4 + 0.4 = **raw 1.3**; Sales ~0 → ratio ≈ 99%, but the 1.0–1.99 tier caps it at **70%** with the "weak signal — please confirm the domain" note.
- With a closer runner-up (HR 1.3 vs Sales 1.1): ratio = 54%, tier cap 70% → displays **54%**; both domains shown prominently.

**Layer 1 must be fully functional standalone.** It is the only path in Phase 1.

### 7.2 Layer 2 — optional free-LLM fallback (Phase 2, never a dependency)

- Trigger: Layer 1 confidence < 50% **or** result is Generic but user insists the data is domain data.
- **Interface:** input = normalized headers + the two candidate domain labels *only* — **never row values, never sample data** (§13). Output = `{domain, confidence}`.
- Budget: timeout 4 s, single retry, then graceful degrade to "please select domain manually" — the user flow never blocks on Layer 2.
- UX: Layer 1 result is shown immediately; Layer 2 (if any) *refines* it in place when it returns. No spinner-only waiting.
- Cache: identical header sets are never re-sent (in-memory cache, session-scoped).

## 8. KPI Library — the core IP (hybrid sourcing)

**Architecture decision (v3):** the library is **curated-static-first** (Layer A). An opt-in AI-suggestion layer (Layer B, Phase 2) and dev-time LLM-assisted curation (Layer C) extend it. Rationale and full comparison in `KPI-Library-Architecture-Decision.md`.

### 8.1 Layer A — v3 schema (single static JSON file, human-curated, versioned)

```json
{
  "library_version": "0.1.0",
  "domains": ["hr", "sales"],
  "kpis": [
    {
      "kpi_id": "hr.turnover_rate",
      "domain": "hr",
      "source": "curated",
      "name": "Employee Turnover Rate",
      "summary": "Share of employees who left during the period.",
      "unit": "percent",
      "direction": "lower_is_better",
      "min_rows": 30,
      "granularity": { "default": "monthly", "allowed": ["monthly", "quarterly", "annual"] },
      "formula_text": "(Employees left in period ÷ Average headcount in period) × 100",
      "required_field_sets": [
        [
          { "field": "employee_id",  "type": "id",        "synonyms": ["emp_id", "staff_id", "emp_no", "id"] },
          { "field": "exit_date",    "type": "date",      "synonyms": ["termination_date", "last_working_day", "relieving_date"] },
          { "field": "date",         "type": "date",      "synonyms": ["hire_date", "joining_date", "date_of_joining", "doj"] }
        ],
        [
          { "field": "employee_id",  "type": "id",        "synonyms": ["emp_id", "staff_id", "emp_no", "id"] },
          { "field": "status",       "type": "categorical",
            "value_constraint": ["terminated", "resigned", "left", "exited", "inactive"],
            "synonyms": ["employment_status", "status", "emp_status"] },
          { "field": "date",         "type": "date",      "synonyms": ["hire_date", "joining_date", "date_of_joining", "doj"] }
        ]
      ],
      "optional_fields": [],
      "interpretation": {
        "with_trend": "Turnover in {period} was {value}{unit}, {delta} vs the prior period.",
        "no_trend": "Turnover was {value}{unit} across the period."
      }
    }
  ]
}
```

**Schema rules (normative):**
- `kpi_id` is stable and unique; never reused. `source` ∈ `"curated" | "ai_suggested"` — curated entries set it from day 1; Layer B output sets it at runtime.
- **`required_field_sets` is an OR-list of alternatives** — the KPI is computable if *any one set* matches completely.
- `type` ∈ `id | date | numeric | categorical`. Cleaning and validation are type-driven (§9).
- `value_constraint` (categorical only): the field matches only if the cleaned column contains ≥1 token from the list (e.g. a `status` column of only `permanent`/`contract` does *not* satisfy the turnover set).
- `granularity.allowed` bounds trend bucketing (§10.3).
- `interpretation` templates use placeholders `{value} {unit} {period} {delta}` only. **No `{benchmark}` in v1** — benchmarks arrive in Phase 3; templates are written to gain a benchmark clause later without breaking.
- `formula_text` is the human-readable formula shown next to every result (transparency requirement, §8.7). The engine implements the semantics; the text documents them.

### 8.2 Phase 1 KPI list (7 HR + 7 Sales, curated)

**HR:** `hr.turnover_rate`, `hr.average_tenure` (needs hire + exit dates), `hr.headcount_growth` (needs date + employee_id), `hr.appraisal_distribution` (needs rating + optional department), `hr.absenteeism_rate` (needs leave_days or attendance flag + date), `hr.avg_salary` (needs ctc/salary, optional department → per-dept split), `hr.span_of_control` (needs employee_id + manager_id).

**Sales:** `sales.revenue_by_period` (needs order_date + amount), `sales.avg_order_value` (needs order_id + amount), `sales.order_volume` (needs order_id + order_date), `sales.revenue_by_region` (needs amount + region, optional), `sales.qty_sold` (needs quantity + order_date), `sales.discount_rate` (needs amount + discount, optional), `sales.customer_count` (needs customer_id + order_date).

### 8.3 Field matching (computability) algorithm

For each required field `F` in a set, for each cleaned column `C`:
1. `norm(F.name)`, `norm(F.synonym)` vs `norm(C.header)` → **exact** = 1.0
2. Alias-table hit (see table below) = 0.9
3. Substring containment either way (`relievingdate` ⊃ `date`) = 0.5
4. Type check: candidate must satisfy `F.type` after cleaning (`date` fields: ≥80% parse rate; `numeric`: ≥80% numeric after coercion; `id`: non-null cardinality ≥ 60% of rows; `categorical`: value constraint, §8.1)
5. Best score per field wins; **score ≥ 0.9 = matched, 0.5–0.89 = fuzzy (needs user confirm via mapping UI), < 0.5 = missing**

**Ambiguity rules:** if one column is the best match for two required fields → the higher-scoring field claims it; the other is re-matched. If two columns tie for one field → prefer the one with better type-check; surface the decision in the processing log. **Never silently pick.**

**Starter alias table (Phase 1):** `doj→date_of_joining`, `emp_id/empid/empno/staffid→employee_id`, `ctc/ctc_lpa/annual_ctc→salary`, `dob→date_of_birth`, `relieving→exit_date`, `appr/appraisal_rating/perf→rating`, `mgrid/rep_to→manager_id`, `qty→quantity`, `ord→order`, `cust→customer`, `amnt/amt→amount`.

### 8.4 Computability result

Per KPI: `{computable: boolean, matchedFields: {...}, missingFields: [...], fuzzyFields: [...], completeness: {field: {nonNullPct, distinctPct}}}`. Missing fields listed in shortlist with per-field completeness shown (flaw #3 mitigation): **if any required field is >30% null, KPI is flagged "low confidence" and marked as such in results — never silently computed on incomplete data.**

### 8.5 Computation engine

- KPI computed per period at `granularity.default` (or user-chosen from `allowed`), bucketed on the set's primary date field.
- Formulas are hand-implemented per KPI in `engine` (a `kpi_id → computeFn` registry — deterministic, auditable, unit-testable). The library JSON declares semantics; the registry implements them; `formula_text` documents them for the user.
- Excluded rows are always counted and reported ("14 rows excluded: 3 unparseable dates, 11 missing amounts").

### 8.6 Generic fallback (minimal, Phase 1)

For Generic domain: column inventory (name, type, % null, distinct count), per-numeric-column min/max/mean/median, top-5 frequency for categoricals, and a note: *"This dataset doesn't match our HR/Sales KPI library yet. Here are its basic descriptive stats."* — never pretend domain expertise exists. *(Phase 2: the "Suggest more KPIs" button becomes the bridge from these stats to candidate domain KPIs, §8.8.)*

### 8.7 Transparency rules (normative)

Every result card shows: value, unit, period, trend delta, `formula_text`, matched source columns, completeness %, and flags (small sample / low completeness / fuzzy mapping). Interpretation sentences are **observations, never verdicts** (§14 #11). A collapsible processing log lists every warning with its row counts.

### 8.8 Layer B — AI-suggested KPIs (Phase 2, opt-in, validated, labeled)

**Purpose:** domain coverage and schema adaptation without hand-curation — the wins from `KPI-Reference-Approach.md` — while preserving the default path's free/offline/private properties.

**Trigger & UX:** explicit "Suggest more KPIs for this dataset" button on the shortlist screen (also offered on Generic fallback). Never automatic. Suggested KPIs render **below** the curated list in a separate section with a distinct "AI-suggested" badge and the label: *"Generated from your column names; auto-checked but not human-reviewed. Verify formulas before relying on them."* Curated results already on screen are never blocked or altered.

**Input contract (privacy):** domain label + normalized headers only. No row values, no row counts, no file name. UI discloses before the call: *"Column names will be sent to a free AI API to suggest KPIs. Row values never leave your device."*

**Output contract:** constrained JSON only —
`{ "kpis": [{ "name", "formula", "required_fields", "unit", "summary" }] }`.
Prompt rules: use only the listed columns; no markdown; no benchmarks; no placeholders beyond the schema; JSON only (parse failure → graceful "AI busy" toast, see Budget).

**Validator (deterministic, all checks pass before display):**
1. Every required field resolves to a real column (normalized match ≥ 0.9)
2. Field types compatible with cleaned column types
3. Formula parses (balanced, known operators/functions) and references only declared fields
4. Computed-value sanity bounds (percent 0–100; counts/amounts ≥ 0; ratios within plausible caps) — violations shown with a "review formula" flag, never silently fixed
5. Not a duplicate of a curated KPI (normalized name/semantics)
6. **Time-series KPIs require a real date column** — if none exists, only non-time KPIs pass. Preserves the "possible but missing X" honesty; the layer never papers over missing columns with degraded KPIs
7. Interpretation text uses only allowed placeholders

**Budget & cache:** max 1 suggestion call per session (user may explicitly re-trigger); cache key = domain + sorted normalized header set (session TTL); timeout 8 s → toast "AI suggestion is busy — curated KPIs below are unaffected." Free-tier quota estimate (Gemini ≈ 15 req/min, ~1,500/day): design for ≤ 2 calls per session and a visible "quota low" hint when applicable.

**Metrics:** ≥ 70% of suggestion requests return ≥ 1 valid KPI post-validation; suggestion latency ≤ 8 s p90; zero suggestion calls on the default path (asserted by the zero-network test, §13.1).

### 8.9 Layer C — LLM-assisted curation (development-time only)

Use the same free-tier LLM to **draft** candidate KPI entries for new domains (Finance, Marketing in Phase 2): prompt = domain + canonical field vocabulary + library schema example. Human reviews, edits, and commits each entry to the static JSON with `source: "curated"`. Library grows 4–8× faster than hand-writing; **runtime never depends on the LLM**; every shipped formula stays human-reviewed.

## 9. Ingestion & Cleaning Spec

### 9.1 File rules (Phase 1)
CSV only. Caps: 10 MB / 50k rows / 200 columns (reject with message, §5). Encoding: try UTF-8 (with BOM strip), fallback Latin-1 — detected automatically, reported in log. Delimiters: sniff `,` `;` `\t` (PapaParse native). Quoted fields with embedded newlines/commas must parse correctly (PapaParse default).

### 9.2 Header detection
If first row contains ≥60% non-numeric values → treat as header. Else: generate `col_1…col_n` names, log warning, and **show the user the first 5 rows for confirmation** — a headerless file is an interactive decision, not an assumption. Duplicate headers are suffix-disambiguated (`revenue`, `revenue_2`) and logged.

### 9.3 Type coercion
Per column, per §8.1 types, with explicit rules:
- **Dates:** parse `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MMM-YYYY`, Excel serials. **Ambiguity rule:** if both `DD/MM/YYYY` and `MM/DD/YYYY` are plausible (all values ≤ 12 in first position), default `DD/MM/YYYY` (non-US default), log the choice, and offer the toggle in the mapping UI.
- **Numbers:** strip `₹ $ € £ ,` and `%`; handle Indian grouping `1,23,456`; parentheses as negative `(1,234)`.
- Unparseable cells → null + count, surfaced in log; **never silent.**

### 9.4 Duplicates
Exact-duplicate rows removed with count logged. If an `id`-type column exists, duplicate-id rows are flagged (not silently dropped): show count, drop by default, and note it in the log. De-dup happens **before** KPI computation (flaw #13).

### 9.5 Granularity sniffing
Date span → default period: span < 45 days → weekly; else monthly; span > 2 years → quarterly suggestion (user can override to monthly if `allowed` includes it). Warn if mixed cadences detected (some rows monthly, some yearly) before trend computation (flaw #10).

### 9.6 Warning model (3 severities — nothing fails silently)

| Level | Meaning | Example | Rendered |
|---|---|---|---|
| **info** | Decision made, no risk | "Delimiter: semicolon detected" | log only |
| **warn** | Result affected, computed anyway | "3 rows couldn't be parsed as dates and were excluded" | log + flag on affected KPI cards |
| **error** | Computation skipped | "No date column found for revenue_by_period" | log + shortlist shows KPI as missing/not computable |

## 10. Results, Trends & Interpretation

### 10.1 Result object model

```json
{
  "kpi_id": "hr.turnover_rate",
  "name": "Employee Turnover Rate",
  "source": "curated",
  "unit": "percent",
  "periods": [
    { "period": "2026-05", "value": 4.2, "n": 118 },
    { "period": "2026-06", "value": 5.1, "n": 121 }
  ],
  "trend": { "direction": "up", "delta_pp": 0.9, "periods_used": 3 },
  "formula_text": "(Employees left in period ÷ Average headcount in period) × 100",
  "source_columns": { "employee_id": "emp_id", "exit_date": "relieving_date", "date": "doj" },
  "flags": ["small_sample", "low_completeness"],
  "interpretation": "Turnover in 2026-06 was 5.1%, +0.9 pts vs the prior period.",
  "warnings": ["2 rows excluded (unparseable dates)"]
}
```

### 10.2 Display
Monochrome card per KPI: headline value (latest period), trend block, interpretation line, formula + source columns on a hover/tap-visible row (not hidden in a modal by default), flags as small text markers. The accent (one muted tone) is used **only** for warn/error markers (§11). AI-suggested cards additionally show the §8.8 badge + label.

### 10.3 Trend rules (v1)
- Trend shown only if **≥ 3 complete periods**; else show values table only + "sample too small for reliable trend."
- v1 trend = per-period values + Δ (points for percent/ratio units, % for count units) vs prior period; direction up/flat/down (|Δ| < 0.5pt → flat).
- No forecasting, no smoothing, no regression (non-goal, §3).
- **Small-sample rule:** < 30 rows total → all KPIs flagged "directional only — sample too small for reliable trend" (flaw #5).

### 10.4 Confidence & completeness flags
`low_completeness` if any required field >30% null. `fuzzy_mapping` if any field matched at 0.5–0.89. `small_sample` per §10.3. Flags are visible text next to the value, never color-only. AI-suggested cards carry `ai_suggested` marker + §8.8 label.

### 10.5 Export (Phase 1: CSV)
One row per KPI per period: `kpi_id, kpi_name, source, period, value, unit, formula_text, source_columns, flags, interpretation`. Client-side Blob download. PDF arrives with Phase 2 (jsPDF).

## 11. UI/UX

- **Monochrome only** — near-black text, white/off-white background, greys for secondary info; **one muted accent reserved exclusively for warnings/flags** (with a non-color companion cue: icon/text marker — color must never be the only signal).
- Minimal chrome, no dashboard-template clutter, typography-led hierarchy.
- **State list (all must be designed):** initial / parsing / detecting / confirm-domain / shortlist / mapping / computing / results / empty-results / error (bad file, over-cap, unreadable encoding) / generic-fallback / suggest-in-flight (Phase 2). Each state has a defined layout and copy; none shows a blank screen.
- **Session behavior:** everything is in-memory (§13). A "Clear & start over" control is always visible; before unload/refresh with data loaded, the page registers a `beforeunload` handler so the browser shows its **own generic "Leave site?" prompt** — custom text is not supported by modern browsers (none has rendered it since ~2016) and must never be claimed in UI copy or docs; the behavior is the warning itself.
- **Responsive:** desktop-first; results cards and tables stack cleanly to a readable single column on mobile; touch targets ≥ 44 px.
- Privacy statement visible on the upload screen: "Files are processed entirely in your browser. Nothing is uploaded or stored." (And it is true — §13.) Phase 2 adds the one-line disclosure before any suggestion call (§8.8).
- A11y: keyboard-navigable throughout, focus states visible, warning text not color-dependent (WCAG 2.1 AA target).

## 12. Success Metrics (measurable versions)

| Metric | Definition | Target |
|---|---|---|
| Layer 1 classification accuracy | Top-1 correct on clean corpus; top-2 correct on adversarial corpus (§16) | > 75% clean, > 60% adversarial |
| KPI computability | % of shortlist KPIs computable **without** manual mapping, on well-labeled corpus | > 60% |
| Time to first result | `performance.now()` from file-selected to results rendered, files ≤ 5 MB | < 5 s on a mid-range 2022 laptop |
| Privacy guarantee | Automated test asserts **zero** network requests on the default path (§13.1); manual devtools check documented | 100% pass |
| Corpus coverage | All 30 fixtures produce a result screen (never an error or blank state) | 100% |
| Suggestion validity (P2) | % of suggestion requests returning ≥ 1 valid KPI post-validation | > 70% |
| Suggestion latency (P2) | p90 time from click to validated suggestions rendered | < 8 s |
| Suggestion quota budget (P2) | Suggestion calls per session | ≤ 2 (enforced) |

**Sequencing note:** classification, computability, time, and corpus coverage are computed by the eval harness (§16), which lands in two waves — a 6-fixture smoke set ships with the first working pipeline (1a), and the full 30-fixture corpus + E2E suite is the release gate (1b). Targets apply at release; the 1a milestone only requires the pipeline to run end to end on the smoke set.

## 13. Privacy & Security (verifiable requirements, not vibes)

1. **The default path makes zero network calls.** Parse → detect (Layer 1) → match → compute → render → export: no `fetch`, no `XMLHttpRequest`, no `sendBeacon`, no image-pixel beacons. Enforced by: unit test that stubs all three APIs and runs the full pipeline — any attempt to call out fails CI. Documented manual check: DevTools Network panel shows no requests during a full run. *(Phase 2: the AI-suggestion layer is the ONLY allowed network path — it is opt-in, disclosed, and sends headers only; a second test asserts its requests contain no values beyond the allowlisted header strings + domain label.)*
2. **No persistence:** no `localStorage` / `sessionStorage` / `indexedDB` writes of raw rows, results, or mappings. Session-only state (§11). No analytics in v1; if analytics are added, event payloads must contain no column names, values, or file names, and an allowlist test guards it.
3. **Layer 2 (Phase 2) sends headers only** — normalized header strings + candidate domain labels. Never sample values, never file name, never row counts. Timeout + cache per §7.2.
4. **Dependency hygiene:** pin exact versions. SheetJS (`xlsx`) only enters the bundle in Phase 2 and must be **≥ 0.19.3** (CVE-2023-30533: prototype pollution / ReDoS in earlier versions). PapaParse pinned. No `eval`, no dynamic script loading. CSP header on the static host (`default-src 'self'`).
5. **Visible, true statement** on the upload screen (§11) — the privacy claim is a product feature, and the architecture backs it.

## 14. Flaws, Edge Cases & Mitigations (v1 table preserved + additions)

| # | Flaw | Mitigation |
|---|---|---|
| 1 | Column names don't match expectations ("DOJ") | Synonym dict per field (§8.1) + alias table (§8.3) + manual "map this column" UI (§5.6) |
| 2 | Domain misclassification (mixed dataset) | Always show confidence + top-2 candidates, never auto-lock; prominent override when top-2 within 10 pts (§5.4) |
| 3 | Missing/null values in required columns | Per-field completeness % shown; >30% null → "low confidence" flag, never silent compute (§8.4) |
| 4 | Wrong data types (dates as text, currency strings) | Type-coercion layer with visible warnings + row counters (§9.3) |
| 5 | Small sample (<30 rows) | All KPIs flagged "directional only" (§10.3) |
| 6 | File too large for free-tier hosting/memory | Hard caps 10 MB / 50k rows / 200 cols with clear rejection message (§5.1, §9.1) |
| 7 | Sensitive data (HR/PII) uploaded to a web tool | Client-side processing; zero network on default path; headers-only on the two opt-in API paths; no persistence; visible privacy statement; all enforced by tests (§13) |
| 8 | Formulas "wrong" for the user's context | Formula + source columns in plain sight on every result; "edit formula assumptions" in v2 roadmap (§8.7) |
| 9 | Domain not in the library | Generic fallback with honest descriptive stats (§8.6) — Phase 1; suggestion layer becomes the bridge in Phase 2 (§8.8) |
| 10 | Irregular date granularity (mixed monthly/yearly rows) | Granularity sniffing + warning before trend (§9.5) |
| 11 | Overconfidence / false authority | Interpretations are observations, never verdicts; fixed template language (§8.7) |
| 12 | Free-tier API rate limits (Layer 2) | Layer 1 fully standalone; Layer 2 never blocks the flow (§7.2) |
| 13 | Duplicate rows / IDs skewing counts | De-dup before compute with visible counts (§9.4) |
| 14 | Non-UTF-8 encodings (Excel Latin-1 exports) | Encoding detection + fallback (§9.1) |
| 15 | Non-comma delimiters (EU semicolon CSVs) | Delimiter sniffing (§9.1) |
| 16 | Headerless files | Column name generation + user confirmation (§9.2) |
| 17 | Duplicate column names | Suffix disambiguation (`revenue`, `revenue_2`) logged at parse (§9.2) |
| 18 | Ambiguous date formats | DD/MM default + explicit toggle (§9.3) |
| 19 | Low-end device memory | Caps + streaming parse (PapaParse chunked) + minimal render cost; 50k rows is a parse test in CI |
| 20 | **New:** LLM hallucination in AI-suggested KPIs | Seven-check deterministic validator + "AI-suggested, not human-reviewed" label + formula always visible; suggestions never merge into curated section (§8.8) |
| 21 | **New:** suggestion quota exhausted mid-session | Max 1 call/session + cache by column-signature + instant toast; curated results unaffected (Layer B is optional by design) (§8.8) |
| 22 | **New:** user blames AI suggestions for wrong numbers | Distinct badge + disclosure label + flags on every AI card; curated default path never touches the LLM (§8.8, §13) |

## 15. Tech Stack (100% free-tier / open-source, with pins)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite, plain CSS | Monochrome design system, no paid UI kit |
| File parsing | PapaParse (CSV, pinned) | Client-side; SheetJS/xlsx ≥0.19.3 only in Phase 2 (CVE note, §13.4) |
| KPI engine | Plain TS rule engine over static KPI JSON | Deterministic, auditable, unit-testable (§8.5) |
| Detection L1 | Local keyword/alias scoring | Pure TS, offline (§7.1) |
| Detection L2 (P2) | Free-tier inference API (HF / Gemini) | Headers-only interface, timeout, graceful degrade (§7.2) |
| Suggestion layer (P2) | Same free-tier API as L2 | Opt-in, validated, cached, labeled (§8.8) |
| Charts (P2) | Recharts (monochrome theme) | v1 trend = numbers + text arrows; no chart lib needed in Phase 1 |
| Hosting | Vercel/Netlify free tier | Static site + CSP header (§13.4) |
| Storage (P3) | Supabase free tier (opt-in only) | Explicit user consent required |
| Export | Blob + CSV (P1), jsPDF (P2) | Client-side |
| Testing | Vitest (unit) + Playwright (E2E) | Corpus eval harness (§16) |

**Optimization principle (unchanged):** push all work to the client — zero server-side compute bill regardless of user count. The only external calls in the entire product are the two opt-in, headers-only, Phase 2 AI paths (L2 detection fallback, Layer B suggestions) — budgeted, cached, and never on the default path.

## 16. Test Corpus & Evaluation (Phase 1 deliverable)

- **30 labeled fixture datasets** committed to the repo (`fixtures/`), in two waves (scope-vs-time call, §17):
  - **Wave 1a — smoke set (ships with the first working pipeline):** 6 fixtures (2 HR, 2 Sales, 1 mixed-domain, 1 tiny 12-row) + a minimal harness script that runs parse → detect → match → compute and asserts a result renders and the zero-network test passes. Proof the pipeline works end to end — not proof of accuracy.
  - **Wave 1b — full corpus (release gate):** the remaining 24 fixtures (→ 12 HR, 12 Sales, 6 adversarial), Playwright E2E, cross-browser manual QA, and all §12 targets. All synthetic, no real PII.
- **Eval harness** (`scripts/evaluate.mjs`): runs parse → detect → match → compute on every fixture and reports:
  - classification: top-1 clean accuracy, top-2 adversarial accuracy
  - computability: % KPIs computable without mapping on well-labeled fixtures
  - time: pipeline duration per fixture (CI: must stay < 5 s for ≤ 5 MB)
  - privacy: zero-network assertion (§13.1) as part of the same run
- Release metrics (§12) are computed from the full harness on every CI run. **If it's not in the harness, it's not a release metric.** Unit tests for the engine, matcher, and detector ship with the code they test — they are part of 1a, not 1b (cheap, and they are what make the core trustworthy).
- Fixtures double as the portfolio demo set (one good HR file, one good Sales file, one messy file for the "watch the warnings" demo).
- *(Phase 2: the suggestion layer gets structural assertions — schema-valid output, validator pass rates, quota/caching behavior — not golden-output assertions, since the AI path is non-deterministic by design.)*

## 17. Phase 1 Definition of Done — split into a demo gate and a release gate

**DoD-1a — first working demo (get here fast; this is the honest "Phase 1 works" bar):**
- [ ] Upload: CSV ≤ 10 MB / 50k rows / 200 cols; over-cap rejection works
- [ ] Layer 1 detection: confidence (with evidence floor, §7.1 D) + top-2 shown; override dropdown works; Generic path shows descriptive stats (§8.6)
- [ ] Shortlist: computable/missing split; missing shows field names + completeness; mapping UI re-runs computability instantly
- [ ] Run: "run all computable" works; per-KPI cards show value, trend (≥3 periods), interpretation, formula, source columns, flags
- [ ] Small-sample flag, duplicate counts, and every cleaning warning visible in the processing log
- [ ] Export CSV matches rendered results (row-for-row)
- [ ] Privacy: zero-network test passes; no storage writes; `beforeunload` (generic browser prompt) fires with data loaded
- [ ] Unit tests for engine, matcher, detector green; smoke harness green on the 6-fixture wave-1a set (§16)

**DoD-1b — release gate (before calling the product shipped / portfolio-ready):**
- [ ] Full 30-fixture corpus + harness green: §12 targets met (classification, computability, time)
- [ ] Encoding/delimiter fixtures (BOM, Latin-1, semicolon) parse correctly
- [ ] Playwright E2E smoke (upload → results → export) on Chrome + Firefox
- [ ] Manual QA pass on Chrome/Edge/Firefox/Safari (last 2 versions), keyboard navigation, 375 px viewport
- [ ] CSP header live on the static host; dependency versions pinned in the lockfile

## 18. Phased Roadmap

**Phase 1 (MVP) — this build, sequenced 1a → 1b:** HR + Sales (7 curated KPIs each); Layer 1 only; CSV only; minimal column-mapping UI; minimal Generic fallback (descriptive stats); monochrome results; CSV export; zero-network privacy test. Library schema ships `source: "curated"` now so Layer B slots in cleanly. **1a** = end-to-end pipeline + 6-fixture smoke set (§17 DoD-1a) — the demo milestone. **1b** = full 30-fixture corpus, Playwright E2E, cross-browser QA (§17 DoD-1b) — the release gate, completed only after the demo works end to end.

**Phase 2:** Finance + Marketing domains — **authored via Layer C** (LLM drafts, human reviews, commits as curated); .xlsx support (first sheet + picker when multiple); Layer 2 LLM fallback for low-confidence detection; **Layer B AI-suggested KPIs (opt-in button, seven-check validator, headers-only, cached, labeled)**; PDF export; richer mapping UI (fuzzy-match confirm); per-domain granularity overrides.

**Phase 3 (stretch):** opt-in save/history (Supabase, explicit consent); full Generic descriptive-stats module (correlations, distributions); editable formula assumptions; benchmark comparisons (industry averages from free public datasets — *then* templates gain a benchmark clause).

## 19. Key Risks

| Risk | Impact | Mitigation |
|---|---|---|
| KPI library too shallow to feel credible | Users bounce after one try | Curation budget on Phase 1's 2 domains; Layer C accelerates Phase 2 domains (§8.9) |
| Free API fallback rate-limited (L2 / Layer B) | Detection/suggestion degrades | Default path never touches APIs; both AI paths are opt-in, budgeted, cached, and degrade to toasts (§7.2, §8.8) |
| "Sounds authoritative but is wrong" perception | Trust damage, esp. HR/finance data | Formula + source + flags on every card; observations not verdicts (§8.7, §14 #8/#11) |
| Scope creep toward a full BI tool | Never ships | Hold §3; the eval harness and DoD (§17) are the gate |
| Metrics that can't be measured | False confidence in the demo | Corpus + harness in Phase 1; "not in the harness, not a metric" (§16) |
| Dependency security (SheetJS history) | Supply-chain exposure in a "privacy-first" product | Pinned versions, CSP, no dynamic loading (§13.4) |
| Client memory on low-end devices | Crashes on big files | Caps + chunked parse + CI parse test at cap size (§14 #19) |
| **New:** solo-dev tooling overcommit — harness/E2E scope delays the first working demo | Demo never appears before coursework deadlines | Core-first sequencing is normative: DoD-1a is a 6-fixture smoke set, not a 30-fixture rig; full corpus + Playwright are the release gate, not the demo gate (§16–17) |
| **New:** AI suggestions undermine trust if unvalidated or unlabeled | Users distrust the whole tool | Seven-check validator, distinct badge, disclosure label, never merged with curated, optional by default (§8.8, §14 #20–22) |

## 20. Open Questions (owner decisions — recommended defaults in bold)

1. ~~**Library architecture: static vs dynamic?**~~ **RESOLVED (v3): hybrid** — curated static backbone + opt-in validated AI suggestions (P2) + dev-time LLM-assisted curation. See decision memo.
2. **Column-mapping UI in Phase 1?** — **Yes, minimal** (dropdown remap). It is cheap, gates metric #2, and makes first-try credibility far more likely.
3. **Generic fallback in Phase 1?** — **Yes, minimal descriptive stats.** It is the honest answer for any non-HR/Sales upload and doubles as the "unknown domain" state.
4. **Benchmarks in interpretation templates?** — **No in v1** (contradiction C1 fixed); add in Phase 3 when data exists.
5. **Confidence formula (§7.1 D) acceptable?** — **Yes, with the evidence floor added in v3.1** — ratio top/(top+runner-up) clamped 50–99%, then capped by absolute-evidence tier (topScore < 2.0 → 70% max; < 1.0 → no claim, Generic). Alternative: also require a minimum matched-header count.
6. **Phase 1 CSV only, or sneak in xlsx?** — **CSV only** (roadmap holds); SheetJS version pin already spec'd for Phase 2.
7. **Strict "no persistence ever" vs opt-in later?** — **Strict in v1**; Supabase save in Phase 3 requires explicit consent.
8. **Language:** English only in v1? — **Yes** (localization later if traction).
9. **Product name "KPI Analyzer"** — fine? Alternatives: "KPI Finder", "Measure This". Owner's call.
