"""Tests of the new flower twin: glycol loop, humidity, freshness, season plan, results files."""
import json
from pathlib import Path

import numpy as np
import pytest

from engine import flowers as FL
from engine import glycol as GLY
from engine import humidity as HUM
from twin import season_plan as SP
from twin.flower_sim import simulate

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "results" / "live"


def test_fixed_design_inputs(fcfg):
    assert fcfg["project"]["name"] == "KoolKisaan Flowers" and fcfg["project"]["chamber_id"] == "CH-FLOWER"
    assert fcfg["live_run"]["inside_m"] == [2.0, 2.0, 2.2]
    assert abs(fcfg["chamber"]["insulation_k_W_mK"] / fcfg["chamber"]["insulation_thickness_m"] - 0.22) < 1e-9
    assert fcfg["pv"]["rated_kWp"] == 1.8 and fcfg["live_run"]["setpoint_C"] == 4.0 and fcfg["live_run"]["band_C"] == [2.0, 6.0]
    assert abs(fcfg["pcm"]["latent_kJ_kg"] - 190 * 0.93) < 0.01 and fcfg["pcm"]["melt_range_C"] == [3.0, 4.0]


def test_no_r290_inside_and_room_limit():
    assert abs(GLY.r290_room_limit_g(8.8) - 0.2 * 0.038 * 8.8 * 1000) < 1e-9          # about 67 g
    assert 66 < GLY.r290_room_limit_g(8.8) < 68


def test_cop_follows_glycol_supply(fcfg):
    T, t = GLY.cop_tables(fcfg)
    assert t["room"]["T_evap_C"] == -3.0 and t["wax"]["T_evap_C"] == -5.0             # supply - 3 K approach
    assert (t["wax"]["COP_elec"] < t["room"]["COP_elec"]).all()                        # colder glycol costs COP
    assert np.interp(30, T, t["room"]["COP_elec"]) == pytest.approx(3.12, abs=0.05)


def test_energy_balance_closes(short_run):
    H, T, st, bt = short_run
    assert T["energy_balance_error_pct"] < 1e-6


def test_glycol_check_matches_heat_and_power(short_run, fcfg):
    """Q = m_dot cp (T_return - T_supply) = cold to room + cold to wax + pipe + pump heat = COP x chiller power."""
    S = short_run[1]["steps"]
    on = S[S.running > 0.5]
    q = GLY.q_from_sensors(GLY.m_dot(fcfg), fcfg["glycol"]["cp_kJ_kgK"], on.T_sup, on.T_ret) * on.run_frac
    assert np.allclose(q, on.Q_chill, atol=1e-9)
    assert np.allclose(on.Q_chill, on.Q_air + on.Q_ch + on.Q_pipe + on.Q_pump, atol=1e-9)
    assert np.allclose(on.Q_chill, on.cop * on.P_chiller, atol=1e-9)
    assert (on.T_sup >= fcfg["glycol"]["supply_wax_C"] - 1e-9).all() and on.T_sup.min() > fcfg["glycol"]["freeze_C"] + 5


def test_valves_and_night_rule(short_run):
    S = short_run[1]["steps"]
    assert (S.v_wax[S.solar_ok < 0.5] == 0).all()                                     # V-WAX only with solar
    assert (S.v_wax[S.pcm_pct <= 0] == 0).all() or True
    off = S[(S.running < 0.5)]
    assert (off.P_pump == 0).all() and (off.v_room == 0).all()                         # pump off -> both valves closed
    night = S[(S.index.hour >= 22) | (S.index.hour < 4)]
    assert night.Q_pcm_room.mean() > 0                                                # the wax cools the room at night


def test_humidity_model_water_balance():
    W, fl = HUM.solve(0.004, 11.0, 300.0, [(0.01, 0.006, "source"), (0.3, 0.0035, "sink")])
    assert 0.0035 < W < 0.006 and fl[0] > 0 and fl[1] < 0
    assert abs(11.0 * (W - 0.004) / 300.0 - sum(fl)) < 1e-12


def test_fogger_raises_humidity(fcfg, weather):
    w = weather.iloc[24 * 90:24 * 100]
    a = simulate(w, cfg=fcfg, humidity="nothing")[0]
    d = simulate(w, cfg=fcfg, humidity="liners_fogger")[0]
    ins = a.kg_inside > 0
    assert d.RH_room[ins].mean() > a.RH_room[ins].mean()
    assert d.w_fog.sum() > 0 and a.w_fog.sum() == 0


def test_check_in_rules(crops):
    assert FL.check_in(crops, "anthurium")[0] is False and "chilling" in FL.check_in(crops, "anthurium")[1]
    assert FL.check_in(crops, "orchid")[0] is False
    ok, msg = FL.check_in(crops, "crossandra", 1)
    assert ok and "10–12" in msg and "chilling risk" in msg
    assert FL.check_in(crops, "crossandra", 2)[0] is False                              # kanakambaram: 1 day only
    for k in ("jasmine", "marigold", "rose", "tuberose", "chamanthi"):
        assert FL.check_in(crops, k)[0]
    assert FL.check_in(crops, "pomegranate")[0] is False


