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
      return [`${fpic(k)}<b>${esc(c.label)}</b><br><span class="src"><i>${esc(c.latin)}</i></span>`, c.best_storage_C[0] === c.best_storage_C[1] ? c.best_storage_C[0] + ' °C' : c.best_storage_C.join('–') + ' °C',
        c.rh_pct.join('–') + ' %', f(c.shelf_life_ambient_days * 24) + ' h (' + f(c.shelf_life_ambient_days, 1) + ' d)', f(c.shelf_life_bagged_4C_days, 0) + ' days',
        `<span class="pill ${fit[c.fit_at_4C]}">${c.fit_at_4C}</span><br><span class="src">${esc(c.fit_note)}${c.fragrance ? ' ' + esc(c.fragrance.note) : ''}</span>`,
        cell('1'), cell('2'), cell('3'), h['1'] ? f(h['1'].freshness_no_room_pct) + ' %' : '–', c.kg_per_crate.join('–') + ' kg', c.ethylene_sensitivity];
    });
    $('app').innerHTML = `<h2>Flowers for a ${f(D.setpoint_C)} °C room ${range()}</h2>
      <div class="card">${table(['Flower', n('Best storage °C ' + E), n('RH'), n('Shelf life outside (about 30 °C) ' + E), n('Shelf life bagged at 4 °C ' + E), 'Fit at 4 °C',
        n('Freshness kept in our room after 1 day ' + S), n('2 days ' + S), n('3 days ' + S), n('1 day with no cold room ' + S), n('kg per crate ' + E), 'Ethylene'], rows,
        { note: 'Freshness = 100 % when picked, 0 % at the end of the reference shelf life. In our room: bagged, loaded at 06:00 at the outside temperature, taken out at 05:00 (so "1 day" is 23 hours); best-practice case.' })}${fcred()}</div>
      <div class="cols">
       <div class="card"><h3>Check-in rules</h3>
        ${Object.entries(K.blocked).map(([bk, b]) => `<div class="note bd">${K.flower_photos[bk] ? `<img src="${K.flower_photos[bk]}" alt="${esc(b.label)}" class="fpic">` : ''}⛔ <b>${esc(b.label)}</b> – blocked. ${esc(b.warning)}</div>`).join('')}
        <div class="note">⚠ <b>${esc(K.crops.crossandra.label)}</b> – allowed for ${K.crops.crossandra.max_hold_days} day only. ${esc(K.crops.crossandra.shelf.warning)}</div>
        <div class="note">🍌 ${esc(K.rules.ethylene)}</div></div>
       <div class="card"><h3>Handling tips</h3><ul class="plain">${K.rules.handling.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="src">${esc(K.rules.water)} ${esc(K.rules.fogger_water)}</p></div>
       <div class="card"><h3>FAQ</h3><p><b>${esc(K.rules.faq_months.q)}</b></p><p>${esc(K.rules.faq_months.a)}</p></div>
      </div>
      <h2>Where each value comes from</h2>
      <div class="card">${Object.values(K.crops).map(c => `<details><summary>${esc(c.label)}</summary><ul class="plain src">
        <li>Best temperature: ${esc(c.best_storage_source)}</li><li>Shelf life outside: ${esc(c.shelf_life_ambient_source)}</li><li>Shelf life bagged at 4 °C: ${esc(c.shelf_life_bagged_source)}</li>
        <li>Q10 ${c.Q10}: ${esc(c.Q10_source)}</li><li>Respiration heat at 0 / 5 / 10 / 20 °C: ${Object.values(c.respiration_mW_kg).join(' / ')} mW/kg – ${esc(c.respiration_source)}</li>
        <li>Heat capacity ${c.cp_kJ_kgK} kJ/kg·K: ${esc(c.cp_source)}</li><li>Bulk density ${c.bulk_density_kg_m3} kg/m³: ${esc(c.bulk_density_source)} ${esc(c.kg_per_crate_source)}</li>
        <li>Ethylene: ${esc(c.ethylene_source)}</li><li>Chilling limit ${c.chill_injury_below_C} °C: ${esc(c.chill_source)}</li>
        <li>Water loss: ${esc(c.freshness.K_t_source)} ${esc(c.freshness.WL_max_source)}</li>${c.boric_acid_dip ? `<li>Boric-acid dip: ${esc(c.boric_source)}</li>` : ''}
        <li>Prices: ${esc(c.price_source)}</li></ul></details>`).join('')}</div>`;
  };

  // ------------------------------------------------------------------ SEASON PLANNER
  P.season = () => {
    const cal = K.plan.calendar, M = K.monthly.realistic_smart, pm = cal.price_model;
    const sup = { 2: 'peak', 1: 'some', 0: 'off' };
    const rows = MONTHS.map((mn, i) => {
      const inS = Object.keys(K.crops).filter(k => cal.supply[k][i] > 0).map(k => `${crop(k).label.split(' (')[0]}${cal.supply[k][i] === 2 ? ' <b>(peak)</b>' : ''}`).join(', ');
      const fest = cal.festivals.filter(x => +x.date.slice(5, 7) === i + 1).map(x => `${esc(x.name)} ${+x.date.slice(8)}${x.confirmed ? '' : ' ' + E}`);
      const wed = cal.windows.filter(w => +w.from.slice(5, 7) <= i + 1 && (+w.to.slice(0, 4) > 2026 || +w.to.slice(5, 7) >= i + 1) && +w.from.slice(0, 4) === 2026).map(w => esc(w.name));
      const peak = Object.keys(K.crops).filter(k => cal.supply[k][i] === 2), has = fest.length > 0;
      const price = (peak.length ? `Glut of ${peak.map(k => crop(k).label.split(' (')[0]).join(', ')} (low prices)` : 'No big glut') + (has ? '; scarcity before festivals (×' + pm.pre_festival_multiplier + '), crash after (×' + pm.post_crash_multiplier + ')' : '');
      const m = M.find(x => x.month === i + 1);
      return [`<b>${mn}</b>`, inS, [...fest, ...wed].join('<br>') || '–', price, esc(cal.plan.months[i + 1]),
        m ? f(m.kg_stored) : '<span class="src">not simulated yet</span>', m ? f(m.days_with_stock) : '–', m ? f(m.energy_kWh) : '–', m ? f(m.grid_h) : '–',
        m ? f(m.room_avg_C, 1) : '–', m && m.rh_avg_pct ? f(m.rh_avg_pct) : '–',
        m ? Object.entries(m.freshness_at_takeout_pct).map(([k, v]) => `${crop(k).label.split(' (')[0]} ${f(v)} %`).join('<br>') || '–' : '–', m ? inr(m.value_INR) : '–'];
    });
    const unconf = cal.festivals.filter(x => !x.confirmed).map(x => `${x.name} (${x.date})`).concat(cal.windows.filter(w => !w.confirmed).map(w => `${w.name} (${w.from} → ${w.to})`));
    const hm = K.monthly.hardest_months;
    $('app').innerHTML = `<h2>Season planner – January to December ${E} ${range()}</h2>
      <p>Which flowers are in season, which festivals and weddings pull the price up, and what the cold room does. The last columns are the twin's results for the months it has weather for.</p>
      <div class="card">${table(['Month', 'Flowers in season ' + E, 'Festivals and weddings', 'Price behaviour ' + E, 'What the cold room does',
        n('kg stored ' + S), n('Days with stock ' + S), n('Energy kWh ' + S), n('Grid h ' + S), n('Room °C ' + S), n('RH % ' + S), 'Freshness at take-out ' + S, n('₹ captured ' + E)], rows,
        { note: esc(K.monthly.value_definition) + ' Best-practice case.' })}</div>
      <div class="tiles">
        ${tile('Days with stock (full-year plan)', f(K.plan.days_with_stock_full_year), 'days', `research estimate ${cal.research_estimate.days_with_stock.join('–')} ${''}`)}
        ${tile('High-value days (full-year plan)', f(K.plan.high_value_days_full_year), 'days', `research estimate ${cal.research_estimate.high_value_days.join('–')}`)}
        ${tile('Busiest month', MONTHS[K.monthly.busiest_month - 1], '', 'most kg per day')}
        ${tile('Hardest month for the room', MONTHS[K.monthly.hardest_month - 1], '', `${f(hm[0].grid_h_per_day, 1)} grid h/day, outside ${f(hm[0].outside_avg_C, 1)} °C, ice down to ${f(hm[0].ice_sunrise_worst_pct)} % at sunrise`)}
      </div>
      <div class="note">Our plan stores flowers on fewer days than the research estimate, because the plan only holds a flower when the sale price × expected freshness beats today's price (${E} price model).
        High-value days = ${esc(K.plan.high_value_definition)}.</div>
      <div class="card"><h3>Price model ${E} – ₹/kg through 2026</h3><canvas id="pc" height="90"></canvas><p class="src">${esc(pm.note)}</p></div>
      <div class="card"><h3>Dates we could not confirm ${E}</h3><ul class="plain src">${unconf.map(u => `<li>${esc(u)}</li>`).join('')}</ul>
        <p class="src">${esc(cal.muhurtham_proxy.note)}</p></div>`;
    if (window.Chart) {
      const col = { jasmine: '#2a78d6', marigold: '#f59e0b', rose: '#ef4444', tuberose: '#14b8a6', chamanthi: '#8b5cf6', crossandra: '#fb7185' }, pr = K.plan.prices_INR_kg;
      new Chart($('pc'), { type: 'line', data: { labels: pr.dates, datasets: Object.keys(K.crops).map(k => ({ label: crop(k).label.split(' (')[0], data: pr[k], borderColor: col[k], pointRadius: 0, borderWidth: 1.5, stepped: true })) },
        options: { animation: false, scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: '₹/kg (E)' } } } } });
    }
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
    const v = K.live, h = v.headline, t = v.totals, lr = `<span class="range">${esc(v.date_range.label)}</span>`;
    $('app').innerHTML = `<h2>Live 2026 report ${S} ${lr}</h2>
      <p>The best-practice room on real Visakhapatnam weather from 1 January 2026 to the newest saved weather hour (${esc(v.weather_last_hour)} IST). ${esc(v.note)}</p>
      <div class="tiles">
        ${tile('Days fully on solar + ice', f(t.days_fully_solar), `of ${f(t.days)}`, '', 'big good')}${tile('Grid backup', f(t.grid_kWh, 1), 'kWh', `${f(t.grid_h)} hours · bill ${inr(t.grid_bill_INR)} at ₹${f(t.tariff_INR_kWh)}/kWh ${E}`, 'big')}
        ${tile('Electricity used', f(t.electric_kWh), 'kWh', `${f(t.solar_kWh)} kWh from the sun (${f(100 * t.solar_kWh / t.electric_kWh)} %)`, 'big')}${tile('Solar available', f(t.pv_available_kWh), 'kWh', `${f(100 * t.solar_kWh / t.pv_available_kWh)} % used`)}
        ${tile('Flowers stored', f(h.kg_stored), 'kg', `${f(h.days_with_stock)} days with stock, ${f(h.fills_done)} fills`)}${tile('Value captured ' + E, inr(h.value_INR), '', `uplift ${inr(h.price_uplift_INR)} + surplus held ${inr(h.surplus_held_INR)} + losses avoided ${inr(h.loss_avoided_INR)}`)}
        ${tile('Hours outside ' + D.band_C.join('–') + ' °C', f(h.hours_outside_band), 'h', `above alarm: ${f(h.hours_above_alarm)} h`)}${tile('Humidity (flowers inside)', f(h.rh_avg_pct, 1), '%', `fogger water ${f(h.water_fog_L_day, 2)} L/day`)}
        ${tile('Chiller COP', f(h.COP_chiller, 2), '', `${f(h.electric_kWh_day, 2)} kWh/day`)}</div>
      <div class="note ok">${gridLine(t.grid_h, t.days_with_grid, t.grid_months, t.days_fully_solar, t.days)}. Hours below 2 °C: ${f(t.hours_below_2C)} (coldest room ${f(t.room_min_C, 1)} °C).</div>
      <h2>Tomorrow and the day after <span class="pill wn">PREDICTION – weather forecast run through the twin</span></h2>
      <div class="cols">${v.forecast.days.map(d => `<div class="card"><h3>${esc(d.date)} <span class="pill ${d.kind === 'storm' ? 'bd' : d.kind === 'normal' ? 'ok' : 'wn'}">${esc(d.kind.replace('_', ' '))}</span></h3>
        <p><b>${esc(d.text)}</b></p>${table(['', N], [['Outside', `${f(d.outside_min_C, 1)}–${f(d.outside_max_C, 1)} °C`], ['Sun', f(d.sun_kWh_m2, 1) + ' kWh/m²'], ['Rain', f(d.rain_mm, 1) + ' mm'], ['Room, highest', f(d.room_max_C, 1) + ' °C'],
          ['Ice at sunrise → sunset', `${f(d.ice_sunrise_pct)} → ${f(d.ice_sunset_pct)} %`], ['Grid backup expected', `${f(d.grid_h, 1)} h, ${f(d.grid_kWh, 2)} kWh`],
          ['Plan: flowers in', d.planned_in.map(x => Object.entries(x.parts).map(([k, kg]) => `${f(kg)} kg ${crop(k).label.split(' (')[0]}`).join(', ')).join('; ') || '–'],
          ['Plan: flowers out', d.planned_out.map(x => Object.entries(x.parts).map(([k, kg]) => `${f(kg)} kg ${crop(k).label.split(' (')[0]}`).join(', ')).join('; ') || '–']])}</div>`).join('')}</div>
      <p class="src">${esc(v.forecast.about)} ${esc(v.forecast.rules.note)} Official warnings: <a href="${v.forecast.rules.imd_url}">India Meteorological Department</a>.</p>
      <div class="card"><h3>Day by day ${lr}</h3><canvas id="lc" height="80"></canvas></div>
      <div class="card"><h3>Month by month</h3>${table(['Month', n('Days'), n('kg stored'), n('Days with stock'), n('Electricity kWh'), n('Solar kWh'), n('Grid kWh'), n('Grid h'), n('Room avg °C'), n('Room max °C'), n('RH %'), n('Outside avg °C'), n('Ice at sunrise, worst %'), n('₹ captured ' + E)],
        v.monthly.map(m => [MONTHS[m.month - 1], f(m.days), f(m.kg_stored), f(m.days_with_stock), f(m.energy_kWh), f(m.solar_kWh), f(m.grid_kWh, 1), f(m.grid_h), f(m.room_avg_C, 1), f(m.room_max_C, 1), m.rh_avg_pct ? f(m.rh_avg_pct) : '–',
          f(m.outside_avg_C, 1), f(m.ice_sunrise_worst_pct), inr(m.value_INR)]))}</div>
      <div class="card"><h3>By flower</h3>${table(['Flower', n('kg'), n('Fills'), n('Days held (avg)'), n('Freshness at take-out'), n('Worst'), n('With no cold room'), n('₹ captured ' + E)],
        Object.entries(v.by_flower).map(([k, x]) => [esc(crop(k).label), f(x.kg), f(x.fills), f(x.hold_days_avg, 1), f(x.freshness_kept_pct) + ' %', f(x.freshness_kept_worst_pct) + ' %', f(x.freshness_no_room_pct) + ' %', inr(x.value_INR)]))}</div>
      <div class="card"><h3>Every day</h3><div style="max-height:520px;overflow:auto">${table(['Date', n('Outside max °C'), n('Sun kWh/m²'), n('Room avg °C'), n('Room max °C'), n('RH %'), n('Ice at sunrise %'), n('Flowers inside kg'), n('Solar kWh'), n('Grid kWh'), n('Grid h'), ''],
        v.daily.slice().reverse().map(d => [d.date, f(d.outside_max_C, 1), f(d.sun_kWh_m2, 1), f(d.room_avg_C, 1), f(d.room_max_C, 1), f(d.rh_avg_pct), f(d.ice_sunrise_pct), f(d.kg_inside_max), f(d.solar_kWh, 2), f(d.grid_kWh, 2), f(d.grid_h, 1),
          d.fully_solar ? '<span class="pill ok">solar + ice</span>' : '<span class="pill wn">some grid</span>']))}</div></div>
      <p class="src">Weather: ${esc(v.weather_source)}. The studies on the other pages use the frozen first ${f(DAYS)} days so they can be repeated exactly; this report runs on to the newest weather.</p>`;
    if (window.Chart) new Chart($('lc'), { data: { labels: v.daily.map(d => d.date), datasets: [
      { type: 'line', label: 'Room max °C', data: v.daily.map(d => d.room_max_C), borderColor: '#2a78d6', pointRadius: 0, borderWidth: 1.5, yAxisID: 'y' },
      { type: 'line', label: 'Outside max °C', data: v.daily.map(d => d.outside_max_C), borderColor: '#f59e0b', pointRadius: 0, borderWidth: 1, yAxisID: 'y' },
      { type: 'bar', label: 'Grid kWh', data: v.daily.map(d => d.grid_kWh), backgroundColor: '#ef4444', yAxisID: 'y2' },
      { type: 'bar', label: 'Solar kWh', data: v.daily.map(d => d.solar_kWh), backgroundColor: 'rgba(20,184,166,.5)', yAxisID: 'y2' }] },
      options: { animation: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: '°C' } }, y2: { position: 'right', title: { display: true, text: 'kWh/day' }, grid: { drawOnChartArea: false } } } } });
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
