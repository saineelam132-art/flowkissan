# The trust score φ (Φ) as it is coded today

This is an honest description of the CURRENT physics check, written before any changes.
Code: `engine/physics_check.py` (Python), `web/trust/trust_core.js` (same maths in the browser),
`twin/trust_nodes.py` (makes the sensor data and tunes it), `web/trust/detector.js` (extra rules in the browser).
Results: `data/trust/phi_2026_stats.json`. Everything is simulated (S); nothing is measured.

## 1. Which "sensors" it reads (every 5 minutes)

The model still uses the four nodes of the old pomegranate room, not the flower-room sensor list:

| Node | Values | Where the value really comes from today |
|---|---|---|
| N1 supply air (air leaving the cooler) | T_s, RH_s, air speed v | **Worked backwards** so the air side carries exactly the twin's cooling (`solve_Ts`) |
| N2 produce core | T_core | twin flower-node temperature |
| N3 door | open/closed, Q_door | twin door heat |
| N4 return air (room) | T_r, RH_r | twin room temperature and humidity |
| Energy meter | P_el (chiller + fan) | twin |
| "Controller log" | COP, Q_wax_branch, Q_int, G_wax, T_pcm | **twin internals**, incl. Q_int = the twin's own leftover heat (`Q_other`) |
| Outside | T_out, RH_out, pressure | the weather file (same as the weather service) |

Noise added (`config/design.json → trust.sensor_noise`, seed 7): temperatures ±0.1 K, RH ±1 %, power ±2 %,
glycol temperatures ±0.05 K, a fixed +5 % airflow bias. No offsets, no rounding, no probe lag, no dropouts.

## 2. The four residuals (Δt = 5 min)

1. **Moisture** r1 = W_s − min(W_r, W_sat(T_s)) — supply air may not hold more water than the room air or than
   saturation. RH above 100.5 % forces z1 = 10.
2. **Energy** r2 = Q_air − Q_ref, with Q_air = ρ·v·A·[c_p(T_r − T_s) + h_fg(W_r − W_s)] and
   Q_ref = COP·(P_el − P_fan) − Q_wax_branch. Units W.
3. **Room heat balance** r3 = C_room·ΔT_r/Δt − [UA(T_out − T_r) + Q_door + Q_produce + Q_int − G_wax(T_r − T_pcm) − Q_air]. Units W.
4. **Core lag** r4 = T_core − [T_core,prev + (T_r,prev − T_core,prev)(1 − e^(−Δt/τ))], τ = 4 h / ln 8. Units K.

r3 and r4 are set to 0 only in the single 5-min step when a new batch is loaded. Door openings are not masked.

## 3. From residuals to φ

- Each residual is averaged over the last 3 readings (15 min).
- z_k = r_k / σ_k. σ_k = max(floor, 99.9th percentile of |15-min mean r_k| ÷ 3), tuned on the **same normal 2026 run** that
  is later scored. Floors: 5e-5 kg/kg, 40 W, 30 W, 0.05 K. Tuned values today: 5.1e-5 kg/kg, 67 W, 64 W, 0.11 K.
- **Combining rule:** Φ = √( Σ w_k z_k² / Σ w_k ), all weights 1, but r1 and r2 count only while the cooler fan runs.
  This is a root-mean-square, not a sum.
- **Thresholds:** green below 2, orange 2–3. **Flag** when Φ ≥ 3 for 3 readings in a row (15 min).

## 4. Other checks outside φ

- **Browser detector** (`detector.js`): a sensor silent for 2 readings; the outside sensor more than 4 K from the weather
  service for 3 readings; exactly the same value 6 times in a row ("stuck"); supply and return RH more than 3.5 % apart
  while the fan is off. The hash chain catches edited old readings.
- **Glycol energy check** (separate card): Q = ṁ·c·(T_ret − T_sup) against the room side and against COP × power, inside a
  3σ noise band. Not part of φ.
- `PhysicsCheck` (old single-residual check, 1.5 K for 15 min) is still in the file but unused.

## 5. What it scores today (S, `phi_2026_stats.json`)

| | Result |
|---|---|
| Normal year: false flags | 0 (Φ green 99.5 % of the time) |
| Sudden fake "4.0 °C" on air + core, by day | caught 69 %, median 15 min |
| Same, at night | caught 49 % |
| Slow fake (slides to 4.0 °C over 1 h), by day | caught 81 %, median 115 min |
| Same, at night | caught **0.7 %** |

## 6. Weaknesses (why the new model is needed)

1. **Circular test.** The "sensors" come from the same equations the checker uses. T_s is solved backwards from the
   twin's cooling, Q_int is the twin's own leftover heat and COP/G_wax come from the twin. So r2 and r3 are zero apart
   from the added noise. Zero false flags is guaranteed by construction, not earned.
2. **σ tuned in-sample** on the very data it is scored on, at the 99.9th percentile. That hides model error and
   inflates the "0 false flags" result.
3. **RMS dilutes a single broken link.** If only one of the four checks breaks, Φ = |z|/2, so that check must reach 6σ
   before Φ reaches 3. A cheater who keeps three links quiet is hard to see.
4. **Φ is not a probability.** "3" means a different false-alarm chance depending on how many checks are active
   (2 at night, 4 by day).
5. **No memory.** A 15-min mean plus 3-in-a-row cannot see slow drifts: 0.7 % caught at night.
6. **Night blind spot.** With the fan off only r3 and r4 count, and both use the room probe the cheater controls.
7. **Trusts the owner's own inputs.** Outside temperature, power, door state and the "controller log" all come from the
   owner's side. Only one external reference (the weather service) exists, and it only enters through a simple 4 K
   rule outside φ. There is no utility meter and no PV inverter cross-check.
8. **No COP physics in the check.** COP is read from the log instead of recomputed from outside temperature and glycol
   temperature, so a faked outside temperature plus faked power can pass.
9. **No ice-state check.** The ice panel temperature is used as an input, never checked (0 °C plateau, frozen fraction).
10. **Humidity in RH, not humidity ratio**, and no transpiration / fogger / condensation balance.
11. **No isolation.** "The largest |z|" names a link, not a sensor, and cannot say how big the bias is or what the true
    value probably was.
12. **Freshness uses the reported temperatures**, even after a flag.
13. **No defence against replay** or against a full, self-consistent fake made from a model run.
14. **Sensor list mismatch.** It uses supply-air T/RH/airspeed nodes, which are not in the agreed final list. The
    agreed glycol supply/return, flow, ice-panel T, room T high, ATS, PV and DISCOM meter are not in φ.
15. **Masking is too short.** Only one 5-min step after loading; door openings are not masked at all.
