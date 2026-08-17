/* Embedded sample datasets (deterministic — same output every load, zero network).
   Marketing-focused per the revised brief: campaign, email/CRM, web/funnel, social,
   sales/revenue, generic (inventory) and an intentionally ambiguous file. */

globalThis.KPI = globalThis.KPI || {};
(function () {
  function rng(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const rand = rng(20260810);
  function pick(a) { return a[Math.floor(rand() * a.length)]; }
  function between(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
  function dstr(d) { return d.toISOString().slice(0, 10); }
  function ddate(y, m, day) { return new Date(Date.UTC(y, m - 1, day)); }
  function round(v) { return Math.round(v); }

  // ── 1. Campaign performance (42 rows: 7 campaigns × Mar–Aug 2026) ──
  function buildCampaigns() {
    const CAMPS = [
      { name: 'Brand Search', channel: 'Google Ads', spend: [18, 22, 20, 19, 23, 25], cpc: 1400, aov: 8200, cpm: 120, ctr: 0.040 },
      { name: 'Non-Brand Search', channel: 'Google Ads', spend: [24, 28, 26, 27, 30, 33], cpc: 1900, aov: 7500, cpm: 125, ctr: 0.028 },
      { name: 'Meta Retargeting', channel: 'Meta Ads', spend: [15, 17, 18, 16, 20, 21], cpc: 2500, aov: 6200, cpm: 90, ctr: 0.018 },
      { name: 'Meta Prospecting', channel: 'Meta Ads', spend: [26, 29, 30, 28, 31, 34], cpc: 3000, aov: 6000, cpm: 95, ctr: 0.016 },
      { name: 'LinkedIn ABM', channel: 'LinkedIn', spend: [9, 11, 12, 10, 14, 15], cpc: 4200, aov: 12500, cpm: 180, ctr: 0.009 },
      { name: 'Email Newsletter', channel: 'Email', spend: [2.5, 3, 3.2, 3, 3.5, 4], cpc: 850, aov: 5500, cpm: 60, ctr: 0.055 },
      { name: 'Creator Collabs', channel: 'Influencer', spend: [8, 9, 10, 9, 11, 12], cpc: 7800, aov: 9000, cpm: 240, ctr: 0.011 },
    ];
    const rows = [['date', 'campaign_id', 'campaign_name', 'channel', 'spend', 'impressions', 'clicks', 'conversions', 'revenue']];
    let cid = 1;
    for (const c of CAMPS) {
      for (let m = 3; m <= 8; m++) {
        const spend = c.spend[m - 3] * 10000;
        let conv = round(spend / c.cpc);
        if (m === 6) conv = round(conv * 0.68);          // June dip
        if (m >= 7) conv = round(conv * 1.08);           // recovery
        const impressions = round(spend / c.cpm * 1000);
        const clicks = round(impressions * c.ctr);
        rows.push([dstr(ddate(2026, m, 1)), 'CB-' + String(cid).padStart(2, '0'), c.name, c.channel,
          String(spend), String(impressions), String(clicks), String(conv), String(conv * c.aov)]);
        cid++;
      }
    }
    rows.push(rows[3].slice());
    return rows.map(r => r.join(',')).join('\n');
  }

  // ── 2. Email / CRM engagement (24 rows: 4 sends/mo × Mar–Aug 2026) ──
  function buildEmail() {
    const combos = [
      { campaign: 'Product Launch', segment: 'Customers', sent: 28000, open: 0.30 },
      { campaign: 'Monthly Digest', segment: 'Prospects', sent: 34000, open: 0.22 },
      { campaign: 'Re-engagement', segment: 'Inactive', sent: 12000, open: 0.16 },
      { campaign: 'Welcome Flow', segment: 'New', sent: 8000, open: 0.42 },
    ];
    const rows = [['send_date', 'campaign_name', 'segment', 'recipient_email', 'emails_sent', 'opens', 'clicks', 'unsubscribes', 'bounces', 'orders', 'revenue']];
    for (let m = 3; m <= 8; m++) {
      for (let cIdx = 0; cIdx < combos.length; cIdx++) {
        const c = combos[cIdx];
        const sent = round(c.sent * (0.85 + rand() * 0.3));
        const opens = round(sent * c.open * (0.9 + rand() * 0.2));
        const clicks = round(opens * (0.08 + rand() * 0.10));
        const unsub = round(sent * (0.0004 + rand() * 0.003));
        const bounce = round(sent * (0.008 + rand() * 0.03));
        const orders = round(clicks * (0.05 + rand() * 0.07));
        const bump = m === 6 ? 0.8 : 1;
        rows.push([dstr(ddate(2026, m, 10)), c.campaign, c.segment, 'u' + (m * 10 + cIdx) + '@example.com', String(sent), String(opens), String(clicks),
          String(unsub), String(bounce), String(round(orders * bump)), String(round(orders * bump * 4200))]);
      }
    }
    rows.push(rows[4].slice());
    return rows.map(r => r.join(',')).join('\n');
  }

  // ── 3. Web & funnel analytics (48 rows: 6 channels × Jan–Aug 2026) ──
  function buildWeb() {
    const CH = [
      { name: 'Organic', s: 10000, goal: 0.055 },
      { name: 'Paid Search', s: 7000, goal: 0.075 },
      { name: 'Paid Social', s: 3000, goal: 0.020 },
      { name: 'Direct', s: 4500, goal: 0.040 },
      { name: 'Referral', s: 2000, goal: 0.035 },
      { name: 'Email', s: 1500, goal: 0.050 },
    ];
    const rows = [['date', 'channel', 'sessions', 'users', 'pageviews', 'goal_completions', 'revenue']];
    for (let m = 1; m <= 8; m++) {
      for (const c of CH) {
        const sessions = round(c.s * (0.85 + rand() * 0.3));
        const goals = round(sessions * c.goal * (0.85 + rand() * 0.3));
        rows.push([dstr(ddate(2026, m, 1)), c.name, String(sessions), String(round(sessions * 0.75)),
          String(round(sessions * 2.6)), String(goals), String(goals * 2400)]);
      }
    }
    rows.push(rows[5].slice());
    return rows.map(r => r.join(',')).join('\n');
  }

  // ── 4. Social media performance (60 rows: 5 platforms × 12 weeks) ──
  function buildSocial() {
    const P = [
      { name: 'Instagram', imp: 250000, like: 0.012, com: 0.0008, sha: 0.0005, clk: 0.004 },
      { name: 'LinkedIn', imp: 60000, like: 0.009, com: 0.0012, sha: 0.0006, clk: 0.008 },
      { name: 'X', imp: 120000, like: 0.008, com: 0.0004, sha: 0.0007, clk: 0.006 },
      { name: 'YouTube', imp: 180000, like: 0.011, com: 0.0009, sha: 0.0002, clk: 0.003 },
      { name: 'Facebook', imp: 90000, like: 0.010, com: 0.0006, sha: 0.0004, clk: 0.005 },
    ];
    const rows = [['date', 'platform', 'post_id', 'impressions', 'reach', 'likes', 'comments', 'shares', 'link_clicks']];
    let pid = 1;
    for (let w = 0; w < 12; w++) {
      const d = new Date(Date.UTC(2026, 5, 1 + w * 7));
      for (const p of P) {
        const imp = round(p.imp * (0.7 + rand() * 0.6));
        const reach = round(imp * (0.55 + rand() * 0.3));
        rows.push([dstr(d), p.name, 'P-' + String(pid).padStart(3, '0'), String(imp), String(reach),
          String(round(imp * p.like * (0.7 + rand() * 0.6))), String(round(imp * p.com)),
          String(round(imp * p.sha)), String(round(imp * p.clk))]);
        pid++;
      }
    }
    rows.push(rows[2].slice());
    return rows.map(r => r.join(',')).join('\n');
  }

  // ── 5. Sales / revenue orders (89 rows) ──
  function buildSales() {
    const rows = [['order_id', 'order_date', 'customer_id', 'region', 'product', 'qty', 'amount', 'discount']];
    const PROD = ['Laptop Pro', 'Wireless Mouse', 'Mechanical Keyboard', '4K Monitor', 'USB-C Hub', 'Desk Stand'];
    const REGIONS = ['North', 'South', 'East', 'West'];
    let oid = 1001;
    for (let m = 2; m <= 8; m++) {
      const n = m === 2 ? 9 : 13;
      for (let k = 0; k < n; k++) {
        const qty = between(1, 5);
        const amt = qty * pick([4999, 1299, 3499, 8999, 2499, 1799]);
        const disc = m % 3 === 0 ? Math.round(amt * rand() * 0.1) : 0;
        rows.push([String(oid++), dstr(ddate(2026, m, between(1, 28))), 'C' + String(between(1, 30)).padStart(2, '0'),
          pick(REGIONS), pick(PROD), String(qty), String(amt), String(disc)]);
      }
    }
    rows.push(rows[2].slice());
    return rows.map(r => r.join(',')).join('\n');
  }

  // ── 6. Inventory (generic — deliberately outside the marketing list) ──
  function buildInventory() {
    const rows = [['sku', 'product_name', 'category', 'warehouse', 'stock_qty', 'reorder_point', 'unit_cost', 'supplier', 'last_restock_date']];
    const CATS = ['Displays', 'Input', 'Audio', 'Accessories'];
    const WH = ['Delhi', 'Mumbai', 'Bengaluru'];
    const SUP = ['Acme Supply', 'Traders United', 'ImportZone', 'Prime Distributors'];
    const PROD = ['27in Monitor', 'Wireless Keyboard', 'Noise-cancel Headset', 'Docking Station', 'Webcam HD', 'USB Mic', 'Laptop Stand', 'HDMI Cable', 'Bluetooth Speaker', 'Desk Lamp', 'Mousepad XL', '4K Webcam', 'USB Hub', 'Ergo Chair'];
    for (let i = 0; i < 14; i++) {
      const reorder = between(40, 120);
      const stock = [12, 25, 8, 60][i % 4] || between(50, 300); // 4 SKUs below reorder point
      rows.push(['SKU-' + String(100 + i), PROD[i], CATS[i % 4], WH[i % 3], String(stock), String(reorder),
        String(pick([400, 900, 1500, 3200, 5500, 8000, 12000])), SUP[i % 4], dstr(ddate(2026, between(1, 7), between(1, 28)))]);
    }
    return rows.map(r => r.join(',')).join('\n');
  }

  // ── 7. Ambiguous (honesty demo — thin, mixed signals) ──
  function buildMystery() {
    const rows = [['campaign', 'date', 'region', 'value', 'feedback_score', 'notes']];
    for (let m = 3; m <= 8; m++) {
      for (const c of ['C1', 'C2', 'C3', 'C4']) {
        rows.push([c, dstr(ddate(2026, m, 1)), pick(['North', 'South', 'East', 'West']),
          String(between(40, 120)), String(between(1, 5)), pick(['follow up', 'renewal', 'new lead', 'upsell'])]);
      }
    }
    return rows.map(r => r.join(',')).join('\n');
  }

  KPI.samples = {
    campaigns: { name: 'Campaign performance — campaigns.csv', csv: buildCampaigns(), note: '42 rows · 7 campaigns × Mar–Aug 2026 · spend, impressions, clicks, conversions, revenue · 1 duplicate row (intentional)' },
    email: { name: 'Email / CRM — email_blast.csv', csv: buildEmail(), note: '24 rows · 4 sends/month × Mar–Aug 2026 · opens, clicks, unsubscribes, bounces, orders · 1 duplicate row' },
    web: { name: 'Web & funnel — web_analytics.csv', csv: buildWeb(), note: '48 rows · 6 channels × Jan–Aug 2026 · sessions, users, pageviews, goal completions · 1 duplicate row' },
    social: { name: 'Social — social.csv', csv: buildSocial(), note: '60 rows · 5 platforms × 12 weeks · impressions, reach, likes, comments, shares, link clicks · 1 duplicate row' },
    sales: { name: 'Sales — orders.csv', csv: buildSales(), note: '89 orders · Feb–Aug 2026 · qty, amount, discount · 1 duplicate row' },
    inventory: { name: 'Inventory — stock.csv', csv: buildInventory(), note: '14 SKUs · stock vs reorder points · deliberately NOT marketing data (tests the “outside the list” path)' },
    mystery: { name: 'Ambiguous — mystery.csv', csv: buildMystery(), note: '24 rows · thin mixed signals on purpose (tests the “I’m not sure” path)' },
  };
})();
