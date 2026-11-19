"""Trust & Trade v2 data: one sensor stream (the φ truth plant) for the slips, ledger, monitor and tamper demo.

python -m twin.trust_v2  →  web/trust/data/trust_v2.js  and  results/live/trust_v2_golden.json
* 5-day window = 2 warm-up days + the 3 shown days from the day before the hottest day of 2026 (as before), for each
  scenario (normal, door-seal failure, thermostat over-cooling, power cut), from twin/phi/plant.py (S, simulated).
* The checker's calibration and its learnt state at the window start (twin/phi/score.py), so the browser's φ continues the year.
* Hourly outside weather of 2026 (results/live/hourly_live.csv) for the trip-freshness estimate (E).
* Golden vectors: φ from Python for the normal stream and for demo attacks, and trip-freshness cases, so tests can check
  the JavaScript (web/trust/phi_stream.js, freshness_v2.js) gives the same numbers.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from engine.config import load_config, load_crops
from twin import freshness_v2 as FV
from twin import study
from twin.phi import evaluate as EV
from twin.phi import export_web as EW
from twin.phi import isolate as IS
from twin.phi import model as M
from twin.phi import plant as PL
from twin.phi import residuals as RS
from twin.phi import score as SC
from twin.phi.attacks import COMMANDS
from twin.trust_nodes import SCENARIOS, hottest_day

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "web" / "trust" / "data" / "trust_v2.js"
GOLD = ROOT / "results" / "live" / "trust_v2_golden.json"
SPD = 288
WARM_DAYS, SHOW_DAYS = 2, 3
COLS = PL.OWNER + COMMANDS + ["ps_api", "T_out_api", "RH_out_api", "P_inv", "discom_kWh", "dither_sup"]
TRUE = ["T_mid", "T_high", "T_flower", "T_out_s", "RH_mid", "T_ice", "T_sup", "T_ret", "P_el"]
RELATIVE = {"P_el", "flow"}


def window(w: pd.DataFrame) -> tuple[int, int]:
    show = hottest_day(w) - pd.Timedelta(days=1)
    d_show = int((show - w.time_ist.iloc[0].normalize()).days)
    a0 = (d_show - WARM_DAYS) * SPD
    return a0, a0 + (WARM_DAYS + SHOW_DAYS) * SPD


def frame(R: pd.DataFrame) -> dict[str, list]:
    out = {c: [None if not np.isfinite(v) else round(float(v), 3) for v in R[c].to_numpy(dtype=float)] for c in COLS}
    out["truth"] = {c: [round(float(v), 2) for v in R["true_" + c].to_numpy(dtype=float)] for c in TRUE}
    out["truth"]["T_room"] = [round(float(v), 2) for v in R["truth_T_room"].to_numpy(dtype=float)]
    return out


def tamper(R: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Same attack overlay as phi_stream.js applyTamper (offset / freeze / drift / replay) on the reported readings."""
    Q = R.copy()
    k0, k1 = cfg["start"], min(len(R), cfg["end"])
    if cfg["kind"] == "replay":
        for c in PL.OWNER + COMMANDS:
            v = Q[c].to_numpy(dtype=float).copy()
            v[k0:k1] = R[c].to_numpy(dtype=float)[k0 - SPD:k1 - SPD]
            Q[c] = v
        return Q
    for s in cfg["sensors"]:
        v = Q[s].to_numpy(dtype=float).copy()
        v0 = v[k0]
        for i in range(k0, k1):
            hrs = (i - k0) * 300.0 / 3600.0
            if cfg["kind"] == "offset":
                v[i] = v[i] * (1 + cfg["size"] / 100.0) if s in RELATIVE else v[i] + cfg["size"]
            elif cfg["kind"] == "freeze":
                v[i] = v0
            elif cfg["kind"] == "drift":
                v[i] = v[i] * (1 + cfg["size"] / 100.0 * hrs) if s in RELATIVE else math.floor((v[i] + cfg["size"] * hrs) * 10 + 0.5) / 10   # = JS Math.round
        Q[s] = v
    return Q


