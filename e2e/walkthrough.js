#!/usr/bin/env node
/* E2E walkthrough + layout verification (revised brief): upload → inspect →
   identify → plan → results, on real Chromium, incl. the honesty path (mystery)
   and the generic path (inventory). Requires playwright-core (dev-only).
   Usage: node e2e/walkthrough.js [--url URL] [--shots DIR]
   Exit code 0 = all checks pass, zero JS errors. */

const path = require('path');
const fs = require('fs');

let chromium;
try { chromium = require('playwright-core').chromium; }
catch { console.log('SKIP: playwright-core not installed (npm i playwright-core, then run again).'); process.exit(0); }

const args = process.argv.slice(2);
const urlArg = args.find(a => a.startsWith('--url'));
const shotsArg = args.find(a => a.startsWith('--shots'));
const url = urlArg ? urlArg.split('=')[1] : 'http://127.0.0.1:8123/kpi-analyzer/dist/kpi-analyzer.html';
let shotsDir = shotsArg ? shotsArg.split('=')[1] : null;
if (shotsArg && shotsDir == null) shotsDir = args[args.indexOf(shotsArg) + 1];
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 940 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  let fails = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log('  ✓ ' + name);
    else { fails++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };
  const snap = async n => { if (!shotsDir) return; await page.waitForTimeout(250); await page.screenshot({ path: path.join(shotsDir, n + '.png') }); };
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const flow = async s => { await page.evaluate(() => KPI.app.clearAll()); if (s) await page.evaluate(x => KPI.app.loadSample(x), s); };

  await page.goto(url, { waitUntil: 'networkidle' });
  check('app loads without errors', errors.length === 0, errors.join('; '));
  await snap('01-upload');
  check('upload: no overflow', await noOverflow());

  await flow('campaigns');
  await snap('02-preview-campaigns');
  check('preview: stat strip + table', await page.evaluate(() => document.body.innerText.includes('ROWS') && !!document.querySelector('.tbl')));

  await page.evaluate(() => KPI.app.runIdentify());
  await snap('03-identify-campaigns');
  check('identify: archetype + confidence', await page.evaluate(() => !!document.querySelector('.conf-num') && document.body.innerText.includes('Campaign performance data')));
  check('identify: reasoning facets', await page.evaluate(() => document.body.innerText.toLowerCase().includes('what i found') && document.body.innerText.includes('cost')));
  check('identify: column role table', await page.evaluate(() => !!document.querySelector('.tbl')));
  check('identify: no overflow', await noOverflow());

  await page.evaluate(() => KPI.app.confirmIdentify());
  await snap('04-plan-campaigns');
  check('plan: computable + not-supported sections', await page.evaluate(() => document.body.innerText.toLowerCase().includes('we can analyze') && (document.body.innerText.includes('Not supported by this data') || document.body.innerText.toLowerCase().includes('no gaps'))));

  await page.evaluate(() => KPI.app.runAll());
  await snap('05-results-campaigns');
  check('results: analysis cards', await page.evaluate(() => document.querySelectorAll('.kpi-card').length >= 5));
  check('results: proposals with cited numbers', await page.evaluate(() => document.body.innerText.toLowerCase().includes('what’s worth considering') && document.body.innerText.includes('₹')));
  check('results: data gaps section', await page.evaluate(() => document.body.innerText.toLowerCase().includes('what this data can’t tell us')));
  check('results: zero console errors', errors.length === 0, errors.join('; '));

  // beforeunload behavioral check
  const armed = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  check('beforeunload armed when data loaded', armed === true);
  await page.evaluate(() => KPI.app.clearAll());
  const disarmed = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  check('beforeunload disarmed after clear', disarmed === false);

  // honesty path
  await flow('mystery');
  await page.evaluate(() => KPI.app.runIdentify());
  await snap('06-identify-mystery');
  check('mystery: says it is not sure (honesty)', await page.evaluate(() => document.body.innerText.includes('can’t confidently say') || document.body.innerText.includes("I can't confidently say")));
  await page.evaluate(() => KPI.app.confirmIdentify());
  await page.evaluate(() => KPI.app.runAll());
  await snap('07-results-mystery');
  check('mystery: still derives analysis', await page.evaluate(() => document.querySelectorAll('.kpi-card').length >= 2));

  // generic path
  await flow('inventory');
  await page.evaluate(() => KPI.app.runIdentify());
  await snap('08-identify-inventory');
  check('inventory: generic archetype (outside the list)', await page.evaluate(() => document.body.innerText.includes('Generic business data')));
  await page.evaluate(() => KPI.app.confirmIdentify());
  await page.evaluate(() => KPI.app.runAll());
  await snap('09-results-inventory');
  check('inventory: stock analysis + restock proposal', await page.evaluate(() => document.body.innerText.includes('reorder') && document.body.innerText.includes('Restock')));

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await flow('campaigns');
  await page.evaluate(() => KPI.app.runIdentify());
  await page.evaluate(() => KPI.app.confirmIdentify());
  await page.evaluate(() => KPI.app.runAll());
  await snap('10-results-mobile');
  check('mobile: single column, no overflow', await noOverflow() && (await page.evaluate(() => getComputedStyle(document.querySelector('.kpi-grid')).gridTemplateColumns.split(' ').length)) === 1);

  console.log('\nJS errors: ' + (errors.length ? errors.join('\n') : 'none'));
  console.log(fails === 0 && errors.length === 0 ? '✅ E2E WALKTHROUGH PASSED' : '❌ ' + fails + ' FAILED');
  await browser.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
