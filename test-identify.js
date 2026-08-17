#!/usr/bin/env node
/* Core test suite for the identification-first pipeline (revised brief):
   roles → characterize → plan → compute → propose, on every sample.
   Asserts: correct archetype or honest 'unclear', role evidence, derived plan,
   every insight cites numbers, proposals cite numbers, gaps are honest.
   Run: node test-identify.js */

const path = require('path');
const src = path.join(__dirname, 'src');
for (const f of ['samples.js', 'parser.js', 'cleaner.js', 'interpreter.js', 'roles.js', 'identify.js', 'analyze.js', 'propose.js']) {
  require(path.join(src, f));
}
const KPI = globalThis.KPI;

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
const hasDigit = s => /\d/.test(String(s || ''));
const hasMoney = s => /₹/.test(String(s || ''));

function run(name, key, expectArchetype) {
  console.log('\n══ ' + name + ' ══');
  const csv = KPI.samples[key].csv;
  const table = KPI.parser.parseCSVText(csv);
  const cleaned = KPI.cleaner.cleanTable(table);
  const roles = KPI.roles.assign(cleaned);
  const id = KPI.identify.characterize(cleaned, roles);
  console.log('  identified:', id.label, '| conf:', id.confidence != null ? Math.round(id.confidence * 100) + '%' : 'n/a', '| tier:', id.tier, '| unclear:', id.unclear);
  check('archetype = ' + expectArchetype, id.archetype === expectArchetype || (expectArchetype === 'unclear' && id.unclear), 'got ' + id.archetype + ' unclear=' + id.unclear);
  check('reasoning facets present', id.reasoning.length >= 1, 'n=' + id.reasoning.length);

  const plan = KPI.analyze.buildPlan(cleaned, roles);
  const computable = plan.filter(i => i.computable);
  check('plan derived, computable ≥ 2', computable.length >= 2, 'n=' + computable.length);

  const results = [];
  for (const it of computable) {
    try {
      const res = it.compute();
      if (res) { res.id = it.id; res.title = res.title || it.title; results.push(res); }
    } catch (e) { check('compute ' + it.id, false, e.message); }
  }
  check('all computable items produce results', results.length === computable.length, results.length + '/' + computable.length);
  check('every insight cites at least one number', results.every(r => hasDigit(r.insight)), results.filter(r => !hasDigit(r.insight)).map(r => r.id).join(','));
  check('every result carries formula + source columns', results.every(r => r.formula && r.columns && Object.keys(r.columns).length));
  check('every result has a confidence level', results.every(r => r.confidence === 'high' || r.confidence === 'directional'));

  const prop = KPI.propose.generate(results, { cleaned, roles, identification: id });
  console.log('  proposals:', prop.proposals.length, '| gaps:', prop.gaps.length);
  check('proposals cite numbers in evidence', prop.proposals.every(p => p.evidence.some(hasDigit)), prop.proposals.map(p => p.title).join('; '));
  check('proposals have strength labels', prop.proposals.every(p => ['high', 'medium', 'directional'].includes(p.strength)));
  return { cleaned, roles, id, plan, results, proposals: prop.proposals, gaps: prop.gaps };
}

// ── campaign ──
const c = run('Campaign sample', 'campaigns', 'campaign');
check('campaign: cost role found', c.roles.summary.metrics.cost.length >= 1);
check('campaign: outcome role found', c.roles.summary.metrics.outcome.length >= 1);
check('campaign: channel dimension identity', c.roles.summary.dimensions.some(d => d.identity === 'channel'));
check('campaign: strong confidence', c.id.confidence != null && c.id.confidence >= 0.75 && c.id.tier === 'strong', c.id.confidence);
check('campaign: efficiency (cost per conversion) derived', c.results.some(r => r.id.startsWith('cpo_')));
check('campaign: ROAS derived', c.results.some(r => r.id.startsWith('roas_')));
check('campaign: trend derived', c.results.some(r => r.kind === 'trend'));
check('campaign: allocation proposal', c.proposals.some(p => p.kind === 'allocation'));
check('campaign: no cost gap', !c.gaps.some(g => /cost/i.test(g.title)));
check('campaign: conversion rate derived', c.results.some(r => r.kind === 'rate' && /conversion rate/i.test(r.title)));

