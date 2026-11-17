"""From residuals to one trust score φ (phi) per 5-minute reading.

1. Standardise each residual with the mean and spread learnt on the first 21 honest days (separately for 'chiller running'
   and 'chiller off'), then remove its memory with an AR(1) filter:  e_k = (z_k − ρ z_{k−1}) / √(1 − ρ²).
2. Combine the active residuals with their correlation (shrunk toward 'independent'):  χ²_k = eᵀ Σ⁻¹ e  (m = number active).
3. Turn χ² into a 'sigma-equivalent':  φ_inst = Φ⁻¹(F_χ²(m)(χ²_k)). So φ = 3 always means the same false-alarm chance
   (about 1 in 740 readings), whether 2 or 10 residuals are active.
4. Slow lies: CUSUM on χ²:  S_k = max(0, S_{k−1} + χ²_k − m − κ);  φ_slow = 3·S_k/h  (κ, h tuned for ~1 false flag a month).
5. Daily closure: φ_day = max(|R10 − μ|/σ, |R8d − μ|/σ), held through the next day.
6. φ_k = max(φ_inst, φ_slow, φ_day, 99 if a hard rule is broken).  FLAG when φ ≥ 3 for 3 readings in a row, or any hard rule.
φ_max = max|e_i| is also reported because it is easy to explain.
The special functions are written out here (no SciPy) and copied 1:1 into web/trust/phi_core.js.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from twin.phi.residuals import NAMES

K = len(NAMES)


# ------------------------------------------------------------------ special functions (same algorithms in JS)
def _gser(a: float, x: float) -> float:
    s = term = 1.0 / a
    ap = a
    for _ in range(500):
        ap += 1.0
        term *= x / ap
        s += term
        if abs(term) < abs(s) * 1e-14:
            break
    return s * math.exp(-x + a * math.log(x) - math.lgamma(a))


def _gcf(a: float, x: float) -> float:
    tiny = 1e-300
    b = x + 1.0 - a
    c = 1.0 / tiny
    d = 1.0 / b
    h = d
    for i in range(1, 500):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        d = tiny if abs(d) < tiny else d
        c = b + an / c
        c = tiny if abs(c) < tiny else c
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < 1e-14:
            break
    return math.exp(-x + a * math.log(x) - math.lgamma(a)) * h


def chi2_sf(x: float, m: int) -> float:
    """P(χ²_m > x): upper tail of the chi-square distribution."""
    if x <= 0:
        return 1.0
    a, y = m / 2.0, x / 2.0
    return 1.0 - _gser(a, y) if y < a + 1.0 else _gcf(a, y)


def norm_isf(q: float) -> float:
    """z such that P(N(0,1) > z) = q (Acklam's rational approximation + one Newton step)."""
    if q <= 0:
        return 8.3
    if q >= 1:
        return -8.3
    p = 1.0 - q
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
    lo = 0.02425
    if q < lo:                                   # upper tail
        t = math.sqrt(-2 * math.log(q))
        z = -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1)
    elif p < lo:
        t = math.sqrt(-2 * math.log(p))
        z = (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1)
    else:
        u = p - 0.5
        t = u * u
        z = (((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * u / (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1)
    if abs(z) >= 8.3:
        return 8.3 if z > 0 else -8.3
    e = 0.5 * math.erfc(z / math.sqrt(2)) - q           # Newton step on the upper tail
    z = z + e * math.sqrt(2 * math.pi) * math.exp(z * z / 2)
    return min(8.3, max(-8.3, z))


def sigma_equiv(chi2: float, m: int) -> float:
    if m <= 0 or not math.isfinite(chi2):
        return 0.0
    return max(0.0, norm_isf(chi2_sf(chi2, m)))


# ------------------------------------------------------------------ calibration
def _robust(v: np.ndarray) -> tuple[float, float] | None:
    v = v[np.isfinite(v)]
    if len(v) < 50:
        return None
    lo, hi = np.percentile(v, [0.5, 99.5])
    w = v[(v >= lo) & (v <= hi)]
    return float(w.mean()), float(max(w.std(), 1e-9))


def calibrate(X: dict, P: dict, steps_per_day: int = 288) -> dict[str, Any]:
    """Learn the honest noise from the first `days` days (excluding masked readings)."""
    C = P["calibration"]
    nd = C["days"]
    n_cal = nd * steps_per_day
    r, act, run = X["r"][:n_cal], X["active"][:n_cal], X["running"][:n_cal]
    u = X["u"][:n_cal]
    mu, sd = np.zeros((2, K)), np.ones((2, K))
    seen = []

    def stats(sel: np.ndarray, j: int) -> tuple[float, float] | None:
        """Mean and learnt noise s so that (r − mean)/√(s² + u²) has unit (trimmed) spread; s ≥ the resolution floor."""
        v, uu = r[sel, j], u[sel, j]
        ok = np.isfinite(v)
        v, uu = v[ok], uu[ok]
        if len(v) < 50:
            return None
        floor = C["sd_floor"][NAMES[j]]
        lo_, hi_ = np.percentile(v, [0.5, 99.5])
        keep = (v >= lo_) & (v <= hi_)
        v, uu = v[keep], uu[keep]
        s_lo, s_hi = floor, max(floor * 2, float(v.std()) * 3 + floor)
        m_ = float(np.mean(v))
        for _ in range(60):
            s_ = math.sqrt(s_lo * s_hi)
            w = 1.0 / (s_ * s_ + uu * uu)
            m_ = float(np.sum(w * v) / np.sum(w))
            sz = float(np.sqrt(np.mean(w * (v - m_) ** 2)))
            s_lo, s_hi = (s_, s_hi) if sz > 1.0 else (s_lo, s_)
        return m_, max(floor, s_hi)

    for j, name in enumerate(NAMES):
        both = stats(act[:, j], j)
        if both is None:
            mu[:, j], sd[:, j] = 0.0, C["prior_sd"][name]
            continue
        seen.append(name)
        for g in (0, 1):
            one = stats(act[:, j] & (run == bool(g)), j)
            mu[g, j], sd[g, j] = one if one is not None else both
    cal: dict[str, Any] = {"names": NAMES, "mu": mu.tolist(), "sd": sd.tolist(), "calibrated": seen,
                           "rho": [0.0] * K, "esd": [1.0] * K, "Sigma": np.eye(K).tolist()}
    # AR(1) memory and the spread left after whitening
    z = np.where(act, (r - mu[run.astype(int)]) / np.sqrt(sd[run.astype(int)] ** 2 + u ** 2), np.nan)
    rho, esd = np.zeros(K), np.ones(K)
    for j in range(K):
        a, b = z[1:, j], z[:-1, j]
        m = np.isfinite(a) & np.isfinite(b)
        if m.sum() > 50 and NAMES[j] not in C["no_whiten"]:
            rho[j] = float(np.clip(np.corrcoef(a[m], b[m])[0, 1], 0.0, 0.95))
    zp = np.vstack([np.full(K, np.nan), z[:-1]])
    e = np.where(np.isfinite(zp), (z - rho * zp) / np.sqrt(1 - rho ** 2), z)
    for j in range(K):
        v = e[np.isfinite(e[:, j]), j]
        if len(v) > 50:
            lo, hi = np.percentile(v, [0.5, 99.5])
            esd[j] = float(max(0.2, v[(v >= lo) & (v <= hi)].std()))
    e = e / esd
    lam = C["shrinkage"]
    Sig = np.eye(K)
    for i in range(K):
        for j in range(i + 1, K):
            m = np.isfinite(e[:, i]) & np.isfinite(e[:, j])
            if m.sum() > 50:
                c = float(np.corrcoef(np.clip(e[m, i], -6, 6), np.clip(e[m, j], -6, 6))[0, 1])
                Sig[i, j] = Sig[j, i] = (1 - lam) * c
    cal.update({"rho": rho.tolist(), "esd": esd.tolist(), "Sigma": Sig.tolist()})
    # daily closure and utility meter (robust median / MAD)
    r1 = np.where(np.isfinite(r[:, 0]), r[:, 0] - mu[run.astype(int), 0], 0.0)
    r10 = r1.reshape(nd, steps_per_day).sum(1) * P["dt_s"] / 3.6e6       # same as the scorer: Σ(R1 − learnt mean)
    for key, floor in (("R10", 0.2), ("R8d", 0.05)):
        v = r10 if key == "R10" else np.asarray(X[key][:nd], dtype=float)
        v = v[np.isfinite(v)]
        med = float(np.median(v))
        cal[key] = {"mu": med, "sd": max(float(np.median(np.abs(v - med))) * 1.4826, floor)}
    # CUSUM: κ makes the honest drift negative; h by bootstrap of calibration days for ~1 false flag / 30 days
    ex = [NAMES.index(x) for x in C["cusum_exclude"]]
    ec = np.clip(e, -C["cusum_clip"], C["cusum_clip"])
    ec[:, ex] = np.nan
    chi2, m = chi2_series(ec, Sig)
    x = chi2 - m
    ok = m > 0
    kappa = float(max(0.5, 1.0 + np.mean(np.clip(x[ok], -50, 50))))
    cal["cusum_kappa"] = kappa
    cal["cusum_h_bootstrap"] = _tune_h(x, m, kappa, P, steps_per_day, nd)
    cal["cusum_h"] = cal["cusum_h_bootstrap"] * P["cusum"]["h_safety_factor"]
    cal["calibration_days"] = nd
    return cal


def chi2_series(e: np.ndarray, Sig: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n = len(e)
    chi2, m = np.zeros(n), np.zeros(n, dtype=int)
    act = np.isfinite(e)
    cache: dict[bytes, np.ndarray] = {}
    for k in range(n):
        a = act[k]
        if not a.any():
            continue
        key = a.tobytes()
        if key not in cache:
            cache[key] = np.linalg.inv(Sig[np.ix_(a, a)])
        v = e[k, a]
        chi2[k] = float(v @ cache[key] @ v)
        m[k] = int(a.sum())
    return chi2, m


def _cusum_events(x: np.ndarray, m: np.ndarray, kappa: float, h: float, steps: int) -> int:
    S, run, ev = 0.0, 0, 0
    for xi, mi in zip(x, m):
        if mi > 0:
            S = max(0.0, S + xi - kappa)
        run = run + 1 if S >= h else 0
        if run == steps:
            ev += 1
    return ev


def _tune_h(x: np.ndarray, m: np.ndarray, kappa: float, P: dict, spd: int, nd: int) -> float:
    rng = np.random.default_rng(1)
    target = P["cusum"]["target_false_per_30d"]
    days = [(x[d * spd:(d + 1) * spd], m[d * spd:(d + 1) * spd]) for d in range(1, nd)]
    series = []
    for _ in range(P["cusum"]["bootstrap_runs"]):
        pick = rng.integers(0, len(days), 30)
        series.append((np.concatenate([days[i][0] for i in pick]), np.concatenate([days[i][1] for i in pick])))
    steps = P["flag"]["steps"]
    lo, hi = 1.0, 5000.0
    for _ in range(30):
        mid = math.sqrt(lo * hi)
        rate = np.mean([_cusum_events(a, b, kappa, mid, steps) for a, b in series])
        lo, hi = (mid, hi) if rate > target else (lo, mid)
    return float(hi)


# ------------------------------------------------------------------ scoring (one pass, reading by reading; same loop in JS)
def init_state(cal: dict) -> dict[str, Any]:
    return {"mu": [list(x) for x in cal["mu"]], "var": [[v * v for v in row] for row in cal["sd"]], "zprev": [None] * K,
            "S": 0.0, "run": 0, "phi_day": 0.0, "day_r1": 0.0, "day_own": 0.0, "day_inv": 0.0, "day_n": 0, "day_clean": True,
            "R10_mu": cal["R10"]["mu"], "R10_var": cal["R10"]["sd"] ** 2}


def _inv_sub(Sig: np.ndarray, act: list[int], cache: dict) -> np.ndarray:
    key = tuple(act)
    if key not in cache:
        cache[key] = np.linalg.inv(Sig[np.ix_(act, act)])
    return cache[key]


def _copy_state(st: dict) -> dict:
    return {**st, "mu": [list(x) for x in st["mu"]], "var": [list(x) for x in st["var"]], "zprev": list(st["zprev"])}


def score(X: dict, cal: dict, P: dict, steps_per_day: int = 288, state: dict | None = None, day_offset: int = 0,
          snapshots: bool = False) -> dict[str, Any]:
    """Score every reading. X = residuals.compute(...). Returns per-step arrays and the final state (to continue later)."""
    C = P["calibration"]
    st = init_state(cal) if state is None else _copy_state(state)
    snaps: dict[int, dict] = {}
    rho, esd = cal["rho"], cal["esd"]
    sd_cal = np.asarray(cal["sd"])
    mu_cal = np.asarray(cal["mu"])
    Sig = np.asarray(cal["Sigma"])
    kappa, h = cal["cusum_kappa"], cal["cusum_h"]
    alpha = 1.0 / (C["adapt_days"] * steps_per_day)
    alpha_d = 1.0 / C["adapt_days"]
    adapt_mu = {NAMES.index(x) for x in C["adapt_mean_residuals"]}
    adapt_sd = [NAMES.index(x) for x in C["adapt_spread_residuals"]]
    clip = C["cusum_clip"]
    lo_sd, hi_sd = C["adapt_sd_range"]
    mu_max = C["adapt_mean_max_sd"]
    thr, need = P["flag"]["phi"], P["flag"]["steps"]
    r, act, running, hard, U = X["r"], X["active"], X["running"], X["hard"], X["u"]
    ex = {NAMES.index(x) for x in C["cusum_exclude"]}
    n = len(r)
    out = {k: np.zeros(n) for k in ("chi2", "phi_inst", "phi_max", "S", "phi_slow", "phi_day", "phi")}
    out["m"] = np.zeros(n, dtype=int)
    out["e"] = np.full((n, K), np.nan)
    out["flag"] = np.zeros(n, dtype=bool)
    out["mu"] = np.zeros((n, K))
    out["sc"] = np.ones((n, K))
    days = []
    cache: dict = {}
    hard_any = hard.any(axis=1)
    for k in range(n):
        if snapshots and k % steps_per_day == 0:
            snaps[k // steps_per_day + day_offset] = _copy_state(st)
        g = int(running[k])
        ev, ids = [], []
        out["sc"][k] = [math.sqrt(st["var"][g][j] + (U[k, j] if np.isfinite(U[k, j]) else 0.0) ** 2) for j in range(K)]
        for j in range(K):
            if not act[k, j]:
                st["zprev"][j] = None
                continue
            zj = (r[k, j] - st["mu"][g][j]) / math.sqrt(st["var"][g][j] + U[k, j] ** 2)
            zp = st["zprev"][j]
            ej = zj if zp is None else (zj - rho[j] * zp) / math.sqrt(1 - rho[j] ** 2)
            ej /= esd[j]
            st["zprev"][j] = zj
            ev.append(ej)
            ids.append(j)
            out["e"][k, j] = ej
        m = len(ids)
        if m:
            v = np.asarray(ev)
            c2 = float(v @ _inv_sub(Sig, ids, cache) @ v)
            out["chi2"][k], out["m"][k] = c2, m
            out["phi_inst"][k] = sigma_equiv(c2, m)
            out["phi_max"][k] = float(np.max(np.abs(v)))
            idc = [i for i, j in enumerate(ids) if j not in ex]
            if idc:
                vc = np.clip(v[idc], -clip, clip)
                st["S"] = max(0.0, st["S"] + float(vc @ _inv_sub(Sig, [ids[i] for i in idc], cache) @ vc) - len(idc) - kappa)
        out["S"][k] = st["S"]
        out["phi_slow"][k] = 3.0 * st["S"] / h
        out["phi_day"][k] = st["phi_day"]
        phi = max(out["phi_inst"][k], out["phi_slow"][k], st["phi_day"], 99.0 if hard_any[k] else 0.0)
        out["phi"][k] = phi
        st["run"] = st["run"] + 1 if phi >= thr else 0
        out["flag"][k] = st["run"] >= need or bool(hard_any[k])
        clean = not out["flag"][k]
        if not clean:
            st["day_clean"] = False
        # slow baseline update of the physics residuals (only from clean readings, bounded)
        if clean:
            for j in adapt_sd:
                if not act[k, j]:
                    continue
                sdc = sd_cal[g, j]
                d = r[k, j] - st["mu"][g][j]
                d = max(-4 * sdc, min(4 * sdc, d))
                if j in adapt_mu:
                    st["mu"][g][j] = max(mu_cal[g, j] - mu_max * sdc, min(mu_cal[g, j] + mu_max * sdc, st["mu"][g][j] + alpha * d))
                st["var"][g][j] = max((lo_sd * sdc) ** 2, min((hi_sd * sdc) ** 2, st["var"][g][j] + alpha * (d * d - U[k, j] ** 2 - st["var"][g][j])))
        out["mu"][k] = st["mu"][g]
        # daily closure: Σ (R1 − its learnt mean) and the utility meter, checked at the end of each day, held next day
        if np.isfinite(r[k, 0]):
            st["day_r1"] += (r[k, 0] - st["mu"][g][0]) * P["dt_s"] / 3.6e6
        st["day_n"] += 1
        if st["day_n"] == steps_per_day:
            d_idx = (k + 1) // steps_per_day - 1
            a = abs(st["day_r1"] - st["R10_mu"]) / math.sqrt(st["R10_var"])
            r8d = X["R8d"][d_idx] if d_idx < len(X["R8d"]) else float("nan")
            b = abs(r8d - cal["R8d"]["mu"]) / cal["R8d"]["sd"] if np.isfinite(r8d) else 0.0
            days.append({"day": d_idx + day_offset, "R10": st["day_r1"], "z_R10": a, "R8d": r8d, "z_R8d": b})
            if st["day_clean"] and a < thr:
                dd = st["day_r1"] - st["R10_mu"]
                st["R10_mu"] += alpha_d * dd
                st["R10_var"] = max((0.5 * cal["R10"]["sd"]) ** 2, min((4 * cal["R10"]["sd"]) ** 2, st["R10_var"] + alpha_d * (dd * dd - st["R10_var"])))
            st["phi_day"] = max(a, b)
            st["day_r1"], st["day_n"], st["day_clean"] = 0.0, 0, True
    out["days"] = days
    out["hard"] = hard
    out["state"] = st
    if snapshots:
        out["snapshots"] = snaps
    return out


def events(flag: np.ndarray) -> list[tuple[int, int]]:
    out, start = [], None
    for k, f in enumerate(flag):
        if f and start is None:
            start = k
        if not f and start is not None:
            out.append((start, k - 1))
            start = None
    if start is not None:
        out.append((start, len(flag) - 1))
    return out


def which_fired(Sc: dict, cal: dict, k: int, steps_per_day: int = 288) -> str:
    """The residual or rule that drove φ at step k."""
    hard = Sc["hard"][k]
    if hard.any():
        return ["H1", "H2", "H3"][int(np.argmax(hard))]
    parts = {"inst": Sc["phi_inst"][k], "slow": Sc["phi_slow"][k], "day": Sc["phi_day"][k]}
    top = max(parts, key=parts.get)
    e = Sc["e"]
    if top == "day":
        d = k // steps_per_day - 1
        if 0 <= d < len(Sc["days"]):
            x = Sc["days"][d]
            return "R10" if x["z_R10"] >= x["z_R8d"] else "R8d"
        return "R10"
    if top == "slow":
        w = np.nan_to_num(np.clip(e[max(0, k - 36):k + 1], -4, 4) ** 2).sum(0)
        for x in ("R7T", "R7W"):
            w[NAMES.index(x)] = 0.0                                    # not part of the CUSUM
        return NAMES[int(np.argmax(w))]
    a = np.isfinite(e[k])
    if not a.any():
        return "-"
    Sig = np.asarray(cal["Sigma"])[np.ix_(a, a)]
    v = e[k, a]
    c = v * np.linalg.solve(Sig, v)
    return [NAMES[j] for j in np.where(a)[0]][int(np.argmax(c))]


def biased_cusum_demo(Sc: dict, steps_per_day: int = 288) -> dict[str, Any]:
    """Why NOT S = S + Φ − 1 with Φ = max|z|: on honest data E[max|z|] > 1, so S only grows and false alarms never stop."""
    pm = Sc["phi_max"]
    ok = Sc["m"] > 0
    S, out = 0.0, []
    for k in range(len(pm)):
        if ok[k]:
            S = max(0.0, S + pm[k] - 1.0)
        out.append(S)
    out = np.asarray(out)
    mean = float(np.mean(pm[ok]))
    return {"mean_phi_max": mean, "drift_per_reading": mean - 1.0, "drift_per_day": (mean - 1.0) * steps_per_day,
            "S_after_30_days": float(out[min(len(out) - 1, 30 * steps_per_day)]),
            "note": "On honest data the largest of ~8 standardised residuals averages well above 1, so S = S + Φ − 1 grows at every reading "
                    "and any threshold is crossed again and again. The CUSUM used here subtracts the expected χ² (m) plus κ, so its honest drift is negative."}
