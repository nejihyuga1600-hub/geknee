#!/usr/bin/env node
// Render lib/icons.tsx ICON_REGISTRY to an HTML contact sheet.
// One-off visual verification — not used at runtime.
//
// Usage: node bin/render-icon-sheet.mjs > /tmp/icons-v3.html
//        open /tmp/icons-v3.html

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Lazy-load tsx loader if available; otherwise fall back to dynamic import.
try { register('tsx/esm', pathToFileURL('./')); } catch {}

const { ICON_REGISTRY, IconBadge } = await import('../lib/icons.tsx');
const { renderToStaticMarkup } = await import('react-dom/server');
const React = await import('react');

const TIERS = ['default', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial'];

const bareCells = ICON_REGISTRY.map(({ name, Cmp }) => `
  <div class="cell">
    <div class="glyph">${renderToStaticMarkup(React.createElement(Cmp, { size: 36 }))}</div>
    <div class="label">${name}</div>
  </div>`).join('');

const badgeCells = ICON_REGISTRY.slice(0, 12).map(({ name, Cmp }) => {
  const t = TIERS[Math.min(TIERS.length - 1, Math.floor(Math.random() * TIERS.length))];
  return `
    <div class="cell">
      <div class="glyph">${renderToStaticMarkup(React.createElement(IconBadge, { icon: Cmp, tier: t, size: 56 }))}</div>
      <div class="label">${name} · ${t}</div>
    </div>`;
}).join('');

process.stdout.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>geknee icons v3</title>
<style>
  body { background: #0a0a1f; color: #f2f2f8; font-family: ui-sans-serif, system-ui;
         padding: 32px; margin: 0; }
  h1 { font-family: Georgia, serif; font-weight: 400; margin: 0 0 8px; }
  h2 { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
       color: #a78bfa; margin: 32px 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
          gap: 18px; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 14px 8px; background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
          color: #f2f2f8; }
  .glyph { display: inline-flex; align-items: center; justify-content: center; }
  .label { font-size: 10px; letter-spacing: 0.08em; color: rgba(255,255,255,0.55);
           text-transform: uppercase; font-family: ui-monospace, monospace; }
</style></head>
<body>
  <h1>geknee icons · v3 color pass</h1>
  <p style="color:rgba(255,255,255,0.55);max-width:520px;font-size:13px">
    Each glyph now has a second-color accent (gold for prestige, cyan for motion,
    rose for affection/alarm). Stroke still inherits currentColor.
  </p>
  <h2>Bare glyphs</h2>
  <div class="grid">${bareCells}</div>
  <h2>IconBadge — random tiers</h2>
  <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))">${badgeCells}</div>
</body></html>
`);
