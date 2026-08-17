# KPI Analyzer — PRD Review Notes (v1 → v2)

**Reviewer:** Arena Agent · **Date:** 10 Aug 2026 · **Input:** `KPI-Analyzer-PRD.md` (Draft v1)
**Deliverable pairing:** review notes here + revised spec in `KPI-Analyzer-PRD-v2.md`

---

## 1. Overall verdict

The v1 draft is **above average for a portfolio-stage PRD** — the problem statement is differentiated, Section 8 (flaws & edge cases) is better than most shipped specs, and the "client-side-first, Layer 1 standalone" architecture is the right call for a free-tier product.

However, v1 is a **position paper, not a build spec**. It says *what* to build and *why*, but not *how* — and most of the "how" is precisely where a tool like this succeeds or fails (detection algorithms, field matching, cleaning rules, trend rules). There are also **5 internal contradictions** and **several missing specs** that would block or misdirect an implementer.

**Verdict: revise to v2 with the fixes below; the skeleton stays.**

---

## 2. Strengths to preserve (do not edit away)

| # | Strength | Why it matters |
|---|---|---|
| S1 | "The dataset tells the user what to measure" framing | Clear, defensible differentiation from Power BI / Looker Studio |
| S2 | Section 8 edge-case table | This is where most tools like this actually fail; keeping it front-of-mind is rare and valuable |
| S3 | Client-side processing architecture | Correct for free hosting *and* the privacy story — the two reinforce each other |
| S4 | KPI library as static, human-curated, inspectable JSON | Right call for both cost and trust; never let this become an LLM-generated black box |
| S5 | Two-layer detection with Layer 1 as the standalone default | Layer 2 must stay a bonus; v1 states this correctly |
| S6 | Monochrome, typography-led UI direction | A coherent design stance that matches the "data is the hierarchy" promise |

---

## 3. Contradictions & inconsistencies (must fix)

| # | Location | Contradiction | Severity | Recommended fix |
|---|---|---|---|---|
| C1 | §6 schema vs §12 roadmap | `interpretation_template` contains `{benchmark}`, but benchmarks are Phase 3 — templates would reference data that doesn't exist in v1 | **High** | Benchmarks become an *optional* template slot; v1 templates = observation + trend only, no benchmark clause |
| C2 | §5 flow (step 4) vs §12 roadmap | Flow includes column-mapping UI; roadmap defers it to Phase 2 — but success metric #2 (>60% computable) is partly *gated on* mapping existing | **High** | Ship a **minimal mapping step in Phase 1** (dropdown "this column means…"). It is cheap and it is the difference between a demo and a usable tool |
| C3 | §8 #9 vs §12 roadmap | Generic-dataset fallback described in edge cases, but only listed as Phase 3 stretch | **Medium** | Ship a **minimal** descriptive-stats fallback in Phase 1 (it is also the safety net for any non-HR/Sales upload); full version in Phase 3 |
| C4 | §11 success metrics | "Zero data persistence incidents" is unmeasurable as written — no definition of what counts as an incident or how to verify | **Medium** | Redefine: "Layer 1 path makes zero network requests containing row values — enforced by an automated test + documented manual devtools check" |
| C5 | §11 vs §12 | "Correctly domain-classified >75%" has no ground-truth corpus or evaluation method defined | **Medium** | Add a labeled test corpus (30 fixtures) + eval harness as a Phase 1 deliverable (see §16 of v2) |

---

## 4. Spec gaps that block a build (the core of this review)

### G1 — KPI library schema is underspecified (§6)
v1 shows one example entry. Missing entirely:
- **KPI IDs** (stable, namespaced: `hr.turnover_rate`)
- **Field types** — is a field numeric / date / categorical / id? Computability and cleaning depend on this
- **Alternative field sets** — e.g., turnover can be computed from `exit_date` *or* a `status` column whose values include a "left/terminated" token. The v1 schema forces a single field list
- **Categorical value constraints** — `status` only works if values contain recognizable termination markers
- **Unit & direction** (percent / count / ratio; higher-is-better or not) — needed for interpretation and the warning accent
- **Minimum row count per KPI**, and **optional fields** (enrichment, not blockers)
- **Multiple date columns** — tenure needs *two* dates; the schema implies one

