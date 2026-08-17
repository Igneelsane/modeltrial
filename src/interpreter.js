/* interpreter.js — shared number formatting (display + citations). */

globalThis.KPI = globalThis.KPI || {};
KPI.interpreter = (function () {

  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

  // number-only formatting per unit
  function fmtValue(v, unit) {
    if (v == null || isNaN(v)) return '—';
    if (unit === 'currency') return '₹' + inr.format(Math.round(v));
    if (unit === 'percent') return v.toFixed(1);
    if (unit === 'ratio') return '×' + v.toFixed(1);
    if (unit === 'count') return inr.format(Math.round(v));
    return String(Math.round(v * 10) / 10);
  }

  // value + unit label for display ("₹41,200", "4.2%")
  function fmtFull(v, unit) {
    if (v == null || isNaN(v)) return '—';
    if (unit === 'currency') return '₹' + inr.format(Math.round(v));
    if (unit === 'percent') return v.toFixed(1) + '%';
    if (unit === 'ratio') return '×' + v.toFixed(1);
    return inr.format(Math.round(v));
  }

  function unitLabel(unit) {
    return { currency: '₹', percent: '%', ratio: '×', count: '', score: '' }[unit] || '';
  }

  return { fmtValue, fmtFull, unitLabel };
})();
