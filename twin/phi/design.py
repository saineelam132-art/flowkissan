"""Sensor-design check: which lies CAN the residuals see at all? (rank test on a 1-hour window)

For a set S of owner sensors with constant biases b, the residuals move by J_S·b (J from finite differences, in units of
each residual's honest spread). If some b ≠ 0 gives J_S·b ≈ 0, that lie is UNDETECTABLE in that operating state.
Measure: σ_min(J_S) = the smallest residual response (in σ) to a unit bias combination. We test 4 operating states,
two residual sets (physics only; physics + external references) and all sets of up to 3 sensors, and for each blind set
we list which single extra sealed sensor (a duplicate the owner cannot touch) would make it visible.
python -m twin.phi.design → results/live/phi_design.json and docs/phi_design.md
"""
from __future__ import annotations

import itertools
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from engine.config import load_config
from twin.phi import evaluate as EV
from twin.phi import isolate as IS
from twin.phi import model as M
from twin.phi.plant import OWNER
from twin.phi.residuals import NAMES

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "results" / "live" / "phi_design.json"
DOC = ROOT / "docs" / "phi_design.md"
EXTERNAL = ["R7T", "R7W", "R8"]
UNIT_BIAS = {"P_el": 0.1, "flow": 0.1, "RH_mid": 2.0, "RH_out_s": 2.0}    # what '1 unit' means: 10 %, 2 %RH, else 0.5 K
LABEL = {"T_out_s": "outside T", "RH_out_s": "outside RH", "P_el": "chiller power", "T_mid": "room T (middle)", "RH_mid": "room RH",
         "T_high": "room T (high)", "T_flower": "flower core T", "T_ice": "ice-panel T", "T_sup": "glycol supply T", "T_ret": "glycol return T",
         "flow": "glycol flow"}


