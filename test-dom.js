#!/usr/bin/env node
/* DOM-level smoke test with a minimal shim: exercises ui.render for every screen
   and the app state-machine flow (identify → plan → results). Run: node test-dom.js */

const path = require('path');
const src = path.join(__dirname, 'src');

const elements = {};
globalThis.document = {
  getElementById(id) { return elements[id] || null; },
  createElement() { return { style: {}, setAttribute() {}, appendChild() {}, click() {}, remove() {} }; },
  body: { appendChild() {} },
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, scrollTo() {} };
globalThis.performance = { now: () => 1234 };
globalThis.TextDecoder = require('util').TextDecoder;
globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
globalThis.Blob = class Blob { constructor(parts) { this.parts = parts; } };
globalThis.FileReader = class {};

for (const f of ['samples.js', 'parser.js', 'cleaner.js', 'interpreter.js', 'roles.js', 'identify.js', 'analyze.js', 'propose.js', 'exporter.js', 'ui.js', 'app.js']) {
  require(path.join(src, f));
}
const KPI = globalThis.KPI;

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
elements.app = { innerHTML: '' };

// upload screen
KPI.ui.render({ screen: 'upload', table: null });
check('upload screen renders dropzone + privacy note',
  elements.app.innerHTML.includes('Drop your CSV here') && elements.app.innerHTML.includes('nothing leaves your browser'));

// ── full flow: campaign sample ──
const app = KPI.app;
app.loadSample('campaigns');
check('flow: upload → preview', app.state.screen === 'preview', app.state.screen);
check('preview shows stat strip + table', elements.app.innerHTML.includes('Rows') && elements.app.innerHTML.includes('tbl'));

app.runIdentify();
check('flow: preview → identify', app.state.screen === 'identify', app.state.screen);
const idHtml = elements.app.innerHTML;
check('identify: archetype shown', idHtml.includes('Campaign performance data'));
check('identify: confidence figure', idHtml.includes('conf-num'));
check('identify: reasoning facets', idHtml.includes('What I found') && idHtml.includes('cost'));
check('identify: column role table', idHtml.includes('Column roles assigned'));
check('identify: label override select', idHtml.includes('archetypeSel'));

elements.archetypeSel = { value: 'campaign' };
app.confirmIdentify();
check('flow: identify → plan', app.state.screen === 'plan', app.state.screen);
const planHtml = elements.app.innerHTML;
check('plan: derived items (not a menu)', planHtml.includes('derived from your column evidence'));
check('plan: computable section with checkboxes', planHtml.includes('We can analyze') && planHtml.includes('checkbox'));
check('plan: not-supported section', planHtml.includes('Not supported by this data'));
app.runAll();
check('flow: plan → results', app.state.screen === 'results', app.state.screen);
const resHtml = elements.app.innerHTML;
check('results: analysis cards', resHtml.includes('kpi-card') && resHtml.includes('Analysis'));
check('results: proposals section with strength', resHtml.includes('What’s worth considering') && resHtml.includes('prop-strength'));
check('results: proposals cite numbers', resHtml.includes('₹'));
check('results: data gaps section', resHtml.includes('What this data can’t tell us'));
check('results: export button', resHtml.includes('Export results'));
app.clearAll();
check('flow: results → upload', app.state.screen === 'upload', app.state.screen);

// ── mystery: honesty path ──
app.loadSample('mystery');
app.runIdentify();
check('mystery: unclear banner shown', app.state.identification.unclear && elements.app.innerHTML.includes('I can’t confidently say what this is'));
app.confirmIdentify();
app.runAll();
check('mystery: still produces results', app.state.screen === 'results' && app.state.results.length >= 2);
check('mystery: no forced proposals', app.state.proposals.length <= 1, 'n=' + app.state.proposals.length);

// ── inventory: generic path ──
app.loadSample('inventory');
app.runIdentify();
check('inventory: generic archetype', app.state.identification.archetype === 'other' && !app.state.identification.unclear);
app.confirmIdentify();
app.runAll();
check('inventory: stock analysis in results', app.state.results.some(r => r.kind === 'stock'));
check('inventory: restock proposal', app.state.proposals.some(p => p.kind === 'restock'));

// ── error screen ──
KPI.ui.render({ screen: 'error', table: null, error: 'This file has 61,004 rows. v1 supports up to 50,000.' });
check('error screen shows message + retry', elements.app.innerHTML.includes('61,004 rows') && elements.app.innerHTML.includes('Try another file'));

console.log('\n' + (failures === 0 ? '✅ DOM SMOKE PASSED' : '❌ ' + failures + ' DOM CHECK(S) FAILED'));
process.exit(failures ? 1 : 0);
