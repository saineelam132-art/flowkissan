"""Shared helpers for the 2026 studies: the frozen study weather and the metrics of one run."""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
WEATHER = ROOT / "data" / "uncertainty" / "weather_2026_study.csv"
RES = ROOT / "results" / "live"


def study_weather():
    """Frozen real 2026 Visakhapatnam weather (Open-Meteo), 1 Jan - 6 Nov 2026 = 310 days. Same file as the old twin."""
    return pd.read_csv(WEATHER, parse_dates=["time_ist"])


def date_range(w):
    return {"from": str(w.time_ist.min())[:10], "to": str(w.time_ist.max())[:10], "days": int(w.time_ist.dt.date.nunique()),
            "label": f"{w.time_ist.min():%-d %b %Y} – {w.time_ist.max():%-d %b %Y} ({w.time_ist.dt.date.nunique()} days, real Visakhapatnam weather, digital twin)"}


def metrics(H, T, bt, cfg):
    """The numbers the brief asks for, from one run (hourly table H, totals T, batches bt)."""
    lo, hi = cfg["live_run"]["band_C"]
    shift = T["setpoint_C"] - cfg["live_run"]["setpoint_C"]
    lo, hi = lo + shift, hi + shift
    sp = cfg["setpoint"]
    days = H.time_ist.dt.date
    n = int(days.nunique())
    g = H.groupby(days).grid_on.sum()
    inside = H.kg_inside > 0
    n_in = max(1, int(inside.sum()))
    hod = H.time_ist.dt.hour
    load_h = {(cfg["live_run"]["load_hour"] + j) % 24 for j in range(cfg["live_run"]["loading_window_h"])}
    outband = (H.T_room > hi) | (H.T_room < lo)
    pv_, used = float(H.P_pv.sum()), float(H.P_solar_used.sum())
    run = H.running_h > 0
    cool = float((H.Q_air + H.Q_ch).sum())
    done = bt.dropna(subset=["F_room"]) if len(bt) else bt
    o = {
        "days": n, "days_full_solar_wax": int((g == 0).sum()),
        "grid_h_per_year": float(H.grid_on.sum() * 365 / n), "grid_kWh_per_year": float(H.P_grid.sum() * 365 / n),
        "solar_available_kWh_day": pv_ / n, "solar_used_kWh_day": used / n, "solar_used_pct": 100 * used / pv_ if pv_ else 0.0,
        "COP_chiller": float(H.Q_chill.sum() / H.P_chiller.sum()) if H.P_chiller.sum() else None,
        "COP_system": float(cool / H.P_comp.sum()) if H.P_comp.sum() else None,
        "pump_kWh_day": float(H.P_pump.sum() / n), "compressor_kWh_day": float(H.P_chiller.sum() / n),
        "fan_kWh_day": float(H.P_fan.sum() / n), "fogger_kWh_day": float(H.P_fog.sum() / n),
        "electric_kWh_day": float(H.P_comp.sum() / n),
        "solar_share_of_electricity_pct": float(100 * H.P_solar_used.sum() / H.P_comp.sum()) if H.P_comp.sum() else None,
        "grid_h_per_day": float(H.grid_on.sum() / n),
        "pipe_loss_kWh_day": float(H.Q_pipe.sum() / n), "pump_heat_kWh_day": float(H.Q_pump.sum() / n),
        "cold_to_room_kWh_day": float(H.Q_air.sum() / n), "cold_into_wax_kWh_day": float(H.Q_ch.sum() / n),
        "cold_wax_to_room_kWh_day": float(H.Q_pcm_room.clip(lower=0).sum() / n),
        "hours_outside_band": int(outband.sum()), "hours_outside_band_per_day": float(outband.sum() / n),
        "hours_outside_band_loading": int((outband & hod.isin(load_h)).sum()),
        "hours_outside_band_other": int((outband & ~hod.isin(load_h)).sum()),
        "hours_above_alarm": int((H.T_room > sp["alarm_high_C"]).sum()), "hours_below_alarm": int((H.T_room < sp["alarm_low_C"]).sum()),
        "room_max_C": float(H.T_room.max()), "room_min_C": float(H.T_room.min()), "room_mean_C": float(H.T_room.mean()),
        "night_room_max_C": float(H.T_room[(hod >= 19) | (hod < 5)].max()),
        "rh_avg_pct": float(H.RH_room[inside].mean()) if inside.any() else None,
        "rh_below_85_h_day": float((H.RH_room[inside] < sp["rh_low_alarm_pct"]).sum() / n),
        "rh_below_85_pct_of_flower_hours": float(100 * (H.RH_room[inside] < sp["rh_low_alarm_pct"]).sum() / n_in),
        "rh_in_90_95_pct_of_flower_hours": float(100 * ((H.RH_room[inside] >= 89.5) & (H.RH_room[inside] <= 95.5)).sum() / n_in),
        "flower_hours_per_day": float(inside.sum() / n),
        "water_fog_L_day": float(H.w_fog.sum() * 3600 / n), "water_tray_L_day": float(H.w_tray.sum() * 3600 / n),
        "water_condensed_coil_L_day": float(H.w_coil.sum() * 3600 / n), "water_condensed_wax_L_day": float(H.w_wax.sum() * 3600 / n),
        "water_from_flowers_L_day": float(H.w_transp.sum() * 3600 / n),
        "wax_sunrise_mean_pct": float(H.pcm_pct[hod == 6].mean()), "wax_sunrise_worst_pct": float(H.pcm_pct[hod == 6].min()),
        "wax_sunset_mean_pct": float(H.pcm_pct[hod == 18].mean()), "wax_sunset_worst_pct": float(H.pcm_pct[hod == 18].min()),
        "glycol_supply_mean_C": float(H.T_sup.mean()), "glycol_return_mean_C": float(H.T_ret.mean()),
        "energy_balance_error_pct": T["energy_balance_error_pct"],
        "fills": int(len(done)),
    }
    if len(done):
        o["flower_in_C"] = float((done.T_in_C * done.kg).sum() / done.kg.sum())
        o["time_to_6C_h_avg"] = float(done.cool_h.mean())
        o["time_to_6C_h_worst"] = float(done.cool_h.max())
        o["not_cooled_fills"] = int(done.cool_h.isna().sum())
        per = {}
        for ck, d in done.groupby("crop"):
            fills_per_day = len(d) / n
            per[ck] = {"kg_per_fill": float(d.kg.mean()), "hours_in_room": float(d.hours.mean()),
                       "freshness_kept_pct": float(d.F_room.mean()), "freshness_kept_worst_pct": float(d.F_room.min()),
                       "freshness_no_room_pct": float(d.F_ambient.mean()), "weight_loss_pct": float(d.wl_pct.mean()),
                       "weight_loss_pct_per_day": float((d.wl_pct / (d.hours / 24.0)).mean()),
                       "freshness_gain_pct_points": float((d.F_room - d.F_ambient).mean()), "fills_per_day": fills_per_day,
                       "kg_per_day": float(d.kg.sum() / n)}
        o["flowers"] = per
    return o
