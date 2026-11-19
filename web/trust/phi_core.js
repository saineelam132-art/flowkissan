// φ trust check – JavaScript port of twin/phi/{residuals,score,isolate,watermark}.py and the replay fingerprint.
// Same equations, same order, same special functions, so Python and JS give the same φ (checked by golden vectors,
// tests/test_phi_js.py, tolerance 0.01). Plain script (window.PhiCore) and Node module.
//   PhiCore.residuals(R, N, P, doorG)           -> {r, u, active, hard, R8d, f_ice, running}
//   PhiCore.score(X, cal, P, state)             -> {phi, phi_inst, phi_slow, phi_day, phi_max, chi2, m, S, e, flag, mu, sc, days, state}
//   PhiCore.isolate(R, X, Sc, cal, N, P, doorG, kFlag) -> {suspects, bias, confidence, reconstructed}
//   PhiCore.supplyZ(...), PhiCore.replayFingerprint(...)
// R is an object of equal-length arrays (one per column); NaN = missing reading.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhiCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NAMES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7T', 'R7W', 'R8', 'R9'];
  const K = NAMES.length;
  const OWNER = ['T_out_s', 'RH_out_s', 'P_el', 'T_mid', 'RH_mid', 'T_high', 'T_flower', 'T_ice', 'T_sup', 'T_ret', 'flow'];
  const COMMANDS = ['duty_room', 'v_ice', 'run_frac', 'fog_duty', 'nfan', 'defrost', 'kg', 'load_event', 'door', 'ATS'];
  const HV = 2501.0, CPA = 1.006;
  const fin = Number.isFinite;

  // ---------------------------------------------------------------- helpers (numpy semantics)
  const es = T => 6.112 * Math.exp(17.62 * T / (243.12 + T));
  function wOf(T, RH, p) { const e = RH / 100.0 * es(T); return 0.621945 * e / (p - e); }
  function interp(x, xs, ys) {
    if (Number.isNaN(x)) return NaN;
    if (x <= xs[0]) return ys[0];
    const n = xs.length;
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    return ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo]);
  }
  const clip = (x, a, b) => (Number.isNaN(x) ? NaN : Math.min(b, Math.max(a, x)));
  const nmax = (a, b) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.max(a, b));
  function copLookup(N, To0, Ts0) {
    if (!fin(To0) || !fin(Ts0)) return NaN;
    const a = N.cop, To = clip(To0, N.cop_To[0], N.cop_To[N.cop_To.length - 1]), Ts = clip(Ts0, N.cop_Ts[0], N.cop_Ts[N.cop_Ts.length - 1]);
    const xo = (To - N.cop_To[0]) / (N.cop_To[1] - N.cop_To[0]), xs = (Ts - N.cop_Ts[0]) / (N.cop_Ts[1] - N.cop_Ts[0]);
    const i0 = Math.min(Math.floor(xo), a.length - 2), j0 = Math.min(Math.floor(xs), a[0].length - 2);
    const fo = xo - i0, fs = xs - j0;
    return a[i0][j0] * (1 - fo) * (1 - fs) + a[i0 + 1][j0] * fo * (1 - fs) + a[i0][j0 + 1] * (1 - fo) * fs + a[i0 + 1][j0 + 1] * fo * fs;
  }
  const logResp = N => N._lr || (N._lr = N.resp_W_kg.map(Math.log));
  function respWkg(N, T) {
    if (Number.isNaN(T)) return NaN;
    const t = Math.min(N.resp_T[N.resp_T.length - 1], Math.max(N.resp_T[0], T));
    return Math.exp(interp(t, N.resp_T, logResp(N)));
  }
  function holdMask(ev, steps) {
    const m = new Array(ev.length).fill(false);
    for (let j = 0; j < ev.length; j++) if (ev[j]) for (let i = j; i < Math.min(ev.length, j + steps); i++) m[i] = true;
    return m;
  }
  const prev = x => { const y = x.slice(); for (let i = x.length - 1; i > 0; i--) y[i] = x[i - 1]; return y; };
  const num = v => (v === null || v === undefined ? NaN : +v);
  const col = (R, k) => R[k].map(num);
  const nz = x => (fin(x) ? Math.abs(x) : 0.0);

  // ---------------------------------------------------------------- residuals (twin/phi/residuals.py)
  function residuals(R, N, P, doorG) {
    const T = col(R, 'T_mid'), n = T.length, dt = N.dt_s;
    const Tp = prev(T), Tf = col(R, 'T_flower'), Tfp = prev(Tf), Ti = col(R, 'T_ice'), Tip = prev(Ti);
    const p = col(R, 'ps_api'), RHm = col(R, 'RH_mid'), To = col(R, 'T_out_api'), RHo = col(R, 'RH_out_api');
    const W = T.map((t, i) => wOf(t, RHm[i], p[i])), Wp = prev(W), Wo = To.map((t, i) => wOf(t, RHo[i], p[i]));
    const Tsup = col(R, 'T_sup'), Tret = col(R, 'T_ret'), flow = col(R, 'flow');
    const duty = col(R, 'duty_room'), run = col(R, 'run_frac'), vice = col(R, 'v_ice').map(v => v > 0.5);
    const fog = col(R, 'fog_duty'), nfan = col(R, 'nfan').map(v => v > 0.5), defr = col(R, 'defrost').map(v => v > 0.5), kg = col(R, 'kg');
    const door = col(R, 'door'), Pel = col(R, 'P_el'), Pinv = col(R, 'P_inv'), Tout = col(R, 'T_out_s'), RHout = col(R, 'RH_out_s');
    const That = col(R, 'T_high'), ATS = col(R, 'ATS'), loadEv = col(R, 'load_event'), disc = col(R, 'discom_kWh');
    const running = run.map(v => v > 1e-6);
    const mcp = N.mdot_kg_s * N.cp_g_kJ_kgK, Gc = N.G_coil_kW_K, G_cm = Gc / N.f_air / CPA, c = N.flower_cp;
    const U = P.model_uncertainty, st = N.strat;
    // flower bulk observer
    const Tb = new Array(n);
    let tb = fin(T[0]) ? T[0] : 4.0, kp = 0.0;
    for (let k = 0; k < n; k++) {
      const kk = fin(kg[k]) ? kg[k] : kp, tr = fin(Tp[k]) ? Tp[k] : tb;
      if (k) tb = tb + dt / N.tau_f_s * (tr - tb);
      if (kk > kp + 1e-9) tb = (tb * kp + (kk - kp) * (fin(To[k]) ? To[k] : tr)) / kk;
      kp = kk; Tb[k] = tb;
    }
    const Tbp = prev(Tb);
    const r = [], u = [], act = [], hardArr = [];
    const Q = { Q_ice: [], G_w: [], Q_coil_s: [], Q_coil_l: [], Q_g: [], loss: [], cond_ice: [], P_ch: [], cop_meas: [], carnot: [], aux: [] };
    const r1 = [], r2 = [], r3 = [], r4 = [], r6 = [], r7t = [], r7w = [], r8 = [], r9 = [], u1 = [], u2 = [], u3 = [], u6 = [];
    for (let k = 0; k < n; k++) {
      const Dt = clip(door[k] / dt, 0, 1), gd = doorG[k] * Dt;
      const Q_door = gd * (CPA + 1.86 * Wo[k]) * (To[k] - Tp[k]);
      const Q_wall = N.UA_kW_K * (To[k] - Tp[k]);
      const fanOn = running[k] && duty[k] > 0;
      const Q_int = N.light_kW * Dt + N.ctrl_kW + N.fan_kW * run[k] * (duty[k] > 0 ? 1 : 0) + N.fog_kW * fog[k] + N.nfan_kW * (nfan[k] ? 1 : 0) + N.fan_kW * (defr[k] ? 1 : 0);
      const hA = kg[k] * N.flower_cp / N.tau_f_s, Q_fl = hA * (Tbp[k] - Tp[k]);
      const dTw = Tp[k] - Tip[k];
      const G_w = interp(nmax(dTw, 0.0), N.G_ice_dT, N.G_ice_kW_K) * (nfan[k] ? 2.0 : 1.0);
      const Q_ice = Number.isNaN(dTw) ? NaN : (dTw > 0 ? G_w * dTw : N.G_ice_kW_K[1] * dTw);
      const q_s1 = nmax(0.0, Gc * (Tp[k] - Tsup[k]) / (1.0 + Gc / (2.0 * mcp)));
      const Q_coil_s = fanOn ? duty[k] * q_s1 : 0.0;
      const T_surf = Tp[k] - N.f_air * (Tp[k] - (Tsup[k] + q_s1 / (2 * mcp)));
      const cond_coil = fanOn ? duty[k] * G_cm * nmax(0.0, W[k] - wOf(T_surf, 100.0, p[k])) : 0.0;
      const Q_coil_l = cond_coil * HV, Q_fog = fog[k] * N.fog_kg_s * HV;
      r1.push(1000.0 * (N.C_a_kJ_K * (T[k] - Tp[k]) / dt - (Q_wall + Q_door + Q_int + Q_fl - Q_ice - Q_coil_s - Q_fog)));
      const v = fanOn ? N.v_on : N.v_off;
      const gt_kg = N.Kt * 3.6e-5 / 100.0 / 3600.0 * Math.sqrt(v) * N.liner * p[k] / 0.621945;
      const transp_kg = gt_kg * nmax(0.0, wOf(Tfp[k], 100.0, p[k]) - W[k]);
      const resp = respWkg(N, Tfp[k]);
      r2.push(c * 1000.0 * (Tf[k] - Tfp[k]) / dt - (c * 1000.0 / N.tau_f_s * (Tp[k] - Tfp[k]) + resp - transp_kg * HV * 1000.0));
      const Q_g = flow[k] * N.cp_g_kJ_kgK * (Tret[k] - Tsup[k]);
      const loss = running[k] ? N.pipe_UA_kW_K * nmax(0.0, To[k] - (Tsup[k] + 1.5)) + N.pump_kW : 0.0;
      r3.push(1000.0 * (Q_g - (Q_coil_s + Q_coil_l + loss)));
      const P_ch = Pel[k] - N.pump_kW * run[k];
      const cop = copLookup(N, To[k], Tsup[k]);
      r4.push(100.0 * (P_ch * cop - Q_g) / nmax(Q_g, 0.3));
      const cop_meas = P_ch > 0.05 ? Q_g / P_ch : NaN;
      const Te = Tsup[k] - N.approach_K + 273.15, Tc = To[k] + N.cond_approach_K + 273.15;
      const carnot = Te / nmax(Tc - Te, 1.0);
      const cond_ice = G_w / CPA * nmax(0.0, W[k] - wOf(Tip[k], 100.0, p[k]));
      const transp = kg[k] * transp_kg;
      r6.push(1e6 * (N.m_air_kg * (W[k] - Wp[k]) / dt - (gd * (Wo[k] - W[k]) + transp + fog[k] * N.fog_kg_s - cond_coil - cond_ice)));
      r7t.push(Tout[k] - To[k]);
      r7w.push(1000.0 * (wOf(Tout[k], RHout[k], p[k]) - Wo[k]));
      const aux = N.fan_kW * run[k] * (duty[k] > 0 ? 1 : 0) + N.fog_kW * fog[k] + N.nfan_kW * (nfan[k] ? 1 : 0) + N.fan_kW * (defr[k] ? 1 : 0);
      r8.push(100.0 * (Pinv[k] - (Pel[k] + aux)) / nmax(Pinv[k], 0.3));
      r9.push(That[k] - T[k] - ((duty[k] > 0 ? st.fan_on_K : st.fan_off_K) + st.per_K_outside * (To[k] - T[k])));
      u1.push(1000.0 * Math.sqrt((U.wall * nz(Q_wall)) ** 2 + (U.door * nz(Q_door)) ** 2 + (U.flowers * nz(Q_fl)) ** 2 + (U.ice * nz(Q_ice)) ** 2 + (U.coil * nz(Q_coil_s)) ** 2));
      u2.push(Math.sqrt((U.flowers * nz(c * 1000.0 / N.tau_f_s * (Tp[k] - Tfp[k]))) ** 2 + (U.respiration * nz(resp)) ** 2 + (U.transpiration * nz(transp_kg * HV * 1000.0)) ** 2));
      u3.push(1000.0 * Math.sqrt((U.coil * nz(Q_coil_s + Q_coil_l)) ** 2 + (U.pipe * nz(loss)) ** 2));
      u6.push(1e6 * Math.sqrt((U.door * nz(gd * (Wo[k] - W[k]))) ** 2 + (U.transpiration * nz(transp)) ** 2 + (U.coil * nz(cond_coil)) ** 2 + (U.ice * nz(cond_ice)) ** 2 + (U.fogger * nz(fog[k] * N.fog_kg_s)) ** 2));
      Q.Q_ice.push(Q_ice); Q.G_w.push(G_w); Q.Q_coil_s.push(Q_coil_s); Q.Q_coil_l.push(Q_coil_l); Q.Q_g.push(Q_g); Q.loss.push(loss);
      Q.cond_ice.push(cond_ice); Q.P_ch.push(P_ch); Q.cop_meas.push(cop_meas); Q.carnot.push(carnot); Q.aux.push(aux);
    }
    // ice observer (R5) and H3
    const L = N.L_ice, cps = N.cps_ice, cpl = N.cpl_ice, mi = N.m_ice_kg;
    const T_of = h => (h < 0 ? h / cps : (h > L ? (h - L) / cpl : 0.0)), h_of = t => (t < 0 ? cps * t : L + cpl * t);
    const gain = P.ice_observer.gain, band = P.ice_observer.plateau_K;
    let h = 0.0;
    const r5 = new Array(n), u5 = new Array(n), f_pred = new Array(n);
    for (let k = 0; k < n; k++) {
      const Qch = vice[k] && running[k] ? nmax(0.0, Q.Q_g[k] - Q.Q_coil_s[k] - Q.Q_coil_l[k] - Q.loss[k]) : 0.0;
      const dq = Q.Q_ice[k] + Q.cond_ice[k] * HV - Qch;
      if (fin(dq)) h = h + dq * dt / mi;
      h = Math.min(Math.max(h, cps * -10.0), L + cpl * 15.0);
      const tpred = T_of(h);
      f_pred[k] = 1.0 - Math.min(1.0, Math.max(0.0, h / L));
      const ok5 = fin(Ti[k]) && fin(Tip[k]) && Math.abs(Ti[k]) > band && Math.abs(Tip[k]) > band && k > 0;
      r5[k] = ok5 ? Ti[k] - tpred : NaN;
      u5[k] = ok5 && fin(dq) ? Math.abs(dq) * dt / mi / (tpred < 0 ? cps : cpl) : 0.0;
      if (fin(Ti[k]) && Math.abs(Ti[k]) > band) h = h + gain * (h_of(Ti[k]) - h);
    }
    // masks
    const mk = P.masking;
    const masked = holdMask(door.map(v => v > 0), Math.trunc(mk.after_door_min * 60 / dt) + 1).map((m, i, a) => m);
    const mLoad = holdMask(loadEv.map(v => v > 0.5), Math.trunc(mk.after_load_min * 60 / dt) + 1);
    for (let i = 0; i < n; i++) masked[i] = masked[i] || mLoad[i];
    const chg = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      const j = i ? i - 1 : 0;
      chg[i] = Math.abs(duty[i] - duty[j]) > 0.05 || Math.abs(fog[i] - fog[j]) > 0.05 || vice[i] !== vice[j] || nfan[i] !== nfan[j] || defr[i] !== defr[j] || running[i] !== running[j];
    }
    const ctl = holdMask(chg, Math.trunc(mk.after_control_steps) + 1);
    const start = running.map((v, i) => v && !(i ? running[i - 1] : running[0]));
    const after = holdMask(start, 24);
    const hr = P.hard_rules;
    let runLen = 0;
    for (let k = 0; k < n; k++) {
      const row = [r1[k], r2[k], r3[k], r4[k], r5[k], r6[k], r7t[k], r7w[k], r8[k], r9[k]];
      const a = row.map(fin);
      const kgp = k ? kg[k - 1] : kg[0];
      a[4] = a[4] && !ctl[k] && !defr[k];
      a[0] = a[0] && !masked[k] && !ctl[k];
      a[1] = a[1] && !masked[k] && kg[k] > 0 && kgp > 0;
      a[2] = a[2] && running[k] && !vice[k] && !defr[k] && flow[k] > 0.2 * N.mdot_kg_s * Math.max(run[k], 1e-9) && !after[k];
      a[3] = a[3] && running[k] && Q.P_ch[k] > 0.05 && flow[k] > 0;
      a[5] = a[5] && !masked[k] && !ctl[k];
      a[8] = a[8] && ATS[k] < 0.5 && running[k];
      if (k === 0) a.fill(false);
      r.push(row);
      u.push([u1[k], u2[k], u3[k], 0, U.ice * u5[k], u6[k], 0, 0, 0, 0]);
      act.push(a);
      const h1 = running[k] && Q.P_ch[k] > hr.min_chiller_kW && Q.cop_meas[k] > hr.carnot_frac * Q.carnot[k];
      const h2 = RHm[k] > 100.5 || (running[k] && duty[k] > 0 && Tsup[k] >= T[k]);
      const off = f_pred[k] > hr.ice_f_range[0] && f_pred[k] < hr.ice_f_range[1] && Math.abs(Ti[k]) > hr.ice_band_K;
      runLen = off ? (k ? runLen + 1 : 1) : 0;
      hardArr.push([!!h1, !!h2, runLen >= hr.ice_steps]);
    }
    const spd = Math.trunc(86400 / dt), nd = Math.floor(n / spd), R8d = [];
    for (let d = 0; d < nd; d++) {
      let own = 0, inv = 0;
      for (let i = d * spd; i < (d + 1) * spd; i++) { own += (fin(Pel[i]) ? Pel[i] : 0) + Q.aux[i]; inv += fin(Pinv[i]) ? Pinv[i] : 0; }
      R8d.push(disc[(d + 1) * spd - 1] - (own - inv) * dt / 3600.0);
    }
    return { r, u, active: act, hard: hardArr, R8d, f_ice: f_pred, running };
  }

  // ---------------------------------------------------------------- special functions (twin/phi/score.py)
  function lgamma(x) {                       // Lanczos (g = 7, n = 9); |error| < 1e-14 for x > 0
    const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = g[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += g[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function gser(a, x) {
    let s = 1.0 / a, term = s, ap = a;
    for (let i = 0; i < 500; i++) { ap += 1.0; term *= x / ap; s += term; if (Math.abs(term) < Math.abs(s) * 1e-14) break; }
    return s * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  function gcf(a, x) {
    const tiny = 1e-300;
    let b = x + 1.0 - a, c = 1.0 / tiny, d = 1.0 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2.0;
      d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1.0 / d; const de = d * c; h *= de;
      if (Math.abs(de - 1.0) < 1e-14) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  function chi2Sf(x, m) {
    if (x <= 0) return 1.0;
    const a = m / 2.0, y = x / 2.0;
    return y < a + 1.0 ? 1.0 - gser(a, y) : gcf(a, y);
  }
  function erfc(x) {                         // Numerical Recipes erfcc refined by series; |rel err| < 1.2e-7 then one Newton step corrects
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  function normIsf(q) {
    if (q <= 0) return 8.3;
    if (q >= 1) return -8.3;
    const p = 1.0 - q;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const lo = 0.02425;
    let z, t;
    if (q < lo) { t = Math.sqrt(-2 * Math.log(q)); z = -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
    else if (p < lo) { t = Math.sqrt(-2 * Math.log(p)); z = (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
    else { const u = p - 0.5; t = u * u; z = (((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * u / (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1); }
    if (Math.abs(z) >= 8.3) return z > 0 ? 8.3 : -8.3;
    const e = 0.5 * erfc(z / Math.SQRT2) - q;
    z = z + e * Math.sqrt(2 * Math.PI) * Math.exp(z * z / 2);
    return Math.min(8.3, Math.max(-8.3, z));
  }
  function sigmaEquiv(chi2, m) { if (m <= 0 || !fin(chi2)) return 0.0; return Math.max(0.0, normIsf(chi2Sf(chi2, m))); }

  // ---------------------------------------------------------------- linear algebra
  function inv(A) {                            // Gauss-Jordan with partial pivoting
    const n = A.length, M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c];
      for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map(r => r.slice(n));
  }
  function quad(v, Mi) { let s = 0; for (let i = 0; i < v.length; i++) { let t = 0; for (let j = 0; j < v.length; j++) t += Mi[i][j] * v[j]; s += v[i] * t; } return s; }
  function subInv(Sig, ids, cache) {
    const key = ids.join(',');
    if (!cache[key]) cache[key] = inv(ids.map(i => ids.map(j => Sig[i][j])));
    return cache[key];
  }
  function lstsq(A, y) {                       // normal equations with a tiny ridge (columns ≤ 3)
    const m = A[0] ? A[0].length : 0;
    const AtA = Array.from({ length: m }, () => new Array(m).fill(0)), Aty = new Array(m).fill(0);
    for (let i = 0; i < A.length; i++) for (let a = 0; a < m; a++) { Aty[a] += A[i][a] * y[i]; for (let b = 0; b < m; b++) AtA[a][b] += A[i][a] * A[i][b]; }
    const tr = AtA.reduce((s, r, i) => s + r[i], 0) / Math.max(m, 1);
    for (let a = 0; a < m; a++) AtA[a][a] += 1e-12 * tr + 1e-300;
    const Ai = inv(AtA);
    return Ai.map(r => r.reduce((s, v, j) => s + v * Aty[j], 0));
  }

  // ---------------------------------------------------------------- scoring (twin/phi/score.py → score)
  function copyState(st) { return Object.assign({}, st, { mu: st.mu.map(r => r.slice()), var: st.var.map(r => r.slice()), zprev: st.zprev.slice() }); }
  function initState(cal) {
    return { mu: cal.mu.map(r => r.slice()), var: cal.sd.map(r => r.map(v => v * v)), zprev: new Array(K).fill(null), S: 0.0, run: 0,
      phi_day: 0.0, day_r1: 0.0, day_own: 0.0, day_inv: 0.0, day_n: 0, day_clean: true, R10_mu: cal.R10.mu, R10_var: cal.R10.sd ** 2 };
  }
  function score(X, cal, P, state, spd) {
    spd = spd || 288;
    const C = P.calibration, st = state ? copyState(state) : initState(cal);
    const rho = cal.rho, esd = cal.esd, sdCal = cal.sd, muCal = cal.mu, Sig = cal.Sigma;
    const kappa = cal.cusum_kappa, hh = cal.cusum_h;
    const alpha = 1.0 / (C.adapt_days * spd), alphaD = 1.0 / C.adapt_days;
    const adaptMu = new Set(C.adapt_mean_residuals.map(x => NAMES.indexOf(x))), adaptSd = C.adapt_spread_residuals.map(x => NAMES.indexOf(x));
    const ex = new Set(C.cusum_exclude.map(x => NAMES.indexOf(x)));
    const [loSd, hiSd] = C.adapt_sd_range, muMax = C.adapt_mean_max_sd, clipC = C.cusum_clip;
    const thr = P.flag.phi, need = P.flag.steps;
    const { r, active: act, running, hard, u: U } = X;
    const n = r.length, cache = {};
    const o = { chi2: [], m: [], phi_inst: [], phi_max: [], S: [], inc: [], phi_slow: [], phi_day: [], phi: [], flag: [], e: [], mu: [], sc: [], days: [] };
    for (let k = 0; k < n; k++) {
      const g = running[k] ? 1 : 0;
      o.sc.push(Array.from({ length: K }, (_, j) => Math.sqrt(st.var[g][j] + (fin(U[k][j]) ? U[k][j] : 0) ** 2)));
      const ev = [], ids = [], erow = new Array(K).fill(NaN);
      for (let j = 0; j < K; j++) {
        if (!act[k][j]) { st.zprev[j] = null; continue; }
        const zj = (r[k][j] - st.mu[g][j]) / Math.sqrt(st.var[g][j] + U[k][j] ** 2);
        const zp = st.zprev[j];
        let ej = zp === null ? zj : (zj - rho[j] * zp) / Math.sqrt(1 - rho[j] ** 2);
        ej /= esd[j];
        st.zprev[j] = zj; ev.push(ej); ids.push(j); erow[j] = ej;
      }
      o.e.push(erow);
      const m = ids.length;
      let c2 = 0, pi = 0, pm = 0, inc = 0;
      if (m) {
        c2 = quad(ev, subInv(Sig, ids, cache));
        pi = sigmaEquiv(c2, m);
        pm = Math.max(...ev.map(Math.abs));
        const idc = [];
        ids.forEach((j, i) => { if (!ex.has(j)) idc.push(i); });
        if (idc.length) {
          const vc = idc.map(i => Math.min(clipC, Math.max(-clipC, ev[i])));
          inc = quad(vc, subInv(Sig, idc.map(i => ids[i]), cache)) - idc.length - kappa;
          st.S = Math.max(0.0, st.S + inc);
        }
      }
      o.chi2.push(c2); o.m.push(m); o.phi_inst.push(pi); o.phi_max.push(pm);
      o.S.push(st.S); o.inc.push(inc);
      const ps = 3.0 * st.S / hh;
      o.phi_slow.push(ps); o.phi_day.push(st.phi_day);
      const hk = hard[k][0] || hard[k][1] || hard[k][2];
      const phi = Math.max(pi, ps, st.phi_day, hk ? 99.0 : 0.0);
      o.phi.push(phi);
      st.run = phi >= thr ? st.run + 1 : 0;
      const fl = st.run >= need || hk;
      o.flag.push(fl);
      const clean = !fl;
      if (!clean) st.day_clean = false;
      if (clean) {
        for (const j of adaptSd) {
          if (!act[k][j]) continue;
          const sdc = sdCal[g][j];
          let d = r[k][j] - st.mu[g][j];
          d = Math.max(-4 * sdc, Math.min(4 * sdc, d));
          if (adaptMu.has(j)) st.mu[g][j] = Math.max(muCal[g][j] - muMax * sdc, Math.min(muCal[g][j] + muMax * sdc, st.mu[g][j] + alpha * d));
          st.var[g][j] = Math.max((loSd * sdc) ** 2, Math.min((hiSd * sdc) ** 2, st.var[g][j] + alpha * (d * d - U[k][j] ** 2 - st.var[g][j])));
        }
      }
      o.mu.push(st.mu[g].slice());
      if (fin(r[k][0])) st.day_r1 += (r[k][0] - st.mu[g][0]) * P.dt_s / 3.6e6;
      st.day_n += 1;
      if (st.day_n === spd) {
        const di = Math.floor((k + 1) / spd) - 1;
        const a = Math.abs(st.day_r1 - st.R10_mu) / Math.sqrt(st.R10_var);
        const r8d = di < X.R8d.length ? X.R8d[di] : NaN;
        const b = fin(r8d) ? Math.abs(r8d - cal.R8d.mu) / cal.R8d.sd : 0.0;
        o.days.push({ day: di, R10: st.day_r1, z_R10: a, R8d: r8d, z_R8d: b });
        if (st.day_clean && a < thr) {
          const dd = st.day_r1 - st.R10_mu;
          st.R10_mu += alphaD * dd;
          st.R10_var = Math.max((0.5 * cal.R10.sd) ** 2, Math.min((4 * cal.R10.sd) ** 2, st.R10_var + alphaD * (dd * dd - st.R10_var)));
        }
        st.phi_day = Math.max(a, b);
        st.day_r1 = 0.0; st.day_n = 0; st.day_clean = true;
      }
    }
    o.hard = hard; o.state = st;
    return o;
  }
  function whichFired(Sc, cal, k, spd) {
    spd = spd || 288;
    const hd = Sc.hard[k];
    if (hd[0] || hd[1] || hd[2]) return ['H1', 'H2', 'H3'][hd.indexOf(true)];
    const parts = { inst: Sc.phi_inst[k], slow: Sc.phi_slow[k], day: Sc.phi_day[k] };
    const top = Object.keys(parts).reduce((a, b) => (parts[b] > parts[a] ? b : a));
    if (top === 'day') { const d = Math.floor(k / spd) - 1; const x = Sc.days[d]; return x ? (x.z_R10 >= x.z_R8d ? 'R10' : 'R8d') : 'R10'; }
    if (top === 'slow') {
      const w = new Array(K).fill(0);
      for (let i = Math.max(0, k - 36); i <= k; i++) for (let j = 0; j < K; j++) { const v = Sc.e[i][j]; if (fin(v)) w[j] += Math.min(4, Math.max(-4, v)) ** 2; }
      w[6] = 0; w[7] = 0;
      return NAMES[w.indexOf(Math.max(...w))];
    }
    const ids = [], v = [];
    Sc.e[k].forEach((x, j) => { if (fin(x)) { ids.push(j); v.push(x); } });
    if (!ids.length) return '-';
    const Si = inv(ids.map(i => ids.map(j => cal.Sigma[i][j])));
    const sol = Si.map(r => r.reduce((s, x, j) => s + x * v[j], 0));
    const cc = v.map((x, i) => x * sol[i]);
    return NAMES[ids[cc.indexOf(Math.max(...cc))]];
  }

  // ---------------------------------------------------------------- isolation (twin/phi/isolate.py)
  const RELATIVE = new Set(['P_el', 'flow']);
  const DELTA = { P_el: 0.1, flow: 0.1, RH_mid: 2.0, RH_out_s: 2.0 };
  function sliceR(R, a, b) { const o = {}; for (const k in R) o[k] = R[k].slice(a, b); return o; }
  function shifted(R, s, b) { const o = Object.assign({}, R); o[s] = R[s].map(v => (RELATIVE.has(s) ? num(v) * (1 + b) : num(v) + b)); return o; }
  function isolate(R, X, Sc, cal, N, P, doorG, kFlag) {
    const I = P.isolation, Wn = I.window_steps, lead = 36, n = X.r.length;
    const k = Math.min(n - 1, kFlag + Wn), a0 = Math.max(0, kFlag - lead), a1 = k + 1;
    const Rs = sliceR(R, a0, a1), dg = doorG.slice(a0, a1);
    const ks = []; for (let i = kFlag + 1; i <= k; i++) ks.push(i);
    if (!ks.length) ks.push(kFlag);
    const r0 = ks[0] - a0;
    const base = residuals(Rs, N, P, dg).r;
    const J = {};
    for (const s of OWNER) { const d = DELTA[s] || 0.5; const rr = residuals(shifted(Rs, s, d), N, P, dg).r; J[s] = rr.map((row, i) => row.map((v, j) => { const x = (v - base[i][j]) / d; return fin(x) ? x : 0; })); }
    const wrow = cal.rho.map(p => Math.sqrt((1 - p) / (1 + p)));
    const z = i => X.r[i].map((v, j) => (v - Sc.mu[i][j]) / Sc.sc[i][j]);
    const pb = new Array(K).fill(0), pc = new Array(K).fill(0);
    for (let i = Math.max(0, kFlag - 48); i < Math.max(1, kFlag - 12); i++) { const zz = z(i); for (let j = 0; j < K; j++) if (X.active[i][j] && fin(zz[j])) { pb[j] += zz[j]; pc[j]++; } }
    const basez = pb.map((v, j) => (pc[j] ? v / pc[j] : 0));
    const yv = [], A = {}; OWNER.forEach(s => { A[s] = []; });
    ks.forEach(i => {
      const zz = z(i);
      for (let j = 0; j < K; j++) {
        const y = (zz[j] - basez[j]) * wrow[j];
        if (!(X.active[i][j] && fin(y))) continue;
        yv.push(y);
        OWNER.forEach(s => A[s].push(J[s][i - a0][j] / Sc.sc[i][j] * wrow[j]));
      }
    });
    const tot = yv.reduce((s, v) => s + v * v, 0);
    let best = { set: [], score: 0.0, glr: 0.0, bias: {}, left: tot };
    const useful = OWNER.filter(s => A[s].some(v => Math.abs(v) > 1e-6));
    const jumped = jumps(R, kFlag, P);
    const combos = [];
    for (let a = 0; a < useful.length; a++) {
      combos.push([useful[a]]);
      for (let b = a + 1; b < useful.length; b++) {
        combos.push([useful[a], useful[b]]);
        if (I.max_set >= 3) for (let c = b + 1; c < useful.length; c++) combos.push([useful[a], useful[b], useful[c]]);
      }
    }
    combos.sort((p, q) => p.length - q.length);
    for (const S of combos) {
      const M = yv.map((_, i) => S.map(s => A[s][i]));
      const b = lstsq(M, yv);
      let left = 0; yv.forEach((y, i) => { let f = 0; S.forEach((_, c) => { f += M[i][c] * b[c]; }); left += (y - f) ** 2; });
      const glr = tot - left, sc = glr - I.penalty * S.length + I.penalty * S.filter(x => jumped.has(x)).length;
      if (sc > best.score + 1e-9) best = { set: S.slice(), score: sc, glr, bias: Object.fromEntries(S.map((s, c) => [s, b[c]])), left };
    }
    const dof = yv.length;
    let conf = 'high';
    if (Sc.flag[kFlag]) conf = best.set.length && chi2Sf(best.left, Math.max(dof - best.set.length, 1)) > 1e-3 ? 'medium' : 'low';
    const rec = {};
    for (const s of best.set) { const v = num(R[s][k]); rec[s] = RELATIVE.has(s) ? v / (1 + best.bias[s]) : v - best.bias[s]; }
    return { k_flag: kFlag, k, suspects: best.set, bias: best.bias, glr: best.glr, confidence: conf, reconstructed: rec, rows: dof, jumped: [...jumped].sort() };
  }
  function median(a) { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  function jumps(R, kFlag, P) {                     // same as twin/phi/isolate.py → jumps
    const I = P.isolation, out = new Set();
    if (!I.jump_sensors) return out;                 // older exports (phi_lab.js) have no jump test
    for (const s of I.jump_sensors) {
      const x = R[s].map(num), a = Math.max(1, kFlag - I.jump_lookback_steps), b = kFlag + 1;
      const d = [];
      for (let i = Math.max(0, kFlag - 60) + 1; i < Math.max(1, kFlag - 12); i++) { const v = Math.abs(x[i] - x[i - 1]); if (fin(v)) d.push(v); }
      if (d.length < 10) continue;
      const typ = Math.max(1.4826 * median(d), P.sensors[s].quantum);
      let mx = -1;
      for (let i = a; i < b; i++) { const v = Math.abs(x[i] - x[i - 1]); if (fin(v) && v > mx) mx = v; }
      if (mx > I.jump_z * typ) out.add(s);
    }
    return out;
  }

  // ---------------------------------------------------------------- watermark + replay fingerprint
  function supplyZ(Tsup, running, vIce, d, minSteps, spd) {
    spd = spd || 288;
    const n = Tsup.length, out = [];
    for (let day = 0; day < Math.floor(n / spd); day++) {
      const xs = [], ds = [], md = [];
      for (let i = day * spd; i < (day + 1) * spd; i++) if (running[i] && fin(num(Tsup[i]))) { xs.push(num(Tsup[i])); ds.push(d[i]); md.push(vIce[i] > 0.5); }
      if (xs.length < minSteps) { out.push(NaN); continue; }
      for (const mv of [false, true]) {
        const idx = md.map((m, i) => (m === mv ? i : -1)).filter(i => i >= 0);
        if (!idx.length) continue;
        const mx = idx.reduce((s, i) => s + xs[i], 0) / idx.length, mdd = idx.reduce((s, i) => s + ds[i], 0) / idx.length;
        idx.forEach(i => { xs[i] -= mx; ds[i] -= mdd; });
      }
      const sx = Math.sqrt(xs.reduce((s, v) => s + v * v, 0) / xs.length), sd = Math.sqrt(ds.reduce((s, v) => s + v * v, 0) / ds.length);
      if (sx < 1e-9 || sd < 1e-9) { out.push(0.0); continue; }
      const mxx = xs.reduce((s, v) => s + v, 0) / xs.length, mdd = ds.reduce((s, v) => s + v, 0) / ds.length;
      let cxy = 0, cxx = 0, cyy = 0;
      xs.forEach((x, i) => { cxy += (x - mxx) * (ds[i] - mdd); cxx += (x - mxx) ** 2; cyy += (ds[i] - mdd) ** 2; });
      out.push(cxy / Math.sqrt(cxx * cyy) * Math.sqrt(xs.length));
    }
    return out;
  }
  function replayFingerprint(R, runSteps, spd) {
    spd = spd || 288; runSteps = runSteps || 12;
    const n = R.T_mid.length, out = new Array(n).fill(false);
    let run = 0;
    for (let i = 0; i < n; i++) {
      let same = i >= spd;
      if (same) for (const s of OWNER) { const a = num(R[s][i]), b = num(R[s][i - spd]); if (!(a === b || (Number.isNaN(a) && Number.isNaN(b)))) { same = false; break; } }
      run = same ? run + 1 : 0;
      out[i] = run >= runSteps;
    }
    return out;
  }

  return { NAMES, OWNER, COMMANDS, RELATIVE, residuals, score, whichFired, isolate, supplyZ, replayFingerprint, chi2Sf, normIsf, sigmaEquiv,
    initState, copyState, wOf, copLookup };
});
