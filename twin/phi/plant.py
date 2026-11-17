"""The TRUTH PLANT and its sensors - what a real room would send, so the trust check is not tested on its own equations.

1. The flower twin runs with parameters that differ from the nominal model (config/phi.json -> truth_plant, all E):
   walls +15 %, worse curtain, COP 7 % lower, flowers and ice panels exchange heat more slowly, respiration +15 %,
   glycol flow -9 %, and the real site weather differs from the weather service (published site-error budget, random run).
2. Every owner sensor gets a fixed offset, noise, a probe time constant, rounding and rare dropouts.
3. External references the owner cannot edit: the weather service (the un-shifted weather file), the PV inverter log
   (PV power delivered to the cooling system) and the utility (DISCOM) meter (daily grid kWh) - each with its own noise.
4. Controller commands (valve duty, ice valve, fogger, night fan, defrost, loading from the ledger, watermark) are logged.
Nothing here is measured: it is a simulation (S) of what sensors would report.
"""
from __future__ import annotations

import copy
import math
from typing import Any

import numpy as np
import pandas as pd

from engine.config import load_config
from twin import reality as RL
from twin import season_plan as SP
from twin import site_error as SE
from twin import study
from twin.flower_sim import _steps, simulate
from twin.phi import model as M
from twin.phi import watermark as WM

OWNER = ["T_out_s", "RH_out_s", "P_el", "T_mid", "RH_mid", "T_high", "T_flower", "T_ice", "T_sup", "T_ret", "flow"]


def truth_options(cfg: dict, P: dict) -> tuple[dict, dict, str]:
    """(real options, config patch, humidity option) of the truth plant = best practice + the truth perturbations."""
    real, _, patch, hum = RL.practice("best", cfg)
    real, patch = dict(real), copy.deepcopy(patch)
    tp = P["truth_plant"]
    real["wall_factor"] = real.get("wall_factor", 1.0) * tp["wall_UA_factor"]
    real["curtain_E"] = tp["curtain_E"]
    real["cop_factor"] = tp["cop_factor"]
    real["resp_factor"] = tp["respiration_factor"]
    real["fin_UA_frac"] = real.get("fin_UA_frac", 1.0) * tp["ice_fin_UA_factor"]
    patch["product"] = {"pulldown_hours": tp["flower_pulldown_hours"]}
    patch["glycol"] = {"design_dT_K": tp["glycol_design_dT_K"]}
    return real, patch, hum


