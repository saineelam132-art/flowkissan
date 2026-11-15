// KoolKisaan Flowers – shared helpers. Every number on every page is read from window.KK (web/data/site_data.js),
// which tools/export_site.py makes from the twin's results files. No numbers are typed in the pages.
(function () {
  'use strict';
  const K = window.KK;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = (x, d = 0) => (x === null || x === undefined || !isFinite(x) ? '–' : Number(x).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const inr = x => (x === null || x === undefined || !isFinite(x) ? '–' : (x < 0 ? '−₹' : '₹') + Math.abs(Math.round(x)).toLocaleString('en-IN'));
  const S = '<span class="tag S" title="Simulated by the digital twin – not measured">S</span>';
  const E = '<span class="tag E" title="Assumption – check">E</span>';
  const C = '<span class="tag C" title="Calculated">C</span>';
  const range = () => `<span class="range">${esc(K.flowers.date_range.label)}</span>`;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const PAGES = [['index.html', 'Home'], ['how.html', 'How it works'], ['flowers.html', 'Flowers'], ['live.html', 'Live 2026'], ['season.html', 'Season planner'], ['humidity.html', 'Humidity'],
    ['safety.html', 'Safety'], ['cost.html', 'Cost & ROI'], ['reality.html', 'Reality check'], ['trust.html', 'Trust & Trade']];
  function table(head, rows, opt = {}) {
    const th = head.map(h => `<th class="${h.n ? 'n' : ''}">${h.t ?? h}</th>`).join('');
    const tr = rows.map(r => `<tr class="${r.hl ? 'hl' : ''}">${(r.c || r).map((c, i) => `<td class="${head[i] && head[i].n ? 'n' : ''}">${c ?? '–'}</td>`).join('')}</tr>`).join('');
    return `<div class="tw"><table class="t"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>${opt.note ? `<p class="src">${opt.note}</p>` : ''}`;
  }
  const tile = (label, val, unit = '', sub = '', cls = '') => `<div class="tile ${cls}"><small>${label}</small><b>${val}</b><span class="u">${unit}</span>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  function shell(page) {
    const here = page || (location.pathname.split('/').pop() || 'index.html');
    const top = document.createElement('header');
    top.className = 'tt-top';
    top.innerHTML = `<a class="tt-brand" href="index.html"><img src="public/koolkisaan-logo-small.png" alt="KoolKisaan logo"><span><b>${esc(K.project.name)}</b><small>${esc(K.project.tagline)}</small></span></a>
      <nav class="nav">${PAGES.map(([h, t]) => `<a href="${h}" class="${h === here ? 'on' : ''}">${t}</a>`).join('')}</nav>`;
    document.body.prepend(top);
    const foot = document.createElement('div');
    foot.className = 'foot';
    foot.innerHTML = `${S} = simulated by our digital twin on real 2026 Visakhapatnam weather (not measured). ${E} = assumption to check. ${C} = calculated.
      Results made ${esc(K.generated)}. Weather data by Open-Meteo.com (CC BY 4.0). Photo credits: <a href="assets/CREDITS.md">CREDITS.md</a>.`;
    (document.querySelector('main') || document.body).append(foot);
  }
  window.KKS = { K, $, esc, f, inr, S, E, C, range, table, tile, shell, MONTHS, PAGES };
})();
