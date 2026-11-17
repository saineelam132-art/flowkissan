// Runs the JS φ checker (web/trust/phi_core.js) on web/trust/data/phi_lab.js and prints φ for the golden cases.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..', '..');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'web/trust/data/phi_lab.js'), 'utf8'), ctx);
const L = ctx.window.PHI_LAB, PC = require(path.join(root, 'web/trust/phi_core.js'));
const gold = JSON.parse(fs.readFileSync(path.join(root, 'results/live/phi_golden.json'), 'utf8'));
const out = {};
for (const name of ['honest', 'out_minus_8']) {
  const R = {}; for (const k in L.readings) R[k] = L.readings[k].slice();
  if (name === 'out_minus_8') { const k0 = gold.out_minus_8.attack_step; R.T_out_s = R.T_out_s.map((v, i) => (i >= k0 && v !== null ? v - 8 : v)); }
  const X = PC.residuals(R, L.N, L.P, L.door_g), Sc = PC.score(X, L.cal, L.P, L.state);
  const o = { phi: Sc.phi, flag: Sc.flag };
  if (name === 'out_minus_8') {
    const k0 = gold.out_minus_8.attack_step; let kf = -1;
    for (let i = k0; i < Sc.flag.length; i++) if (Sc.flag[i]) { kf = i; break; }
    if (kf >= 0) { const iso = PC.isolate(R, X, Sc, L.cal, L.N, L.P, L.door_g, kf); o.first_flag = kf; o.fired = PC.whichFired(Sc, L.cal, kf); o.suspects = iso.suspects; }
  }
  out[name] = o;
}
process.stdout.write(JSON.stringify(out));
