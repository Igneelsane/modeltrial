/* app.js — state machine + pipeline orchestration.
   upload → inspect → identify (roles + characterization) → plan (derived) → results (+ proposals + gaps). */

globalThis.KPI = globalThis.KPI || {};
KPI.app = (function () {
  const state = {
    screen: 'upload',
    table: null, cleaned: null, roles: null, identification: null,
    plan: null, selected: {}, results: null, proposals: [], gaps: [],
    log: [], error: null, msElapsed: 0, fileName: '', lastText: null,
  };

  function addLog(level, msg) { state.log.push({ level, msg }); }
  function mergeWarnings(arr) { if (arr && arr.length) arr.forEach(w => addLog(w.level || 'info', w.msg)); }
  function render() { KPI.ui.render(state); }

  function handleFile(file) {
    state.log = []; state.error = null; state.fileName = file.name;
    const reader = new FileReader();
    reader.onerror = () => { state.error = 'Could not read the file.'; state.screen = 'error'; render(); };
    reader.onload = () => {
      try {
        const { text } = KPI.parser.decodeBytes(reader.result);
        ingestText(text, file.name, file.size);
      } catch (e) { state.error = e.message; state.screen = 'error'; render(); }
    };
    reader.readAsArrayBuffer(file);
  }

  function loadSample(key) {
    state.log = []; state.error = null;
    const s = KPI.samples[key];
    state.fileName = s.name;
    addLog('info', 'Loaded sample dataset: ' + s.name + '. ' + s.note);
    ingestText(s.csv, s.name, s.csv.length);
  }

  function ingestText(text, name, size) {
    state.lastText = text;
    const table = KPI.parser.parseCSVText(text);
    table.meta.fileName = name;
    table.meta.size = size;
    state.table = table;
    addLog('info', 'Parsed ' + table.meta.rowCount.toLocaleString('en-IN') + ' rows × ' + table.meta.colCount + ' columns (delimiter "' + table.meta.delimiter + '", ' + table.meta.encoding + ').');
    mergeWarnings(table.warnings);
    const cleaned = KPI.cleaner.cleanTable(table);
    state.cleaned = cleaned;
    mergeWarnings(cleaned.warnings);
    addLog('info', 'Type inference: ' + cleaned.columns.map(c => c.header + '→' + c.type).join(', '));
    state.screen = 'preview';
    render();
  }

  function reparse(useGenerated) {
    if (!state.lastText) return;
    try {
      state.log = [];
      const table = KPI.parser.parseCSVText(state.lastText, { forceHeader: !useGenerated });
      table.meta.fileName = state.fileName;
      state.table = table;
      mergeWarnings(table.warnings);
      state.cleaned = KPI.cleaner.cleanTable(table);
      mergeWarnings(state.cleaned.warnings);
      state.screen = 'preview';
      render();
    } catch (e) { state.error = e.message; state.screen = 'error'; render(); }
  }

  /* ── identification (the core step) ── */
  function runIdentify() {
    const roles = KPI.roles.assign(state.cleaned);
    state.roles = roles;
    const identification = KPI.identify.characterize(state.cleaned, roles);
    state.identification = identification;
    addLog('info', 'Column roles assigned: ' + roles.summary.time.length + ' time, ' + roles.summary.ids.length + ' identifier, ' + roles.summary.dimensions.length + ' dimension, ' +
      Object.entries(roles.summary.metrics).reduce((a, [k, v]) => a + v.length, 0) + ' metric (' +
      Object.entries(roles.summary.metrics).filter(([, v]) => v.length).map(([k, v]) => v.length + ' ' + k).join(', ') + ').');
    if (identification.unclear) addLog('warn', 'Could not confidently identify the dataset — proceeding in exploratory mode with the confirmed facets.');
    else addLog('info', 'Identified as: ' + identification.label + ' (confidence ' + Math.round(identification.confidence * 100) + '%, tier ' + identification.tier + '). Runner-up: ' + identification.runnerUp.label + '.');
    state.screen = 'identify';
    render();
  }

  function confirmIdentify() {
    // the label is informational only — the plan is derived from the column roles,
    // so overriding it never changes the analysis (only what we call the dataset).
    const sel = document.getElementById('archetypeSel');
    if (sel && sel.value !== 'unclear' && KPI.identify.ARCH[sel.value]) {
      const arch = KPI.identify.ARCH[sel.value];
      state.identification.archetype = sel.value;
      state.identification.label = arch.label;
      state.identification.desc = arch.desc;
      state.identification.unclear = false;
      addLog('info', 'Label overridden to: ' + arch.label + ' (informational — analysis is still derived from columns).');
    }
    state.plan = KPI.analyze.buildPlan(state.cleaned, state.roles);
    state.selected = {};
    for (const it of state.plan) if (it.computable) state.selected[it.id] = true;
    const computable = state.plan.filter(i => i.computable).length;
    addLog('info', 'Analysis plan derived from column evidence: ' + computable + ' computable, ' + (state.plan.length - computable) + ' not supported by this data.');
    state.screen = 'plan';
    render();
  }

  function toggleSelect(id, checked) { state.selected[id] = checked; }

  function runSelected() {
    const ids = state.plan.filter(i => i.computable && state.selected[i.id]).map(i => i.id);
    execute(ids);
  }
  function runAll() {
    const ids = state.plan.filter(i => i.computable).map(i => i.id);
    execute(ids);
  }

  function execute(ids) {
    if (!ids.length) { state.error = 'No analyses selected.'; state.screen = 'plan'; render(); return; }
    const t0 = performance.now();
    const results = [];
    for (const id of ids) {
      const item = state.plan.find(i => i.id === id);
      if (!item || !item.computable) continue;
      try {
        const res = item.compute();
        if (res) { res.id = item.id; res.title = res.title || item.title; results.push(res); addLog('info', id + ': computed (' + (res.periods ? res.periods.length + ' periods' : res.table ? 'table' : 'value') + ').'); }
      } catch (e) { addLog('error', id + ' failed: ' + e.message); }
    }
    state.results = results;
    const prop = KPI.propose.generate(results, { cleaned: state.cleaned, roles: state.roles, identification: state.identification });
    state.proposals = prop.proposals;
    state.gaps = prop.gaps;
    state.msElapsed = Math.round(performance.now() - t0);
    state.screen = 'results';
    render();
  }

  function exportCsv() {
    const rows = [['section', 'id', 'title', 'value', 'unit', 'insight', 'formula', 'sources', 'confidence', 'flags']];
    for (const r of state.results) {
      rows.push(['analysis', r.id, r.title || r.id, KPI.interpreter.fmtFull(r.value, r.unit), r.unit, r.insight, r.formula || '', Object.entries(r.columns || {}).map(([k, v]) => k + '=' + v).join('; '), r.confidence || '', (r.flags || []).join('; ')]);
    }
    for (const p of state.proposals) {
      rows.push(['proposal', '', p.title, '', p.strength, p.evidence.join(' | '), '', '', '', '']);
    }
    for (const g of state.gaps) {
      rows.push(['data_gap', '', g.title, '', '', g.reason + ' (unlocked by: ' + (g.unlock || '') + ')', '', '', '', '']);
    }
    const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v)).join(',')).join('\n');
    const base = state.fileName.replace(/\.[^.]+$/, '') || 'dataset';
    KPI.exporter.download('kpi-results-' + base + '.csv', '\uFEFF' + csv);
  }

  function clearAll() {
    Object.assign(state, {
      screen: 'upload', table: null, cleaned: null, roles: null, identification: null,
      plan: null, selected: {}, results: null, proposals: [], gaps: [],
      log: [], error: null, msElapsed: 0, fileName: '', lastText: null,
    });
    render();
  }

  // beforeunload: generic browser prompt only — custom text is unsupported (v3.1 fix)
  window.addEventListener('beforeunload', e => {
    if (state.table) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('DOMContentLoaded', () => render());

  return { handleFile, loadSample, reparse, runIdentify, confirmIdentify, toggleSelect, runSelected, runAll, exportCsv, clearAll, state };
})();
