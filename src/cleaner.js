/* cleaner.js — type coercion, null stats, de-dup, granularity sniffing per PRD §9.
   Nothing fails silently: every exclusion is counted and reported. */

globalThis.KPI = globalThis.KPI || {};
KPI.cleaner = (function () {

  // ── date parsing (PRD §9.3: ambiguity rule → DD/MM default, logged by caller) ──
  function valid(d) { return d && !isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100; }
  function mk(y, m, d) { const dt = new Date(y, m - 1, d); return valid(dt) ? dt : null; }

  function parseDateAny(s) {
    if (s == null) return null;
    if (typeof s === 'number') {
      if (s > 20000 && s < 60000) { // Excel serial
        const dt = new Date(Math.round((s - 25569) * 86400000));
        return valid(dt) ? dt : null;
      }
      return null;
    }
    let t = String(s).trim();
    if (!t || t.toLowerCase() === 'n/a' || t.toLowerCase() === 'na') return null;
    if (/^\d{5}$/.test(t)) {
      const n = parseInt(t, 10);
      if (n > 20000 && n < 60000) { const dt = new Date(Math.round((n - 25569) * 86400000)); return valid(dt) ? dt : null; }
      return null;
    }
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
    if (m) return mk(+m[1], +m[2], +m[3]);
    m = t.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/);
    if (m) {
      const mo = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
        .indexOf(m[2].toLowerCase().slice(0, 3));
      if (mo >= 0) { let y = +m[3]; if (y < 100) y += 2000; return mk(y, mo + 1, +m[1]); }
    }
    m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
    if (m) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      if (a > 12 && b <= 12) return mk(y, b, a);   // first is day → DD/MM
      if (b > 12 && a <= 12) return mk(y, a, b);   // first is month → MM/DD
      return mk(y, b, a);                           // ambiguous → DD/MM (non-US default, PRD §9.3)
    }
    return null;
  }

  // ── number parsing (₹ $ € £, % , Indian grouping, parentheses-negative) ──
  function parseNum(s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    let t = String(s).trim();
    if (!t) return null;
    const low = t.toLowerCase();
    if (low === 'n/a' || low === 'na' || low === 'null' || low === '-' || low === '') return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/[₹$€£%\s]/g, '');
    if (!/^[+-]?[\d,]*\.?\d*$/.test(t) || t === '' || t === '+' || t === '-' || t === '.') return null;
    const body = t.replace(/^[+-]/, '');
    if (/^\d{1,2},\d{2},\d{3}(\.\d+)?$/.test(body)) t = t.replace(/,/g, '');   // Indian 12,34,567
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(body)) t = t.replace(/,/g, ''); // US 1,234,567
    else if (/,\d{3}(\.\d+)?$/.test(body)) t = t.replace(/,/g, '');
    else t = t.replace(/,/g, '');
    const n = parseFloat(t);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }

  const DATE_HINT = /(date|doj|joined|join|hire|exit|termination|relieving|leave|birth|dob|month|year|day|period)/;

  // ── main ──
  function cleanTable(table) {
    const warnings = [];
    const nCols = table.columns.length;
    const nRows = table.rows.length;

    // 1. infer column types from a sample (PRD §9.3)
    const colMeta = table.columns.map((col, ci) => {
      let dateOk = 0, numOk = 0, nonEmpty = 0, seen = 0;
      const distinct = new Set();
      const sampleVals = [];
      const sampleCap = Math.min(nRows, 500);
      for (let ri = 0; ri < sampleCap; ri++) {
        const v = table.rows[ri][ci];
        if (v == null || String(v).trim() === '') continue;
        nonEmpty++;
        if (parseDateAny(v)) dateOk++;
        if (parseNum(v) !== null) numOk++;
        if (seen < 30) { sampleVals.push(String(v)); seen++; }
        if (distinct.size < 500) distinct.add(String(v));
      }
      const dateRate = nonEmpty ? dateOk / nonEmpty : 0;
      const numRate = nonEmpty ? numOk / nonEmpty : 0;
      const headerIsDate = DATE_HINT.test(col.header.toLowerCase());
      let type;
      if (headerIsDate && dateRate >= 0.5) type = 'date';
      else if (numRate >= 0.8) type = 'numeric';
      else if (dateRate >= 0.6) type = 'date';
      else type = 'string';
      // categorical vocab (status tokens)
      let vocab = null;
      if (type === 'string') {
        const tokens = new Set(sampleVals.map(v => v.toLowerCase()));
        const STATUS_TOKENS = ['terminated', 'resigned', 'left', 'exited', 'inactive', 'active'];
        const hit = Array.from(tokens).filter(t => STATUS_TOKENS.some(x => t.includes(x)));
        if (hit.length) vocab = hit.slice(0, 10);
      }
      return {
        header: col.header, index: ci, type, parseRate: type === 'date' ? dateRate : numRate,
        nonNullPct: nonEmpty / nRows, distinct: distinct.size,
        vocab, samples: sampleVals.slice(0, 5),
        rawSamples: table.rows.slice(0, 40).map(r => r[ci] == null ? '' : String(r[ci])),
        stats: null,
      };
    });

    // 1b. numeric stats for numeric columns (used by summary/outlier analyses)
    for (const meta of colMeta) {
      if (meta.type === 'numeric') {
        const vals = [];
        for (const r of table.rows) {
          const n = parseNum(r[meta.index]);
          if (n !== null) vals.push(n);
        }
        if (vals.length) {
          vals.sort((a, b) => a - b);
          const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
          const med = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
          meta.stats = { min: vals[0], max: vals[vals.length - 1], mean, median: med, n: vals.length };
        }
      }
    }

    // 2. coerce every cell
    const coerced = table.rows.map(row => {
      const v = new Array(nCols), s = row.slice();
      for (let ci = 0; ci < nCols; ci++) {
        const raw = row[ci];
        const meta = colMeta[ci];
        let cell = null;
        if (raw != null && String(raw).trim() !== '') {
          if (meta.type === 'date') { const d = parseDateAny(raw); cell = d ? { t: 'date', v: d } : null; }
          else if (meta.type === 'numeric') { const n = parseNum(raw); cell = n !== null ? { t: 'num', v: n } : null; }
          else cell = { t: 'str', v: String(raw).trim() };
        }
        v[ci] = cell;
      }
      return { v, s };
    });

    // 3. per-column parse-failure warnings
    for (const meta of colMeta) {
      if (meta.type === 'date' || meta.type === 'numeric') {
        let fail = 0;
        for (const r of table.rows) {
          const raw = r[meta.index];
          if (raw == null || String(raw).trim() === '') continue;
          const ok = meta.type === 'date' ? parseDateAny(raw) : parseNum(raw) !== null;
          if (!ok) fail++;
        }
        if (fail > 0) warnings.push({ level: 'warn', msg: fail + ' row' + (fail > 1 ? 's' : '') + " couldn't be parsed as " + meta.type + " in '" + meta.header + "' and were excluded from " + meta.type + "-based calculations." });
      }
    }

    // 4. exact-duplicate row removal (PRD §9.4 / flaw #13)
    const seenRows = new Map();
    const kept = [];
    let dupExact = 0;
    for (const r of coerced) {
      const key = r.s.join('\u0001');
      if (seenRows.has(key)) { dupExact++; continue; }
      seenRows.set(key, true);
      kept.push(r);
    }
    if (dupExact > 0) warnings.push({ level: 'info', msg: dupExact + ' exact-duplicate row' + (dupExact > 1 ? 's' : '') + ' removed before analysis.' });

    // 5. duplicate-id detection (flag, keep — may be legitimate line items)
    const idCol = colMeta.find(m => /(^|_)(id|no|code)(_|$)/.test(m.header.toLowerCase()) || /(employee|order|customer|invoice|sku|emp|staff)/.test(m.header.toLowerCase()) && m.distinct > 1);
    if (idCol) {
      const vals = new Map();
      for (const r of kept) {
        const c = r.v[idCol.index];
        if (c) { const k = String(c.v); vals.set(k, (vals.get(k) || 0) + 1); }
      }
      const dupIds = Array.from(vals.entries()).filter(([, n]) => n > 1);
      if (dupIds.length > 0) {
        const n = dupIds.reduce((a, [, c]) => a + c, 0) - dupIds.length;
        warnings.push({ level: 'info', msg: n + ' row' + (n > 1 ? 's' : '') + " share duplicate " + idCol.header + " values — kept as-is (may be legitimate line items); formulas use distinct IDs where required." });
      }
    }

    // 6. granularity sniffing (PRD §9.5)
    let dateSpan = null, granularity = 'monthly';
    const firstDate = colMeta.find(m => m.type === 'date');
    if (firstDate) {
      let min = null, max = null;
      for (const r of kept) {
        const c = r.v[firstDate.index];
        if (c && c.t === 'date') { if (!min || c.v < min) min = c.v; if (!max || c.v > max) max = c.v; }
      }
      if (min && max) {
        const days = Math.round((max - min) / 86400000);
        dateSpan = { min, max, days };
        if (days < 45) { granularity = 'weekly'; warnings.push({ level: 'info', msg: 'Date span is ' + days + ' days — using weekly periods.' }); }
        else if (days > 730) { granularity = 'quarterly'; warnings.push({ level: 'info', msg: 'Date span is ' + days + ' days (> 2 years) — using quarterly periods; you can override per KPI in a later phase.' }); }
      }
    }

    return {
      columns: colMeta,
      rows: kept,
      warnings,
      meta: {
        ...table.meta,
        rowCountAfterDedup: kept.length,
        granularity, dateSpan,
        duplicateRowsRemoved: dupExact,
      },
    };
  }

  return { cleanTable, parseDateAny, parseNum, DATE_HINT };
})();
