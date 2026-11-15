"""Cost page audit: the total is the sum of the BOM lines, and the glycol comparison is NOT added to it."""
import json
from pathlib import Path

import pytest

RES = Path(__file__).resolve().parent.parent / "results" / "live"
LV = ("low", "mid", "high")


@pytest.fixture(scope="module")
def C():
    return json.loads((RES / "cost_roi.json").read_text(encoding="utf-8"))


def test_total_is_sum_of_bom_lines(C):
    for lv in LV:
        assert C["total_cost_INR"][lv] == pytest.approx(sum(b[lv] for b in C["bom"]), abs=0.5)
        assert all(b["low"] <= b["mid"] <= b["high"] for b in C["bom"])


def test_glycol_comparison_is_inside_the_total_not_added(C):
    g = C["glycol_vs_old"]
    by = {b["key"]: b for b in C["bom"]}
    for lv in LV:
        new = by["chiller"][lv] + by["loop"][lv] + by["air_cooler"][lv]
        assert g["new_total_INR"][lv] == pytest.approx(new) == pytest.approx(sum(x[lv] for x in g["new_items"]))
        assert g["difference_INR"][lv] == pytest.approx(new - g["old_total_INR"][lv])
    assert "comparison only" in g["label"].lower()
    assert not any("extra" in b["key"] or "old" in b["key"] for b in C["bom"])


def test_running_and_fogger_cost_add_up(C):
    for lv in LV:
        r, f = C["running_INR_yr"][lv], C["fogger_yearly_INR"][lv]
        assert r["total_INR"] == pytest.approx(r["grid_electricity_INR"] + r["upkeep_INR"] + r["bags_INR"] + r["fogger_INR"])
        assert f["total_INR"] == pytest.approx(f["ro_water_INR"] + f["electricity_INR"] + f["disc_parts_INR"] + f["cleaning_INR"]) == pytest.approx(r["fogger_INR"])
        assert r["grid_electricity_INR"] == pytest.approx(C["twin_inputs"]["grid_kWh_per_year"] * C["tariff_INR_kWh"][lv])
    fi = C["fogger_inputs"]
    assert fi["water_L_per_year"] == pytest.approx(fi["water_L_per_day"] * 365)
    assert C["fogger_yearly_INR"]["mid"]["total_INR"] > 1000                     # no longer a Rs 115 line


def test_payback_follows_from_cost_and_benefit(C):
    for c in C["cases"].values():
        m = c["mid"]
        if m["payback_years"] is not None:
            assert m["payback_years"] == pytest.approx(m["total_cost_INR"] / (m["benefit_INR_yr"] - m["running_INR_yr"]))
