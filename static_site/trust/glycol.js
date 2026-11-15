// Glycol energy-balance check (new for KoolKisaan Flowers). Data: TRUST_DATA.scenarios[*].glycol, made by twin/trust_nodes.py.
//   Q_glycol = m_dot × cp × (T_return − T_supply)     from the two glycol sensors and the flow meter
// must match, inside the error band (sensor noise, 3 sigma, 15-minute mean):
//   (a) the room side: cold to the air cooler + cold into the wax + pipe heat gain + pump heat
//   (b) COP × electric power of the chiller
(function () {
  'use strict';
  const D = window.TRUST_DATA, $ = id => document.getElementById(id);
  if (!D || !$('cGly')) return;
  const f = (x, d = 2) => (x === null || x === undefined || !isFinite(x) ? '–' : Number(x).toFixed(d));
  const gc = D.glycol_const, st = D.stats.glycol_check;
  let chart = null, lastKey = '';
  function draw() {
    const scKey = ($('scenario') && D.scenarios[$('scenario').value]) ? $('scenario').value : 'normal', s = D.scenarios[scKey], g = s.glycol;
    const i = Math.max(0, Math.min(g.ok.length - 1, window.__tt && window.__tt.step ? window.__tt.step() : s.checkin_step));
    const key = scKey + ':' + i;
    if (key === lastKey) return;
    lastKey = key;
    const on = Math.abs(g.Q_gly_kW[i]) > 0.02 || g.Q_el_kW[i] > 0.02, w = 3, a = Math.max(0, i - w + 1);
    const mean = k => g[k].slice(a, i + 1).reduce((x, y) => x + y, 0) / (i + 1 - a);
    const q = mean('Q_gly_kW'), qr = mean('Q_room_kW'), qe = mean('Q_el_kW'), band = g.band_kW[i], ok = g.ok[i] === 1;
    const node = (t, v, sub) => `<div class="node"><small>${t}</small><b>${v}</b><span>${sub || ''}</span></div>`;
    $('glyNow').innerHTML = node('Glycol supply / return', on ? `${f(g.T_sup[i], 1)} / ${f(g.T_ret[i], 1)} °C` : 'pump off', `V-ROOM ${g.v_room[i] ? 'open' : 'closed'} · V-WAX ${g.v_wax[i] ? 'open' : 'closed'}`)
      + node('Q = ṁ × cp × (T return − T supply)', f(q) + ' kW', `ṁ ${f(gc.m_dot_kg_s, 3)} kg/s × cp ${f(gc.cp_kJ_kgK, 1)} kJ/kg·K`)
      + node('Room heat balance', f(qr) + ' kW', 'air cooler + wax + pipe gain + pump heat')
      + node('COP × electric power', f(qe) + ' kW', 'chiller energy meter')
      + node('Check', ok ? '✔ inside the band' : '⚠ outside the band', `error band ± ${f(band)} kW`);
    $('glyNote').textContent = `15-minute means. In a normal year ${f(st.readings_inside_band_pct, 1)} % of the readings are inside the band (mean band ± ${f(st.band_mean_kW)} kW). `
      + 'S = digital twin with simulated sensor noise – not measured.';
    const lo = Math.max(0, i - 287), lab = [], sl = k => g[k].slice(lo, i + 1);
    for (let k = lo; k <= i; k++) { const m = k * 5; lab.push(String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')); }
    const ds = [['Q glycol sensors', 'Q_gly_kW', '#2a78d6'], ['Room heat balance', 'Q_room_kW', '#14b8a6'], ['COP × electric power', 'Q_el_kW', '#f59e0b']]
      .map(([label, k, c]) => ({ label, data: sl(k), borderColor: c, pointRadius: 0, borderWidth: 1.5 }));
    if (!window.Chart) return;
    if (chart) { chart.data.labels = lab; chart.data.datasets.forEach((d, k) => { d.data = ds[k].data; }); chart.update('none'); } else {
      chart = new Chart($('cGly'), { type: 'line', data: { labels: lab, datasets: ds }, options: { animation: false, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { title: { display: true, text: 'kW of cold' } } } } });
    }
  }
  setInterval(draw, 1000);
  setTimeout(draw, 300);
})();