def run_truth(weather_api: pd.DataFrame, cfg: dict | None = None, P: dict | None = None, schedule: list | None = None,
              dither: np.ndarray | None = None, scenario: dict | None = None, real_extra: dict | None = None,
              site_shift_C: float = 0.0, dither_sup: np.ndarray | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Run the truth plant on the site weather. Returns (5-min truth frame, site hourly weather)."""
    cfg = cfg or load_config()
    P = P or M.load_phi_cfg()
    real, patch, hum = truth_options(cfg, P)
    if real_extra:
        real.update(real_extra)
    c = copy.deepcopy(cfg)
    for sec, vals in patch.items():
        c[sec].update(vals)
    B = SE.load_budget()
    site = SE.random_case(weather_api, c, B, B["random_runs"]["seed"], P["truth_plant"]["site_weather_run"])
    if site_shift_C:
        site = site.copy()
        site["T_out"] = site["T_out"] + site_shift_C
    n = len(weather_api) * 12
    if dither is None:
        dither = WM.sequence(n, P)
    if dither_sup is None:
        dither_sup = WM.sequence(n, P, P["watermark"]["seed"] + 1)
    real["setpoint_dither"] = dither
    real["supply_dither"] = dither_sup
    if schedule is None:
        nd = len(weather_api) // 24
        schedule = [f for f in SP.build(cfg["flowers"]["crate_places"]) if f["out_day"] < nd]
    _, T, _, _ = simulate(site, cfg=c, real=real, schedule=schedule, humidity=hum, steps=True, scenario=scenario)
    S = T["steps"].copy()
    S["dither"] = dither
    S["dither_sup"] = dither_sup
    return S, site


def _lag(x: np.ndarray, tau_s: float, dt: float) -> np.ndarray:
    if not tau_s:
        return x.copy()
    a = 1.0 - math.exp(-dt / tau_s)
    y = np.empty_like(x)
    y[0] = x[0]
    for k in range(1, len(x)):
        y[k] = y[k - 1] + a * (x[k] - y[k - 1])
    return y


def api_5min(weather_api: pd.DataFrame) -> dict[str, np.ndarray]:
    nH = len(weather_api)
    return {"T_out_api": _steps(weather_api["T_out"], 0.0, nH), "RH_out_api": np.clip(_steps(weather_api["RH_out"], 0.0, nH), 1, 100),
            "ps_api": _steps(weather_api["ps_Pa"], 0.0, nH) / 100.0, "ghi_api": np.clip(_steps(weather_api["ghi"], 0.5, nH), 0, None)}


def make_readings(S: pd.DataFrame, weather_api: pd.DataFrame, cfg: dict | None = None, P: dict | None = None, seed: int = 11) -> pd.DataFrame:
    """Truth frame -> what the sensors, external references and controller log would report (5-min steps)."""
    cfg = cfg or load_config()
    P = P or M.load_phi_cfg()
    dt = float(P["dt_s"])
    rng = np.random.default_rng(seed)
    n = len(S)
    tp = P["truth_plant"]
    hu = cfg["humidity"]
    m_true = (cfg["live_run"]["compressor_max_kW"] / (cfg["glycol"]["cp_kJ_kgK"] * tp["glycol_design_dT_K"]))
    run = S["run_frac"].values
    on = S["running"].values > 0.5
    # glycol temperatures: while the pump is off the loop water drifts toward the outside air
    T_sup, T_ret = S["T_sup"].values.copy(), S["T_ret"].values.copy()
    a_loop = 1.0 - math.exp(-dt / tp["glycol_loop_tau_s"])
    last = 0.0
    for k in range(n):
        if on[k] and np.isfinite(T_sup[k]):
            last = 0.5 * (T_sup[k] + T_ret[k])
        else:
            last = last + a_loop * (S["T_out"].values[k] - last)
            T_sup[k] = T_ret[k] = last
    duty = S["valve_duty"].values
    st = tp["stratification"]
    strat = np.where(duty > 0, st["fan_on_K"], st["fan_off_K"]) + st["per_K_outside"] * (S["T_out"].values - S["T_room"].values)
    truth = {
        "T_out_s": S["T_out"].values, "RH_out_s": S["RH_out"].values,
        "P_el": S["P_chiller"].values + S["P_pump"].values,
        "T_mid": S["T_room"].values, "RH_mid": S["RH_room"].values, "T_high": S["T_room"].values + strat,
        "T_flower": S["T_probe"].values, "T_ice": S["T_pcm"].values, "T_sup": T_sup, "T_ret": T_ret,
        "flow": m_true * run,
    }
    out: dict[str, Any] = {}
    for k, x in truth.items():
        s = P["sensors"][k]
        y = _lag(np.asarray(x, dtype=float), s.get("tau_s", 0), dt)
        if "offset" in s:
            y = y + rng.uniform(-s["offset"], s["offset"]) + rng.normal(0, s["noise"], n)
        if "gain" in s:
            y = y * (1 + rng.uniform(-s["gain"], s["gain"])) * (1 + rng.normal(0, s["noise_rel"], n))
        q = s["quantum"]
        y = np.round(y / q) * q
        if k.startswith("RH"):
            y = np.clip(y, 0, 100)
        y[rng.random(n) < s["dropout"]] = np.nan
        out[k] = y
        out["true_" + k] = np.asarray(x, dtype=float)
    out["ATS"] = ((S["grid_on"].values > 0.5) | (S["P_grid"].values > 1e-4)).astype(float)   # the switch shows grid whenever grid power flows
    out["door"] = S["door_s"].values                                   # seconds open in the step (door switch)
    api = api_5min(weather_api)
    out.update(api)
    ex = P["external"]
    out["P_inv"] = S["P_solar_used"].values * (1 + rng.normal(0, ex["inverter_noise_rel"], n))
    day = np.arange(n) // int(86400 / dt)
    grid_day = pd.Series(S["P_grid"].values * dt / 3600.0).groupby(day).sum().values
    discom = grid_day * (1 + rng.normal(0, ex["discom_noise_rel"], len(grid_day))) + rng.normal(0, ex["discom_noise_abs_kWh"], len(grid_day))
    out["discom_kWh"] = np.where(np.r_[day[1:] != day[:-1], True], discom[day], np.nan)   # one value at the last step of each day
    # controller log
    hod = S.index.hour.values
    mnt = S.index.minute.values
    defrost = np.zeros(n)
    for hh, mm in P["nominal"]["defrost"]["times"]:
        start = (hod == hh) & (mnt == mm)
        for j in np.where(start)[0]:
            defrost[j:j + int(P["nominal"]["defrost"]["minutes"] * 60 / dt)] = 1.0
    out.update({"duty_room": duty, "v_ice": S["v_ice"].values, "run_frac": run, "fog_duty": S["w_fog"].values / (hu["fogger_L_h"] / 3600.0),
                "nfan": (S["P_nfan"].values > 0).astype(float), "defrost": defrost, "kg": S["kg_inside"].values, "load_event": S["load_event"].values,
                "dither": S["dither"].values, "dither_sup": S["dither_sup"].values})
    for k in ("T_room", "T_pcm", "pcm_pct", "P_grid", "P_comp", "Q_chill", "Q_ch", "Q_air", "T_probe"):
        out["truth_" + k] = S[k].values
    return pd.DataFrame(out, index=S.index)


def honest_year(cfg: dict | None = None, P: dict | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The honest 310-day 2026 record (readings) and the API weather it was made from."""
    cfg = cfg or load_config()
    P = P or M.load_phi_cfg()
    w = study.study_weather()
    S, _ = run_truth(w, cfg, P)
    return make_readings(S, w, cfg, P), w
