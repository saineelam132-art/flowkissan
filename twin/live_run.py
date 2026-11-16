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


def weather():
    w = LW.load_actual()
    w = w[~w.is_forecast & (w.time_ist >= "2026-01-01")].reset_index(drop=True)
    last = w.dropna(subset=["T_out"]).time_ist.max()
    w = w[w.time_ist <= last]
    end = last.normalize() + pd.Timedelta(hours=23)                   # pad the last day to 24 h with the last values
    w = w.set_index("time_ist").reindex(pd.date_range(w.time_ist.min(), end, freq="h")).rename_axis("time_ist").reset_index()
    num = ["T_out", "RH_out", "ps_Pa", "ghi", "wind"]
    w[num] = w[num].astype(float).interpolate(limit=3).ffill()
    w["ghi"] = w["ghi"].fillna(0.0)
    return w[["time_ist"] + num], last


def main(fetch=False):
    meta = LW.update(verbose=True) if fetch else None
    cfg, crops, cal = load_config(), load_crops(), SP.load_calendar()
    RA._G.update(cfg=cfg, crops=crops, cal=cal)
    w, last = weather()
    n_days = len(w) // 24
    real, wk, patch, hum = RL.practice("best", cfg)
    c = copy.deepcopy(cfg)
    c["live_run"].update(patch["live_run"])
    ww = SE.site_case(w, c, SE.load_budget(), wk) if wk else w
    sched = [f for f in SP.build(cfg["flowers"]["crate_places"]) if f["out_day"] < n_days]
    H, T, _, bt = simulate(ww, cfg=c, real=real, schedule=sched, humidity=hum)
    m = study.metrics(H, T, bt, c)
    btv = SP.value_batches(bt, cal, crops)
    m.update(RA.seasonal_summary(H, btv, sched))
    monthly = RA.monthly(H, btv, sched)
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
    dr = study.date_range(w)
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
           "by_flower": m["by_flower"], "by_season": m["by_season"], "monthly": monthly, "daily": daily}
    RA.write("live_2026.json", out)
    cols = ["time_ist", "T_out", "RH_out", "T_room", "RH_room", "pcm_pct", "T_pcm", "T_sup", "T_ret", "P_pv", "P_solar_used", "P_grid", "P_comp", "P_pump",
            "grid_on", "running_h", "v_room", "v_ice", "kg_inside", "Q_air", "Q_ch", "Q_pcm_room", "Q_chill", "cop", "door_s"]
    H[cols].round({c_: 3 for c_ in cols[1:]}).to_csv(RA.RES / "hourly_live.csv", index=False)
    t = out["totals"]
    print(dr["label"], "| fully solar days", t["days_fully_solar"], "| grid kWh", round(t["grid_kWh"], 1), "h", round(t["grid_h"]), "| electric", round(t["electric_kWh"]),
          "| kg", round(m["kg_stored"]), "| value", round(m["value_INR"]))


if __name__ == "__main__":
    main("--fetch" in sys.argv)
