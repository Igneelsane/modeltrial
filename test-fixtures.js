#!/usr/bin/env node
/* Wave-1a fixture corpus tests: every fixture must parse, identify (to its expected
   archetype OR the honest 'unclear' path), derive a plan, and produce cited results —
   never an error. Runs under zero-network stubs.
   Run: node test-fixtures.js */

const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'src');
for (const f of ['parser.js', 'cleaner.js', 'interpreter.js', 'roles.js', 'identify.js', 'analyze.js', 'propose.js']) {
  require(path.join(src, f));
}
const KPI = globalThis.KPI;

const calls = [];
globalThis.fetch = (...a) => { calls.push('fetch'); return Promise.reject(new Error('blocked')); };
globalThis.XMLHttpRequest = function () { calls.push('xhr'); };
globalThis.navigator = { sendBeacon: () => { calls.push('beacon'); return false; } };
globalThis.WebSocket = function () { calls.push('websocket'); };
globalThis.EventSource = function () { calls.push('eventsource'); };
globalThis.Image = function () { calls.push('image'); };

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

const dir = path.join(__dirname, 'fixtures');
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.csv')).sort()) {
  const csv = fs.readFileSync(path.join(dir, file), 'utf8');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, file.replace('.csv', '.json')), 'utf8'));
  console.log('\n══ ' + file + ' (expect: ' + meta.expect + ' — ' + meta.label + ') ══');
  try {
    const cleaned = KPI.cleaner.cleanTable(KPI.parser.parseCSVText(csv));
    const roles = KPI.roles.assign(cleaned);
    const id = KPI.identify.characterize(cleaned, roles);
    const ok = meta.expect === 'unclear' ? id.unclear : id.archetype === meta.expect;
    check('identifies correctly or honestly unsure (' + id.label + ')', ok, 'archetype=' + id.archetype + ' unclear=' + id.unclear);
    check('reasoning produced', id.reasoning.length >= 1);
    const plan = KPI.analyze.buildPlan(cleaned, roles);
    const computable = plan.filter(i => i.computable);
    check('plan derived, ≥2 computable', computable.length >= 2, 'n=' + computable.length);
    let allGood = true, err = '';
    for (const it of computable) {
      try { const res = it.compute(); if (res && !/\d/.test(String(res.insight))) { allGood = false; err = it.id + ': no numbers cited'; } }
      catch (e) { allGood = false; err = it.id + ': ' + e.message; }
    }
    check('all analyses compute and cite numbers', allGood, err);
    if (meta.expect === 'unclear') {
      check('low-confidence path says so explicitly', id.unclearReason && id.unclearReason.length > 30);
    }
  } catch (err) {
    check('parses without error', false, err.message);
  }
}
check('zero network calls during entire fixture run', calls.length === 0, JSON.stringify(calls.slice(0, 5)));

console.log('\n' + (failures === 0 ? '✅ FIXTURE CORPUS PASSED' : '❌ ' + failures + ' FAILED'));
process.exit(failures ? 1 : 0);
