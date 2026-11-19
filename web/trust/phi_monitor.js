// Live Trust Monitor (Owner view of trust.html): follows the shared chamber clock through window.TrustBus (trust.js).
// Sensor cards → SVG data lines → ESP32 edge node; Φ gauge; physics-engine chips; Safe Mode; Φ formula card with live numbers and
// residual bars; Demo tampering (window, timeline, ledger, impact); tamper log sealed in the ledger. All values S/E, nothing measured.
(function () {
  'use strict';
  const root = document.getElementById('phiMon'), PC = window.PhiCore;
  if (!root || !PC) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fin = Number.isFinite, num = v => (v === null || v === undefined ? NaN : +v);
  const f1 = x => (fin(x) ? (+x).toFixed(1) : '–'), f2 = x => (fin(x) ? (+x).toFixed(2) : '–'), f0 = x => (fin(x) ? Math.round(x).toLocaleString('en-IN') : '–');
  const SENS = [['T_out_s', 'Outside temperature', '🌡️', '°C', 1], ['RH_out_s', 'Outside humidity', '💧', '%', 0], ['T_mid', 'Room temperature (middle)', '🌡️', '°C', 1],
    ['T_high', 'Room temperature (high)', '🌡️', '°C', 1], ['RH_mid', 'Room humidity', '💧', '%', 0], ['T_flower', 'Flower core temperature', '🌡️', '°C', 1],
    ['T_ice', 'Ice panel temperature', '❄️', '°C', 1], ['T_sup', 'Glycol supply', '⇄', '°C', 1], ['T_ret', 'Glycol return', '⇄', '°C', 1],
    ['flow', 'Glycol flow', '⟳', 'kg/s', 2], ['P_el', 'Chiller power', '⚡', 'kW', 2], ['door', 'Door switch', '🚪', '', 0]];
  const CHIPS = [['Heat balance', ['R1', 'R2'], ['R10']], ['Chiller COP check', ['R3', 'R4'], ['H1']], ['Moisture balance', ['R6'], []],
    ['Ice balance', ['R5'], ['H3']], ['Weather cross-check', ['R7T', 'R7W'], []], ['Power vs inverter', ['R8'], ['R8d']], ['Room probes', ['R9'], ['H2']]];
  const RN = PC.NAMES, RLAB = { R1: 'Room heat', R2: 'Flower heat', R3: 'Glycol loop', R4: 'Chiller COP', R5: 'Ice', R6: 'Moisture', R7T: 'Outside T', R7W: 'Outside RH', R8: 'Power', R9: 'Probes' };
  let B = null, built = false;

  // ------------------------------------------------------------ layout
  function build() {
    const S = window.PhiStream.SENSORS, K = window.PhiStream.KINDS;
    root.innerHTML = `
    <div class="pm-head"><span class="pm-dot" aria-hidden="true"></span><h3>Live Trust Monitor (Φ physics check) <span class="chip S">S</span> <span class="chip C">C</span></h3>
      <span class="pm-clock" id="pmClock"></span></div>
    <div class="pm-grid">
      <div class="pm-left">
        <div class="pm-colh"><span>Sensor</span><span>Live value</span></div>
        <ul class="pm-sensors" id="pmSensors" aria-label="Owner sensors and their live values">${SENS.map(([k, name, ic]) => `<li class="pm-s" id="pmS_${k}"><span class="pm-ic" aria-hidden="true">${ic}</span>
          <span class="pm-name">${name}<span class="pm-badges"><span class="pm-badge" hidden>MANIPULATED</span><span class="pm-badge q" hidden>QUARANTINED</span><span class="pm-badge s" hidden>SUSPECT</span><span class="pm-badge u" hidden>UNDER ATTACK</span></span></span><b class="pm-val" id="pmV_${k}">–</b></li>`).join('')}</ul>
        <div class="pm-ext"><div class="pm-colh"><span>Independent references (owner cannot edit)</span></div>
          <ul><li>☁️ Weather service <b id="pmWx">–</b></li><li>📟 DISCOM meter (yesterday) <b id="pmDis">–</b></li><li>🔆 Solar inverter log <b id="pmInv">–</b></li></ul></div>
      </div>
      <div class="pm-wires"><svg id="pmSvg" role="img" aria-labelledby="pmSvgT"><title id="pmSvgT">Data lines from each sensor to the ESP32 edge node</title></svg>
        <div class="pm-node" id="pmNode"><svg viewBox="0 0 64 80" aria-hidden="true"><rect x="4" y="4" width="56" height="72" rx="6" fill="#0f2a4a" stroke="#38bdf8" stroke-width="2"/>
          <rect x="14" y="14" width="36" height="30" rx="2" fill="#1e3a5f"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="8" cy="${12 + i * 8}" r="1.5" fill="#cbd5e1"/><circle cx="56" cy="${12 + i * 8}" r="1.5" fill="#cbd5e1"/>`).join('')}
          <rect x="22" y="56" width="20" height="12" rx="2" fill="#94a3b8"/></svg><b>ESP32 edge node</b><small>recomputes Φ every 5 min · signs every reading</small></div>
      </div>
      <div class="pm-right">
        <div class="pm-card"><h4 id="pmGT">Φ integrity score</h4><svg id="pmGauge" viewBox="0 0 220 140" role="img" aria-labelledby="pmGaugeT"><title id="pmGaugeT">Φ gauge</title></svg>
          <div class="pm-phi" id="pmPhi">Φ = –</div><div class="pm-state" id="pmState"></div><div class="pm-raw" id="pmRaw"></div></div>
        <div class="pm-card pm-engine"><h4>Φ physics engine</h4><div id="pmChips" class="pm-chips">${CHIPS.map(([lab], i) => `<span class="pm-chip" id="pmC${i}">${lab}</span>`).join('')}</div></div>
        <div class="pm-card pm-safe" id="pmSafe" aria-live="polite"></div>
      </div>
    </div>
    <div class="pm-card pm-formula" id="pmF"><h4>How Φ is worked out – the formula exactly as coded <span class="chip C">C</span></h4>
      <div class="pmf-grid"><ol class="pmf" id="pmFormula">
        <li data-hl="all"><span class="eq">z<sub>j</sub> = (r<sub>j</sub> − μ<sub>j</sub>) / √(σ<sub>j</sub>² + u<sub>j</sub>²)</span><span class="pl">Each check's error, divided by its normal spread. u widens the spread while a big uncertain flow happens (hot load, open door).</span></li>
        <li data-hl="whiten"><span class="eq">e<sub>j</sub> = (z<sub>j</sub> − ρ<sub>j</sub>·z<sub>j,k−1</sub>) / √(1 − ρ<sub>j</sub>²)</span><span class="pl">AR(1) whitening: removes the memory a check carries from the last reading (outside T is judged on its level).</span></li>
        <li data-hl="all"><span class="eq">χ² = eᵀ Σ⁻¹ e</span> <b class="lv">χ² = <span id="lvChi">–</span>, m = <span id="lvM">–</span></b><span class="pl">All active checks together, with how they normally move together (Σ). m = number of checks active now.</span></li>
        <li data-hl="all"><span class="eq">Φ<sub>inst</sub> = Φ<sub>N</sub>⁻¹( F<sub>χ²(m)</sub>(χ²) )</span> <b class="lv">Φ<sub>inst</sub> = <span id="lvInst">–</span></b><span class="pl">Turned into a "sigma" number: Φ = 3 always means the same small false-alarm chance, whatever m is.</span></li>
        <li data-hl="cusum"><span class="eq">S<sub>k</sub> = max(0, S<sub>k−1</sub> + χ²<sub>c</sub> − m<sub>c</sub> − κ), Φ<sub>slow</sub> = 3·S<sub>k</sub>/h</span> <b class="lv">S<sub>k</sub> = <span id="lvS">–</span>, Φ<sub>slow</sub> = <span id="lvSlow">–</span></b>
          <span class="pl">Memory for slow lies. Each e is clipped to ±4 here, and the two weather checks (outside T, outside humidity) are left out of this sum. κ = <span id="lvK"></span>, h = <span id="lvH"></span>.</span></li>
        <li data-hl="day"><span class="eq">Φ<sub>day</sub> = |R10 or R8d − normal| / spread</span> <b class="lv">Φ<sub>day</sub> = <span id="lvDay">–</span></b><span class="pl">Yesterday's energy closure and utility-meter check, held for today.</span></li>
        <li data-hl="all"><span class="eq">Φ = max(Φ<sub>inst</sub>, Φ<sub>slow</sub>, Φ<sub>day</sub>, 99 if a hard rule breaks)</span> <b class="lv">Φ = <span id="lvPhi">–</span></b><span class="pl">FLAG when Φ ≥ 3 for 3 readings in a row, or at once if a hard rule breaks (now: <span id="lvRun">–</span>).</span></li>
      </ol>
      <div class="pmf-bars"><div class="pm-colh"><span>|e| per check now (limit 3)</span></div><ul id="pmBars" aria-label="Size of each residual now">${RN.map(r => `<li data-r="${r}"><span class="bl">${r} ${RLAB[r]}</span><span class="bt"><i></i></span><b class="bv">–</b></li>`).join('')}</ul>
        <p class="note">Hover or tap a line of the formula to see which bars it uses.</p></div></div>
    </div>
    <div class="pm-card pm-tamper"><h4>Demo tampering – attack the room and watch the whole story <span class="chip S">S</span> <span class="chip E">E</span></h4>
      <div class="pm-labgrid">
        <fieldset><legend>Sensor(s) to fake</legend><div id="pmPick" class="pm-pick">${Object.entries(S).map(([k, v]) => `<label><input type="checkbox" value="${k}" ${k === 'T_mid' || k === 'T_flower' ? 'checked' : ''}> ${esc(v)}</label>`).join('')}</div></fieldset>
        <div class="pm-ctl">
          <label>Attack<select id="pmKind">${Object.entries(K).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
          <label>Size <span id="pmSizeU">(K; power and flow: %)</span><input id="pmSize" type="number" step="0.1" value="-2"></label>
          <div class="two"><label>Start (IST)<input id="pmStart" type="datetime-local"></label><label>End (IST)<input id="pmEnd" type="datetime-local"></label></div>
          <div class="row"><button id="pmRun" class="danger">Start attack</button><button id="pmClear">Clear the attack</button></div>
          <div class="row" id="pmEditRow" hidden><button id="pmEdit" class="danger">Edit an old reading</button><button id="pmRehash" class="danger">Edit + re-hash later blocks</button></div>
          <p class="note" id="pmCtlNote">Start ≥ the next reading (the ledger only grows). The clock runs fast until 2 h after the end.
            The isolation step can name an extra or a wrong sensor (it is best for sudden lies; see the Trust method page for how often it is right).</p>
        </div>
        <div class="pm-verdict" id="pmVerdict" aria-live="polite"></div>
      </div>
      <div id="pmTl" class="pm-tl"></div>
      <div id="pmImpact" class="pm-impact"></div>
    </div>
    <div class="pm-card pm-log"><h4>Tamper log <small>(sealed in the ledger – flags are never removed when Φ returns to green)</small></h4><div id="pmTimeline" class="pm-timeline"></div><div id="pmIncidents" class="pm-ledger"></div></div>
    <p class="sr-only" id="pmSR" aria-live="polite"></p>`;
    // gauge
    const G = $('pmGauge'), gx = 110, gy = 118, gr = 90;
    const ang = v => Math.PI * (1 - Math.min(6, Math.max(0, v)) / 6), pt = (v, r) => [gx + r * Math.cos(ang(v)), gy - r * Math.sin(ang(v))];
    const arc = (a, b, cls) => { const [x0, y0] = pt(a, gr), [x1, y1] = pt(b, gr); return `<path class="${cls}" d="M${x0},${y0} A${gr},${gr} 0 0 1 ${x1},${y1}"/>`; };
    G.innerHTML += arc(0, 2, 'g-ok') + arc(2, 3, 'g-warn') + arc(3, 6, 'g-bad') + [0, 1, 2, 3, 4, 5, 6].map(v => { const [x, y] = pt(v, gr + 14); return `<text x="${x}" y="${y + 4}" class="g-t">${v}</text>`; }).join('') +
      `<g id="pmNeedle" class="g-needle"><line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy - gr + 12}"/><circle cx="${gx}" cy="${gy}" r="7"/></g>`;
    // formula highlight
    const groups = { all: RN, whiten: RN.filter(r => r !== 'R7T'), cusum: RN.filter(r => r !== 'R7T' && r !== 'R7W'), day: [] };
    $('pmFormula').querySelectorAll('li').forEach(li => {
      li.tabIndex = 0;
      const on = v => { const set = new Set(v ? groups[li.dataset.hl] : []); $('pmBars').querySelectorAll('li').forEach(b => b.classList.toggle('hl', set.has(b.dataset.r))); li.classList.toggle('hl', v); };
      li.addEventListener('mouseenter', () => on(true)); li.addEventListener('mouseleave', () => on(false));
      li.addEventListener('focus', () => on(true)); li.addEventListener('blur', () => on(false));
    });
    // controls
    const kindChange = () => {
      const k = $('pmKind').value;
      $('pmPick').classList.toggle('off', !['offset', 'freeze', 'drift'].includes(k));
      $('pmSize').disabled = !['offset', 'drift'].includes(k);
      $('pmEditRow').hidden = k !== 'edit'; $('pmRun').hidden = k === 'edit';
      if (k === 'drift') $('pmSize').value = -0.1; else if (k === 'offset' && +$('pmSize').value === -0.1) $('pmSize').value = -2;
    };
    $('pmKind').onchange = kindChange;
    for (const id of ['pmStart', 'pmEnd']) $(id).addEventListener('input', () => { $('pmStart').dataset.touched = '1'; });
    $('pmRun').onclick = async () => {
      const kind = $('pmKind').value, sensors = [...document.querySelectorAll('#pmPick input:checked')].map(x => x.value);
      if (['offset', 'freeze', 'drift'].includes(kind) && !sensors.length) { $('pmVerdict').textContent = 'Pick at least one sensor.'; return; }
      const st = stepOf($('pmStart').value), en = stepOf($('pmEnd').value);
      if (!(en > st)) { $('pmVerdict').textContent = 'The end must be after the start.'; return; }
      const msg = await B.setTamper({ kind, sensors: kind === 'replay' ? [] : sensors, size: +$('pmSize').value || 0, start: st, end: en });
      delete $('pmStart').dataset.touched;
      $('pmVerdict').textContent = msg || 'Attack started – the clock runs fast; watch the red lines, the gauge and the ledger.';
    };
    $('pmClear').onclick = async () => { await B.clearTamper(); $('pmVerdict').textContent = 'Attack cleared. Readings already written stay in the ledger.'; };
    $('pmEdit').onclick = async () => { $('pmVerdict').textContent = await B.editOld(false); };
    $('pmRehash').onclick = async () => { $('pmVerdict').textContent = await B.editOld(true); };
    window.addEventListener('resize', () => { clearTimeout(layoutWires._t); layoutWires._t = setTimeout(layoutWires, 150); });
    built = true;
    defaults();
    kindChange();
    new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { layoutWires(); o.disconnect(); } }).observe(root);
  }
  const W0ms = () => Date.parse(B.V.t0.replace(' ', 'T') + '+05:30');
  const localOf = i => new Date(W0ms() + i * 300e3 + 5.5 * 3600e3).toISOString().slice(0, 16);
  const stepOf = s => Math.round((Date.parse(s + ':00Z') - 5.5 * 3600e3 - W0ms()) / 300e3);
  function defaults() {                             // start at the next reading, so the attack is visible at once
    const s = B.step() + 1, h = Math.round(B.V.demo.default_window_h * 12);
    $('pmStart').value = localOf(s); $('pmEnd').value = localOf(s + h);
  }

  // ------------------------------------------------------------ wires
  function layoutWires() {
    const svg = $('pmSvg'); if (!svg) return;
    const box = svg.parentElement.getBoundingClientRect(), node = $('pmNode').getBoundingClientRect();
    if (!box.width) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`); svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
    const nx = node.left - box.left, ny0 = node.top - box.top + 10, nh = Math.max(20, node.height * 0.5);
    let html = svg.querySelector('title').outerHTML;
    SENS.forEach(([k, name], i) => {
      const li = $('pmS_' + k).getBoundingClientRect(), y = li.top + li.height / 2 - box.top, ty = ny0 + nh * i / (SENS.length - 1);
      const d = `M0,${y.toFixed(1)} C${(nx * 0.55).toFixed(1)},${y.toFixed(1)} ${(nx * 0.45).toFixed(1)},${ty.toFixed(1)} ${nx.toFixed(1)},${ty.toFixed(1)}`;
      html += `<g class="pm-w ok" id="pmW_${k}"><title id="pmWT_${k}">${esc(name)}: healthy, data flowing</title><path class="base" d="${d}"/><path class="flow" d="${d}"/></g>`;
    });
    svg.innerHTML = html;
    svg.querySelectorAll('.pm-w path').forEach(p => p.style.setProperty('--len', p.getTotalLength().toFixed(0)));
    paint();
  }

  // ------------------------------------------------------------ paint one reading
  function paint() {
    if (!built) return;
    const a = B.A(), i = B.step(), R = a.R, Sc = a.Sc, tp = B.tamper();
    $('pmClock').textContent = B.whenLbl(B.tsAt(i)) + ' IST · twin clock (S)';
    const susp = a.iso && a.kf !== undefined && i >= a.kf && i < a.iso.k ? new Set(a.iso.suspects) : new Set();
    const quar = a.safe && i >= a.safe.k && i < a.safe.release ? new Set(a.safe.sensors) : new Set();
    const manip = a.iso && i >= a.iso.k && (!a.safe || i < a.safe.release) ? new Set(a.iso.suspects) : new Set();
    const under = tp && tp.kind !== 'edit' && i >= tp.start && i < tp.end ? new Set(a.attacked) : new Set();   // demo: what YOU are faking
    SENS.forEach(([k, name, , unit, dec]) => {
      const v = k === 'door' ? (num(R.door[i]) > 0 ? 'Open' : 'Closed') : fin(num(R[k][i])) ? num(R[k][i]).toFixed(dec) + (unit ? ' ' + unit : '') : 'no data';
      $('pmV_' + k).textContent = v;
      const li = $('pmS_' + k), w = $('pmW_' + k), tt = $('pmWT_' + k);
      li.classList.toggle('bad', manip.has(k) || susp.has(k) || under.has(k));
      li.classList.toggle('under', under.has(k));
      li.querySelector('.pm-badge.u').hidden = !under.has(k) || quar.has(k);
      li.querySelector('.pm-badge').hidden = !manip.has(k);
      li.querySelector('.pm-badge.q').hidden = !quar.has(k);
      li.querySelector('.pm-badge.s').hidden = !susp.has(k);
      if (w) {
        w.setAttribute('class', 'pm-w ' + (quar.has(k) ? 'quar' : susp.has(k) || under.has(k) ? 'bad' : 'ok'));
        if (tt) tt.textContent = `${name}: ${quar.has(k) ? 'quarantined – trusted value in use' : susp.has(k) ? 'SUSPECT – data line cut while the node isolates it' :
          under.has(k) ? 'UNDER ATTACK – this reading is being faked in the demo' : 'healthy, data flowing'}`;
      }
    });
    $('pmWx').textContent = fin(num(R.T_out_api[i])) ? num(R.T_out_api[i]).toFixed(1) + ' °C' : '–';
    $('pmInv').textContent = fin(num(R.P_inv[i])) ? num(R.P_inv[i]).toFixed(2) + ' kW' : '–';
    let dis = '–'; for (let j = i; j >= 0; j--) if (fin(num(R.discom_kWh[j]))) { dis = num(R.discom_kWh[j]).toFixed(2) + ' kWh'; break; }
    $('pmDis').textContent = dis;
    const zOf = names => Math.max(0, ...names.map(nm => Math.abs(Sc.e[i][RN.indexOf(nm)])).filter(fin));
    CHIPS.forEach(([lab, rs, extra], c) => {
      let red = zOf(rs) >= 3;
      extra.forEach(x => {
        if (x[0] === 'H') red = red || Sc.hard[i][+x[1] - 1];
        else { const d = Math.floor(i / 288) - 1, dd = Sc.days.find(q => q.day === d); if (dd) red = red || (x === 'R10' ? dd.z_R10 : dd.z_R8d) >= 3; }
      });
      const el = $('pmC' + c); el.classList.toggle('red', red); el.textContent = (red ? '✗ ' : '✓ ') + lab; el.title = `${lab}: ${red ? '|z| ≥ 3' : 'consistent'} (${rs.concat(extra).join(', ')})`;
    });
    const safeOn = a.safe && i >= a.safe.k && i < a.safe.release, trustedView = a.safe && i >= a.safe.k;
    const phi = trustedView ? a.safe.Sc.phi_trusted[i] : Sc.phi[i], flagged = trustedView ? phi >= 3 : Sc.flag[i];
    $('pmNeedle').style.transform = `rotate(${(Math.min(phi, 6) / 6 * 180 - 90).toFixed(1)}deg)`;
    $('pmGT').textContent = trustedView ? 'Φ (trusted data)' : 'Φ integrity score';
    $('pmPhi').textContent = 'Φ = ' + (phi >= 99 ? '99 (rule)' : phi.toFixed(1));
    $('pmPhi').className = 'pm-phi ' + (phi >= 3 ? 'bad' : phi >= 2 ? 'warn' : 'ok');
    const st = flagged ? '✗ FLAG – physics mismatch' : phi >= 2 ? '⚠ Watch – unusual' : '✓ OK – physics consistent';
    $('pmState').textContent = st; $('pmState').className = 'pm-state ' + (flagged ? 'bad' : phi >= 2 ? 'warn' : 'ok');
    $('pmRaw').textContent = trustedView ? `raw Φ (reported data) ${Sc.phi[i] >= 99 ? '99' : Sc.phi[i].toFixed(1)}${Sc.flag[i] ? ' · still flagged' : ''}` : '';
    $('pmGaugeT').textContent = `Φ gauge: ${phi.toFixed(1)} on a 0 to 6 scale. ${st}.`;
    const sb = $('pmSafe');
    if (safeOn) {
      const nm = a.safe.sensors.map(k => (SENS.find(x => x[0] === k) || [k, k])[1]);
      const subs = a.safe.sensors.map((k, j) => `${nm[j]}: ${k === 'T_out_s' ? 'weather service' : 'physics-reconstructed'} ${fin(num(a.safe.Rt[k][i])) ? num(a.safe.Rt[k][i]).toFixed(1) : '–'}`);
      sb.className = 'pm-card pm-safe on';
      sb.innerHTML = `<div class="shield" aria-hidden="true">🛡️</div><div><b>Safe mode ON · using trusted value · chiller/ice back to normal</b><ul>${subs.map(x => `<li>${esc(x)}</li>`).join('')}
        <li>${esc(nm.join(' + '))} quarantined (isolation confidence ${esc(a.safe.confidence)})</li><li>room (true, S) ${f1(a.truth.T_room[i])} °C</li></ul></div>`;
    } else if (a.kf !== undefined && i >= a.kf && (!a.safe || i < a.safe.k)) {
      sb.className = 'pm-card pm-safe warn';
      sb.innerHTML = `<div class="shield" aria-hidden="true">⏳</div><div><b>✗ FLAG raised at ${B.hhmm(B.tsAt(a.kf))} – isolating</b><ul><li>sensors marked SUSPECT; the node checks the next hour of readings (GLR) to find which one lies</li></ul></div>`;
    } else if (a.safe && i >= a.safe.release) {
      sb.className = 'pm-card pm-safe';
      sb.innerHTML = `<div class="shield" aria-hidden="true">✓</div><div><b>Released after the owner's check</b><ul><li>the FLAG and the quarantine stay in the ledger</li></ul></div>`;
    } else { sb.className = 'pm-card pm-safe'; sb.innerHTML = `<div class="shield" aria-hidden="true">✓</div><div><b>Normal operation</b><ul><li>all sensors trusted · data confidence high</li></ul></div>`; }
    // formula live numbers + bars
    $('lvChi').textContent = f2(Sc.chi2[i]); $('lvM').textContent = Sc.m[i]; $('lvInst').textContent = f2(Sc.phi_inst[i]);
    $('lvS').textContent = f1(Sc.S[i]); $('lvSlow').textContent = f2(Sc.phi_slow[i]); $('lvDay').textContent = f2(Sc.phi_day[i]);
    $('lvPhi').textContent = Sc.phi[i] >= 99 ? '99' : f2(Sc.phi[i]); $('lvK').textContent = f2(B.V.cal.cusum_kappa); $('lvH').textContent = f0(B.V.cal.cusum_h);
    $('lvRun').textContent = Sc.flag[i] ? '✗ FLAG' : '✓ no flag';
    $('pmBars').querySelectorAll('li').forEach(li => {
      const v = Math.abs(Sc.e[i][RN.indexOf(li.dataset.r)]), on = fin(v);
      li.classList.toggle('off', !on); li.classList.toggle('red', on && v >= 3);
      li.querySelector('i').style.width = (on ? Math.min(v, 6) / 6 * 100 : 0) + '%';
      li.querySelector('.bv').textContent = on ? (v >= 3 ? '✗ ' : '') + v.toFixed(1) : 'off';
    });
    const idle = !tp || tp.kind === 'edit' || i >= tp.end;
    if (idle && !$('pmStart').dataset.touched && document.activeElement !== $('pmStart') && document.activeElement !== $('pmEnd')) defaults();   // follow the clock
    tamperStory(a, i, tp);
    if (i % 12 === 0) $('pmSR').textContent = `${B.whenLbl(B.tsAt(i))}: Φ ${phi.toFixed(1)}, ${st}${safeOn ? '. Safe mode on.' : ''}`;
  }

  // ------------------------------------------------------------ the tamper story: window, detection, ledger, impact
  function tamperStory(a, i, tp) {
    const hh = k => B.hhmm(B.tsAt(k)), V = B.V;
    if (!tp || tp.kind === 'edit') {
      $('pmTl').innerHTML = ''; $('pmImpact').innerHTML = '';
      if (!tp) $('pmVerdict').innerHTML = $('pmVerdict').dataset.keep ? $('pmVerdict').innerHTML : '<p class="note">No attack running. Pick sensors, a type, a size and a window, then "Start attack".</p>';
    } else {
      const det = a.caught >= 0 ? a.caught : null, k0 = a.k0, k1 = a.k1;
      const lay = { physics: 'physics (heat, moisture, ice, chiller)', external: 'external data (weather service, inverter, utility meter)', watermark: 'watermark (secret glycol pattern)', hash: 'hash chain (identical to 24 h ago)' };
      const lines = Object.entries(a.layers).sort((x, y) => x[1] - y[1]).map(([k, s]) => `<li>${lay[k]}: ${i >= s ? `✗ caught at ${hh(s)} (after ${(s - k0) * 5} min)` : 'pending'}</li>`).join('');
      const wait = i < k0 ? `<b class="wn">⏳ attack starts at ${hh(k0)} – in ${(k0 - i) * 5} min of twin time (the clock is running)</b>` :
        det !== null ? (i >= det ? `<b class="bd">✗ detected at ${hh(det)} (after ${(det - k0) * 5} min)</b>` : '<b class="wn">⚠ attack running – not detected yet</b>') :
        i < k1 ? '<b class="wn">⚠ attack running – not detected yet</b>' : '<b class="wn">⚠ not detected in this run</b>';
      $('pmVerdict').innerHTML = `<p><b>Tampered from ${hh(k0)} to ${hh(k1)}</b> · ${wait}</p>
        <ul>${lines || '<li>no layer has fired yet</li>'}</ul>
        ${a.iso && i >= a.iso.k ? `<p>Isolation (GLR): <b>${a.iso.suspects.map(s => esc(s)).join(' + ') || 'nothing'}</b> · ${a.iso.suspects.map(s => `${s} bias ${window.PhiCore.RELATIVE.has(s) ? (100 * a.iso.bias[s]).toFixed(0) + ' %' : a.iso.bias[s].toFixed(1)}`).join(' · ')} · confidence ${esc(a.iso.confidence)}</p>` : ''}
        ${a.safe && i >= a.safe.k ? `<p>Safe mode from ${hh(a.safe.k)}${a.safe.green >= 0 ? ` · Φ(trusted) back to green at ${hh(a.safe.green)}` : ' · Φ(trusted) has not returned to green (a constant correction cannot follow this lie)'}.</p>` : ''}`;
      timeline(a, i, tp);
      impactCard(a, i);
    }
    tamperLog(a, i, tp);
  }
  function timeline(a, i, tp) {
    const k0 = a.k0, k1 = a.k1, s0 = Math.max(0, k0 - 24), s1 = Math.min(B.V.n - 1, k1 + 36), W = 640, H = 170, pad = 34;
    const x = k => pad + (k - s0) / (s1 - s0) * (W - pad - 8);
    const sens = tp.kind === 'replay' ? 'T_mid' : (tp.sensors[0] || 'T_mid'), T = a.truth[sens] || a.truth.T_mid;
    const rep = k => num(a.R[sens][k]), vals = [];
    for (let k = s0; k <= s1; k++) { vals.push(rep(k)); vals.push(T[k]); }
    const lo = Math.min(...vals.filter(fin)) - 0.5, hi = Math.max(...vals.filter(fin)) + 0.5, y = v => 8 + (1 - (v - lo) / (hi - lo)) * 92;
    const seg = (from, to, fn) => { let d = '', pen = false; for (let k = from; k <= Math.min(to, i); k++) { const v = fn(k); if (!fin(v)) { pen = false; continue; } d += (pen ? 'L' : 'M') + x(k).toFixed(1) + ',' + y(v).toFixed(1); pen = true; } return d; };
    const py = v => 112 + (1 - Math.min(v, 6) / 6) * 50, phiD = (() => { let d = ''; for (let k = s0; k <= Math.min(s1, i); k++) d += (k === s0 ? 'M' : 'L') + x(k).toFixed(1) + ',' + py(a.Sc.phi[k]).toFixed(1); return d; })();
    const mk = (k, lab, cls) => (k !== undefined && k >= 0 && k <= i ? `<g class="mk ${cls}"><line x1="${x(k)}" x2="${x(k)}" y1="4" y2="${H - 4}"/><text x="${x(k) + 3}" y="${cls === 'flag' ? 14 : cls === 'quar' ? 26 : 38}">${lab}</text></g>` : '');
    const name = (window.PhiStream.SENSORS[sens] || sens);
    let tD = '';
    if (a.safe) for (let k = a.safe.k; k <= Math.min(s1, i); k++) tD += (k === a.safe.k ? 'M' : 'L') + x(k).toFixed(1) + ',' + py(a.safe.Sc.phi_trusted[k]).toFixed(1);
    $('pmTl').innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="pm-tlsvg" role="img" aria-label="${esc(`${name}: true value grey, reported value blue, faked part red from ${B.hhmm(B.tsAt(k0))} to ${B.hhmm(B.tsAt(k1))}; Φ below with the limit 3`)}">
      <rect class="win" x="${x(k0)}" y="2" width="${Math.max(2, x(k1) - x(k0))}" height="${H - 4}"/>
      <path class="tru" d="${seg(s0, s1, k => T[k])}"/><path class="rep" d="${seg(s0, k0 - 1, rep)}"/><path class="fake" d="${seg(k0, k1 - 1, rep)}"/><path class="rep" d="${seg(k1, s1, rep)}"/>
      <line class="lim" x1="${pad}" x2="${W - 8}" y1="${py(3)}" y2="${py(3)}"/><text class="ax" x="2" y="${py(3) + 3}">Φ 3</text><path class="phi" d="${phiD}"/><path class="tphi" d="${tD}"/>
      <text class="ax" x="2" y="14">${esc(name.split(' ')[0])}</text>
      ${mk(a.kf, '✗ FLAG ' + (a.kf !== undefined ? B.hhmm(B.tsAt(a.kf)) : ''), 'flag')}${mk(a.safe && a.safe.k, '🛡 quarantine', 'quar')}${mk(a.safe && a.safe.green, '✓ trusted Φ green', 'green')}</svg>
      <p class="note">Grey dashed = true value (twin). Blue = reported. <b class="bd">Red (broken line) = faked</b> inside the shaded window. Lower lines = Φ of the reported data (purple) and, after the quarantine, Φ of the trusted data (green), with the limit 3. The same readings are in the hash-chain ledger below (red border = inside the window).</p>`;
  }
  function impactCard(a, i) {
    const bs = B.batches(), V = B.V;
    const list = bs.length ? bs : [{ crop: V.demo.default_crop, kg: V.demo.default_kg, base: V.demo.default_base_INR_kg, F0: 85, demo: true }];
    const rows = list.map(b => ({ b, r: B.E.impact(a, b) })).filter(x => x.r);
    if (!rows.length) { $('pmImpact').innerHTML = ''; return; }
    const sum = k => rows.reduce((s, x) => s + x.r[k], 0), sumW = k => rows.reduce((s, x) => s + (x.r.without ? x.r.without[k] : 0), 0);
    const r0 = rows[0].r, done = i >= r0.kEnd, onHold = a.kf !== undefined && i >= a.kf;
    $('pmImpact').innerHTML = `<h5>Impact of this attack window ${done ? '' : '<span class="pill wn">final numbers 3 h after the window ends (the room needs time to recover)</span>'}</h5>
      <div class="pmi"><div><span>Real freshness lost during the tamper (S)</span><b>${f2(r0.lost_pct)} %</b><small>reported would hide ${f2(r0.hidden_pct)} %</small></div>
        <div><span>Room warmer than it should be (E)</span><b>${f1(r0.room_max_shift_K)} K</b><small>${r0.control_affected ? 'the controller believed the fake room temperature' : 'this sensor does not steer the room – no physical effect'}</small></div>
        <div><span>Owner would have gained (E)</span><b>₹${f0(sum('owner_gain_INR'))}</b><small>electricity ${f2(sum('kWh_saved'))} kWh × ₹${V.tariff_INR_kWh} + compensation avoided ₹${f0(sum('compensation_avoided_INR'))}</small></div>
        <div><span>Farmer would have lost (E)</span><b>₹${f0(sum('farmer_loss_INR'))}</b><small>kg × base price × freshness lost</small></div>
        <div><span>Payment</span><b>${onHold ? '✗ ON HOLD' : '✓ normal'}</b><small>${onHold ? 'a FLAG is in the ledger' : 'no flag yet'}</small></div></div>
      <p class="note">If the node had NOT caught it: farmer loss ₹${f0(sumW('farmer_loss_INR'))}, owner gain ₹${f0(sumW('owner_gain_INR'))}.
        ${rows[0].b.demo ? `No batch in the room – shown for ${V.demo.default_kg} kg ${esc(V.demo.default_crop)} at ₹${V.demo.default_base_INR_kg}/kg (E).` : `Batches: ${rows.map(x => `${esc(x.b.slipId)} (${f0(x.b.kg)} kg)`).join(', ')}.`}
        True temperatures from the twin (S); how the room drifts when the controller is fooled (τ = ${V.demo.control_tau_h} h), prices and tariff are E.</p>`;
  }
  function tamperLog(a, i, tp) {
    const V = B.V, W0 = V.warmup_steps, span = V.n - W0, xp = k => ((k - W0) / span * 100).toFixed(2) + '%';
    let ticks = '';
    for (let d = 0; d <= 3; d++) ticks += `<span class="tick" style="left:${(d / 3 * 100).toFixed(2)}%">${d < 3 ? B.whenLbl(B.tsAt(W0 + d * 288)).split(' ').slice(0, 2).join(' ') : ''}</span>`;
    const att = tp && tp.kind !== 'edit' ? (tp.kind === 'replay' ? PC.OWNER : tp.sensors) : [];
    const rows = PC.OWNER.map(k => {
      const name = (SENS.find(x => x[0] === k) || [k, k])[1];
      let bar = '';
      if (att.includes(k)) bar = `<i class="bar" style="left:${xp(tp.start)};width:calc(${xp(tp.end)} - ${xp(tp.start)})"></i><em style="left:${xp(tp.start)}">${a.caught >= 0 && i >= a.caught ? `✗ caught in ${(a.caught - tp.start) * 5} min` : i < tp.start ? 'scheduled' : '⚠ not caught yet'}</em>`;
      return `<div class="tl-row"><span class="tl-n">${esc(name)}</span><span class="tl-track">${bar}</span></div>`;
    }).join('');
    $('pmTimeline').innerHTML = `<div class="tl-row tl-head"><span class="tl-n"></span><span class="tl-track">${ticks}<span class="now" style="left:${xp(i)}"></span></span></div>${rows}`;
    const al = Object.values(B.alerts()).sort((x, y) => (x.created < y.created ? 1 : -1));
    $('pmIncidents').innerHTML = al.length ? `<ol>${al.slice(0, 12).map(x => `<li>${x.status === 'reviewed' ? '✓' : '⚠'} <b>${esc(x.label)}</b> · ${esc(B.whenLbl(x.raised_ts))} · ${esc(x.reason)} <small>(${esc(x.id)})</small></li>`).join('')}</ol>`
      : '<p class="muted">No incidents yet.</p>';
  }

  // ------------------------------------------------------------ start
  function start() {
    B = window.TrustBus;
    if (!B) { setTimeout(start, 100); return; }
    B.on(() => { if (!built) build(); paint(); });
  }
  start();
})();
