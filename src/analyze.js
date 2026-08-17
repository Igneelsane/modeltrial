/* analyze.js — derives the analysis plan from the role profile (revised brief).
   No fixed menu: trends appear only if a time column exists, breakdowns only if a
   dimension exists, efficiency only if cost+outcome exist, etc. Every computed
   result carries an insight that cites the actual numbers behind it. */

globalThis.KPI = globalThis.KPI || {};
KPI.analyze = (function () {

  const MS_DAY = 86400000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ── time helpers ── */
  function granFor(rows, dateCol) {
    let min = null, max = null;
    for (const r of rows) { const c = r.v[dateCol]; if (c && c.t === 'date') { if (!min || c.v < min) min = c.v; if (!max || c.v > max) max = c.v; } }
    if (!min || !max) return 'monthly';
    const days = Math.round((max - min) / MS_DAY);
    return days < 45 ? 'weekly' : days > 730 ? 'quarterly' : 'monthly';
  }
  function periodKey(d, g) {
    if (g === 'monthly') return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (g === 'quarterly') return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
    if (g === 'annual') return String(d.getFullYear());
    const day = (d.getDay() + 6) % 7;
    const t = new Date(d); t.setDate(d.getDate() - day);
    const iso = new Date(t); iso.setDate(iso.getDate() - 3);
    const w = Math.round(((t - new Date(iso.getFullYear(), 0, 4)) / MS_DAY + (new Date(iso.getFullYear(), 0, 4).getDay() + 6) % 7 - 3) / 7);
    return iso.getFullYear() + '-W' + String(w).padStart(2, '0');
  }
  function periodLabel(key, g) {
    if (g === 'monthly') { const [y, m] = key.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; }
    if (g === 'quarterly') { const [y, q] = key.split('-Q').map(Number); return 'Q' + q + ' ' + y; }
    if (g === 'annual') return key;
    return key.replace('-W', ' · W');
  }
  function periodStart(key, g) {
    if (g === 'monthly') { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1); }
    if (g === 'quarterly') { const [y, q] = key.split('-Q').map(Number); return new Date(y, (q - 1) * 3, 1); }
    if (g === 'annual') return new Date(+key, 0, 1);
    const [y, w] = key.split('-W').map(Number);
    const jan4 = new Date(y, 0, 4);
    const mon = new Date(jan4); mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7);
    return mon;
  }
  function buckets(rows, dateCol, g) {
    const map = new Map();
    for (const r of rows) {
      const c = r.v[dateCol]; if (!c || c.t !== 'date') continue;
      const key = periodKey(c.v, g);
      if (!map.has(key)) map.set(key, { key, label: periodLabel(key, g), start: periodStart(key, g), rows: [] });
      map.get(key).rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.start - b.start);
  }

  const num = (r, i) => r.v[i] && r.v[i].t === 'num' ? r.v[i].v : null;
  const str = (r, i) => r.v[i] && r.v[i].t === 'str' ? String(r.v[i].v) : null;
  const dt = (r, i) => r.v[i] && r.v[i].t === 'date' ? r.v[i].v : null;

  function sumOf(rows, ci) { let s = 0; for (const r of rows) { const v = num(r, ci); if (v !== null) s += v; } return s; }
  function hdr(cols, i) { return cols[i] ? cols[i].header : '?'; }
  function titleize(h) { return h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

  function fmt(v, unit) {
    if (v == null) return '—';
    if (unit === 'currency') return '₹' + Math.round(v).toLocaleString('en-IN');
    if (unit === 'percent') return v.toFixed(1) + '%';
    if (unit === 'ratio') return '×' + v.toFixed(1);
    return Math.round(v).toLocaleString('en-IN');
  }

  function flagsFor(cleaned, extra) {
    const f = [];
    if (cleaned.rows.length < 30) f.push('directional only — sample of ' + cleaned.rows.length + ' rows is small');
    return f.concat(extra || []);
  }

  /* ── analysis builders ── */
  function trendItem(col, timeCol, cleaned) {
    return {
      id: 'trend_' + col.index, title: titleize(col.header) + ' over time', kind: 'trend',
      cols: { metric: col.header, time: hdr(cleaned.columns, timeCol) },
      unit: col.unit, computable: true,
      compute() {
        const rows = cleaned.rows.filter(r => dt(r, timeCol) && num(r, col.index) !== null);
        const g = granFor(rows, timeCol);
        const periods = buckets(rows, timeCol, g).map(b => ({ period: b.label, value: sumOf(b.rows, col.index), n: b.rows.length }));
        const last = periods[periods.length - 1], prev = periods[periods.length - 2];
        const pct = prev && prev.value !== 0 ? (last.value - prev.value) / Math.abs(prev.value) * 100 : null;
        const direction = pct == null ? 'flat' : Math.abs(pct) < 5 ? 'flat' : pct > 0 ? 'up' : 'down';
        let insight = col.header + ': ' + fmt(last.value, col.unit) + ' in ' + last.period;
        if (prev) insight += ' — ' + (pct >= 0 ? 'up' : 'down') + ' ' + Math.abs(pct).toFixed(0) + '% vs ' + prev.period + ' (' + fmt(prev.value, col.unit) + ')';
        else insight += ' (first period)';
        if (periods.length >= 3) insight += '. Trend over ' + periods.length + ' periods: ' + (direction === 'flat' ? 'broadly flat' : direction === 'up' ? 'rising' : 'falling') + '.';
        else insight += '. Only ' + periods.length + ' period' + (periods.length === 1 ? '' : 's') + ' — no trend claimed.';
        return { kind: 'trend', periods, value: last.value, unit: col.unit, insight, direction, formula: 'Σ ' + col.header + ' per ' + g + ' period', columns: { metric: col.header, time: hdr(cleaned.columns, timeCol) }, flags: flagsFor(cleaned), confidence: periods.length >= 3 ? 'high' : 'directional' };
      },
    };
  }

  function breakdownItem(dim, metric, cleaned) {
    const primary = metric.sub === 'rate' || metric.sub === 'score' ? 'mean' : 'sum';
    return {
      id: 'breakdown_' + dim.index + '_' + metric.index, title: titleize(metric.header) + ' by ' + dim.header, kind: 'breakdown',
      cols: { dimension: dim.header, metric: metric.header },
      unit: metric.unit, computable: true,
      compute() {
        const groups = new Map();
        for (const r of cleaned.rows) {
          const d = str(r, dim.index); if (d == null) continue;
          const v = num(r, metric.index); if (v === null) continue;
          if (!groups.has(d)) groups.set(d, { sum: 0, n: 0 });
          const g = groups.get(d); g.sum += v; g.n++;
        }
        const total = Array.from(groups.values()).reduce((a, g) => a + g.sum, 0);
        const rows = Array.from(groups.entries()).map(([name, g]) => ({
          name, value: primary === 'mean' ? g.sum / g.n : g.sum, n: g.n, share: total ? g.sum / total * 100 : 0,
        })).sort((a, b) => b.value - a.value);
        const top = rows[0];
        const topN = rows.slice(0, 8);
        const rest = rows.slice(8);
        const table = {
          cols: [dim.header, titleize(metric.header) + (primary === 'mean' ? ' (avg)' : ''), 'Share'],
          rows: topN.map(r => [r.name, fmt(r.value, metric.unit), r.share.toFixed(1) + '%'])
            .concat(rest.length ? [[rest.length + ' others', fmt(rest.reduce((a, r) => a + r.value, 0), metric.unit), rest.reduce((a, r) => a + r.share, 0).toFixed(1) + '%']] : []),
        };
        let insight = top ? top.name + ' leads: ' + top.share.toFixed(0) + '% of ' + colLower(metric.header) + ' (' + fmt(top.value, metric.unit) + (primary === 'mean' ? ' avg' : '') + ')' : 'no data';
        if (rows.length > 1) insight += '; ' + rows[1].name + ' follows at ' + rows[1].share.toFixed(0) + '%.';
        if (rows.length > 30) insight += ' ' + rows.length + ' distinct ' + dim.header + ' values — showing the top 8.';
        return { kind: 'breakdown', table, top: top ? top.name : null, topShare: top ? top.share : null, unit: metric.unit, insight, formula: primary === 'sum' ? 'Σ ' + metric.header + ' grouped by ' + dim.header : 'mean of ' + metric.header + ' grouped by ' + dim.header, columns: { dimension: dim.header, metric: metric.header }, flags: flagsFor(cleaned), confidence: 'high' };
      },
    };
  }

  function colLower(h) { return h.toLowerCase(); }

  function efficiencyItem(cost, outcome, dims, cleaned, kind) {
    const isRoas = kind === 'roas';
    const channelDim = dims.find(d => d.identity === 'channel') || dims.find(d => d.identity === 'campaign');
    return {
      id: kind + '_' + cost.index + '_' + outcome.index,
      title: isRoas ? 'Return on ad spend (revenue ÷ spend)' : 'Cost per ' + colLower(outcome.header) + ' (spend ÷ ' + colLower(outcome.header) + ')',
      kind: 'ratio',
      cols: isRoas ? { revenue: cost.header, spend: outcome.header } : { cost: cost.header, outcome: outcome.header },
      unit: isRoas ? 'ratio' : 'currency', computable: true,
      compute() {
        const spend = sumOf(cleaned.rows, cost.index);
        const out = sumOf(cleaned.rows, outcome.index);
        let insight, value, table = null, formula;
        let rows = [];
        if (isRoas) {
          value = spend ? out / spend : null;
          formula = 'Σ ' + outcome.header + ' ÷ Σ ' + cost.header;
          insight = 'Every ₹1 spent returned ' + fmt(value, 'ratio') + ' in ' + outcome.header + (outcome.header === 'revenue' ? '' : ' — note: using ' + outcome.header + ' as the return figure') + ' (₹' + Math.round(out).toLocaleString('en-IN') + ' returned on ₹' + Math.round(spend).toLocaleString('en-IN') + ' spent).';
        } else {
          value = out ? spend / out : null;
          formula = 'Σ ' + cost.header + ' ÷ Σ ' + outcome.header;
          insight = 'Each ' + colLower(outcome.header) + ' cost ' + fmt(value, 'currency') + ' on average (' + fmt(out, 'count') + ' ' + outcome.header + ' from ' + fmt(spend, 'currency') + ' spend).';
        }
        if (channelDim) {
          const groups = new Map();
          for (const r of cleaned.rows) {
            const d = str(r, channelDim.index); if (d == null) continue;
            const s = num(r, cost.index), o = num(r, outcome.index);
            if (s === null || o === null) continue;
            if (!groups.has(d)) groups.set(d, { spend: 0, out: 0 });
            const g = groups.get(d); g.spend += s; g.out += o;
          }
          rows = Array.from(groups.entries()).map(([name, g]) => ({
            name, spend: g.spend, out: g.out, ratio: g.out ? g.spend / g.out : null, share: spend ? g.spend / spend * 100 : 0,
          })).sort((a, b) => (isRoas ? (b.out / Math.max(1, b.spend)) : (b.ratio ?? 1e18)) - (isRoas ? (a.out / Math.max(1, a.spend)) : (a.ratio ?? 1e18)));
          table = {
            cols: [channelDim.header, 'Spend', colLower(outcome.header), isRoas ? 'ROAS' : 'Cost per ' + colLower(outcome.header).replace(/s$/, '')],
            rows: rows.map(r => [r.name, fmt(r.spend, 'currency'), fmt(r.out, 'count'), isRoas ? fmt(r.out / Math.max(1, r.spend), 'ratio') : fmt(r.ratio, 'currency')]),
          };
          const best = rows[0];
          if (best && isRoas) insight += ' Best channel: ' + best.name + ' at ' + fmt(best.out / Math.max(1, best.spend), 'ratio') + '.';
          if (best && !isRoas) insight += ' Best channel: ' + best.name + ' at ' + fmt(best.ratio, 'currency') + ' per ' + colLower(outcome.header).replace(/s$/, '') + '.';
        }
        return { kind: 'ratio', value, unit: this.unit, insight, formula, columns: this.cols, table, rawRows: rows, flags: flagsFor(cleaned), confidence: cleaned.rows.length < 30 ? 'directional' : 'high' };
      },
    };
  }

  function rateItem(vol, out, timeCol, cleaned, kind) {
    const label = kind === 'conversion' ? 'conversion rate' : kind === 'bounce' ? 'bounce rate' : kind === 'unsub' ? 'unsubscribe rate' : 'engagement rate';
    return {
      id: 'rate_' + kind + '_' + vol.index + '_' + out.index, title: titleize(label) + ' (' + out.header + ' ÷ ' + vol.header + ')', kind: 'rate',
      cols: { volume: vol.header, outcome: out.header },
      unit: 'percent', computable: true,
      compute() {
        const vTotal = sumOf(cleaned.rows, vol.index), oTotal = sumOf(cleaned.rows, out.index);
        const overall = vTotal ? oTotal / vTotal * 100 : null;
        let insight = label + ': ' + fmt(overall, 'percent') + ' (' + fmt(oTotal, 'count') + ' ' + out.header + ' across ' + fmt(vTotal, 'count') + ' ' + vol.header + ')';
        let table = null;
        if (timeCol) {
          const rows = cleaned.rows.filter(r => dt(r, timeCol));
          const g = granFor(rows, timeCol);
          const periods = buckets(rows, timeCol, g).map(b => {
            const v = sumOf(b.rows, vol.index), o = sumOf(b.rows, out.index);
            return { period: b.label, rate: v ? o / v * 100 : null, n: o };
          });
          table = { cols: ['Period', label, out.header], rows: periods.map(p => [p.period, fmt(p.rate, 'percent'), fmt(p.n, 'count')]) };
          if (periods.length >= 3) {
            const best = periods.reduce((a, p) => (p.rate != null && p.rate > (a.rate ?? -1)) ? p : a, { rate: -1 });
            insight += '. Peaked at ' + fmt(best.rate, 'percent') + ' in ' + best.period + '.';
          }
        }
        return { kind: 'rate', value: overall, unit: 'percent', insight, formula: 'Σ ' + out.header + ' ÷ Σ ' + vol.header + ' × 100', columns: this.cols, table, flags: flagsFor(cleaned), confidence: 'high' };
      },
    };
  }

  function stockItem(stockCol, reorderCol, cleaned) {
    return {
      id: 'stock_gaps', title: 'Stock vs reorder points', kind: 'stock',
      cols: { stock: stockCol.header, reorder: reorderCol.header },
      unit: 'count', computable: true,
      compute() {
        const gaps = [];
        for (const r of cleaned.rows) {
          const s = num(r, stockCol.index), rp = num(r, reorderCol.index);
          if (s === null || rp === null) continue;
          if (s < rp) gaps.push({ sku: str(r, 0) || 'row', stock: s, reorder: rp, short: rp - s });
        }
        const total = cleaned.rows.length;
        const table = { cols: [cleaned.columns[0] ? cleaned.columns[0].header : 'Item', 'Stock', 'Reorder point', 'Shortfall'], rows: gaps.slice(0, 10).map(g => [g.sku, String(g.stock), String(g.reorder), String(g.short)]) };
        let insight = gaps.length
          ? gaps.length + ' of ' + total + ' items are below their reorder point' + (gaps[0] ? ' — e.g. ' + gaps[0].sku + ' (stock ' + gaps[0].stock + ' vs reorder ' + gaps[0].reorder + ')' : '') + '.'
          : 'All ' + total + ' items are at or above their reorder points.';
        return { kind: 'stock', table, value: gaps.length, unit: 'count', insight, formula: 'stock_qty < reorder_point per item', columns: this.cols, flags: flagsFor(cleaned), confidence: gaps.length ? 'high' : 'directional' };
      },
    };
  }

  function countsItem(idCol, timeCol, cleaned) {
    return {
      id: 'counts_' + idCol.index, title: 'Distinct ' + (idCol.identity === 'identifier' ? idCol.header : idCol.identity + 's') + ' per period', kind: 'counts',
      cols: { id: idCol.header, time: hdr(cleaned.columns, timeCol) },
      unit: 'count', computable: true,
      compute() {
        const rows = cleaned.rows.filter(r => dt(r, timeCol));
        const g = granFor(rows, timeCol);
        const periods = buckets(rows, timeCol, g).map(b => {
          const set = new Set();
          for (const r of b.rows) { const v = str(r, idCol.index); if (v != null) set.add(v); }
          return { period: b.label, value: set.size, n: b.rows.length };
        });
        const last = periods[periods.length - 1], prev = periods[periods.length - 2];
        const pct = prev && prev.value ? (last.value - prev.value) / prev.value * 100 : null;
        let insight = 'Distinct ' + (idCol.identity === 'identifier' ? idCol.header : idCol.identity + 's') + ': ' + last.value + ' in ' + last.period;
        if (pct != null) insight += ' — ' + (pct >= 0 ? 'up' : 'down') + ' ' + Math.abs(pct).toFixed(0) + '% vs ' + prev.period + ' (' + prev.value + ')';
        return { kind: 'counts', periods, value: last.value, unit: 'count', insight, formula: 'distinct count of ' + idCol.header + ' per ' + g + ' period', columns: this.cols, flags: flagsFor(cleaned), confidence: periods.length >= 3 ? 'high' : 'directional' };
      },
    };
  }

  function summaryItem(col, dim, timeCol, cleaned) {
    return {
      id: 'summary_' + col.index, title: titleize(col.header) + ' — distribution', kind: 'summary',
      cols: { metric: col.header },
      unit: col.unit, computable: true,
      compute() {
        const st = col.stats;
        if (!st) return null;
        // extremes with context (dimension value + period label of the extreme rows)
        let maxRow = null, minRow = null;
        for (const r of cleaned.rows) {
          const v = num(r, col.index); if (v === null) continue;
          if (!maxRow || v > num(maxRow, col.index)) maxRow = r;
          if (!minRow || v < num(minRow, col.index)) minRow = r;
        }
        const ctx = r => {
          const parts = [];
          if (dim) { const d = str(r, dim.index); if (d != null) parts.push(d); }
          if (timeCol) { const t = dt(r, timeCol); if (t) parts.push(t.toISOString().slice(0, 7)); }
          return parts.join(', ') || 'row';
        };
        const table = { cols: ['Stat', col.header], rows: [['Min', fmt(st.min, col.unit)], ['Max', fmt(st.max, col.unit)], ['Mean', fmt(st.mean, col.unit)], ['Median', fmt(st.median, col.unit)], ['Non-null rows', String(st.n)]] };
        const insight = col.header + ' ranges ' + fmt(st.min, col.unit) + '–' + fmt(st.max, col.unit) + ', mean ' + fmt(st.mean, col.unit) + ', median ' + fmt(st.median, col.unit) +
          (maxRow ? '. Highest: ' + fmt(num(maxRow, col.index), col.unit) + ' (' + ctx(maxRow) + ')' : '') +
          (minRow ? '; lowest: ' + fmt(num(minRow, col.index), col.unit) + ' (' + ctx(minRow) + ')' : '');
        return { kind: 'summary', table, value: st.mean, unit: col.unit, insight, formula: 'min / max / mean / median of ' + col.header, columns: this.cols, flags: flagsFor(cleaned), confidence: st.n >= 30 ? 'high' : 'directional' };
      },
    };
  }

  /* ── plan derivation (the heart: purely from the role profile) ── */
  function buildPlan(cleaned, roles) {
    const S = roles.summary, M = S.metrics;
    const items = [];
    const time = S.time[0] || null;
    const dims = S.dimensions;
    const allMetrics = [].concat(M.cost, M.revenue, M.volume, M.outcome, M.engagement, M.rate, M.plain, M.stock, M.reorder);
    const seen = new Set();
    const metrics = allMetrics.filter(m => (seen.has(m.index) ? false : (seen.add(m.index), true)));

    // 1. trends — only if a time column exists
    if (time && metrics.length) metrics.forEach(m => items.push(trendItem(m, time.index, cleaned)));
    else if (metrics.length) items.push({ id: 'trends', title: 'Trends over time', kind: 'trend', computable: false, why_not: 'No date column found — trends need a time dimension. Add a date column to unlock this.' });

    // 2. breakdowns — only if a dimension exists; primary metric per dimension
    for (const dim of dims) {
      const primary = M.outcome[0] || M.revenue[0] || M.volume[0] || M.engagement[0] || M.rate[0] || M.plain[0];
      if (primary) items.push(breakdownItem(dim, primary, cleaned));
    }
    if (!dims.length && metrics.length) items.push({ id: 'breakdowns', title: 'Breakdown by category', kind: 'breakdown', computable: false, why_not: 'No categorical dimension column found (e.g. channel, region, product) — add one to unlock segmentation analysis.' });

    // 3. efficiency — only if cost + outcome/revenue exist
    if (M.cost.length && M.outcome.length) items.push(efficiencyItem(M.cost[0], M.outcome[0], dims, cleaned, 'cpo'));
    else if (M.cost.length && !M.outcome.length) items.push({ id: 'cpo', title: 'Cost per outcome', kind: 'ratio', computable: false, why_not: 'Spend data exists (' + M.cost[0].header + ') but no outcome column (conversions, orders, …) — add one to unlock efficiency analysis.' });
    else if (!M.cost.length) items.push({ id: 'cpo', title: 'Cost per outcome', kind: 'ratio', computable: false, why_not: 'No cost/spend column found — efficiency (cost per outcome) cannot be computed.' });
    if (M.cost.length && M.revenue.length) items.push(efficiencyItem(M.cost[0], M.revenue[0], dims, cleaned, 'roas'));
    else if (M.cost.length && !M.revenue.length) items.push({ id: 'roas', title: 'Return on ad spend', kind: 'ratio', computable: false, why_not: 'Spend data exists but no revenue column — ROAS cannot be computed.' });

    // 4. rates — only if volume + outcome exist
    if (M.volume.length && M.outcome.length) {
      const out = M.outcome.find(m => !m.negative) || M.outcome[0];
      items.push(rateItem(M.volume[0], out, time ? time.index : null, cleaned, 'conversion'));
    }
    const negOuts = M.outcome.filter(m => m.negative);
    if (negOuts.length && M.volume.length) {
      for (const neg of negOuts) {
        const kind = /unsub/.test(neg.header) ? 'unsub' : 'bounce';
        items.push(rateItem(M.volume[0], neg, time ? time.index : null, cleaned, kind));
      }
    }
    // engagement rate — social data
    if (M.engagement.length && M.volume.length) items.push(rateItem(M.volume[0], M.engagement[0], time ? time.index : null, cleaned, 'engagement'));

    // 5. stock gaps — only if stock + reorder columns exist
    if (M.stock.length && M.reorder.length) items.push(stockItem(M.stock[0], M.reorder[0], cleaned));

    // 6. distinct counts — only if id + time exist
    if (time && S.ids.length) S.ids.forEach(idCol => items.push(countsItem(idCol, time.index, cleaned)));

    // 7. distribution summary for every metric
    metrics.forEach(m => items.push(summaryItem(m, dims[0] || null, time ? time.index : null, cleaned)));

    return items;
  }

  return { buildPlan, fmt, granFor, buckets };
})();
