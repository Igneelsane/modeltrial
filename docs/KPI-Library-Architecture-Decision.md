# Decision Memo — KPI Library Architecture: Static vs Dynamic vs Hybrid

**Date:** 10 Aug 2026 · **Author:** Arena Agent · **Inputs:** `KPI-Analyzer-PRD-v2.md`, `KPI-Reference-Approach.md` (the "Alternative" proposal)
**Decision:** **ADOPT the dynamic approach as an opt-in Phase 2 layer — do NOT replace the static library with it.** Three-part structure: curated static library (backbone) + optional AI-suggested KPIs (validated, labeled) + LLM-assisted curation at development time.

---

## 1. The proposal being evaluated

Replace the hand-curated static KPI library with request-time LLM generation: after domain detection, send domain + column headers to a free-tier LLM with a constrained prompt ("list relevant KPIs, formula using only given columns, required columns, one-line definition, JSON only"), treat output as a draft, run it through a deterministic validator (required columns actually exist), cache by domain + column-signature, keep a static seed list as quota fallback.

## 2. What the proposal gets right (take these seriously)

| Win | Why it matters |
|---|---|
| **Coverage** | Any domain (healthcare, logistics, education…) without hand-writing KPI entries. Directly attacks the PRD's top risk ("library too shallow to feel credible") |
| **Schema adaptation** | KPIs are expressed in the user's *actual* column names — less synonym/mapping friction than the curated path |
| **Curation cost** | Hand-authoring 4+ domains × 10 KPIs is slow; an LLM can draft candidates that a human verifies — a real accelerator |
| **"LLM proposes, rules dispose"** | The validator instinct is the correct pattern for using LLMs in a numbers-facing tool |

## 3. What the proposal underweights (why full-dynamic fails for this product)

### L1 — It breaks the PRD's core economic promise
The v1/v2 architecture exists so that *the default path costs nothing and works offline*: "zero external calls for 80%+ of well-labeled datasets." Dynamic shortlisting makes **every session** do ≥1 external call. Free-tier math:
- Gemini free tier ≈ 15 requests/min, ~1,500/day. HF free inference is more aggressively rate-limited.
- A portfolio demo day (20 different files) = 20+ calls; cache-by-signature only helps when the *same* file is re-uploaded.
- Quota exhaustion mid-session becomes the norm, not the edge case — exactly the failure mode the PRD's risk table warns about (Layer 2 = "bonus, never a dependency").

