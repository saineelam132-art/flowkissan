"""Live 2026 report: the best-practice room on real weather from 1 Jan 2026 to the last saved hour.

    python -m twin.live_run            use the weather saved in data/live/
    python -m twin.live_run --fetch    first try to download newer weather from Open-Meteo (needs internet)

-> results/live/live_2026.json (headline, month by month, day by day) + results/live/hourly_live.csv
The studies (reality check, sweeps, cost) stay on the frozen 310-day file so they can be repeated exactly; this
report simply runs further, to the newest weather. Digital twin (S): nothing is measured."""
import copy
import sys

import numpy as np
import pandas as pd

from engine.config import load_config, load_crops
from twin import live_weather as LW
from twin import reality as RL
from twin import run_all as RA
from twin import season_plan as SP
from twin import site_error as SE
from twin import study
from twin.flower_sim import simulate


ADV = {"storm_codes": [65, 67, 75, 82, 86, 95, 96, 99], "storm_gust_kmh": 60.0, "storm_sun_kWh_m2": 1.0, "storm_rain_mm_day": 64.5, "low_sun_kWh_m2": 2.5,
       "imd_url": "https://mausam.imd.gov.in/",
       "note": "E – same rules as the earlier KoolKisaan advisor: storm = thunderstorm / heavy-rain weather code, gusts above 60 km/h, sun below 1 kWh/m2 or rain of 64.5 mm or more (IMD 'heavy'); low sun = below 2.5 kWh/m2. We do not predict cyclones: check the official IMD warnings."}


def weather():
    """-> (hourly frame 1 Jan -> end of the forecast, last ACTUAL hour, raw frame with rain / gust / weather code)."""
    raw = LW.load_actual()
    raw = raw[raw.time_ist >= "2026-01-01"].reset_index(drop=True)
    last = raw[~raw.is_forecast].dropna(subset=["T_out"]).time_ist.max()
    end = raw.dropna(subset=["T_out"]).time_ist.max().normalize() + pd.Timedelta(hours=23)
    w = raw.set_index("time_ist").reindex(pd.date_range(raw.time_ist.min(), end, freq="h")).rename_axis("time_ist").reset_index()
    num = ["T_out", "RH_out", "ps_Pa", "ghi", "wind"]
    w[num] = w[num].astype(float).interpolate(limit=3).ffill()
    w["ghi"] = w["ghi"].fillna(0.0)
    return w[["time_ist"] + num], last, raw


def advice(day_weather, h):
    """One advice line for a forecast day from its weather and the twin's prediction (rules in ADV)."""
    g = lambda c: pd.to_numeric(day_weather[c], errors="coerce") if c in day_weather else pd.Series(dtype=float)
    sun = float(day_weather.ghi.fillna(0).sum() / 1000.0)
    rain, gust = float(g("rain_mm").fillna(0).sum()), (float(g("gust_kmh").max()) if g("gust_kmh").notna().any() else None)
    codes = [int(c) for c in g("wcode").dropna().unique()]
    storm = bool(set(codes) & set(ADV["storm_codes"])) or (gust or 0) > ADV["storm_gust_kmh"] or sun < ADV["storm_sun_kWh_m2"] or rain >= ADV["storm_rain_mm_day"]
    grid_h = float(h.grid_on.sum())
    if storm:
        kind, text = "storm", "Storm or very dull day likely: do not take new flowers in, keep the door shut, expect grid backup. Check the IMD warning."
    elif sun < ADV["low_sun_kWh_m2"]:
        kind, text = "low_sun", "Low sun: the ice will not fill. Load less, open the door as little as possible, expect some grid backup."
    elif grid_h > 0:
        kind, text = "normal_grid", "Normal day, a little grid backup expected. Load early in the morning."
    else:
        kind, text = "normal", "Normal day: the room should run on solar + ice. Load early in the morning."
    return {"kind": kind, "text": text, "sun_kWh_m2": sun, "rain_mm": rain, "gust_kmh": gust, "outside_max_C": float(day_weather.T_out.max()),
            "outside_min_C": float(day_weather.T_out.min())}


