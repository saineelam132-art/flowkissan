// KoolKisaan Flowers – the pages. All numbers come from window.KK (results files of the twin).
(function () {
  'use strict';
  const { K, $, esc, f, inr, S, E, C, range, table, tile, shell, MONTHS } = window.KKS;
  const D = K.flowers.design, RS = K.flowers.realistic_smart, ID = K.flowers.ideal, DAYS = K.flowers.date_range.days;
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
    $('app').innerHTML = `
      <section class="hero"><h1>${esc(K.project.name)}</h1><p class="tagline">${esc(K.project.tagline)}</p>
        <p>A small solar cold room for loose flowers in Visakhapatnam. Inside ${D.room_m.join(' × ')} m (${f(D.room_m3, 1)} m³), set to ${f(D.setpoint_C, 0)} °C
        (normal band ${D.band_C[0]}–${D.band_C[1]} °C), ${f(D.pv_kWp, 1)} kWp of solar panels, ${f(D.wax_kg)} kg of wax that stores cold for the night,
        and an outdoor R290 chiller that sends cold glycol into the room – so there is <b>${D.r290_inside_room_g} g of R290 inside the room</b>.</p>
        ${range()}</section>
      <h2>The room now ${S} <span class="range" id="nowLbl"></span></h2>
      <div class="ctl"><label>Day <input type="date" id="day" min="${dateOf(0)}" max="${dateOf(nd - 1)}" value="${dateOf(d0)}"></label>
        <label>Hour <input type="range" id="hour" min="0" max="23" step="1" value="${now.getUTCHours()}"></label><button id="nowBtn">● Now</button></div>
      <div class="tiles" id="live"></div>
      <div class="card" style="margin-top:10px"><h3>This day, hour by hour ${S}</h3><canvas id="dayChart" height="90"></canvas></div>
      <h2>Results of the year so far ${S} ${range()}</h2>
      <p class="src">Realistic model + smart controller (the careful numbers). The ideal model is shown in small print.</p>
      <div class="tiles">
        ${tile('Days fully on solar + wax', f(RS.days_full_solar_wax), `of ${DAYS}`, `ideal model: ${f(ID.days_full_solar_wax)} of ${DAYS}`, 'big')}
        ${tile('Electricity from the sun', f(RS.solar_share_of_electricity_pct), '%', `ideal: ${f(ID.solar_share_of_electricity_pct)} %`, 'big good')}
        ${tile('Grid backup', f(RS.grid_h_per_year), 'h/yr', `${f(RS.grid_kWh_per_year)} kWh/yr · ideal: ${f(ID.grid_h_per_year)} h, ${f(ID.grid_kWh_per_year)} kWh`, 'big')}
        ${tile('Chiller COP', f(RS.COP_chiller, 2), '', `ideal: ${f(ID.COP_chiller, 2)}`)}
        ${tile('Hours outside ' + D.band_C.join('–') + ' °C', f(RS.hours_outside_band), 'h', `ideal: ${f(ID.hours_outside_band)} h`)}
        ${tile('Average humidity (flowers inside)', f(RS.rh_avg_pct, 1), '%', `below 85 %: ${f(RS.rh_below_85_h_day, 2)} h/day`)}
        ${tile('Flowers stored', f(RS.kg_stored), 'kg', `${f(RS.days_with_stock)} days with stock`)}
        ${tile('Value captured ' + E, inr(RS.value_INR), '', 'price model is an assumption')}
      </div>
      <div class="note">In the realistic model the room needs a little grid help on every night (about ${f(RS.grid_h_per_day, 1)} h a day): the wax melts at
        ${K.pcm.melt_range_C.join('–')} °C and cools the room only by natural air flow, so the night room sits near the top of the band. See the <a href="reality.html">Reality check</a>.</div>
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
        ['Evaporating temperature', f(cmp.old.ideal.T_evap_C) + ' °C', cmp.new.ideal.T_evap_C.map(x => f(x)).join(' / ') + ' °C (room / wax)'],
        ['Chiller COP – ideal', f(cmp.old.ideal.COP_chiller, 2), f(cmp.new.ideal.COP_chiller, 2)],
        ['Chiller COP – realistic', f(cmp.old.realistic_smart.COP_chiller, 2), f(cmp.new.realistic_smart.COP_chiller, 2)],
        ['Electricity kWh/day – ideal', f(cmp.old.ideal.electric_kWh_day, 2), f(cmp.new.ideal.electric_kWh_day, 2)],
        ['Electricity kWh/day – realistic', f(cmp.old.realistic_smart.electric_kWh_day, 2), f(cmp.new.realistic_smart.electric_kWh_day, 2)],
        [`Days fully on solar + wax (of ${DAYS}) – ideal`, f(cmp.old.ideal.days_full_solar_wax), f(cmp.new.ideal.days_full_solar_wax)],
        [`Days fully on solar + wax – realistic + smart`, f(cmp.old.realistic_smart.days_full_solar_wax), f(cmp.new.realistic_smart.days_full_solar_wax)],
        ['Grid hours/yr – ideal', f(cmp.old.ideal.grid_h_per_year), f(cmp.new.ideal.grid_h_per_year)],
        ['Grid hours/yr – realistic + smart', f(cmp.old.realistic_smart.grid_h_per_year), f(cmp.new.realistic_smart.grid_h_per_year)],
        ['Grid kWh/yr – realistic + smart', f(cmp.old.realistic_smart.grid_kWh_per_year), f(cmp.new.realistic_smart.grid_kWh_per_year)],
      ], { note: 'Comparison only: the two rooms store different produce on different loading plans and have different temperature bands (old 2–8 °C, new ' + D.band_C.join('–') + ' °C).' })}</div>`;
    let chart = null;
    function draw() {
      const d = Math.round((Date.parse($('day').value) - Date.UTC(2026, 0, 1)) / 864e5), h = +$('hour').value, i = Math.max(0, Math.min(H.n - 1, d * 24 + h));
      const on = H.run[i] > 0, src = H.grid[i] > 0 ? 'Grid backup' : (on ? 'Solar' : (H.P_pv[i] > 0.05 ? 'Solar (chiller idle)' : 'Wax (chiller off)'));
      $('nowLbl').textContent = `Digital twin, ${$('day').value} ${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00 IST – simulated, not measured`;
      const T = H.T_room[i], cls = T > D.alarm_C[1] || T < D.alarm_C[0] ? 'warn' : (T > D.band_C[1] || T < D.band_C[0] ? 'warn' : 'good');
      $('live').innerHTML = tile('Room', f(T, 1), '°C', `band ${D.band_C.join('–')} °C`, 'big ' + cls) + tile('Humidity', f(H.RH_room[i], 0), '%', `target ${D.rh_target_pct.join('–')} %`, 'big')
        + tile('Wax (frozen)', f(H.wax[i], 0), '%', H.v_wax[i] > 0 ? 'V-WAX open: charging' : 'V-WAX closed', 'big')
        + tile('Glycol supply / return', on ? `${f(H.T_sup[i], 1)} / ${f(H.T_ret[i], 1)}` : 'pump off', on ? '°C' : '', on ? '' : 'both valves closed', 'big')
        + tile('Power source', src, '', `solar now ${f(H.P_pv[i], 2)} kW · using ${f(H.P_comp[i], 2)} kW`, 'big') + tile('Flowers inside', f(H.kg[i], 0), 'kg', '')
        + tile('Outside', f(H.T_out[i], 1), '°C', `${f(H.RH_out[i], 0)} % RH`);
      const a = d * 24, lab = Array.from({ length: 24 }, (_, k) => k + ':00'), sl = k => H[k].slice(a, a + 24);
      const ds = [{ label: 'Room °C', data: sl('T_room'), borderColor: '#2a78d6', yAxisID: 'y' }, { label: 'Outside °C', data: sl('T_out'), borderColor: '#f59e0b', yAxisID: 'y' },
        { label: 'Wax %', data: sl('wax'), borderColor: '#14b8a6', yAxisID: 'y2' }, { label: 'Humidity %', data: sl('RH_room'), borderColor: '#8b5cf6', yAxisID: 'y2' }];
      if (chart) { chart.data.datasets.forEach((s, k) => { s.data = ds[k].data; }); chart.update('none'); } else if (window.Chart) {
        chart = new Chart($('dayChart'), { type: 'line', data: { labels: lab, datasets: ds.map(s => ({ ...s, pointRadius: 0, borderWidth: 2, tension: .3 })) },
          options: { animation: false, interaction: { mode: 'index', intersect: false }, scales: { y: { title: { display: true, text: '°C' } }, y2: { position: 'right', min: 0, max: 100, title: { display: true, text: '%' }, grid: { drawOnChartArea: false } } } } });
      }
    }
    $('day').onchange = $('hour').oninput = draw;
    $('nowBtn').onclick = () => { $('day').value = dateOf(d0); $('hour').value = new Date(Date.now() + 5.5 * 3600e3).getUTCHours(); draw(); };
    draw();
  };

  // ------------------------------------------------------------------ HOW IT WORKS
  P.how = () => {
    const g = D.glycol, ph = K.photos, hx = K.wax_hx, pcm = K.pcm;
    const slab = Math.round(1000 * D.wax_kg / (pcm.density_kg_m3 * pcm.slab_area_m2));
    const fig = (k, cap) => (ph[k] ? `<figure><img src="${ph[k].file}" alt="${esc(ph[k].what)}" loading="lazy"><figcaption>${esc(cap || ph[k].caption)} – a typical example, not our unit. ${esc(ph[k].credit)} · <a href="${ph[k].source}">source</a></figcaption></figure>` : '');
    $('app').innerHTML = `<h2>How it works ${range()}</h2>
      <div class="card diagram"><div class="zero">${D.r290_inside_room_g} g R290 inside the room</div>
      <svg viewBox="0 0 900 430" role="img" aria-label="Diagram: outdoor R290 chiller, plate heat exchanger, glycol pump, V-ROOM to the air cooler and V-WAX to the wax panels">
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
        <path d="M584 290 H650" class="dg-cold"/><rect x="650" y="255" width="200" height="80" rx="8" class="dg-box"/><text x="662" y="283" class="dg-t">Wax panels (${f(D.wax_kg)} kg) + fins</text><text x="662" y="302" class="dg-s">glycol coils inside · supply ${f(g.supply_wax_C)} °C</text><text x="662" y="320" class="dg-s">melts at ${pcm.melt_range_C.join('–')} °C</text>
        <path d="M850 110 H870 V370 H300 V230 H240 M850 295 H870" class="dg-warm"/><text x="480" y="390" class="dg-s">orange = glycol return (warmer)</text>
        <text x="32" y="352" class="dg-s">blue = cold glycol (${esc(g.fluid)})</text>
      </svg></div>
      <div class="cols">
       <div class="card"><h3>Control rules</h3><ul class="plain">
        <li><b>Room first.</b> V-ROOM opens when the room needs cold.</li>
        <li><b>V-WAX</b> opens only with spare solar power and when the wax is below 100 %.</li>
        <li><b>At night</b> the pump is off and both valves are closed. The wax cools the room by natural air flow over the fins.</li>
        <li>Minimum ON time ${f(g.min_on_min)} min. The grid is only a backup (wax below ${f(D.controller.ats_pcm_pct)} % with no sun, or the room above ${f(D.controller.protect_above_C, 1)} °C for 15 min).</li></ul></div>
       <div class="card"><h3>The physics in the twin ${C} ${E}</h3>${table(['', N], [
        ['Glycol supply for the air cooler ' + E, f(g.supply_room_C) + ' °C'], ['Glycol supply when charging wax ' + E, f(g.supply_wax_C) + ' °C'],
        ['Plate heat-exchanger approach ' + E, f(g.hx_approach_K) + ' K'], ['R290 evaporating temperature (room / wax) ' + C, `${f(D.T_evap_room_C)} / ${f(D.T_evap_wax_C)} °C`],
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
        <div class="card"><h3>Design drawing – our wax panel</h3>
          <svg viewBox="0 0 520 250" style="width:100%"><rect x="30" y="20" width="24" height="200" fill="none" stroke="#94a3b8" stroke-dasharray="4 3"/><text x="8" y="14" class="dg-s">insulated wall</text>
          <rect x="58" y="24" width="30" height="190" fill="#dbeafe" stroke="#1e3a8a" stroke-width="1.5"/>${[0, 1, 2, 3, 4, 5].map(i => `<circle cx="73" cy="${44 + i * 30}" r="6" fill="#2a78d6" stroke="#1e3a8a"/>`).join('')}
          ${Array.from({ length: 10 }, (_, i) => `<line x1="88" y1="${32 + i * 19}" x2="158" y2="${32 + i * 19}" stroke="#64748b" stroke-width="2.5"/>`).join('')}
          <path d="M175 50 v140" stroke="#0e7490" stroke-width="2" stroke-dasharray="5 4"/><text x="186" y="50" class="dg-s">wax slab ${slab} mm (paraffin + ${f(pcm.graphite_wt_frac * 100)} % graphite)</text>
          <text x="186" y="72" class="dg-s">glycol coil inside the wax (blue)</text><text x="186" y="94" class="dg-s">aluminium fins ${f(hx.b * 1000)} mm deep, ${f(hx.S * 1000)} mm gap</text>
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
      const h = (H[k] || {}).realistic || {};
      const cell = d => (h[d] ? (h[d].allowed ? `${f(h[d].freshness_kept_pct)} %` : `<span class="src">${f(h[d].freshness_kept_pct)} % (not allowed)</span>`) : '–');
      return [`<b>${esc(c.label)}</b><br><span class="src"><i>${esc(c.latin)}</i></span>`, c.best_storage_C[0] === c.best_storage_C[1] ? c.best_storage_C[0] + ' °C' : c.best_storage_C.join('–') + ' °C',
        c.rh_pct.join('–') + ' %', f(c.shelf_life_ambient_days * 24) + ' h (' + f(c.shelf_life_ambient_days, 1) + ' d)', f(c.shelf_life_bagged_4C_days, 0) + ' days',
        `<span class="pill ${fit[c.fit_at_4C]}">${c.fit_at_4C}</span><br><span class="src">${esc(c.fit_note)}${c.fragrance ? ' ' + esc(c.fragrance.note) : ''}</span>`,
        cell('1'), cell('2'), cell('3'), h['1'] ? f(h['1'].freshness_no_room_pct) + ' %' : '–', c.kg_per_crate.join('–') + ' kg', c.ethylene_sensitivity];
    });
    $('app').innerHTML = `<h2>Flowers for a ${f(D.setpoint_C)} °C room ${range()}</h2>
      <div class="card">${table(['Flower', n('Best storage °C ' + E), n('RH'), n('Shelf life outside (about 30 °C) ' + E), n('Shelf life bagged at 4 °C ' + E), 'Fit at 4 °C',
        n('Freshness kept in our room after 1 day ' + S), n('2 days ' + S), n('3 days ' + S), n('1 day with no cold room ' + S), n('kg per crate ' + E), 'Ethylene'], rows,
        { note: 'Freshness = 100 % when picked, 0 % at the end of the reference shelf life. In our room: bagged, loaded at 13:00 at the outside temperature, taken out at 05:00; realistic model.' })}</div>
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
        { note: esc(K.monthly.value_definition) + ' Realistic model + smart controller.' })}</div>
      <div class="tiles">
        ${tile('Days with stock (full-year plan)', f(K.plan.days_with_stock_full_year), 'days', `research estimate ${cal.research_estimate.days_with_stock.join('–')} ${''}`)}
        ${tile('High-value days (full-year plan)', f(K.plan.high_value_days_full_year), 'days', `research estimate ${cal.research_estimate.high_value_days.join('–')}`)}
        ${tile('Busiest month', MONTHS[K.monthly.busiest_month - 1], '', 'most kg per day')}
        ${tile('Hardest month for the room', MONTHS[K.monthly.hardest_month - 1], '', `${f(hm[0].grid_h_per_day, 1)} grid h/day, outside ${f(hm[0].outside_avg_C, 1)} °C, wax down to ${f(hm[0].wax_sunrise_worst_pct)} % at sunrise`)}
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
      <p>Flowers want ${D.rh_target_pct.join('–')} % relative humidity. Cold surfaces (the air cooler and the wax panels) take water out of the air; the flowers give a little back.
        The twin keeps a water balance of the room air every 5 minutes.</p>
      <div class="card">${table(['Option', n('Average RH'), n('Hours/day below 85 %'), n('Flower weight loss %/day'), n('Extra energy kWh/day'), n('Water use L/day'), n('₹ value of flowers ' + E)],
        Object.entries(o).map(([k, v]) => ({ hl: k === h.best, c: [esc(v.label) + (k === h.best ? ' <span class="pill ok">best</span>' : ''), f(v.rh_avg_pct, 1) + ' %', f(v.rh_below_85_h_day, 2), f(v.weight_loss_pct_per_day, 2),
          f(v.extra_energy_kWh_day, 2), f(v.water_use_L_day, 2), inr(v.value_INR)] })),
        { note: 'RH counts only the hours with flowers inside. Realistic model + smart controller, seasonal plan. Best = ' + esc(h.best_why) + '.' })}</div>
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
    const c = K.cost, L = ['low', 'mid', 'high'], tw = c.twin_inputs;
    const lm = o => L.map(k => inr(o[k]));
    $('app').innerHTML = `<h2>Cost and ROI ${E} ${range()}</h2>
      <div class="note">Every price here is an assumption (low / mid / high) until real quotations arrive. Energy, water, kg and ₹ value come from the twin (realistic model + smart controller).</div>
      <div class="tiles">${tile('Total cost', inr(c.total_cost_INR.mid), '', `${inr(c.total_cost_INR.low)} – ${inr(c.total_cost_INR.high)}`, 'big')}
        ${tile('Payback – farmer group', f(c.cases.farmer_group.mid.payback_years, 1), 'years', `${f(c.cases.farmer_group.payback_best_years, 1)} – ${f(c.cases.farmer_group.payback_worst_years, 1)} years`, 'big')}
        ${tile('Extra cost of the glycol design', inr(c.glycol_vs_old.extra_cost_INR.mid), '', `${inr(c.glycol_vs_old.extra_cost_INR.low)} – ${inr(c.glycol_vs_old.extra_cost_INR.high)}`, 'big')}</div>
      <div class="card"><h3>Bill of materials ${E}</h3>${table(['Item', n('Low'), n('Mid'), n('High')], c.bom.map(b => [esc(b.item), ...lm(b)]).concat([{ hl: 1, c: ['<b>Total</b>', ...lm(c.total_cost_INR)] }]))}</div>
      <div class="card"><h3>Extra cost of the glycol design against the old in-room R290 design ${E}</h3>
        ${table(['', n('Low'), n('Mid'), n('High')], [['Glycol design: chiller + pump, tank, valves, pipes, glycol + air cooler', ...lm(c.glycol_vs_old.glycol_parts_INR)], [esc(c.glycol_vs_old.old_item), ...lm(c.glycol_vs_old.old_parts_INR)],
          { hl: 1, c: ['<b>Extra cost</b>', ...lm(c.glycol_vs_old.extra_cost_INR)] }], { note: esc(c.glycol_vs_old.why) })}</div>
      <div class="card"><h3>Yearly running cost</h3>${table(['', n('Low'), n('Mid'), n('High')], [
        [`Grid electricity: ${f(tw.grid_kWh_per_year)} kWh/yr ${S} × tariff ${E}`, ...L.map(k => inr(c.running_INR_yr[k].grid_electricity_INR))],
        ['Upkeep ' + E, ...L.map(k => inr(c.running_INR_yr[k].upkeep_INR))], [`PE bags for ${f(tw.kg_planned_full_year)} kg/yr ` + E, ...L.map(k => inr(c.running_INR_yr[k].bags_INR))],
        [`Fogger water: ${f(tw.fogger_water_L_per_year)} L/yr ${S}`, ...L.map(k => inr(c.running_INR_yr[k].water_INR))], { hl: 1, c: ['<b>Total per year</b>', ...L.map(k => inr(c.running_INR_yr[k].total_INR))] }],
        { note: `Pump: ${f(tw.pump_kWh_per_year)} kWh/yr ${S} of ${f(tw.electric_kWh_per_year)} kWh/yr in total. ${esc(tw.pump_note)}` })}</div>
      <div class="card"><h3>Payback by case</h3>${table(['Case', n('Total cost (mid)'), n('Benefit ₹/yr (mid)'), n('Running ₹/yr'), n('Net ₹/yr'), n('Simple payback'), n('Best – worst'), n('10-year net value')],
        Object.values(c.cases).map(x => [esc(x.label), inr(x.mid.total_cost_INR), inr(x.mid.benefit_INR_yr), inr(x.mid.running_INR_yr), inr(x.mid.net_INR_yr),
          x.mid.payback_years ? f(x.mid.payback_years, 1) + ' yr' : '<span class="pill bd">does not pay back</span>',
          (x.payback_best_years ? f(x.payback_best_years, 1) : '–') + ' – ' + (x.payback_worst_years ? f(x.payback_worst_years, 1) + ' yr' : 'never'), inr(x.mid.ten_year_net_INR)]),
        { note: `(a) ${esc(c.benefit.farmer_group.how)}. (b) ${esc(c.benefit.rent_only.how)}. ${esc(c.assumptions_E.benefit.subsidy_note)}` })}</div>
      <div class="card"><h3>ROI by season ${E}</h3>${table(['Season', n('kg stored ' + S), n('Price uplift'), n('Losses avoided'), n('₹ value'), n('Share of running cost'), n('Net'), n('ROI on total cost')],
        Object.values(c.seasons).map(s => [esc(s.label), f(s.kg), inr(s.price_uplift_INR), inr(s.loss_avoided_INR), inr(s.value_INR), inr(s.running_share_INR), inr(s.net_INR), f(s.roi_on_total_cost_pct, 1) + ' %']),
        { note: esc(c.season_note) })}</div>`;
  };

  // ------------------------------------------------------------------ REALITY CHECK
  P.reality = () => {
    const r = K.reality, L = r.leave_one_out, w = K.wax, ld = K.load, sp = K.flowers.setpoint_5C, xr = K.flowers.extra_racks;
    const head = ['Case', n(`Days fully on solar + wax (of ${DAYS})`), n('Grid h/yr'), n('Grid kWh/yr'), n('Sun share of electricity'), n('Hours outside band'), n('Hours above alarm'), n('Night room max °C'), n('Chiller COP')];
    const row = (lab, c, hl) => ({ hl, c: [lab, f(c.days_full_solar_wax), f(c.grid_h_per_year), f(c.grid_kWh_per_year), f(c.solar_share_of_electricity_pct) + ' %', f(c.hours_outside_band), f(c.hours_above_alarm), f(c.night_room_max_C, 1), f(c.COP_chiller, 2)] });
    $('app').innerHTML = `<h2>Reality check for the flower room ${S} ${range()}</h2>
      <p>The ideal model is too kind. Here each real-life loophole is switched on alone, then all together. The list is the same as in the old reality check, plus the new pump and glycol losses.</p>
      <div class="card">${table(head, r.order.map(k => row(esc(r.cases[k].label) + (r.cases[k].E ? `<br><span class="src">${E} ${esc(r.cases[k].E)}</span>` : ''), r.cases[k], k === 'realistic_smart')))}</div>
      <div class="note">With everything real at once the room has no day that is 100 % solar + wax: on every night the grid helps for a while (about ${f(RS.grid_h_per_day, 1)} h a day,
        ${f(RS.grid_kWh_per_year)} kWh a year). The sun still gives ${f(RS.solar_share_of_electricity_pct)} % of the electricity. With no grid at all the realistic room is above the alarm for ${f(r.cases.realistic_no_grid.hours_above_alarm)} hours.</div>
      <div class="card"><h3>Leave one out: which loophole matters most?</h3>${table(['REALISTIC + smart controller, but without…', n('Days on solar + wax'), n('Grid h/yr'), n('Grid kWh/yr')],
        [[`<b>(all loopholes on)</b>`, f(L.with_all.days_full_solar_wax), f(L.with_all.grid_h_per_year), f(L.with_all.grid_kWh_per_year)]].concat(
          Object.entries(L.without).sort((a, b) => a[1].grid_h_per_year - b[1].grid_h_per_year).map(([k, c]) => [esc(r.cases[k].label), f(c.days_full_solar_wax), f(c.grid_h_per_year), f(c.grid_kWh_per_year)])), { note: esc(L.about) })}</div>
      <div class="card"><h3>Why the nights are tight: the grid-help limit</h3><p>${esc(K.night.why)}</p>${table([n('Grid may help above'), n('Days on solar + wax – realistic'), n('Grid h/yr – realistic'), n('Days on solar + wax – ideal'), n('Grid h/yr – ideal')],
        K.night.rows.map(x => ({ hl: x.grid_help_above_C === D.controller.protect_above_C, c: [f(x.grid_help_above_C, 1) + ' °C', f(x.realistic_smart.days_full_solar_wax), f(x.realistic_smart.grid_h_per_year), f(x.ideal.days_full_solar_wax), f(x.ideal.grid_h_per_year)] })))}</div>
      <div class="card"><h3>Wax mass: ${f(w.chosen_kg)} kg chosen</h3>${table([n('Wax kg'), n('Wax cost ' + E), n('Grid h/yr – realistic'), n('Grid h avoided per ₹1,000 of wax'), n('Days on solar + wax – ideal'), n('Grid h/yr – ideal')],
        w.rows.map(x => ({ hl: x.wax_kg === w.chosen_kg, c: [f(x.wax_kg), inr(x.wax_cost_INR), f(x.realistic.grid_h_per_year), f(x.grid_h_avoided_per_1000_INR, 1), f(x.ideal.days_full_solar_wax), f(x.ideal.grid_h_per_year)] })),
        { note: esc(w.about) + ' ' + esc(w.why) + ` Same room with no wax: ${f(w.no_wax_realistic.grid_h_per_year)} grid h/yr.` })}</div>
      <div class="card"><h3>Load per fill (marigold, one fill a day)</h3>${table([n('kg per fill'), n('Crates needed'), 'Fits the ' + ld.crate_places + ' crate places?', n('Grid h/yr'), n('Hours outside band'), n('Hours to 6 °C'), n('Freshness kept')],
        ld.rows.map(x => [f(x.kg_per_fill), f(x.crates_needed), x.fits ? '<span class="pill ok">yes</span>' : '<span class="pill bd">no – flowers are bulky</span>', f(x.grid_h_per_year), f(x.hours_outside_band), f(x.time_to_6C_h_avg, 1), f(x.freshness_kept_pct) + ' %']))}
        ${table(['Flower', n('kg per crate ' + E), n('Full room, ' + ld.crate_places + ' crates'), n('With extra racks, ' + xr.crate_places + ' crates')], Object.entries(ld.capacity_kg_by_flower).map(([k, v]) => [esc(crop(k).label), v.kg_per_crate.join('–'), f(v.room_kg) + ' kg', f(v.room_kg_extra_racks) + ' kg']))}
        <p class="src">Extra racks (${esc(xr.aisle_note)}): ${f(xr.extra_kg_stored)} kg more stored, ${f(xr.extra_grid_kWh_per_year)} kWh/yr more grid, ${f(xr.extra_hours_outside_band)} more hours outside the band, ${inr(xr.extra_value_INR)} more value ${E}.</p></div>
      <div class="card"><h3>Set-point 5 °C instead of ${f(D.setpoint_C)} °C</h3>${table(head, [row(`${f(D.setpoint_C)} °C – ideal`, ID), row('5 °C – ideal', sp.ideal), row(`${f(D.setpoint_C)} °C – realistic + smart`, RS, 1), row('5 °C – realistic + smart', sp.realistic_smart)],
        { note: 'At 5 °C the band and the grid-help limit move up by 1 K as well.' })}</div>`;
  };

  document.addEventListener('DOMContentLoaded', () => { const p = document.body.dataset.page; shell(); if (P[p]) P[p](); });
})();
