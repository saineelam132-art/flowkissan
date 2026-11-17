"""Trust check (φ): special functions, scoring behaviour on synthetic residuals, and the saved 2026 evaluation (S)."""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from twin.phi import attacks as AT
from twin.phi import model as M
from twin.phi import score as SC
from twin.phi.residuals import NAMES

ROOT = Path(__file__).resolve().parents[1]
EVAL = ROOT / "results" / "live" / "phi_eval_2026.json"
P = M.load_phi_cfg()
K = len(NAMES)


def test_chi2_and_normal():
    assert abs(SC.chi2_sf(3.841458820694124, 1) - 0.05) < 1e-9
    assert abs(SC.chi2_sf(18.307038053275146, 10) - 0.05) < 1e-9
    assert abs(SC.norm_isf(0.00134989803163) - 3.0) < 1e-6
    assert SC.sigma_equiv(1e6, 3) == 8.3 and SC.sigma_equiv(0.0, 3) == 0.0
    # same false-alarm chance whatever the number of residuals
    for m in (2, 5, 10):
        x = 2 * m
        assert abs(SC.sigma_equiv(x, m) - SC.norm_isf(SC.chi2_sf(x, m))) < 1e-12


def _synthetic(n_days=40, bias_from=None, bias=0.0, seed=0):
    rng = np.random.default_rng(seed)
    n = n_days * 288
    r = rng.normal(0, 1, (n, K))
    if bias_from is not None:
        r[bias_from:, 0] += bias
    act = np.ones((n, K), bool)
    act[:, 2] = False
    X = {"r": r, "u": np.zeros((n, K)), "active": act, "running": np.zeros(n, bool), "hard": np.zeros((n, 3), bool),
         "R10": np.zeros(n_days), "R8d": rng.normal(0, 0.05, n_days)}
    return X


def test_honest_white_noise_rarely_flags_and_bias_is_caught():
    X = _synthetic()
    cal = SC.calibrate(X, P)
    Sc = SC.score(X, cal, P)
    c0 = 21 * 288
    assert len([e for e in SC.events(Sc["flag"]) if e[0] >= c0]) <= 2
    Xb = _synthetic(bias_from=30 * 288, bias=4.0)
    Sb = SC.score(Xb, cal, P)
    f = np.where(Sb["flag"][30 * 288:])[0]
    assert len(f) and f[0] < 12                               # a 4σ lie on one residual: flagged within an hour
    assert SC.which_fired(Sb, cal, 30 * 288 + int(f[0])) == "R1"


def test_biased_cusum_drifts_up():
    X = _synthetic()
    cal = SC.calibrate(X, P)
    demo = SC.biased_cusum_demo(SC.score(X, cal, P))
    assert demo["mean_phi_max"] > 1.0 and demo["drift_per_day"] > 0


def test_replay_fingerprint():
    idx = pd.date_range("2026-06-01", periods=3 * 288, freq="5min")
    rng = np.random.default_rng(1)
    R = pd.DataFrame({s: rng.normal(0, 1, len(idx)) for s in AT.OWNER}, index=idx)
    assert not AT.replay_fingerprint(R).any()
    R2 = R.copy()
    for s in AT.OWNER:
        v = R2[s].to_numpy().copy()
        v[2 * 288:] = v[288:2 * 288]
        R2[s] = v
    assert AT.replay_fingerprint(R2)[2 * 288 + 12:].all()


def test_evaluation_results_are_honest():
    res = json.loads(EVAL.read_text())
    assert "S (simulated)" in res["_note"]
    h = res["honest_year"]
    assert h["false_flags_per_30_days"] < 3.0
    cases = {c["key"]: c for c in res["cases"]}
    assert set(cases) == {c.key for c in AT.CASES}
    for c in cases.values():
        assert c["n"] == P["evaluation"]["starts"]
    # big, simple lies are caught; the fully consistent fake on the real weather is not caught by physics
    for k in ("room_offset_5", "out_offset_8", "power_40", "replay"):
        assert cases[k]["detection_rate"] >= 0.9, k
    assert cases["consistent_same"]["by_layer_rate"].get("physics", 0.0) < 0.5
    assert cases["replay"]["by_layer_rate"].get("hash", 0) >= 0.9