def build() -> tuple[dict[str, Any], dict[str, Any]]:
    cfg, crops = load_config(), load_crops()
    P = M.load_phi_cfg()
    N = M.nominal(cfg, P)
    H = EV.honest(cfg, P, use_cache=True)
    w = H["w"]
    a0, a1 = window(w)
    d0 = a0 // SPD
    scen: dict[str, Any] = {}
    frames: dict[str, pd.DataFrame] = {}
    for key, sc in SCENARIOS.items():
        if sc["fault"]:
            from_step = WARM_DAYS * SPD + int(sc["from_h"] * 12)
            S, _ = PL.run_truth(w, cfg, P, scenario=dict(sc["fault"], from_step=a0 + from_step))
            R = PL.make_readings(S, w, cfg, P)
        else:
            from_step, R = None, H["R"]
        Rw = R.iloc[a0:a1]
        frames[key] = Rw
        scen[key] = {"label": sc["label"], "from_step": from_step, **frame(Rw)}
    hourly = pd.read_csv(ROOT / "results" / "live" / "hourly_live.csv", parse_dates=["time_ist"])
    tv2 = FV.load_cfg()
    allowed = cfg["flowers"]["allowed"]
    data = {
        "_note": "S (simulated): the φ truth plant (twin/phi/plant.py) with simulated sensor errors; the trip weather is the hourly 2026 weather (Open-Meteo, site-corrected). Nothing is measured.",
        "t0": str(Rw.index[0]), "dt_s": int(P["dt_s"]), "n": int(a1 - a0), "warmup_steps": WARM_DAYS * SPD, "checkin_step": WARM_DAYS * SPD + int(cfg["live_run"]["load_hour"] * 12),
        "scenarios": scen, "door_g": [round(float(v), 6) for v in H["dg"][a0:a1]],
        "N": EW._clean({k: N[k] for k in EW.N_KEYS}), "P": EW._clean(P),
        "cal": EW._clean({k: H["cal"][k] for k in ("mu", "sd", "rho", "esd", "Sigma", "R10", "R8d", "cusum_kappa", "cusum_h")}),
        "state": EW._clean(H["Sc"]["snapshots"][d0]),
        "weather": {"t0": str(hourly.time_ist.iloc[0]), "T_out": [round(float(v), 1) for v in hourly.T_out], "RH_out": [round(float(v), 1) for v in hourly.RH_out]},
        "trip": tv2["trip"], "demo": tv2["demo"], "liner_factor": cfg["humidity"]["liner_transpiration_factor"],
        "fan_on_v": cfg["humidity"]["flower_air_speed_fan_on_m_s"], "fan_off_v": cfg["humidity"]["flower_air_speed_fan_off_m_s"],
        "tariff_INR_kWh": cfg["live_run"]["money"]["grid_tariff_INR_kWh"],
        "crops": {k: {"label": crops[k]["label"], "Q10": crops[k]["Q10"], "chill_injury_below_C": crops[k].get("chill_injury_below_C"), "freshness": crops[k]["freshness"]}
                  for k in allowed},
    }
    return data, {"frames": frames, "N": N, "P": P, "cal": H["cal"], "state": H["Sc"]["snapshots"][d0], "dg": H["dg"][a0:a1], "hourly": hourly, "crops": crops, "data": data}


DEMOS = {
    "room_core_offset_2": {"kind": "offset", "sensors": ["T_mid", "T_flower"], "size": -2.0, "start_h": 24 + 10, "dur_h": 2},
    "room_offset_5": {"kind": "offset", "sensors": ["T_mid"], "size": -5.0, "start_h": 24 + 10, "dur_h": 2},
    "out_offset_8": {"kind": "offset", "sensors": ["T_out_s"], "size": -8.0, "start_h": 24 + 10, "dur_h": 2},
    "power_20": {"kind": "offset", "sensors": ["P_el"], "size": -20.0, "start_h": 24 + 10, "dur_h": 6},
    "drift": {"kind": "drift", "sensors": ["T_mid"], "size": -0.1, "start_h": 24 + 2, "dur_h": 12},
    "replay": {"kind": "replay", "sensors": [], "size": 0, "start_h": 24 + 10, "dur_h": 4},
}


