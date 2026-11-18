// KoolKisaan Flowers – the pages. All numbers come from window.KK (results files of the twin).
(function () {
  'use strict';
  const { K, $, esc, f, inr, S, E, C, range, table, tile, shell, MONTHS } = window.KKS;
  const D = K.flowers.design, RS = K.flowers[K.flowers.headline_case], ID = K.flowers.ideal, RL = K.flowers.realistic_smart, DAYS = K.flowers.date_range.days;
  const N = { t: '', n: true };
  const n = t => ({ t, n: true });
  const crop = k => K.crops[k] || { label: k };
  const gridLine = (h, d, mo, sol, tot) => `${f(h)} grid hours on ${f(d)} days${mo ? ' (mostly ' + mo + ')' : ''} – next to ${f(sol)} of ${f(tot)} days fully on solar + ice`;
  const fpic = k => (K.flower_photos[k] ? `<img src="${K.flower_photos[k]}" alt="${esc(crop(k).label)}" loading="lazy" class="fpic">` : '');
  const fcred = () => { const c = Object.entries(K.flower_credits).filter(([k]) => K.flower_photos[k]); return c.length ? `<p class="src">Flower photos: ${c.map(([k, v]) => `${esc(crop(k).label.split(' (')[0])} – ${esc(v.credit)}${v.source ? ` (<a href="${v.source}">source</a>)` : ''}`).join(' · ')}</p>` : ''; };
  const P = {};

  // ------------------------------------------------------------------ HOME
  P.home = () => {
    const H = K.hourly, t0 = new Date(H.t0.replace(' ', 'T') + '+05:30');
    const nd = H.n / 24;
    const now = new Date(Date.now() + 5.5 * 3600e3);
    let d0 = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(2026, 0, 1)) / 864e5);
    if (!(d0 >= 0 && d0 < nd)) d0 = nd - 2;
    const dateOf = d => new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10);
    const cmp = K.compare;
    // slides: [file, caption, [[x %, y %, what]...]]. Pictures that are not in assets/concept/ are skipped, so new ones can be added here.
    const G = D.glycol;
    const SLIDES = [
      ['flowers_outside', 'The flower cold room on a farm near Visakhapatnam: marigold, jasmine and rose wait at the door', [[50, 20, 'pv'], [80, 68, 'out'], [52, 60, 'room']]],
      ['room_flowers_chiller', `Whole system: insulated room, solar panels on top, and the R290 chiller OUTSIDE on its own pad – ${D.r290_inside_room_g} g of R290 inside the room`, [[42, 22, 'pv'], [77, 70, 'gly'], [32, 55, 'room'], [70, 12, 'out']]],
      ['flowers_inside', `Inside at ${D.band_C.join('–')} °C: marigold, rose, jasmine and tuberose in crates and bags; finned ice panels on the wall, glycol air cooler above`, [[50, 18, 'gly'], [40, 55, 'ice'], [60, 55, 'vice'], [14, 62, 'kg'], [80, 30, 'rh']]],
      ['chiller_outdoor', 'Outdoor R290 chiller with the glycol pump (green), expansion tank (red) and the two insulated glycol pipes into the room', [[37, 68, 'gly'], [43, 72, 'pump'], [65, 52, 'src']]],
      ['room_with_chiller', 'The chiller, pump and tank sit beside the room; only cold glycol goes through the wall', [[80, 72, 'gly'], [55, 20, 'pv'], [43, 55, 'room']]],
      ['A10_interior_evaporator', `Air cooler: glycol at about ${f(G.supply_room_C)} °C takes the heat out of the room air (picture from the earlier design)`, [[58, 48, 'room'], [84, 56, 'gly'], [14, 68, 'rh']]],
      ['A11_solar_canopy_closeup', `${f(D.pv_kWp, 1)} kWp of solar panels run the chiller by day and freeze the ice with what is left over`, [[50, 40, 'pv'], [75, 70, 'src']]],
    ];
    $('hdrTools').innerHTML = `<div class="seg" id="modes">${['Auto', 'Day', 'Night', 'Monsoon'].map((m, i) => `<button data-m="${m}" class="${i ? '' : 'on'}">${m}</button>`).join('')}</div>
      <button id="tourBtn">▶ Start demo</button><button id="calBtn" title="Pick a day">📅 Calendar</button><button id="outBtn">🌤 Outside now</button>
      <label class="chk"><input type="checkbox" id="lowg"> Low graphics</label>`;
    $('sideExtra').innerHTML = `<b>This picture</b><p id="cap"></p>`;
    $('app').innerHTML = `
      <section class="stage" id="stage">
        <div id="slides"></div>
        <div class="panel" id="panel" hidden></div>
        <div class="tour" id="tourBox" hidden><span id="tourTx"></span><span class="tb"><button id="tPrev">◀</button><button id="tPause">❚❚</button><button id="tNext">▶</button><button id="tStop">■</button></span></div>
        <div class="ai">Concept illustration (AI-generated) – not a photo of a built unit</div>
        <div class="dots"><button id="prev" aria-label="previous picture">‹</button><span id="dots"></span><button id="next" aria-label="next picture">›</button></div>
        <div class="databar"><div id="bar" class="barvals"></div>
          <div class="barctl"><button id="play" title="Play / pause">▶</button><select id="speed" title="Speed"><option value="0">real time</option><option value="1" selected>1 h per second</option><option value="6">6 h per second</option></select>
            <input type="date" id="day" min="${dateOf(0)}" max="${dateOf(nd - 1)}" value="${dateOf(d0)}"><input type="range" id="hour" min="0" max="23" step="1" value="${now.getUTCHours()}"><button id="nowBtn">● Now</button>
            <b id="nowLbl"></b><span class="sim">SIMULATED</span></div></div>
      </section>
      <div class="card" style="margin-top:12px"><h3>This day, hour by hour ${S}</h3><canvas id="dayChart" height="90"></canvas></div>
      <h2>Flowers we store ${range()}</h2>
      <div class="card">${table(['Flower', 'Fit at ' + f(D.setpoint_C) + ' °C', n('Shelf life outside ' + E), n('Bagged at 4 °C ' + E), n('Freshness kept after 1 day in our room ' + S), n('With no cold room ' + S)],
        Object.entries(K.crops).map(([k, c]) => { const h = ((K.holds.flowers[k] || {}).best_practice || {})['1']; return [`${fpic(k)}<b>${esc(c.label)}</b>`, `<span class="pill ${{ Excellent: 'ok', Good: 'ok', 'Short holds': 'wn', 'Not suitable': 'bd' }[c.fit_at_4C]}">${c.fit_at_4C}</span>`,
          f(c.shelf_life_ambient_days, 1) + ' days', f(c.shelf_life_bagged_4C_days) + ' days', h ? f(h.freshness_kept_pct) + ' %' : '–', h ? f(h.freshness_no_room_pct) + ' %' : '–']; }),
        { note: 'More on the <a href="flowers.html">Flowers</a> page. Blocked at check-in: ' + Object.values(K.blocked).map(b => esc(b.label)).join(', ') + '.' })}${fcred()}</div>
      <h2>Results of the year so far ${S} ${range()}</h2>
      <p class="src">Best practice = realistic losses + good design + good operation (the careful, reachable numbers). The ideal model is shown in small print. Poor practice is on the Reality check page.</p>
      <div class="tiles">
        ${tile('Days fully on solar + ice', f(RS.days_full_solar_ice), `of ${DAYS}`, `ideal model: ${f(ID.days_full_solar_ice)} of ${DAYS}`, 'big')}
        ${tile('Electricity from the sun', f(RS.solar_share_of_electricity_pct), '%', `ideal: ${f(ID.solar_share_of_electricity_pct)} %`, 'big good')}
        ${tile('Grid backup', f(RS.grid_h_per_year), 'h/yr', `${f(RS.grid_kWh_per_year)} kWh/yr · ideal: ${f(ID.grid_h_per_year)} h, ${f(ID.grid_kWh_per_year)} kWh`, 'big')}
        ${tile('Chiller COP', f(RS.COP_chiller, 2), '', `ideal: ${f(ID.COP_chiller, 2)}`)}
        ${tile('Hours outside ' + D.band_C.join('–') + ' °C', f(RS.hours_outside_band), 'h', `ideal: ${f(ID.hours_outside_band)} h`)}
        ${tile('Average humidity (flowers inside)', f(RS.rh_avg_pct, 1), '%', `below 85 %: ${f(RS.rh_below_85_h_day, 2)} h/day`)}
        ${tile('Flowers stored', f(RS.kg_stored), 'kg', `${f(RS.days_with_stock)} days with stock`)}
        ${tile('Value captured ' + E, inr(RS.value_INR), '', 'price model is an assumption')}
      </div>
      <div class="note ok">${gridLine(RS.grid_h, RS.days_with_grid, RS.grid_months, RS.days_full_solar_ice, DAYS)}. Grid electricity is a small top-up: about ${f(RS.grid_kWh_per_year)} kWh a year, ${inr(K.practice.cases.best_practice.grid_bill_INR_per_year.mid)} a year ${E}.
        Up-to-date numbers from 1 January to the newest weather are in the <a href="live.html">Live 2026 report</a>.</div>
      <h2>Pages</h2>
      <div class="cols">${[['how.html', 'How it works', 'Outdoor R290 chiller → glycol pump → V-ROOM / V-ICE.'], ['flowers.html', 'Flowers', 'Which flowers fit a 4 °C room and how long they keep.'],
        ['season.html', 'Season planner', 'Jan–Dec: flowers, festivals, prices, what the room does.'], ['humidity.html', 'Humidity', '4 options compared.'],
        ['safety.html', 'Safety', 'R290 facts, room limit, standards.'], ['cost.html', 'Cost & ROI', 'Bill of materials and payback.'],
        ['reality.html', 'Reality check', 'Each loophole alone, then all together.'], ['trust.html', 'Trust & Trade', 'Ledger, Φ check and glycol energy check.']]
        .map(([h, t, d]) => `<a class="card" href="${h}" style="text-decoration:none;color:inherit"><h3>${t} ▸</h3><span class="src">${d}</span></a>`).join('')}</div>
      <h2>Earlier design (archived)</h2>
      <div class="card"><p>The first KoolKisaan room stored pomegranate at 5 °C with the R290 refrigerant circuit <b>inside</b> the room
        (${cmp.old.ideal.r290_inside_room_g.join('–')} g of R290, above the room limit of about ${f(cmp.r290_room_limit_g)} g). It is kept only for comparison, on the same weather. ${range()}</p>
      ${table(['', n('Old: R290 in the room, pomegranate 5 °C'), n('New: glycol loop, flowers 4 °C')], [
        ['R290 inside the room', cmp.old.ideal.r290_inside_room_g.join('–') + ' g', '<b>' + cmp.new.ideal.r290_inside_room_g + ' g</b>'],
        ['Evaporating temperature', f(cmp.old.ideal.T_evap_C) + ' °C', cmp.new.ideal.T_evap_C.map(x => f(x)).join(' / ') + ' °C (room / ice)'],
        ['Chiller COP – ideal', f(cmp.old.ideal.COP_chiller, 2), f(cmp.new.ideal.COP_chiller, 2)],
        ['Chiller COP – realistic', f(cmp.old.realistic_smart.COP_chiller, 2), f(cmp.new.realistic_smart.COP_chiller, 2)],
        ['Electricity kWh/day – ideal', f(cmp.old.ideal.electric_kWh_day, 2), f(cmp.new.ideal.electric_kWh_day, 2)],
        ['Electricity kWh/day – realistic', f(cmp.old.realistic_smart.electric_kWh_day, 2), f(cmp.new.realistic_smart.electric_kWh_day, 2)],
        [`Days fully on solar + ice (of ${DAYS}) – ideal`, f(cmp.old.ideal.days_full_solar_ice), f(cmp.new.ideal.days_full_solar_ice)],
        [`Days fully on solar + ice – realistic + smart`, f(cmp.old.realistic_smart.days_full_solar_ice), f(cmp.new.realistic_smart.days_full_solar_ice)],
        ['Grid hours/yr – ideal', f(cmp.old.ideal.grid_h_per_year), f(cmp.new.ideal.grid_h_per_year)],
        ['Grid hours/yr – realistic + smart', f(cmp.old.realistic_smart.grid_h_per_year), f(cmp.new.realistic_smart.grid_h_per_year)],
        ['Grid kWh/yr – realistic + smart', f(cmp.old.realistic_smart.grid_kWh_per_year), f(cmp.new.realistic_smart.grid_kWh_per_year)],
      ], { note: 'Comparison only: the two rooms store different produce on different loading plans and have different temperature bands (old 2–8 °C, new ' + D.band_C.join('–') + ' °C).' })}</div>`;
    // ---- picture viewer: slides, dots, arrow keys
    let cur = 0, slides = [];
    function showSlide(k) {
      if (!slides.length) return;
      cur = (k + slides.length) % slides.length;
      slides.forEach((sl, i) => sl.el.classList.toggle('on', i === cur));
      $('cap').textContent = slides[cur].cap;
      $('dots').innerHTML = slides.map((_, i) => `<i class="${i === cur ? 'on' : ''}" data-i="${i}"></i>`).join('');
      draw();
    }
    SLIDES.filter(x => K.concept.includes(x[0])).forEach(([file, cap, hs]) => {
      const el = document.createElement('div');
      el.className = 'slide';
      el.innerHTML = `<img alt="${esc(cap)}">` + hs.map(([x, y, what]) => `<button class="hot" style="left:${x}%;top:${y}%" data-w="${what}"><span></span></button>`).join('');
      const img = el.querySelector('img'), entry = { el, cap, file };
      img.onload = () => { slides.push(entry); slides.sort((p, q) => p.order - q.order); $('slides').append(...slides.map(x => x.el)); if (slides.length === 1 || slides[0] === entry) showSlide(0); else showSlide(cur); };
      entry.order = SLIDES.findIndex(x => x[0] === file);
      img.src = `assets/concept/${file}.webp`;
    });
    $('prev').onclick = () => showSlide(cur - 1);
    $('next').onclick = () => showSlide(cur + 1);
    $('dots').onclick = e => { if (e.target.dataset.i) showSlide(+e.target.dataset.i); };
    document.addEventListener('keydown', e => { if (e.key === 'ArrowRight') showSlide(cur + 1); if (e.key === 'ArrowLeft') showSlide(cur - 1); if (e.key === ' ') { e.preventDefault(); $('play').click(); } });
    // ---- special days from the twin run (for Day / Night / Monsoon)
    const daySum = k => Array.from({ length: nd }, (_, d) => H[k].slice(d * 24, d * 24 + 24).reduce((x, y) => x + (y || 0), 0));
    const pvDay = daySum('P_pv'), argmax = a => a.indexOf(Math.max(...a)), argmin = a => a.indexOf(Math.min(...a));
    const nightT = Array.from({ length: nd - 1 }, (_, d) => H.T_out.slice(d * 24 + 19, d * 24 + 30).reduce((x, y) => x + y, 0));
    const monsoonDays = pvDay.map((v, d) => (new Date(Date.UTC(2026, 0, 1) + d * 864e5).getUTCMonth() >= 5 && new Date(Date.UTC(2026, 0, 1) + d * 864e5).getUTCMonth() <= 8 ? v : Infinity));
    const MODE = { Day: [argmax(pvDay), 12], Night: [argmax(nightT), 23], Monsoon: [argmin(monsoonDays), 13] };
    let chart = null, timer = null;
    function values(i) {
      const on = H.run[i] > 0, src = H.grid[i] > 0 ? 'GRID' : (on ? 'SOLAR' : (H.ice[i] > 0 ? 'ICE' : 'NONE'));
      return { room: [`${f(H.T_room[i], 1)} °C`, 'Room air'], rh: [`${f(H.RH_room[i], 0)} %`, 'Room humidity'], out: [`${f(H.T_out[i], 1)} °C`, 'Outside air'], pv: [`${f(H.P_pv[i], 2)} kW`, 'Solar power now'],
        ice: [`${f(H.ice[i], 0)} %`, 'Ice frozen (cold battery)'], gly: [on ? `${f(H.T_sup[i], 1)} / ${f(H.T_ret[i], 1)} °C` : 'pump off', 'Glycol supply / return'],
        pump: [on ? 'ON' : 'OFF', 'Glycol pump'], vice: [H.v_ice[i] > 0 ? 'OPEN' : 'CLOSED', 'V-ICE valve'], kg: [`${f(H.kg[i], 0)} kg`, 'Flowers inside'], src: [src, 'Power from'] };
    }
    let draw = function () {
      const d = Math.round((Date.parse($('day').value) - Date.UTC(2026, 0, 1)) / 864e5), h = +$('hour').value, i = Math.max(0, Math.min(H.n - 1, d * 24 + h));
      const v = values(i), T = H.T_room[i], bad = T > D.band_C[1] || T < D.band_C[0];
      $('nowLbl').textContent = `${$('day').value} ${String(h).padStart(2, '0')}:00`;
      $('stage').classList.toggle('night', H.P_pv[i] < 0.02);
      const cell = (lab, val, cls = '') => `<div class="bv ${cls}"><small>${lab}</small><b>${val}</b></div>`;
      $('bar').innerHTML = cell('ROOM', v.room[0], bad ? 'wn' : 'ok') + cell('HUMIDITY', v.rh[0]) + cell('OUTSIDE', v.out[0]) + cell('SOLAR PV', v.pv[0]) + cell('ICE BATTERY', v.ice[0])
        + cell('GLYCOL SUPPLY / RETURN', v.gly[0]) + cell('FLOWERS INSIDE', v.kg[0]) + cell('POWER FROM', v.src[0], v.src[0] === 'GRID' ? 'wn' : 'ok');
      document.querySelectorAll('.slide.on .hot').forEach(b => { const x = v[b.dataset.w]; b.querySelector('span').innerHTML = `<small>${x[1]}</small>${x[0]}`; });
      const a = d * 24, lab = Array.from({ length: 24 }, (_, k) => k + ':00'), sl = k => H[k].slice(a, a + 24);
      const ds = [{ label: 'Room °C', data: sl('T_room'), borderColor: '#2a78d6', yAxisID: 'y' }, { label: 'Outside °C', data: sl('T_out'), borderColor: '#f59e0b', yAxisID: 'y' },
        { label: 'Ice %', data: sl('ice'), borderColor: '#14b8a6', yAxisID: 'y2' }, { label: 'Humidity %', data: sl('RH_room'), borderColor: '#8b5cf6', yAxisID: 'y2' }];
      if (chart) { chart.data.datasets.forEach((s, k) => { s.data = ds[k].data; }); chart.update('none'); } else if (window.Chart) {
        chart = new Chart($('dayChart'), { type: 'line', data: { labels: lab, datasets: ds.map(s => ({ ...s, pointRadius: 0, borderWidth: 2, tension: .3 })) },
          options: { animation: false, interaction: { mode: 'index', intersect: false }, scales: { y: { title: { display: true, text: '°C' } }, y2: { position: 'right', min: 0, max: 100, title: { display: true, text: '%' }, grid: { drawOnChartArea: false } } } } });
      }
    }
    function setTime(d, h) { $('day').value = dateOf(Math.max(0, Math.min(nd - 1, d))); $('hour').value = h; draw(); }
    function tick(hours) {
      let d = Math.round((Date.parse($('day').value) - Date.UTC(2026, 0, 1)) / 864e5), h = +$('hour').value + hours;
      while (h > 23) { h -= 24; d += 1; }
      if (d > nd - 1) d = 0;
      setTime(d, h);
    }
    function play(on) {
      clearInterval(timer); timer = null;
      $('play').textContent = on ? '⏸' : '▶';
      const sp = +$('speed').value;
      if (on) timer = sp ? setInterval(() => tick(sp), 1000) : setInterval(goNow, 60000);
    }
    function goNow() { const n2 = new Date(Date.now() + 5.5 * 3600e3); setTime(d0, n2.getUTCHours()); }
    $('play').onclick = () => play(!timer);
    $('speed').onchange = () => { if (timer) play(true); };
    $('day').onchange = $('hour').oninput = draw;
    $('nowBtn').onclick = () => { play(false); setMode('Auto'); };
    function setMode(m) {
      document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      if (m === 'Auto') goNow(); else setTime(MODE[m][0], MODE[m][1]);
    }
    $('modes').onclick = e => { if (e.target.dataset.m) { play(false); setMode(e.target.dataset.m); } };
    // ---- link to a moment: index.html?t=2026-05-23T14:00
    const qs = new URLSearchParams(location.search);
    const curDH = () => [Math.round((Date.parse($('day').value) - Date.UTC(2026, 0, 1)) / 864e5), +$('hour').value];
    const drawBase = draw;
    draw = function () { drawBase(); const [d, h] = curDH(), i = Math.min(H.n - 1, d * 24 + h), fc = H.is_forecast && H.is_forecast[i] > 0;
      document.querySelector('.sim').textContent = fc ? 'FORECAST' : 'SIMULATED';
      try { const u = new URL(location.href); u.searchParams.set('t', `${$('day').value}T${String(h).padStart(2, '0')}:00`); history.replaceState(null, '', u); } catch (e) { /* file:// */ }
      if (!$('panel').hidden && $('panel').dataset.k) openPanel($('panel').dataset.k); };
    $('day').onchange = $('hour').oninput = () => draw();
    // ---- detail card for every dot
    const INFO = {
      room: ['Room air temperature', 'T_room', '°C', `Set-point ${f(D.setpoint_C)} °C, normal band ${D.band_C.join('–')} °C, alarm above ${D.alarm_C[1]} °C or below ${D.alarm_C[0]} °C. By day the glycol air cooler holds it; at night the ice panels do.`],
      rh: ['Room humidity', 'RH_room', '%', `Flowers want ${D.rh_target_pct.join('–')} %. Cold surfaces take water out of the air; bags and the fogger put it back. Never spray water on the flowers.`],
      out: ['Outside air', 'T_out', '°C', 'From the weather service (Open-Meteo) for Visakhapatnam, shifted to a hot site as the careful case.'],
      pv: ['Solar power', 'P_pv', 'kW', `${f(D.pv_kWp, 1)} kWp of panels. Solar runs the chiller first for the room, then makes ice with what is left over.`],
      wax: ['Ice (cold battery)', 'ice', '%', `${f(D.wax_kg ?? D.ice_kg)} kg of water in finned panels. 100 % = all frozen. It melts at night to keep the room cold, with no pump and no fan.`],
      gly: ['Glycol supply and return', 'T_sup', '°C', `Cold ${esc(D.glycol.fluid)} carries the cold from the outdoor R290 chiller into the room. Q = flow × heat capacity × (return − supply).`],
      pump: ['Glycol pump', 'run', '', `${f(D.glycol.pump_W)} W pump; it runs only when the chiller runs.`],
      vwax: ['V-ICE valve', 'v_ice', '', 'Opens only with spare solar power and when the ice is below 100 %.'],
      kg: ['Flowers inside', 'kg', 'kg', `At most ${f(D.crate_places)} crates. In at 06:00, out at 05:00.`],
      src: ['Where the power comes from', 'P_grid', 'kW', 'Solar by day, ice by night, grid only as a small backup.'],
    };
    let pchart = null;
    function openPanel(k) {
      const [d, h] = curDH(), i = Math.min(H.n - 1, d * 24 + h), [title, key, unit, text] = INFO[k], v = values(i)[k], a = d * 24;
      const P_ = $('panel'); P_.hidden = false; P_.dataset.k = k;
      P_.innerHTML = `<button class="x" id="pX">×</button><h3>${title} ${S}</h3><div class="big">${v[0]}</div><p>${text}</p><canvas id="pC" height="130"></canvas>
        <p class="src">This day, hour by hour. Simulated by the digital twin – not measured.</p>`;
      $('pX').onclick = () => { P_.hidden = true; pchart = null; };
      if (!window.Chart) return;
      const ds = [{ label: title + (unit ? ' ' + unit : ''), data: H[key].slice(a, a + 24), borderColor: '#14b8a6', pointRadius: 0, borderWidth: 2 }];
      if (k === 'gly') ds.push({ label: 'Return °C', data: H.T_ret.slice(a, a + 24), borderColor: '#f59e0b', pointRadius: 0, borderWidth: 2 });
      if (k === 'src') ds.push({ label: 'Solar used kW', data: H.P_sol.slice(a, a + 24), borderColor: '#f59e0b', pointRadius: 0, borderWidth: 2 });
      pchart = new Chart($('pC'), { type: 'line', data: { labels: Array.from({ length: 24 }, (_, x) => x + ':00'), datasets: ds }, options: { animation: false, plugins: { legend: { labels: { color: '#cfe0ee' } } },
        scales: { x: { ticks: { color: '#9fb4c7', maxTicksLimit: 8 } }, y: { ticks: { color: '#9fb4c7' } } } } });
    }
    $('slides').addEventListener('click', e => { const b = e.target.closest('.hot'); if (b) openPanel(b.dataset.w); });
    // ---- outside-now menu
    $('outBtn').onclick = () => { const [d, h] = curDH(), i = Math.min(H.n - 1, d * 24 + h), P_ = $('panel'), fc = (K.live.forecast.days || [])[0];
      P_.hidden = false; P_.dataset.k = '';
      P_.innerHTML = `<button class="x" id="pX">×</button><h3>Outside now <span class="tag C">W</span></h3><p>${$('day').value}, ${String(h).padStart(2, '0')}:00 IST · Visakhapatnam</p>
        ${table(['', N], [['Air temperature', f(H.T_out[i], 1) + ' °C'], ['Humidity', f(H.RH_out[i]) + ' %'], ['Sunlight', H.ghi ? f(H.ghi[i]) + ' W/m²' : '–'], ['Wind at 10 m', H.wind ? f(H.wind[i], 1) + ' m/s' : '–'], ['Solar panels now', f(H.P_pv[i], 2) + ' kW']])}
        ${fc ? `<p><b>Tomorrow (${esc(fc.date)}):</b> ${esc(fc.text)} <a href="live.html">More ▸</a></p>` : ''}<p class="src">Weather by Open-Meteo.com, shifted to a hot site (careful case). ${H.is_forecast && H.is_forecast[i] > 0 ? 'This hour is a FORECAST.' : ''}</p>`;
      $('pX').onclick = () => { P_.hidden = true; }; };
    // ---- calendar
    const daily = K.live.daily, fdays = new Set((K.live.forecast.days || []).map(x => x.date));
    const byDate = Object.fromEntries(daily.map(x => [x.date, x]));
    function openCal(month) {
      const P_ = $('panel'); P_.hidden = false; P_.dataset.k = '';
      const first = new Date(Date.UTC(2026, month, 1)), n = new Date(Date.UTC(2026, month + 1, 0)).getUTCDate(), off = (first.getUTCDay() + 6) % 7;
      const hot = daily.reduce((a, b) => (b.outside_max_C > a.outside_max_C ? b : a)), grid = daily.reduce((a, b) => (b.grid_kWh > a.grid_kWh ? b : a));
      const dull = daily.filter(x => +x.date.slice(5, 7) >= 6 && +x.date.slice(5, 7) <= 9).reduce((a, b) => (b.sun_kWh_m2 < a.sun_kWh_m2 ? b : a));
      let cells = '<i></i>'.repeat(off);
      for (let dd = 1; dd <= n; dd++) { const ds = `2026-${String(month + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, x = byDate[ds], cls = x ? (x.fully_solar ? 'g' : 'o') : (fdays.has(ds) ? 'f' : 'n');
        cells += `<button class="cd ${cls} ${ds === $('day').value ? 'sel' : ''}" data-d="${ds}" ${cls === 'n' ? 'disabled' : ''} title="${x ? `outside max ${f(x.outside_max_C, 1)} °C · sun ${f(x.sun_kWh_m2, 1)} kWh/m² · grid ${f(x.grid_h, 1)} h · ${inr(x.value_INR)}` : (cls === 'f' ? 'forecast' : 'no data')}">${dd}</button>`; }
      P_.innerHTML = `<button class="x" id="pX">×</button><h3><button id="cPrev">‹</button> ${MONTHS[month]} 2026 <button id="cNext">›</button></h3>
        <div class="calg">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<b>${x}</b>`).join('')}${cells}</div>
        <p class="src"><span class="cd g">·</span> fully solar + ice <span class="cd o">·</span> some grid <span class="cd f">·</span> forecast</p>
        <p>Jump to: <a href="#" data-j="${hot.date}T14">hottest day</a> · <a href="#" data-j="${dateOf(MODE.Night[0])}T23">hottest night</a> · <a href="#" data-j="${grid.date}T20">most grid use</a> · <a href="#" data-j="${dull.date}T13">a dull monsoon day</a></p>`;
      $('pX').onclick = () => { P_.hidden = true; };
      $('cPrev').onclick = () => openCal(Math.max(0, month - 1)); $('cNext').onclick = () => openCal(Math.min(11, month + 1));
      P_.querySelectorAll('.cd[data-d]').forEach(b => { b.onclick = () => { play(false); $('day').value = b.dataset.d; draw(); openCal(month); }; });
      P_.querySelectorAll('a[data-j]').forEach(a_ => { a_.onclick = e => { e.preventDefault(); const [dd, hh] = a_.dataset.j.split('T'); play(false); $('day').value = dd; $('hour').value = +hh; draw(); openCal(+dd.slice(5, 7) - 1); }; });
    }
    $('calBtn').onclick = () => openCal(+$('day').value.slice(5, 7) - 1);
    // ---- low graphics
    $('lowg').onchange = () => $('stage').classList.toggle('lowg', $('lowg').checked);
    // ---- guided tour (Start demo) and judge mode (?judge=1)
    const TOUR = [['flowers_outside', 'Day', 'This is a small solar cold room for loose flowers near Visakhapatnam.'],
      ['room_flowers_chiller', 'Day', `The R290 chiller stands outside. Only cold glycol goes through the wall: ${D.r290_inside_room_g} g of R290 inside.`],
      ['chiller_outdoor', 'Day', 'By day the solar panels run the chiller. The green pump moves the glycol.'],
      ['flowers_inside', 'Day', 'Inside, the air cooler holds the room at the set-point. Flowers sit bagged in crates.'],
      ['flowers_inside', 'Day', 'Spare solar power freezes water in the finned panels: the ice is the battery.'],
      ['A10_interior_evaporator', 'Night', 'At night the pump is off and both valves are closed.'],
      ['flowers_inside', 'Night', 'The ice melts slowly and cold air sinks from the fins by itself. No grid on most nights.'],
      ['A11_solar_canopy_closeup', 'Monsoon', 'On dull monsoon days the sun is too weak. Then the grid helps a little.'],
      ['flowers_outside', 'Auto', `Result so far: ${f(RS.days_full_solar_ice)} of ${DAYS} days fully on solar + ice. See the other pages for the details.`]];
    let ti = -1, tTimer = null, tPaused = false;
    function tourStep(k) {
      ti = (k + TOUR.length) % TOUR.length;
      const [file, mode, text] = TOUR[ti], si = slides.findIndex(x => x.file === file);
      if (si >= 0) showSlide(si);
      setMode(mode); $('tourBox').hidden = false; $('tourTx').textContent = `${ti + 1}/${TOUR.length} · ${text}`;
      clearTimeout(tTimer);
      if (!tPaused) tTimer = setTimeout(() => { if (ti < TOUR.length - 1 || judge) tourStep(ti + 1); else tourStop(); }, judge ? 12000 : 8000);
    }
    function tourStop() { clearTimeout(tTimer); ti = -1; $('tourBox').hidden = true; $('tourBtn').textContent = '▶ Start demo'; }
    const judge = qs.get('judge') === '1';
    $('tourBtn').onclick = () => { if (ti >= 0) tourStop(); else { play(false); tPaused = false; $('tourBtn').textContent = '■ Stop demo'; tourStep(0); } };
    $('tNext').onclick = () => tourStep(ti + 1); $('tPrev').onclick = () => tourStep(ti - 1); $('tStop').onclick = tourStop;
    $('tPause').onclick = () => { tPaused = !tPaused; $('tPause').textContent = tPaused ? '▶▶' : '❚❚'; if (!tPaused) tourStep(ti); else clearTimeout(tTimer); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { tourStop(); $('panel').hidden = true; } });
    if (qs.get('t')) { const [dd, hh] = qs.get('t').split('T'); if (dd >= dateOf(0) && dd <= dateOf(nd - 1)) { $('day').value = dd; $('hour').value = parseInt(hh || '12', 10); } }
    if (judge) { document.body.classList.add('judge'); setTimeout(() => { $('tourBtn').click(); }, 1500); $('stage').addEventListener('click', e => { if (!e.target.closest('button,a,input,select')) $('tPause').click(); }); }
    draw();
  };

  // ------------------------------------------------------------------ HOW IT WORKS
  P.how = () => {
    const g = D.glycol, ph = K.photos, hx = K.ice_hx, pcm = K.pcm;
    const slab = Math.round(1000 * D.ice_kg / (pcm.density_kg_m3 * pcm.slab_area_m2));
    const fig = (k, cap) => (ph[k] ? `<figure><img src="${ph[k].file}" alt="${esc(ph[k].what)}" loading="lazy"><figcaption>${esc(cap || ph[k].caption)} – a typical example, not our unit. ${esc(ph[k].credit)} · <a href="${ph[k].source}">source</a></figcaption></figure>` : '');
    $('app').innerHTML = `<h2>How it works ${range()}</h2>
      <div class="card diagram"><div class="zero">${D.r290_inside_room_g} g R290 inside the room</div>
        <figure><img src="assets/how/glycol_loop.jpg" alt="Diagram: outdoor R290 chiller with compressor, condenser and plate heat exchanger; glycol pump; V-ROOM valve to the glycol air cooler; V-ICE valve to the finned storage panels; orange return line" style="height:auto;object-fit:contain">
</figure></div>
      <div class="cols">
       <div class="card"><h3>The physics in the twin ${C} ${E}</h3>${table(['', N], [
        ['Glycol supply for the air cooler ' + E, f(g.supply_room_C) + ' °C'], ['Glycol supply when charging ice ' + E, f(g.supply_ice_C) + ' °C'],
        ['Plate heat-exchanger approach ' + E, f(g.hx_approach_K) + ' K'], ['R290 evaporating temperature (room / ice) ' + C, `${f(D.T_evap_room_C)} / ${f(D.T_evap_ice_C)} °C`],
        ['Glycol heat capacity ' + E, f(g.cp_kJ_kgK, 1) + ' kJ/kg·K'], ['Glycol freezes at ' + E, f(g.freeze_C) + ' °C'], ['Glycol flow ' + C, f(D.glycol_m_dot_kg_s, 3) + ' kg/s'],
        ['Pump ' + E, f(g.pump_W) + ' W, only when the chiller runs'], ['Pipe heat gain ' + E, f(g.pipe_UA_W_K) + ' W/K to the outside air'],
        ['Chiller COP over the year ' + S, `${f(RS.COP_chiller, 2)} (realistic) · ${f(ID.COP_chiller, 2)} (ideal)`],
        ['Pump energy ' + S, f(RS.pump_kWh_day, 2) + ' kWh/day'], ['Compressor energy ' + S, f(RS.compressor_kWh_day, 2) + ' kWh/day'],
        ['Cold lost in pipes + pump heat ' + S, f(RS.pipe_loss_kWh_day + RS.pump_heat_kWh_day, 2) + ' kWh/day'],
       ], { note: 'COP = R290 cycle from CoolProp at the evaporating temperature and condensing at outside air + 10 K (same compressor model as the old twin).' })}</div>
      </div>`;
  };

  // ------------------------------------------------------------------ FLOWERS
  P.flowers = () => {
    const fit = { Excellent: 'ok', Good: 'ok', 'Short holds': 'wn', 'Not suitable': 'bd' };
    const H = K.holds.flowers;
    const rows = Object.entries(K.crops).map(([k, c]) => {
      const h = (H[k] || {}).best_practice || {};
      const cell = d => (h[d] ? (h[d].allowed ? `${f(h[d].freshness_kept_pct)} %` : `<span class="src">${f(h[d].freshness_kept_pct)} % (not allowed)</span>`) : '–');
      return [`<div class="fcell">${fpic(k)}<div><b>${esc(c.label)}</b><br><span class="src"><i>${esc(c.latin)}</i></span></div></div>`, c.best_storage_C[0] === c.best_storage_C[1] ? c.best_storage_C[0] + ' °C' : c.best_storage_C.join('–') + ' °C',
        c.rh_pct.join('–') + ' %', f(c.shelf_life_ambient_days * 24) + ' h (' + f(c.shelf_life_ambient_days, 1) + ' d)', f(c.shelf_life_bagged_4C_days, 0) + ' days',
        `<span class="pill ${fit[c.fit_at_4C]}">${c.fit_at_4C}</span> <span class="src">${esc(c.fit_note)}</span>`,
        cell('1'), cell('2'), cell('3'), h['1'] ? f(h['1'].freshness_no_room_pct) + ' %' : '–', c.kg_per_crate.join('–') + ' kg', c.ethylene_sensitivity];
    });
    $('app').innerHTML = `<div class="wide"><h2>Flowers for a ${f(D.setpoint_C)} °C room ${range()}</h2>
      <div class="card ftable">${table(['Flower', n('Best storage °C ' + E), n('RH'), n('Shelf life outside (about 30 °C) ' + E), n('Shelf life bagged at 4 °C ' + E), 'Fit at 4 °C',
        n('Freshness kept in our room after 1 day ' + S), n('2 days ' + S), n('3 days ' + S), n('1 day with no cold room ' + S), n('kg per crate ' + E), 'Ethylene'], rows,
        { note: 'Freshness = 100 % when picked, 0 % at the end of the reference shelf life. In our room: bagged, loaded at 06:00 at the outside temperature, taken out at 05:00 (so "1 day" is 23 hours); best-practice case.' })}${fcred()}</div>
      <h2>Where each value comes from</h2>
      <div class="card">${Object.values(K.crops).map(c => `<details><summary>${esc(c.label)}</summary><ul class="plain src">
        <li>Best temperature: ${esc(c.best_storage_source)}</li><li>Shelf life outside: ${esc(c.shelf_life_ambient_source)}</li><li>Shelf life bagged at 4 °C: ${esc(c.shelf_life_bagged_source)}</li>
        <li>Q10 ${c.Q10}: ${esc(c.Q10_source)}</li><li>Respiration heat at 0 / 5 / 10 / 20 °C: ${Object.values(c.respiration_mW_kg).join(' / ')} mW/kg – ${esc(c.respiration_source)}</li>
        <li>Heat capacity ${c.cp_kJ_kgK} kJ/kg·K: ${esc(c.cp_source)}</li><li>Bulk density ${c.bulk_density_kg_m3} kg/m³: ${esc(c.bulk_density_source)} ${esc(c.kg_per_crate_source)}</li>
        <li>Ethylene: ${esc(c.ethylene_source)}</li><li>Chilling limit ${c.chill_injury_below_C} °C: ${esc(c.chill_source)}</li>
        <li>Water loss: ${esc(c.freshness.K_t_source)} ${esc(c.freshness.WL_max_source)}</li>${c.boric_acid_dip ? `<li>Boric-acid dip: ${esc(c.boric_source)}</li>` : ''}
        <li>Prices: ${esc(c.price_source)}</li></ul></details>`).join('')}</div></div>`;
  };

  // ------------------------------------------------------------------ SEASON PLANNER
  P.season = () => {
    const cal = K.plan.calendar, M = K.monthly.best_practice, pm = cal.price_model, FK = Object.keys(K.crops);
    const COL = { jasmine: '#2a78d6', marigold: '#eb6834', rose: '#1baf7a', tuberose: '#eda100', chamanthi: '#e87ba4', crossandra: '#008300' };      // fixed order, validated
    const short = k => crop(k).label.split(' (')[0];
    const mOf = m => M.find(x => x.month === m);
    const SUP = ['off season', 'in season', 'peak'];
    // ---- season calendar: flowers × months, shade = supply; festivals and weddings on top
    const fest = cal.festivals.map(x => ({ ...x, m: +x.date.slice(5, 7), d: +x.date.slice(8) }));
    const wed = m => cal.windows.filter(w => w.weddings && +w.from.slice(0, 4) === 2026 && +w.from.slice(5, 7) <= m && (+w.to.slice(0, 4) > 2026 || +w.to.slice(5, 7) >= m)).length > 0;
    const noWed = m => cal.windows.some(w => !w.weddings && +w.from.slice(0, 4) === 2026 && +w.from.slice(5, 7) <= m && (+w.to.slice(0, 4) > 2026 || +w.to.slice(5, 7) >= m));
    const grid = `<div class="scal" role="table" aria-label="Season calendar">
      <div class="sc-h"></div>${MONTHS.map(m => `<div class="sc-h">${m}</div>`).join('')}
      <div class="sc-l">Festivals</div>${MONTHS.map((_, i) => `<div class="sc-f">${fest.filter(x => x.m === i + 1).map(x => `<span class="fdot ${x.confirmed ? '' : 'unc'}" data-tip="${esc(x.name)} – ${x.d} ${MONTHS[i]}${x.confirmed ? '' : ' (date not confirmed, E)'}">${x.d}</span>`).join('')}</div>`).join('')}
      <div class="sc-l">Weddings</div>${MONTHS.map((_, i) => `<div class="sc-w ${wed(i + 1) ? 'on' : ''} ${noWed(i + 1) ? 'no' : ''}" data-tip="${wed(i + 1) ? 'Wedding season' : ''}${noWed(i + 1) ? (wed(i + 1) ? ' · ' : '') + 'No-wedding period (Ashadha / Dhanurmasam)' : ''}${!wed(i + 1) && !noWed(i + 1) ? 'No wedding season' : ''}"></div>`).join('')}
      ${FK.map(k => `<div class="sc-l">${fpic(k)}${esc(short(k))}</div>${MONTHS.map((mn, i) => { const sv = cal.supply[k][i], m = mOf(i + 1), fr = m && m.freshness_at_takeout_pct[k];
        return `<div class="sc-c s${sv}" data-tip="${esc(short(k))}, ${mn}: ${SUP[sv]}${fr != null ? ` · freshness at take-out ${f(fr)} %` : ''}">${fr != null ? `<b>${f(fr)}</b>` : ''}</div>`; }).join('')}`).join('')}
      <div class="sc-l">What the room does</div>${MONTHS.map((mn, i) => `<div class="sc-n" data-tip="${esc(mn)}: ${esc(cal.plan.months[i + 1])}">ⓘ</div>`).join('')}
    </div>
    <div class="sc-key"><span><i class="sw s2"></i> peak supply (prices low – glut)</span><span><i class="sw s1"></i> in season</span><span><i class="sw s0"></i> off season (prices high)</span>
      <span><b class="fdot">14</b> festival day</span><span><b class="fdot unc">27</b> date not confirmed ${E}</span><span><i class="sw wd"></i> wedding season</span><span><i class="sw nw"></i> no weddings</span>
      <span>Number in a cell = freshness kept at take-out (%) ${S}</span></div>`;
    const chart = (id, title, unit, tag) => `<div class="card mini"><h3>${title} ${tag}</h3><div class="cbox"><canvas id="${id}" aria-label="${esc(title)} by month"></canvas></div><p class="src">${unit}</p></div>`;
    const tot = k => M.reduce((a, m) => a + (m[k] || 0), 0);
    $('app').innerHTML = `<h2>Season planner – January to December ${E} ${range()}</h2>
      <div class="tiles">
        ${tile('Flowers stored', f(tot('kg_stored')), 'kg', 'in the simulated days', 'big')}
        ${tile('Days with stock', f(K.plan.days_with_stock_full_year), 'days', `full-year plan · research estimate ${cal.research_estimate.days_with_stock.join('–')}`, 'big')}
        ${tile('Value captured ' + E, inr(tot('value_INR')), '', 'in the simulated days', 'big')}
        ${tile('Busiest month', MONTHS[K.monthly.busiest_month - 1], '', 'most kg per day', 'big')}
        ${tile('Hardest month for the room', MONTHS[K.monthly.hardest_month - 1], '', `${f(K.monthly.hardest_months[0].grid_h_per_day, 1)} grid h/day, ice down to ${f(K.monthly.hardest_months[0].wax_sunrise_worst_pct ?? K.monthly.hardest_months[0].ice_sunrise_worst_pct)} % at sunrise`, 'big')}
      </div>
      <div class="card"><h3>The flower year at a glance</h3>${grid}</div>
      <h2>Month by month ${S}</h2>
      <div class="minis">${chart('cKg', 'Flowers stored', 'kg a month', S)}${chart('cVal', 'Value captured', '₹ a month', E)}${chart('cEn', 'Electricity: sun and grid', 'kWh a month', S)}
        ${chart('cDays', 'Days with flowers inside', 'days a month', S)}${chart('cRoom', 'Room temperature', '°C, monthly average', S)}${chart('cRh', 'Room humidity', '%, monthly average with flowers inside', S)}</div>
      <div class="card"><h3>Price model ${E} – ₹/kg through 2026</h3><div class="leg">${FK.map(k => `<span><i style="background:${COL[k]}"></i>${esc(short(k))}</span>`).join('')}</div><div class="cbox tall"><canvas id="pc"></canvas></div><p class="src">${esc(pm.note)}</p></div>
      <details class="card"><summary>Show all of this as a table</summary>${table(['Month', 'In season', 'Festivals', 'What the room does', n('kg stored'), n('Days with stock'), n('Energy kWh'), n('Grid h'), n('Room °C'), n('RH %'), n('₹ captured')],
        MONTHS.map((mn, i) => { const m = mOf(i + 1); return [mn, FK.filter(k => cal.supply[k][i] > 0).map(short).join(', '), fest.filter(x => x.m === i + 1).map(x => `${esc(x.name)} ${x.d}`).join('<br>') || '–', esc(cal.plan.months[i + 1]),
          m ? f(m.kg_stored) : '–', m ? f(m.days_with_stock) : '–', m ? f(m.energy_kWh) : '–', m ? f(m.grid_h) : '–', m ? f(m.room_avg_C, 1) : '–', m && m.rh_avg_pct ? f(m.rh_avg_pct) : '–', m ? inr(m.value_INR) : '–']; }),
        { note: esc(K.monthly.value_definition) + ' Months without weather yet are shown as –.' })}</details>
      <p class="src">${esc(cal.muhurtham_proxy.note)} High-value days = ${esc(K.plan.high_value_definition)}.</p>
      <div class="tip" id="tip" hidden></div>`;
    // tooltip for the calendar cells
    const tip = $('tip');
    document.querySelectorAll('[data-tip]').forEach(el => {
      el.addEventListener('mouseenter', () => { tip.textContent = el.dataset.tip; tip.hidden = false; const r = el.getBoundingClientRect(); tip.style.left = Math.min(window.innerWidth - 300, r.left + window.scrollX) + 'px'; tip.style.top = (r.bottom + window.scrollY + 6) + 'px'; });
      el.addEventListener('mouseleave', () => { tip.hidden = true; });
      el.tabIndex = 0; el.addEventListener('focus', () => el.dispatchEvent(new Event('mouseenter'))); el.addEventListener('blur', () => { tip.hidden = true; });
    });
    if (!window.Chart) return;
    const dark = matchMedia('(prefers-color-scheme: dark)').matches, ink = dark ? '#c3c2b7' : '#52514e', gridc = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)';
    const labels = M.map(m => MONTHS[m.month - 1]);
    const base = (yt, extra = {}) => ({ animation: false, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: { x: { grid: { display: false }, ticks: { color: ink, maxRotation: 0, autoSkip: false, font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: gridc }, ticks: { color: ink, maxTicksLimit: 5, callback: v => (v >= 1000 ? (v / 1000) + 'k' : v) }, title: { display: false, text: yt } } }, ...extra });
    const bar = (id, data, col, yt) => new Chart($(id), { type: 'bar', data: { labels, datasets: [{ label: yt, data, backgroundColor: col, borderRadius: { topLeft: 4, topRight: 4 }, maxBarThickness: 26 }] }, options: base(yt) });
    const line = (id, data, col, yt, mn, mx) => new Chart($(id), { type: 'line', data: { labels, datasets: [{ label: yt, data, borderColor: col, backgroundColor: col, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6 }] },
      options: base(yt, { scales: { x: { grid: { display: false }, ticks: { color: ink } }, y: { min: mn, max: mx, grid: { color: gridc }, ticks: { color: ink, maxTicksLimit: 5 } } } }) });
    bar('cKg', M.map(m => m.kg_stored), '#2a78d6', 'kg stored');
    bar('cVal', M.map(m => m.value_INR), '#2a78d6', '₹ captured');
    bar('cDays', M.map(m => m.days_with_stock), '#2a78d6', 'days with stock');
    new Chart($('cEn'), { type: 'bar', data: { labels, datasets: [{ label: 'From the sun', data: M.map(m => m.solar_kWh), backgroundColor: '#eda100', borderColor: dark ? '#1a1a19' : '#fcfcfb', borderWidth: { top: 2 }, stack: 'e', maxBarThickness: 26 },
      { label: 'From the grid', data: M.map(m => m.grid_kWh), backgroundColor: '#e34948', borderRadius: { topLeft: 4, topRight: 4 }, stack: 'e', maxBarThickness: 26 }] },
      options: base('kWh', { plugins: { legend: { display: true, position: 'top', align: 'start', labels: { color: ink, boxWidth: 12, boxHeight: 12 } }, tooltip: { mode: 'index', intersect: false } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { color: ink } }, y: { stacked: true, beginAtZero: true, grid: { color: gridc }, ticks: { color: ink, maxTicksLimit: 5 } } } }) });
    line('cRoom', M.map(m => m.room_avg_C), '#2a78d6', '°C', 0, 8);
    line('cRh', M.map(m => m.rh_avg_pct), '#2a78d6', 'RH %', 80, 100);
    const pr = K.plan.prices_INR_kg;
    new Chart($('pc'), { type: 'line', data: { labels: pr.dates, datasets: FK.map(k => ({ label: short(k), data: pr[k], borderColor: COL[k], backgroundColor: COL[k], pointRadius: 0, borderWidth: 2, stepped: true })) },
      options: { animation: false, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: ink, maxTicksLimit: 12 } }, y: { grid: { color: gridc }, ticks: { color: ink }, title: { display: true, text: '₹/kg (E)', color: ink } } } } });
  };

  // ------------------------------------------------------------------ HUMIDITY
  P.humidity = () => {
    const h = K.humidity, o = h.options, hc = K.humidity_cfg;
    $('app').innerHTML = `<h2>Humidity – 4 options compared ${S} ${range()}</h2>
      <p>Flowers want ${D.rh_target_pct.join('–')} % relative humidity. Cold surfaces (the air cooler and the ice panels) take water out of the air; the flowers give a little back.
        The twin keeps a water balance of the room air every 5 minutes.</p>
      <div class="card">${table(['Option', n('Average RH'), n('Hours/day below 85 %'), n('Flower weight loss %/day'), n('Extra energy kWh/day'), n('Water use L/day'), n('₹ value of flowers ' + E)],
        Object.entries(o).map(([k, v]) => ({ hl: k === h.best, c: [esc(v.label) + (k === h.best ? ' <span class="pill ok">best</span>' : ''), f(v.rh_avg_pct, 1) + ' %', f(v.rh_below_85_h_day, 2), f(v.weight_loss_pct_per_day, 2),
          f(v.extra_energy_kWh_day, 2), f(v.water_use_L_day, 2), inr(v.value_INR)] })),
        { note: 'RH counts only the hours with flowers inside. Realistic model + smart controller, seasonal plan. Best = ' + esc(h.best_why) + '.' })}</div>
      <div class="card"><h3>What each option costs ${E}</h3>${table(['Option', n('One-time low'), n('One-time mid'), n('One-time high'), n('Yearly low'), n('Yearly mid'), n('Yearly high'), n('RH gained against nothing'), n('Yearly ₹ per % RH gained'), 'Yearly cost is'],
        Object.entries(K.cost.humidity_options).map(([k, v]) => ({ hl: k === K.cost.humidity_best_value, c: [esc(v.label) + (k === K.cost.humidity_best_value ? ' <span class="pill ok">best value</span>' : ''), inr(v.one_time_INR.low), inr(v.one_time_INR.mid), inr(v.one_time_INR.high),
          inr(v.yearly_INR.low), inr(v.yearly_INR.mid), inr(v.yearly_INR.high), (v.rh_gain_pct_points >= 0 ? '+' : '') + f(v.rh_gain_pct_points, 1) + ' points', v.yearly_INR_per_pct_RH_gained ? inr(v.yearly_INR_per_pct_RH_gained) : 'no RH gain', esc(v.yearly_parts)] })),
        { note: 'Best value = ' + esc(K.cost.humidity_best_value_why) + '. Bags alone lower the room RH a little (the flowers give less water to the air) but they protect the flowers themselves, so bags are used in every option except "nothing". Full fogger cost: <a href="cost.html">Cost & ROI</a>.' })}</div>
      <div class="note bd">💧 ${esc(h.rules.water)}</div><div class="note">${esc(h.rules.fogger_water)}</div>
      <div class="card"><h3>Assumptions ${E}</h3><ul class="plain src">${Object.values(h.E).map(x => `<li>${esc(x)}</li>`).join('')}
        <li>Fogger: ${f(hc.fogger_L_h, 2)} L/h, ${f(hc.fogger_W)} W, on below ${f(hc.fogger_on_below_pct)} %, off at ${f(hc.fogger_off_at_pct)} %. Tray: ${f(hc.tray_area_m2, 1)} m².</li></ul></div>`;
  };

  // ------------------------------------------------------------------ SAFETY
  P.safety = () => {
    const lim = D.r290_room_limit_g, old = K.compare.old.ideal.r290_inside_room_g;
    $('app').innerHTML = `<h2>Safety – R290 stays outside</h2>
      <div class="card"><div class="zero">${D.r290_inside_room_g} g R290 inside the room</div>
        <div class="tiles">${tile('Room limit for R290 ' + C, '≈ ' + f(lim), 'g', `0.2 × 0.038 kg/m³ × ${f(D.room_m3, 1)} m³`, 'big')}${tile('Our design', f(D.r290_inside_room_g), 'g inside', 'all R290 is in the sealed outdoor chiller', 'big good')}
        ${tile('Earlier design (archived)', old.join('–'), 'g inside', 'above the room limit', 'big warn')}</div></div>
      <div class="cols">
       <div class="card"><h3>R290 facts</h3><ul class="plain">
        <li>R290 is propane: a natural refrigerant with very low global-warming effect, but it burns (class A3).</li>
        <li>The largest charge allowed inside a room follows the "20 % of the lower flammable limit" rule: 0.2 × LFL × room volume (EN 378 / ISO 5149 logic; IS 16678). For our ${f(D.room_m3, 1)} m³ room this is about ${f(lim)} g.</li>
        <li>IEC 60335-2-89's 500 g limit applies only to self-contained appliances, not to our system.</li>
        <li>So we keep the R290 in a factory-sealed chiller outdoors and bring the cold in with ${esc(D.glycol.fluid)} (food-safe family of glycol, freezes at about ${f(D.glycol.freeze_C)} °C ${E}).</li></ul></div>
       <div class="card"><h3>Standards</h3><ul class="plain"><li><b>EN 378 / ISO 5149</b> – safety of refrigerating systems, charge limits.</li><li><b>IS 16678</b> – Indian adoption of ISO 5149.</li>
        <li><b>IS 2370</b> – walk-in cold rooms.</li><li><b>IS 18847</b> – flammable refrigerants: safe handling and servicing.</li></ul>
        <p class="src">Standard titles are given in short form – check the current editions before design sign-off ${E}.</p></div>
       <div class="card"><h3>Leak tests</h3><ul class="plain"><li>Leak (gas) sensor at the outdoor unit, wired to the controller: alarm and chiller stop.</li><li>All field joints on the glycol side are simple water-type joints; any refrigerant joints are brazed, not flared.</li>
        <li>Pressure test with dry nitrogen, then vacuum test, before the chiller is started.</li></ul></div>
       <div class="card"><h3>Service rules</h3><ul class="plain"><li>Only a trained technician opens the refrigerant circuit.</li><li>No flame or sparks near the outdoor unit; keep 1 m clear around it.</li>
        <li>Check the glycol strength once a year; top up with the same glycol.</li><li>Nobody works on the chiller from inside the room: there is no refrigerant there.</li></ul></div>
      </div>`;
  };

  // ------------------------------------------------------------------ TRUST METHOD (Φ)
  P.method = () => {
    const ev = K.phi_eval, dz = K.phi_design, pc = K.phi_cfg;
    if (!ev) { $('app').innerHTML = '<h2>Trust method</h2><p>Run <code>python -m twin.phi.evaluate</code> first.</p>'; return; }
    const h = ev.honest_year, cl = ev.calibration, bc = ev.biased_cusum;
    const pct = x => (x === null || x === undefined ? '–' : f(100 * x) + ' %');
    const mins = x => (x === null || x === undefined ? '–' : f(x) + ' min');
    const rows = ev.cases.map(c => `<tr class="${c.key === 'honest' ? '' : c.detection_rate >= 0.9 ? 'good' : c.detection_rate >= 0.5 ? 'warn' : 'bad'}"><td>${esc(c.label)}</td><td>${pct(c.detection_rate)}</td><td>${mins(c.median_ttf_min)}</td>
      <td>${Object.entries(c.by_layer_rate).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${pct(v)}`).join(', ') || '–'}</td><td>${Object.keys(c.fired).slice(0, 2).join(', ') || '–'}</td>
      <td>${c.isolation_correct_rate === null ? '–' : pct(c.isolation_correct_rate)}</td></tr>`).join('');
    const blind = dz ? Object.entries(dz.states).map(([st, v]) => `<li><b>${esc(st)}</b>: ${v.blind['physics only'].length} blind sensor sets with physics only, ${v.blind['physics + external references'].length} with external references too.</li>`).join('') : '';
    $('app').innerHTML = `<h2>Trust method – how Φ checks the sensor data ${S}</h2>
      <div class="note bd">Everything on this page was tested on a <b>simulated</b> cold room (S): a "truth" twin whose walls, chiller, flowers and ice behave differently from the checker's model,
        with simulated sensor errors and simulated attacks. Nothing here is measured. All assumptions are in <code>config/phi.json</code> and marked ${E}.</div>
      <div class="cols">
       <div class="card"><h3>1 · Residuals: "what physics expects" minus "what the sensors say"</h3><ul class="plain">
        <li><b>R1 room heat</b>: C<sub>a</sub>ΔT/Δt − [walls + door + inside heat + flowers − ice panels − air cooler − fogger]</li>
        <li><b>R2 flower heat</b> (per kg): c·ΔT<sub>f</sub>/Δt − [air → flower + respiration − transpiration]</li>
        <li><b>R3 glycol loop</b>: ṁc(T<sub>ret</sub> − T<sub>sup</sub>) − [air cooler + pipe gains + pump heat]</li>
        <li><b>R4 chiller map</b>: P<sub>chiller</sub>·COP(T<sub>out</sub> of the weather service, T<sub>sup</sub>) vs the glycol cooling (%)</li>
        <li><b>R5 ice</b>, <b>R6 moisture</b>, <b>R9 room probes</b> (high vs middle), <b>R10</b> daily energy closure</li>
        <li>External (owner cannot edit): <b>R7</b> outside T/humidity vs the weather service, <b>R8</b> power vs the PV inverter log, <b>R8d</b> daily grid kWh vs the utility meter</li>
        <li>Hard rules: <b>H1</b> COP above ${f(100 * pc.hard_rules.carnot_frac)} % of Carnot, <b>H2</b> RH above 100 % or supply warmer than the room while cooling, <b>H3</b> ice "frozen" but its temperature is off the melting plateau</li></ul>
        <p class="src">Readings within ${pc.masking.after_door_min} min of a door opening, ${pc.masking.after_load_min} min of loading and ${pc.masking.after_control_steps} readings of a control change are not judged by R1/R5/R6 ${E}.
        A hot load or an open door widens the allowed spread: √(noise² + Σ(u·flow)²) with u = door ${f(100 * pc.model_uncertainty.door)} %, flowers ${f(100 * pc.model_uncertainty.flowers)} %, transpiration ${f(100 * pc.model_uncertainty.transpiration)} % ${E}.</p></div>
       <div class="card"><h3>2 · One number: Φ</h3><ul class="plain">
        <li>Each residual is standardised with the noise learnt on the first ${cl.calibration_days} honest days, its memory removed (AR(1)): e = (z<sub>k</sub> − ρz<sub>k−1</sub>)/√(1−ρ²).</li>
        <li>Combined with their correlation Σ: <b>χ² = eᵀΣ⁻¹e</b>, m = number of residuals active now.</li>
        <li><b>Φ<sub>inst</sub> = Φ<sub>N</sub>⁻¹(F<sub>χ²(m)</sub>(χ²))</b> – a "sigma" number: Φ = 3 always means the same small chance, whether 2 or 10 checks are active.</li>
        <li>Slow lies: <b>S<sub>k</sub> = max(0, S<sub>k−1</sub> + χ²<sub>k</sub> − m − κ)</b>, Φ<sub>slow</sub> = 3S/h (κ = ${f(cl.cusum_kappa, 2)}, h = ${f(cl.cusum_h)}) ${E}.</li>
        <li>Daily closure: Φ<sub>day</sub> = |R10 or R8d − normal| / spread, held for the next day.</li>
        <li><b>Φ = max(Φ<sub>inst</sub>, Φ<sub>slow</sub>, Φ<sub>day</sub>, 99 if a hard rule breaks)</b>. FLAG when Φ ≥ ${pc.flag.phi} for ${pc.flag.steps} readings in a row, or a hard rule breaks.</li>
        <li>After calibration the checker keeps learning with a ${pc.calibration.adapt_days}-day memory, only from un-flagged readings, bounded to ${pc.calibration.adapt_sd_range[1]}× the spread ${E}.</li></ul>
        <p class="src">Why not the old "S = S + Φ − 1" with Φ = max|z|: on honest data max|z| averages ${f(bc.mean_phi_max, 2)}, so S grows by about ${f(bc.drift_per_day)} per day and alarms forever.</p></div>
       <div class="card"><h3>3 · Which sensor is lying? (isolation)</h3><ul class="plain">
        <li>For the hour after a flag, each owner sensor is nudged in the model to see how every residual would move (a Jacobian J).</li>
        <li>For every set S of up to ${pc.isolation.max_set} sensors: <b>GLR = ‖y‖² − min<sub>b</sub>‖y − J<sub>S</sub>b‖²</b>, minus ${f(pc.isolation.penalty, 2)} per sensor. The best set is the suspect; b is its estimated bias.</li>
        <li>Safe Mode quarantines the suspects: outside T is replaced by the weather service, room and glycol values by "reported − bias". Freshness then uses these trusted values, or the worst case (no cooling) when nothing explains the data.</li></ul></div>
       <div class="card"><h3>4 · What physics cannot see – and what covers it</h3><ul class="plain">
        <li><b>Watermark</b>: the controller moves the glycol supply set-point by ±${f(pc.watermark.amplitude_K, 1)} K in a secret pattern; once a day the record must correlate with it (z ≥ ${f(pc.watermark.supply_z_flag)}). Honest days: ${h.watermark_false_days} of ${h.watermark_days} below the line (S).</li>
        <li><b>Hash chain</b>: every reading is signed and chained; a replay of yesterday is a bit-identical copy.</li>
        <li><b>External references</b>: the weather service, the inverter log and the utility meter cannot be edited by the owner.</li>
        <li><b>A fully consistent fake – every owner sensor taken from a good model on the real weather – breaks no physics. Φ alone cannot catch it.</b> Only the watermark and the external data can.</li>
        ${blind ? `<li>Rank test on 1-hour windows (S): <ul>${blind}</ul> Details: docs/phi_design.md.</li>` : ''}</ul></div>
      </div>
      <div class="card"><h3>Honest record ${S}</h3><div class="tiles">${tile('False flags', f(h.false_flags_per_30_days, 2), 'per 30 days', `${h.false_flags} in ${f(h.days_scored)} days after the ${cl.calibration_days} calibration days`, h.false_flags_per_30_days <= 2 ? 'good' : 'warn')}
        ${tile('Readings flagged', f(100 * h.flagged_fraction, 1), '%', 'mostly the daily closure holding a flag for a day')}${tile('Φ_inst ≥ 3', f(100 * h.phi_inst_ge3_fraction, 2), '% of readings', 'Gaussian theory: 0.13 % – real residuals have heavier tails')}</div></div>
      <div class="card"><h3>Attacks: ${ev.starts_per_case} random start times each, ${ev.horizon_h} h to catch ${S}</h3>
        <div class="tscroll"><table class="tbl"><thead><tr><th>Case</th><th>Caught</th><th>Median time</th><th>Layers that caught it</th><th>First residual</th><th>Right sensor isolated</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="src">Full table with the "why": docs/phi_results.md. Data: results/live/phi_eval_2026.json.</p></div>
      <div class="card"><h3>Limits and real-world data still needed</h3><ul class="plain">
        <li>The noise, bias and tails of REAL sensors (we used ${E} offsets, noise and lags), and of a real room's model error.</li>
        <li>A real door/curtain air-exchange measurement, the real chiller COP map and glycol flow, and a season of honest data to set κ, h and the spreads.</li>
        <li>The real latency and gaps of the weather service, inverter log and utility meter feeds.</li>
        <li>The watermark must be tried on the real chiller: does a ±0.3 K supply pattern stay visible and harmless?</li>
        <li>Red-team tests by people who know the method – the simulated attacks here are only a start.</li></ul></div>`;
  };

  // ------------------------------------------------------------------ COST
  P.cost = () => {
    const c = K.cost, L = ['low', 'mid', 'high'], tw = c.twin_inputs, g = c.glycol_vs_old, fy = c.fogger_yearly_INR, fi = c.fogger_inputs;
    const lm = o => L.map(k => inr(o[k]));
    const H3 = ['', n('Low ' + E), n('Mid ' + E), n('High ' + E)];
    const fg = c.cases.farmer_group, f35 = c.cases.farmer_subsidy_35, f50 = c.cases.farmer_subsidy_50;
    $('app').innerHTML = `<h2>Cost and ROI ${E} ${range()}</h2>
      <div class="note">Every price here is an assumption (low / mid / high) until real quotations arrive. Energy, water, kg and ₹ value come from the twin (best-practice case) ${S}.</div>
      <div class="tiles">${tile('Total cost ' + E, inr(c.total_cost_INR.mid), '', `${inr(c.total_cost_INR.low)} – ${inr(c.total_cost_INR.high)}`, 'big')}
        ${tile('Payback – farmer group', f(fg.mid.payback_years, 1), 'years', `${f(fg.payback_best_years, 1)} – ${f(fg.payback_worst_years, 1)} years`, 'big')}
        ${tile('With ' + c.assumptions_E.benefit.subsidy_pct + ' % subsidy', f(f35.mid.payback_years, 1), 'years', `scheduled areas (${c.assumptions_E.benefit.subsidy_scheduled_areas_pct} %): ${f(f50.mid.payback_years, 1)} years`, 'big')}
        ${tile('Yearly grid bill ' + E, inr(c.running_INR_yr.mid.grid_electricity_INR), '', `${f(tw.grid_kWh_per_year)} kWh × ₹${f(c.tariff_INR_kWh.mid)}/kWh`, 'big')}</div>
      <div class="card"><h3>Bill of materials – every line low / mid / high ${E}</h3>
        ${table(['Item', n('Low ' + E), n('Mid ' + E), n('High ' + E)], c.bom.map(b => [esc(b.item), ...lm(b)]).concat([{ hl: 1, c: ['<b>TOTAL = sum of the lines above</b>', ...lm(c.total_cost_INR)] }]),
          { note: esc(c.total_check) })}</div>
      <div class="card" style="border-style:dashed"><h3>Glycol design against the old in-room R290 design <span class="pill wn">${esc(g.label)}</span></h3>
        ${table(H3, [['<b>New cold-side items:</b> ' + g.new_items.map(x => esc(x.item)).join(' + '), ...lm(g.new_total_INR)],
          ['<b>Old items:</b> ' + esc(g.old_item), ...lm(g.old_total_INR)], { hl: 1, c: ['<b>Difference (new − old)</b>', ...lm(g.difference_INR)] }], { note: esc(g.why) + ' This difference is NOT added to the total.' })}</div>
      <div class="card"><h3>Yearly running cost</h3>${table(H3, [
        [`Grid electricity: ${f(tw.grid_kWh_per_year)} kWh/yr ${S} × tariff`, ...L.map(k => inr(c.running_INR_yr[k].grid_electricity_INR))],
        ['Upkeep', ...L.map(k => inr(c.running_INR_yr[k].upkeep_INR))], [`PE bags for ${f(tw.kg_planned_full_year)} kg/yr`, ...L.map(k => inr(c.running_INR_yr[k].bags_INR))],
        ['Fogger (table below)', ...L.map(k => inr(c.running_INR_yr[k].fogger_INR))], { hl: 1, c: ['<b>Total per year</b>', ...L.map(k => inr(c.running_INR_yr[k].total_INR))] }],
        { note: `Pump: ${f(tw.pump_kWh_per_year)} kWh/yr ${S} of ${f(tw.electric_kWh_per_year)} kWh/yr in total. ${esc(tw.pump_note)}` })}</div>
      <div class="card"><h3>Fogger – full yearly cost</h3>${table(H3, [
        [`RO water: ${f(fi.water_L_per_day, 2)} L/day × 365 = ${f(fi.water_L_per_year)} L ${S} × price per litre`, ...L.map(k => inr(fy[k].ro_water_INR))],
        [`Electricity: ${f(fi.fogger_W)} W × ${f(fi.run_hours_per_year)} run hours = ${f(fi.electric_kWh_per_year, 1)} kWh ${S} × tariff`, ...L.map(k => inr(fy[k].electricity_INR))],
        ['Replacement ultrasonic disc / parts', ...L.map(k => inr(fy[k].disc_parts_INR))], ['Cleaning and disinfection', ...L.map(k => inr(fy[k].cleaning_INR))],
        { hl: 1, c: ['<b>Fogger per year</b>', ...L.map(k => inr(fy[k].total_INR))] }], { note: 'One-time cost of the fogger, RH controller and RO filter is in the bill of materials. Options compared on the <a href="humidity.html">Humidity</a> page.' })}</div>
      <div class="card"><h3>Payback by case</h3>${table(['Case', n('Total cost (mid)'), n('Benefit ₹/yr (mid)'), n('Running ₹/yr'), n('Net ₹/yr'), n('Simple payback'), n('Best – worst'), n('10-year net value')],
        Object.values(c.cases).map(x => [esc(x.label), inr(x.mid.total_cost_INR), inr(x.mid.benefit_INR_yr), inr(x.mid.running_INR_yr), inr(x.mid.net_INR_yr),
          x.mid.payback_years && x.mid.payback_years < 40 ? f(x.mid.payback_years, 1) + ' yr' : '<span class="pill bd">does not pay back</span>',
          (x.payback_best_years ? f(x.payback_best_years, 1) : '–') + ' – ' + (x.payback_worst_years ? f(x.payback_worst_years, 1) + ' yr' : 'never'), inr(x.mid.ten_year_net_INR)]),
        { note: `(a) ${esc(c.benefit.farmer_group.how)}. (b) ${esc(c.benefit.rent_only.how)}. ${esc(c.assumptions_E.benefit.subsidy_note)}` })}</div>
      <div class="card"><h3>Money sensitivity: farmer-group payback if prices rise less ${E}</h3>
        ${table(['Festival price multiplier', ...c.sensitivity.sale_day_multiplier.map(x => n('Sale-day uplift ×' + x))], c.sensitivity.rows.map(row => ['×' + row.festival_multiplier,
          ...row.cells.map(x => (x.payback_years ? `<b>${f(x.payback_years, 1)} yr</b>` : '<span class="pill bd">no payback</span>') + `<br><span class="src">${inr(x.benefit_INR_yr)}/yr · with ${c.assumptions_E.benefit.subsidy_pct} % subsidy ${x.payback_35_years ? f(x.payback_35_years, 1) + ' yr' : '–'}</span>`)]),
          { note: esc(c.sensitivity.note) + ` Our base case is ×${c.sensitivity.base.festival_multiplier} and ×${c.sensitivity.base.sale_day_multiplier}. Total and running cost: mid values.` })}</div>
      <div class="card"><h3>ROI by season ${E}</h3>${table(['Season', n('kg stored ' + S), n('Price uplift'), n('Surplus held'), n('Losses avoided'), n('₹ value'), n('Share of running cost'), n('Net'), n('ROI on total cost')],
        Object.values(c.seasons).map(s => [esc(s.label), f(s.kg), inr(s.price_uplift_INR), inr(s.surplus_held_INR), inr(s.loss_avoided_INR), inr(s.value_INR), inr(s.running_share_INR), inr(s.net_INR), f(s.roi_on_total_cost_pct, 1) + ' %']),
        { note: esc(c.season_note) })}</div>`;
  };

  // ------------------------------------------------------------------ REALITY CHECK
  P.reality = () => {
    const r = K.reality, L = r.leave_one_out, w = K.ice, ld = K.load, sp = K.flowers.setpoint_5C, xr = K.flowers.extra_racks, pr = K.practice, so = K.solar, rk = pr.racks;
    const head = ['Case', n(`Days fully on solar + ice (of ${DAYS})`), n('Grid h/yr'), n('Grid kWh/yr'), n('Sun share of electricity'), n('Hours outside band'), n('Hours above alarm'), n('Night room max °C'), n('Chiller COP')];
    const row = (lab, c, hl) => ({ hl, c: [lab, f(c.days_full_solar_ice), f(c.grid_h_per_year), f(c.grid_kWh_per_year), f(c.solar_share_of_electricity_pct) + ' %', f(c.hours_outside_band), f(c.hours_above_alarm), f(c.night_room_max_C, 1), f(c.COP_chiller, 2)] });
    const fr = c => ['jasmine', 'marigold', 'rose'].map(k => `${crop(k).label.split(' (')[0]} ${Object.values(c.freshness_after_days[k]).map(x => f(x)).join(' / ')}`).join('<br>');
    const pc = pr.cases, maxS = Math.max(...pr.items_alone.rows.map(x => Math.abs(x.grid_kWh_saved_per_year)));
    const cur = so.options.current, bestS = so.options[so.best];
    $('app').innerHTML = `<h2>Reality check ${S} ${range()}</h2>
      <h2>Three cases side by side</h2>
      <div class="card">${table(['', n('Ideal'), n('<b>Best practice (optimum) – headline</b>'), n('Poor practice')], [
        [`Days fully on solar + ice (of ${DAYS})`, ...['ideal', 'best_practice', 'poor_practice'].map(k => f(pc[k].days_full_solar_ice))],
        ['Grid hours a year', ...['ideal', 'best_practice', 'poor_practice'].map(k => f(pc[k].grid_h_per_year))],
        ['Grid use in the simulated days', ...['ideal', 'best_practice', 'poor_practice'].map(k => `${f(pc[k].grid_h)} hours on ${f(pc[k].days_with_grid)} days${pc[k].grid_months ? '<br>(mostly ' + pc[k].grid_months + ')' : ''}`)],
        ['Grid kWh a year', ...['ideal', 'best_practice', 'poor_practice'].map(k => f(pc[k].grid_kWh_per_year))],
        ['Yearly grid bill ' + E, ...['ideal', 'best_practice', 'poor_practice'].map(k => inr(pc[k].grid_bill_INR_per_year.mid))],
        ['Hours above ' + D.band_C[1] + ' °C', ...['ideal', 'best_practice', 'poor_practice'].map(k => f(pc[k].hours_above_band_top))],
        ['Hours below 2 °C (must be 0) · coldest room °C', ...['ideal', 'best_practice', 'poor_practice'].map(k => `${f(pc[k].hours_below_2C)} · ${f(pc[k].room_min_C, 1)} °C`)],
        ['Freshness kept after 1 / 2 / 3 days (%)', ...['ideal', 'best_practice', 'poor_practice'].map(k => fr(pc[k]))],
        ['₹ value captured ' + E, ...['ideal', 'best_practice', 'poor_practice'].map(k => inr(pc[k].value_INR))]],
        { note: `Best practice = realistic losses + ${pr.best_practice_rules.map(x => esc(x.toLowerCase())).join('; ')}. Poor practice = realistic losses + ${esc(pr.poor_practice_is)}. ${esc(pr.ideal_freshness_note)} ${esc(pr.night_fan_note)}` })}</div>
      <div class="card"><h3>Which rule matters most? Each best-practice rule alone ${S}</h3>
        <p class="src">${esc(pr.items_alone.about)} Poor practice needs ${f(pr.items_alone.baseline_grid_kWh_per_year)} grid kWh a year.</p>
        ${pr.items_alone.rows.map(x => `<div class="bar"><span>${esc(x.label)}</span><div class="bt"><i class="${x.grid_kWh_saved_per_year < 0 ? 'neg' : ''}" style="width:${Math.max(1, 100 * Math.abs(x.grid_kWh_saved_per_year) / maxS)}%"></i></div>
          <b>${x.grid_kWh_saved_per_year < 0 ? '+' + f(-x.grid_kWh_saved_per_year) + ' kWh more' : f(x.grid_kWh_saved_per_year) + ' kWh saved'}</b><em>${inr(x.value_gain_INR)} flower value</em></div>`).join('')}
        <p class="src">Bags (with the fogger) use a little more electricity but protect the flowers: that is where the ₹ value comes from ${E}.</p></div>
      <div class="card"><h3>Racks: ${f(rk.racks.length)} racks (L-shape), ${f(rk.shelf_levels)} shelf levels × ${f(rk.crates_per_level)} crates (${rk.racks.map(x => x.crates_per_shelf).join(' + ')}) = ${f(rk.crate_places)} crate places</h3>
        ${table(['Rack material ' + E, n('Mass kg'), n('Heat capacity kJ/K'), n('Electricity kWh/yr ' + S), n('Grid kWh/yr ' + S), n('Hours to 6 °C ' + S), n('Cost low'), n('Cost mid'), n('Cost high')],
          Object.entries(rk.options).map(([k, v]) => ({ hl: k === rk.chosen, c: [esc(v.label) + (k === rk.chosen ? ' <span class="pill ok">chosen</span>' : '') + `<br><span class="src">${esc(v.note)}</span>`, f(v.kg_total), f(v.heat_capacity_kJ_K, 1),
            f(v.electric_kWh_per_year), f(v.grid_kWh_per_year, 1), f(v.time_to_6C_h_avg, 1), inr(v.INR.low), inr(v.INR.mid), inr(v.INR.high)] })), { note: esc(rk.about) })}</div>
      <div class="card"><h3>Pipe and pump losses ${S}</h3>
        ${table(['Option', n('Pipe heat gain W/K ' + E), n('Pump W ' + E), n('Pipe loss kWh/day'), n('Pump kWh/day'), n('Electricity kWh/yr'), n('Saved kWh/yr'), n('Grid kWh/yr'), n('Days fully solar + ice'), n('Extra cost (mid) ' + E), n('₹ per kWh saved, 10 years')],
          Object.entries(K.pipe.options).map(([k, v]) => ({ hl: k === K.pipe.best, c: [esc(K.pipe.labels[k]) + (k === K.pipe.best ? ' <span class="pill ok">chosen</span>' : ''), f(v.pipe_UA_W_K, 1), f(v.pump_W), f(v.pipe_loss_kWh_day, 2), f(v.pump_kWh_day, 2),
            f(v.electric_kWh_per_year), f(v.electric_kWh_saved_per_year), f(v.grid_kWh_per_year), f(v.days_full_solar_ice), inr(v.extra_cost_INR.mid), v.INR_per_kWh_saved_10yr ? '₹' + f(v.INR_per_kWh_saved_10yr, 2) : '–'] })),
          { note: esc(K.pipe.note) + ` Tariff ₹${f(K.pipe.tariff_INR_kWh)}/kWh ${E}. ` + esc(K.pipe.E.note) })}</div>
      <h2>Can it run on solar only (no grid at all)?</h2>
      <div class="note bd">Not fully. With the grid removed, even the best option has ${f(bestS.no_grid.nights_failed_above_8C)} nights a year-so-far above ${D.alarm_C[1]} °C.
        The failures come on dull monsoon days with too little sun to run the chiller at all, not from the night storage. Grid backup is a small top-up: the first design (paraffin) needs
        ${f(so.current_design_grid_bill.grid_kWh_per_year)} kWh = ${inr(so.current_design_grid_bill.mid)} a year; with ice panels ${f(bestS.with_grid_backup.grid_kWh_per_year)} kWh = ${inr(bestS.with_grid_backup.grid_bill_INR_per_year.mid)} ${E}.</div>
      <div class="card">${table(['Option (realistic + smart)', n('Days fully solar'), n('Grid h/yr'), n('Grid kWh/yr'), n('Grid bill ₹/yr ' + E), n('NO GRID: h/yr above 6 °C'), n('NO GRID: h/yr above 8 °C'), n('Worst night peak °C'), n('Nights failed'),
        n('Coldest panel °C'), n('Extra cost (mid) ' + E), 'Freshness 1 / 2 / 3 days'],
        so.order.map(k => { const o = so.options[k], g = o.with_grid_backup, ng = o.no_grid; return { hl: k === so.best, c: [esc(o.label) + (k === so.best ? ' <span class="pill ok">chosen</span>' : ''), f(g.days_full_solar), f(g.grid_h_per_year), f(g.grid_kWh_per_year),
          inr(g.grid_bill_INR_per_year.mid), f(ng.hours_above_6C_per_year), f(ng.hours_above_8C_per_year), f(ng.worst_night_peak_C, 1), f(ng.nights_failed_above_8C), f(o.chilling_check.panel_min_C, 1), inr(o.extra_cost_INR.mid),
          ['jasmine', 'marigold'].map(c => `${crop(c).label.split(' (')[0]} ${Object.values(o.freshness_after_days[c]).map(x => f(x)).join(' / ')}`).join('<br>')] }; }),
        { note: `Rule: ${esc(so.best_rule)}. ${esc(so.option_C)} ${esc(cur.chilling_check.note)} Failed nights with no grid cost the paraffin design about ${f(cur.no_grid.failed_nights_freshness.freshness_lost_pct_points)} freshness points on the fills that sat through them.` })}
        <p><b>Why the first (paraffin) design failed without grid:</b> ${esc(so.why_current_fails.cause)}</p>
        <p class="src">Hours above 6 °C by month (no grid, paraffin): ${Object.entries(so.why_current_fails.hours_above_6C_by_month).map(([m, v]) => MONTHS[m - 1] + ' ' + f(v)).join(' · ')}.
          By hour of day: ${so.why_current_fails.hours_above_6C_by_hour.map((v, h) => h + 'h ' + f(v)).join(' · ')}.</p></div>
      <h2>Each real-life loophole alone, then all together</h2>
      <p class="src">Loading at 13:00 and 6 door openings, as in the first plan. "Realistic + smart" here is the middle case between best and poor practice.</p>
      <div class="card">${table(head, r.order.map(k => row(esc(r.cases[k].label) + (r.cases[k].E ? `<br><span class="src">${E} ${esc(r.cases[k].E)}</span>` : ''), r.cases[k], k === 'realistic_smart')))}</div>
      <div class="card"><h3>Leave one out: which loophole matters most?</h3>${table(['REALISTIC + smart controller, but without…', n('Days on solar + ice'), n('Grid h/yr'), n('Grid kWh/yr')],
        [[`<b>(all loopholes on)</b>`, f(L.with_all.days_full_solar_ice), f(L.with_all.grid_h_per_year), f(L.with_all.grid_kWh_per_year)]].concat(
          Object.entries(L.without).sort((a, b) => a[1].grid_kWh_per_year - b[1].grid_kWh_per_year).map(([k, c]) => [esc(r.cases[k].label), f(c.days_full_solar_ice), f(c.grid_h_per_year), f(c.grid_kWh_per_year)])), { note: esc(L.about) })}</div>
      <div class="card"><h3>Ice mass: ${f(w.chosen_kg)} kg chosen</h3>${table([n('Ice kg'), n('Storage cost ' + E), n('Grid kWh/yr – realistic'), n('10-year cost (storage + grid) ' + E), n('Days on solar + ice – ideal'), n('Grid kWh/yr – ideal')],
        w.rows.map(x => ({ hl: x.ice_kg === w.chosen_kg, c: [f(x.ice_kg), inr(x.ice_cost_INR), f(x.realistic.grid_kWh_per_year), inr(x.ten_year_cost_INR), f(x.ideal.days_full_solar_ice), f(x.ideal.grid_kWh_per_year)] })),
        { note: esc(w.about) + ' ' + esc(w.why) + ` Same room with no storage: ${f(w.no_ice_realistic.grid_kWh_per_year)} grid kWh/yr.` })}</div>
      <div class="card"><h3>Grid-help limit</h3><p>${esc(K.night.why)}</p>${table([n('Grid may help above'), n('Days on solar + ice – realistic'), n('Grid kWh/yr – realistic'), n('Days on solar + ice – ideal')],
        K.night.rows.map(x => ({ hl: x.grid_help_above_C === D.controller.protect_above_C, c: [f(x.grid_help_above_C, 1) + ' °C', f(x.realistic_smart.days_full_solar_ice), f(x.realistic_smart.grid_kWh_per_year), f(x.ideal.days_full_solar_ice)] })))}</div>
      <div class="card"><h3>Load per fill (marigold, one fill a day)</h3>${table([n('kg per fill'), n('Crates needed'), 'Fits the ' + ld.crate_places + ' crate places?', n('Grid kWh/yr'), n('Hours outside band'), n('Hours to 6 °C'), n('Freshness kept')],
        ld.rows.map(x => [f(x.kg_per_fill), f(x.crates_needed), x.fits ? '<span class="pill ok">yes</span>' : '<span class="pill bd">no – flowers are bulky</span>', f(x.grid_kWh_per_year), f(x.hours_outside_band), f(x.time_to_6C_h_avg, 1), f(x.freshness_kept_pct) + ' %']))}
        ${table(['Flower', n('kg per crate ' + E), n('Full room, ' + ld.crate_places + ' crates'), n('With extra racks, ' + xr.crate_places + ' crates')], Object.entries(ld.capacity_kg_by_flower).map(([k, v]) => [esc(crop(k).label), v.kg_per_crate.join('–'), f(v.room_kg) + ' kg', f(v.room_kg_extra_racks) + ' kg']))}
        <p class="src">Extra racks (${esc(xr.aisle_note)}): ${f(xr.extra_kg_stored)} kg more stored, ${f(xr.extra_grid_kWh_per_year)} kWh/yr more grid, ${inr(xr.extra_value_INR)} more value ${E}. Not chosen: the plan keeps 2 racks and ${f(rk.crate_places)} crates.</p></div>
      <div class="card"><h3>Set-point 5 °C instead of ${f(D.setpoint_C)} °C</h3>${table(head, [row(`${f(D.setpoint_C)} °C – ideal`, ID), row('5 °C – ideal', sp.ideal), row(`${f(D.setpoint_C)} °C – realistic + smart`, RL, 1), row('5 °C – realistic + smart', sp.realistic_smart)],
        { note: 'At 5 °C the band and the grid-help limit move up by 1 K as well.' })}</div>`;
  };

  // ------------------------------------------------------------------ LIVE 2026
  P.live = () => {
    const v = K.live, h = v.headline, t = v.totals, lr = `<span class="range">${esc(v.date_range.label)}</span>`, HR = K.hourly;
    const band = D.band_C, hi = band[1], days = v.daily, fc = v.forecast.days, byDate = {};
    days.forEach(d => { byDate[d.date] = d; });
    fc.forEach(d => { if (!byDate[d.date]) byDate[d.date] = Object.assign({ forecast: true }, d); });
    const today = days[days.length - 1].date, tomorrow = fc.length ? fc[0].date : null;
    const t0 = new Date(HR.t0.replace(' ', 'T') + '+05:30');
    const hIdx = date => Math.round((new Date(date + 'T00:00:00+05:30') - t0) / 3600000);
    const avgFresh = days.reduce((s_, d) => s_ + (d.hours_above_band_fresh || 0), 0) / days.length;
    const other = days.reduce((s_, d) => s_ + (d.hours_above_band_other || 0), 0);
    const KIND = { solar: ['solar', 'fully on solar + ice'], loading: ['load', 'grid only during morning loading'], grid: ['grid', 'grid at other times'] };
    const fmtD = d => new Date(d + 'T00:00:00+05:30').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const cropName = k => esc((crop(k) || { label: k }).label.split(' (')[0]);
    $('app').innerHTML = `
      <div class="lv-head"><h2>Live Year Run <small>real 2026 Visakhapatnam weather</small> ${S}</h2>
        <div class="lv-meta"><span>Weather up to ${esc(v.weather_last_hour)} IST · ${esc(v.weather_source)}</span>
          <span>🔋 No battery for cooling (the ice is the storage). Small 12 V battery only for sensors and controller.</span>
          <span class="lv-sim">Simulated – digital twin, nothing measured</span></div>
        <div class="lv-ok">Room air above ${f(hi)} °C only while a fresh warm batch is cooling: <b>${f(avgFresh, 1)} h/day</b> on average. All other times: <b>${f(other)} h</b> outside ${band.join('–')} °C. ${lr}</div></div>
      <div class="seg tabs" id="lvTabs">${[['year', 'Year so far'], ['cal', 'Calendar'], ['today', 'Today'], ['tom', 'Tomorrow'], ['months', 'Month by month'], ['money', 'Money'], ['inputs', 'Fixed inputs'], ['how', '₹ Money: how we calculate']]
        .map(([k, l]) => `<button data-t="${k}"${k === 'how' ? ' class="lv-money"' : ''}>${l}</button>`).join('')}</div>
      <div id="lvTab"></div>`;
    let charts = [];
    const kill = () => { charts.forEach(c => c.destroy()); charts = []; };

    // ---------- one day: summary + charts
    function daySummary(date) {
      const d = byDate[date];
      if (!d) return `<div class="card"><p>No twin data for ${esc(date)}.</p></div>`;
      const fresh = (d.fresh_in || []).map(x => `${f(x.kg)} kg ${cropName(x.crop)} in at ${esc(x.time)}`).join(', ');
      const f0 = (d.fresh_in || [])[0];
      const kind = d.forecast ? '<span class="pill wn">PREDICTION – forecast run through the twin</span>' : (KIND[d.day_kind] || KIND.grid)[1];
      const cell = (l, val, sub) => `<div class="lv-c"><span>${l}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
      return `<div class="card lv-day"><h3>${fmtD(date)} – day summary ${d.forecast ? '' : S}</h3><div class="lv-grid">
        ${cell('Outside', d.outside_avg_C !== undefined ? f(d.outside_avg_C, 1) + ' °C' : `${f(d.outside_min_C, 1)}–${f(d.outside_max_C, 1)} °C`, `max ${f(d.outside_max_C, 1)} °C`)}
        ${cell('Sunlight', f(d.sun_kWh_m2, 2) + ' kWh/m²', d.rain_mm !== undefined ? `rain ${f(d.rain_mm, 1)} mm` : '')}
        ${d.heat_load_kWh !== undefined ? cell('Heat load', f(d.heat_load_kWh, 1) + ' kWh', 'walls, door, flowers, fans') : ''}
        ${d.cooling_kWh !== undefined ? cell('Cooling made by the chiller', f(d.cooling_kWh, 1) + ' kWh', 'room + ice charging') : ''}
        ${cell('Electricity (cooling system)', f(d.electric_kWh !== undefined ? d.electric_kWh : d.solar_kWh + d.grid_kWh, 2) + ' kWh', d.compressor_h !== undefined ? `chiller ran ${f(d.compressor_h, 1)} h` : '')}
        ${cell('Solar available / used', `${d.pv_available_kWh !== undefined ? f(d.pv_available_kWh, 1) : '–'} / ${f(d.solar_kWh, 1)} kWh`)}
        ${cell('Grid', f(d.grid_kWh, 2) + ' kWh', `${f(d.grid_h, 1)} h of grid assist`)}
        ${cell('Room min / max', d.room_min_C !== undefined ? `${f(d.room_min_C, 1)} / ${f(d.room_max_C, 1)} °C` : `max ${f(d.room_max_C, 1)} °C`, d.rh_avg_pct !== undefined ? `room RH ${f(d.rh_avg_pct)} %` : '')}
        ${cell('Ice lowest / end of day', d.ice_min_pct !== undefined ? `${f(d.ice_min_pct)} / ${f(d.ice_end_pct)} %` : `${f(d.ice_sunrise_pct)} → ${f(d.ice_sunset_pct)} %`, d.ice_min_pct !== undefined ? 'frozen share of the ice panels' : 'sunrise → sunset')}
        ${cell('Fresh flowers in', f0 ? `${f(f0.kg)} kg at ${esc(f0.time)}` : (d.planned_in && d.planned_in.length ? d.planned_in.map(x => Object.entries(x.parts).map(([k, kg]) => `${f(kg)} kg ${cropName(k)}`).join(', ')).join('; ') + ' (plan)' : 'none'),
          f0 ? `${f(f0.T_in_C, 1)} °C, to ${f(t.cooled_to_C)} °C in ${f0.cool_h !== null ? f(f0.cool_h, 1) + ' h' : '–'}` : '')}
        ${d.door_openings !== undefined ? cell('Door openings', f(d.door_openings)) : ''}
        ${d.hours_above_band_fresh !== undefined ? cell(`Room > ${f(hi)} °C while fresh flowers cool`, f(d.hours_above_band_fresh) + ' h', `other times ${f(d.hours_above_band_other)} h`) : ''}
        ${cell('Day', kind)}
        ${d.kg_out ? cell('Flowers out', f(d.kg_out) + ' kg', `value ${inr(d.value_INR)} ${E}`) : ''}
      </div>${d.forecast ? `<p class="note wn"><b>${esc(d.text)}</b></p>` : ''}
      <p class="src">Weather this day: ${d.forecast ? 'Open-Meteo forecast' : esc(v.weather_source)}. Room humidity IS modelled (fogger + liners). Fresh flowers in: ${fresh || '–'}.</p></div>
      <div class="lv-charts"><div class="card"><h3>Temperatures (°C)</h3><canvas id="lvT"></canvas></div><div class="card"><h3>Humidity (%)</h3><canvas id="lvH"></canvas></div>
        <div class="card"><h3>Sunlight on flat ground (W/m²)</h3><canvas id="lvS"></canvas></div><div class="card"><h3>Electricity (kW) and ice (%)</h3><canvas id="lvE"></canvas></div></div>`;
    }
    function dayCharts(date) {
      if (!window.Chart) return;
      const i0 = hIdx(date), sl = (k, a = 1) => (HR[k] ? HR[k].slice(i0, i0 + 24).map(x => (x === null ? null : x * a)) : []);
      if (i0 < 0 || i0 >= HR.n) return;
      const lab = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
      const o = (yt, extra) => Object.assign({ animation: false, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { title: { display: true, text: 'Time of day (IST)' } }, y: { title: { display: true, text: yt } } } }, extra || {});
      const kgs = sl('kg');
      const fresh = sl('T_batch').map((x, i) => (kgs[i] > 0 ? x : null));
      charts.push(new Chart($('lvT'), { type: 'line', data: { labels: lab, datasets: [
        { label: 'Outside', data: sl('T_out'), borderColor: '#f97316', pointRadius: 0, tension: .3 },
        { label: 'Room', data: sl('T_room'), borderColor: '#2a78d6', pointRadius: 0, tension: .3 },
        { label: 'Fresh batch', data: fresh, borderColor: '#10b981', pointRadius: 0, tension: .3, spanGaps: false }] }, options: o('Temperature (°C)') }));
      charts.push(new Chart($('lvH'), { type: 'line', data: { labels: lab, datasets: [
        { label: 'Outside RH', data: sl('RH_out'), borderColor: '#8b5cf6', pointRadius: 0, tension: .3 },
        { label: 'Room RH', data: sl('RH_room'), borderColor: '#0ea5e9', pointRadius: 0, tension: .3 }] }, options: o('Relative humidity (%)', { scales: { x: { title: { display: true, text: 'Time of day (IST)' } }, y: { min: 0, max: 100, title: { display: true, text: 'Relative humidity (%)' } } } }) }));
      charts.push(new Chart($('lvS'), { type: 'bar', data: { labels: lab, datasets: [{ label: 'Sunlight', data: sl('ghi'), backgroundColor: '#f59e0b' }] }, options: o('W/m²', { plugins: { legend: { display: false } } }) }));
      charts.push(new Chart($('lvE'), { data: { labels: lab, datasets: [
        { type: 'bar', label: 'Solar used kW', data: sl('P_sol'), backgroundColor: 'rgba(20,184,166,.6)', stack: 'p' },
        { type: 'bar', label: 'Grid kW', data: sl('P_grid'), backgroundColor: '#ef4444', stack: 'p' },
        { type: 'line', label: 'Ice frozen %', data: sl('ice'), borderColor: '#64748b', pointRadius: 0, yAxisID: 'y2' }] },
        options: o('kW', { scales: { x: { stacked: true, title: { display: true, text: 'Time of day (IST)' } }, y: { stacked: true, title: { display: true, text: 'kW' } }, y2: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: 'ice %' } } } }) }));
    }

    // ---------- calendar
    function calendar() {
      const months = [];
      Object.keys(byDate).sort().forEach(d => { const m = d.slice(0, 7); if (!months.includes(m)) months.push(m); });
      const html = months.map(m => {
        const [y, mo] = m.split('-').map(Number), first = new Date(Date.UTC(y, mo - 1, 1)), nd = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        const pad = (first.getUTCDay() + 6) % 7;
        let cells = '<span class="dow">M</span><span class="dow">T</span><span class="dow">W</span><span class="dow">T</span><span class="dow">F</span><span class="dow">S</span><span class="dow">S</span>' + '<span></span>'.repeat(pad);
        for (let dd = 1; dd <= nd; dd++) {
          const ds = `${m}-${String(dd).padStart(2, '0')}`, x = byDate[ds];
          if (!x) { cells += `<span class="day none">${dd}</span>`; continue; }
          const cls = x.forecast ? 'fc' : (KIND[x.day_kind] || KIND.grid)[0];
          const tip = x.forecast ? `${ds}: forecast` : `${ds}: ${(KIND[x.day_kind] || KIND.grid)[1]} · room max ${f(x.room_max_C, 1)} °C · grid ${f(x.grid_kWh, 2)} kWh`;
          cells += `<button class="day ${cls}${ds === today ? ' today' : ''}" data-d="${ds}" title="${esc(tip)}" aria-label="${esc(tip)}">${dd}</button>`;
        }
        return `<div class="card lv-month"><h3>${MONTHS[mo - 1]} ${y}</h3><div class="lv-cal">${cells}</div></div>`;
      }).join('');
      const n = k => days.filter(d => d.day_kind === k).length;
      return `<h3>Calendar – click a day</h3><div class="lv-legend"><span><i class="solar"></i>fully on solar + ice (${n('solar')})</span><span><i class="load"></i>grid only during morning loading (${n('loading')})</span>
        <span><i class="grid"></i>grid at other times (${n('grid')})</span><span><i class="fc"></i>tomorrow and later (forecast)</span></div>
        <div class="lv-months">${html}</div><div id="lvDay"></div>`;
    }
    function showDay(date) {
      kill();
      document.querySelectorAll('.lv-cal .day.sel').forEach(b => b.classList.remove('sel'));
      const b = document.querySelector(`.lv-cal [data-d="${date}"]`); if (b) b.classList.add('sel');
      $('lvDay').innerHTML = daySummary(date); dayCharts(date);
      try { history.replaceState(null, '', '#cal=' + date); } catch (e) { /* file:// */ }
    }

    // ---------- other tabs
    const V = {
      year: () => `<div class="tiles">
        ${tile('Days fully on solar + ice', f(t.days_fully_solar), `of ${f(t.days)}`, '', 'big good')}${tile('Grid backup', f(t.grid_kWh, 1), 'kWh', `${f(t.grid_h)} hours · bill ${inr(t.grid_bill_INR)} at ₹${f(t.tariff_INR_kWh)}/kWh ${E}`, 'big')}
        ${tile('Electricity used', f(t.electric_kWh), 'kWh', `${f(t.solar_kWh)} kWh from the sun (${f(100 * t.solar_kWh / t.electric_kWh)} %)`, 'big')}${tile('Solar available', f(t.pv_available_kWh), 'kWh', `${f(100 * t.solar_kWh / t.pv_available_kWh)} % used`)}
        ${tile('Flowers stored', f(h.kg_stored), 'kg', `${f(h.days_with_stock)} days with stock, ${f(h.fills_done)} fills`)}${tile('Value captured ' + E, inr(h.value_INR), '', `uplift ${inr(h.price_uplift_INR)} + surplus held ${inr(h.surplus_held_INR)} + losses avoided ${inr(h.loss_avoided_INR)}`)}
        ${tile('Hours outside ' + band.join('–') + ' °C', f(h.hours_outside_band), 'h', `above alarm: ${f(h.hours_above_alarm)} h`)}${tile('Humidity (flowers inside)', f(h.rh_avg_pct, 1), '%', `fogger water ${f(h.water_fog_L_day, 2)} L/day`)}
        ${tile('Chiller COP', f(h.COP_chiller, 2), '', `${f(h.electric_kWh_day, 2)} kWh/day`)}</div>
        <div class="note ok">${gridLine(t.grid_h, t.days_with_grid, t.grid_months, t.days_fully_solar, t.days)}. Hours below 2 °C: ${f(t.hours_below_2C)} (coldest room ${f(t.room_min_C, 1)} °C).</div>
        <div class="card"><h3>Day by day ${lr}</h3><canvas id="lc" height="80"></canvas></div>
        <div class="card"><h3>Every day</h3><div style="max-height:520px;overflow:auto">${table(['Date', n('Outside max °C'), n('Sun kWh/m²'), n('Room avg °C'), n('Room max °C'), n('RH %'), n('Ice at sunrise %'), n('Flowers inside kg'), n('Solar kWh'), n('Grid kWh'), n('Grid h'), ''],
          days.slice().reverse().map(d => [`<a href="#cal=${d.date}">${d.date}</a>`, f(d.outside_max_C, 1), f(d.sun_kWh_m2, 1), f(d.room_avg_C, 1), f(d.room_max_C, 1), f(d.rh_avg_pct), f(d.ice_sunrise_pct), f(d.kg_inside_max), f(d.solar_kWh, 2), f(d.grid_kWh, 2), f(d.grid_h, 1),
            `<span class="pill ${d.day_kind === 'solar' ? 'ok' : 'wn'}">${(KIND[d.day_kind] || KIND.grid)[1]}</span>`]))}</div></div>
        <p class="src">Weather: ${esc(v.weather_source)}. The studies on the other pages use the frozen first ${f(DAYS)} days so they can be repeated exactly; this report runs on to the newest weather.</p>`,
      cal: calendar,
      today: () => `<p>Newest day with saved weather: <b>${fmtD(today)}</b>.</p><div id="lvDay"></div>`,
      tom: () => `<p>${esc(v.forecast.about)}</p><div class="cols">${fc.map(d => `<div class="card"><h3>${fmtD(d.date)} <span class="pill ${d.kind === 'storm' ? 'bd' : d.kind === 'normal' ? 'ok' : 'wn'}">${esc(d.kind.replace('_', ' '))}</span></h3><p><b>${esc(d.text)}</b></p>
          <button class="lvgo" data-d="${d.date}">Show this day</button></div>`).join('')}</div><div id="lvDay"></div>
        <p class="src">${esc(v.forecast.rules.note)} Official warnings: <a href="${v.forecast.rules.imd_url}">India Meteorological Department</a>.</p>`,
      months: () => `<div class="card"><h3>Month by month ${S}</h3>${table(['Month', n('Days'), n('kg stored'), n('Days with stock'), n('Electricity kWh'), n('Solar kWh'), n('Grid kWh'), n('Grid h'), n('Room avg °C'), n('Room max °C'), n('RH %'), n('Outside avg °C'), n('Ice at sunrise, worst %'), n('Door openings'), n('₹ captured ' + E)],
        v.monthly.map(m => [MONTHS[m.month - 1], f(m.days), f(m.kg_stored), f(m.days_with_stock), f(m.energy_kWh), f(m.solar_kWh), f(m.grid_kWh, 1), f(m.grid_h), f(m.room_avg_C, 1), f(m.room_max_C, 1), m.rh_avg_pct ? f(m.rh_avg_pct) : '–',
          f(m.outside_avg_C, 1), f(m.ice_sunrise_worst_pct), f(m.door_openings), inr(m.value_INR)]))}</div><div class="card"><h3>Month by month – energy</h3><canvas id="lvM" height="90"></canvas></div>`,
      money: () => `<div class="tiles">${tile('Value captured ' + E, inr(h.value_INR), '', lr, 'big good')}${tile('Price uplift', inr(h.price_uplift_INR), '', 'held for a better sale day')}${tile('Surplus held', inr(h.surplus_held_INR), '', 'instead of a distress sale')}
          ${tile('Losses avoided', inr(h.loss_avoided_INR), '', 'post-festival glut that had no buyer')}${tile('Grid bill', inr(t.grid_bill_INR), '', `${f(t.grid_kWh, 1)} kWh × ₹${f(t.tariff_INR_kWh)}/kWh ${E}`)}</div>
        <div class="card"><h3>By flower</h3>${table(['Flower', n('kg'), n('Fills'), n('Days held (avg)'), n('Freshness at take-out'), n('Worst'), n('With no cold room'), n('₹ captured ' + E)],
          Object.entries(v.by_flower).map(([k, x]) => [cropName(k), f(x.kg), f(x.fills), f(x.hold_days_avg, 1), f(x.freshness_kept_pct) + ' %', f(x.freshness_kept_worst_pct) + ' %', f(x.freshness_no_room_pct) + ' %', inr(x.value_INR)]))}</div>
        <div class="card"><h3>By season</h3>${table(['Season', n('kg'), n('Price uplift'), n('Surplus held'), n('Losses avoided'), n('₹ total ' + E)],
          Object.values(v.by_season).map(x => [esc(x.label), f(x.kg), inr(x.price_uplift_INR), inr(x.surplus_held_INR), inr(x.loss_avoided_INR), inr(x.value_INR)]))}</div>`,
      inputs: () => `<div class="card"><h3>Fixed inputs of this run ${E}</h3>${table(['Input', N], [['Room (inside)', D.room_m ? D.room_m.join(' × ') + ' m (' + f(D.room_m3, 1) + ' m³)' : '–'], ['Walls U-value', f(D.U_W_m2K, 2) + ' W/m²K'],
          ['Solar PV', f(D.pv_kWp, 2) + ' kWp'], ['Ice panels', f(D.ice_kg) + ' kg'], ['Chiller (R290, outdoors)', `up to ${f(D.chiller_max_kW, 1)} kW cooling`], ['Glycol loop', `${esc(D.glycol.fluid || '')} · ${f(D.glycol_m_dot_kg_s, 3)} kg/s`],
          ['Set-point / band', `${f(D.setpoint_C, 1)} °C / ${band.join('–')} °C (alarm ${f(D.alarm_C, 1)} °C)`], ['Humidity target', f(D.rh_target_pct) + ' % (' + esc(D.humidity_option) + ')'], ['Crate places', f(D.crate_places)],
          ['Grid tariff', `₹${f(t.tariff_INR_kWh)}/kWh`], ['Battery', 'none for cooling – the ice is the storage'], ['Weather', esc(v.weather_source)], ['Practice', 'best practice (realistic losses, hot-site weather correction)']])}</div>`,
      how: () => {
        const pm = K.plan.calendar && K.plan.calendar.price_model;
        return `<div class="card"><h3>₹ How the money is calculated ${E}</h3><ul class="plain">
          <li><b>Held for a sale day (price uplift)</b> = kg sold × price on the sale day × freshness − kg × price on the storage day.</li>
          <li><b>Everyday surplus held</b> = kg sold × price on the sale day × freshness − kg × ${pm ? f(pm.surplus_distress_factor, 2) : '0.5'} × price on the storage day (without the room it is a distress sale).</li>
          <li><b>Post-festival glut (loss avoided)</b> = kg sold × price on the sale day × freshness (without the room it had no buyer).</li>
          <li>kg sold = kg stored × (1 − weight loss). Freshness comes from the flower model at the room temperature and humidity of the twin.</li>
          <li>Grid bill = grid kWh × ₹${f(t.tariff_INR_kWh)}/kWh. Solar electricity is free (panels are in the capital cost – see Cost & ROI).</li></ul></div>
          ${pm ? `<div class="card"><h3>Price model ${E}</h3>${table(['Rule', N], Object.entries(pm).filter(([k, x]) => typeof x === 'number').map(([k, x]) => [esc(k.replace(/_/g, ' ')), f(x, 2)]))}
            <p class="src">Daily prices per flower come from data/season_calendar.json and data/crops.json (research estimates, E). Nothing is a market quote.</p></div>` : ''}`;
      },
    };
    function after(k) {
      kill();
      if (k === 'year' && window.Chart) charts.push(new Chart($('lc'), { data: { labels: days.map(d => d.date), datasets: [
        { type: 'line', label: 'Room max °C', data: days.map(d => d.room_max_C), borderColor: '#2a78d6', pointRadius: 0, borderWidth: 1.5, yAxisID: 'y' },
        { type: 'line', label: 'Outside max °C', data: days.map(d => d.outside_max_C), borderColor: '#f59e0b', pointRadius: 0, borderWidth: 1, yAxisID: 'y' },
        { type: 'bar', label: 'Grid kWh', data: days.map(d => d.grid_kWh), backgroundColor: '#ef4444', yAxisID: 'y2' },
        { type: 'bar', label: 'Solar kWh', data: days.map(d => d.solar_kWh), backgroundColor: 'rgba(20,184,166,.5)', yAxisID: 'y2' }] },
        options: { animation: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: '°C' } }, y2: { position: 'right', title: { display: true, text: 'kWh/day' }, grid: { drawOnChartArea: false } } } } }));
      if (k === 'months' && window.Chart) charts.push(new Chart($('lvM'), { data: { labels: v.monthly.map(m => MONTHS[m.month - 1]), datasets: [
        { type: 'bar', label: 'Solar kWh', data: v.monthly.map(m => m.solar_kWh), backgroundColor: 'rgba(20,184,166,.6)', stack: 'e' }, { type: 'bar', label: 'Grid kWh', data: v.monthly.map(m => m.grid_kWh), backgroundColor: '#ef4444', stack: 'e' },
        { type: 'line', label: 'Room avg °C', data: v.monthly.map(m => m.room_avg_C), borderColor: '#2a78d6', yAxisID: 'y2' }] },
        options: { animation: false, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'kWh / month' } }, y2: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '°C' } } } } }));
      if (k === 'today') { $('lvDay').innerHTML = daySummary(today); dayCharts(today); }
      if (k === 'tom' && tomorrow) { $('lvDay').innerHTML = daySummary(tomorrow); dayCharts(tomorrow); document.querySelectorAll('.lvgo').forEach(b => { b.onclick = () => { kill(); $('lvDay').innerHTML = daySummary(b.dataset.d); dayCharts(b.dataset.d); }; }); }
      if (k === 'cal') {
        document.querySelector('.lv-months').onclick = e => { const b = e.target.closest('[data-d]'); if (b) showDay(b.dataset.d); };
        const want = (location.hash.match(/cal=(\d{4}-\d\d-\d\d)/) || [])[1];
        showDay(want && byDate[want] ? want : today);
      }
    }
    const show = k => { document.querySelectorAll('#lvTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === k)); kill(); $('lvTab').innerHTML = V[k](); after(k);
      if (k !== 'cal') try { history.replaceState(null, '', '#' + k); } catch (e) { /* file:// */ } };
    $('lvTabs').onclick = e => { if (e.target.dataset.t) show(e.target.dataset.t); };
    $('lvTab').addEventListener('click', e => { const a = e.target.closest('a[href^="#cal="]'); if (a) { e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); show('cal'); } });
    const hk = location.hash.slice(1);
    show(hk.startsWith('cal') ? 'cal' : (V[hk] ? hk : 'cal'));
  };

  // ------------------------------------------------------------------ CONTROL CENTRE
  P.control = () => {
    const c = K.control, tabs = [['calc', 'Calculations'], ['whatif', 'What-If'], ['two', 'Two rooms'], ['sure', 'How sure are we?'], ['room', 'Room & capacity'], ['year', 'Year results'],
      ['money', 'Money: grid and diesel'], ['sensors', 'Sensors'], ['inputs', 'Fixed inputs']];
    $('app').innerHTML = `<h2>Control centre ${range()}</h2><div class="seg tabs" id="tabs">${tabs.map(([k, t], i) => `<button data-t="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div><div id="tab"></div>`;
    const wi = c.what_if, hs = c.how_sure, mo = c.money;
    const V = {
      calc: () => `<div class="card"><h3>Every main formula with the numbers plugged in ${C}</h3><p class="src">Design point: ${f(c.calculations.design_point.T_out_C)} °C and ${f(c.calculations.design_point.RH_out_pct)} % outside, room ${f(c.calculations.design_point.T_room_C)} °C.</p>
        ${table(['What', 'Formula', 'Numbers', n('Result')], c.calculations.rows.map(r => [esc(r.name), `<code>${esc(r.formula)}</code>`, esc(r.numbers), r.text ? esc(r.text) : f(r.value, r.digits ?? (Math.abs(r.value) < 10 ? 2 : 0)) + ' ' + esc(r.unit)]))}</div>`,
      whatif: () => `<div class="card"><h3>What if…? One change at a time ${S}</h3>${table(['Change', n('Days fully on solar + ice'), n('Grid kWh/yr'), n('Hours above ' + D.band_C[1] + ' °C'), n('Hours below 2 °C'), n('Electricity kWh/day'), n('RH %'), n('₹ value ' + E)],
        [{ hl: 1, c: ['<b>Headline (best practice)</b>', f(wi.headline.days_full_solar_ice), f(wi.headline.grid_kWh_per_year), f(wi.headline.hours_above_band_top), f(wi.headline.hours_below_2C), f(wi.headline.electric_kWh_day, 2), f(wi.headline.rh_avg_pct), inr(wi.headline.value_INR)] }]
          .concat(wi.rows.map(r => [esc(r.label), f(r.days_full_solar_ice), f(r.grid_kWh_per_year), f(r.hours_above_band_top), f(r.hours_below_2C), f(r.electric_kWh_day, 2), f(r.rh_avg_pct), inr(r.value_INR)])),
        { note: esc(wi.about) + ' These are saved twin runs; the old site\'s live sliders needed a server.' })}</div>`,
      two: () => `<div class="card"><h3>Two rooms: ideal model against best practice ${S}</h3><div class="ctl"><label>Day <input type="date" id="twoDay"></label></div><canvas id="twoC" height="90"></canvas>
        <p class="src">Same weather and loading plan. Solid = best practice, dashed = ideal.</p></div>`,
      sure: () => `<div class="card"><h3>How sure are we? Weather at the site against the weather service ${S}</h3><p>${esc(hs.about)}</p>
        ${table(['Weather used', n('Days fully on solar + ice'), n('Grid kWh/yr'), n('Hours above ' + D.band_C[1] + ' °C'), n('Chiller COP')], Object.values(hs.cases).map(x => [esc(x.label), f(x.days_full_solar_ice), f(x.grid_kWh_per_year), f(x.hours_above_band_top), f(x.COP_chiller, 2)])
          .concat([[`${f(hs.random.n)} random sites: middle value (5 %–95 %)`, `${f(hs.random.days_full_solar_ice.median)} (${f(hs.random.days_full_solar_ice.p5)}–${f(hs.random.days_full_solar_ice.p95)})`,
            `${f(hs.random.grid_kWh_per_year.median)} (${f(hs.random.grid_kWh_per_year.p5)}–${f(hs.random.grid_kWh_per_year.p95)})`, '–', '–']]), { note: esc(hs.random.note) })}</div>`,
      room: () => { const L = c.room.layout, W = D.room_m[0], sc = 150; return `<div class="card"><h3>Room and capacity ${C}</h3><div class="cols"><div>
        <svg viewBox="0 0 ${W * sc + 20} ${W * sc + 20}" style="width:100%;max-width:360px"><rect x="10" y="10" width="${W * sc}" height="${W * sc}" class="dg-box"/>
          ${L.racks.map(r => `<rect x="${10 + r.x[0] * sc}" y="${10 + (W - r.y[1]) * sc}" width="${(r.x[1] - r.x[0]) * sc}" height="${(r.y[1] - r.y[0]) * sc}" fill="#14b8a6" opacity=".7"/><text x="${14 + r.x[0] * sc}" y="${28 + (W - r.y[1]) * sc}" class="dg-s">${esc(r.name)} rack: ${r.crates} crates</text>`).join('')}
          <rect x="${10 + L.door_x[0] * sc}" y="${W * sc + 4}" width="${(L.door_x[1] - L.door_x[0]) * sc}" height="10" fill="#f59e0b"/><text x="${14 + L.door_x[0] * sc}" y="${W * sc}" class="dg-s">door</text>
          <rect x="10" y="10" width="${W * sc}" height="${W * sc}" fill="none" stroke="#2a78d6" stroke-width="${c.room.ice.panel_depth_m * sc * 2}" opacity=".35"/></svg>
        <p class="src">Top view. Blue band = ice panels with fins along the walls; green = racks; orange = door. Aisle ${f(L.aisle_m, 2)} m.</p></div>
        <div>${table(['Zone', n('Floor m²'), n('Volume m³'), n('% of room')], c.room.table.map(r => [esc(r.item.replace(/Wax|wax/g, 'ice')), f(r.floor_m2, 2), f(r.volume_m3, 2), f(r.pct_of_room, 1)]), { note: `${f(c.room.crate_places)} crate places; zones add up to ${f(c.room.zones_sum_m3, 1)} m³.` })}</div></div></div>`; },
      year: () => `<div class="card"><h3>Year results, month by month ${S}</h3><canvas id="yC" height="90"></canvas></div><div class="card"><h3>Flowers stored and value ${E}</h3><canvas id="yC2" height="80"></canvas></div>`,
      money: () => `<div class="card"><h3>Running cost: our room against grid only and grid + diesel ${E}</h3>${table(['Room', n('Grid kWh/yr ' + S), n('Diesel L/yr'), n('Cost ₹/yr'), n('Saved by our room ₹/yr'), n('CO₂ kg/yr'), n('CO₂ saved kg/yr')],
        mo.rows.map((r, i) => ({ hl: !i, c: [esc(r.label), f(r.grid_kWh), f(r.diesel_L), inr(r.cost_INR), i ? inr(r.saved_INR) : '–', f(r.co2_kg), i ? f(r.co2_saved_kg) : '–'] })), { note: esc(mo.E.note) + ` Tariff ₹${f(mo.tariff_INR_kWh)}/kWh. Full payback is on the <a href="cost.html">Cost & ROI</a> page.` })}</div>`,
      sensors: () => `<div class="card"><h3>Planned sensors ${E}</h3><div class="note">${esc(c.sensors.about)}</div>${table(['Sensor', 'Unit', 'Type', 'Range', 'Accuracy', 'Where', 'Protocol', 'Used for'],
        c.sensors.rows.map(r => [`<b>${esc(r.name)}</b>`, esc(r.unit), esc(r.type), esc(r.range), esc(r.accuracy), esc(r.location), esc(r.protocol), esc(r.used_in)]))}</div>`,
      inputs: () => `<div class="card"><h3>Fixed inputs of the twin</h3><p class="src">Read from config/design.json. To change one, edit that file and run the build; the old site's on-page editing needed a server.</p>
        ${Object.entries(c.fixed_inputs).map(([sec, o]) => `<details><summary>${esc(sec)}</summary>${table(['Input', 'Value'], Object.entries(o).map(([k, v]) => [esc(k), `<code>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</code>`]))}</details>`).join('')}
        <details><summary>Every assumption ${E} with its source</summary><ul class="plain src">${Object.entries(c.assumptions_E).map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul></details></div>`,
    };
    function after(k) {
      if (!window.Chart) return;
      if (k === 'two') {
        const T = K.two, nd = T.best.n / 24, dOf = d => new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10);
        const inp = $('twoDay'); inp.min = dOf(0); inp.max = dOf(nd - 1); inp.value = dOf(140);
        let ch = null;
        const dr = () => { const d = Math.round((Date.parse(inp.value) - Date.UTC(2026, 0, 1)) / 864e5), a = d * 24, sl = (o, key) => o[key].slice(a, a + 24);
          const ds = [['Room °C – best practice', T.best, 'T_room', '#2a78d6', 'y', []], ['Room °C – ideal', T.ideal, 'T_room', '#2a78d6', 'y', [5, 4]], ['Ice % – best practice', T.best, 'ice', '#14b8a6', 'y2', []], ['Ice % – ideal', T.ideal, 'ice', '#14b8a6', 'y2', [5, 4]],
            ['Outside °C', T.best, 'T_out', '#f59e0b', 'y', []]].map(([label, o, key, col, ax, dash]) => ({ label, data: sl(o, key), borderColor: col, borderDash: dash, pointRadius: 0, borderWidth: 2, yAxisID: ax }));
          if (ch) { ch.data.datasets.forEach((s, i) => { s.data = ds[i].data; }); ch.update('none'); } else ch = new Chart($('twoC'), { type: 'line', data: { labels: Array.from({ length: 24 }, (_, i) => i + ':00'), datasets: ds },
            options: { animation: false, interaction: { mode: 'index', intersect: false }, scales: { y: { title: { display: true, text: '°C' } }, y2: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: 'ice %' } } } } }); };
        inp.onchange = dr; dr();
      }
      if (k === 'year') {
        const M = K.monthly.best_practice, lab = M.map(m => MONTHS[m.month - 1]);
        new Chart($('yC'), { data: { labels: lab, datasets: [{ type: 'bar', label: 'Solar kWh', data: M.map(m => m.solar_kWh), backgroundColor: 'rgba(20,184,166,.6)', stack: 'e' }, { type: 'bar', label: 'Grid kWh', data: M.map(m => m.grid_kWh), backgroundColor: '#ef4444', stack: 'e' },
          { type: 'line', label: 'Outside avg °C', data: M.map(m => m.outside_avg_C), borderColor: '#f59e0b', yAxisID: 'y2' }, { type: 'line', label: 'Room avg °C', data: M.map(m => m.room_avg_C), borderColor: '#2a78d6', yAxisID: 'y2' }] },
          options: { animation: false, scales: { y: { stacked: true, title: { display: true, text: 'kWh / month' } }, y2: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '°C' } } } } });
        new Chart($('yC2'), { data: { labels: lab, datasets: [{ type: 'bar', label: 'kg stored', data: M.map(m => m.kg_stored), backgroundColor: 'rgba(42,120,214,.6)' }, { type: 'line', label: '₹ captured (E)', data: M.map(m => m.value_INR), borderColor: '#8b5cf6', yAxisID: 'y2' }] },
          options: { animation: false, scales: { y: { title: { display: true, text: 'kg' } }, y2: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '₹' } } } } });
      }
    }
    const show = k => { document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === k)); $('tab').innerHTML = V[k](); after(k); try { history.replaceState(null, '', '#' + k); } catch (e) { /* file:// */ } };
    $('tabs').onclick = e => { if (e.target.dataset.t) show(e.target.dataset.t); };
    show(V[location.hash.slice(1)] ? location.hash.slice(1) : 'calc');
  };

  document.addEventListener('DOMContentLoaded', () => { const p = document.body.dataset.page; shell(); if (P[p]) P[p](); });
})();
