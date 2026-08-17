/* exporter.js — client-side CSV export (PRD §10.5). */

globalThis.KPI = globalThis.KPI || {};
KPI.exporter = (function () {
  function esc(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv(results, cleaned) {
    const rows = [['kpi_id', 'kpi_name', 'source', 'period', 'value', 'unit', 'formula_text', 'source_columns', 'flags', 'interpretation']];
    for (const r of results) {
      const srcCols = Object.entries(r.source_columns || {})
        .map(([f, c]) => f + '=' + c).join('; ');
      const flagStr = (r.flags || []).join(', ');
      for (const p of r.periods || []) {
        rows.push([r.kpi_id, r.name, r.source, p.period, fmt(p.value), r.unit, r.formula_text, srcCols, flagStr, r.interpretation]);
      }
      if (r.single) {
        rows.push([r.kpi_id, r.name, r.source, 'overall', fmt(r.single.value), r.unit, r.formula_text, srcCols, flagStr, r.interpretation]);
      }
    }
    return rows.map(r => r.map(esc).join(',')).join('\n');
  }

  function fmt(v) { return v == null ? '' : (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v); }

  function download(filename, csv) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  return { buildCsv, download };
})();