**Fix (in v2):** full v2 JSON schema + two completely worked entries (`hr.turnover_rate`, `sales.avg_order_value`) + a starter synonym table for every Phase 1 field.

### G2 — No computability algorithm (§5–6)
"All required columns present" sounds simple until a real CSV shows up. Not specified:
- How a column is matched to a required field (normalization pipeline, scoring, thresholds, partial matches)
- What happens when **one column matches two fields**, or **two columns match one field**
- The interaction between synonym matching and the manual mapping step

**Fix (in v2):** concrete matching algorithm with a worked example (`emp_id` vs `employee_id` vs `id`).

### G3 — No domain-detection algorithm (§7)
"Match headers against a keyword dictionary, pick highest, show confidence %" is the whole Layer 1 spec. An implementer cannot build from this. Missing:
- Header normalization rules
- Keyword weights and how scores combine
- Value-pattern checks (email regex, date parse rate, currency symbols) — cheap signal, hugely useful
- **Confidence formula** — v1 says "87%" with no definition; the number must be reproducible
- Tie-breaking and "unknown" thresholding (when do we give up and ask the user?)

**Fix (in v2):** full algorithm + worked example with real header lists.

### G4 — No data-cleaning spec (§8 #3, #4 exist as intent only)
- Date parsing ambiguity: `02/03/2024` is Feb 3 in the US, Mar 2 everywhere else — who decides? v1 is silent
- Currency/number parsing (₹1,23,456.78, "$1,234.56", "12.5%") — locale rules undefined
- **Duplicate policy**: de-dup on which key, what counts as a duplicate, and what the user is told
- The warning model: v1 says "never fail silently" but doesn't define severities, where warnings render, or counters ("3 rows excluded")

**Fix (in v2):** type-coercion rules, a 3-level warning model, and explicit duplicate policy.

### G5 — No granularity/trend spec (§6 mentions granularity; §8 #10 hints)
- Which granularity is chosen when, and how is it detected from the date span?
- **How many periods are needed before a "trend" is allowed?** (3? 5?)
- What does a trend *look like* in v1 — a line chart? A Δ vs prior period table? v1 says "trend if time data exists" and nothing more

**Fix (in v2):** concrete rules (default monthly; weekly under 45 days; ≥3 periods for trend; v1 trend = per-period values + period-over-period delta, no forecasting — consistent with the non-goal).

### G6 — No UI state spec (§5 is happy-path only)
Missing states: parsing, detection in flight, **zero KPIs computable**, domain not in library, file rejected (size/format), headerless file, clearing the file, refreshing mid-session, "run all computable" empty. Also missing: where the privacy statement lives, and what happens to loaded data on refresh (it is in-memory only → it will vanish; the UX must say so and warn on unload).

**Fix (in v2):** full state list + per-state behavior + unload warning.

### G7 — No test corpus / evaluation plan (§11 metrics exist, method doesn't)
The two headline metrics (">75% correct classification", ">60% computable") are **unmeasurable without a labeled corpus**. A portfolio product also *needs* the corpus to demo convincingly.

**Fix (in v2):** §16 — 30 labeled fixture datasets (12 HR, 12 Sales, 6 adversarial: mixed/ambiguous/dirty), eval harness script, metric definitions (strict vs relaxed accuracy).

### G8 — Security/privacy spec is intent, not requirements (§8 #7)
- SheetJS has a known CVE history (CVE-2023-30533 — prototype pollution / ReDoS in versions <0.19.3); the stack table should pin versions
- "We don't store your data" needs **technical guarantees**, not just a statement: no localStorage/indexedDB of raw rows, no analytics beacons carrying content, Layer 2 sends *headers only*
- v1 says Layer 2 sends "anonymized headers" — good — but doesn't define the interface, timeout budget, or rate-limit UX

