// Side menu for pages that have their own top bar (Trust & Trade, alert). Same links as the rest of the site.
(function () {
  'use strict';
  const PAGES = [['index.html', '🏠', 'Home'], ['how.html', '⚙️', 'How it works'], ['flowers.html', '🌼', 'Flowers'], ['live.html', '📅', 'Live 2026'], ['season.html', '🗓️', 'Season planner'],
    ['humidity.html', '💧', 'Humidity'], ['safety.html', '🛡️', 'Safety'], ['cost.html', '₹', 'Cost & ROI'], ['reality.html', '🔍', 'Reality check'], ['control.html', '🎛️', 'Control centre'],
    ['trust.html', '🤝', 'Trust & Trade']];
  function init() {
    const bar = document.querySelector('.tt-top');
    if (!bar || document.getElementById('menuBtn')) return;
    const here = location.pathname.split('/').pop() || 'index.html';
    const btn = document.createElement('button');
    btn.className = 'menubtn'; btn.id = 'menuBtn'; btn.textContent = '☰'; btn.setAttribute('aria-label', 'Open the menu'); btn.setAttribute('aria-expanded', 'false');
    bar.prepend(btn);
    const side = document.createElement('aside');
    side.className = 'side'; side.id = 'side'; side.hidden = true;
    side.innerHTML = '<div class="side-hd"><b>Menu</b><button id="sideX" aria-label="Close the menu">×</button></div><nav>'
      + PAGES.map(([h, i, t]) => `<a href="${h}" class="${h === here ? 'on' : ''}"><span class="si">${i}</span>${t}</a>`).join('') + '</nav>';
    const shade = document.createElement('div');
    shade.className = 'shade'; shade.hidden = true;
    document.body.append(side, shade);
    const open = on => { side.hidden = shade.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
    btn.onclick = () => open(side.hidden);
    side.querySelector('#sideX').onclick = shade.onclick = () => open(false);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !side.hidden) open(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
