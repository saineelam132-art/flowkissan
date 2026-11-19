# Trust & Trade v2 – Step 0: what the code does today, and the plan

Read: `web/trust.html`, `web/trust/trust.js`, `trust_core.js`, `detector.js`, `phi_core.js`, `phi_monitor.js`,
`data/crops.json`, `twin/phi/*`, `twin/trust_nodes.py`. Nothing below is measured; the page runs on twin data (S).

## (a) How freshness is computed now

* Model (`trust_core.js` → `Freshness`, a copy of `engine/shelf_life.py` / `engine/flowers.py`):
  * rate k(T) = max( Q10^((T − T_opt)/10), 1 + a_c·(T_chill − T)² below the chilling limit )
  * life used += k(T_core) · Δt / SL_ref_h          (T_opt = 4 °C, SL_ref_h = 432 h for jasmine, 450 h marigold; Q10 3.2 / 2.17)
  * F = 100 % · (1 − life used). For flowers there is **no separate water-loss term** (they are in PE bags; the bagged
    shelf life already includes it). Freezing for > 30 min caps F at 20 %.
* **Where "100 % at check-in" comes from:** `settle()` (trust.js) starts every chain at F = 100 %, then applies ONE farm step:
  `harvest_h` hours (form field "Harvested how many hours before check-in?", default `trust.harvest_to_checkin_h_default` = 2 h)
  at the **outside temperature of the check-in reading** (`T_field_C`). So the check-in value is already a little below 100 %
  (jasmine ≈ 85–90 % on a warm day), but it is a single constant-temperature step with no picking window, no distance,
  no transport mode and no packing. The owner bays, the slip and the farmer's "My produce now" show this `F_checkin`; the
  "who is responsible" table charges `100 − F_checkin` to the farm leg.
* After check-in every READING block (5 min) steps F with the reported room air (N4) and **core probe (N2)**; HANDOVER_OUT /
  TRANSIT / HANDOVER_IN steps use the vehicle box model (insulated box warming toward outside air, τ = 4 h, E).
* Price = base × F / 100 (`T.price`), at delivery (HANDOVER_IN) or now.

## (b) What the owner "Ledger" and "Daily anchors" panels show now

* **Ledger (read-only)**: a select for one slip, then a table of the last 40 blocks, newest first: `# · time · type · actor ·
  data summary · Φ · hash (12 chars)`. Above it: "N blocks · chain valid / BROKEN at block #N". Rows after a break are red,
  rows with a physics flag are yellow. **Not shown:** prev-hash, the link between blocks, any picture of the chain.
* Block types today: GENESIS/CHECKIN, READING, FLAG, REVIEW, CHECKOUT, VOID, HANDOVER_OUT, TRANSIT, HANDOVER_IN, SALE.
  Hash = SHA-256 of the canonical block string, which includes `prevHash` (`trust_core.js → blockString / blockHash`).
* **Daily anchors**: one row per UTC day – day, first 32 chars of the anchor (SHA-256 of all slips' last block hash of that
  day), number of slips, publish time. Published when the twin clock passes midnight UTC (05:30 IST). The anchor is printed
  on NEW slips. The buyer view (now: the transporter's Delivery check) checks each slip's day heads against the anchors.

## (c) What "Demo: tamper a sensor" does now (owner view)

* Sensors (old 4-node twin, `detector.js`): room air (N1+N4), produce core (N2), door (N3), outside T, humidity (N4).
* Actions: **freeze** at 4 °C (door: always closed, humidity: stuck), **offset −5 °C** (humidity −5 %RH), **stop sending**,
  **edit an old stored reading** (the hottest past READING's room air → 5.0 °C; in live mode Firestore refuses, so the demo
  overlays the edit on what is read → the chain check shows "BROKEN at block #N").
* Tampering starts at the next step and lasts until "Stop tampering" (no end time, no window). The clock must run.
* Detection (`TamperDetector`, every reading): old Φ ≥ 3 for 3 readings; gap (2 missing readings); outside sensor vs weather
  service > 4 K for 3 readings; stuck value 6 times; humidity pair with the fan off > 3.5 %RH; plus a hash re-check.
  A detection writes an alert (alert.html) and a FLAG block into every active slip; buyer payment goes ON HOLD / FROZEN.
* There is **no** safe mode, no isolation, no impact (₹ / freshness) and no "re-hash + anchor" demo in this panel today.
  The newer Live Trust Monitor + Tamper lab (phi_monitor.js) has isolation and Safe Mode but runs on its own 7-day window,
  not on the slips' ledger.

## (d) The exact Φ formulas as coded – there are TWO

1. **Old Φ (trust.js / detector.js / trust_core.js `phiFrom`, the one written into every READING block and the slips)**
   * residuals r1 moisture (supply vs return humidity ratio), r2 energy (air-side cooling − COP·(P_el − P_fan) + ice branch),
     r3 room heat balance, r4 core-probe lag; each a trailing mean over `window_steps` readings
   * z_k = r̄_k / σ_k (σ tuned on the twin year), z1 = 10 if RH > 100.5 %
   * **Φ = √( Σ w_k z_k² / Σ w_k )**, w = weights, w = 0 for r1, r2 while the coil is off
   * flag when Φ ≥ 3 for 3 readings; Φ = 0 on loading steps. No memory, no χ², no CUSUM.
2. **New Φ (phi_core.js = twin/phi/score.py, used by the Live Trust Monitor, golden-tested against Python)**
   * e_j = ((r_j − μ_j)/√(σ_j² + u_j²) − ρ_j·z_{j,k−1}) / √(1 − ρ_j²) / esd_j   (AR(1) whitening; no whitening for R7T)
   * χ²_k = eᵀ Σ⁻¹ e over the m active residuals
   * Φ_inst = Φ_N⁻¹( F_χ²(m)(χ²_k) ), capped at 8.3
   * S_k = max(0, S_{k−1} + χ²_c,k − m_c − κ), χ²_c uses e clipped to ±4 and leaves out R7T, R7W; Φ_slow = 3·S_k / h
   * Φ_day = max(|R10 − μ|/σ, |R8d − μ|/σ) of yesterday, held all day
   * **Φ = max(Φ_inst, Φ_slow, Φ_day, 99 if a hard rule breaks)**; FLAG if Φ ≥ 3 for 3 readings in a row, or any hard rule.

   Your Feature 5 formula matches #2 except: z uses √(σ² + u²) (model-uncertainty spread) and AR(1) whitening, and the CUSUM
   uses the clipped χ² without the two weather residuals. The card will show the code's version.

## Plan (after your go-ahead)

* **Unify on the new Φ.** The slips' READING blocks and the owner view will use phi_core.js on the twin's 11-sensor stream
  (the same stream as the Live Trust Monitor), so the gauge, the ledger and the tamper demo show one Φ.
  The old 4-node stream stays only for the node cards ("Inside nodes now").
* F1 two-stage freshness: new `twin/trip_freshness.py` + the same in `trust_core.js` (one formula, golden tests);
  travel time from a `TravelTime` function (distance band ÷ mode speed now; a Distance-Matrix value can be passed in later).
* F2 roles: Farmer · Cold-room owner · Transporter; the transporter's Deliver step gets the "Delivery check" (5 checks,
  verdict, price, settlement); a small public "Verify a crate QR" box; `#buyer` / `?role=buyer` links open the transporter view.
