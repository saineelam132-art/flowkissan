"""Which sensor is lying, by how much, and what the true value probably was.

For the `window_steps` readings after a flag (minus the residual level in the hours before it):
  1. Jacobian: shift each owner sensor by a small amount (δ) and recompute the residuals → J_s (how residuals move per unit bias).
  2. Generalised likelihood ratio over every set S of up to 3 sensors:
        b̂_S = argmin ‖y − J_S b‖²     GLR_S = ‖y‖² − ‖y − J_S b̂_S‖²      score_S = GLR_S − penalty·|S|
     y = standardised residuals, each row weighted by (1 − ρ)/(1 + ρ) so slowly-varying residuals do not count 12 times.
  3. Best positive score → suspected sensors and their bias; reconstructed value = reported − bias.
  4. Data confidence: high (no flag), medium (flagged but a bias on ≤3 sensors explains it, values reconstructed),
     low (nothing explains it → freshness uses the worst case: the room is assumed uncooled, i.e. at the weather-service outside T).
"""
from __future__ import annotations

import itertools
import warnings
from typing import Any

import numpy as np
import pandas as pd

from twin.phi import residuals as RS
from twin.phi.plant import OWNER
from twin.phi.residuals import NAMES
from twin.phi.score import chi2_sf

RELATIVE = {"P_el", "flow"}                       # gain errors (fraction); the rest are offsets (K or %)
DELTA = {"P_el": 0.1, "flow": 0.1, "RH_mid": 2.0, "RH_out_s": 2.0}
UNIT = {"P_el": "×", "flow": "×", "RH_mid": "%RH", "RH_out_s": "%RH"}


def _shift(R: pd.DataFrame, s: str, b: float) -> pd.DataFrame:
    Q = R.copy()
    Q[s] = Q[s] * (1.0 + b) if s in RELATIVE else Q[s] + b
    return Q


def jacobian(R_slice: pd.DataFrame, N: dict, P: dict, dg: np.ndarray, rows: slice) -> dict[str, np.ndarray]:
    base = RS.compute(R_slice, N, P, dg)["r"][rows]
    J = {}
    for s in OWNER:
        d = DELTA.get(s, 0.5)
        r = RS.compute(_shift(R_slice, s, d), N, P, dg)["r"][rows]
        J[s] = np.nan_to_num((r - base) / d)
    return J


def isolate(R: pd.DataFrame, X: dict, Sc: dict, cal: dict, N: dict, P: dict, dg: np.ndarray, k_flag: int) -> dict[str, Any]:
    """Isolate a flag raised at reading k_flag, using the W readings after it, (k_flag, k_flag + W],
    compared with the residual level in the 3 hours before the flag (assumed honest)."""
    I = P["isolation"]
    W = I["window_steps"]
    lead = 36
    n = len(R)
    k = min(n - 1, k_flag + W)
    a0, a1 = max(0, k_flag - lead), k + 1
    R_slice = R.iloc[a0:a1]
    ks = np.arange(k_flag + 1, k + 1) if k > k_flag else np.array([k_flag])
    rows = slice(int(ks[0]) - a0, a1 - a0)
    J = jacobian(R_slice, N, P, dg[a0:a1], rows)
    act = X["active"][ks]
    rho = np.asarray(cal["rho"])
    wrow = np.sqrt((1 - rho) / (1 + rho))
    zall = (X["r"] - Sc["mu"]) / Sc["sc"]
    pre = zall[max(0, k_flag - 48):max(1, k_flag - 12)]
    pre = np.where(X["active"][max(0, k_flag - 48):max(1, k_flag - 12)], pre, np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)          # a residual with no active reading before the flag → 0
        base = np.nan_to_num(np.nanmean(pre, axis=0)) if len(pre) else np.zeros(len(NAMES))
    y = (zall[ks] - base) * wrow
    m = act & np.isfinite(y)
    yv = y[m]
    A = {s: (J[s] / Sc["sc"][ks] * wrow)[m] for s in OWNER}
    tot = float(yv @ yv)
    best: dict[str, Any] = {"set": [], "score": 0.0, "glr": 0.0, "bias": {}}
    useful = [s for s in OWNER if np.any(np.abs(A[s]) > 1e-6)]
    jumped = jumps(R, k_flag, P)
    for size in range(1, I["max_set"] + 1):
        for S in itertools.combinations(useful, size):
            M_ = np.column_stack([A[s] for s in S])
            b, *_ = np.linalg.lstsq(M_, yv, rcond=None)
            res = yv - M_ @ b
            glr = tot - float(res @ res)
            sc = glr - I["penalty"] * size + I["penalty"] * sum(1 for x in S if x in jumped)
            if sc > best["score"] + 1e-9:
                best = {"set": list(S), "score": sc, "glr": glr, "bias": {s: float(v) for s, v in zip(S, b)}, "left": float(res @ res)}
    dof = int(m.sum())
    out: dict[str, Any] = {"k_flag": int(k_flag), "k": int(k), "window_steps": int(len(ks)), "rows": dof, "chi2_window": tot, "suspects": best["set"],
                           "bias": best["bias"], "glr": best["glr"], "units": {s: UNIT.get(s, "K") for s in best["set"]}, "jumped": sorted(jumped)}
    flagged = bool(Sc["flag"][k_flag])
    if not flagged:
        out["confidence"] = "high"
    elif best["set"] and chi2_sf(best.get("left", tot), max(dof - len(best["set"]), 1)) > 1e-3:
        out["confidence"] = "medium"
    else:
        out["confidence"] = "low"
    out["reconstructed"] = reconstruct(R.iloc[k], best["bias"])
    return out


def jumps(R: pd.DataFrame, k_flag: int, P: dict) -> set[str]:
    """Sensors whose 5-min step in the last `jump_lookback_steps` readings before the flag is > jump_z × their normal step."""
    I = P["isolation"]
    out = set()
    for s in I["jump_sensors"]:
        x = R[s].to_numpy(dtype=float)
        a, b = max(1, k_flag - I["jump_lookback_steps"]), k_flag + 1
        d = np.abs(np.diff(x[max(0, k_flag - 60):max(1, k_flag - 12)]))
        d = d[np.isfinite(d)]
        if len(d) < 10:
            continue
        typ = max(1.4826 * float(np.median(d)), P["sensors"][s]["quantum"])
        recent = np.abs(x[a:b] - x[a - 1:b - 1])
        recent = recent[np.isfinite(recent)]
        if len(recent) and float(recent.max()) > I["jump_z"] * typ:
            out.add(s)
    return out


def reconstruct(row: pd.Series, bias: dict[str, float]) -> dict[str, float]:
    out = {}
    for s, b in bias.items():
        v = float(row[s])
        out[s] = v / (1.0 + b) if s in RELATIVE else v - b
    return out


def freshness_temperature(R: pd.DataFrame, iso: dict[str, Any] | None, flagged: np.ndarray) -> np.ndarray:
    """Flower temperature for the freshness clock: reported when trusted, reconstructed when a bias was isolated,
    and the worst case (no cooling: weather-service outside T) when the data cannot be explained."""
    T = R["T_flower"].to_numpy(dtype=float).copy()
    if iso is None or not flagged.any():
        return T
    if iso["confidence"] == "medium" and "T_flower" in iso["bias"]:
        T[flagged] = T[flagged] - iso["bias"]["T_flower"]
    elif iso["confidence"] == "low":
        T[flagged] = np.maximum(T[flagged], R["T_out_api"].to_numpy(dtype=float)[flagged])
    return T


def residual_names() -> list[str]:
    return list(NAMES)
