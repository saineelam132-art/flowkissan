// KoolKisaan – Trust & Trade page (v2). Shared, saved data through window.KKStore (Cloud Firestore on Firebase Hosting;
// offline demo otherwise). One sensor stream and one Φ for everything: window.TRUST_V2 (twin, S) + PhiStream (φ, isolation,
// Safe Mode, impact) + FreshV2 (two-stage freshness: trip E → room S). Hash chain: window.TrustCore.
// The chamber clock is SHARED (run by the owner's device = "controller"); roles, the selected slip and views are per viewer.
(function () {
  'use strict';
  const D = window.TRUST_DATA, V = window.TRUST_V2, T = window.TrustCore, FV = window.FreshV2, PC = window.PhiCore;
  const E = window.PhiStream.create(V), CFG = D.trust_cfg, TC = V.trip;
  const $ = id => document.getElementById(id);
  const ROLE_KEY = 'kk_trust_role';
  const DEMO_KEY = 'KOOLKISAAN-DEMO-KEY-public-not-a-secret';
  const HONESTY = 'Hash chain proves data was not changed later. Physics check shows whether the data itself is believable. ' +
    'Neither is a court-level proof alone; together they make cheating hard.';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = x => (x === null || x === undefined || !isFinite(x)) ? '–' : (+x).toFixed(1);
  const f0 = x => (x === null || x === undefined || !isFinite(x)) ? '–' : Math.round(x).toLocaleString('en-IN');
  const num = v => (v === null || v === undefined ? NaN : +v);
  const DWELL_DAYS = { jasmine: 2, tuberose: 2, marigold: 3, chamanthi: 1, rose: 1, crossandra: 1 };      // default expected stay (E, editable at check-in)
  const RLABEL = { R1: 'Room heat balance', R2: 'Flower heat balance', R3: 'Glycol loop vs air cooler', R4: 'Chiller COP check', R5: 'Ice balance',
    R6: 'Moisture balance', R7T: 'Outside T vs weather service', R7W: 'Outside humidity vs weather service', R8: 'Power vs solar inverter log',
    R9: 'Room probes (high vs middle)', R10: 'Daily energy closure', R8d: 'Daily grid kWh vs utility meter', H1: 'Hard rule: COP above physics limit',
    H2: 'Hard rule: impossible humidity / supply warmer than room', H3: 'Hard rule: ice temperature off its melting plateau' };
  const SNAME = Object.assign({}, window.PhiStream.SENSORS, { RH_out_s: 'Outside humidity', T_high: 'Room temperature (high)', RH_mid: 'Room humidity', flow: 'Glycol flow' });
  let store = null, signMode = 'demo', role = 'farmer';

  // ------------------------------------------------------------------ chamber clock (shared)
  const ctrl = () => (store && store.ch && store.ch.ctrl) || null;
  const scKey = () => (ctrl() && V.scenarios[ctrl().scenario] ? ctrl().scenario : 'normal');
  const sc = () => V.scenarios[scKey()];
  const step = () => (ctrl() ? Math.max(ctrl().step, 0) : V.checkin_step);
  const NSTEP = () => V.n;
  const tamperCfg = () => { const t = ctrl() && ctrl().tamper; return t && t.kind && t.kind !== 'edit' ? t : null; };
  const A = () => E.analyse(scKey(), tamperCfg());
  const t0ms = () => Date.parse(V.t0.replace(' ', 'T') + '+05:30');
  const tsAt = i => new Date(t0ms() + i * 300e3).toISOString().replace('.000Z', 'Z');
  const ist = ts => new Date(Date.parse(ts) + 5.5 * 3600e3);
  const hhmm = ts => { const d = ist(ts); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
  const dayLbl = ts => ist(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const whenLbl = ts => `${dayLbl(ts)} ${hhmm(ts)}`;
  const dateOf = ts => ist(ts).toISOString().slice(0, 10);
  const localOf = ts => ist(ts).toISOString().slice(0, 16);                                   // for <input type=datetime-local> (IST)
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const amController = () => store.mode === 'offline' || (ctrl() && ctrl().uid === store.uid);
  const W0 = Date.parse(V.weather.t0.replace(' ', 'T') + 'Z');                                 // weather clock (IST, naive)
  const wHour = localStr => (Date.parse(localStr + ':00Z') - W0) / 3600e3;                     // "2026-05-22T04:30" (IST) -> hour on the weather clock
  const wHourTs = ts => (Date.parse(ts) + 5.5 * 3600e3 - W0) / 3600e3;
  const WEATHER = FV.weatherFn(0, V.weather.T_out, V.weather.RH_out);
  const crop = k => V.crops[k] || V.crops.jasmine;
  const cropLabel = k => ((D.crops || {})[k] || D.blocked[k] || { label: k }).label;

  // ------------------------------------------------------------------ blocks (watched for every batch of this epoch)
  const blocksBy = {}, watching = {};
  function watchAll() {
    for (const id of Object.keys(store.batches)) {
      if (watching[id]) continue;
      watching[id] = store.watchBlocks(id, bl => { blocksBy[id] = bl; schedule(); });
    }
  }
  // Demo edits: the database refuses edits; the demo shows what an edit WITH direct database access looks like by applying the
  // recorded edit on top of what is read. "rehash" = the cheater also re-computes every later hash (chain looks intact) –
  // only the published daily anchor can catch that.
  function withEdits(id, bl) {
    const ed = store.edits().filter(e => e.slipId === id);
    if (!ed.length) return bl;
    const out = bl.map(b => JSON.parse(JSON.stringify(b)));
    for (const e of ed) {
      const b = out.find(x => x.index === e.index); if (!b) continue;
      let o = b.payload; const p = e.path.split('.'); for (const k of p.slice(0, -1)) o = o[k]; o[p[p.length - 1]] = e.value;
      if (e.rehash) for (let j = e.index; j < out.length; j++) { out[j].prevHash = j ? out[j - 1].hash : T.GENESIS_PREV; out[j].hash = T.blockHash(out[j]); }
    }
    return out;
  }
  const blocksOf = id => withEdits(id, blocksBy[id] || []);
  const batchList = () => Object.values(store.batches).sort((a, b) => (a.created < b.created ? -1 : 1));
  const activeList = () => store.active().sort((a, b) => (a.created < b.created ? -1 : 1));
  function anchorCheck(slipId, bl) {                       // every published anchor that covers this slip must match its day head
    const heads = T.dayHeads(bl); let bad = null, n = 0;
    for (const a of Object.values(store.anchors)) {
      if (!(slipId in a.heads)) continue; n++;
      if (heads[a.day] !== a.heads[slipId] || T.dailyAnchor(a.day, a.heads) !== a.anchor) { bad = a.day; break; }
    }
    return { n, bad };
  }

  // ------------------------------------------------------------------ readings (one stream) + automatic detection
  function rowAt(a, i) {
    const R = a.R, g = k => (R[k][i] === null || R[k][i] === undefined ? null : +R[k][i]);
    return { step: i, T_out: g('T_out_s'), RH_out: g('RH_out_s'), T_room: g('T_mid'), T_high: g('T_high'), RH_room: g('RH_mid'), T_core: g('T_flower'),
      T_ice: g('T_ice'), T_sup: g('T_sup'), T_ret: g('T_ret'), flow: g('flow'), P_el_W: g('P_el') === null ? null : g('P_el') * 1000,
      door_s: g('door'), fan: num(R.duty_room[i]) > 0 ? 1 : 0, T_wx: g('T_out_api') };
  }
  const openAlerts = {};
  async function raise(ev, i, phi) {
    const key = ev.kind + '|' + ev.sensors.join(',');
    if (openAlerts[key]) { await store.updateAlert(openAlerts[key], { to_step: i, to_ts: tsAt(i), phi_max: Math.max(phi, store.alerts[openAlerts[key]]?.phi_max || 0) }); return; }
    const affected = activeList().map(b => b.slipId);
    const id = await store.createAlert({ kind: ev.kind, sensors: ev.sensors, check: ev.check || null, reason: ev.reason, residuals: ev.residuals || null,
      from_step: ev.from, from_ts: tsAt(ev.from), raised_step: ev.raised, raised_ts: tsAt(ev.raised), to_step: i, to_ts: tsAt(i),
      phi_max: phi, scenario: scKey(), tamper: tamperCfg(), custody: 'owner (cold room)', batches: affected, status: 'active',
      hash: ev.hash || null, label: ev.kind === 'hash' ? 'Evidence tampered – payment frozen' : ev.kind === 'quarantine' ? 'Sensor quarantined – Safe Mode on' :
        'Payment on hold – data does not match physics' });
    openAlerts[key] = id;
    const flag = { type: ev.kind === 'hash' ? 'HASH' : ev.kind === 'quarantine' ? 'QUARANTINE' : 'PHYSICS', alertId: id, from: tsAt(ev.from), raised: tsAt(ev.raised), phi, reason: ev.reason, sensors: ev.sensors };
    for (const sid of affected) await store.appendBlock(sid, 'FLAG', 'system', { alertId: id, kind: ev.kind, sensors: ev.sensors, reason: ev.reason, quarantine: ev.quarantine || null }, { phi, flags: [flag] }, tsAt(i));
    await store.audit({ what: 'alert', id, kind: ev.kind });
  }
  function hashCheck() {
    for (const b of activeList()) {
      const bl = blocksOf(b.slipId), v = T.verifyChain(bl, CFG.reading_interval_s);
      if (!v.valid) {
        const blk = bl[v.first_bad];
        return { kind: 'hash', sensors: ['ledger'], from: blk?.payload?.step ?? step(), raised: step(), slip: b.slipId,
          reason: `Ledger of ${b.slipId}: block #${v.first_bad} – ${v.why}`,
          hash: { slipId: b.slipId, index: v.first_bad, stored: blk?.hash, recomputed: blk ? T.blockHash(blk) : null } };
      }
    }
    return null;
  }
  function eventsAt(a, i) {
    const ev = [], Sc = a.Sc;
    if (Sc.flag[i] && !Sc.flag[i - 1]) {
      const fired = PC.whichFired(Sc, V.cal, i), ext = ['R7T', 'R7W', 'R8', 'R8d'].includes(fired);
      ev.push({ kind: ext ? 'external' : 'physics', sensors: [fired], residuals: [fired], check: fired, from: Math.max(0, i - 2), raised: i,
        reason: `${RLABEL[fired] || fired} does not fit the physics (Φ = ${f1(Math.min(Sc.phi[i], 99))})` });
    }
    if (a.safe && i === a.safe.k) ev.push({ kind: 'quarantine', sensors: a.safe.sensors, from: a.kf, raised: i, quarantine: { sensors: a.safe.sensors, bias: a.iso.bias, confidence: a.iso.confidence },
      reason: `Edge node: ${a.safe.sensors.map(s => SNAME[s] || s).join(' + ')} SUSPECT → quarantined; control uses ${a.safe.sensors.map(s => s === 'T_out_s' ? 'the weather service' : 'a physics-reconstructed value').join(', ')} (Safe Mode)` });
    if (a.layers && a.layers.watermark === i) ev.push({ kind: 'watermark', sensors: ['T_sup'], from: Math.max(0, i - 287), raised: i, reason: 'Glycol readings do not carry today\'s secret set-point pattern (watermark z below the line)' });
    if (a.layers && a.layers.hash === i) ev.push({ kind: 'replay', sensors: ['all'], from: i - 11, raised: i, reason: '12 readings in a row are bit-identical to yesterday – a replay' });
    return ev;
  }
  let busy = false;
  async function advance(n) {
    if (busy || !amController()) return 0;
    busy = true;
    let k = 0;
    try {
      while (k < n && step() < NSTEP() - 1) {
        const i = step() + 1, a = A(), r = rowAt(a, i), phi = a.Sc.phi[i];
        await store.addTelemetry({ step: i, ts: tsAt(i), scenario: scKey(), rep: r, phi, e: a.Sc.e[i].map(x => (isFinite(x) ? Math.round(x * 100) / 100 : null)),
          phi_trusted: a.safe && i >= a.safe.k ? a.safe.Sc.phi_trusted[i] : null });
        await Promise.all(activeList().map(b => store.appendBlock(b.slipId, 'READING', 'owner', r, { phi, flags: [] }, tsAt(i))));
        const d0 = dateOf(tsAt(i - 1)), d1 = dateOf(tsAt(i));
        if (tsAt(i - 1).slice(0, 10) !== tsAt(i).slice(0, 10)) await publishAnchor(tsAt(i - 1).slice(0, 10));
        void d0; void d1;
        for (const ev of eventsAt(a, i)) await raise(ev, i, phi);
        if (a.safe && i === a.safe.release && a.safe.release > a.safe.k)
          for (const b of activeList()) await store.appendBlock(b.slipId, 'REVIEW', 'owner', { note: 'Demo: the attack window ended – the owner checked the quarantined sensor(s) and released them. The FLAG stays in the ledger.', sensors: a.safe.sensors }, { phi, flags: [] }, tsAt(i));
        const hc = hashCheck();
        if (hc) await raise(hc, i, phi);
        await store.setCtrl({ ...ctrl(), step: i, updated: new Date().toISOString(), uid: store.uid, scenario: scKey() });
        k++;
        const tp = tamperCfg();
        if (playTimer && tp && i >= tp.end + 24) play(false);          // demo: stop 2 h after the attack window
      }
    } catch (e) { console.error(e); alert('Could not write: ' + e.message); }
    busy = false;
    return k;
  }
  async function publishAnchor(day) {
    const heads = {};
    for (const b of batchList()) { const h = T.dayHeads(blocksOf(b.slipId))[day]; if (h) heads[b.slipId] = h; }
    if (Object.keys(heads).length) await store.putAnchor(day, { anchor: T.dailyAnchor(day, heads), heads, published: tsAt(step()) });
  }
  let playTimer = null;
  function play(on) {
    clearInterval(playTimer); playTimer = null;
    $('playBtn').textContent = on ? '❚❚ Pause' : '▶ Run';
    if (on) playTimer = setInterval(() => { if (!busy) advance(1); }, +$('speedSel').value * 1000);
  }

  // ------------------------------------------------------------------ signing
  async function signSlip(id, bay, gen) {
    if (signMode === 'server') {
      try {
        const r = await fetch('api/trust/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slipId: id, bay, genesisHash: gen }) });
        if (r.ok) return { sig: (await r.json()).sig, mode: 'server' };
      } catch (e) { /* fall back below */ }
    }
    return { sig: T.sign(DEMO_KEY, id, bay, gen), mode: 'demo' };
  }
  async function verifyQR(qr, mode) {
    if (mode === 'server') {
      try {
        const r = await fetch('api/trust/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(qr) });
        if (r.ok) return { ok: (await r.json()).valid, how: 'server key' };
      } catch (e) { /* server not reachable */ }
      return { ok: false, how: 'server not reachable – cannot check a server-signed slip here' };
    }
    return { ok: T.verifySig(DEMO_KEY, qr), how: 'demo key' };
  }
  function latestAnchor() { const ks = Object.keys(store.anchors).sort(); return ks.length ? store.anchors[ks[ks.length - 1]] : null; }

  // ------------------------------------------------------------------ freshness: trip (E) → room (S) → transport (E)
  function doorF(p0) {                                      // check-in freshness of a slip (old slips: one farm step, as before)
    if (p0.trip && isFinite(p0.trip.F_door)) return p0.trip.F_door;
    const st = new FV.State();
    st.step(crop(p0.crop), p0.T_field_C ?? 30, p0.T_field_C ?? 30, p0.RH_field_pct ?? 70, 0, p0.harvest_h || 0, 0);
    return st.F;
  }
  function settle(bl) {
    const b0 = bl[0], p0 = b0.payload, c = crop(p0.crop), lf = V.liner_factor;
    const Fd = doorF(p0), F = FV.State.fromF(Fd), curve = [];
    if (p0.trip && p0.trip.pick_end) curve.push({ ts: new Date(Date.parse(p0.trip.pick_end + ':00Z') - 5.5 * 3600e3).toISOString(), F: 100, T: null, leg: 'farm' });
    curve.push({ ts: b0.ts, F: Fd, T: p0.T_field_C ?? null, leg: 'farm' });
    let Fout = null, Fin = null, Fexit = null, last = b0, Tbox = null, lastR = { T_room: 5, RH_room: 90, T_core: 5, fan: 0 };
    for (const b of bl.slice(1)) {
      const dt = (Date.parse(b.ts) - Date.parse(last.ts)) / 3600e3, p = b.payload;
      if (!p) continue;
      if (b.type === 'READING') {
        const R = p.N4 ? { T_room: p.N4.T_r, RH_room: p.N4.RH_r, T_core: p.N2.T_core, fan: (p.N1.v_m_s || 0) > 0.1 ? 1 : 0 }       // old (v1) blocks
          : { T_room: p.T_room, RH_room: p.RH_room, T_core: p.T_core, fan: p.fan };
        for (const k of Object.keys(R)) if (R[k] === null || R[k] === undefined || !isFinite(R[k])) R[k] = lastR[k];
        lastR = R;
        F.step(c, R.T_core ?? R.T_room, R.T_room, R.RH_room, R.fan ? V.fan_on_v : V.fan_off_v, dt, lf);
        curve.push({ ts: b.ts, F: F.F, T: R.T_core, leg: 'storage' });
      } else if (b.type === 'HANDOVER_OUT') { Fout = F.F; Tbox = p.produce_T_C; curve.push({ ts: b.ts, F: Fout, T: Tbox, leg: 'transport' }); }
      else if (b.type === 'TRANSIT') {
        F.step(c, p.T_box_C, p.T_box_C, CFG.vehicle_rh_pct, CFG.vehicle_air_speed_m_s, dt, lf); Tbox = p.T_box_C;
        curve.push({ ts: b.ts, F: F.F, T: p.T_box_C, leg: 'transport' });
      } else if (b.type === 'HANDOVER_IN') {
        if (dt > 0 && Tbox !== null) F.step(c, p.produce_T_C, p.produce_T_C, CFG.vehicle_rh_pct, CFG.vehicle_air_speed_m_s, dt, lf);
        Fin = F.F; curve.push({ ts: b.ts, F: Fin, T: p.produce_T_C, leg: 'transport' });
      } else if (b.type === 'CHECKOUT' && Fexit === null) Fexit = F.F;
      if (!['FLAG', 'REVIEW'].includes(b.type)) last = b;
    }
    const Fnow = F.F, kg = p0.kg, base = p0.basePrice_INR_kg;
    const endStore = Fout !== null ? Fout : Fnow, endTrans = Fin !== null ? Fin : Fnow;
    const legs = { farm: 100 - Fd, storage: Fd - endStore, transport: Fout !== null ? Fout - endTrans : 0 };
    const rs = {}; for (const k in legs) rs[k] = kg * base * legs[k] / 100;
    const z = Fin !== null ? Fin : Fexit !== null ? Fexit : Fnow;
    return { F_door: Fd, F_checkin: Fd, F_out: Fout, F_in: Fin, F_now: Fnow, F_exit: z, legs, loss_INR: rs, curve, kg, base, crop: p0.crop, trip: p0.trip || null,
      life30_h: z / 100 * FV.shelfLifeH(c, 30), price: T.price(base, z) };
  }
  const receiptLine = st => `Picked 100 % → at our door ${f1(st.F_door)} % <span class="chip E">E</span> → at exit ${f1(st.F_exit)} % <span class="chip S">S</span> ·
    remaining life at 30 °C ≈ ${f1(st.life30_h)} h · price = base × ${f1(st.F_exit)} % = ₹${f1(st.price)}/kg`;

  // ------------------------------------------------------------------ header
  function renderTop() {
    $('clock').textContent = whenLbl(tsAt(step())) + ' IST';
    $('clockTag').innerHTML = `<span class="chip S">S</span>`;
    const sel = $('scenario');
    if (!sel.options.length) for (const [k, v] of Object.entries(V.scenarios)) sel.add(new Option(v.label, k));
    sel.value = scKey();
    sel.disabled = !amController();
    $('resetBtn').hidden = !store.isAdmin();
    ['playBtn', 'speedSel'].forEach(id => ($(id).disabled = !amController()));
    document.querySelectorAll('[data-adv]').forEach(b => (b.disabled = !amController()));
  }
  function renderKeyNote() {
    const n = $('keyNote'); n.hidden = false;
    n.innerHTML = signMode === 'server'
      ? '🔐 Slips are signed on the server (key from the environment variable KOOLKISAAN_HMAC_KEY – never sent to the browser).'
      : `🔑 <b>${esc(CFG.demo_key_note)}</b> There is no signing server yet, so slips are signed in the browser with a public demo key.`;
  }

  // ------------------------------------------------------------------ FARMER
  const CAP = () => store.ch.capacity_kg;
  function drawLoad() {
    const ch = store.ch, u = ch.stored_kg, p = u / CAP() * 100;
    $('loadKg').textContent = f1(u); $('loadCap').textContent = CAP(); $('loadPct').textContent = p.toFixed(0);
    $('fFree').textContent = f1(CAP() - u); $('fCap').textContent = CAP();
    const bar = $('loadBar'); bar.style.width = Math.min(100, p) + '%';
    bar.style.background = p >= 100 ? '#dc2626' : p >= CFG.load_warn_frac * 100 ? '#f59e0b' : '#16a34a';
    const w = $('loadWarn'); w.className = 'msg ' + (p >= 100 ? 'bd' : 'wn');
    w.textContent = p >= 100 ? '⛔ FULL – payload limit reached' : p >= CFG.load_warn_frac * 100 ? '⚠ above 80 % – nearly full' : '';
    const lim = ch.bay_limit_kg;
    $('bays').innerHTML = KKStore.BAYS.map((b, i) => {
      const k = ch.bays[b] || 0, x = (i % 3) * 100 + 5, y = Math.floor(i / 3) * 72 + 4, h = Math.min(k / lim, 1) * 60;
      const col = k >= lim - 1e-9 ? '#dc2626' : k >= 0.8 * lim ? '#f59e0b' : '#14b8a6';
      return `<rect x="${x}" y="${y}" width="90" height="64" rx="5" fill="none" stroke="currentColor" opacity=".5"/>
        <rect x="${x + 1}" y="${y + 63 - h}" width="88" height="${h}" fill="${col}" opacity=".5"/>
        <text x="${x + 8}" y="${y + 16}" font-size="12" font-weight="700">${b}</text><text x="${x + 8}" y="${y + 56}" font-size="11">${f1(k)} / ${lim} kg</text>`;
    }).join('');
  }
  function checkQty() {
    const q = +$('fKg').value, free = CAP() - store.ch.stored_kg, m = $('fMsg');
    m.className = 'msg ' + (q > free || q > CAP() ? 'bd' : 'wn');
    m.textContent = q > CAP() ? `⛔ At most ${CAP()} kg per check-in` : q > free ? `⛔ Only ${f1(free)} kg free in the room` :
      (store.ch.stored_kg + q >= CAP() * CFG.load_warn_frac ? '⚠ This load takes the room above 80 %' : '');
  }
  function flowerRule() {
    const k = $('fCrop').value, w = $('fFlowerMsg'), c = D.crops[k];
    const days = $('fOut').value ? Math.round((Date.parse($('fOut').value) - Date.parse(dateOf(tsAt(step())))) / 864e5) : 1;
    let r = { ok: true, msg: '' };
    if (D.blocked[k]) r = { ok: false, msg: D.blocked[k].warning };
    else if (c && days > c.max_hold_days) r = { ok: false, msg: `${c.label}: at most ${c.max_hold_days} day(s) in this room.` + (c.shelf ? ' ' + c.shelf.warning : '') };
    else if (c && c.shelf) r = { ok: true, msg: c.shelf.warning };
    else if (c) r = { ok: true, msg: `${c.label}: ${c.fit_at_4C} at 4 °C. ${c.fit_note}` };
    if (w) { w.className = 'msg ' + (r.ok ? (c && c.shelf ? 'wn' : 'ok') : 'bd'); w.textContent = (r.ok ? (c && c.shelf ? '⚠ ' : '✔ ') : '⛔ ') + r.msg + ' ' + D.flower_rules.ethylene; }
    return r;
  }
  // the trip as typed in the form (empty fields → defaults)
  function tripForm() {
    const ci = tsAt(step()), ciLocal = localOf(ci);
    const ps = $('fPickS').value || null, pe = $('fPickE').value || null;
    const o = { pick_start: ps ? wHour(ps) : wHourTs(ci) - TC.default_picking_end_before_checkin_h - TC.default_picking_window_h,
      pick_end: pe ? wHour(pe) : wHourTs(ci) - TC.default_picking_end_before_checkin_h, checkin: wHourTs(ci),
      band: $('fBand').value || TC.default_band, mode: $('fMode').value || TC.default_mode, packing: $('fPack').value || TC.default_packing };
    const toLocal = h => new Date(W0 + h * 3600e3).toISOString().slice(0, 16);
    return { o, labels: { pick_start: ps || toLocal(o.pick_start), pick_end: pe || toLocal(o.pick_end), checkin: ciLocal }, village: $('fVillage').value.trim() };
  }
  function tripCalc(k) {
    const t = tripForm(), c = crop(k);
    const r = FV.trip(c, WEATHER, t.o, TC);
    if (r.ok) r.compare = FV.allPackings(c, WEATHER, t.o, TC);
    return { t, r };
  }
  function doorCard(trip, kLabel) {
    if (!trip || !trip.ok) return `<p class="msg bd">⛔ ${esc(trip ? trip.error : 'No trip')}</p>`;
    const loss = 100 - trip.F_door, stg = trip.stages;
    const pk = TC.packing[trip.packing], cmp = trip.compare || {};
    const others = Object.entries(cmp).filter(([k]) => k !== trip.packing).map(([k, v]) => `${esc(TC.packing[k].label)} would be ${f1(v)} %`).join(' · ');
    return `<div class="door3" role="img" aria-label="Freshness: picked 100 percent, trip loses ${f1(loss)} percent, at our door ${f1(trip.F_door)} percent (estimate)">
        <div class="d3 ok"><b>Picked</b><span>100 %</span></div><div class="d3 arrow" aria-hidden="true">→</div>
        <div class="d3 wn"><b>Trip</b><span>−${f1(loss)} %</span></div><div class="d3 arrow" aria-hidden="true">→</div>
        <div class="d3 door"><b>At our door</b><span>${f1(trip.F_door)} % <span class="chip E">E</span></span></div></div>
      <p class="pk"><b>${esc(pk.label)}: ${f1(trip.F_door)} %</b>${others ? ' · ' + others : ''}</p>
      <div class="tablewrap"><table><tr><th>Stage</th><th class="n">Hours</th><th class="n">Flower °C</th><th class="n">Freshness lost</th></tr>
        ${stg.map(s => `<tr><td>${esc(s.stage)}</td><td class="n">${f1(s.hours)}</td><td class="n">${f1(s.T_flower_C)}</td><td class="n">${s.loss_pct.toFixed(1)} %</td></tr>`).join('')}</table></div>
      <p class="note">${esc(kLabel)} · ${f1(trip.distance_km)} km by ${esc(TC.mode_labels[trip.mode])} = ${f1(trip.travel_full_h)} h${trip.travel_cut ? ' (shortened to fit the check-in time)' : ''}.
        Flower temperature = outside air (hourly 2026 weather) + ${pk.bag_heating_K} K bag heating; water loss × ${pk.water_factor} for this packing. All E.</p>`;
  }
  function renderDoorPreview() {
    const k = $('fCrop').value; if (!V.crops[k]) { $('fDoor').innerHTML = '<p class="muted">No freshness model for this flower.</p>'; return; }
    const { r } = tripCalc(k);
    $('fDoor').innerHTML = doorCard(r, cropLabel(k));
  }
  async function checkIn() {
    const q = +$('fKg').value, base = +$('fBase').value, name = $('fName').value.trim(), m = $('fMsg');
    if (!name || !(q > 0) || !(base > 0)) { m.className = 'msg bd'; m.textContent = '⛔ Fill in name, quantity and price'; return; }
    const fr = flowerRule();
    if (!fr.ok) { m.className = 'msg bd'; m.textContent = '⛔ ' + fr.msg; return; }
    const k = $('fCrop').value, { t, r } = tripCalc(k);
    if (!r.ok) { m.className = 'msg bd'; m.textContent = '⛔ ' + r.error; return; }
    if (t.o.checkin - t.o.pick_start > 24) { m.className = 'msg bd'; m.textContent = '⛔ Picking started more than 24 h before check-in – please check the date.'; return; }
    $('fGo').disabled = true;
    try {
      const i = step(), anc = latestAnchor(), row = rowAt(A(), i);
      const trip = { pick_start: t.labels.pick_start, pick_end: t.labels.pick_end, village: t.village || null, band: t.o.band, distance_km: r.distance_km,
        mode: r.mode, packing: r.packing, travel_h: r.travel_h, F_door: r.F_door, stages: r.stages.map(s => ({ stage: s.stage, hours: s.hours, T_C: s.T_flower_C, loss: s.loss_pct })),
        compare: r.compare, source: 'E – trip estimate (distance band ÷ speed, hourly weather, packing)' };
      const b = await store.checkIn({ kg: q, ts: tsAt(i), expected_out: $('fOut').value || null, payload: {
        farmer: name, crop: k, basePrice_INR_kg: base, trip, T_field_C: row.T_wx, RH_field_pct: num(sc().RH_out_api[i]), expected_out: $('fOut').value || null,
        lastAnchor: anc ? `${anc.day}:${anc.anchor}` : 'none yet' } });
      const { sig, mode } = await signSlip(b.slipId, b.bay, b.genesisHash);
      await store.setSig(b.slipId, { slipId: b.slipId, bay: b.bay, genesisHash: b.genesisHash, sig }, mode);
      m.className = 'msg ok'; m.textContent = `✔ Checked in: ${b.slipId} → ${b.bay} · freshness at our door ${f1(r.F_door)} % (E)`;
      lastSlip = b.slipId;
    } catch (e) { m.className = 'msg bd'; m.textContent = '⛔ ' + e.message; }
    $('fGo').disabled = false;
    schedule();
  }
  function qrSvg(text) {
    try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
    catch (e) { return '<div class="muted">QR library missing</div>'; }
  }
  let lastSlip = null, shownSlip = null;
  function showSlip(b) {
    const bl = blocksOf(b.slipId);
    if (!b.qr || !bl || !bl.length) return;
    const st = settle(bl), done = ['removed', 'delivered', 'sold', 'in_transit'].includes(b.status);
    const key = b.slipId + '|' + b.sig + '|' + b.status + '|' + (done ? f1(st.F_exit) : '');
    if (shownSlip === key) return;
    shownSlip = key;
    const p = bl[0].payload, qrText = JSON.stringify(b.qr), when = whenLbl(bl[0].ts);
    const note = b.sigMode === 'server' ? 'Signed on the server' : esc(CFG.demo_key_note);
    const fresh = `Picked 100 % → at our door ${f1(st.F_door)} % (E)${done ? ` → at exit ${f1(st.F_exit)} % (S) · remaining life at 30 °C ≈ ${f1(st.life30_h)} h` : ''}`;
    $('slipBox').innerHTML = `<div class="slip"><div class="qr">${qrSvg(qrText)}</div>
      <div><div class="id">${esc(b.slipId)}</div><div class="kv">
        <span>Farmer</span><b>${esc(p.farmer)}</b><span>Produce</span><b>${esc(cropLabel(p.crop))} · ${p.kg} kg</b>
        <span>Base price</span><b>₹${p.basePrice_INR_kg}/kg at 100 % freshness</b><span>Bay(s)</span><b>${esc(b.bay)}</b>
        <span>Check-in</span><b>${when} IST</b><span>Expected take-out</span><b>${esc(b.expected_out || '–')}</b>
        <span>Freshness</span><b>${fresh}</b>
        <span>Genesis hash</span><b class="mono">${b.genesisHash.slice(0, 24)}…</b>
        <span>Signature</span><b class="mono">${b.qr.sig.slice(0, 24)}…</b><span>Last daily anchor</span><b class="mono">${esc(String(p.lastAnchor).slice(0, 30))}…</b>
      </div><p class="note">${note}</p>
      <button id="printBtn">🖨 Print A6 slip</button><button id="copyQR">Copy QR text</button></div></div>`;
    $('printSlip').innerHTML = `<h2>KoolKisaan cold-room slip</h2><div class="id">${esc(b.slipId)}</div>
      <div class="qr">${qrSvg(qrText)}</div>
      <div>Farmer: <b>${esc(p.farmer)}</b><br>${esc(cropLabel(p.crop))} · <b>${p.kg} kg</b> · Bay <b>${esc(b.bay)}</b><br>
      Base ₹${p.basePrice_INR_kg}/kg (at 100 % freshness)<br>Check-in ${when} IST · take-out ${esc(b.expected_out || '–')}<br>${fresh}</div>
      <div class="small">Genesis ${b.genesisHash}<br>Sig ${b.qr.sig}<br>Daily anchor ${esc(p.lastAnchor)}<br>${note}</div>`;
    $('printBtn').onclick = () => window.print();
    $('copyQR').onclick = () => { try { navigator.clipboard.writeText(qrText); $('copyQR').textContent = 'Copied ✔'; } catch (e) { /* no clipboard */ } };
  }
  const STATUS = { stored: 'stored', partly_removed: 'partly removed', removed: 'removed', void: 'VOID', in_transit: 'in transit', delivered: 'delivered', sold: 'sold' };
  function renderFarmer() {
    drawLoad();
    const rows = batchList().filter(b => b.status !== 'void').map(b => {
      const bl = blocksOf(b.slipId);
      if (!bl.length) return '';
      const st = settle(bl), pr = T.price(st.base, st.F_now);
      return `<tr><td>${esc(b.slipId)}</td><td>${esc(b.bay)}</td><td class="n">${f1(b.kg_stored)} / ${b.kg}</td><td>${STATUS[b.status] || b.status}</td>
        <td>${esc(b.expected_out || '–')}</td><td class="n">${f1(st.F_door)} %</td><td class="n">${f1(st.F_now)} %</td><td class="n">₹${f1(pr)}</td><td class="n">₹${f0(b.kg_stored * pr)}</td></tr>`;
    });
    $('fMine').innerHTML = rows.length ? `<div class="tablewrap"><table><tr><th>Slip</th><th>Bay</th><th class="n">kg in room</th><th>Status</th><th>Take-out</th><th class="n">At our door (E)</th><th class="n">Freshness now (S)</th><th class="n">Price now</th><th class="n">Value in room</th></tr>${rows.join('')}</table></div>
      <p class="note">Freshness starts at the "at our door" estimate of the trip, then follows the ledger readings (flower core, room humidity, fans). Price = base × freshness.</p>` : 'Nothing stored yet.';
    fillSlipSelect($('coSlip'), b => b.status === 'stored' || b.status === 'partly_removed');
    const cur = store.batches[$('coSlip').value];
    if (cur && document.activeElement !== $('coKg')) $('coKg').max = cur.kg_stored;
    const b = store.batches[lastSlip] || batchList().filter(x => x.status !== 'void').pop();
    if (b) showSlip(b);
  }
  async function doCheckout() {
    const id = $('coSlip').value, kg = +$('coKg').value, m = $('coMsg');
    try {
      await store.checkout(id, kg, 'farmer', tsAt(step()));
      const st = settle(blocksOf(id));
      m.className = 'msg ok'; m.innerHTML = `✔ ${kg} kg taken out of ${esc(id)}.<br>${receiptLine(st)}`;
    } catch (e) { m.className = 'msg bd'; m.textContent = '⛔ ' + e.message; }
  }

  // ------------------------------------------------------------------ space calendar + reservations
  function spaceDays(n = 30) {
    const today = dateOf(tsAt(step())), cap = CAP(), out = [];
    for (let k = 0; k < n; k++) {
      const d = addDays(today, k);
      let kg = 0;
      for (const b of activeList()) if (!b.expected_out || b.expected_out > d) kg += b.kg_stored;
      for (const r of Object.values(store.res)) if (r.status !== 'rejected' && r.date <= d && addDays(r.date, r.days) > d) kg += r.kg;
      out.push({ d, kg, free: Math.max(0, cap - kg) });
    }
    return out;
  }
  function freeOn(d, days) {
    const sd = spaceDays(60), from = sd.findIndex(x => x.d === d);
    if (from < 0) return null;
    return Math.min(...sd.slice(from, from + days).map(x => x.free));
  }
  async function reserve() {
    const kg = +$('rsKg').value, d = $('rsDate').value, days = +$('rsDays').value, m = $('rsMsg');
    if (!(kg > 0) || !d || !(days >= 1)) { m.className = 'msg bd'; m.textContent = '⛔ Fill in kg, date and days'; return; }
    const free = freeOn(d, days);
    if (free === null) { m.className = 'msg bd'; m.textContent = '⛔ Pick a date within the next 60 days'; return; }
    if (free + 1e-9 < kg) {
      const sd = spaceDays(60); let alt = null;
      for (let k = 0; k < sd.length - days; k++) if (sd[k].d >= d && Math.min(...sd.slice(k, k + days).map(x => x.free)) >= kg) { alt = sd[k].d; break; }
      m.className = 'msg wn'; m.textContent = `Not enough space on all those days (only ${f1(free)} kg free). ${alt ? `Nearest date with ${kg} kg free for ${days} days: ${alt}.` : 'No date in the next 60 days.'}`;
      return;
    }
    try { await store.reserve({ kg, date: d, days, status: 'booked', farmer: $('fName').value.trim() || 'farmer' }); m.className = 'msg ok'; m.textContent = `✔ Booked: ${kg} kg from ${d} for ${days} days (the owner can accept or reject)`; }
    catch (e) { m.className = 'msg bd'; m.textContent = '⛔ ' + e.message; }
  }
  function renderSpace() {
    const sd = spaceDays(30), cap = CAP();
    $('spaceCal').innerHTML = `<div class="spacegrid">${sd.map(x => {
      const p = x.kg / cap * 100, col = p >= 100 ? 'red' : p >= 80 ? 'orange' : 'green';
      return `<div class="sday ${col}" title="${x.d}: ${f1(x.kg)} kg expected, ${f1(x.free)} kg free"><b>${x.d.slice(8)}</b><span>${f0(x.free)}</span></div>`;
    }).join('')}</div><p class="note">Number = kg free that day (capacity ${cap} kg), from the expected take-out dates and the reservations. Green &lt; 80 %, orange ≥ 80 %, red full.</p>`;
    const rs = Object.values(store.res).sort((a, b) => (a.date < b.date ? -1 : 1));
    $('oRes').innerHTML = rs.length ? `<table><tr><th>Farmer</th><th>Date</th><th class="n">kg</th><th class="n">days</th><th>Status</th><th></th></tr>${rs.map(r =>
      `<tr><td>${esc(r.farmer)}</td><td>${r.date}</td><td class="n">${r.kg}</td><td class="n">${r.days}</td><td>${r.status}</td>
        <td>${r.status === 'booked' && store.isAdmin() ? `<button data-acc="${r.id}">Accept</button><button data-rej="${r.id}">Reject</button>` : ''}</td></tr>`).join('')}</table>` : 'None.';
    $('oRes').querySelectorAll('[data-acc]').forEach(b => (b.onclick = () => store.decideReservation(b.dataset.acc, 'accepted')));
    $('oRes').querySelectorAll('[data-rej]').forEach(b => (b.onclick = () => store.decideReservation(b.dataset.rej, 'rejected')));
  }
  function answer() {
    const d = $('ansDate').value; if (!d) return;
    const free = freeOn(d, 1);
    const txt = free === null ? 'Pick a date within the next 60 days.' : `KoolKisaan cold room: on ${d} you can bring up to ${Math.floor(free)} kg.`;
    $('ansOut').innerHTML = `${esc(txt)} <a href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Send on WhatsApp</a>
      <button id="ansCopy">Copy</button>`;
    $('ansCopy').onclick = () => { try { navigator.clipboard.writeText(txt); } catch (e) { /* ignore */ } };
  }
  const phiWord = phi => phi >= 3 ? '<b class="bd">✗ Data does not match physics</b>' : phi >= 2 ? '<b class="wn">⚠ Unusual – watch</b>' : '<b class="ok">✓ Data fits physics</b>';

  // ------------------------------------------------------------------ OWNER
  let c24 = null, cFresh = null;
  function renderOwner() {
    const i = step(), a = A(), r = rowAt(a, i);
    const v = (x, u, d = 1) => (x === null || x === undefined || !isFinite(x) ? '<span class="bd">no reading</span>' : `${(+x).toFixed(d)} ${u}`);
    const node = (t, val, sub, tag) => `<div class="node"><b>${t} <span class="chip ${tag}">${tag}</span></b><span class="v">${val}</span><small>${sub}</small></div>`;
    $('nodes').innerHTML =
      node('Room middle', v(r.T_room, '°C'), `RH ${v(r.RH_room, '%', 0)} · high probe ${v(r.T_high, '°C')}`, 'S') +
      node('Flower core', v(r.T_core, '°C'), 'probe among the newest flowers', 'S') +
      node('Ice panels', v(r.T_ice, '°C'), 'about 0 °C while part frozen', 'S') +
      node('Glycol', `${v(r.T_sup, '°C')} → ${v(r.T_ret, '°C')}`, `flow ${v(r.flow, 'kg/s', 2)}`, 'S') +
      node('Chiller power', v(r.P_el_W, 'W', 0), `door ${r.door_s > 0 ? 'opened ' + f0(r.door_s) + ' s' : 'closed'}`, 'S') +
      node('Outside', v(r.T_out, '°C'), `weather service ${v(r.T_wx, '°C')}`, 'W');
    const tt = store.tele.filter(x => x.scenario === scKey() && x.step > i - 288 && x.rep && x.rep.T_room !== undefined);
    const tr = sc().truth.T_room;
    const data = { labels: tt.map(x => hhmm(x.ts)), datasets: [
      { label: D.band_C[1] + ' °C', data: tt.map(() => D.band_C[1]), borderWidth: 0, pointRadius: 0, backgroundColor: 'rgba(22,163,74,.12)', fill: '+1' },
      { label: D.band_C[0] + ' °C', data: tt.map(() => D.band_C[0]), borderWidth: 0, pointRadius: 0, fill: false },
      { label: 'Room air (reported)', data: tt.map(x => x.rep.T_room), borderColor: '#2a78d6', borderWidth: 2, pointRadius: 0, spanGaps: false },
      { label: 'Flower core (reported)', data: tt.map(x => x.rep.T_core), borderColor: '#e8590c', borderWidth: 2, pointRadius: 0 },
      { label: 'Room air – twin (true)', data: tt.map(x => tr[x.step]), borderColor: '#94a3b8', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 }] };
    c24 = chart(c24, $('c24'), data, { y: { title: { display: true, text: '°C' } } });
    const al = Object.values(store.alerts).sort((x, y) => (x.created < y.created ? 1 : -1)).map(x =>
      `<div class="alarm ${x.status === 'reviewed' ? 'ok' : x.kind === 'hash' ? 'bd' : 'wn'}">${x.status === 'reviewed' ? '✓' : '⚠'} <a href="${KKStore.link(`alert.html?id=${encodeURIComponent(x.id)}`)}">${esc(x.label)}</a> –
        ${esc(x.reason)} · ${whenLbl(x.from_ts)}–${hhmm(x.to_ts)} · ${x.status}</div>`);
    if (r.T_room > D.band_C[1] + 2) al.push(`<div class="alarm bd">🌡 Room air ${f1(r.T_room)} °C – above ${D.band_C[1] + 2} °C</div>`);
    $('alarms').innerHTML = al.length ? al.slice(0, 8).join('') : '<div class="alarm ok">✓ No alarms</div>';
    renderLedger();
    renderBatches();
    renderSpace();
    const an = Object.values(store.anchors).sort((x, y) => (x.day < y.day ? 1 : -1));
    $('anchors').innerHTML = an.length ? `<table><tr><th>UTC day</th><th>Anchor (last hash of the day)</th><th class="n">Slips</th><th>Published (simulated)</th></tr>${an.map(v2 =>
      `<tr><td>${v2.day}</td><td class="mono">${v2.anchor.slice(0, 32)}…</td><td class="n">${Object.keys(v2.heads).length}</td><td>${whenLbl(v2.published)}</td></tr>`).join('')}</table>` :
      'None yet – the first anchor is published when the clock passes midnight UTC (05:30 IST). It is also printed on the next farmer slip.';
  }
  function renderLedger() {
    fillSlipSelect($('oSlip'), () => true);
    const id = $('oSlip').value, bl = blocksOf(id);
    if (!bl.length) { $('ledger').innerHTML = '<p class="muted">No slips yet – a farmer must check in first.</p>'; return; }
    const ver = T.verifyChain(bl), ac = anchorCheck(id, bl), tp = ctrl() && ctrl().tamper, a = A();
    const inWin = b => b.type === 'READING' && tp && tp.kind !== 'edit' && b.payload && b.payload.step >= tp.start && b.payload.step < tp.end;
    const edited = new Set(store.edits().filter(e => e.slipId === id).map(e => e.index));
    const anchorsBy = {}; for (const x of Object.values(store.anchors)) if (x.heads[id]) anchorsBy[x.heads[id]] = x;
    const shown = bl.slice(-30).reverse();
    const card = b => {
      const bad = ver.first_bad !== null && b.index >= ver.first_bad, fl = (b.physics.flags || []).length;
      const type = b.type === 'CHECKIN' ? 'CHECK-IN' : b.type, anc = anchorsBy[b.hash];
      const cls = ['lgc', 't-' + b.type.toLowerCase(), bad ? 'bad' : '', inWin(b) ? 'tamper' : '', edited.has(b.index) ? 'edited' : ''].join(' ');
      const sr = `${bad ? 'Broken. ' : ''}${inWin(b) ? 'Inside the tamper window. ' : ''}${edited.has(b.index) ? 'Edited after it was written. ' : ''}`;
      return `<li class="${cls}"><div class="lgh"><b>#${b.index}</b><span class="lgt">${esc(type)}</span><span>${whenLbl(b.ts)}</span>
          <span class="lgphi">Φ ${b.physics.phi >= 99 ? '99' : f1(b.physics.phi)}${fl ? ' ⚠' : ''}</span>${sr ? `<span class="sr-only">${sr}</span>` : ''}</div>
        <div class="lgd">${blockSummary(b)}</div>
        <div class="lgx mono"><span title="previous block's hash">prev ${b.prevHash.slice(0, 8)}…</span> → <span title="this block's hash">hash ${b.hash.slice(0, 8)}…</span>${bad ? ' <b class="bd">✗ does not match</b>' : ''}</div>
        ${anc ? `<div class="lga">⚓ ANCHOR ${esc(anc.day)} published (simulated) · ${anc.anchor.slice(0, 12)}… · also on the farmer's slip</div>` : ''}</li>`;
    };
    const badge = ver.valid ? '<span class="cbadge ok">Chain intact ✓</span>' : `<span class="cbadge bd">Broken at block #${ver.first_bad} ✗</span>`;
    const abadge = ac.bad ? `<span class="cbadge bd">Daily anchor ${esc(ac.bad)} does not match ✗ – that day was re-written</span>` :
      ac.n ? `<span class="cbadge ok">Matches ${ac.n} daily anchor(s) ✓</span>` : '<span class="cbadge">No daily anchor yet</span>';
    const win = tp && tp.kind !== 'edit' ? `<p class="note">Red border = READING blocks inside the demo tamper window ${whenLbl(tsAt(tp.start))}–${hhmm(tsAt(tp.end))}${a.kf !== undefined ? ` · first FLAG raised at ${hhmm(tsAt(a.kf))}` : ''}.</p>` : '';
    $('ledger').innerHTML = `<p class="lg-top">Each block's hash includes the previous block's hash, so changing any old value breaks every block after it.</p>
      <div class="row">${badge}${abadge}<span class="note">${bl.length} blocks · newest on top · last 30 shown</span></div>${win}
      <ol class="lgchain" aria-label="Hash-chain ledger, newest block first">${shown.map(card).join('')}</ol>`;
  }
  function renderBatches() {
    const tab = $('oBatches').dataset.tab || 'active';
    const list = batchList().filter(b => (tab === 'active' ? ['stored', 'partly_removed'].includes(b.status) : !['stored', 'partly_removed'].includes(b.status)));
    $('oBatches').innerHTML = `<div class="row"><button data-bt="active" class="${tab === 'active' ? 'primary' : ''}">Active</button><button data-bt="history" class="${tab === 'history' ? 'primary' : ''}">History</button></div>
      ${list.length ? `<div class="tablewrap"><table><tr><th>Slip</th><th>Farmer</th><th class="n">kg in room / in</th><th>Bay</th><th class="n">At door (E)</th><th class="n">Now (S)</th><th>Status</th><th>Take-out</th><th></th></tr>${list.map(b => {
        const bl = blocksOf(b.slipId), st = bl.length ? settle(bl) : null;
        return `<tr><td>${esc(b.slipId)}</td><td>${esc(b.farmer)}</td><td class="n">${f1(b.kg_stored)} / ${b.kg}</td><td>${esc(b.bay)}</td><td class="n">${st ? f1(st.F_door) + ' %' : '–'}</td><td class="n">${st ? f1(st.F_now) + ' %' : '–'}</td>
          <td>${STATUS[b.status] || b.status}${b.void_reason ? ` (${esc(b.void_reason)})` : ''}</td>
          <td>${esc(b.expected_out || '–')}</td><td>${tab === 'active' && store.isAdmin() ? `<button data-void="${b.slipId}" class="danger">Void</button>` : ''}</td></tr>`;
      }).join('')}</table></div>`
      : `<p class="muted">${tab === 'active' ? 'Nothing in the room.' : 'No removed or voided batches yet.'}</p>`}
      <p class="note">Void = a wrong check-in: a VOID block is written, the space is freed, the history stays (the ledger is never deleted).</p>`;
    $('oBatches').querySelectorAll('[data-bt]').forEach(b => (b.onclick = () => { $('oBatches').dataset.tab = b.dataset.bt; renderBatches(); }));
    $('oBatches').querySelectorAll('[data-void]').forEach(b => (b.onclick = async () => {
      const why = prompt(`Void ${b.dataset.void}? Give a reason (written into the ledger):`, 'wrong quantity typed');
      if (!why) return;
      try { await store.voidBatch(b.dataset.void, why, tsAt(step())); } catch (e) { alert(e.message); }
    }));
  }
  function blockSummary(b) {
    const p = b.payload || {};
    if (b.type === 'READING' && p.N4) return `air ${f1(p.N4.T_r)} · core ${f1(p.N2.T_core)} °C · RH ${f0(p.N4.RH_r)} %`;
    if (b.type === 'READING') return `room ${f1(p.T_room)} · core ${f1(p.T_core)} · outside ${f1(p.T_out)} °C · ${f0(p.P_el_W)} W${p.door_s > 0 ? ' · door open' : ''}`;
    if (b.type === 'CHECKIN') return `${esc(p.farmer)} · ${p.kg} kg ${esc(cropLabel(p.crop))} · ₹${p.basePrice_INR_kg}/kg · ${esc(p.bay)} · at door ${p.trip ? f1(p.trip.F_door) + ' % (E)' : '–'}`;
    if (b.type === 'CHECKOUT') return `${f1(p.kg)} kg out · ${f1(p.kg_left)} kg left`;
    if (b.type === 'VOID') return `VOID: ${esc(p.reason)} · ${f1(p.kg)} kg freed`;
    if (b.type === 'FLAG') return `${p.kind === 'quarantine' ? '🛡' : '⚠'} ${esc(p.reason)}`;
    if (b.type === 'REVIEW') return `${p.alertId ? `reviewed alert ${esc(p.alertId)}: ` : ''}${esc(p.note)}`;
    if (b.type === 'HANDOVER_OUT') return `${esc(p.transporterId)} · ${esc(p.vehicle)} · ${f1(p.produce_T_C)} °C`;
    if (b.type === 'TRANSIT') return `box ${f1(p.T_box_C)} °C · outside ${f1(p.T_out_C)} °C (${esc(p.source)})`;
    if (b.type === 'HANDOVER_IN') return `${esc(p.buyerId)} · ${f1(p.produce_T_C)} °C`;
    if (b.type === 'SALE') return `F ${f1(p.freshness_pct)} % · ₹${f1(p.price_INR_kg)}/kg · ₹${f0(p.total_INR)}`;
    return '';
  }
  function fillSlipSelect(sel, keep) {
    const cur = sel.value, ids = batchList().filter(keep).map(b => b.slipId);
    const html = ids.length ? ids.map(id => `<option value="${id}">${id} · ${STATUS[store.batches[id].status] || ''}</option>`).join('') : '<option value="">– none –</option>';
    if (sel.innerHTML !== html) sel.innerHTML = html;
    if (ids.includes(cur)) sel.value = cur; else if (ids.length) sel.value = ids[ids.length - 1];
  }
  // ---- demo tampering (called by the monitor panel)
  async function setTamper(cfg) {
    if (!amController()) return 'Tampering works only on the device that runs the chamber clock.';
    const s0 = step() + 1;
    if (cfg.start < s0) { cfg.end += s0 - cfg.start; cfg.start = s0; }
    cfg.end = Math.min(NSTEP() - 1, cfg.end);
    if (cfg.kind === 'replay' && cfg.start < 288) return 'Replay needs a day of history.';
    await store.setCtrl({ ...ctrl(), tamper: cfg, updated: new Date().toISOString() });
    await store.audit({ what: 'demo tamper', cfg });
    $('speedSel').value = '1';
    if (!playTimer) play(true);
    schedule();
    return null;
  }
  async function clearTamper() { await store.setCtrl({ ...ctrl(), tamper: null, updated: new Date().toISOString() }); schedule(); }
  async function editOld(rehash) {                         // edit an old stored reading (hide a warm spell); optionally re-hash the rest
    const b = activeList()[0];
    if (!b) return 'Check in a batch first.';
    const bl = blocksBy[b.slipId] || [];
    let reads = bl.filter(x => x.type === 'READING' && x.index < bl.length - 3 && x.payload && x.payload.T_room !== undefined);
    if (rehash) {
      const days = new Set(Object.values(store.anchors).filter(x => x.heads[b.slipId]).map(x => x.day));
      reads = reads.filter(x => days.has(x.ts.slice(0, 10)));
      if (!reads.length) return 'Run the clock past 05:30 IST first, so a daily anchor covers some readings.';
    }
    if (!reads.length) return 'Need a few readings first – run the clock.';
    const tgt = reads.reduce((m, x) => ((x.payload.T_room ?? 0) > (m.payload.T_room ?? 0) ? x : m), reads[0]);
    let msg = '';
    if (store.mode === 'live') msg = await store.tryEditBlock(b.slipId, tgt.index, { ...tgt.payload, T_room: 4.0 });
    await store.demoEdit({ slipId: b.slipId, index: tgt.index, path: 'T_room', value: 4.0, was: tgt.payload.T_room, rehash: !!rehash });
    if (!playTimer && amController()) play(true);
    schedule();
    return `Edited block #${tgt.index} of ${b.slipId}: room ${f1(tgt.payload.T_room)} → 4.0 °C${rehash ? ' and re-computed every later hash (the chain looks intact; only the published daily anchor shows it)' : ''}.` +
      (msg ? ` The database itself: ${msg} (append-only rules) – the demo shows what an edit with direct database access looks like.` : '');
  }

  // ------------------------------------------------------------------ TRANSPORTER (+ delivery check)
  let tCur = null;
  function parseQR(txt) { try { const o = JSON.parse(txt); return o && o.slipId ? o : null; } catch (e) { return null; } }
  async function tVerify() {
    const qr = parseQR($('tQR').value) || (store.batches[$('tSlip').value] || {}).qr, m = $('tVmsg');
    tCur = null; $('tOut').disabled = true;
    if (!qr) { m.className = 'msg bd'; m.textContent = '✗ Not a valid QR text'; return; }
    const b = store.batches[qr.slipId];
    if (!b) { m.className = 'msg bd'; m.textContent = '✗ Slip ID not found in the ledger'; return; }
    const v = await verifyQR(qr, b.sigMode);
    if (!v.ok || qr.genesisHash !== b.genesisHash || qr.bay !== b.qr.bay) { m.className = 'msg bd'; m.textContent = `✗ INVALID slip – signature or genesis does not match (${v.how}). Do not load.`; return; }
    tCur = b.slipId; m.className = 'msg ok'; m.textContent = `✓ Genuine slip ${b.slipId} · ${b.bay} · ${f1(b.kg_stored)} kg in the room (${v.how})`;
    $('tTemp').value = f1(rowAt(A(), step()).T_core);
    renderTransporter();
  }
  async function tHandOut() {
    const b = store.batches[tCur]; if (!b || !['stored', 'partly_removed'].includes(b.status)) return;
    await store.leaveRoom(b.slipId, 'HANDOVER_OUT', 'transporter', { transporterId: $('tId').value.trim(), vehicle: $('tVeh').value.trim(), produce_T_C: +$('tTemp').value }, tsAt(step()), 'in_transit');
    $('tOmsg').className = 'msg ok'; $('tOmsg').textContent = `✓ ${b.slipId} handed over at ${whenLbl(tsAt(step()))} – its bay space is free again`;
  }
  function lastT(bl) { for (let k = bl.length - 1; k >= 0; k--) { const p = bl[k].payload || {}; if (p.T_box_C !== undefined) return p.T_box_C; if (p.produce_T_C !== undefined) return p.produce_T_C; } return null; }
  let tripStep = null;
  async function tTransit(manualT) {
    const b = store.batches[tCur]; if (!b || b.status !== 'in_transit') return;
    const bl = blocksBy[b.slipId] || [], n = CFG.transit_interval_min / 5;
    tripStep = Math.min(NSTEP() - 1, (tripStep ?? step()) + n);
    const To = num(sc().T_out_api[tripStep]), prev = lastT(bl);
    const Tb = manualT !== undefined ? manualT : To + (prev - To) * Math.exp(-(CFG.transit_interval_min / 60) / CFG.vehicle_time_constant_h);
    await store.setStatus(b.slipId, 'TRANSIT', 'transporter', { T_box_C: Tb, T_out_C: To, source: manualT !== undefined ? 'manual' : 'vehicle model (E)' }, tsAt(tripStep), 'in_transit');
  }
  async function tHandIn() {
    const b = store.batches[tCur]; if (!b || b.status !== 'in_transit') return;
    await store.setStatus(b.slipId, 'HANDOVER_IN', 'buyer', { buyerId: $('tBuyer').value.trim(), produce_T_C: +$('tInTemp').value }, tsAt(tripStep ?? step()), 'delivered');
    tripStep = null;
    $('tImsg').className = 'msg ok'; $('tImsg').textContent = `✓ Delivered to ${$('tBuyer').value} – run the delivery check below`;
    $('dSlip').value = b.slipId;
    deliveryCheck();
  }
  function blameTable(st) {
    const leg = (n, who, k) => `<tr><td>${n}</td><td>${who}</td><td class="n">${f1(st.legs[k])} %</td><td class="n">₹${f0(st.loss_INR[k])}</td></tr>`;
    return `<div class="tablewrap"><table><tr><th>Leg</th><th>Who held it</th><th class="n">Freshness lost</th><th class="n">₹ lost</th></tr>
      ${leg('Trip (picking → our door, E)', 'farmer', 'farm')}${leg('Storage (cold room, S)', 'cold-room owner', 'storage')}${leg('Transport (E)', 'transporter', 'transport')}</table></div>
      <p class="note">₹ lost = kg × base price × freshness lost. ${receiptLine(st)}</p>`;
  }
  function renderTransporter() {
    fillSlipSelect($('tSlip'), b => !['sold', 'void'].includes(b.status));
    $('tTau').textContent = CFG.vehicle_time_constant_h;
    const b = store.batches[tCur];
    $('tOut').disabled = !(b && ['stored', 'partly_removed'].includes(b.status));
    const tr = !!(b && b.status === 'in_transit');
    $('tAdd').disabled = $('tModel').disabled = $('tIn').disabled = !tr;
    const bl = b ? blocksBy[b.slipId] || [] : [];
    if (tr) { const lt = lastT(bl); if (lt !== null && document.activeElement !== $('tInTemp')) $('tInTemp').value = f1(lt); }
    const trips = bl.filter(x => x.type === 'TRANSIT');
    $('tTrip').innerHTML = trips.length ? trips.map(x => `${hhmm(x.ts)} · box ${f1(x.payload.T_box_C)} °C (outside ${f1(x.payload.T_out_C)} °C)`).join('<br>') : 'No transit readings yet.';
    const show = b || store.batches[$('tSlip').value], sb = show ? blocksOf(show.slipId) : [];
    $('tBlame').innerHTML = show && sb.length ? `<b>${esc(show.slipId)}</b>${blameTable(settle(sb))}` : 'Pick a slip.';
    const sel = $('dSlip'), had = sel.value;
    fillSlipSelect(sel, () => true);
    if (!had) { const dl = batchList().filter(x => x.status === 'delivered'); if (dl.length) sel.value = dl[dl.length - 1].slipId; }
  }
  // the 5 checks (also used by the public "Verify a crate QR" box)
  async function checks(qr) {
    if (!qr || !store.batches[qr.slipId]) return null;
    const b = store.batches[qr.slipId], bl = withEdits(b.slipId, await store.loadBlocks(b.slipId)), out = [];
    const v = await verifyQR(qr, b.sigMode), sigOk = v.ok && qr.genesisHash === b.genesisHash;
    out.push([sigOk, sigOk ? `✓ Slip signature (HMAC-SHA256) is genuine – ${v.how}` : `✗ Slip signature does NOT match – ${v.how}`]);
    const ver = T.verifyChain(bl, CFG.reading_interval_s);
    out.push([ver.valid, ver.valid ? `✓ All ${bl.length} block hashes and links re-computed – unchanged` : `✗ Block #${ver.first_bad}: ${ver.why}`]);
    out.push([!ver.gaps.length ? true : 'wn', ver.gaps.length ? `⚠ ${ver.gaps.length} gap(s) in the 5-min readings (first after block #${ver.gaps[0].after})` : '✓ No gaps in the 5-minute READING sequence']);
    const ac = anchorCheck(b.slipId, bl);
    out.push([!ac.bad, ac.bad ? `✗ Day ${ac.bad} does not match its published daily anchor – that day was re-written` : ac.n ? `✓ Matches ${ac.n} published daily anchor(s)` : '✓ No daily anchor covers this slip yet']);
    const fl = ver.physics_flags;
    out.push([!fl.length ? true : 'wn', fl.length ? `⚠ ${fl.length} automatic flag(s) in the chain` : '✓ No flags – the readings fit the physics of the room']);
    return { b, bl, ver, ac, fl, sigOk, v, list: out };
  }
  async function deliveryCheck() {
    const qr = parseQR($('dQR').value) || (store.batches[$('dSlip').value] || {}).qr;
    const ol = $('dChecks'), Vd = $('dVerdict'), pay = $('dPay');
    ol.innerHTML = ''; pay.innerHTML = '';
    const c = await checks(qr);
    if (!c) { Vd.className = 'verdict bd'; Vd.innerHTML = '✗ Unknown slip'; return; }
    const { b, bl, ver, ac, fl, sigOk } = c;
    for (const [ok, t] of c.list) ol.insertAdjacentHTML('beforeend', `<li class="${ok === true ? 'ok' : ok === 'wn' ? 'wn' : 'bd'}">${t}</li>`);
    const st = settle(bl);
    const phis = bl.filter(x => x.type === 'READING').map(x => x.physics.phi);
    const pmax = phis.length ? Math.max(...phis) : 0;
    $('dPhi').innerHTML = `Highest Φ in this chain: <b>${pmax >= 99 ? '99 (hard rule)' : f1(pmax)}</b> – ${phiWord(pmax)}`;
    const link = f => (f && f.alertId ? ` · <a href="${KKStore.link(`alert.html?id=${encodeURIComponent(f.alertId)}`)}">open the investigation</a>` : '');
    if (!sigOk || !ver.valid || ac.bad) {
      const where = !sigOk ? 'the slip signature is forged' : !ver.valid ? `broken at block #${ver.first_bad}` : `UTC day ${ac.bad} re-written after its anchor was published`;
      const who = !ver.valid ? ver.custody_at_break : 'owner';
      Vd.className = 'verdict bd';
      Vd.innerHTML = `✗ EVIDENCE TAMPERED – ${where}<small>Payment <b>FROZEN</b> · penalty mode · custody holder at the break: <b>${esc(who)}</b>${link(fl.find(f => f.type === 'HASH'))}</small>`;
      pay.innerHTML = `<p class="note">Penalty mode: the agreed penalty goes against the ${esc(who)} who held the produce when the record was changed; an inspection decides the rest.</p>`;
    } else if (fl.length || ver.gaps.length) {
      let txt = '';
      if (fl.length) {
        const f = fl[0], a = store.alerts[f.alertId];
        txt = `DATA DOES NOT MATCH PHYSICS from ${hhmm(f.from)} to ${hhmm(a ? a.to_ts : f.raised)} (Φ = ${f1(a ? Math.min(a.phi_max, 99) : f.phi)})<small>Payment <b>ON HOLD</b> · ${esc(f.reason)}${fl.length > 1 ? ` · ${fl.length} flags in total` : ''}${link(f)}</small>`;
      } else txt = `READINGS MISSING<small>Payment <b>ON HOLD</b> · ${ver.gaps.length} gap(s) in the 5-minute readings</small>`;
      Vd.className = 'verdict wn'; Vd.innerHTML = '⚠ ' + txt;
      pay.innerHTML = blameTable(st);
    } else {
      const F = st.F_exit, pr = T.price(st.base, F);
      Vd.className = 'verdict ok';
      Vd.innerHTML = `✓ ALL CHECKS PASSED<small>${receiptLine(st)}</small>`;
      pay.innerHTML = blameTable(st) + (b.status === 'delivered' ? `<button id="dPayBtn" class="primary">Demo: accept &amp; pay (SALE block)</button>` :
        b.status === 'sold' ? '<p class="msg ok">✓ Paid – SALE block written.</p>' : '<p class="note">Not delivered yet – this is the price if sold now.</p>');
      const btn = $('dPayBtn');
      if (btn) btn.onclick = async () => { await store.setStatus(b.slipId, 'SALE', 'buyer', { freshness_pct: F, F_door_pct: st.F_door, price_INR_kg: pr, total_INR: pr * st.kg, loss_INR: st.loss_INR }, tsAt(step()), 'sold'); deliveryCheck(); };
    }
    freshChart(st);
  }
  async function publicVerify() {
    const qr = parseQR($('vQR').value), out = $('vOut');
    if (!qr) { out.innerHTML = '<p class="msg bd">✗ Paste the QR text of a crate (it starts with {"slipId":…).</p>'; return; }
    const c = await checks(qr);
    if (!c) { out.innerHTML = '<p class="msg bd">✗ This slip is not in the ledger.</p>'; return; }
    const st = settle(c.bl), ok = c.list.every(x => x[0] === true);
    out.innerHTML = `<ol class="checks">${c.list.map(([o, t]) => `<li class="${o === true ? 'ok' : o === 'wn' ? 'wn' : 'bd'}">${t}</li>`).join('')}</ol>
      <p class="${ok ? 'msg ok' : 'msg wn'}">${ok ? '✓ Genuine crate' : '⚠ See the warnings above'} · ${receiptLine(st)}</p>`;
  }
  function freshChart(st) {
    const c = st.curve, lab = c.map(p => whenLbl(p.ts)), opt = crop(st.crop).freshness.T_opt_C;
    const data = { labels: lab, datasets: [
      { label: 'Freshness F (%)', data: c.map(p => p.F), borderColor: '#0f766e', borderWidth: 2.5, pointRadius: 0, yAxisID: 'y' },
      { label: D.band_C[1] + ' °C', data: c.map(() => D.band_C[1]), borderWidth: 0, pointRadius: 0, backgroundColor: 'rgba(22,163,74,.12)', fill: '+1', yAxisID: 'y1' },
      { label: D.band_C[0] + ' °C', data: c.map(() => D.band_C[0]), borderWidth: 0, pointRadius: 0, fill: false, yAxisID: 'y1' },
      { label: `Best ${opt} °C`, data: c.map(() => opt), borderColor: '#16a34a', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, yAxisID: 'y1' },
      { label: 'Flower temperature (°C)', data: c.map(p => p.T), borderColor: '#e8590c', borderWidth: 1.5, pointRadius: 0, yAxisID: 'y1' }] };
    cFresh = chart(cFresh, $('cFresh'), data, { y: { min: 0, max: 100, title: { display: true, text: 'Freshness %' } },
      y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '°C' } } });
    $('cFresh').setAttribute('aria-label', `Freshness from ${f1(st.F_door)} % at our door to ${f1(st.F_exit)} % at exit`);
  }
  function renderFreshModel() {
    const c = crop('jasmine'), f = c.freshness;
    $('fModel').innerHTML = `<ol class="plain">
      <li><b>Trip (picking → our door), estimate E.</b> Every 5 minutes: life used += Δt / SL(T), with SL(T) = SL<sub>ref</sub> × Q10<sup>(T<sub>opt</sub> − T)/10</sup>
        (jasmine: SL<sub>ref</sub> = ${f.SL_ref_h} h at ${f.T_opt_C} °C, Q10 = ${c.Q10}). Flower temperature = outside air (hourly 2026 weather) + bag heating of the packing.
        Water loss adds 100 × K<sub>t</sub>·VPD·√v·Δt × packing factor / ${f.WL_max_pct} %. F at our door = 100 × (1 − life used) − water loss.</li>
      <li><b>Inside the room, from the sensors S.</b> The same step every 5 minutes from F at our door, with the flower-core probe (or room air), room humidity and
        the liner factor ${V.liner_factor}; below ${c.chill_injury_below_C} °C a chilling term speeds ageing up. F never goes up.</li>
      <li><b>Exit.</b> Price = base × F at exit. Remaining life at 30 °C ≈ F × SL(30 °C) = F × ${f1(FV.shelfLifeH(c, 30))} h for jasmine.</li></ol>
      <p class="note">Packing (E): ${Object.values(TC.packing).map(p => `${esc(p.label)} +${p.bag_heating_K} K, water × ${p.water_factor}`).join(' · ')}.
        Speeds (E): ${Object.entries(TC.speeds_km_h).map(([k, v]) => `${esc(TC.mode_labels[k])} ${v} km/h`).join(', ')}.</p>`;
  }
  function chart(old, canvas, data, scales) {
    if (typeof Chart === 'undefined') return null;
    if (old) { old.data = data; old.update('none'); return old; }
    return new Chart(canvas, { type: 'line', data, options: { animation: false, responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { filter: it => !/^\d °C$/.test(it.text), boxWidth: 12 } } },
      scales: { x: { ticks: { maxTicksLimit: 8, autoSkip: true } }, ...scales } } });
  }

  // ------------------------------------------------------------------ bus for the Live Trust Monitor (phi_monitor.js)
  const listeners = [];
  function batchesForImpact() {
    return activeList().map(b => { const bl = blocksOf(b.slipId); const st = bl.length ? settle(bl) : null; return st ? { slipId: b.slipId, crop: st.crop, kg: b.kg_stored, base: st.base, F0: st.F_now } : null; }).filter(Boolean);
  }
  window.TrustBus = { V, E, step, scKey, A, tsAt, whenLbl, hhmm, tamper: () => (ctrl() && ctrl().tamper) || null, setTamper, clearTamper, editOld,
    isController: () => !!store && amController(), batches: batchesForImpact, alerts: () => (store ? store.alerts : {}), on: fn => listeners.push(fn) };

  // ------------------------------------------------------------------ wiring
  let pending = false;
  function schedule() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; renderAll(); }); }
  function renderAll() {
    if (!store) return;
    watchAll();
    renderTop(); renderFarmer();
    if (role === 'owner') { renderOwner(); listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
    if (role === 'transporter') renderTransporter();
  }
  function setRole(r) {
    if (r === 'buyer') r = 'transporter';                     // the buyer view is now the transporter's delivery check
    role = r;
    for (const b of document.querySelectorAll('#roles button')) { const on = b.dataset.role === r; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    for (const v of document.querySelectorAll('.view')) v.classList.toggle('on', v.id === 'v-' + r);
    try { localStorage.setItem(ROLE_KEY, r); } catch (e) { /* ignore */ }
    renderAll();
  }
  function initForm() {
    $('fBand').innerHTML = Object.entries(TC.distance_bands_km).map(([k, v]) => `<option value="${k}">${k} km (≈ ${v} km)</option>`).join('');
    $('fBand').value = TC.default_band;
    $('fMode').innerHTML = Object.entries(TC.mode_labels).map(([k, v]) => `<option value="${k}">${esc(v)} (${TC.speeds_km_h[k]} km/h)</option>`).join('');
    $('fMode').value = TC.default_mode;
    $('fPack').innerHTML = Object.entries(TC.packing).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
    $('fPack').value = TC.default_packing;
    for (const id of ['fPickS', 'fPickE', 'fBand', 'fMode', 'fPack', 'fVillage', 'fCrop']) $(id).addEventListener('input', renderDoorPreview);
    $('fPickNow').onclick = () => { $('fPickS').value = ''; $('fPickE').value = ''; const t = tripForm(); $('fPickS').value = t.labels.pick_start; $('fPickE').value = t.labels.pick_end; renderDoorPreview(); };
  }
  async function init() {
    $('honestyO').innerHTML = $('honestyT').innerHTML = `<b>What this proves – honestly.</b> ${HONESTY}<p class="note">${esc(V._note)}
      How often Φ raises a false alarm and how fast it catches each kind of lie was tested on a simulated 2026 run – see the <a href="method.html">Trust method</a> page.
      A fully consistent fake of every sensor breaks no physics; only the weather service, the inverter log, the utility meter and the secret watermark can catch it.</p>`;
    $('fCrop').innerHTML = Object.entries(D.crops).map(([k, c]) => `<option value="${k}">${esc(c.label)}</option>`).join('')
      + Object.entries(D.blocked).map(([k, c]) => `<option value="${k}">${esc(c.label)}</option>`).join('');
    $('fCrop').value = D.crop_key in D.crops ? D.crop_key : 'jasmine';
    $('fCrop').onchange = () => { $('fOut').value = addDays(dateOf(tsAt(step())), DWELL_DAYS[$('fCrop').value] || 1); flowerRule(); renderDoorPreview(); };
    $('fOut').onchange = flowerRule;
    initForm();
    store = await KKStore.get();
    KKStore.banner($('kkBanner'), store);
    store.on(() => schedule());
    const today = dateOf(tsAt(step()));
    $('fOut').value = addDays(today, DWELL_DAYS[$('fCrop').value] || 2);
    flowerRule();
    $('rsDate').value = addDays(today, 1); $('ansDate').value = addDays(today, 1);
    $('fKg').oninput = checkQty; $('fGo').onclick = checkIn; $('coGo').onclick = doCheckout; $('rsGo').onclick = reserve; $('ansGo').onclick = answer;
    $('coSlip').onchange = () => { const b = store.batches[$('coSlip').value]; if (b) $('coKg').value = b.kg_stored; };
    for (const b of document.querySelectorAll('#roles button')) b.onclick = () => setRole(b.dataset.role);
    for (const b of document.querySelectorAll('[data-adv]')) b.onclick = async () => { if (!(await advance(+b.dataset.adv))) alert('End of the twin run – reset the demo to start again.'); };
    $('playBtn').onclick = () => play(!playTimer);
    $('speedSel').onchange = () => { if (playTimer) play(true); };
    $('scenario').onchange = async e => {
      if (!amController()) { e.target.value = scKey(); return; }
      if (activeList().length && !confirm('Changing the scenario restarts the chamber clock for everyone. Continue?')) { e.target.value = scKey(); return; }
      await store.setCtrl({ uid: store.uid, scenario: e.target.value, step: V.checkin_step, tamper: null, updated: new Date().toISOString() });
    };
    $('resetBtn').textContent = 'Demo: reset (admin)';
    $('resetBtn').onclick = async () => {
      if (!confirm('Reset the DEMO chamber CH-FLOWER? All demo batches, alerts and bookings go to history (nothing is deleted; a new demo round starts).')) return;
      try { play(false); await store.resetDemo(); await store.setCtrl({ uid: store.uid, scenario: 'normal', step: V.checkin_step, tamper: null, updated: new Date().toISOString() }); $('slipBox').innerHTML = 'No slip yet – check in first.'; shownSlip = null; } catch (e) { alert(e.message); }
    };
    $('oSlip').onchange = renderOwner;
    $('tVerify').onclick = tVerify; $('tOut').onclick = tHandOut;
    $('tAdd').onclick = async () => { const v = parseFloat($('tManual').value); if (!isFinite(v)) { alert('Type the box temperature first.'); return; } await tTransit(v); };
    $('tModel').onclick = async () => { for (let k = 0; k < 120 / CFG.transit_interval_min; k++) await tTransit(); };
    $('tIn').onclick = tHandIn; $('tSlip').onchange = () => { $('tQR').value = ''; tCur = null; $('tVmsg').textContent = ''; renderTransporter(); };
    $('dCheck').onclick = deliveryCheck; $('dSlip').onchange = () => { $('dQR').value = ''; };
    $('vGo').onclick = publicVerify;
    const reset0 = { uid: store.uid, scenario: 'normal', step: V.checkin_step, updated: new Date().toISOString() };
    const stale = ctrl() && (ctrl().step >= V.n || !V.scenarios[ctrl().scenario]);
    if (store.mode === 'offline' && (!ctrl() || stale)) await store.setCtrl(reset0);
    if (store.mode === 'live' && store.isAdmin() && (!ctrl() || stale)) await store.setCtrl(reset0);
    renderFreshModel();
    renderKeyNote();
    renderDoorPreview();
    let r0 = 'farmer'; try { r0 = localStorage.getItem(ROLE_KEY) || 'farmer'; } catch (e) { /* ignore */ }
    const q = new URLSearchParams(location.search).get('role'); if (q) r0 = q;
    if (location.hash === '#buyer') r0 = 'transporter';
    setRole(['farmer', 'owner', 'transporter', 'buyer'].includes(r0) ? r0 : 'farmer');
    if (/^https?:$/.test(location.protocol)) {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const to = setTimeout(() => ctl && ctl.abort(), 1500);
      fetch('api/trust/info', ctl ? { signal: ctl.signal } : {}).then(r => r.ok ? r.json() : null).then(j => {
        clearTimeout(to); if (j && j.mode === 'server') { signMode = 'server'; renderKeyNote(); }
      }).catch(() => clearTimeout(to));
    }
    window.__tt = { store: () => store, advance, step, setTamper, clearTamper, editOld, play, settle: id => settle(blocksOf(id)) };
  }
  init();
})();
