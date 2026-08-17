/* ui.js — monochrome render functions. Screens: upload / inspect / identify / plan / results. */

globalThis.KPI = globalThis.KPI || {};
KPI.ui = (function () {

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function topbar(state) {
    const clear = state.table ? '<button class="btn-clear" onclick="KPI.app.clearAll()">Clear &amp; start over</button>' : '';
    return '<header class="topbar"><div class="topbar-inner">' +
      '<div class="brand">KPI Analyzer<small>upload a dataset · understand what it is</small></div>' +
      '<div class="top-right">' + clear + '<span class="privacy-badge">nothing leaves your browser</span></div>' +
      '</div></header>';
  }

  const STEP_NAMES = ['Upload', 'Inspect', 'Identify', 'Plan', 'Results'];
  function steps(cur) {
    const idx = { upload: 0, preview: 1, identify: 2, plan: 3, results: 4 }[cur] ?? 0;
    let html = '<nav class="steps" aria-label="Progress">';
    STEP_NAMES.forEach((n, i) => {
      if (i > 0) html += '<span class="sep" aria-hidden="true"></span>';
      const cls = i < idx ? 'done' : i === idx ? 'cur' : '';
      html += '<span class="st ' + cls + '"><span class="stnum">' + String(i + 1).padStart(2, '0') + '</span>' + n + '</span>';
    });
    return html + '</nav>';
  }

  function logHtml(log) {
    if (!log || !log.length) return '';
    const glyph = { info: '—', warn: '⚠', error: '✕' };
    const items = log.map(l => '<div class="li ' + l.level + '"><span class="lvl">' + (glyph[l.level] || '—') + '</span><span>' + esc(l.msg) + '</span></div>').join('');
    return '<details class="log"><summary><span>Processing log — ' + log.length + ' entr' + (log.length === 1 ? 'y' : 'ies') + '</span></summary><div class="log-items">' + items + '</div></details>';
  }

  function flagTags(flags) {
    if (!flags || !flags.length) return '';
    return '<div class="flags-row">' + flags.map(f => '<span class="flag ' + (f.startsWith('directional') ? 'warn' : '') + '">' + esc(f) + '</span>').join('') + '</div>';
  }

  /* ── 1. upload ── */
  function upload(state) {
    return '<div class="card hero">' +
      '<div class="kicker">01 — Upload</div>' +
      '<h1>What is this dataset?</h1>' +
      '<p class="lead">Drop any CSV export in. We inspect the columns, the values, and the structure — then work out for ourselves what kind of data it is, what is worth analyzing, and which decisions the numbers can actually ground.</p>' +
      '<div class="drop" id="dropzone">' +
      '<div class="big">Drop your CSV here</div>' +
      '<div class="hint">or click to browse · CSV only · ≤ 10 MB · ≤ 50,000 rows · ≤ 200 columns</div>' +
      '<input type="file" id="fileInput" accept=".csv,text/csv" />' +
      '</div>' +
      '<div class="samples">No file handy? Try a sample — ' +
      '<button onclick="KPI.app.loadSample(\'campaigns\')">Campaigns</button><span class="sep">·</span>' +
      '<button onclick="KPI.app.loadSample(\'email\')">Email / CRM</button><span class="sep">·</span>' +
      '<button onclick="KPI.app.loadSample(\'web\')">Web analytics</button><span class="sep">·</span>' +
      '<button onclick="KPI.app.loadSample(\'social\')">Social</button><span class="sep">·</span>' +
      '<button onclick="KPI.app.loadSample(\'sales\')">Sales</button><span class="sep">·</span>' +
      '<button onclick="KPI.app.loadSample(\'inventory\')">Inventory</button><span class="sep">·</span>' +
      '<button onclick="KPI.app.loadSample(\'mystery\')">Ambiguous</button>' +
      '</div>' +
      '<p class="note-line">Privacy — files are processed entirely in your browser: no upload, no storage, zero network calls. Nothing persists after you close the tab.</p>' +
      '</div>';
  }

  /* ── 2. inspect ── */
  function preview(state) {
    const t = state.table, c = state.cleaned, meta = t.meta;
    const stats = [
      { v: meta.rowCount.toLocaleString('en-IN'), l: 'Rows' },
      { v: String(meta.colCount), l: 'Columns' },
      { v: '"' + meta.delimiter + '"', l: 'Delimiter' },
      { v: esc(meta.encoding), l: 'Encoding' },
    ];
    if (c.meta.duplicateRowsRemoved > 0) stats.push({ v: '−' + c.meta.duplicateRowsRemoved, l: 'Duplicates removed' });
    const statStrip = '<div class="stat-strip">' + stats.map(s => '<div class="stat"><div class="sv">' + s.v + '</div><div class="sl">' + s.l + '</div></div>').join('') + '</div>';
    const warns = c.warnings.filter(w => w.level === 'warn');
    const notices = warns.length ? warns.map(w => '<div class="notice warn"><b>Heads up.</b> ' + esc(w.msg) + '</div>').join('') : '';
    let headerConfirm = '';
    if (meta.headerless) {
      headerConfirm = '<div class="notice"><b>Headerless file.</b> The first row looks like data, so we generated column names (col_1…). ' +
        '<button class="btn small" style="margin-left:8px" onclick="KPI.app.reparse(true)">Use generated names</button> ' +
        '<button class="btn small ghost" onclick="KPI.app.reparse(false)">Treat row 1 as headers</button></div>';
    }
    let rowsHtml = '';
    for (let i = 0; i < Math.min(5, c.rows.length); i++) rowsHtml += '<tr>' + c.rows[i].s.map(v => '<td class="mono">' + esc(v) + '</td>').join('') + '</tr>';
    const cols = c.columns.map(x => '<th>' + esc(x.header) + '</th>').join('');
    return '<div class="card">' +
      '<div class="kicker">02 — Inspect</div>' +
      '<h2 style="font-size:22px">' + esc(meta.fileName || 'dataset') + '</h2>' +
      statStrip + notices + headerConfirm +
      '<div class="tblwrap"><table class="tbl"><tr>' + cols + '</tr>' + rowsHtml + '</table></div>' +
      '<p class="note-line">First 5 rows · every cleaning decision is logged below and on the results screen.</p>' +
      '<div class="btn-row"><button class="btn" onclick="KPI.app.runIdentify()">Continue — identify the data</button></div>' +
      '</div>' + logHtml(state.log);
  }

  /* ── 3. identify (the core step) ── */
  function identify(state) {
    const id = state.identification;
    let body = '';

    if (id.unclear) {
      body = '<div class="det-big">I can’t confidently say what this is.</div>' +
        '<div class="notice warn" style="margin-top:14px"><b>Being honest rather than guessing.</b> ' + esc(id.unclearReason) + '</div>' +
        '<p class="det-note">I’ll continue with exploratory analysis derived only from what I could confirm — and every result will be marked directional. You can also tell me what you think it is; the analysis still derives from your columns either way.</p>';
    } else {
      const pct = Math.round(id.confidence * 100);
      body = '<div class="det-line"><div class="det-big">This looks like <b>' + esc(id.label) + '</b></div>' +
        '<div class="conf-num">' + pct + '<span class="pct">%</span></div></div>' +
        '<p class="det-note">' + esc(id.desc) + '</p>' +
        '<div class="conf-track"><div class="conf-fill" style="width:' + Math.max(4, pct) + '%"></div></div>' +
        '<div class="conf-scale"><span>0%</span><span>evidence-weighted confidence · runner-up: ' + esc(id.runnerUp.label) + '</span><span>100%</span></div>' +
        (id.tier === 'weak'
          ? '<div class="notice warn" style="margin-top:18px"><b>Modest signal.</b> Confidence is capped at 70% because the evidence is thin — please sanity-check this characterization before acting on it.</div>'
          : '');
    }

    // facet reasoning chips
    const facetChips = Object.entries(id.facets)
      .filter(([, f]) => f.found)
      .map(([k, f]) => '<span class="tag facet">' + esc(k.replace(/_/g, ' ')) + ' <i>' + esc(f.confidence || '') + '</i></span>').join('') || '<span class="faint">no facets confirmed</span>';
    const missingChips = Object.entries(id.facets)
      .filter(([k, f]) => !f.found && ['cost', 'revenue', 'outcome', 'volume', 'engagement', 'time'].includes(k))
      .map(([k, f]) => '<span class="tag missing-facet">✗ ' + esc(k.replace(/_/g, ' ')) + '</span>').join('');

    // column role table (transparency)
    const roleRows = state.roles.columns.map(c =>
      '<tr><td class="mono">' + esc(c.header) + '</td><td>' + esc(c.role) + (c.sub ? ' <span class="faint">· ' + esc(c.sub) + '</span>' : '') + '</td><td>' + esc(c.identity || '—') + '</td><td class="mono">' + esc(c.confidence) + '</td><td class="faint">' + esc((c.evidence || []).join('; ')) + '</td></tr>').join('');

    return '<div class="card">' +
      '<div class="kicker">03 — Identify · the core step</div>' + body +
      '<div style="margin-top:24px"><div class="sig-name">What I found (evidence, not guesses)</div><div>' + facetChips + '</div></div>' +
      (missingChips ? '<div style="margin-top:10px"><div class="sig-name">Key signals I did NOT find</div><div>' + missingChips + '</div></div>' : '') +
      '<div style="margin-top:24px"><div class="sig-name">Column roles assigned from headers, values and structure</div>' +
      '<div class="tblwrap"><table class="tbl"><tr><th>Column</th><th>Role</th><th>Identity</th><th>Confidence</th><th>Evidence</th></tr>' + roleRows + '</table></div></div>' +
      '<div class="field-line" style="margin-top:24px"><b>Tell us what you think it is</b> <span class="faint">(optional — the analysis below derives from your columns regardless)</span></div>' +
      '<select id="archetypeSel" class="minimal">' +
      Object.entries(KPI.identify.ARCH).map(([k, a]) => '<option value="' + k + '"' + (k === state.identification.archetype ? ' selected' : '') + '>' + esc(a.label) + '</option>').join('') +
      '<option value="unclear" ' + (state.identification.unclear ? 'selected' : '') + '>I’m not sure</option></select>' +
      '<div class="btn-row"><button class="btn" onclick="KPI.app.confirmIdentify()">Continue — derive the analysis plan</button></div>' +
      '</div>' + logHtml(state.log);
  }

  /* ── 4. plan ── */
  function plan(state) {
    const items = state.plan;
    const computable = items.filter(i => i.computable);
    const blocked = items.filter(i => !i.computable);
    const selCount = computable.filter(i => state.selected[i.id]).length;

    const itemHtml = it => {
      const cols = it.cols ? Object.entries(it.cols).map(([k, v]) => k + ' ← ' + v).join(' · ') : '';
      if (it.computable) {
        return '<div class="kpi-item ok"><label>' +
          '<input type="checkbox" data-plan="' + it.id + '" ' + (state.selected[it.id] ? 'checked' : '') + ' onchange="KPI.app.toggleSelect(\'' + it.id + '\',this.checked)">' +
          '<span><span class="kname">' + esc(it.title) + '</span>' +
          '<span class="ksum">' + (cols ? 'uses: <code>' + esc(cols) + '</code>' : '') + '</span></span></label></div>';
      }
      return '<div class="kpi-item missing"><span style="flex:1"><span class="kname">' + esc(it.title) + '</span>' +
        '<span class="ksum" style="color:var(--warn)">Not supported by this data — ' + esc(it.why_not) + '</span></span></div>';
    };

    return '<div class="card">' +
      '<div class="kicker">04 — Analysis plan</div>' +
      '<h2 style="font-size:22px">What this data can support</h2>' +
      '<p class="lead" style="font-size:13.5px">Every item below was <b>derived from your column evidence</b> — not picked from a fixed menu. If a type of analysis is absent, the reason is shown.</p>' +
      '<div class="section-head"><span>We can analyze</span><span class="cnt">' + computable.length + '</span></div>' +
      (computable.length ? computable.map(itemHtml).join('') : '<p class="muted">Nothing computable — see below.</p>') +
      '<div class="section-head"><span>Not supported by this data</span><span class="cnt">' + blocked.length + '</span></div>' +
      (blocked.length ? blocked.map(itemHtml).join('') : '<p class="muted">No gaps — everything applicable is computable.</p>') +
      '<div class="btn-row"><button class="btn" onclick="KPI.app.runSelected()">Analyze selected (' + selCount + ')</button> ' +
      '<button class="btn ghost" onclick="KPI.app.runAll()">Run all computable</button></div>' +
      '</div>' + logHtml(state.log);
  }

  /* ── 5. results ── */
  function sparkSvg(periods, unit) {
    const pts = (periods || []).filter(p => p.value != null).map(p => ({ v: p.value, label: p.period }));
    if (pts.length < 2) return '';
    const vals = pts.map(p => p.v);
    const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
    const W = 110, H = 30, P = 3;
    const x = i => P + (i * (W - 2 * P)) / (pts.length - 1);
    const y = v => H - P - ((v - min) / span) * (H - 2 * P);
    const points = pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' ');
    return '<svg class="sparkline" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
      '<polyline points="' + points + '" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<circle cx="' + x(pts.length - 1).toFixed(1) + '" cy="' + y(pts[pts.length - 1].v).toFixed(1) + '" r="2.2" fill="currentColor"/></svg>';
  }

  function resultCard(res) {
    const val = KPI.interpreter.fmtFull(res.value, res.unit);
    let trend = '', table = '';
    if (res.kind === 'trend' || res.kind === 'counts') {
      if (res.periods && res.periods.length >= 2) {
        const last = res.periods[res.periods.length - 1], prev = res.periods[res.periods.length - 2];
        const pct = prev.value ? (last.value - prev.value) / prev.value * 100 : null;
        const dir = pct == null || Math.abs(pct) < 5 ? 'flat' : pct > 0 ? 'up' : 'down';
        const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
        trend = '<div class="kc-mid"><div class="trend ' + dir + '"><span class="tdelta">' + arrow + ' ' + (pct == null ? '—' : Math.abs(pct).toFixed(0) + '%') + '</span> vs prior period<span class="tnote">' + res.periods.length + ' periods' + (res.periods.length < 3 ? ' — no trend claimed' : '') + '</span></div>' + sparkSvg(res.periods, res.unit) + '</div>';
      }
    }
    if (res.table) {
      table = '<div class="tblwrap"><table class="tbl"><tr>' + res.table.cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>' +
        res.table.rows.slice(0, 12).map(rr => '<tr>' + rr.map(c => '<td class="r mono">' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table></div>';
    }
    const srcs = res.columns ? Object.entries(res.columns).map(([k, v]) => k + ' ← ' + v).join(' · ') : '';
    return '<div class="kpi-card">' +
      '<div class="kc-top"><span class="kc-name">' + esc(res.title || res.id) + '</span><span class="kc-src">' + esc(res.confidence || '') + '</span></div>' +
      '<div><div class="kc-value">' + val + '</div><div class="faint" style="margin-top:6px">' + esc(res.unit || '') + '</div></div>' +
      '<div class="kc-rule"></div>' + trend +
      '<div class="interp">' + esc(res.insight || '') + '</div>' +
      flagTags(res.flags) + table +
      '<div class="formula"><span class="flabel">Formula:</span>' + esc(res.formula || '') + '</div>' +
      (srcs ? '<div class="srcs"><b>Sources:</b> ' + srcs + '</div>' : '') +
      '</div>';
  }

  function results(state) {
    const r = state.results;
    const id = state.identification;
    const idStr = id.unclear ? 'uncertain — exploratory mode'
      : esc(id.label) + ' · ' + Math.round(id.confidence * 100) + '% evidence-weighted confidence';

    const cards = r.map(resultCard).join('');

    const propHtml = (p, i) => '<div class="proposal">' +
      '<div class="prop-top"><span class="prop-title">' + esc(p.title) + '</span><span class="prop-strength ' + p.strength + '">' + esc(p.strength) + '</span></div>' +
      '<ul class="prop-evidence">' + p.evidence.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' +
      '<div class="prop-note">proposal — numbers are yours to act on, nothing runs automatically</div></div>';

    const gapsHtml = state.gaps.length
      ? state.gaps.map(g => '<div class="gap-item"><div class="gap-title">' + esc(g.title) + '</div>' +
        '<div class="gap-reason">' + esc(g.reason) + '</div>' +
        (g.unlock ? '<div class="gap-unlock">unlocked by: <code>' + esc(g.unlock) + '</code></div>' : '') + '</div>').join('')
      : '<p class="muted">No notable data gaps.</p>';

    return '<div class="card">' +
      '<div class="kicker">05 — Results</div>' +
      '<div class="result-head"><div><h2 style="margin-bottom:6px">' + esc(state.fileName) + '</h2>' +
      '<div class="meta">Identification — <b>' + idStr + '</b> · ' + state.cleaned.rows.length.toLocaleString('en-IN') + ' rows after cleaning<br>' +
      'Computed in <b>' + state.msElapsed + ' ms</b>, entirely in your browser — zero network calls.</div></div>' +
      '<button class="btn" onclick="KPI.app.exportCsv()">Export results (CSV)</button></div>' +
      '<div class="section-head"><span>Analysis — derived from your columns</span><span class="cnt">' + r.length + '</span></div>' +
      '<div class="kpi-grid">' + cards + '</div>' +
      '<div class="section-head" style="margin-top:34px"><span>What’s worth considering</span><span class="cnt">' + state.proposals.length + '</span></div>' +
      (state.proposals.length ? state.proposals.map(propHtml).join('') : '<p class="muted">Nothing rose above the evidence threshold — no proposal is forced.</p>') +
      '<div class="section-head" style="margin-top:34px"><span>What this data can’t tell us</span><span class="cnt">' + state.gaps.length + '</span></div>' +
      '<div class="gap-list">' + gapsHtml + '</div>' +
      '</div>' + logHtml(state.log);
  }

  function error(state) {
    return '<div class="card"><div class="kicker">Error</div><h2 style="font-size:22px">Could not process this file</h2>' +
      '<div class="notice warn"><b>What happened.</b> ' + esc(state.error) + '</div>' +
      '<div class="btn-row"><button class="btn" onclick="KPI.app.clearAll()">Try another file</button></div></div>';
  }

  function render(state) {
    const app = document.getElementById('app');
    let html = topbar(state) + '<div class="wrap">' + steps(state.screen);
    switch (state.screen) {
      case 'upload': html += upload(state); break;
      case 'preview': html += preview(state); break;
      case 'identify': html += identify(state); break;
      case 'plan': html += plan(state); break;
      case 'results': html += results(state); break;
      case 'error': html += error(state); break;
      default: html += '<p>…</p>';
    }
    html += '<footer class="footer">KPI Analyzer · identification-first · all computation client-side, zero network calls<br>' +
      'Every number carries its formula and source columns — proposals cite the numbers behind them, and what the data can’t ground is said out loud.</footer></div>';
    app.innerHTML = html;
    if (state.screen === 'upload') wireUpload();
    window.scrollTo(0, 0);
  }

  function wireUpload() {
    const dz = document.getElementById('dropzone');
    const fi = document.getElementById('fileInput');
    if (!dz || !fi) return;
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('over');
      if (e.dataTransfer.files.length) KPI.app.handleFile(e.dataTransfer.files[0]);
    });
    fi.addEventListener('change', () => { if (fi.files.length) KPI.app.handleFile(fi.files[0]); fi.value = ''; });
  }

  return { render };
})();