**Fix (in v2):** §13 privacy checklist with verifiable requirements + Layer 2 interface spec (input = headers + candidates only; timeout ≤4s; result refines after Layer 1 already shown).

### G9 — No Phase 1 Definition of Done
§12 lists what's in Phase 1 but not what "done" means. Without acceptance criteria, the build has no exit condition.

**Fix (in v2):** §18 — a checkable DoD checklist.

---

## 5. Minor nits

| # | Nit |
|---|---|
| N1 | §5 step 1: "size-capped" — cap is defined later (§8 #6) but should be stated up front in the flow: 10 MB / 50k rows / 200 columns |
| N2 | §8 #6: caps exist but no behavior is defined for over-cap files (reject with message vs truncate) — v2: reject with a clear message, never silent truncation |
| N3 | §9: no browser-support statement — add "evergreen browsers, last 2 versions" |
| N4 | §10: "single accent for warnings" needs an a11y companion rule (warnings must also differ in shape/weight/text, not color alone) |
| N5 | §10: no responsive statement — results tables must stack on mobile; add "desktop-first, tablet-usable, mobile readable" |
| N6 | §12 Phase 2: "Excel support" — undefined sheet behavior (first sheet? picker?); v2: first sheet + picker when >1 |
| N7 | §13 risk table is good but misses: client-memory limits on low-end devices, dependency security, and "metrics that can't be measured" |
| N8 | No open-questions section — decisions the owner must make are buried; v2 adds one with recommended defaults |

---

## 6. What v2 changes, section by section

| v1 section | v2 change |
|---|---|
| 1–4 Problem/Goal/Non-Goals/Persona | Polished, non-goals extended (no auth, no persistence, no server-side compute) |
| 5 User flow | Steps annotated with decision points + state machine; mapping step moved into Phase 1 (C2); generic fallback placed (C3) |
| **NEW 6 Architecture** | Pipeline: parse → clean → detect → match → compute → interpret → render; module list; data flow diagram |
| 7 Detection → **v2 7** | Full Layer 1 algorithm + confidence formula + worked example; Layer 2 interface + budgets + failure mode |
| 6 KPI library → **v2 8** | v2 JSON schema, 2 worked entries, starter synonym table, computability algorithm, trend rules |
| **NEW 9** | Ingestion & cleaning spec (encodings, delimiters, date/number coercion, duplicates, warning model) |
| **NEW 10** | Results object model + interpretation + export spec |
| 10 UI/UX → **v2 11** | Kept + full state list + a11y + responsive + unload warning |
| **NEW 13** | Privacy & security checklist (verifiable) |
| 8 Edge cases → **v2 14** | Original 13 rows kept, +6 new (encoding, delimiters, headerless files, dup columns, xlsx sheets, memory) |
| 9 Stack → **v2 15** | + version pins, SheetJS CVE note, browser support |
| **NEW 16** | Test corpus + evaluation harness |
| 11 Metrics → **v2 17** | Rewritten to be measurable (C4, C5) |
| **NEW 18** | Phase 1 Definition of Done |
| 12 Roadmap → **v2 19** | Phases updated to match C2/C3 decisions |
| 13 Risks → **v2 20** | Original 3 kept + 3 new |
| **NEW 21** | Open questions for the owner, with recommended defaults |

---

## 7. Bottom line

v1 makes the right **strategic** calls; v2 makes it **buildable**. The three highest-leverage fixes are:

1. **Define the confidence formula and computability algorithm** (G2/G3) — otherwise two engineers will build two different products and neither number in §11 can be produced
2. **Move minimal column-mapping and generic fallback into Phase 1** (C2/C3) — they gate the headline metrics and the "credible on first try" experience
3. **Add the test corpus + eval harness as a Phase 1 deliverable** (G7) — it makes the success metrics real and gives the portfolio demo a script