def pick_states(R: pd.DataFrame, X: dict, cal_days: int) -> dict[str, int]:
    run = R["run_frac"].to_numpy() > 0
    vi = R["v_ice"].to_numpy() > 0.5
    hour = R.index.hour.to_numpy()
    month = R.index.month.to_numpy()
    k0 = cal_days * 288
    ok = np.arange(len(R)) > k0 + 48

    def first(mask: np.ndarray) -> int:
        idx = np.where(mask & ok)[0]
        return int(idx[len(idx) // 2])                     # a typical one, not the first

    win = lambda m: np.convolve(m.astype(float), np.ones(13), "same") >= 13   # condition holds the whole hour
    return {"summer day, chiller charging ice": first(win(run & vi) & (month >= 4) & (month <= 6)),
            "summer day, chiller cooling the room": first(win(run & ~vi) & (month >= 4) & (month <= 9)),
            "night, chiller off (ice panels only)": first(win(~run) & ((hour < 5) | (hour > 21))),
            "winter day, chiller running": first(win(run) & (month <= 2) & (hour > 9) & (hour < 16))}


def jac_matrix(H: dict, P: dict, k: int) -> dict[str, np.ndarray]:
    """J_s over the hour ending at k, scaled to σ per unit bias; rows = (step, residual) pairs that are active."""
    R, X, Sc, N = H["R"], H["X"], H["Sc"], H["N"]
    W = P["isolation"]["window_steps"]
    a0, a1 = k - W - 36 + 1, k + 1
    J = IS.jacobian(R.iloc[a0:a1], N, P, H["dg"][a0:a1], slice(36, None))
    ks = np.arange(k - W + 1, k + 1)
    act = X["active"][ks]
    out = {}
    for s in OWNER:
        u = UNIT_BIAS.get(s, 0.5)                                  # J is per unit of the sensor; scale to the unit bias
        out[s] = np.where(act, J[s] * u / Sc["sc"][ks], 0.0)       # (W × K)
    return out


def sigma_min(J: dict[str, np.ndarray], S: tuple, cols: list[int], extra: str | None = None) -> float:
    A = np.column_stack([J[s][:, cols].ravel() for s in S])
    if extra is not None:                                           # a sealed duplicate of one sensor: 1 σ per unit (E: as good as the original)
        row = np.array([[1.0 if s == extra else 0.0 for s in S]])
        A = np.vstack([A, row * 3.0])
    return float(np.linalg.svd(A, compute_uv=False)[-1])


def run(cfg: dict | None = None, P: dict | None = None) -> dict[str, Any]:
    cfg = cfg or load_config()
    P = P or M.load_phi_cfg()
    H = EV.honest(cfg, P, use_cache=True)
    states = pick_states(H["R"], H["X"], P["calibration"]["days"])
    thr = P["design"]["visible_sigma"]
    sets = {"physics only": [NAMES.index(n) for n in NAMES if n not in EXTERNAL],
            "physics + external references": list(range(len(NAMES)))}
    res: dict[str, Any] = {"_note": "S (simulated) rank test on the honest 2026 run; 'visible' means a unit bias moves the residuals by "
                                    f"at least {thr} σ in one hour (E, config/phi.json → design).",
                           "unit_bias": {s: UNIT_BIAS.get(s, 0.5) for s in OWNER}, "states": {}}
    for name, k in states.items():
        J = jac_matrix(H, P, k)
        st: dict[str, Any] = {"time": str(H["R"].index[k]), "single": {}, "blind": {}}
        for sname, cols in sets.items():
            st["single"][sname] = {s: round(sigma_min(J, (s,), cols), 2) for s in OWNER}
            blind = []
            for size in (1, 2, 3):
                for S in itertools.combinations(OWNER, size):
                    if any(set(b["set"]) < set(S) for b in blind):  # already blind with fewer sensors
                        continue
                    sm = sigma_min(J, S, cols)
                    if sm < thr:
                        fixes = [e for e in S if sigma_min(J, S, cols, e) >= thr]
                        blind.append({"set": list(S), "sigma_min": round(sm, 3), "fixed_by_sealed_duplicate_of": fixes})
            st["blind"][sname] = blind
        res["states"][name] = st
    res["all_owner_sensors"] = ("If EVERY owner sensor and the controller log are replaced by a consistent model run, every physics residual "
                                "stays small by construction: undetectable by physics. Only the external references (weather service, "
                                "inverter log, utility meter) and the secret watermark can see it.")
    return res


def render(res: dict[str, Any]) -> str:
    L = ["# φ sensor design – which lies can the checker see? (S, simulated)", "",
         "_Generated by `python -m twin.phi.design` from `results/live/phi_design.json`._", "", res["_note"], "",
         "Unit bias: " + ", ".join(f"{LABEL[s]} {v}{' (fraction)' if s in ('P_el', 'flow') else ''}" for s, v in res["unit_bias"].items()) + ".", ""]
    for name, st in res["states"].items():
        L += [f"## {name} ({st['time']})", "", "Response to a unit bias of ONE sensor (σ in one hour; physics only / with external references):", "",
              "| Sensor | physics only | + external |", "|---|---|---|"]
        for s in OWNER:
            L.append(f"| {LABEL[s]} | {st['single']['physics only'][s]} | {st['single']['physics + external references'][s]} |")
        for sname, blind in st["blind"].items():
            L += ["", f"Blind sets ({sname}): {len(blind)}", ""]
            for b in blind[:12]:
                fx = ", ".join(LABEL[e] for e in b["fixed_by_sealed_duplicate_of"]) or "no single sealed duplicate"
                L.append(f"* {' + '.join(LABEL[s] for s in b['set'])} (σ_min {b['sigma_min']}) → fixed by a sealed {fx}")
            if len(blind) > 12:
                L.append(f"* … and {len(blind) - 12} more in the JSON file")
        L.append("")
    L += ["## All owner sensors at once", "", res["all_owner_sensors"], ""]
    return "\n".join(L)


def main() -> None:
    res = run()
    OUT.write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    DOC.write_text(render(res), encoding="utf-8")
    for name, st in res["states"].items():
        print(name, {k: len(v) for k, v in st["blind"].items()})


if __name__ == "__main__":
    main()