def main(fetch=False):
    if fetch:
        LW.fetch_ishrae = lambda: (_ for _ in ()).throw(RuntimeError('not downloaded: licence forbids storing it'))
    meta = LW.update(verbose=True) if fetch else None
    cfg, crops, cal = load_config(), load_crops(), SP.load_calendar()
    RA._G.update(cfg=cfg, crops=crops, cal=cal)
    w, last, raw = weather()
    n_days = len(w) // 24
    last_day = last.normalize()
    real, wk, patch, hum = RL.practice("best", cfg)
    c = copy.deepcopy(cfg)
    c["live_run"].update(patch["live_run"])
    ww = SE.site_case(w, c, SE.load_budget(), wk) if wk else w
    sched = [f for f in SP.build(cfg["flowers"]["crate_places"]) if f["out_day"] < n_days]
    H_all, T, _, bt_all = simulate(ww, cfg=c, real=real, schedule=sched, humidity=hum)
    # everything up to the last ACTUAL weather day is the report; later days are the forecast (prediction, not a result)
    H = H_all[H_all.time_ist < last_day + pd.Timedelta(days=1)].reset_index(drop=True)
    Hf = H_all[H_all.time_ist >= last_day + pd.Timedelta(days=1)]
    bt = bt_all[pd.to_datetime(bt_all.date) + pd.to_timedelta(bt_all.hours.fillna(1e6), unit="h") <= last_day + pd.Timedelta(days=1)] if len(bt_all) else bt_all
    w_act = w[w.time_ist < last_day + pd.Timedelta(days=1)]
    m = study.metrics(H, T, bt, c)
    btv = SP.value_batches(bt, cal, crops)
    m.update(RA.seasonal_summary(H, btv, [f for f in sched if f["out_day"] < len(H) // 24]))
    monthly = RA.monthly(H, btv, sched)
    forecast = []
    for d, h in Hf.groupby(Hf.time_ist.dt.date):
        dw = raw[raw.time_ist.dt.date == d]
        hod = h.time_ist.dt.hour
        forecast.append({"date": str(d), **advice(dw if len(dw) else h.rename(columns={}), h), "room_max_C": float(h.T_room.max()), "room_avg_C": float(h.T_room.mean()),
                         "grid_h": float(h.grid_on.sum()), "grid_kWh": float(h.P_grid.sum()), "solar_kWh": float(h.P_solar_used.sum()),
                         "ice_sunrise_pct": float(h.pcm_pct[hod == 6].mean()), "ice_sunset_pct": float(h.pcm_pct[hod == 18].mean()),
                         "kg_inside_max": float(h.kg_inside.max()), "planned_in": [f for f in sched if f["in_date"] == str(d)], "planned_out": [f for f in sched if f["out_date"] == str(d)]})
    lo, hi = cfg["live_run"]["band_C"]
    daily = []
    out_day = pd.to_datetime(btv.out_date).dt.date
    for d, h in H.groupby(H.time_ist.dt.date):
        b = btv[out_day == d]
        hod = h.time_ist.dt.hour
        daily.append({"date": str(d), "outside_max_C": float(h.T_out.max()), "outside_min_C": float(h.T_out.min()), "sun_kWh_m2": float(h.ghi.sum() / 1000.0),
                      "room_avg_C": float(h.T_room.mean()), "room_max_C": float(h.T_room.max()), "room_min_C": float(h.T_room.min()),
                      "rh_avg_pct": float(h.RH_room.mean()), "ice_sunrise_pct": float(h.pcm_pct[hod == 6].mean()) if (hod == 6).any() else None,
                      "ice_sunset_pct": float(h.pcm_pct[hod == 18].mean()) if (hod == 18).any() else None,
                      "kg_inside_max": float(h.kg_inside.max()), "kg_out": float(b.kg.sum()), "value_INR": float(b.value_INR.sum()),
                      "solar_kWh": float(h.P_solar_used.sum()), "grid_kWh": float(h.P_grid.sum()), "grid_h": float(h.grid_on.sum()),
                      "electric_kWh": float(h.P_comp.sum()), "pv_available_kWh": float(h.P_pv.sum()), "hours_outside_band": int(((h.T_room > hi) | (h.T_room < lo)).sum()),
                      "fully_solar": bool(h.grid_on.sum() == 0)})
    dr = study.date_range(w_act)
    out = {"about": "Live 2026 report: KoolKisaan Flowers (ice panels, best practice) on real Visakhapatnam weather from 1 January 2026 to the newest saved hour.",
           "date_range": dr, "weather_last_hour": str(last), "weather_source": "Open-Meteo archive (ERA5) + recent hours, saved in data/live/ (CC BY 4.0)",
           "weather_update": (meta or {}).get("last_attempt"), "weather_errors": (meta or {}).get("errors"),
           "note": "Digital twin (S). Nothing is measured. Best practice = realistic losses (hot-site weather correction included) + good design + good operation. Prices are E.",
           "headline": {k: m.get(k) for k in RA.KEYS_SHORT + ["hours_above_band_top", "kg_stored", "days_with_stock", "value_INR", "price_uplift_INR", "loss_avoided_INR",
                                                               "solar_available_kWh_day", "solar_used_kWh_day", "water_fog_L_day", "fills_done", "surplus_held_INR", "high_value_days"]},
           "totals": {"days": dr["days"], "electric_kWh": float(H.P_comp.sum()), "solar_kWh": float(H.P_solar_used.sum()), "grid_kWh": float(H.P_grid.sum()),
                      "grid_h": float(H.grid_on.sum()), "pv_available_kWh": float(H.P_pv.sum()), "days_fully_solar": int(sum(x["fully_solar"] for x in daily)), "days_with_grid": int(sum(not x["fully_solar"] for x in daily)), "grid_months": study.grid_months(H),
                      "hours_below_2C": int((H.T_room < 2.0).sum()), "room_min_C": float(H.T_room.min()), "room_max_C": float(H.T_room.max()),
                      "grid_bill_INR": float(H.P_grid.sum() * cfg["live_run"]["money"]["grid_tariff_INR_kWh"]), "tariff_INR_kWh": cfg["live_run"]["money"]["grid_tariff_INR_kWh"]},
           "by_flower": m["by_flower"], "by_season": m["by_season"], "monthly": monthly, "daily": daily,
           "forecast": {"about": "PREDICTION: the Open-Meteo forecast run through the twin, starting from today's simulated room and ice state. Not a result.",
                        "days": forecast, "rules": ADV}}
    RA.write("live_2026.json", out)
    cols = ["time_ist", "T_out", "RH_out", "T_room", "RH_room", "pcm_pct", "T_pcm", "T_sup", "T_ret", "P_pv", "P_solar_used", "P_grid", "P_comp", "P_pump",
            "grid_on", "running_h", "v_room", "v_ice", "kg_inside", "Q_air", "Q_ch", "Q_pcm_room", "Q_chill", "cop", "door_s"]
    Hx = H_all[cols].copy()
    Hx["ghi"], Hx["wind"] = ww.ghi.values[:len(Hx)], w.wind.values[:len(Hx)]
    Hx["is_forecast"] = (Hx.time_ist >= last_day + pd.Timedelta(days=1)).astype(int)
    Hx.round({c_: 3 for c_ in cols[1:] + ["ghi", "wind"]}).to_csv(RA.RES / "hourly_live.csv", index=False)
    t = out["totals"]
    print(dr["label"], "| fully solar days", t["days_fully_solar"], "| grid kWh", round(t["grid_kWh"], 1), "h", round(t["grid_h"]), "| electric", round(t["electric_kWh"]),
          "| kg", round(m["kg_stored"]), "| value", round(m["value_INR"]))


if __name__ == "__main__":
    main("--fetch" in sys.argv)
