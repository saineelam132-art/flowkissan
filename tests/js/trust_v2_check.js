// Runs the JS engine (phi_stream.js, freshness_v2.js) on web/trust/data/trust_v2.js and prints the golden cases + impact.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..', '..');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'web/trust/data/trust_v2.js'), 'utf8'), ctx);
const V = ctx.window.TRUST_V2, PS = require(path.join(root, 'web/trust/phi_stream.js')), FV = require(path.join(root, 'web/trust/freshness_v2.js'));
const gold = JSON.parse(fs.readFileSync(path.join(root, 'results/live/trust_v2_golden.json'), 'utf8'));
const E = PS.create(V), out = { cases: {}, trips: [] };
const H = E.analyse('normal', null);
out.honest = { phi: H.Sc.phi, flags_after_warmup: H.Sc.flag.slice(V.warmup_steps).filter(Boolean).length };
for (const [name, g] of Object.entries(gold)) {
  if (!g || !g.cfg) continue;
  const A = E.analyse('normal', g.cfg);
  const imp = E.impact(A, { crop: 'jasmine', kg: 100, base: 120, F0: 85 });
  const imp2 = E.impact(E.analyse('normal', JSON.parse(JSON.stringify(g.cfg))), { crop: 'jasmine', kg: 100, base: 120, F0: 85 });
  out.cases[name] = { phi: A.Sc.phi, first_flag: A.kf, fired: A.fired, suspects: A.iso ? A.iso.suspects : null, layers: A.layers,
    safe_green: A.safe ? A.safe.green : null, impact: { lost: imp.lost_pct, hidden: imp.hidden_pct, owner: imp.owner_gain_INR, farmer: imp.farmer_loss_INR, kWh: imp.kWh_saved },
    impact_repeat_same: JSON.stringify([imp.lost_pct, imp.owner_gain_INR]) === JSON.stringify([imp2.lost_pct, imp2.owner_gain_INR]) };
}
const W = FV.weatherFn(0, V.weather.T_out, V.weather.RH_out);
for (const t of gold.trips) out.trips.push(FV.trip(V.crops[t.crop], W, { pick_start: t.pick_start, pick_end: t.pick_end, checkin: t.checkin, distance_km: t.distance_km, mode: t.mode, packing: t.packing }, V.trip).F_door);
out.reject = FV.trip(V.crops.jasmine, W, { pick_start: 100, pick_end: 105, checkin: 104 }, V.trip);
process.stdout.write(JSON.stringify(out));
