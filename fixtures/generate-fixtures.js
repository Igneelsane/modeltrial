#!/usr/bin/env node
/* Generates the wave-1a fixture corpus (revised brief): 7 labeled CSVs.
   Deterministic — same files every run. Run: node fixtures/generate-fixtures.js */

const fs = require('fs');
const path = require('path');

function rng(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rand = rng(19840614);
function pick(a) { return a[Math.floor(rand() * a.length)]; }
function between(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
function dstr(d) { return d.toISOString().slice(0, 10); }
function ddate(y, m, day) { return new Date(Date.UTC(y, m - 1, day)); }
const round = Math.round;

function buildCampaigns(n) {
  const CH = ['Google Ads', 'Meta Ads', 'LinkedIn', 'Email', 'Influencer'];
  const rows = [['date', 'campaign_id', 'campaign_name', 'channel', 'spend', 'impressions', 'clicks', 'conversions', 'revenue']];
  for (let i = 0; i < n; i++) {
    const spend = between(50, 400) * 1000;
    const conv = round(spend / pick([1400, 1900, 2500, 3000, 4200, 850, 7800]));
    const aov = pick([5500, 6200, 7500, 8200, 9000, 12500]);
    rows.push([dstr(ddate(2026, between(3, 8), 1)), 'CB-' + String(i + 1).padStart(2, '0'), 'Campaign ' + (i + 1), pick(CH),
      String(spend), String(round(spend / pick([60, 90, 120, 180, 240]) * 1000)), String(round(spend / 3000)),
      String(conv), String(conv * aov)]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

function buildEmail(n) {
  const rows = [['send_date', 'campaign_name', 'segment', 'recipient_email', 'emails_sent', 'opens', 'clicks', 'unsubscribes', 'bounces', 'orders', 'revenue']];
  for (let i = 0; i < n; i++) {
    const sent = between(6000, 34000);
    const opens = round(sent * (0.14 + rand() * 0.28));
    const clicks = round(opens * (0.06 + rand() * 0.12));
    const orders = round(clicks * (0.04 + rand() * 0.08));
    rows.push([dstr(ddate(2026, between(3, 8), between(1, 28))), pick(['Product Launch', 'Monthly Digest', 'Re-engagement', 'Welcome Flow']),
      pick(['Prospects', 'Customers', 'Inactive']), 'user' + i + '@example.com', String(sent), String(opens), String(clicks),
      String(round(sent * (0.0004 + rand() * 0.003))), String(round(sent * (0.008 + rand() * 0.03))),
      String(orders), String(orders * 4200)]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

function buildWeb(n) {
  const rows = [['date', 'channel', 'sessions', 'users', 'pageviews', 'goal_completions', 'revenue']];
  for (let i = 0; i < n; i++) {
    const sessions = between(800, 15000);
    const goals = round(sessions * (0.02 + rand() * 0.06));
    rows.push([dstr(ddate(2026, between(1, 8), 1)), pick(['Organic', 'Paid Search', 'Paid Social', 'Direct', 'Referral', 'Email']),
      String(sessions), String(round(sessions * 0.75)), String(round(sessions * 2.6)), String(goals), String(goals * 2400)]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

function buildSocial(n) {
  const rows = [['date', 'platform', 'post_id', 'impressions', 'reach', 'likes', 'comments', 'shares', 'link_clicks']];
  for (let i = 0; i < n; i++) {
    const imp = between(20000, 400000);
    rows.push([dstr(ddate(2026, between(6, 8), between(1, 28))), pick(['Instagram', 'LinkedIn', 'X', 'YouTube', 'Facebook']),
      'P-' + String(i).padStart(3, '0'), String(imp), String(round(imp * (0.55 + rand() * 0.3))),
      String(round(imp * (0.004 + rand() * 0.016))), String(round(imp * 0.0008)), String(round(imp * 0.0004)),
      String(round(imp * (0.001 + rand() * 0.008)))]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

function buildSales(n) {
  const rows = [['order_id', 'order_date', 'customer_id', 'region', 'product', 'qty', 'amount', 'discount']];
  for (let i = 0; i < n; i++) {
    const qty = between(1, 5);
    rows.push(['ORD-' + String(1000 + i), dstr(ddate(2026, between(2, 8), between(1, 28))), 'C' + String(between(1, 30)).padStart(2, '0'),
      pick(['North', 'South', 'East', 'West']), pick(['Laptop Pro', 'Wireless Mouse', 'Keyboard', 'Monitor', 'Hub']),
      String(qty), String(qty * pick([1299, 2499, 3499, 4999, 8999])), String(between(0, 500))]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

function buildInventory(n) {
  const rows = [['sku', 'product_name', 'category', 'warehouse', 'stock_qty', 'reorder_point', 'unit_cost', 'supplier', 'last_restock_date']];
  for (let i = 0; i < n; i++) {
    const reorder = between(40, 120);
    const stock = i % 4 === 0 ? between(5, reorder - 5) : between(reorder + 10, 300); // 1 in 4 below reorder
    rows.push(['SKU-' + (100 + i), 'Item ' + (i + 1), pick(['A', 'B', 'C']), pick(['Delhi', 'Mumbai', 'Bengaluru']),
      String(stock), String(reorder), String(between(400, 12000)), pick(['Acme', 'Traders', 'ImportZone']),
      dstr(ddate(2026, between(1, 7), between(1, 28)))]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

function buildMystery(n) {
  const rows = [['campaign', 'date', 'region', 'value', 'feedback_score', 'notes']];
  for (let i = 0; i < n; i++) {
    rows.push(['C' + between(1, 6), dstr(ddate(2026, between(3, 8), 1)), pick(['North', 'South', 'East', 'West']),
      String(between(40, 120)), String(between(1, 5)), pick(['follow up', 'renewal', 'new lead'])]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

const fixtures = [
  { name: 'campaign_clean.csv', csv: buildCampaigns(42), expect: 'campaign', label: 'Campaign performance' },
  { name: 'email_clean.csv', csv: buildEmail(24), expect: 'crm_email', label: 'Email / CRM engagement' },
  { name: 'web_clean.csv', csv: buildWeb(48), expect: 'web_funnel', label: 'Web & funnel analytics' },
  { name: 'social_clean.csv', csv: buildSocial(60), expect: 'social', label: 'Social media performance' },
  { name: 'sales_clean.csv', csv: buildSales(80), expect: 'sales_revenue', label: 'Sales / revenue' },
  { name: 'inventory_generic.csv', csv: buildInventory(14), expect: 'other', label: 'Generic (outside the list)' },
  { name: 'mystery_lowconf.csv', csv: buildMystery(24), expect: 'unclear', label: 'Ambiguous — low confidence' },
];

const dir = path.join(__dirname, '..', 'fixtures');
fs.mkdirSync(dir, { recursive: true });
for (const f of fixtures) {
  fs.writeFileSync(path.join(dir, f.name), f.csv);
  fs.writeFileSync(path.join(dir, f.name.replace('.csv', '.json')), JSON.stringify({ expect: f.expect, label: f.label }));
  console.log('wrote fixtures/' + f.name + '  [' + f.label + ']');
}
console.log('\n7 fixtures generated.');
