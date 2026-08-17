#!/usr/bin/env node
/* Privacy tests (PRD §13.1): static scan + runtime under network stubs.
   Run: node test-privacy.js */

const fs = require('fs');
const path = require('path');
const srcDir = path.join(__dirname, 'src');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

// ── 1. static scan ──
const FORBIDDEN = ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'navigator.sendBeacon', 'http://', 'https://', 'new Image('];
let bad = [];
for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith('.js'))) {
  const code = fs.readFileSync(path.join(srcDir, f), 'utf8');
  for (const token of FORBIDDEN) if (code.includes(token)) bad.push(f + ': contains "' + token + '"');
}
check('static scan: no network APIs or URLs in src/', bad.length === 0, bad.join('; '));

// ── 2. runtime under stubs ──
const calls = [];
globalThis.fetch = (...a) => { calls.push('fetch'); return Promise.reject(new Error('blocked')); };
globalThis.XMLHttpRequest = function () { calls.push('xhr'); };
globalThis.navigator = { sendBeacon: () => { calls.push('beacon'); return false; } };
globalThis.WebSocket = function () { calls.push('websocket'); };
globalThis.EventSource = function () { calls.push('eventsource'); };
globalThis.Image = function () { calls.push('image'); };
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, click() {}, remove() {} }),
  body: { appendChild() {} },
};

for (const f of ['samples.js', 'parser.js', 'cleaner.js', 'interpreter.js', 'roles.js', 'identify.js', 'analyze.js', 'propose.js', 'exporter.js']) {
  require(path.join(srcDir, f));
}
const KPI = globalThis.KPI;

// full pipeline on the campaigns sample + one generic + one ambiguous
for (const key of ['campaigns', 'inventory', 'mystery']) {
  const table = KPI.parser.parseCSVText(KPI.samples[key].csv);
  const cleaned = KPI.cleaner.cleanTable(table);
  const roles = KPI.roles.assign(cleaned);
  const id = KPI.identify.characterize(cleaned, roles);
  const plan = KPI.analyze.buildPlan(cleaned, roles);
  for (const it of plan.filter(i => i.computable)) it.compute();
  KPI.propose.generate([], { cleaned, roles, identification: id });
}
check('runtime: zero network calls across full pipelines', calls.length === 0, JSON.stringify(calls));

console.log('\n' + (failures === 0 ? '✅ PRIVACY TESTS PASSED' : '❌ ' + failures + ' FAILED'));
process.exit(failures ? 1 : 0);