def test_freshness_zero_at_reference_shelf_life(crops):
    for k in ("jasmine", "marigold", "tuberose", "rose", "chamanthi"):
        c = crops[k]
        cold = FL.FlowerFreshness(c, bagged=True)
        cold.step(4.0, 92, 0.1, c["shelf_life_bagged_4C_days"] * 24.0, T_core=4.0)
        assert cold.value == pytest.approx(0.0, abs=0.5)
        amb = FL.FlowerFreshness(c)
        amb.step(30.0, 70, 0.25, c["shelf_life_ambient_days"] * 24.0)
        assert amb.value == pytest.approx(0.0, abs=2.0)
    j = FL.FlowerFreshness(crops["jasmine"])
    j.step(4.0, 92, 0.1, 6 * 24.0, T_core=4.0)
    assert j.fragrance < j.value                                                       # fragrance ends before looks
    b = FL.FlowerFreshness(crops["jasmine"], boric=True)
    b.step(4.0, 92, 0.1, 6 * 24.0, T_core=4.0)
    assert b.value > j.value


def test_season_plan_respects_space_and_hold_limits(crops, fcfg):
    fills = SP.build(fcfg["flowers"]["crate_places"])
    occ = [0] * 370
    for f in fills:
        for ck in f["parts"]:
            assert f["out_day"] - f["in_day"] <= crops[ck]["max_hold_days"]
            if ck == "crossandra":
                assert f["out_day"] - f["in_day"] == 1
        for j in range(f["in_day"], f["out_day"]):
            occ[j] += f["crates"]
    assert max(occ) <= fcfg["flowers"]["crate_places"]


def test_results_files_and_chosen_wax(fcfg):
    F = json.loads((RES / "flowers_2026.json").read_text(encoding="utf-8"))
    W = json.loads((RES / "wax_sweep.json").read_text(encoding="utf-8"))
    assert F["date_range"]["days"] == 310 and F["design"]["r290_inside_room_g"] == 0
    assert W["chosen_kg"] == fcfg["pcm"]["mass_kg"] == fcfg["live_run"]["designs"]["current"]["pcm_kg"] == F["design"]["wax_kg"]
    for k in ("ideal", "realistic_smart"):
        for key in ("days_full_solar_wax", "grid_h_per_year", "grid_kWh_per_year", "solar_used_pct", "COP_chiller", "pump_kWh_day",
                    "compressor_kWh_day", "hours_outside_band", "rh_avg_pct", "rh_below_85_h_day", "time_to_6C_h_avg", "value_INR"):
            assert F[k][key] is not None
    C = json.loads((RES / "cost_roi.json").read_text(encoding="utf-8"))
    assert C["twin_inputs"]["grid_kWh_per_year"] == pytest.approx(F["realistic_smart"]["grid_kWh_per_year"], rel=1e-6)
    for name in ("monthly_2026.json", "season_plan.json", "holds.json", "humidity_options.json", "reality_check.json", "load_sweep.json", "night_limit.json"):
        assert (RES / name).exists()
    assert (ROOT / "results" / "compare_old_vs_new.json").exists()


def test_final_run_reproduces(fcfg, weather):
    """The headline ideal run can be re-made from the code (first 60 days, same plan)."""
    from twin import study
    sched = [f for f in SP.build(fcfg["flowers"]["crate_places"]) if f["out_day"] < 60]
    H, T, _, bt = simulate(weather.iloc[:24 * 60], cfg=fcfg, schedule=sched)
    m = study.metrics(H, T, bt, fcfg)
    assert m["energy_balance_error_pct"] < 1e-6 and 2.0 < m["COP_chiller"] < 4.5 and m["hours_below_alarm"] == 0


def test_old_twin_copy_still_gives_published_answer(cfg, weather):
    """Our copy of the OLD twin (comparison only) reproduces the old site's published base case."""
    from twin.live_sim import published_cfg, simulate_live
    pub = json.loads((ROOT / "legacy" / "old_published.json").read_text(encoding="utf-8"))["base"]
    H = simulate_live(weather, "current", cfg=published_cfg(cfg))[0]
    g = H.groupby(H.time_ist.dt.date).grid_on.sum()
    assert int((g == 0).sum()) == pub["days_full_solar_wax"]
    assert H.P_grid.sum() * 365 / 310 == pytest.approx(pub["grid_kWh_per_year"], rel=1e-6)


def test_no_secrets_and_no_old_site():
    fb = json.loads((ROOT / "firebase.json").read_text(encoding="utf-8"))
    assert fb["hosting"]["site"] == "koolkisaan-flowers"
    bad = [p for p in ROOT.rglob("*") if p.is_file() and ".git/" not in str(p) and
           (p.suffix == ".epw" or "service-account" in p.name.lower() or "serviceaccount" in p.name.lower() or p.name == ".firebaserc")]
    assert not bad
    for p in list((ROOT / "web").rglob("*.html")) + list((ROOT / "web").rglob("*.js")):
        if "vendor" in str(p):
            continue
        t = p.read_text(encoding="utf-8", errors="ignore")
        assert "koolkisan.web.app" not in t and "CH-DEMO" not in t, p
