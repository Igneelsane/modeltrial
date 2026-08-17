/* parser.js — CSV parsing per PRD §9.1–9.2.
   Encoding (UTF-8 / BOM / Latin-1), delimiter sniffing, quoted fields,
   header detection, duplicate-header disambiguation, size/row/col caps.
   Pure function: bytes/text → table. */

globalThis.KPI = globalThis.KPI || {};
KPI.parser = (function () {
  const CAP = { bytes: 10 * 1024 * 1024, rows: 50000, cols: 200 };

  function decodeBytes(buf) {
    let utf8 = new TextDecoder('utf-8').decode(buf);
    const bad = (utf8.match(/\uFFFD/g) || []).length;
    if (bad > 0) {
      const latin1 = new TextDecoder('iso-8859-1').decode(buf);
      if ((latin1.match(/\uFFFD/g) || []).length < bad) {
        return { text: latin1, encoding: 'latin1' };
      }
    }
    return { text: utf8, encoding: 'utf-8' };
  }

  function sniffDelimiter(text) {
    const head = text.slice(0, 20000);
    const cands = [',', ';', '\t'];
    let best = ',', bestScore = -1;
    for (const c of cands) {
      let cnt = 0, inQ = false;
      for (const ch of head) {
        if (ch === '"') inQ = !inQ;
        else if (ch === c && !inQ) cnt++;
      }
      if (cnt > bestScore) { bestScore = cnt; best = c; }
    }
    return bestScore <= 0 ? ',' : best;
  }

  function parseRows(text, delim) {
    const rows = [];
    let row = [], field = '', inQ = false, i = 0, fieldStart = true;
    while (i < text.length) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      // quotes only open a quoted field at the START of a field (RFC-style);
      // a stray " inside an unquoted value is literal text
      if (ch === '"' && fieldStart) { inQ = true; i++; continue; }
      if (ch === delim) { row.push(field); field = ''; fieldStart = true; i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; fieldStart = true; i++; continue; }
      if (ch === '\r') { i++; continue; }
      field += ch; fieldStart = false; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function looksNumeric(v) {
    if (v == null) return false;
    const s = String(v).trim();
    if (s === '') return false;
    if (/[A-Za-z]/.test(s)) return false;
    const n = parseFloat(s.replace(/[₹$€£,%\s]/g, ''));
    return isFinite(n);
  }

  function parseCSVText(text, opts) {
    opts = opts || {};
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
    const delimiter = sniffDelimiter(text);
    const rows = parseRows(text, delimiter);
    if (rows.length === 0) throw new Error('The file appears to be empty.');
    if (rows.length > CAP.rows) throw new Error('This file has ' + rows.length.toLocaleString('en-IN') + ' rows. v1 supports up to ' + CAP.rows.toLocaleString('en-IN') + '. Please trim the file and retry.');

    // header detection: first row ≥60% non-numeric → header (PRD §9.2)
    // opts.forceHeader = user confirmed row 1 is headers (headerless-file flow)
    let headerless = false, header = [], data = rows;
    const first = rows[0];
    const nonEmpty = first.filter(v => String(v).trim() !== '').length;
    const numeric = first.filter(v => looksNumeric(v)).length;
    const isHeader = opts.forceHeader ? true : (nonEmpty > 0 && numeric / nonEmpty < 0.6);
    if (isHeader) {
      header = first.map((h, i) => String(h).trim() || ('col_' + (i + 1)));
      data = rows.slice(1);
    } else {
      headerless = true;
      header = first.map((_, i) => 'col_' + (i + 1));
    }
    if (data.length === 0) throw new Error('The file has a header row but no data rows.');

    // duplicate header disambiguation (PRD §14 #17)
    const seen = {};
    header = header.map(h => {
      const key = String(h).toLowerCase();
      const n = seen[key] = (seen[key] || 0) + 1;
      return n === 1 ? h : h + '_' + n;
    });
    if (header.length > CAP.cols) throw new Error('This file has ' + header.length + ' columns. v1 supports up to ' + CAP.cols + '.');

    // pad ragged rows
    const maxLen = header.length;
    const padded = data.map(r => {
      if (r.length === maxLen) return r;
      const out = r.slice(0, maxLen);
      while (out.length < maxLen) out.push('');
      return out;
    });

    const warnings = [];
    if (headerless) warnings.push({ level: 'warn', msg: 'First row looks like data, not headers. Generated column names col_1…col_n — confirm on the next screen.' });
    const dupHeaders = header.filter((h, i) => h !== header[i] && h.endsWith('_2') && header.indexOf(String(h).replace(/_2$/, '')) === header.indexOf(h));
    if (dupHeaders.length) warnings.push({ level: 'info', msg: 'Duplicate column names disambiguated with suffixes (' + dupHeaders.join(', ') + ').' });

    return {
      columns: header.map((h, i) => ({ header: h, index: i })),
      rows: padded,
      warnings,
      meta: { delimiter, headerless, rowCount: padded.length, colCount: header.length },
    };
  }

  function parseFile(buf, fileName, size) {
    if (size > CAP.bytes) throw new Error('This file is ' + (size / 1048576).toFixed(1) + ' MB. v1 supports up to 10 MB. Please trim the file and retry.');
    const { text, encoding } = decodeBytes(buf);
    const table = parseCSVText(text);
    table.meta.encoding = encoding;
    table.meta.fileName = fileName;
    table.meta.size = size;
    table.meta.time = Date.now();
    return table;
  }

  return { parseFile, parseCSVText, decodeBytes, CAP };
})();
