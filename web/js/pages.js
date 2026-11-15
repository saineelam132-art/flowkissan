// KoolKisaan Flowers – the pages. All numbers come from window.KK (results files of the twin).
(function () {
  'use strict';
  const { K, $, esc, f, inr, S, E, C, range, table, tile, shell, MONTHS } = window.KKS;
  const D = K.flowers.design, RS = K.flowers[K.flowers.headline_case], ID = K.flowers.ideal, RL = K.flowers.realistic_smart, DAYS = K.flowers.date_range.days;
  const N = { t: '', n: true };
  const n = t => ({ t, n: true });
  const crop = k => K.crops[k] || { label: k };
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
      ['flowers_inside', `Inside at ${D.band_C.join('–')} °C: marigold, rose, jasmine and tuberose in crates and bags; finned ice panels on the wall, glycol air cooler above`, [[50, 18, 'gly'], [40, 55, 'wax'], [60, 55, 'vwax'], [14, 62, 'kg'], [80, 30, 'rh']]],
      ['chiller_outdoor', 'Outdoor R290 chiller with the glycol pump (green), expansion tank (red) and the two insulated glycol pipes into the room', [[37, 68, 'gly'], [43, 72, 'pump'], [65, 52, 'src']]],
      ['room_with_chiller', 'The chiller, pump and tank sit beside the room; only cold glycol goes through the wall', [[80, 72, 'gly'], [55, 20, 'pv'], [43, 55, 'room']]],
      ['A10_interior_evaporator', `Air cooler: glycol at about ${f(G.supply_room_C)} °C takes the heat out of the room air (picture from the earlier design)`, [[58, 48, 'room'], [84, 56, 'gly'], [14, 68, 'rh']]],
      ['A11_solar_canopy_closeup', `${f(D.pv_kWp, 1)} kWp of solar panels run the chiller by day and freeze the ice with what is left over`, [[50, 40, 'pv'], [75, 70, 'src']]],
    ];
    $('app').innerHTML = `
      <section class="stage" id="stage">
        <div class="caption" id="cap"></div>
        <div class="seg" id="modes">${['Auto', 'Day', 'Night', 'Monsoon'].map((m, i) => `<button data-m="${m}" class="${i ? '' : 'on'}">${m}</button>`).join('')}</div>
        <div id="slides"></div>
        <div class="ai">Concept illustration (AI-generated) – not a photo of a built unit</div>
        <div class="dots"><button id="prev" aria-label="previous picture">‹</button><span id="dots"></span><button id="next" aria-label="next picture">›</button></div>
        <div class="databar"><div id="bar" class="barvals"></div>
          <div class="barctl"><button id="play" title="Play / pause">▶</button><select id="speed" title="Speed"><option value="0">real time</option><option value="1" selected>1 h per second</option><option value="6">6 h per second</option></select>
            <input type="date" id="day" min="${dateOf(0)}" max="${dateOf(nd - 1)}" value="${dateOf(d0)}"><input type="range" id="hour" min="0" max="23" step="1" value="${now.getUTCHours()}"><button id="nowBtn">● Now</button>
            <b id="nowLbl"></b><span class="sim">SIMULATED</span></div></div>
      </section>
      <div class="card" style="margin-top:12px"><h3>This day, hour by hour ${S}</h3><canvas id="dayChart" height="90"></canvas></div>
      <h2>Results of the year so far ${S} ${range()}</h2>
      <p class="src">Best practice = realistic losses + good design + good operation (the careful, reachable numbers). The ideal model is shown in small print. Poor practice is on the Reality check page.</p>
      <div class="tiles">
        ${tile('Days fully on solar + ice', f(RS.days_full_solar_wax), `of ${DAYS}`, `ideal model: ${f(ID.days_full_solar_wax)} of ${DAYS}`, 'big')}
        ${tile('Electricity from the sun', f(RS.solar_share_of_electricity_pct), '%', `ideal: ${f(ID.solar_share_of_electricity_pct)} %`, 'big good')}
        ${tile('Grid backup', f(RS.grid_h_per_year), 'h/yr', `${f(RS.grid_kWh_per_year)} kWh/yr · ideal: ${f(ID.grid_h_per_year)} h, ${f(ID.grid_kWh_per_year)} kWh`, 'big')}
        ${tile('Chiller COP', f(RS.COP_chiller, 2), '', `ideal: ${f(ID.COP_chiller, 2)}`)}
        ${tile('Hours outside ' + D.band_C.join('–') + ' °C', f(RS.hours_outside_band), 'h', `ideal: ${f(ID.hours_outside_band)} h`)}
        ${tile('Average humidity (flowers inside)', f(RS.rh_avg_pct, 1), '%', `below 85 %: ${f(RS.rh_below_85_h_day, 2)} h/day`)}
        ${tile('Flowers stored', f(RS.kg_stored), 'kg', `${f(RS.days_with_stock)} days with stock`)}
        ${tile('Value captured ' + E, inr(RS.value_INR), '', 'price model is an assumption')}
      </div>
      <div class="note ok">Grid electricity is a small top-up: about ${f(RS.grid_kWh_per_year)} kWh a year, ${inr(K.practice.cases.best_practice.grid_bill_INR_per_year.mid)} a year ${E}.
        Up-to-date numbers from 1 January to the newest weather are in the <a href="live.html">Live 2026 report</a>.</div>
      <h2>Pages</h2>
      <div class="cols">${[['how.html', 'How it works', 'Outdoor R290 chiller → glycol pump → V-ROOM / V-WAX.'], ['flowers.html', 'Flowers', 'Which flowers fit a 4 °C room and how long they keep.'],
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
        [`Days fully on solar + ice (of ${DAYS}) – ideal`, f(cmp.old.ideal.days_full_solar_wax), f(cmp.new.ideal.days_full_solar_wax)],
        [`Days fully on solar + ice – realistic + smart`, f(cmp.old.realistic_smart.days_full_solar_wax), f(cmp.new.realistic_smart.days_full_solar_wax)],
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
      const img = el.querySelector('img'), entry = { el, cap };
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
      const on = H.run[i] > 0, src = H.grid[i] > 0 ? 'GRID' : (on ? 'SOLAR' : (H.wax[i] > 0 ? 'ICE' : 'NONE'));
      return { room: [`${f(H.T_room[i], 1)} °C`, 'Room air'], rh: [`${f(H.RH_room[i], 0)} %`, 'Room humidity'], out: [`${f(H.T_out[i], 1)} °C`, 'Outside air'], pv: [`${f(H.P_pv[i], 2)} kW`, 'Solar power now'],
        wax: [`${f(H.wax[i], 0)} %`, 'Ice frozen (cold battery)'], gly: [on ? `${f(H.T_sup[i], 1)} / ${f(H.T_ret[i], 1)} °C` : 'pump off', 'Glycol supply / return'],
        pump: [on ? 'ON' : 'OFF', 'Glycol pump'], vwax: [H.v_wax[i] > 0 ? 'OPEN' : 'CLOSED', 'V-WAX valve'], kg: [`${f(H.kg[i], 0)} kg`, 'Flowers inside'], src: [src, 'Power from'] };
    }
    function draw() {
      const d = Math.round((Date.parse($('day').value) - Date.UTC(2026, 0, 1)) / 864e5), h = +$('hour').value, i = Math.max(0, Math.min(H.n - 1, d * 24 + h));
      const v = values(i), T = H.T_room[i], bad = T > D.band_C[1] || T < D.band_C[0];
      $('nowLbl').textContent = `${$('day').value} ${String(h).padStart(2, '0')}:00`;
      $('stage').classList.toggle('night', H.P_pv[i] < 0.02);
      const cell = (lab, val, cls = '') => `<div class="bv ${cls}"><small>${lab}</small><b>${val}</b></div>`;
      $('bar').innerHTML = cell('ROOM', v.room[0], bad ? 'wn' : 'ok') + cell('HUMIDITY', v.rh[0]) + cell('OUTSIDE', v.out[0]) + cell('SOLAR PV', v.pv[0]) + cell('ICE BATTERY', v.wax[0])
        + cell('GLYCOL SUPPLY / RETURN', v.gly[0]) + cell('FLOWERS INSIDE', v.kg[0]) + cell('POWER FROM', v.src[0], v.src[0] === 'GRID' ? 'wn' : 'ok');
      document.querySelectorAll('.slide.on .hot').forEach(b => { const x = v[b.dataset.w]; b.querySelector('span').innerHTML = `<small>${x[1]}</small>${x[0]}`; });
      const a = d * 24, lab = Array.from({ length: 24 }, (_, k) => k + ':00'), sl = k => H[k].slice(a, a + 24);
      const ds = [{ label: 'Room °C', data: sl('T_room'), borderColor: '#2a78d6', yAxisID: 'y' }, { label: 'Outside °C', data: sl('T_out'), borderColor: '#f59e0b', yAxisID: 'y' },
        { label: 'Wax %', data: sl('wax'), borderColor: '#14b8a6', yAxisID: 'y2' }, { label: 'Humidity %', data: sl('RH_room'), borderColor: '#8b5cf6', yAxisID: 'y2' }];
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
    draw();
  };

  // ------------------------------------------------------------------ HOW IT WORKS
  P.how = () => {
    const g = D.glycol, ph = K.photos, hx = K.wax_hx, pcm = K.pcm;
    const slab = Math.round(1000 * D.wax_kg / (pcm.density_kg_m3 * pcm.slab_area_m2));
    const fig = (k, cap) => (ph[k] ? `<figure><img src="${ph[k].file}" alt="${esc(ph[k].what)}" loading="lazy"><figcaption>${esc(cap || ph[k].caption)} – a typical example, not our unit. ${esc(ph[k].credit)} · <a href="${ph[k].source}">source</a></figcaption></figure>` : '');
    $('app').innerHTML = `<h2>How it works ${range()}</h2>
      <div class="card diagram"><div class="zero">${D.r290_inside_room_g} g R290 inside the room</div>
      <svg viewBox="0 0 900 430" role="img" aria-label="Diagram: outdoor R290 chiller, plate heat exchanger, glycol pump, V-ROOM to the air cooler and V-WAX to the ice panels">
        <rect x="20" y="60" width="250" height="250" rx="10" class="dg-box"/><text x="32" y="82" class="dg-t">OUTDOOR R290 chiller (factory-sealed)</text>
        <rect x="40" y="110" width="90" height="60" rx="6" class="dg-box"/><text x="52" y="136" class="dg-s">compressor</text><text x="52" y="152" class="dg-s">(inverter)</text>
        <rect x="40" y="220" width="90" height="60" rx="6" class="dg-box"/><text x="50" y="246" class="dg-s">condenser</text><text x="50" y="262" class="dg-s">+ fan</text>
        <rect x="180" y="150" width="60" height="110" rx="6" class="dg-box"/><text x="186" y="200" class="dg-s">plate</text><text x="186" y="216" class="dg-s">heat ex.</text>
        <path d="M130 140 H210 V150 M210 260 V270 H130 M85 170 V220" class="dg-r290"/><text x="32" y="300" class="dg-s" fill="#ef4444">red = R290, stays outside</text>
        <text x="32" y="330" class="dg-s">gas leak sensor here · max ${f(D.chiller_max_kW, 1)} kW cooling</text>
        <path d="M240 180 H330" class="dg-cold"/><circle cx="350" cy="180" r="20" class="dg-box"/><text x="338" y="185" class="dg-t">P</text><text x="322" y="150" class="dg-s">glycol pump ${f(g.pump_W)} W</text>
        <path d="M370 180 H470 V110 H560 M470 180 V290 H560" class="dg-cold"/>
        <rect x="455" y="20" width="430" height="390" rx="12" class="dg-room"/><text x="470" y="44" class="dg-t">COLD ROOM ${D.room_m.join(' × ')} m · ${f(D.setpoint_C)} °C</text>
        <path d="M560 95 l24 30 l-24 0 l24 -30 z" class="dg-box"/><text x="548" y="84" class="dg-t">V-ROOM</text>
        <path d="M560 275 l24 30 l-24 0 l24 -30 z" class="dg-box"/><text x="548" y="264" class="dg-t">V-WAX</text>
        <path d="M584 110 H650" class="dg-cold"/><rect x="650" y="75" width="200" height="70" rx="8" class="dg-box"/><text x="662" y="103" class="dg-t">Glycol air cooler + EC fan</text><text x="662" y="122" class="dg-s">glycol supply about ${f(g.supply_room_C)} °C</text>
        <path d="M584 290 H650" class="dg-cold"/><rect x="650" y="255" width="200" height="80" rx="8" class="dg-box"/><text x="662" y="283" class="dg-t">Ice panels (${f(D.wax_kg)} kg) + fins</text><text x="662" y="302" class="dg-s">glycol coils inside · supply ${f(g.supply_wax_C)} °C</text><text x="662" y="320" class="dg-s">freezes and melts at ${f(pcm.T_melt_C)} °C</text>
        <path d="M850 110 H870 V370 H300 V230 H240 M850 295 H870" class="dg-warm"/><text x="480" y="390" class="dg-s">orange = glycol return (warmer)</text>
        <text x="32" y="352" class="dg-s">blue = cold glycol (${esc(g.fluid)})</text>
      </svg></div>
      <div class="cols">
       <div class="card"><h3>Control rules</h3><ul class="plain">
        <li><b>Room first.</b> V-ROOM opens when the room needs cold.</li>
        <li><b>V-WAX</b> opens only with spare solar power and when the ice is below 100 %.</li>
        <li><b>At night</b> the pump is off and both valves are closed. The ice cools the room by natural air flow over the fins.</li>
        <li>Minimum ON time ${f(g.min_on_min)} min. The grid is only a backup (ice below ${f(D.controller.ats_pcm_pct)} % with no sun, or the room above ${f(D.controller.protect_above_C, 1)} °C for 15 min).</li></ul></div>
       <div class="card"><h3>The physics in the twin ${C} ${E}</h3>${table(['', N], [
        ['Glycol supply for the air cooler ' + E, f(g.supply_room_C) + ' °C'], ['Glycol supply when charging ice ' + E, f(g.supply_wax_C) + ' °C'],
        ['Plate heat-exchanger approach ' + E, f(g.hx_approach_K) + ' K'], ['R290 evaporating temperature (room / ice) ' + C, `${f(D.T_evap_room_C)} / ${f(D.T_evap_wax_C)} °C`],
        ['Glycol heat capacity ' + E, f(g.cp_kJ_kgK, 1) + ' kJ/kg·K'], ['Glycol freezes at ' + E, f(g.freeze_C) + ' °C'], ['Glycol flow ' + C, f(D.glycol_m_dot_kg_s, 3) + ' kg/s'],
        ['Pump ' + E, f(g.pump_W) + ' W, only when the chiller runs'], ['Pipe heat gain ' + E, f(g.pipe_UA_W_K) + ' W/K to the outside air'],
        ['Chiller COP over the year ' + S, `${f(RS.COP_chiller, 2)} (realistic) · ${f(ID.COP_chiller, 2)} (ideal)`],
        ['Pump energy ' + S, f(RS.pump_kWh_day, 2) + ' kWh/day'], ['Compressor energy ' + S, f(RS.compressor_kWh_day, 2) + ' kWh/day'],
        ['Cold lost in pipes + pump heat ' + S, f(RS.pipe_loss_kWh_day + RS.pump_heat_kWh_day, 2) + ' kWh/day'],
       ], { note: 'COP = R290 cycle from CoolProp at the evaporating temperature and condensing at outside air + 10 K (same compressor model as the old twin).' })}</div>
      </div>
      <h2>Parts (real photos of typical examples)</h2>
      <div class="cols">
        <div class="card">${fig('condensing_unit', 'Example of an outdoor condensing unit. Ours is a sealed R290 glycol chiller that stands outside in the same way')}</div>
        <div class="card">${fig('pv')}</div><div class="card">${fig('trh_sensor')}</div><div class="card">${fig('temp_probe')}</div><div class="card">${fig('door_switch')}</div>
        <div class="card"><h3>Design drawing – our ice panel</h3>
          <svg viewBox="0 0 520 250" style="width:100%"><rect x="30" y="20" width="24" height="200" fill="none" stroke="#94a3b8" stroke-dasharray="4 3"/><text x="8" y="14" class="dg-s">insulated wall</text>
          <rect x="58" y="24" width="30" height="190" fill="#dbeafe" stroke="#1e3a8a" stroke-width="1.5"/>${[0, 1, 2, 3, 4, 5].map(i => `<circle cx="73" cy="${44 + i * 30}" r="6" fill="#2a78d6" stroke="#1e3a8a"/>`).join('')}
          ${Array.from({ length: 10 }, (_, i) => `<line x1="88" y1="${32 + i * 19}" x2="158" y2="${32 + i * 19}" stroke="#64748b" stroke-width="2.5"/>`).join('')}
          <path d="M175 50 v140" stroke="#0e7490" stroke-width="2" stroke-dasharray="5 4"/><text x="186" y="50" class="dg-s">ice slab ${slab} mm (water with nucleating agent)</text>
          <text x="186" y="72" class="dg-s">glycol coil inside the ice (blue)</text><text x="186" y="94" class="dg-s">aluminium fins ${f(hx.b * 1000)} mm deep, ${f(hx.S * 1000)} mm gap</text>
          <text x="186" y="116" class="dg-s">panel ${f(hx.L, 1)} m tall, ${f(pcm.slab_area_m2)} m² in total</text><text x="186" y="138" class="dg-s">cold air sinks – no fan</text>
          <text x="186" y="160" class="dg-s">drip tray + drain below</text><path d="M54 222 h120 l-6 10 h-108 z" fill="#e2e8f0" stroke="#334155"/></svg>
          <figcaption><b>Design drawing</b> – our own part, not a photo. Sizes from the design file.</figcaption></div>
      </div>`;
  };

  // ------------------------------------------------------------------ FLOWERS
  P.flowers = () => {
    const fit = { Excellent: 'ok', Good: 'ok', 'Short holds': 'wn', 'Not suitable': 'bd' };
    const H = K.holds.flowers;
    const rows = Object.entries(K.crops).map(([k, c]) => {
      const h = (H[k] || {}).best_practice || {};
      const cell = d => (h[d] ? (h[d].allowed ? `${f(h[d].freshness_kept_pct)} %` : `<span class="src">${f(h[d].freshness_kept_pct)} % (not allowed)</span>`) : '–');
      return [`<b>${esc(c.label)}</b><br><span class="src"><i>${esc(c.latin)}</i></span>`, c.best_storage_C[0] === c.best_storage_C[1] ? c.best_storage_C[0] + ' °C' : c.best_storage_C.join('–') + ' °C',
        c.rh_pct.join('–') + ' %', f(c.shelf_life_ambient_days * 24) + ' h (' + f(c.shelf_life_ambient_days, 1) + ' d)', f(c.shelf_life_bagged_4C_days, 0) + ' days',
        `<span class="pill ${fit[c.fit_at_4C]}">${c.fit_at_4C}</span><br><span class="src">${esc(c.fit_note)}${c.fragrance ? ' ' + esc(c.fragrance.note) : ''}</span>`,
        cell('1'), cell('2'), cell('3'), h['1'] ? f(h['1'].freshness_no_room_pct) + ' %' : '–', c.kg_per_crate.join('–') + ' kg', c.ethylene_sensitivity];
    });
    $('app').innerHTML = `<h2>Flowers for a ${f(D.setpoint_C)} °C room ${range()}</h2>
      <div class="card">${table(['Flower', n('Best storage °C ' + E), n('RH'), n('Shelf life outside (about 30 °C) ' + E), n('Shelf life bagged at 4 °C ' + E), 'Fit at 4 °C',
        n('Freshness kept in our room after 1 day ' + S), n('2 days ' + S), n('3 days ' + S), n('1 day with no cold room ' + S), n('kg per crate ' + E), 'Ethylene'], rows,
        { note: 'Freshness = 100 % when picked, 0 % at the end of the reference shelf life. In our room: bagged, loaded at 06:00 at the outside temperature, taken out at 05:00 (so "1 day" is 23 hours); best-practice case.' })}</div>
      <div class="cols">
       <div class="card"><h3>Check-in rules</h3>
        ${Object.values(K.blocked).map(b => `<div class="note bd">⛔ <b>${esc(b.label)}</b> – blocked. ${esc(b.warning)}</div>`).join('')}
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
        ${tile('Hardest month for the room', MONTHS[K.monthly.hardest_month - 1], '', `${f(hm[0].grid_h_per_day, 1)} grid h/day, outside ${f(hm[0].outside_avg_C, 1)} °C, ice down to ${f(hm[0].wax_sunrise_worst_pct)} % at sunrise`)}
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
      <div class="card"><h3>ROI by season ${E}</h3>${table(['Season', n('kg stored ' + S), n('Price uplift'), n('Losses avoided'), n('₹ value'), n('Share of running cost'), n('Net'), n('ROI on total cost')],
        Object.values(c.seasons).map(s => [esc(s.label), f(s.kg), inr(s.price_uplift_INR), inr(s.loss_avoided_INR), inr(s.value_INR), inr(s.running_share_INR), inr(s.net_INR), f(s.roi_on_total_cost_pct, 1) + ' %']),
        { note: esc(c.season_note) })}</div>`;
  };

  // ------------------------------------------------------------------ REALITY CHECK
  P.reality = () => {
    const r = K.reality, L = r.leave_one_out, w = K.wax, ld = K.load, sp = K.flowers.setpoint_5C, xr = K.flowers.extra_racks, pr = K.practice, so = K.solar, rk = pr.racks;
    const head = ['Case', n(`Days fully on solar + ice (of ${DAYS})`), n('Grid h/yr'), n('Grid kWh/yr'), n('Sun share of electricity'), n('Hours outside band'), n('Hours above alarm'), n('Night room max °C'), n('Chiller COP')];
    const row = (lab, c, hl) => ({ hl, c: [lab, f(c.days_full_solar_wax), f(c.grid_h_per_year), f(c.grid_kWh_per_year), f(c.solar_share_of_electricity_pct) + ' %', f(c.hours_outside_band), f(c.hours_above_alarm), f(c.night_room_max_C, 1), f(c.COP_chiller, 2)] });
    const fr = c => ['jasmine', 'marigold', 'rose'].map(k => `${crop(k).label.split(' (')[0]} ${Object.values(c.freshness_after_days[k]).map(x => f(x)).join(' / ')}`).join('<br>');
    const pc = pr.cases, maxS = Math.max(...pr.items_alone.rows.map(x => Math.abs(x.grid_kWh_saved_per_year)));
    const cur = so.options.current, bestS = so.options[so.best];
    $('app').innerHTML = `<h2>Reality check ${S} ${range()}</h2>
      <h2>Three cases side by side</h2>
      <div class="card">${table(['', n('Ideal'), n('<b>Best practice (optimum) – headline</b>'), n('Poor practice')], [
        [`Days fully on solar + ice (of ${DAYS})`, ...['ideal', 'best_practice', 'poor_practice'].map(k => f(pc[k].days_full_solar_wax))],
        ['Grid hours a year', ...['ideal', 'best_practice', 'poor_practice'].map(k => f(pc[k].grid_h_per_year))],
        ['Grid kWh a year', ...['ideal', 'best_practice', 'poor_practice'].map(k => f(pc[k].grid_kWh_per_year))],
        ['Yearly grid bill ' + E, ...['ideal', 'best_practice', 'poor_practice'].map(k => inr(pc[k].grid_bill_INR_per_year.mid))],
        ['Hours above ' + D.band_C[1] + ' °C', ...['ideal', 'best_practice', 'poor_practice'].map(k => f(pc[k].hours_above_band_top))],
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
        [[`<b>(all loopholes on)</b>`, f(L.with_all.days_full_solar_wax), f(L.with_all.grid_h_per_year), f(L.with_all.grid_kWh_per_year)]].concat(
          Object.entries(L.without).sort((a, b) => a[1].grid_kWh_per_year - b[1].grid_kWh_per_year).map(([k, c]) => [esc(r.cases[k].label), f(c.days_full_solar_wax), f(c.grid_h_per_year), f(c.grid_kWh_per_year)])), { note: esc(L.about) })}</div>
      <div class="card"><h3>Ice mass: ${f(w.chosen_kg)} kg chosen</h3>${table([n('Ice kg'), n('Storage cost ' + E), n('Grid kWh/yr – realistic'), n('10-year cost (storage + grid) ' + E), n('Days on solar + ice – ideal'), n('Grid kWh/yr – ideal')],
        w.rows.map(x => ({ hl: x.wax_kg === w.chosen_kg, c: [f(x.wax_kg), inr(x.wax_cost_INR), f(x.realistic.grid_kWh_per_year), inr(x.ten_year_cost_INR), f(x.ideal.days_full_solar_wax), f(x.ideal.grid_kWh_per_year)] })),
        { note: esc(w.about) + ' ' + esc(w.why) + ` Same room with no storage: ${f(w.no_wax_realistic.grid_kWh_per_year)} grid kWh/yr.` })}</div>
      <div class="card"><h3>Grid-help limit</h3><p>${esc(K.night.why)}</p>${table([n('Grid may help above'), n('Days on solar + ice – realistic'), n('Grid kWh/yr – realistic'), n('Days on solar + ice – ideal')],
        K.night.rows.map(x => ({ hl: x.grid_help_above_C === D.controller.protect_above_C, c: [f(x.grid_help_above_C, 1) + ' °C', f(x.realistic_smart.days_full_solar_wax), f(x.realistic_smart.grid_kWh_per_year), f(x.ideal.days_full_solar_wax)] })))}</div>
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
        ${tile('Flowers stored', f(h.kg_stored), 'kg', `${f(h.days_with_stock)} days with stock, ${f(h.fills_done)} fills`)}${tile('Value captured ' + E, inr(h.value_INR), '', `uplift ${inr(h.price_uplift_INR)} + losses avoided ${inr(h.loss_avoided_INR)}`)}
        ${tile('Hours outside ' + D.band_C.join('–') + ' °C', f(h.hours_outside_band), 'h', `above alarm: ${f(h.hours_above_alarm)} h`)}${tile('Humidity (flowers inside)', f(h.rh_avg_pct, 1), '%', `fogger water ${f(h.water_fog_L_day, 2)} L/day`)}
        ${tile('Chiller COP', f(h.COP_chiller, 2), '', `${f(h.electric_kWh_day, 2)} kWh/day`)}</div>
      <div class="card"><h3>Day by day ${lr}</h3><canvas id="lc" height="80"></canvas></div>
      <div class="card"><h3>Month by month</h3>${table(['Month', n('Days'), n('kg stored'), n('Days with stock'), n('Electricity kWh'), n('Solar kWh'), n('Grid kWh'), n('Grid h'), n('Room avg °C'), n('Room max °C'), n('RH %'), n('Outside avg °C'), n('Ice at sunrise, worst %'), n('₹ captured ' + E)],
        v.monthly.map(m => [MONTHS[m.month - 1], f(m.days), f(m.kg_stored), f(m.days_with_stock), f(m.energy_kWh), f(m.solar_kWh), f(m.grid_kWh, 1), f(m.grid_h), f(m.room_avg_C, 1), f(m.room_max_C, 1), m.rh_avg_pct ? f(m.rh_avg_pct) : '–',
          f(m.outside_avg_C, 1), f(m.wax_sunrise_worst_pct), inr(m.value_INR)]))}</div>
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

  document.addEventListener('DOMContentLoaded', () => { const p = document.body.dataset.page; shell(); if (P[p]) P[p](); });
})();
