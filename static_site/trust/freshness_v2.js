// Two-stage freshness – the same equations as twin/freshness_v2.py (golden-tested in tests/js/trust_v2_check.js).
// Stage A (trip, E): life used += k(T_flower)·Δt/SL_ref_h ; water points += 100·WL(T_air,RH,v)·Δt·water_factor/WL_max ;
//   F = 100·(1 − life used) − water points. T_flower = outside air + bag heating of the packing.
// Stage B (room, S): the same step every 5 minutes with T_core (or room air), room RH and the liner factor. F never goes up.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FreshV2 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DT_H = 5 / 60;
  function rateK(crop, T) {
    const f = crop.freshness, kT = Math.pow(crop.Q10, (Math.min(T, 60) - f.T_opt_C) / 10), ci = crop.chill_injury_below_C;
    const kC = ci !== undefined && ci !== null && T < ci ? 1 + f.chill_a_c_per_K2 * (ci - T) ** 2 : 1;
    return Math.max(kT, kC);
  }
  const shelfLifeH = (crop, T) => crop.freshness.SL_ref_h / rateK(crop, T);
  function wlRate(crop, T, RH, v) {
    const vpd = 6.112 * Math.exp(17.62 * T / (243.12 + T)) * (1 - Math.min(100, Math.max(0, RH)) / 100);
    return crop.freshness.K_t_mg_kg_s_MPa * 3.6e-5 * vpd * Math.sqrt(Math.max(v, 0));
  }
  class State {
    constructor(life = 0, water = 0) { this.life_used = life; this.water_pts = water; }
    get F() { return Math.max(0, 100 * (1 - this.life_used) - this.water_pts); }
    step(crop, Tf, Ta, RH, v, dt, wf) {
      this.life_used += rateK(crop, Tf) * dt / crop.freshness.SL_ref_h;
      this.water_pts += 100 * wlRate(crop, Ta, RH, v) * dt * wf / crop.freshness.WL_max_pct;
      return this.F;
    }
    static fromF(F) { return new State(1 - F / 100, 0); }
  }
  function weatherFn(t0h, T, RH) {
    return t => {
      const x = t - t0h, i = Math.max(0, Math.min(T.length - 2, Math.floor(x))), a = Math.min(1, Math.max(0, x - i));
      return [T[i] + a * (T[i + 1] - T[i]), RH[i] + a * (RH[i + 1] - RH[i])];
    };
  }
  // trip: o = {pick_start, pick_end, checkin (hours on the weather clock), distance_km | band, mode, packing, travel_h}
  function trip(crop, weather, o, TC) {
    const mode = o.mode || TC.default_mode, packing = o.packing || TC.default_packing;
    const dist = o.distance_km !== undefined && o.distance_km !== null ? o.distance_km : TC.distance_bands_km[o.band || TC.default_band];
    if (o.pick_end < o.pick_start) return { ok: false, error: 'Picking end is before picking start.' };
    if (o.pick_end > o.checkin + 1e-9) return { ok: false, error: 'Picking cannot end after the check-in time.' };
    const pk = TC.packing[packing], full = o.travel_h !== undefined && o.travel_h !== null ? o.travel_h : dist / TC.speeds_km_h[mode];
    const avail = o.checkin - o.pick_end, trav = Math.min(full, avail), fw = Math.min(TC.farm_wait_h, Math.max(0, avail - trav)), mw = Math.max(0, avail - trav - fw);
    const half = (o.pick_end - o.pick_start) / 2;
    const segs = [['Picking (average flower waits half the window)', o.pick_end - half, half], ['Waiting at the farm', o.pick_end, fw],
      ['Transport', o.pick_end + fw, trav], ['Waiting at the market / our gate', o.pick_end + fw + trav, mw]];
    const st = new State(), out = [];
    for (const [name, t0, dur] of segs) {
      const n = dur > 0 ? Math.max(1, Math.ceil(dur / DT_H - 1e-9)) : 0, F0 = st.F, Ts = [];
      for (let i = 0; i < n; i++) {
        const dt = Math.min(DT_H, dur - i * DT_H);
        const [Ta, RH] = weather(n === 1 ? t0 + (i + 0.5) * dt : t0 + i * DT_H + dt / 2);
        const Tf = Ta + pk.bag_heating_K;
        st.step(crop, Tf, Ta, RH, TC.air_speed_m_s, dt, pk.water_factor);
        Ts.push(Tf);
      }
      out.push({ stage: name, hours: dur, T_flower_C: Ts.length ? Ts.reduce((a, b) => a + b, 0) / Ts.length : null, loss_pct: F0 - st.F });
    }
    return { ok: true, F_door: st.F, life_used: st.life_used, water_pts: st.water_pts, stages: out, travel_h: trav, travel_full_h: full,
      travel_cut: trav < full - 1e-9, distance_km: dist, mode, packing };
  }
  // the same trip with every packing (for "Perforated bag: 80 % · Gunny bag would be 74 %")
  function allPackings(crop, weather, o, TC) {
    const r = {};
    for (const k of Object.keys(TC.packing)) { const x = trip(crop, weather, Object.assign({}, o, { packing: k }), TC); if (x.ok) r[k] = x.F_door; }
    return r;
  }
  return { rateK, shelfLifeH, wlRate, State, weatherFn, trip, allPackings, DT_H };
});