### L2 — The proposed validator is necessary but not sufficient
Checking "required columns exist" catches *reference* hallucination. It does **not** catch:
- a plausible-but-wrong formula (computes the wrong quantity for the named concept),
- wrong units or direction (percent vs count; higher-is-better confusion),
- nonsense-but-grammatical KPI names ("Quantum Synergy Index"),
- KPIs that need a time dimension when no date column exists (the tool would silently degrade into non-time KPIs — erasing the "possible but missing X" honesty that is this product's differentiator),
- interpretation text that hallucinates benchmarks.

On HR/finance data, **wrong-but-confident numbers are the trust killer** the PRD explicitly fears (§8.7, §14 #8/#11). Validation must be expanded (see §5.3), and even then the output is *auto-checked, not human-reviewed* — a different trust tier from curated formulas.

### L3 — Non-determinism breaks testing and credibility
Same file → different KPI lists across runs, models, temperature. The eval corpus (§16 of v2) cannot assert golden outputs on this path. For a portfolio product, "the tool said different things yesterday" is a bad look.

### L4 — Latency collides with the headline metric
Free-tier generation round-trips are 2–10 s+; the metric is "first result < 5 s." Survivable only if curated results render first — which *is* static-first anyway.

### L5 — The privacy claim downgrades
"Files are processed entirely in your browser; nothing leaves your device" is a headline feature (§13 of v2, verified by a zero-network test). Full-dynamic makes header-sending part of every default session. The claim becomes "nothing leaves except your column names, every time."

## 4. Decision matrix

| Criterion | Static curated (v2) | Full dynamic (proposal) | Hybrid (v3, adopted) |
|---|---|---|---|
| Default path free, offline, zero network | ✅ | ❌ (every session = API) | ✅ |
| Trust: auditable, human-reviewed formulas | ✅ | ⚠️ (auto-checked only) | ✅ curated + ⚠️ labeled AI |
| Domain coverage | ❌ (4 domains, slow to grow) | ✅ any domain | ✅ via suggestion layer + dev-time curation |
| Schema adaptation | ⚠️ (synonym + mapping UI) | ✅ direct | ✅ optional layer |
| Deterministic, unit-testable, corpus-evaluable | ✅ | ❌ | ✅ default path |
| Dev effort to credibility | High (curation) | Low | Medium |
| Privacy story | ✅ zero network always | ❌ headers sent every session | ✅ default zero; opt-in disclosed |

## 5. The adopted design — three layers

### Layer A — Curated static library (backbone, Phase 1, unchanged)
Human-reviewed, versioned JSON; deterministic; offline; the only path in Phase 1. Every KPI entry gains a `source: "curated"` field now so Layer B slots in cleanly later.

### Layer B — AI-suggested KPIs (Phase 2, explicit opt-in)
- **Trigger:** a visible button on the shortlist screen — "Suggest more KPIs for this dataset." Also offered on the Generic domain as the bridge from descriptive stats to candidate KPIs. **Never automatic.**
- **Input contract (privacy):** domain + normalized headers only. No values, no row counts, no file name. UI discloses: *"Column names will be sent to a free AI API to suggest KPIs. Row values never leave your device."*
- **Output contract:** constrained JSON — `{ "kpis": [{ "name", "formula", "required_fields", "unit", "summary" }] }`. Prompt forbids benchmarks, markdown, columns not in the list, and non-numeric placeholders.
- **Validator (expanded — all checks must pass before display):**
  1. Every required field resolves to a real column (normalized match ≥ 0.9)
  2. Field types compatible with column types after cleaning
  3. Formula parses (balanced, known operators) and references only declared fields
  4. Computed value sanity bounds (percent 0–100; counts/amounts ≥ 0; ratios within plausible caps) — violations flagged "review formula," not silently fixed
  5. Not a duplicate of a curated KPI
  6. Time-series KPIs require a real date column; if none exists, only non-time KPIs pass — preserves the "missing data X" honesty
  7. Interpretation text uses only allowed placeholders
- **Display rules:** distinct "AI-suggested" badge; label *"Generated from your column names; auto-checked but not human-reviewed. Verify formulas before relying on them."* Formula always visible; never merged silently into the curated section.
- **Budget & cache:** max 1 suggestion call per session (user can explicitly re-trigger); cache key = domain + sorted normalized header set; timeout 8 s → toast "AI suggestion is busy — curated KPIs below are unaffected." Zero impact on already-rendered results.
- **Metrics:** ≥ 70% of suggestion requests return ≥ 1 valid KPI post-validation; suggestion latency ≤ 8 s p90.

### Layer C — LLM-assisted curation (development-time only)
During Phase 2, use the same free-tier LLM to *draft* candidate KPI entries for Finance/Marketing (prompt = domain + canonical field vocabulary + library schema example). A human reviews, edits, and commits them to the static JSON as `source: "curated"`. The library grows 4–8× faster; **runtime never depends on the LLM.** This is the honest answer to "scales to any domain."

## 6. When to revisit full-dynamic

Reopen this decision if: (a) the product pivots to "analyze ANY dataset" as the headline feature (not portfolio-stage), or (b) a paid tier exists that can absorb hosted-model cost plus a human-review pipeline. Until then, hybrid — the default path stays free, offline, deterministic, and private, and the AI layer is a labeled, optional enhancement.

## 7. PRD delta (v2 → v3)

| Area | Change |
|---|---|
| §5 flow | Shortlist is curated-first; optional "Suggest more" step added (Phase 2) |
| §6 architecture | New `suggestor` module (Phase 2) behind a pure interface: `suggestKpis({domain, headers}) → DraftKpi[]` |
| §8 KPI library | `source` field on all entries; new §8.8 (Layer B spec incl. validator) and §8.9 (Layer C) |
| §12 metrics | + suggestion-layer metrics; quota budget ≤ 2 calls/session |
| §13 privacy | Zero-network guarantee explicitly scoped to the default path; opt-in disclosure for suggestion calls; headers-only test |
| §14 edge cases | + hallucination row, + suggestion quota-exhaustion row |
| §18 roadmap | Layer B in Phase 2; Layer C used to author Phase 2 domains |
| §19 risks | + "AI suggestions undermine trust if unlabeled/unvalidated" |
| §20 open questions | Q resolved: library architecture = hybrid |
