"""Two-stage freshness (trip E → room S): typical trips, packing order, rejected inputs, F never goes up."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from twin import freshness_v2 as FV

ROOT = Path(__file__).resolve().parents[1]
CROPS = json.loads((ROOT / "data" / "crops.json").read_text(encoding="utf-8"))
H = pd.read_csv(ROOT / "results" / "live" / "hourly_live.csv", parse_dates=["time_ist"])
W = FV.weather_fn(0.0, H.T_out.round(1).tolist(), H.RH_out.round(1).tolist())
DAY = (pd.Timestamp("2026-03-15") - H.time_ist.iloc[0]).total_seconds() / 3600     # a ~32 °C morning (by 09:30)


def typical(crop: str, packing: str) -> float:
    """25 km by motorbike, picking 05:00–07:00, check-in 09:30 (0.5 h farm wait, 1 h travel, 1 h wait at the gate)."""
    r = FV.trip(CROPS[crop], W, DAY + 5, DAY + 7, DAY + 9.5, distance_km=25, mode="bike", packing=packing)
    assert r["ok"]
    return r["F_door"]


def test_jasmine_typical_trip():
    assert 77 <= typical("jasmine", "perforated_bag") <= 83
    assert 70 <= typical("jasmine", "gunny_bag") <= 78


def test_marigold_higher_than_jasmine():
    m = typical("marigold", "perforated_bag")
    assert 88 <= m <= 95
    assert m > typical("jasmine", "perforated_bag")


@pytest.mark.parametrize("crop", ["jasmine", "marigold", "rose", "tuberose", "chamanthi"])
def test_gunny_bag_always_worse_than_perforated(crop):
    for day in ("2026-02-10", "2026-05-23", "2026-08-10", "2026-10-20"):
        d = (pd.Timestamp(day) - H.time_ist.iloc[0]).total_seconds() / 3600
        for dist, mode in ((5, "walk"), (15, "bike"), (30, "auto"), (50, "bus")):
            g = FV.trip(CROPS[crop], W, d + 4, d + 6.5, d + 10, distance_km=dist, mode=mode, packing="gunny_bag")["F_door"]
            p = FV.trip(CROPS[crop], W, d + 4, d + 6.5, d + 10, distance_km=dist, mode=mode, packing="perforated_bag")["F_door"]
            assert g < p


def test_picking_after_checkin_is_rejected():
    r = FV.trip(CROPS["jasmine"], W, DAY + 8, DAY + 10, DAY + 9.5)
    assert not r["ok"] and "after the check-in" in r["error"]
    assert not FV.trip(CROPS["jasmine"], W, DAY + 7, DAY + 6, DAY + 9.5)["ok"]


def test_defaults_work_and_stages_add_up():
    r = FV.trip(CROPS["jasmine"], W, DAY + 5, DAY + 7, DAY + 9.5)
    assert r["ok"] and r["packing"] == FV.load_cfg()["trip"]["default_packing"]
    assert abs(sum(s["loss_pct"] for s in r["stages"]) - (100 - r["F_door"])) < 0.01      # stage losses are rounded to 0.001
    assert abs(sum(s["hours"] for s in r["stages"]) - (r["stages"][0]["hours"] + 2.5)) < 1e-6


def test_freshness_never_goes_up():
    rng = np.random.default_rng(3)
    st = FV.State.fromF(80.0)
    last = st.F
    for T in rng.uniform(-3, 45, 2000):
        st.step(CROPS["jasmine"], T, T, float(rng.uniform(40, 100)), 0.3, 5 / 60, 0.25)
        assert st.F <= last + 1e-12
        last = st.F


def test_shelf_life_matches_q10():
    c = CROPS["jasmine"]
    assert abs(FV.shelf_life_h(c, c["freshness"]["T_opt_C"]) - c["freshness"]["SL_ref_h"]) < 1e-9
    assert abs(FV.shelf_life_h(c, 14.0) * c["Q10"] - c["freshness"]["SL_ref_h"]) < 1e-6
