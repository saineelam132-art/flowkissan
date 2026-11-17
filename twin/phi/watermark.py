"""Watermark: secret random set-point patterns (±0.3 K, 30-minute blocks) that the real plant follows.

Two carriers: (1) the room set-point (acts only when the room valve cools, ~3 % of the time here, because the ice panels
do most of the work), and (2) the chiller's glycol SUPPLY set-point (acts whenever the chiller runs, ~37 % of the time).
A replayed or model-made record does not contain TODAY's pattern, so it does not correlate with it.
The seed would be kept only on the server; this demo uses the public seed in config/phi.json (E).
"""
from __future__ import annotations

import math

import numpy as np


def sequence(n: int, P: dict, seed: int | None = None) -> np.ndarray:
    W = P["watermark"]
    rng = np.random.default_rng(W["seed"] if seed is None else seed)
    blocks = int(math.ceil(n / W["hold_steps"]))
    s = rng.choice([-1.0, 1.0], size=blocks) * W["amplitude_K"]
    return np.repeat(s, W["hold_steps"])[:n]


def expected_response(d: np.ndarray, P: dict) -> np.ndarray:
    """What the room temperature should do if it follows the pattern: a first-order lag (same in JS)."""
    a = 1.0 - math.exp(-P["dt_s"] / P["watermark"]["filter_tau_s"])
    y = np.zeros(len(d))
    for k in range(1, len(d)):
        y[k] = y[k - 1] + a * (d[k] - y[k - 1])
    return y


def daily_z(T_mid: np.ndarray, cooling: np.ndarray, d: np.ndarray, P: dict, steps_per_day: int = 288, min_steps: int | None = None) -> np.ndarray:
    """Per day: z = corr(high-passed room T, expected response) x sqrt(N) over the cooling readings.
    Honest room: large positive z. Replay / fake: z near 0. NaN when the day has too few cooling readings."""
    y = expected_response(d, P)
    n = len(T_mid)
    # high-pass: room T minus its mean over the previous hour (removes the slow daily swing)
    x = np.asarray(T_mid, dtype=float).copy()
    good = np.isfinite(x)
    xf = np.where(good, x, 0.0)
    c = np.cumsum(np.r_[0.0, xf])
    g = np.cumsum(np.r_[0.0, good.astype(float)])
    i = np.arange(1, n + 1)
    lo = np.maximum(i - 12, 0)
    hp = x - (c[i] - c[lo]) / np.maximum(g[i] - g[lo], 1)
    yhp = y - np.convolve(np.r_[np.zeros(11), y], np.ones(12) / 12, mode="valid")[:n]
    out = np.full(n // steps_per_day, np.nan)
    for day in range(n // steps_per_day):
        sl = slice(day * steps_per_day, (day + 1) * steps_per_day)
        m = cooling[sl] & np.isfinite(hp[sl])
        if m.sum() < (P["watermark"]["min_cool_steps"] if min_steps is None else min_steps):
            continue
        a, b = hp[sl][m], yhp[sl][m]
        if a.std() < 1e-9 or b.std() < 1e-9:
            out[day] = 0.0
            continue
        r = float(np.corrcoef(a, b)[0, 1])
        out[day] = r * math.sqrt(m.sum())
    return out


def supply_z(T_sup: np.ndarray, running: np.ndarray, v_ice: np.ndarray, d: np.ndarray, P: dict, steps_per_day: int = 288,
             min_steps: int = 24) -> np.ndarray:
    """Per day: z = corr(T_sup minus its mean in the same mode (ice charging / room), today's supply pattern) × √N.
    Honest chiller: large positive z. A model-made, replayed or copied-from-yesterday glycol record: z near 0."""
    n = len(T_sup)
    out = np.full(n // steps_per_day, np.nan)
    for day in range(n // steps_per_day):
        sl = slice(day * steps_per_day, (day + 1) * steps_per_day)
        x, dd = np.asarray(T_sup[sl], dtype=float), np.asarray(d[sl], dtype=float)
        ok = running[sl] & np.isfinite(x)
        if ok.sum() < min_steps:
            continue
        xs, ds = np.zeros(ok.sum()), dd[ok]
        modes = (np.asarray(v_ice[sl]) > 0.5)[ok]
        xo = x[ok]
        for mval in (False, True):
            g = modes == mval
            if g.any():
                xs[g] = xo[g] - xo[g].mean()
                ds[g] = ds[g] - ds[g].mean()
        if xs.std() < 1e-9 or ds.std() < 1e-9:
            out[day] = 0.0
            continue
        out[day] = float(np.corrcoef(xs, ds)[0, 1]) * math.sqrt(ok.sum())
    return out
