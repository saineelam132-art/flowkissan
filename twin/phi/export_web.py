"""Export the data the website's φ monitor and Tamper lab need, and golden test vectors (Python φ on the same data).

python -m twin.phi.export_web  →  web/trust/data/phi_lab.js  and  results/live/phi_golden.json
The browser recomputes residuals, φ, isolation and the watermark itself (web/trust/phi_core.js) from these readings,
so every number on the page comes from this results file plus the published algorithm. All values are simulated (S).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from engine.config import load_config
from twin.phi import evaluate as EV
from twin.phi import isolate as IS
from twin.phi import model as M
from twin.phi import plant as PL
from twin.phi import residuals as RS
from twin.phi import score as SC
from twin.phi.attacks import COMMANDS

ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / "web" / "trust" / "data" / "phi_lab.js"
GOLD = ROOT / "results" / "live" / "phi_golden.json"
SPD = 288
DAY0, NDAYS, WARM = 148, 9, 2              # shown: 31 May – 6 Jun 2026 (summer, daily loading); 2 warm-up days first, like the evaluation
COLS = PL.OWNER + COMMANDS + ["ps_api", "T_out_api", "RH_out_api", "P_inv", "discom_kWh"]
N_KEYS = ["dt_s", "UA_kW_K", "C_a_kJ_K", "m_air_kg", "mdot_kg_s", "cp_g_kJ_kgK", "G_coil_kW_K", "f_air", "pipe_UA_kW_K", "pump_kW", "fan_kW",
          "ctrl_kW", "light_kW", "nfan_kW", "fog_kg_s", "fog_kW", "flower_cp", "tau_f_s", "Kt", "liner", "v_on", "v_off", "m_ice_kg", "L_ice",
          "cps_ice", "cpl_ice", "G_ice_dT", "G_ice_kW_K", "cop_To", "cop_Ts", "cop", "resp_T", "resp_W_kg", "strat", "approach_K", "cond_approach_K"]


def _clean(x: Any) -> Any:
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items() if not str(k).startswith("_")}
    if isinstance(x, list):
        return [_clean(v) for v in x]
    if isinstance(x, (np.floating, float)):
        return None if not np.isfinite(x) else float(x)
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, np.ndarray):
        return _clean(x.tolist())
    return x


def _frame(R: pd.DataFrame, cols: list[str]) -> dict[str, list]:
    return {c: [None if not np.isfinite(v) else round(float(v), 4) for v in R[c].to_numpy(dtype=float)] for c in cols}


def _to_df(d: dict[str, list], index: pd.Index) -> pd.DataFrame:
    return pd.DataFrame({k: np.array([np.nan if v is None else v for v in vals], dtype=float) for k, vals in d.items()}, index=index)


def build(cfg: dict | None = None, P: dict | None = None) -> dict[str, Any]:
    cfg = cfg or load_config()
    P = P or M.load_phi_cfg()
    H = EV.honest(cfg, P, use_cache=True)
    R, w, N, cal = H["R"], H["w"], H["N"], H["cal"]
    a0, a1 = DAY0 * SPD, (DAY0 + NDAYS) * SPD
    win = R.iloc[a0:a1]
    honest = _frame(win, COLS)
    zeros = np.zeros(len(R))
    Sf, _ = PL.run_truth(w, cfg, P, dither=zeros, dither_sup=zeros)
    fake = _frame(PL.make_readings(Sf, w, cfg, P, seed=99).iloc[a0:a1], PL.OWNER + COMMANDS)
    k_off = a0 + (WARM + 3) * SPD + 144                          # shown day 4, 12:00
    So, _ = PL.run_truth(w, cfg, P, scenario={"from_step": k_off, "chiller_off": True})
    off = _frame(PL.make_readings(So, w, cfg, P).iloc[a0:a1], PL.OWNER + COMMANDS)
    state = H["Sc"]["snapshots"][DAY0]
    dg = [round(float(v), 6) for v in H["dg"][a0:a1]]
    lab = {"_note": "S (simulated) 9-day window (2 warm-up days + 7 shown) of the honest 2026 truth-plant run, the attacker's model run on the real weather (no watermark) and a run "
                    "with the chiller really broken from day 4 12:00. The browser recomputes everything from these readings.",
           "start": str(win.index[0]), "warmup_steps": WARM * SPD, "dt_s": int(P["dt_s"]), "n": int(len(win)), "readings": honest, "fake_same": fake, "chiller_off": off,
           "chiller_off_step": int(k_off - a0), "door_g": dg, "dither_sup": [float(v) for v in R["dither_sup"].to_numpy()[a0:a1]],
           "truth_T_room": [round(float(v), 2) for v in win["truth_T_room"].to_numpy()],
           "N": _clean({k: N[k] for k in N_KEYS}), "P": _clean(P), "cal": _clean({k: cal[k] for k in ("mu", "sd", "rho", "esd", "Sigma", "R10", "R8d",
                                                                                                       "cusum_kappa", "cusum_h")}),
           "state": _clean(state)}
    return lab


def golden(lab: dict[str, Any], P: dict) -> dict[str, Any]:
    """Python φ on exactly the exported (rounded) numbers: honest, and outside T −8 K from day 3 12:00 with isolation."""
    idx = pd.RangeIndex(lab["n"])
    R = _to_df(lab["readings"], idx)
    N, cal, dg = lab["N"], lab["cal"], np.asarray(lab["door_g"])
    state = lab["state"]
    state = {**state, "zprev": [None if v is None else v for v in state["zprev"]]}
    out: dict[str, Any] = {"_note": "Golden vectors: φ from the Python checker on web/trust/data/phi_lab.js. tests/test_phi_js.py runs the JS port on the same data."}
    k = (WARM + 2) * SPD + 144                                    # shown day 3, 12:00
    for name, Ra in (("honest", R), ("out_minus_8", R.assign(T_out_s=np.where(np.arange(len(R)) >= k, R["T_out_s"] - 8.0, R["T_out_s"])))):
        X = RS.compute(Ra, N, P, dg)
        Sc = SC.score(X, cal, P, state=state)
        g = {"phi": [round(float(v), 4) for v in Sc["phi"]], "flag": [bool(v) for v in Sc["flag"]]}
        if name != "honest":
            g["attack_step"] = k
            f = np.where(Sc["flag"][k:])[0]
            if len(f):
                kf = k + int(f[0])
                iso = IS.isolate(Ra, X, Sc, cal, N, P, dg, kf)
                g["first_flag"] = kf
                g["fired"] = SC.which_fired(Sc, cal, kf)
                g["suspects"] = iso["suspects"]
                g["bias"] = {s: round(v, 3) for s, v in iso["bias"].items()}
        out[name] = g
    return out


def main() -> None:
    P = M.load_phi_cfg()
    lab = build(P=P)
    gold = golden(lab, _clean(P))
    JS.parent.mkdir(parents=True, exist_ok=True)
    JS.write_text("// Generated by python -m twin.phi.export_web – do not edit. Simulated (S).\nwindow.PHI_LAB = "
                  + json.dumps(lab, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    GOLD.write_text(json.dumps(gold, indent=0), encoding="utf-8")
    print("phi_lab.js", round(JS.stat().st_size / 1e6, 2), "MB; golden honest flags", sum(gold["honest"]["flag"]),
          "attack first flag", gold["out_minus_8"].get("first_flag"), gold["out_minus_8"].get("suspects"))


if __name__ == "__main__":
    main()
