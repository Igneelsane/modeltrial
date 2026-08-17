#!/usr/bin/env node
/* Builds dist/kpi-analyzer.html — a fully self-contained single file (inline CSS+JS).
   Works offline, from file://, or in a sandboxed preview iframe. */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const SRC = path.join(root, 'src');
const ORDER = ['samples.js', 'parser.js', 'cleaner.js', 'interpreter.js', 'roles.js', 'identify.js', 'analyze.js', 'propose.js', 'exporter.js', 'ui.js', 'app.js'];

let css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
let js = '';
for (const f of ORDER) {
  js += '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(SRC, f), 'utf8') + '\n';
}
let html = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
html = html.replace('/*__CSS__*/', css).replace('/*__JS__*/', js);

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'kpi-analyzer.html');
fs.writeFileSync(out, html);

// also emit at the repo/workspace root as index.html so a static server's root
// (and the live preview) shows the app immediately instead of a directory listing
const rootIndex = path.join(root, '..', 'index.html');
fs.writeFileSync(rootIndex, html);

// and into the repo root (index.html at the repo root is what Vercel serves at /)
fs.writeFileSync(path.join(root, 'index.html'), html);

console.log('Built ' + out + ' (' + (html.length / 1024).toFixed(1) + ' KB)');
console.log('Built ' + rootIndex + ' (workspace root index for live preview)');
console.log('Built ' + path.join(root, 'index.html') + ' (repo root index — deployed)');
