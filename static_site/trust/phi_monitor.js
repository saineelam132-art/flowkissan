// Live Trust Monitor + Tamper lab (Owner view of trust.html).
// Everything is recomputed in the browser from window.PHI_LAB (simulated readings, S) with PhiCore (same algorithm as Python).
// Draws: sensor cards → SVG lines → ESP32 node; Physics-engine chips; φ gauge; Auto Safe Mode; tamper-log timeline; sealed incident ledger.
(function () {
  'use strict';
  const L = window.PHI_LAB, PC = window.PhiCore, TC = window.TrustCore;
  const root = document.getElementById('phiMon');
  if (!L || !PC || !root) return;
  const N = L.N, P = L.P, cal = L.cal, n = L.n, W0 = L.warmup_steps, dt = L.dt_s, spd = 86400 / dt;
  const t0 = new Date(L.start.replace(' ', 'T') + '+05:30');
  const RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fin = Number.isFinite;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ sensors shown
  const SENS = [
    ['T_out_s', 'Outside temperature', '🌡️', '°C', 1], ['RH_out_s', 'Outside humidity', '💧', '%', 0],
    ['T_mid', 'Room temperature (middle)', '🌡️', '°C', 1], ['T_high', 'Room temperature (high)', '🌡️', '°C', 1],
    ['RH_mid', 'Room humidity', '💧', '%', 0], ['T_flower', 'Flower core temperature', '🌡️', '°C', 1],
    ['T_ice', 'Ice panel temperature', '❄️', '°C', 1], ['T_sup', 'Glycol supply', '⇄', '°C', 1], ['T_ret', 'Glycol return', '⇄', '°C', 1],
    ['flow', 'Glycol flow', '⟳', 'kg/s', 2], ['P_el', 'Chiller power', '⚡', 'kW', 2], ['door', 'Door switch', '🚪', '', 0]];
  const CHIPS = [['Heat balance', ['R1', 'R2'], ['R10']], ['Chiller COP check', ['R3', 'R4'], ['H1']], ['Moisture balance', ['R6'], []],
    ['Ice balance', ['R5'], ['H3']], ['Weather cross-check', ['R7T', 'R7W'], []], ['Power vs inverter', ['R8'], ['R8d']], ['Room probes', ['R9'], ['H2']]];
  const ATTACKS = {
    offset: 'Offset (adds a constant)', freeze: 'Freeze (repeats the value at the start)', drift: 'Slow drift (per hour)',
    replay: 'Replay yesterday (all sensors + log)', consistent: 'Consistent fake set (all sensors from a model run)',
    chiller: 'Chiller really breaks + room T frozen at 4.0 °C' };
  const LAYERS = { physics: 'Physics (heat, moisture, ice, chiller)', external: 'External data (weather service, inverter, utility meter)',
    watermark: 'Watermark (secret glycol set-point pattern)', hash: 'Hash chain (identical to 24 h ago)' };

  // ------------------------------------------------------------ data helpers
  const clone = R => { const o = {}; for (const k in R) o[k] = R[k].slice(); return o; };
  const num = v => (v === null || v === undefined ? NaN : +v);
  const timeOf = i => new Date(t0.getTime() + i * dt * 1000);
  const fmtT = i => timeOf(i).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtH = i => timeOf(i).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

  function applyAttack(cfg) {
    let R = clone(L.readings);
    const k0 = cfg.kind === 'chiller' ? L.chiller_off_step : cfg.start, k1 = Math.min(n, cfg.end);
    const set = (R2, s, i, v) => { R2[s][i] = v; };
    if (cfg.kind === 'replay') {
      for (const s of PC.OWNER.concat(PC.COMMANDS)) for (let i = k0; i < k1; i++) set(R, s, i, L.readings[s][i - spd]);
    } else if (cfg.kind === 'consistent') {
      for (const s of PC.OWNER.concat(PC.COMMANDS)) for (let i = k0; i < k1; i++) set(R, s, i, L.fake_same[s][i]);
    } else if (cfg.kind === 'chiller') {
      for (const s of PC.OWNER.concat(PC.COMMANDS)) R[s] = L.chiller_off[s].slice();
      for (let i = k0; i < k1; i++) set(R, 'T_mid', i, 4.0);
    } else {
      for (const s of cfg.sensors) {
        const rel = PC.RELATIVE.has(s), v0 = num(R[s][k0]);
        for (let i = k0; i < k1; i++) {
          const v = num(R[s][i]), hrs = (i - k0) * dt / 3600;
          let y = v;
          if (cfg.kind === 'offset') y = rel ? v * (1 + cfg.size / 100) : v + cfg.size;
          else if (cfg.kind === 'freeze') y = v0;
          else if (cfg.kind === 'drift') y = rel ? v * (1 + cfg.size / 100 * hrs) : Math.round((v + cfg.size * hrs) * 10) / 10;
          set(R, s, i, y);
        }
      }
    }
    return { R, k0, k1 };
  }
  function sensorsOf(cfg) {
    if (cfg.kind === 'replay' || cfg.kind === 'consistent') return PC.OWNER.slice();
    if (cfg.kind === 'chiller') return ['T_mid'];
    return cfg.sensors.slice();
  }

  function analyse(cfg) {
    const A = applyAttack(cfg), R = A.R;
    const X = PC.residuals(R, N, P, L.door_g), Sc = PC.score(X, cal, P, L.state);
    const out = { cfg, R, X, Sc, k0: A.k0, k1: A.k1, layers: {}, attacked: sensorsOf(cfg) };
    let kf = -1;
    for (let i = A.k0; i < n; i++) if (Sc.flag[i]) { kf = i; break; }
    if (kf >= 0) {
      out.kf = kf; out.fired = PC.whichFired(Sc, cal, kf);
      out.layers[['R7T', 'R7W', 'R8', 'R8d'].includes(out.fired) ? 'external' : 'physics'] = kf;
      out.iso = PC.isolate(R, X, Sc, cal, N, P, L.door_g, kf);
    }
    const run = R.run_frac.map(v => num(v) > 0);
    const z = PC.supplyZ(R.T_sup, run, R.v_ice.map(num), L.dither_sup, P.watermark.supply_min_steps, spd);
    out.wmZ = z;
    for (let d = 0; d < z.length; d++) {
      const end = (d + 1) * spd;
      if (end <= A.k0) continue;
      if (fin(z[d]) && z[d] < P.watermark.supply_z_flag) { out.layers.watermark = end - 1; break; }
    }
    const fp = PC.replayFingerprint(R, 12, spd);
    for (let i = A.k0; i < n; i++) if (fp[i]) { out.layers.hash = i; break; }
    const ks = Object.values(out.layers);
    out.caught = ks.length ? Math.min(...ks) : -1;
    // Auto Safe Mode: quarantine the isolated sensors, substitute trusted values, re-check with φ(trusted data)
    if (out.iso && out.iso.suspects.length && out.iso.confidence !== 'low') {
      const Rt = clone(R), kq = out.iso.k;
      for (const s of out.iso.suspects) {
        const b = out.iso.bias[s];
        for (let i = kq; i < n; i++) {
          if (s === 'T_out_s') Rt[s][i] = R.T_out_api[i];
          else if (s === 'RH_out_s') Rt[s][i] = R.RH_out_api[i];
          else Rt[s][i] = PC.RELATIVE.has(s) ? num(R[s][i]) / (1 + b) : num(R[s][i]) - b;
        }
      }
      const Xt = PC.residuals(Rt, N, P, L.door_g);
      out.safe = { k: kq, Rt, Sc: PC.score(Xt, cal, P, L.state), sensors: out.iso.suspects.slice() };
    }
    return out;
  }

  // ------------------------------------------------------------ layout
  root.innerHTML = `
    <div class="pm-head"><span class="pm-dot" aria-hidden="true"></span><h3>Live Trust Monitor (Φ physics check) <span class="chip S">S</span> <span class="chip C">C</span></h3>
      <span class="pm-clock" id="pmClock"></span></div>
    <div class="pm-grid">
      <div class="pm-left">
        <div class="pm-colh"><span>Sensor</span><span>Live value</span></div>
        <ul class="pm-sensors" id="pmSensors" aria-label="Owner sensors and their live values"></ul>
        <div class="pm-ext"><div class="pm-colh"><span>Independent references (owner cannot edit)</span></div>
          <ul><li>☁️ Weather service <b id="pmWx">–</b></li><li>📟 DISCOM meter (yesterday) <b id="pmDis">–</b></li><li>🔆 Solar inverter log <b id="pmInv">–</b></li></ul></div>
      </div>
      <div class="pm-wires"><svg id="pmSvg" role="img" aria-labelledby="pmSvgT"><title id="pmSvgT">Data lines from each sensor to the ESP32 edge node</title></svg>
        <div class="pm-node" id="pmNode"><svg viewBox="0 0 64 80" aria-hidden="true"><rect x="4" y="4" width="56" height="72" rx="6" fill="#0f2a4a" stroke="#38bdf8" stroke-width="2"/>
          <rect x="14" y="14" width="36" height="30" rx="2" fill="#1e3a5f"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="8" cy="${12 + i * 8}" r="1.5" fill="#cbd5e1"/><circle cx="56" cy="${12 + i * 8}" r="1.5" fill="#cbd5e1"/>`).join('')}
          <rect x="22" y="56" width="20" height="12" rx="2" fill="#94a3b8"/></svg><b>ESP32 edge node</b><small>signs every reading</small></div>
      </div>
      <div class="pm-right">
        <div class="pm-card"><h4 id="pmGT">Φ integrity score</h4><svg id="pmGauge" viewBox="0 0 220 140" role="img" aria-labelledby="pmGaugeT"><title id="pmGaugeT">Φ gauge</title></svg>
          <div class="pm-phi" id="pmPhi">Φ = –</div><div class="pm-state" id="pmState"></div><div class="pm-raw" id="pmRaw"></div></div>
        <div class="pm-card pm-engine"><h4>Φ physics engine</h4><div id="pmChips" class="pm-chips"></div></div>
        <div class="pm-card pm-safe" id="pmSafe" aria-live="polite"></div>
      </div>
    </div>
    <div class="pm-card pm-log"><h4>Tamper log <small>(sealed in the ledger)</small></h4><div id="pmTimeline" class="pm-timeline"></div>
      <div class="pm-ledger" id="pmLedger"></div></div>
    <div class="pm-card pm-lab"><h4>Tamper lab – attack the twin and watch the check <span class="chip S">S</span></h4>
      <div class="pm-labgrid">
        <fieldset><legend>Sensors to fake</legend><div id="pmPick" class="pm-pick"></div></fieldset>
        <div class="pm-ctl">
          <label>Attack<select id="pmKind">${Object.entries(ATTACKS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Size <span id="pmSizeU">K (power, flow: %)</span><input id="pmSize" type="number" step="0.1" value="-8"></label>
          <label>Start (shown day 1–7, hour)<span class="row"><input id="pmDay" type="number" min="1" max="7" value="3"><input id="pmHour" type="number" min="0" max="23" value="12"></span></label>
          <label>Lasts (hours, 0 = to the end)<input id="pmDur" type="number" min="0" max="160" value="0"></label>
          <div class="row"><button id="pmRun" class="danger">Start attack</button><button id="pmHonest">Honest week</button></div>
          <div class="row"><button id="pmPlay">⏸ Pause</button><select id="pmSpeed" title="Playback speed"><option value="2">10 min / s</option><option value="12" selected>1 h / s</option><option value="72">6 h / s</option></select>
            <input id="pmScrub" type="range" min="0" max="${n - 1 - W0}" value="0" aria-label="Time in the shown week"></div>
        </div>
        <div class="pm-verdict" id="pmVerdict" aria-live="polite"></div>
      </div>
      <p class="note">The twin replays a simulated summer week (31 May – 6 Jun 2026). Your attack changes what the owner's sensors REPORT;
        the weather service, the PV inverter log, the utility meter and the server's secret watermark stay real. φ, isolation and
        Safe Mode are recomputed in your browser with the same algorithm as the Python checker (golden test ±0.01).</p>
    </div>
    <p class="sr-only" id="pmSR" aria-live="polite"></p>`;

  const ul = $('pmSensors');
  ul.innerHTML = SENS.map(([k, name, ic]) => `<li class="pm-s" id="pmS_${k}" data-k="${k}"><span class="pm-ic" aria-hidden="true">${ic}</span><span class="pm-name">${name}<span class="pm-badges"><span class="pm-badge" hidden>MANIPULATED</span><span class="pm-badge q" hidden>QUARANTINED</span></span></span><b class="pm-val" id="pmV_${k}">–</b></li>`).join('');
  $('pmPick').innerHTML = PC.OWNER.map(k => `<label><input type="checkbox" value="${k}" ${k === 'T_out_s' ? 'checked' : ''}> ${SENS.find(s => s[0] === k)[1]}</label>`).join('');
  $('pmChips').innerHTML = CHIPS.map(([lab], i) => `<span class="pm-chip" id="pmC${i}">${lab}</span>`).join('');

  // SVG wires
  const svg = $('pmSvg');
  function layoutWires() {
    const box = svg.parentElement.getBoundingClientRect(), node = $('pmNode').getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
    const nx = node.left - box.left, ny0 = node.top - box.top + 10, nh = Math.max(20, node.height * 0.5);
    let html = svg.querySelector('title').outerHTML;
    SENS.forEach(([k, name], i) => {
      const li = $('pmS_' + k).getBoundingClientRect();
      const y = li.top + li.height / 2 - box.top, ty = ny0 + nh * i / (SENS.length - 1);
      const d = `M0,${y.toFixed(1)} C${(nx * 0.55).toFixed(1)},${y.toFixed(1)} ${(nx * 0.45).toFixed(1)},${ty.toFixed(1)} ${nx.toFixed(1)},${ty.toFixed(1)}`;
      html += `<g class="pm-w ok" id="pmW_${k}"><title id="pmWT_${k}">${esc(name)}: healthy, data flowing</title><path class="base" d="${d}"/><path class="flow" d="${d}"/></g>`;
    });
    svg.innerHTML = html;
    svg.querySelectorAll('.pm-w path').forEach(p => { const len = p.getTotalLength(); p.style.setProperty('--len', len.toFixed(0)); });
    paint(true);
  }

  // gauge
  const G = $('pmGauge');
  const gx = 110, gy = 118, gr = 90;
  const ang = v => Math.PI * (1 - Math.min(6, Math.max(0, v)) / 6);
  const pt = (v, r) => [gx + r * Math.cos(ang(v)), gy - r * Math.sin(ang(v))];
  function arc(a, b, cls) { const [x0, y0] = pt(a, gr), [x1, y1] = pt(b, gr); return `<path class="${cls}" d="M${x0},${y0} A${gr},${gr} 0 0 1 ${x1},${y1}"/>`; }
  G.innerHTML += arc(0, 2, 'g-ok') + arc(2, 3, 'g-warn') + arc(3, 6, 'g-bad') +
    [0, 1, 2, 3, 4, 5, 6].map(v => { const [x, y] = pt(v, gr + 14); return `<text x="${x}" y="${y + 4}" class="g-t">${v}</text>`; }).join('') +
    `<g id="pmNeedle" class="g-needle"><line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy - gr + 12}"/><circle cx="${gx}" cy="${gy}" r="7"/></g>`;

  // ------------------------------------------------------------ state + rendering
  let A = null, honestRun = null, cur = W0, playing = true, timer = null;
  const LEDGER_KEY = 'kk_phi_ledger_v1';
  let ledger = [];
  try { ledger = JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]'); } catch (e) { ledger = []; }
  function seal(inc) {
    const prevH = ledger.length ? ledger[ledger.length - 1].hash : '0'.repeat(64);
    const b = { id: inc.id, at: inc.at, text: inc.text, prev: prevH };
    b.hash = blockHash(b);
    ledger.push(b);
    try { localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger)); } catch (e) { /* private window: kept for this visit only */ }
  }
  function blockHash(b) { const s = JSON.stringify([b.id, b.at, b.text, b.prev]); return TC ? TC.sha256(s) : s.length.toString(16).padStart(64, '0'); }
  function chainOk() {
    let p = '0'.repeat(64);
    for (const b of ledger) { if (b.prev !== p || blockHash(b) !== b.hash) return false; p = b.hash; }
    return true;
  }

  function valueText(k, v) {
    if (k === 'door') return num(v) > 0 ? 'Open' : 'Closed';
    const s = SENS.find(x => x[0] === k);
    return fin(num(v)) ? num(v).toFixed(s[4]) + (s[3] ? ' ' + s[3] : '') : 'no data';
  }
  function zOf(Sc, i, names) {
    let m = 0;
    names.forEach(nm => { const j = PC.NAMES.indexOf(nm); const v = Sc.e[i][j]; if (fin(v)) m = Math.max(m, Math.abs(v)); });
    return m;
  }

  function paint(force) {
    const run = A || honestRun, R = run.R, Sc = run.Sc, i = cur;
    $('pmClock').textContent = fmtT(i) + ' IST · twin clock (S)';
    const attacked = A && i >= A.k0 && i < A.k1 ? new Set(A.attacked) : new Set();
    const isoT = A && A.iso && i >= A.iso.k ? new Set(A.iso.suspects) : new Set();
    const quarantined = A && A.safe && i >= A.safe.k ? new Set(A.safe.sensors) : new Set();
    SENS.forEach(([k, name]) => {
      $('pmV_' + k).textContent = valueText(k, R[k][i]);
      const li = $('pmS_' + k), w = $('pmW_' + k), tt = $('pmWT_' + k);
      const bad = isoT.has(k) && !quarantined.has(k), q = quarantined.has(k);
      li.classList.toggle('bad', isoT.has(k));
      li.querySelector('.pm-badge').hidden = !isoT.has(k);
      li.querySelector('.pm-badge.q').hidden = !q;
      if (w) {
        w.setAttribute('class', 'pm-w ' + (q ? 'quar' : bad ? 'bad' : 'ok'));
        if (tt) tt.textContent = `${name}: ${q ? 'quarantined – trusted substitute in use' : bad ? 'MANIPULATED – data line cut' : 'healthy, data flowing'}`;
      }
    });
    // references
    $('pmWx').textContent = fin(num(R.T_out_api[i])) ? num(R.T_out_api[i]).toFixed(1) + ' °C' : '–';
    $('pmInv').textContent = fin(num(R.P_inv[i])) ? num(R.P_inv[i]).toFixed(2) + ' kW' : '–';
    let dis = '–';
    for (let j = i; j >= 0; j--) if (fin(num(R.discom_kWh[j]))) { dis = num(R.discom_kWh[j]).toFixed(2) + ' kWh'; break; }
    $('pmDis').textContent = dis;
    // chips
    CHIPS.forEach(([lab, rs, extra], c) => {
      let red = zOf(Sc, i, rs) >= 3;
      extra.forEach(x => {
        if (x[0] === 'H') red = red || Sc.hard[i][+x[1] - 1];
        if (x === 'R10' || x === 'R8d') { const d = Math.floor(i / spd) - 1, dd = Sc.days[d]; if (dd) red = red || (x === 'R10' ? dd.z_R10 : dd.z_R8d) >= 3; }
      });
      const el = $('pmC' + c); el.classList.toggle('red', red); el.title = `${lab}: ${red ? '|z| ≥ 3' : 'consistent'} (${rs.concat(extra).join(', ')})`;
    });
    // gauge
    const safeOn = A && A.safe && i >= A.safe.k;
    const phi = safeOn ? A.safe.Sc.phi[i] : Sc.phi[i];
    const flagged = safeOn ? A.safe.Sc.flag[i] : Sc.flag[i];
    const shown = Math.min(phi, 6);
    const nd = $('pmNeedle'); nd.style.transform = `rotate(${(shown / 6 * 180 - 90).toFixed(1)}deg)`;
    $('pmGT').textContent = safeOn ? 'Φ (trusted data)' : 'Φ integrity score';
    $('pmPhi').textContent = 'Φ = ' + (phi >= 99 ? '99 (rule)' : phi.toFixed(1));
    $('pmPhi').className = 'pm-phi ' + (phi >= 3 ? 'bad' : phi >= 2 ? 'warn' : 'ok');
    const st = flagged ? 'FLAG – physics mismatch' : phi >= 2 ? 'Watch – unusual' : 'OK – physics consistent';
    $('pmState').textContent = st; $('pmState').className = 'pm-state ' + (flagged ? 'bad' : phi >= 2 ? 'warn' : 'ok');
    $('pmRaw').textContent = safeOn ? `raw Φ (reported data) ${Sc.phi[i] >= 99 ? '99' : Sc.phi[i].toFixed(1)} · ${Sc.flag[i] ? 'still flagged' : 'no flag'}` : '';
    $('pmGaugeT').textContent = `Φ gauge: ${phi.toFixed(1)} on a 0 to 6 scale. ${st}.`;
    // safe mode box
    const sb = $('pmSafe');
    if (safeOn) {
      const s = A.safe.sensors.map(k => SENS.find(x => x[0] === k)[1].toLowerCase()).join(', ');
      const subs = A.safe.sensors.map(k => `${SENS.find(x => x[0] === k)[1]}: ${k === 'T_out_s' ? 'weather service' : 'physics-reconstructed'} ${valueText(k, A.safe.Rt[k][i])}`);
      sb.className = 'pm-card pm-safe on';
      sb.innerHTML = `<div class="shield" aria-hidden="true">🛡️</div><div><b>AUTO SAFE MODE ON – ${esc(s)} quarantined</b><ul>${subs.map(x => `<li>using ${esc(x)}</li>`).join('')}
        <li>chiller and ice running normally (control keeps the trusted values)</li><li>room (true, S) ${fin(L.truth_T_room[i]) ? L.truth_T_room[i].toFixed(1) + ' °C' : '–'}</li></ul></div>`;
    } else if (A && A.kf !== undefined && i >= A.kf) {
      sb.className = 'pm-card pm-safe warn';
      sb.innerHTML = A.iso && A.iso.confidence === 'low' || !(A.iso && A.iso.suspects.length)
        ? `<div class="shield" aria-hidden="true">⚠️</div><div><b>FLAG – no single sensor explains it</b><ul><li>data confidence: low</li><li>freshness uses the worst case (no cooling)</li><li>inspection needed</li></ul></div>`
        : `<div class="shield" aria-hidden="true">⏳</div><div><b>FLAG – isolating…</b><ul><li>checking the next hour of readings (GLR over sensor sets)</li></ul></div>`;
    } else { sb.className = 'pm-card pm-safe'; sb.innerHTML = `<div class="shield" aria-hidden="true">✅</div><div><b>Normal operation</b><ul><li>all sensors trusted</li><li>data confidence: high</li></ul></div>`; }
    $('pmScrub').value = i - W0;
    if (force || i % 12 === 0) $('pmSR').textContent = `${fmtT(i)}: Φ ${phi.toFixed(1)}, ${st}${isoT.size ? '. Manipulated: ' + [...isoT].join(', ') : ''}${safeOn ? '. Safe mode on.' : ''}`;
  }

  function timeline() {
    const el = $('pmTimeline'), span = n - W0;
    const xp = i => ((i - W0) / span * 100).toFixed(2) + '%';
    let ticks = '';
    for (let d = 0; d <= 7; d++) ticks += `<span class="tick" style="left:${(d / 7 * 100).toFixed(2)}%">${d < 7 ? timeOf(W0 + d * spd).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }) : ''}</span>`;
    const rows = PC.OWNER.map(k => {
      const name = SENS.find(x => x[0] === k)[1];
      let bar = '';
      if (A && A.attacked.includes(k)) {
        const caught = A.caught >= 0 ? `caught in ${Math.round((A.caught - A.k0) * dt / 60)} min` : 'NOT caught';
        bar = `<i class="bar" style="left:${xp(A.k0)};width:calc(${xp(A.k1)} - ${xp(A.k0)})" title="${esc(name)}: attacked ${fmtT(A.k0)} – ${fmtT(A.k1 - 1)}"></i><em style="left:${xp(A.k0)}">${esc(A.label)} · ${caught}</em>`;
      }
      if (A && A.iso && A.iso.suspects.includes(k) && !A.attacked.includes(k)) bar += `<i class="bar wrong" style="left:${xp(A.iso.k)};width:2%" title="blamed by the isolation but not attacked"></i>`;
      return `<div class="tl-row"><span class="tl-n">${esc(name)}</span><span class="tl-track">${bar}</span></div>`;
    }).join('');
    el.innerHTML = `<div class="tl-row tl-head"><span class="tl-n"></span><span class="tl-track">${ticks}<span class="now" id="pmNow"></span></span></div>${rows}`;
    renderLedger();
  }
  function renderLedger() {
    const ok = chainOk();
    $('pmLedger').innerHTML = (ledger.length ? `<ol>${ledger.slice().reverse().map(b => `<li><code>${esc(b.id)}</code> ${esc(b.text)} <small>hash ${esc(b.hash.slice(0, 12))}…</small></li>`).join('')}</ol>`
      : '<p class="muted">No incidents sealed yet.</p>') + `<p class="lock">🔒 Hash chain ${ok ? 'intact' : 'BROKEN'} · ${ledger.length} incident(s) · incidents are never removed when Φ returns to green.</p>`;
  }

  function verdict() {
    const v = $('pmVerdict');
    if (!A) { v.innerHTML = `<b>Honest week.</b> ${honestRun.flags} flag(s) in 7 days (S).`; return; }
    const by = Object.keys(LAYERS).map(k => `<li class="${A.layers[k] !== undefined ? 'hit' : ''}">${LAYERS[k]}: ${A.layers[k] !== undefined ? 'caught after ' + Math.round((A.layers[k] - A.k0) * dt / 60) + ' min' : 'not triggered'}</li>`).join('');
    const iso = A.iso ? `Isolation (GLR): <b>${A.iso.suspects.length ? A.iso.suspects.join(' + ') : 'nothing'}</b>${A.iso.suspects.map(s => ` · ${s} bias ${PC.RELATIVE.has(s) ? (100 * A.iso.bias[s]).toFixed(0) + ' %' : A.iso.bias[s].toFixed(1)}`).join('')} · confidence ${A.iso.confidence}.` : '';
    v.innerHTML = `<b>${A.caught >= 0 ? 'Caught' : 'NOT caught'}</b>${A.caught >= 0 ? ` after ${Math.round((A.caught - A.k0) * dt / 60)} min` : ' in the shown week'}${A.fired ? ` – first residual ${A.fired}` : ''}.<ul>${by}</ul><p>${iso}</p>
      ${A.cfg.kind === 'consistent' ? '<p class="note">A fully consistent fake breaks no physics: Φ alone cannot catch it. Only data the owner cannot make – here the secret watermark – can.</p>' : ''}`;
  }

  function tick() {
    if (!playing) return;
    cur = Math.min(n - 1, cur + 1);
    if (A && A.kf !== undefined && cur === A.kf && !A.sealed) {
      A.sealed = true;
      const id = 'FL-' + timeOf(A.kf).toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(ledger.length + 1).padStart(3, '0');
      seal({ id, at: fmtT(A.kf), text: `${A.label} · caught in ${Math.round((A.caught - A.k0) * dt / 60)} min by ${A.fired} · isolated ${A.iso && A.iso.suspects.join('+') || 'none'} (S)` });
      renderLedger();
    }
    paint(false);
    const now = $('pmNow'); if (now) now.style.left = ((cur - W0) / (n - W0) * 100).toFixed(2) + '%';
    if (cur >= n - 1) playing = false;
  }
  function loop() {                                            // speed = readings per second ÷ … : 2 → 10 min/s, 12 → 1 h/s, 72 → 6 h/s
    clearInterval(timer);
    const sp = +$('pmSpeed').value, per = Math.max(1, Math.round(sp / 12));
    timer = setInterval(() => { for (let s = 0; s < per; s++) tick(); }, sp < 12 ? 500 : 83);
  }

  function startAttack() {
    const kind = $('pmKind').value, day = Math.min(7, Math.max(1, +$('pmDay').value || 1)), hr = Math.min(23, Math.max(0, +$('pmHour').value || 0));
    const start = kind === 'chiller' ? L.chiller_off_step : W0 + (day - 1) * spd + hr * 12;
    const dur = +$('pmDur').value || 0, end = dur > 0 ? Math.min(n, start + dur * 12) : n;
    const sensors = [...document.querySelectorAll('#pmPick input:checked')].map(x => x.value);
    if (['offset', 'freeze', 'drift'].includes(kind) && !sensors.length) { $('pmVerdict').textContent = 'Pick at least one sensor.'; return; }
    const size = +$('pmSize').value || 0;
    const cfg = { kind, sensors, size, start, end };
    $('pmVerdict').textContent = 'Computing…';
    setTimeout(() => {
      A = analyse(cfg);
      A.label = kind === 'offset' || kind === 'drift' ? `${sensors.join('+')} ${size > 0 ? '+' : ''}${size}${kind === 'drift' ? '/h' : ''} ${ATTACKS[kind].split(' (')[0].toLowerCase()}` : ATTACKS[kind];
      cur = Math.max(W0, A.k0 - 36); playing = true; $('pmPlay').textContent = '⏸ Pause';
      timeline(); verdict(); paint(true); loop();
    }, 30);
  }

  // controls
  $('pmRun').onclick = startAttack;
  $('pmHonest').onclick = () => { A = null; cur = W0; playing = true; timeline(); verdict(); paint(true); loop(); };
  $('pmPlay').onclick = () => { playing = !playing; $('pmPlay').textContent = playing ? '⏸ Pause' : '▶ Play'; };
  $('pmSpeed').onchange = loop;
  $('pmScrub').oninput = e => { cur = W0 + +e.target.value; paint(true); const now = $('pmNow'); if (now) now.style.left = ((cur - W0) / (n - W0) * 100).toFixed(2) + '%'; };
  $('pmKind').onchange = () => {
    const k = $('pmKind').value;
    $('pmPick').classList.toggle('off', !['offset', 'freeze', 'drift'].includes(k));
    $('pmSize').disabled = !['offset', 'drift'].includes(k);
    if (k === 'drift') $('pmSize').value = -0.1;
  };
  window.addEventListener('resize', () => { clearTimeout(layoutWires._t); layoutWires._t = setTimeout(layoutWires, 150); });

  // honest baseline
  const X0 = PC.residuals(L.readings, N, P, L.door_g), S0 = PC.score(X0, cal, P, L.state);
  honestRun = { R: L.readings, X: X0, Sc: S0, flags: S0.flag.slice(W0).reduce((c, f, i, a) => c + (f && !(i && a[i - 1]) ? 1 : 0), 0) };
  timeline(); verdict();
  const obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { layoutWires(); obs.disconnect(); } });
  obs.observe(root);
  if (document.readyState === 'complete') setTimeout(layoutWires, 50); else window.addEventListener('load', () => setTimeout(layoutWires, 50));
  loop();
})();
