// One engine for the whole Trust & Trade page: reported readings (with a demo attack applied), φ every 5 minutes,
// FLAG, isolation (GLR), Safe Mode with trusted values and φ(trusted), the four detection layers, and the impact of the
// attack on the flowers and on money. Uses window.TRUST_V2 (twin data, S), PhiCore (φ, same as Python) and FreshV2.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./phi_core.js'), require('./freshness_v2.js'));
  else root.PhiStream = factory(root.PhiCore, root.FreshV2);
})(typeof self !== 'undefined' ? self : this, function (PC, FV) {
  'use strict';
  const SPD = 288, fin = Number.isFinite, num = v => (v === null || v === undefined ? NaN : +v);
  const SENSORS = { T_out_s: 'Outside temperature', T_mid: 'Room temperature', T_flower: 'Flower core temperature', T_sup: 'Glycol supply',
    T_ret: 'Glycol return', P_el: 'Chiller power', T_ice: 'Ice panel temperature' };
  const KINDS = { offset: 'Offset (adds a constant)', freeze: 'Freeze (repeats the value at the start)', drift: 'Slow drift (per hour)',
    replay: 'Replay yesterday (all sensors)', edit: 'Edit an old stored reading (ledger)' };
  const EXTERNAL = ['R7T', 'R7W', 'R8', 'R8d'];

  function create(V) {
    const cache = {};
    const N = V.N, P = V.P, cal = V.cal, n = V.n, dt = V.dt_s;
    const clone = R => { const o = {}; for (const k of Object.keys(R)) if (Array.isArray(R[k])) o[k] = R[k].slice(); return o; };
    function applyTamper(S, c) {
      const R = clone(S);
      if (!c || c.kind === 'edit') return R;
      const k0 = c.start, k1 = Math.min(n, c.end);
      if (c.kind === 'replay') {
        for (const s of PC.OWNER.concat(PC.COMMANDS)) for (let i = k0; i < k1; i++) R[s][i] = S[s][i - SPD];
        return R;
      }
      for (const s of c.sensors) {
        const rel = PC.RELATIVE.has(s), v0 = num(S[s][k0]);
        for (let i = k0; i < k1; i++) {
          const v = num(S[s][i]), hrs = (i - k0) * dt / 3600;
          if (c.kind === 'offset') R[s][i] = rel ? v * (1 + c.size / 100) : v + c.size;
          else if (c.kind === 'freeze') R[s][i] = v0;
          else if (c.kind === 'drift') R[s][i] = rel ? v * (1 + c.size / 100 * hrs) : Math.round((v + c.size * hrs) * 10) / 10;
        }
      }
      return R;
    }
    const attackedOf = c => (!c || c.kind === 'edit' ? [] : c.kind === 'replay' ? PC.OWNER.slice() : c.sensors.slice());

    function analyse(scKey, c) {
      const key = scKey + '|' + JSON.stringify(c || null);
      if (cache[key]) return cache[key];
      const S = V.scenarios[scKey], R = applyTamper(S, c);
      const X = PC.residuals(R, N, P, V.door_g), Sc = PC.score(X, cal, P, V.state);
      const A = { scKey, cfg: c, R, truth: S.truth, X, Sc, attacked: attackedOf(c), layers: {}, flagStarts: [] };
      for (let i = 1; i < n; i++) if (Sc.flag[i] && !Sc.flag[i - 1]) A.flagStarts.push(i);
      if (c && c.kind !== 'edit') {
        A.k0 = c.start; A.k1 = Math.min(n, c.end);
        const kf = A.flagStarts.find(i => i >= A.k0);
        if (kf !== undefined) {
          A.kf = kf; A.fired = PC.whichFired(Sc, cal, kf);
          A.layers[EXTERNAL.includes(A.fired) ? 'external' : 'physics'] = kf;
          A.iso = PC.isolate(R, X, Sc, cal, N, P, V.door_g, kf);
        }
        const run = R.run_frac.map(v => num(v) > 0);
        const z = PC.supplyZ(R.T_sup, run, R.v_ice.map(num), S.dither_sup, P.watermark.supply_min_steps, SPD);
        for (let d = 0; d < z.length; d++) {
          const end = (d + 1) * SPD;
          if (end <= A.k0) continue;
          if (fin(z[d]) && z[d] < P.watermark.supply_z_flag) { A.layers.watermark = end - 1; break; }
        }
        const fp = PC.replayFingerprint(R, 12, SPD);
        for (let i = A.k0; i < n; i++) if (fp[i]) { A.layers.hash = i; break; }
        const ks = Object.values(A.layers);
        A.caught = ks.length ? Math.min(...ks) : -1;
        if (A.iso && A.iso.suspects.length) {
          // Safe Mode: from the end of the isolation hour (kq) the suspects are quarantined and replaced by trusted values,
          // until the owner checks the sensor and releases it (the demo releases it when the attack window ends).
          const Rt = clone(R), kq = A.iso.k, kr = Math.max(kq, A.k1), st = N.strat;
          for (const s of A.iso.suspects) {
            const b = A.iso.bias[s];
            for (let i = kq; i < kr; i++) {
              if (s === 'T_out_s') Rt[s][i] = R.T_out_api[i];
              else if (s === 'RH_out_s') Rt[s][i] = R.RH_out_api[i];
              else if (s === 'T_mid' && !A.iso.suspects.includes('T_high') && fin(num(R.T_high[i]))) {   // physics: high probe − stratification
                const s0 = num(R.duty_room[i]) > 0 ? st.fan_on_K : st.fan_off_K;
                Rt[s][i] = (num(R.T_high[i]) - s0 - st.per_K_outside * num(R.T_out_api[i])) / (1 - st.per_K_outside);
              } else Rt[s][i] = PC.RELATIVE.has(s) ? num(R[s][i]) / (1 + b) : num(R[s][i]) - b;
            }
          }
          const St = PC.score(PC.residuals(Rt, N, P, V.door_g), cal, P, V.state);
          // Φ(trusted): the node starts a fresh slow memory (CUSUM) at the quarantine, so the old lie does not count twice
          const tphi = St.phi.slice();
          let S2 = 0;
          for (let i = kq; i < n; i++) {
            S2 = Math.max(0, S2 + St.inc[i]);
            const hk = St.hard[i][0] || St.hard[i][1] || St.hard[i][2];
            tphi[i] = Math.max(St.phi_inst[i], 3 * S2 / cal.cusum_h, hk ? 99 : 0);
          }
          St.phi_trusted = tphi;
          let green = -1;
          for (let i = kq; i < n; i++) if (tphi[i] < 2) { green = i; break; }
          A.safe = { k: kq, release: kr, Rt, Sc: St, sensors: A.iso.suspects.slice(), green, confidence: A.iso.confidence };
        }
      }
      cache[key] = A;
      return A;
    }

    // impact of the attack window on one batch (S for the twin values, E for the control response and prices)
    function impact(A, batch, noSafe) {
      const c = A.cfg;
      if (!c || c.kind === 'edit') return null;
      const crop = V.crops[batch.crop] || V.crops[V.demo.default_crop], tf = N.tau_f_s / 3600, tc = V.demo.control_tau_h;
      const k0 = A.k0, k1 = A.k1, kEnd = Math.min(n - 1, k1 + 36), dh = dt / 3600;
      const roomFaked = A.attacked.includes('T_mid'), coreFaked = A.attacked.includes('T_flower');
      const kq = !noSafe && A.safe && A.safe.sensors.includes('T_mid') ? A.safe.k : k1;
      const T = A.truth;
      let d = 0, dc = 0, kWh = 0;
      const Fh = FV.State.fromF(batch.F0), Fr = FV.State.fromF(batch.F0), Fp = FV.State.fromF(batch.F0), lf = V.liner_factor;
      const series = [];
      for (let i = k0; i <= kEnd; i++) {
        const e = roomFaked && i < k1 ? num(A.R.T_mid[i]) - T.T_mid[i] : 0;
        const target = i < Math.min(k1, kq) ? -e : 0;
        d += (target - d) * (1 - Math.exp(-dh / tc));
        dc += (d - dc) * (1 - Math.exp(-dh / tf));
        const cop = PC.copLookup(N, num(A.R.T_out_api[i]), 0);
        if (d > 0 && fin(cop) && cop > 0) kWh += N.UA_kW_K * d * dh / cop;
        const RH = fin(num(V.scenarios[A.scKey].RH_mid[i])) ? num(V.scenarios[A.scKey].RH_mid[i]) : 90;
        const Tair = T.T_room[i], v = num(A.R.duty_room[i]) > 0 ? V.fan_on_v : V.fan_off_v;
        const coreTrue = T.T_flower[i], coreReal = coreTrue + dc;
        const coreRep = coreFaked && i < k1 ? coreReal + (num(A.R.T_flower[i]) - T.T_flower[i]) : coreReal;
        Fh.step(crop, coreTrue, Tair, RH, v, dh, lf);
        Fr.step(crop, coreReal, Tair + d, RH, v, dh, lf);
        Fp.step(crop, coreRep, Tair + d, RH, v, dh, lf);
        series.push({ i, room_true: Tair + d, room_rep: num(A.R.T_mid[i]), core_real: coreReal, core_rep: coreRep, F_real: Fr.F, F_rep: Fp.F, F_honest: Fh.F });
      }
      const lost = Math.max(0, Fh.F - Fr.F), hidden = Math.max(0, Fp.F - Fr.F);
      const elec = kWh * V.tariff_INR_kWh, comp = batch.kg * batch.base * hidden / 100;
      return { k0, k1, kEnd, crop: batch.crop, kg: batch.kg, base: batch.base, demo: !!batch.demo, F_honest: Fh.F, F_real: Fr.F, F_rep: Fp.F,
        lost_pct: lost, hidden_pct: hidden, kWh_saved: kWh, elec_INR: elec, compensation_avoided_INR: comp, owner_gain_INR: elec + comp,
        farmer_loss_INR: batch.kg * batch.base * lost / 100, room_max_shift_K: Math.max(0, ...series.map(s => s.room_true - T.T_room[s.i])),
        control_affected: roomFaked, quarantined_at: kq < k1 ? kq : null, series, without: noSafe ? null : impact(A, batch, true) };
    }
    return { analyse, impact, applyTamper, SENSORS, KINDS, n, V };
  }
  return { create, SENSORS, KINDS };
});