* F3 visible hash-chain ledger cards + chain badge + daily anchor row on the receipt.
* F4 demo tampering with start/end window, edge-node safe mode, impact card (true vs reported freshness, ₹ owner vs farmer).
* F5 formula card next to the gauge with live χ², m, Φ_inst, S_k, Φ and hover-highlight of residual bars.

## Decision taken (option 2) and what was built

* Bag heating depends on the packing (E, `config/trust_v2.json`): open basket in shade +0 K, perforated bag +1 K, crate with wet cloth +1 K,
  closed gunny bag +3 K; demo default = perforated bag. `data/crops.json` unchanged. Typical ~32 °C trip (15 Mar 2026, 25 km by motorbike,
  picking 05:00–07:00, check-in 09:30): jasmine perforated bag ≈ 79.8 %, gunny bag ≈ 73.6 %, marigold perforated ≈ 92.3 % (tests/test_freshness_v2.py).
* One Φ everywhere (the coded version above, #2). The old 4-check Φ is only in the git history (detector.js and the old functions in trust_core.js were removed).
* Code: `twin/freshness_v2.py` ↔ `web/trust/freshness_v2.js`; `twin/trust_v2.py` → `web/trust/data/trust_v2.js` + `results/live/trust_v2_golden.json`;
  `web/trust/phi_stream.js` (reported stream, φ, FLAG, isolation, Safe Mode, impact); `trust.js` (roles, ledger, slips); `phi_monitor.js` (monitor, formula card,
  demo tampering). Tests: `tests/test_freshness_v2.py`, `tests/test_trust_v2.py` (+ `tests/js/trust_v2_check.js`).
* Roles: Farmer · Cold-room owner · Transporter & delivery. `?role=buyer` and `#buyer` open the transporter view (its Delivery check holds the old buyer checks).
* Isolation got a "jump test" (a faked reading usually starts with a step no real room can make); see `config/phi.json → isolation`.

## ⚠ The number that had to be decided (kept for the record)

Your test target "honest typical jasmine trip (25 km, bike, 45 min, 1 h wait, ~32 °C) → F_door ≈ 84–88 %" does **not** follow
from our jasmine data with +3 K bag heating:

| Jasmine, typical trip (pick 2 h window → avg 1 h at 28 °C, 0.5 h farm wait 30 °C, 1 h bike 32 °C, 1 h market wait 32 °C) | F_door |
|---|---|
| with +3 K bag heating (as specified) | **≈ 74 %** |
| no bag heating | ≈ 82 % |
| marigold, +3 K | ≈ 92 % |

Jasmine's ambient shelf life in `data/crops.json` is 21 h (E, research range 12–30 h), so 3–4 h at 31–35 °C uses about a
quarter of it. Options: (1) keep the data and change the test band to ≈ 70–78 %; (2) use +1 K bag heating for perforated
bags/wet-cloth crates and +3 K only for closed gunny bags (gives ≈ 80 % for a perforated bag); (3) raise jasmine's ambient
shelf life toward the upper end of the research range (30 h → ≈ 85 %). My suggestion: **(2)** – packing-dependent bag
heating (E) – and set the test to the value the data gives, stated with its inputs.
