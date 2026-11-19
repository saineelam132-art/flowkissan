// KoolKisaan Trust & Trade – shared maths (plain script, also loads in Node for the parity tests).
// SAME rules as engine/trust_ledger.py (blocks, hashes, HMAC, anchors), engine/physics_check.py (Φ)
// and engine/shelf_life.py (freshness). If you change one side, change the other and run the tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TrustCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ---------------------------------------------------------------- SHA-256 + HMAC (works offline, over http, on phones)
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const utf8 = s => new TextEncoder().encode(s);
  const toHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  function sha256Bytes(msg) {
    const len = msg.length, n = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(n); buf.set(msg); buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(n - 4, (len * 8) >>> 0); dv.setUint32(n - 8, Math.floor(len * 8 / 2 ** 32));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64), rotr = (x, r) => (x >>> r) | (x << (32 - r));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
    return out;
  }
  const sha256 = s => toHex(sha256Bytes(utf8(s)));
  function hmacHex(key, msg) {
    let k = utf8(key);
    if (k.length > 64) k = sha256Bytes(k);
    const kp = new Uint8Array(64); kp.set(k);
    const ip = kp.map(x => x ^ 0x36), op = kp.map(x => x ^ 0x5c), m = utf8(msg);
    const inner = new Uint8Array(64 + m.length); inner.set(ip); inner.set(m, 64);
    const ih = sha256Bytes(inner), outer = new Uint8Array(96); outer.set(op); outer.set(ih, 64);
    return toHex(sha256Bytes(outer));
  }
  function safeEqual(a, b) {                       // constant-time compare of two hex strings
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  // ---------------------------------------------------------------- blocks (same as engine/trust_ledger.py)
  const GENESIS_PREV = '0'.repeat(64);
  const TYPES = ['CHECKIN', 'READING', 'HANDOVER_OUT', 'TRANSIT', 'HANDOVER_IN', 'SALE', 'CHECKOUT', 'VOID', 'FLAG', 'REVIEW'];
  const ACTORS = ['farmer', 'owner', 'transporter', 'buyer', 'system'];
  function norm(x) {                                // numbers: 4 decimals; whole numbers as integers
    if (x === null || x === undefined) return null;
    if (typeof x === 'number') { if (!isFinite(x)) return null; const v = Math.round(x * 1e4) / 1e4; return v === 0 ? 0 : v; }
    if (typeof x === 'string' || typeof x === 'boolean') return x;
    if (Array.isArray(x)) return x.map(norm);
    const o = {}; for (const k of Object.keys(x)) o[k] = norm(x[k]); return o;
  }
  function canonical(x) {
    x = norm(x);
    if (x === null || typeof x !== 'object') return JSON.stringify(x);
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  }
  const blockString = b => [b.index, b.ts, b.slipId, b.type, b.actor, canonical(b.payload),
    canonical(b.physics || { phi: 0, flags: [] }), b.prevHash].join('|');
  const blockHash = b => sha256(blockString(b));
  function makeBlock(chain, slipId, ts, type, actor, payload, physics) {
    if (!TYPES.includes(type) || !ACTORS.includes(actor)) throw new Error('bad block type/actor');
    const prev = chain.length ? chain[chain.length - 1].hash : GENESIS_PREV;
    const b = { index: chain.length, ts, slipId, type, actor,
      payload: norm(payload), physics: norm(physics || { phi: 0, flags: [] }), prevHash: prev };
    b.hash = blockHash(b);
    return b;
  }
  const signMsg = (slipId, bay, gen) => `${slipId}|${bay}|${gen}`;
  const sign = (key, slipId, bay, gen) => hmacHex(key, signMsg(slipId, bay, gen));
  const verifySig = (key, qr) => safeEqual(sign(key, qr.slipId, qr.bay, qr.genesisHash), qr.sig);
  const CUSTODY = { CHECKIN: 'owner', READING: 'owner', HANDOVER_OUT: 'transporter', TRANSIT: 'transporter', HANDOVER_IN: 'buyer', SALE: 'buyer',
    CHECKOUT: 'owner', VOID: 'owner', FLAG: 'owner', REVIEW: 'owner' };
  function verifyChain(blocks, intervalS = 300) {
    let firstBad = null, why = null;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (blockHash(b) !== b.hash) { firstBad = i; why = 'data changed (hash does not match)'; break; }
      if (b.prevHash !== (i ? blocks[i - 1].hash : GENESIS_PREV)) { firstBad = i; why = 'link broken (prevHash does not match)'; break; }
    }
    const reads = blocks.filter(b => b.type === 'READING'), gaps = [];
    for (let i = 1; i < reads.length; i++) {
      const dt = (Date.parse(reads[i].ts) - Date.parse(reads[i - 1].ts)) / 1000;
      if (Math.abs(dt - intervalS) > 1) gaps.push({ after: reads[i - 1].index, seconds: dt });
    }
    let custody = null;
    if (firstBad !== null) { custody = 'farmer'; for (const b of blocks.slice(0, firstBad + 1)) custody = CUSTODY[b.type] || custody; }
    const flags = [];
    for (const b of blocks) for (const f of ((b.physics || {}).flags || [])) flags.push(f);
    return { valid: firstBad === null, first_bad: firstBad, why, custody_at_break: custody, gaps, physics_flags: flags };
  }
  function dayHeads(blocks) { const h = {}; for (const b of blocks) h[b.ts.slice(0, 10)] = b.hash; return h; }
  function dailyAnchor(day, headsBySlip) {
    return sha256(day + '|' + Object.keys(headsBySlip).sort().map(k => `${k}:${headsBySlip[k]}`).join(';'));
  }

  // The old 4-check Φ and the old one-step freshness lived here (see git history). The site now uses one Φ (phi_core.js,
  // same as twin/phi/score.py) and two-stage freshness (freshness_v2.js, same as twin/freshness_v2.py).
  const price = (base, F) => base * F / 100;

  return { sha256, sha256Bytes, hmacHex, safeEqual, norm, canonical, blockString, blockHash, makeBlock, sign, verifySig,
    verifyChain, dayHeads, dailyAnchor, GENESIS_PREV, TYPES, ACTORS, CUSTODY, price };
});