def golden(G: dict[str, Any]) -> dict[str, Any]:
    data, N, P = G["data"], G["N"], G["P"]
    cal = data["cal"]
    st = data["state"]
    W = SPD * WARM_DAYS
    out: dict[str, Any] = {"_note": "Python reference for tests/js/trust_v2_check.js (φ ±0.01, same first flag and isolation)."}
    R0 = pd.DataFrame({c: np.array([np.nan if v is None else v for v in data["scenarios"]["normal"][c]], dtype=float) for c in COLS})
    dg = np.asarray(data["door_g"])
    X = RS.compute(R0, N, P, dg)
    Sc = SC.score(X, cal, EW._clean(P), state=st)
    out["honest"] = {"phi": [round(float(v), 4) for v in Sc["phi"]], "flags_after_warmup": int(Sc["flag"][W:].sum())}
    for name, d in DEMOS.items():
        c = {**d, "start": W + int(d["start_h"] * 12)}
        c["end"] = c["start"] + int(d["dur_h"] * 12)
        Ra = tamper(R0, c)
        X = RS.compute(Ra, N, P, dg)
        Sc = SC.score(X, cal, EW._clean(P), state=st)
        f = np.where(Sc["flag"][c["start"]:])[0]
        g: dict[str, Any] = {"cfg": {k: c[k] for k in ("kind", "sensors", "size", "start", "end")}, "phi": [round(float(v), 4) for v in Sc["phi"]]}
        if len(f):
            kf = c["start"] + int(f[0])
            iso = IS.isolate(Ra, X, Sc, cal, N, EW._clean(P), dg, kf)
            g.update(first_flag=kf, minutes=int(f[0]) * 5, fired=SC.which_fired(Sc, cal, kf), suspects=iso["suspects"])
        out[name] = g
    # trip freshness cases (same as tests/test_freshness_v2.py)
    hw = G["hourly"]
    t0 = hw.time_ist.iloc[0]
    W_ = FV.weather_fn(0.0, data["weather"]["T_out"], data["weather"]["RH_out"])          # the same rounded values the page uses
    base = (pd.Timestamp("2026-03-15") - t0).total_seconds() / 3600
    trips = []
    for crop in ("jasmine", "marigold"):
        for pk in ("basket", "perforated_bag", "crate_wet_cloth", "gunny_bag"):
            r = FV.trip(G["crops"][crop], W_, base + 5, base + 7, base + 9.5, distance_km=25, mode="bike", packing=pk)
            trips.append({"crop": crop, "packing": pk, "pick_start": base + 5, "pick_end": base + 7, "checkin": base + 9.5, "distance_km": 25, "mode": "bike",
                          "F_door": round(r["F_door"], 4)})
    out["trips"] = trips
    return out


def main() -> None:
    data, G = build()
    gold = golden(G)
    JS.parent.mkdir(parents=True, exist_ok=True)
    JS.write_text("// Generated by python -m twin.trust_v2 – do not edit. Simulated (S) and estimated (E) values.\nwindow.TRUST_V2 = "
                  + json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("NaN", "null") + ";\n", encoding="utf-8")
    GOLD.write_text(json.dumps(gold, indent=0), encoding="utf-8")
    print("trust_v2.js", round(JS.stat().st_size / 1e6, 2), "MB · honest flags after warm-up", gold["honest"]["flags_after_warmup"])
    for k in DEMOS:
        g = gold[k]
        print(f"{k:18s} first flag after {g.get('minutes')} min · fired {g.get('fired')} · isolated {g.get('suspects')}")
    print("trips", [(t["crop"], t["packing"], t["F_door"]) for t in gold["trips"]])


if __name__ == "__main__":
    main()