// ── email / CRM ──
const e = run('Email / CRM sample', 'email', 'crm_email');
check('email: email signal found', e.roles.summary.texts.some(t => t.identity === 'email'));
check('email: negative outcome (unsubscribes) recognized', e.roles.summary.metrics.outcome.some(m => m.negative));
check('email: bounce rate derived', e.results.some(r => /bounce rate/i.test(r.title)));
check('email: segment dimension', e.roles.summary.dimensions.some(d => d.identity === 'segment'));
check('email: unsub gap? no — unsubscribes exist', !e.gaps.some(g => /outcome/i.test(g.title)));

// ── web / funnel ──
const w = run('Web analytics sample', 'web', 'web_funnel');
check('web: channel dimension', w.roles.summary.dimensions.some(d => d.identity === 'channel'));
check('web: cost gap present (no spend column)', w.gaps.some(g => /cost/i.test(g.title)));
check('web: no ROAS (no spend)', !w.results.some(r => r.id.startsWith('roas_')));
check('web: conversion rate derived (goals/sessions)', w.results.some(r => r.kind === 'rate' && /conversion rate/i.test(r.title)));

// ── social ──
const s = run('Social sample', 'social', 'social');
check('social: platform dimension', s.roles.summary.dimensions.some(d => d.identity === 'platform'));
check('social: engagement role found', s.roles.summary.metrics.engagement.length >= 1);
check('social: engagement rate derived', s.results.some(r => /engagement rate/i.test(r.title)));

// ── sales / revenue ──
const sa = run('Sales sample', 'sales', 'sales_revenue');
check('sales: order id identity', sa.roles.summary.ids.some(i => i.identity === 'order'));
check('sales: revenue role found', sa.roles.summary.metrics.revenue.length >= 1);

// ── inventory (outside the list) ──
const inv = run('Inventory sample', 'inventory', 'other');
check('inventory: stock + reorder roles', inv.roles.summary.metrics.stock.length >= 1 && inv.roles.summary.metrics.reorder.length >= 1);
check('inventory: stock gap analysis derived', inv.results.some(r => r.kind === 'stock'));
check('inventory: restock proposal (4 SKUs below reorder)', inv.proposals.some(p => p.kind === 'restock'));
check('inventory: unit_cost recognized as cost (no false cost gap)', !inv.gaps.some(g => /cost/i.test(g.title)));
check('inventory: cost-per-outcome blocked honestly (no outcome col)', inv.plan.some(i => !i.computable && /outcome/i.test(i.why_not || '')));

// ── mystery (honesty path) ──
const m = run('Mystery sample', 'mystery', 'unclear');
check('mystery: says "I don\'t know" instead of guessing', m.id.unclear === true, 'unclear=' + m.id.unclear);
check('mystery: unclear reason explains itself', m.id.unclearReason && m.id.unclearReason.length > 30);
check('mystery: still derives generic analysis', m.results.length >= 2);
check('mystery: no forced proposals (nothing grounded)', m.proposals.length <= 1, 'n=' + m.proposals.length);
check('mystery: trend gap honest (has date — no gap)', !m.gaps.some(g => /Trends/.test(g.title)));

// ── parser/coercion edges (kept from v1 suite) ──
console.log('\n══ Parser & coercion edges ══');
check('semicolon delimiter sniffed', KPI.parser.parseCSVText('a;b;c\n1;2;3\n4;5;6').meta.delimiter === ';');
check('BOM stripped', KPI.parser.parseCSVText('\uFEFFx,y\n1,2').columns[0].header === 'x');
const q = KPI.parser.parseCSVText('name,note\na,"hello, world"\nb,"line1\nline2"');
check('quoted field with comma + newline', q.rows.length === 2 && q.rows[1][1] === 'line1\nline2');
check('numeric first row → headerless', KPI.parser.parseCSVText('12,34,56\n1,2,3\n4,5,6').meta.headerless === true);
check('Indian number 12,34,567 → 1234567', KPI.cleaner.parseNum('12,34,567') === 1234567);
check('currency ₹ 8,50,000 → 850000', KPI.cleaner.parseNum('₹ 8,50,000') === 850000);
check('ambiguous date → DD/MM (Mar 2)', (() => { const d = KPI.cleaner.parseDateAny('02/03/2024'); return d.getMonth() === 2 && d.getDate() === 2; })());
check('Excel serial 45658 → 2025-01-01', (() => { const d = KPI.cleaner.parseDateAny(45658); return d.getFullYear() === 2025 && d.getMonth() === 0 && d.getDate() === 1; })());
check('garbage date → null', KPI.cleaner.parseDateAny('not-a-date') === null);

console.log('\n' + (failures === 0 ? '✅ ALL IDENTIFICATION CHECKS PASSED' : '❌ ' + failures + ' CHECK(S) FAILED'));
process.exit(failures ? 1 : 0);
