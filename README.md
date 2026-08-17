# KPI Analyzer — identification-first build

Implements the **revised brief**: identification is the core of the product, not a
preliminary step. The agent inspects whatever dataset is dropped in — columns,
value patterns, structure — and works out on its own what it is. Everything
downstream (what to analyze, what's worth proposing) is **derived from that
evidence**, never selected from a menu keyed to a fixed dataset type. If the
agent isn't confident, it says so and shows its reasoning.

100% client-side, zero network calls. Monochrome, typography-led UI.

**Spec:** the full product requirements live in `docs/KPI-Analyzer-PRD-v4.md`
(identification-first); earlier drafts and the architecture decision memo are in
`docs/` too.

## Live demo / deployment

- **Repo root `index.html` is the production artifact** — a single self-contained
  file. `vercel.json` at the root applies the security headers (strict CSP with
  `connect-src 'none'`, nosniff, no-referrer, permissions-policy).
- Import this repo into Vercel (New Project → Import) with framework preset
  **Other** — no build step needed; `index.html` is served at `/`.
- Rebuild after any change: `node build-standalone.js` (writes `dist/`, the
  workspace-root preview copy, and the repo-root `index.html`).

## Try it locally

Open `index.html` in a browser, or serve the folder
(`python3 -m http.server`) — then drop a CSV on it or use one of the seven
sample buttons (Campaigns · Email/CRM · Web analytics · Social · Sales ·
Inventory · **Ambiguous**). The ambiguous sample is the honesty demo: the tool
says "I can't confidently say what this is", shows what it *could* confirm, and
proceeds in exploratory mode — it never silently defaults.

## Pipeline (the core, per the revised brief)

```
 upload → inspect → IDENTIFY (roles + characterization) → plan (derived) → results (+ proposals + gaps)
```

| Module | What it does |
|---|---|
| `parser.js` | Generic CSV: encoding, delimiter sniffing, quoted fields (RFC-style: quotes only open at field start), header detection, caps |
| `cleaner.js` | Type coercion (₹/Indian grouping, ambiguous dates → DD/MM default), duplicates, granularity, warning model — nothing fails silently |
| **`roles.js`** | **The core.** Every column is assigned a semantic role from evidence: `time` / `id` (with identity: order, campaign, customer…) / `dimension` (identity: channel, platform, region, segment…) / `metric` (sub-role: cost, revenue, volume, outcome, engagement, rate, stock…) — each with confidence + evidence strings. Identical logic on any CSV; no per-dataset branches |
| **`identify.js`** | Characterizes the dataset **from the role evidence**: campaign performance · email/CRM · web & funnel · social · sales/revenue · generic · **uncertain**. Evidence-weighted scores, dampened runner-up confidence, absolute-evidence floor (raw < 1.5 → honest "I'm not sure" with reasoning). The archetype is an *output*, never a router |
| **`analyze.js`** | Derives the analysis plan purely from the role profile: trends only if a date column exists, breakdowns only if a dimension exists, cost-per-outcome/ROAS only if cost+outcome/revenue exist, conversion & engagement & bounce rates only if volume+outcome/engagement exist, stock gaps only if stock+reorder columns exist, distinct-counts only if id+time exist. Every blocked analysis states *why* and what column would unlock it. Every result's insight cites the actual numbers |
| **`propose.js`** | Decision proposals derived from results — each cites the numbers behind it ("Meta Ads: ₹228 per conversion vs ₹312 average, 27% cheaper") with strength labels (high/medium/directional). If the data can't ground a decision, that's in the **"What this data can't tell us"** gaps list with the column that would unlock it — nothing is forced |
| `exporter.js` | CSV export: analyses + proposals + gaps |
| `ui.js` / `app.js` | Monochrome screens (Upload / Inspect / Identify / Plan / Results), processing log, `beforeunload` (generic browser prompt), "propose, don't act" framing |

## Revised-brief principles enforced in code

1. **No hardcoded per-type branches** — the analysis plan is a function of the
   role profile; the archetype label never selects analyses.
2. **Everything downstream derived from what identification found** — plan items
   show the evidence ("uses: spend ← spend · date ← date").
3. **Uncertainty is said out loud** — unclear path shows the reasoning, caps
   confidence at 70% on weak evidence, marks small samples directional.
4. **No autonomous execution** — proposals are labeled "numbers are yours to act
   on, nothing runs automatically".
5. **Every recommendation cites its numbers** — enforced by tests: every insight
   and every proposal evidence must contain at least one digit.
6. **Data gaps are stated** — "no cost column → can't ground cost per outcome or
   budget allocation; unlocked by adding a spend column".

## Tests (all green)

```
node fixtures/generate-fixtures.js   # 7 labeled fixtures (incl. ambiguous + generic)
node test-identify.js                # roles/characterization/plan/proposals on all 7 samples + coercion edges
node test-fixtures.js                # every fixture parses, identifies (or honestly unsure), derives cited results — under network stubs
node test-privacy.js                 # §13.1: static scan + runtime under stubbed fetch/XHR/beacon — zero calls
node test-dom.js                     # UI render + full state-machine flow (identify → plan → results)
node e2e/walkthrough.js              # real-Chromium: 19 checks, incl. honesty path, generic path, mobile
```

E2E (dev-only): `npm i playwright-core` + `npx playwright-core install chromium --with-deps`, serve the folder,
then `node e2e/walkthrough.js --shots=docs/screens`.

## Samples & fixtures

Embedded samples: campaigns (42 rows), email/CRM (24), web analytics (48), social
(60), sales (89), inventory (14 — deliberately *not* marketing), ambiguous (24 —
thin mixed signals). `fixtures/` holds a deterministic labeled set for CI.

## Scope notes

- Old HR/Sales KPI-library build preserved as `dist/legacy-v1-hr-sales.html`.
- Not in this pass: Layer 2 (optional LLM) detection, .xlsx, PDF export, persistence.
- Dates: `DD/MM/YYYY` wins ambiguous cases (per PRD §9.3); weekly granularity
  labels are ISO weeks.
