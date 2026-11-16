"""Run every study of KoolKisaan Flowers and write the results files (about 3 minutes on 4 cores).

    python -m twin.run_all

results/live/ice_sweep.json        ice mass 100-145 kg, the chosen mass
results/live/flowers_2026.json     final design: ideal and realistic + smart controller, seasonal plan, set-point 5 C
results/live/monthly_2026.json     month by month: kg, days with stock, energy, grid, room, freshness, Rs captured
results/live/season_plan.json      the yearly loading schedule and the daily prices (E)
results/live/holds.json            freshness kept after 1/2/3 days per flower
results/live/load_sweep.json       60-150 kg per fill + crate places
results/live/humidity_options.json the 4 humidity options
results/live/reality_check.json    each loophole alone, all together, leave-one-out
results/live/night_limit.json      grid-help limit 5.5 / 6.0 / 6.5 C
results/compare_old_vs_new.json    old design (R290 in the room, pomegranate, 5 C) on the same weather
results/live/hourly_flowers.csv    hour-by-hour final run (realistic)
Everything is digital-twin (S) output on real 2026 weather. Nothing is measured. E = assumption.
"""
import copy
import datetime as dt
import json
import os
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

from engine import flowers as FL
from engine import glycol as GLY
from engine.config import load_config, load_crops
from twin import reality as RL
from twin import season_plan as SP
from twin import site_error as SE
from twin import study
from twin.flower_sim import simulate

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "results" / "live"
_G = {}


def _init():
    cfg = load_config()
    w = study.study_weather()
    _G.update(cfg=cfg, w=w, hot=SE.site_case(w, cfg, SE.load_budget(), "hot"), crops=load_crops(), cal=SP.load_calendar())
    n = len(w) // 24
    for places in (cfg["flowers"]["crate_places"], cfg["flowers"]["crate_places_extra_racks"]):
        _G[f"sched{places}"] = [f for f in SP.build(places) if f["out_day"] < n]


def realistic(extra=None, skip=None):
    return RL.spec([k for k in RL.ORDER if k != skip], _G["cfg"], extra)


def run_job(job):
    """job = dict(key, real=(real, weather kind) or None, seasonal=bool/places, cfg_patch, + simulate kwargs)."""
    if not _G:
        _init()
    job = dict(job)
    key = job.pop("key")
    real, wk = job.pop("real", None) or ({}, None)
    seasonal = job.pop("seasonal", False)
    keep = job.pop("keep", False)
    cfg = _G["cfg"]
    patch = job.pop("cfg_patch", None)
    if patch:                                                         # design option: change some config values for this run only
        cfg = copy.deepcopy(cfg)
        for sec, vals in patch.items():
            cfg[sec].update(vals)
    if job.get("protect"):
        real = dict(real, protect_above_C=job.pop("protect"))
    w = _G["hot"] if wk else _G["w"]
    kw = dict(job)
    sched = None
    if seasonal:
        sched = _G[f"sched{seasonal if seasonal is not True else cfg['flowers']['crate_places']}"]
        kw["schedule"] = sched
    H, T, st, bt = simulate(w, cfg=cfg, real=real, **kw)
    m = study.metrics(H, T, bt, cfg)
    if seasonal:
        btv = SP.value_batches(bt, _G["cal"], _G["crops"])
        m.update(seasonal_summary(H, btv, sched))
        m["monthly"] = monthly(H, btv, sched)
        if keep:
            m["_H"], m["_bt"] = H, btv
    return key, m


def seasonal_summary(H, btv, sched):
    n = H.time_ist.dt.date.nunique()
    stock, high = SP.stock_days(sched, n, _G["cal"])
    by_season = {}
    for k, d in btv.groupby("season"):
        by_season[k] = {"label": SP.SEASONS[k], "kg": float(d.kg.sum()), "value_INR": float(d.value_INR.sum()),
                        "price_uplift_INR": float(d.value_INR[d.value_kind == "price uplift"].sum()),
                        "loss_avoided_INR": float(d.value_INR[d.value_kind == "loss avoided"].sum()),
                        "surplus_held_INR": float(d.value_INR[d.value_kind == "surplus held"].sum())}
    per = {}
    for k, d in btv.groupby("crop"):
        per[k] = {"kg": float(d.kg.sum()), "fills": int(len(d)), "hold_days_avg": float((d.hours / 24).mean()),
                  "freshness_kept_pct": float(d.F_room.mean()), "freshness_kept_worst_pct": float(d.F_room.min()),
                  "freshness_no_room_pct": float(d.F_ambient.mean()), "weight_loss_pct": float(d.wl_pct.mean()),
                  "fragrance_kept_pct": float(d.fragrance.astype(float).mean()) if d.fragrance.notna().any() else None,
                  "value_INR": float(d.value_INR.sum())}
    return {"kg_stored": float(btv.kg.sum()), "kg_days": float((btv.kg * btv.hours / 24).sum()), "fills_done": int(btv.fill.nunique()),
            "days_with_stock": stock, "high_value_days": high, "value_INR": float(btv.value_INR.sum()),
            "price_uplift_INR": float(btv.value_INR[btv.value_kind == "price uplift"].sum()),
            "loss_avoided_INR": float(btv.value_INR[btv.value_kind == "loss avoided"].sum()),
            "surplus_held_INR": float(btv.value_INR[btv.value_kind == "surplus held"].sum()),
            "by_season": by_season, "by_flower": per}


def monthly(H, btv, sched):
    lo, hi = _G["cfg"]["live_run"]["band_C"]
    rows = []
    mo_out = pd.to_datetime(btv.out_date).dt.month
    for mth, h in H.groupby(H.time_ist.dt.month):
        d = btv[mo_out == mth]
        ins = h.kg_inside > 0
        hod = h.time_ist.dt.hour
        rows.append({
            "month": int(mth), "days": int(h.time_ist.dt.date.nunique()),
            "kg_stored": float(d.kg.sum()), "days_with_stock": int(h.groupby(h.time_ist.dt.date).kg_inside.max().gt(0).sum()),
            "kg_inside_max": float(h.kg_inside.max()),
            "energy_kWh": float(h.P_comp.sum()), "solar_kWh": float(h.P_solar_used.sum()), "grid_kWh": float(h.P_grid.sum()),
            "grid_h": float(h.grid_on.sum()), "room_avg_C": float(h.T_room.mean()), "room_max_C": float(h.T_room.max()),
            "rh_avg_pct": float(h.RH_room[ins].mean()) if ins.any() else None,
            "outside_avg_C": float(h.T_out.mean()), "outside_max_C": float(h.T_out.max()),
            "hours_outside_band": int(((h.T_room > hi) | (h.T_room < lo)).sum()),
            "ice_sunrise_mean_pct": float(h.pcm_pct[hod == 6].mean()), "ice_sunrise_worst_pct": float(h.pcm_pct[hod == 6].min()),
            "door_openings": int((h.door_s > 0).sum()),
            "freshness_at_takeout_pct": {k: float(v.F_room.mean()) for k, v in d.groupby("crop")},
            "value_INR": float(d.value_INR.sum()),
        })
    return rows


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items() if not str(k).startswith("_")}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else round(float(o), 4)
    if isinstance(o, np.integer):
        return int(o)
    return o


def write(name, obj, folder=RES):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_text(json.dumps(clean(obj), indent=1, ensure_ascii=False), encoding="utf-8")


# ------------------------------------------------------------------ old design on the same weather
def old_design():
    from twin.live_sim import simulate_live
    old = json.loads((ROOT / "legacy" / "old_design.json").read_text(encoding="utf-8"))
    from engine.config import _strip_notes
    old = _strip_notes(old)
    w = _G["w"]
    tm = json.loads((ROOT / "legacy" / "old_space_budget.json").read_text(encoding="utf-8"))
    real_fix = {"extra_C_room_kJ_K": tm["thermal_mass"]["rack_kJ_K"], "crate": {"kg_per_crate": tm["kg_per_crate"], "kJ_K_each": tm["thermal_mass"]["crate_kJ_K_each"]},
                "crop_cp": True, "wall_factor": 30.8 / 25.6 * 1.10,
                "door_times": [[6, 0], [6, 10], [8, 0], [10, 0], [12, 0], [14, 0], [16, 0], [17, 0]], "door_seconds": 20, "curtain_E": 0.70,
                "evap_fan_W": 30, "circ_fan_W": 10, "lights_door_only": True, "controller_W": 10,
                "defrost": {"times": [[3, 0], [15, 0]], "minutes": 20, "heater_W": 0, "fan_on": True},
                "latent_frac": 0.90, "melt_range_C": [3.0, 5.0], "fin_UA_frac": 0.75,
                "start_loss_frac": 0.20, "cop_hot_penalty": {"above_T_out_C": 35.0, "frac": 0.10}, "pv_dust_per_day": 0.003, "pv_clean_days": 7, "pv_wiring_loss": 0.03,
                "intake_random": [50.0, 250.0, 2026], "band_K": 1.0, "ats_release_C": 6.0, "ats_delay_steps": 3, "solar_first": True}
    out = {}
    for key, real, ww in (("ideal", {}, w), ("realistic_smart", real_fix, _G["hot"])):
        H, T, _, bt = simulate_live(ww, "current", cfg=old, crop_key="pomegranate", real=real)
        n = H.time_ist.dt.date.nunique()
        g = H.groupby(H.time_ist.dt.date).grid_on.sum()
        out[key] = {"days": int(n), "days_full_solar_ice": int((g == 0).sum()), "grid_h_per_year": float(H.grid_on.sum() * 365 / n),
                    "grid_kWh_per_year": float(H.P_grid.sum() * 365 / n), "electric_kWh_day": float(H.P_comp.sum() / n),
                    "COP_chiller": float(np.nanmean(H.COP[H.running_h > 0])), "COP_system": float(H.Q_cool.sum() / H.P_comp.sum()),
                    "solar_used_pct": float(100 * H.P_solar_used.sum() / H.P_pv.sum()), "pump_kWh_day": 0.0,
                    "hours_outside_2_8": int(((H.T_room > 8) | (H.T_room < 2)).sum()), "room_mean_C": float(H.T_room.mean()),
                    "T_evap_C": old["refrigeration"]["T_evap_C"], "r290_inside_room_g": [old["refrigeration"]["charge_g_min"], old["refrigeration"]["charge_g_max"]]}
    return out


# ------------------------------------------------------------------ main
KEYS_SHORT = ["days", "days_full_solar_ice", "grid_h_per_year", "grid_kWh_per_year", "solar_used_pct", "COP_chiller", "COP_system", "electric_kWh_day", "solar_share_of_electricity_pct", "grid_h_per_day",
              "pump_kWh_day", "compressor_kWh_day", "hours_outside_band", "hours_outside_band_loading", "hours_outside_band_other", "hours_above_alarm",
              "night_room_max_C", "grid_h", "days_with_grid", "grid_months", "hours_below_2C", "room_min_C", "rh_avg_pct", "rh_below_85_h_day", "time_to_6C_h_avg", "time_to_6C_h_worst", "ice_sunrise_mean_pct", "ice_sunrise_worst_pct"]
short = lambda m, extra=(): {k: m.get(k) for k in list(KEYS_SHORT) + list(extra)}


def main(procs=None):
    _init()
    cfg, crops, cal, w = _G["cfg"], _G["crops"], _G["cal"], _G["w"]
    dr = study.date_range(w)
    note = "Digital twin (S) on real 2026 Visakhapatnam weather. Nothing here is measured. E = assumption (config/design.json -> assumptions_E, data/crops.json, data/season_calendar.json)."
    E_cfg = cfg["assumptions_E"]
    R_all = realistic()
    pool = Pool(procs or max(1, min(4, os.cpu_count() or 2)), initializer=_init)

    # ---- 1) ice sweep (seasonal plan, realistic + smart controller; ideal for reference)
    masses = cfg["pcm"]["mass_sweep_kg"]
    jobs = [{"key": ("real", m), "pcm_kg": m, "real": R_all, "seasonal": True} for m in [0] + masses]
    jobs += [{"key": ("ideal", m), "pcm_kg": m, "seasonal": True} for m in masses]
    r = dict(pool.map(run_job, jobs))
    price = cfg["pcm"]["price_INR_kg"]
    fixed = cfg["pcm"].get("fixed_cost_INR", [0, 0, 0])
    tariff = cfg["live_run"]["money"]["grid_tariff_INR_kWh"]
    ref = r[("real", 0)]
    rows = []
    for m in masses:
        a, i = r[("real", m)], r[("ideal", m)]
        cost = m * price + fixed[1]
        rows.append({"ice_kg": m, "ice_cost_INR": cost, "realistic": short(a, ("value_INR",)), "ideal": short(i),
                     "grid_h_avoided_vs_no_ice": ref["grid_h_per_year"] - a["grid_h_per_year"],
                     "grid_kWh_avoided_vs_no_ice": ref["grid_kWh_per_year"] - a["grid_kWh_per_year"],
                     "ten_year_cost_INR": cost + 10 * a["grid_kWh_per_year"] * tariff})
    best = min(rows, key=lambda x: x["ten_year_cost_INR"])
    chosen = best["ice_kg"]
    write("ice_sweep.json", {"about": "Cold-storage mass sweep (water / ice panels) on the seasonal plan, realistic model + smart controller. Rule: lowest 10-year cost = storage material + 10 years of grid bill.",
                             "date_range": dr, "note": note, "storage": cfg["pcm"]["name"], "ice_price_INR_kg": price, "fixed_cost_INR": fixed, "tariff_INR_kWh": tariff,
                             "no_ice_realistic": short(ref), "rows": rows, "chosen_kg": chosen, "chosen_cost_INR": chosen * price + fixed[1],
                             "chosen_cost_range_INR": [chosen * cfg["pcm"]["price_range_INR_kg"][0] + fixed[0], chosen * cfg["pcm"]["price_range_INR_kg"][1] + fixed[2]],
                             "why": f"Water costs about nothing, so the biggest mass that was tested ({chosen} kg) wins: it needs the least grid electricity.",
                             "E": {k: v for k, v in E_cfg.items() if k.startswith("pcm.")}})
    P = {"pcm_kg": chosen}

    # ---- 2) everything else with the chosen mass
    jobs = [{"key": "final_ideal", "seasonal": True, "keep": True, **P}, {"key": "final_realistic", "seasonal": True, "keep": True, "real": R_all, **P},
            {"key": "sp5_ideal", "seasonal": True, "setpoint_C": 5.0, **P}, {"key": "sp5_realistic", "seasonal": True, "setpoint_C": 5.0, "real": R_all, **P},
            {"key": "extra_racks", "seasonal": cfg["flowers"]["crate_places_extra_racks"], "real": R_all, **P},
            {"key": "boric", "seasonal": True, "real": R_all, **P}]
    for h in cfg["humidity"]["options"]:
        jobs.append({"key": ("hum", h), "seasonal": True, "humidity": h, "real": R_all, **P})
    cs = RL.cases(cfg)
    fl_keys_early = list(cfg["flowers"]["allowed"])
    for k in RL.ORDER:
        jobs.append({"key": ("one", k), "seasonal": True, "real": RL.spec([k], cfg), **P})
        jobs.append({"key": ("loo", k), "seasonal": True, "real": realistic(skip=k), **P})
    jobs += [{"key": "real_simple", "seasonal": True, "real": realistic({"simple_controller": True}), **P},
             {"key": "ideal_simple", "seasonal": True, "real": ({"simple_controller": True}, None), **P},
             {"key": "real_no_grid", "seasonal": True, "real": realistic({"no_grid": True}), **P},
             {"key": "ideal_no_grid", "seasonal": True, "real": ({"no_grid": True}, None), **P}]
    def pjob(key, kind, tweak=None, **kw):
        real, wk, patch, hum = RL.practice(kind, cfg)
        real, patch = dict(real), copy.deepcopy(patch)
        if tweak:
            out_ = tweak(real, patch, hum)
            hum = out_ if isinstance(out_, str) else hum
        return {"key": key, "real": (real, wk), "cfg_patch": patch, "humidity": hum, **P, **kw}
    bp, rk = cfg["reality"]["best"], cfg["reality"]["racks"]
    def t_door(real, patch, hum): real.update(door_times=bp["door"]["times"], door_seconds=bp["door"]["seconds"], curtain_E=bp["door"]["curtain_E"])
    def t_load(real, patch, hum): patch["live_run"]["load_hour"] = bp["load_hour"]
    def t_bags(real, patch, hum): return "liners_fogger"
    def t_roof(real, patch, hum): real.pop("roof_solar", None)
    def t_floor(real, patch, hum): real.pop("floor", None)
    def t_led(real, patch, hum): real["lights_door_only"] = True
    def t_fan(real, patch, hum): real.update(night_fan=bp["night_fan"], circ_fan_W=0)
    def t_rack(real, patch, hum): real["extra_C_room_kJ_K"] = rk["frp"]["kg_total"] * rk["frp"]["cp_kJ_kgK"]
    ITEMS = [("door", "4 door openings a day, good curtain + door closer", t_door), ("load", "Load at 06:00, never 11:00–15:00", t_load),
             ("bags", "Flowers in perforated bags (+ fogger)", t_bags), ("roof", "Shade over the room + white roof", t_roof), ("floor", "Insulated floor", t_floor),
             ("led", "LED light only when the door is open", t_led), ("fan", "Night circulation fan (12 W EC) instead of an always-on fan", t_fan),
             ("rack", "FRP racks instead of steel", t_rack)]
    jobs += [pjob("best", "best", seasonal=True, keep=True), pjob("poor", "poor", seasonal=True)]
    jobs += [pjob(("item", k), "poor", tw, seasonal=True) for k, _, tw in ITEMS]
    for mat in rk:
        jobs.append(pjob(("rack", mat), "best", lambda real, patch, hum, mat=mat: real.update(extra_C_room_kJ_K=rk[mat]["kg_total"] * rk[mat]["cp_kJ_kgK"]), seasonal=True))
    for ck in fl_keys_early:
        for hd in (1, 2, 3):
            for kind in ("best", "poor"):
                jobs.append(pjob(("phold", kind, ck, hd), kind, lambda real, patch, hum: real.pop("intake_random", None), crop_key=ck, hold_days=hd,
                                 load_kg=cfg["flowers"]["crate_places"] * crops[ck]["kg_per_crate_mid"]))
    for pr in (5.5, 6.0, 6.5):
        jobs.append({"key": ("night", pr), "seasonal": True, "real": R_all, "protect": pr, **P})
        jobs.append({"key": ("night_ideal", pr), "seasonal": True, "protect": pr, **P})
    for kg in cfg["live_run"]["load_sweep_kg"]:
        jobs.append({"key": ("load", kg), "load_kg": kg, "crop_key": "marigold", "real": realistic(skip="load_var"), **P})
    places = cfg["flowers"]["crate_places"]
    fl_keys = [k for k in cfg["flowers"]["allowed"]]
    for ck in fl_keys:
        for hd in (1, 2, 3):
            for mode, rr in (("ideal", None), ("realistic", realistic(skip="load_var"))):
                jobs.append({"key": ("hold", ck, hd, mode), "crop_key": ck, "hold_days": hd, "load_kg": places * crops[ck]["kg_per_crate_mid"], "real": rr, **P})
    jobs.append({"key": ("hold", "mixed", 1, "realistic"), "crop_key": "mixed", "hold_days": 1, "real": realistic(skip="load_var"), **P})
    r2 = dict(pool.map(run_job, jobs))
    pool.close()
    fi, fr, fb, fp = r2["final_ideal"], r2["final_realistic"], r2["best"], r2["poor"]

    # ---- season plan + prices
    sched = _G[f"sched{places}"]
    full = SP.build(places)
    stock_y, high_y = SP.stock_days(full, 365, cal)
    days = [dt.date(2026, 1, 1) + dt.timedelta(days=i) for i in range(365)]
    write("season_plan.json", {
        "about": "Yearly loading plan built from data/season_calendar.json (twin/season_plan.py). All E.", "note": note,
        "simulated_until": dr["to"], "fills_full_year": full, "fills_simulated": len(sched),
        "days_with_stock_full_year": stock_y, "high_value_days_full_year": high_y,
        "days_with_stock_simulated": fr["days_with_stock"], "high_value_days_simulated": fr["high_value_days"],
        "research_estimate": cal["research_estimate"],
        "high_value_definition": "days with stock that belongs to a festival hold or to post-festival surplus (glut saving)",
        "prices_INR_kg": {"dates": [str(d) for d in days], **{ck: [round(SP.price(cal, crops, ck, d)) for d in days] for ck in fl_keys}},
        "calendar": cal, "seasons": SP.SEASONS})

    # ---- flowers_2026.json (the headline file)
    def head(m):
        o = short(m, ("solar_available_kWh_day", "solar_used_kWh_day", "fan_kWh_day", "fogger_kWh_day", "pipe_loss_kWh_day", "pump_heat_kWh_day",
                      "cold_to_room_kWh_day", "cold_into_ice_kWh_day", "cold_ice_to_room_kWh_day", "room_max_C", "room_mean_C", "water_fog_L_day",
                      "glycol_supply_mean_C", "glycol_return_mean_C", "energy_balance_error_pct", "kg_stored", "kg_days", "fills_done", "days_with_stock",
                      "high_value_days", "value_INR", "price_uplift_INR", "loss_avoided_INR", "surplus_held_INR", "by_season", "by_flower", "days_with_grid", "grid_months", "hours_below_2C", "room_min_C"))
        o["value_INR_per_day_with_stock"] = m["value_INR"] / max(1, m["days_with_stock"])
        return o
    holds = {}
    for ck in fl_keys + ["mixed"]:
        for hd in (1, 2, 3):
            for mode in ("ideal", "realistic"):
                m = r2.get(("hold", ck, hd, mode))
                if not m:
                    continue
                for c2, v in m["flowers"].items():
                    ok = hd <= crops[c2]["max_hold_days"]
                    holds.setdefault(c2 if ck != "mixed" else f"{c2} (in mixed load)", {}).setdefault(mode, {})[str(hd)] = {
                        "freshness_kept_pct": v["freshness_kept_pct"], "freshness_no_room_pct": v["freshness_no_room_pct"],
                        "weight_loss_pct": v["weight_loss_pct"], "hours_in_room": v["hours_in_room"], "kg_per_fill": v["kg_per_fill"],
                        "time_to_6C_h": m.get("time_to_6C_h_avg"), "allowed": ok,
                        "fragrance_kept_pct": None, "value_saved_INR_per_fill": v["kg_per_fill"] * (v["freshness_kept_pct"] - v["freshness_no_room_pct"]) / 100.0
                        * float(np.mean(list(crops[c2]["price_base_INR_kg"].values())))}
    for ck in fl_keys:
        for hd in (1, 2, 3):
            for kind in ("best", "poor"):
                m = r2[("phold", kind, ck, hd)]
                v = m["flowers"][ck]
                holds[ck].setdefault(kind + "_practice", {})[str(hd)] = {
                    "freshness_kept_pct": v["freshness_kept_pct"], "freshness_no_room_pct": v["freshness_no_room_pct"], "weight_loss_pct": v["weight_loss_pct"],
                    "hours_in_room": v["hours_in_room"], "kg_per_fill": v["kg_per_fill"], "time_to_6C_h": m.get("time_to_6C_h_avg"), "allowed": hd <= crops[ck]["max_hold_days"]}
    write("holds.json", {"about": "Freshness kept after 1, 2 and 3 days per flower: one full room (12 crates) of that flower, in at 13:00 at the outside temperature, out at 05:00, bagged. 'no room' = the same flowers kept outside in the shade.",
                         "date_range": dr, "note": note, "ice_kg": chosen, "flowers": holds,
                         "value_note": "E – value saved per fill = kg x (freshness in room - freshness without room) x mean base price of the flower."})
    limit_g = GLY.r290_room_limit_g(8.8)
    write("flowers_2026.json", {
        "about": "KoolKisaan Flowers – final design (ice panels) on the seasonal loading plan. Headline = best practice.", "date_range": dr, "note": note,
        "design": {"name": cfg["project"]["name"], "tagline": cfg["project"]["tagline"], "room_m": cfg["live_run"]["inside_m"], "room_m3": 8.8,
                   "U_W_m2K": 0.22, "pv_kWp": cfg["pv"]["rated_kWp"], "ice_kg": chosen, "ice_cost_INR": chosen * price, "setpoint_C": cfg["live_run"]["setpoint_C"],
                   "band_C": cfg["live_run"]["band_C"], "alarm_C": [cfg["setpoint"]["alarm_low_C"], cfg["setpoint"]["alarm_high_C"]],
                   "rh_target_pct": cfg["setpoint"]["rh_target_pct"], "chiller_max_kW": 1.5, "glycol": {k: v for k, v in cfg["glycol"].items()},
                   "glycol_m_dot_kg_s": GLY.m_dot(cfg), "T_evap_room_C": GLY.evap_T(cfg, "room"), "T_evap_ice_C": GLY.evap_T(cfg, "ice"),
                   "r290_inside_room_g": 0, "r290_room_limit_g": limit_g, "humidity_option": cfg["humidity"]["default_option"],
                   "crate_places": places, "controller": cfg["controller"]},
        "headline_case": "best_practice",
        "ideal": head(fi), "best_practice": head(fb), "poor_practice": head(fp), "realistic_smart": head(fr),
        "setpoint_5C": {"ideal": head(r2["sp5_ideal"]), "realistic_smart": head(r2["sp5_realistic"])},
        "extra_racks": {"crate_places": cfg["flowers"]["crate_places_extra_racks"], "aisle_note": "two side racks: aisle only about 0.49 m (tight, E)",
                        "realistic_smart": head(r2["extra_racks"]), "extra_kg_stored": r2["extra_racks"]["kg_stored"] - fr["kg_stored"],
                        "extra_electric_kWh_day": r2["extra_racks"]["electric_kWh_day"] - fr["electric_kWh_day"],
                        "extra_grid_kWh_per_year": r2["extra_racks"]["grid_kWh_per_year"] - fr["grid_kWh_per_year"],
                        "extra_hours_outside_band": r2["extra_racks"]["hours_outside_band"] - fr["hours_outside_band"],
                        "extra_value_INR": r2["extra_racks"]["value_INR"] - fr["value_INR"]},
        "freshness_after_days": holds,
        "assumptions_E": E_cfg})
    hard = sorted(fb["monthly"], key=lambda x: -(x["grid_h"] / x["days"]))
    busy = max(fb["monthly"], key=lambda x: x["kg_stored"] / x["days"])
    write("monthly_2026.json", {"about": "Month by month, seasonal plan. Rs values are E (price model).", "date_range": dr, "note": note,
                                "ideal": fi["monthly"], "best_practice": fb["monthly"], "realistic_smart": fr["monthly"],
                                "busiest_month": busy["month"], "hardest_month": hard[0]["month"],
                                "hardest_months": [{"month": x["month"], "grid_h_per_day": x["grid_h"] / x["days"], "outside_avg_C": x["outside_avg_C"],
                                                    "kg_stored": x["kg_stored"], "ice_sunrise_worst_pct": x["ice_sunrise_worst_pct"],
                                                    "hours_outside_band": x["hours_outside_band"]} for x in hard[:3]],
                                "value_definition": "price uplift = kg sold x price at sale x freshness - kg x price on the storage day; loss avoided (post-festival surplus) = kg sold x price at sale x freshness."})

    # ---- humidity
    base_h = r2[("hum", "nothing")]
    hum = {}
    for h, o in cfg["humidity"]["options"].items():
        m = r2[("hum", h)]
        wl = float(np.mean([v["weight_loss_pct"] / max(v["hold_days_avg"], 1e-9) for v in m["by_flower"].values()]))
        hum[h] = {"label": o["label"], "rh_avg_pct": m["rh_avg_pct"], "rh_below_85_h_day": m["rh_below_85_h_day"], "weight_loss_pct_per_day": wl,
                  "extra_energy_kWh_day": m["electric_kWh_day"] - base_h["electric_kWh_day"], "electric_kWh_day": m["electric_kWh_day"],
                  "water_use_L_day": m["water_fog_L_day"] + m["water_tray_L_day"], "freshness_kept_pct": {k: v["freshness_kept_pct"] for k, v in m["by_flower"].items()},
                  "value_INR": m["value_INR"], "water_condensed_L_day": m["water_condensed_coil_L_day"] + m["water_condensed_ice_L_day"]}
    ok = [k for k, v in hum.items() if v["rh_below_85_h_day"] <= min(x["rh_below_85_h_day"] for x in hum.values()) + 0.25]
    best_h = max(hum, key=lambda k: (hum[k]["value_INR"], -hum[k]["water_use_L_day"]))
    write("humidity_options.json", {"about": "The 4 humidity options, realistic model + smart controller, seasonal plan. RH numbers count only the hours with flowers inside.",
                                    "date_range": dr, "note": note, "options": hum, "best": best_h,
                                    "best_why": "highest Rs value of the flowers at take-out (E prices); ties go to the option that uses less water",
                                    "rules": crops["flower_rules"], "E": {k: v for k, v in E_cfg.items() if k.startswith("humidity")}})

    # ---- reality check
    rc_rows = {"ideal": {"label": "Ideal model", **short(fi, ("value_INR",))}}
    for k in RL.ORDER:
        rc_rows[k] = {"label": cs[k]["label"], "E": cs[k]["E"], **short(r2[("one", k)], ("value_INR",))}
    rc_rows["realistic_simple"] = {"label": "REALISTIC: all together, simple controller (grid stays on until the sun is back)", **short(r2["real_simple"], ("value_INR",))}
    rc_rows["realistic_smart"] = {"label": "REALISTIC + smart controller (the final design)", **short(fr, ("value_INR",))}
    rc_rows["realistic_no_grid"] = {"label": "REALISTIC + smart controller, no grid at all", **short(r2["real_no_grid"], ("value_INR",))}
    rc_rows["ideal_no_grid"] = {"label": "Ideal model, no grid at all", **short(r2["ideal_no_grid"], ("value_INR",))}
    rc_rows["ideal_simple"] = {"label": "Ideal model, simple controller", **short(r2["ideal_simple"], ("value_INR",))}
    write("reality_check.json", {"about": "Reality check for the flower room: each loophole alone on top of the ideal model, then all together. Same list as the old reality check plus pump and glycol losses.",
                                 "date_range": dr, "note": note, "order": ["ideal"] + RL.ORDER + ["realistic_simple", "realistic_smart", "realistic_no_grid", "ideal_no_grid", "ideal_simple"],
                                 "cases": rc_rows,
                                 "leave_one_out": {"about": "REALISTIC + smart controller with ONE loophole left out: what comes back shows how big that loophole is.",
                                                   "with_all": short(fr), "without": {k: short(r2[("loo", k)]) for k in RL.ORDER}},
                                 "E": cfg["reality"]})
    # ---- best practice / poor practice
    tariffs = json.loads((ROOT / "config" / "cost.json").read_text(encoding="utf-8"))["running"]["grid_tariff_INR_kWh"]
    def pcase(label, m, hk):
        return {"label": label, **short(m, ("hours_above_band_top", "hours_above_band_top_per_year", "hours_above_alarm_per_year", "night_fan_kWh_per_year", "value_INR", "kg_stored")),
                "grid_bill_INR_per_year": dict(zip(("low", "mid", "high"), [m["grid_kWh_per_year"] * t for t in tariffs])),
                "freshness_after_days": {ck: {d: holds[ck][hk][d]["freshness_kept_pct"] for d in ("1", "2", "3")} for ck in ("jasmine", "marigold", "tuberose", "rose", "chamanthi")}}
    base_p = fp
    items = [{"key": k, "label": lab, "grid_kWh_per_year": r2[("item", k)]["grid_kWh_per_year"], "grid_h_per_year": r2[("item", k)]["grid_h_per_year"],
              "days_full_solar_ice": r2[("item", k)]["days_full_solar_ice"], "hours_above_band_top": r2[("item", k)]["hours_above_band_top"],
              "grid_kWh_saved_per_year": base_p["grid_kWh_per_year"] - r2[("item", k)]["grid_kWh_per_year"],
              "electric_kWh_saved_per_year": (base_p["electric_kWh_day"] - r2[("item", k)]["electric_kWh_day"]) * 365,
              "value_gain_INR": r2[("item", k)]["value_INR"] - base_p["value_INR"]} for k, lab, _ in ITEMS]
    items.sort(key=lambda x: -x["grid_kWh_saved_per_year"])
    from engine import space as SPACE
    sp_out = SPACE.build(cfg, crop_key="marigold")[0]
    lay = sp_out["layout"]
    racks = {mat: {"label": rk[mat]["label"], "kg_total": rk[mat]["kg_total"], "cp_kJ_kgK": rk[mat]["cp_kJ_kgK"], "heat_capacity_kJ_K": rk[mat]["kg_total"] * rk[mat]["cp_kJ_kgK"],
                   "INR": dict(zip(("low", "mid", "high"), rk[mat]["INR"])), "note": rk[mat]["note"],
                   "electric_kWh_per_year": r2[("rack", mat)]["electric_kWh_day"] * 365, "grid_kWh_per_year": r2[("rack", mat)]["grid_kWh_per_year"],
                   "days_full_solar_ice": r2[("rack", mat)]["days_full_solar_ice"], "time_to_6C_h_avg": r2[("rack", mat)]["time_to_6C_h_avg"]} for mat in rk}
    write("practice.json", {
        "about": "Three cases side by side. Best practice (optimum) = realistic losses + good design + good operation; it is the site headline. Poor practice = realistic losses + bad operation.",
        "date_range": dr, "note": note, "storage": cfg["pcm"]["name"], "storage_kg": chosen,
        "cases": {"ideal": pcase("Ideal model (no real-life losses)", fi, "ideal"), "best_practice": pcase("Best practice (optimum) – headline", fb, "best_practice"),
                  "poor_practice": pcase("Poor practice", fp, "poor_practice")},
        "ideal_freshness_note": "Ideal freshness uses the plan's 13:00 loading; best practice loads at 06:00.",
        "best_practice_rules": [lab for _, lab, _ in ITEMS] + ["Smart controller"], "poor_practice_is": "8 door openings with a worn curtain, loading at 12:00, no bags, steel racks, no shade (dark roof), floor not insulated, lights partly on, 10 W fan always on",
        "items_alone": {"baseline": "Poor practice", "baseline_grid_kWh_per_year": base_p["grid_kWh_per_year"], "rows": items,
                        "about": "Poor practice with ONE best-practice rule switched on: grid kWh saved a year shows which rule matters most."},
        "racks": {"chosen": cfg["reality"]["rack_material"], "options": racks, "crate_places": sp_out["crate_places"], "shelf_levels": len(lay["shelves_m"]),
                  "racks": lay["racks"], "crates_per_level": sum(x["crates_per_shelf"] for x in lay["racks"]), "layout": lay["chosen"], "aisle_m": lay["aisle_m"],
                  "about": "Rack material changes only the heat that must be pulled out of the racks (thermal mass) and the price; all else is the best-practice case."},
        "night_fan_note": "The night fan's electricity comes from the grid and is inside 'grid kWh'; 'days fully on solar + storage' counts days when the CHILLER never ran on grid.",
        "E": {k: v for k, v in E_cfg.items() if k.startswith("reality.")}})
    write("space_budget.json", sp_out)
    write("night_limit.json", {"about": "How the result changes with the room temperature at which the grid may help (design value 6.0 °C, the top of the normal band).",
                               "date_range": dr, "note": note,
                               "rows": [{"grid_help_above_C": pr, "realistic_smart": short(r2[("night", pr)]), "ideal": short(r2[("night_ideal", pr)])} for pr in (5.5, 6.0, 6.5)],
                               "why": "With ice panels at 0 °C the room has about 4 K of pull at night, so this limit matters much less than it did with the 3–4 °C paraffin wax."})
    write("load_sweep.json", {"about": "Marigold, one fill a day (13:00 in, 05:00 out), realistic model + smart controller.", "date_range": dr, "note": note,
                              "crate_places": places, "rows": [{"kg_per_fill": kg, "crates_needed": FL.crates_needed(crops["marigold"], kg),
                                                                "fits": FL.crates_needed(crops["marigold"], kg) <= places,
                                                                **short(r2[("load", kg)]), "freshness_kept_pct": r2[("load", kg)]["flowers"]["marigold"]["freshness_kept_pct"]}
                                                               for kg in cfg["live_run"]["load_sweep_kg"]],
                              "capacity_kg_by_flower": {k: {"kg_per_crate": crops[k]["kg_per_crate"], "kg_per_crate_mid": crops[k]["kg_per_crate_mid"],
                                                            "room_kg": places * crops[k]["kg_per_crate_mid"],
                                                            "room_kg_extra_racks": cfg["flowers"]["crate_places_extra_racks"] * crops[k]["kg_per_crate_mid"]} for k in fl_keys}})

    # ---- old vs new
    old = old_design()
    newc = lambda m: {k: m.get(k) for k in ("days", "days_full_solar_ice", "grid_h_per_year", "grid_kWh_per_year", "electric_kWh_day", "COP_chiller", "COP_system",
                                            "solar_used_pct", "pump_kWh_day", "hours_outside_band", "room_mean_C")}
    write("compare_old_vs_new.json", {
        "about": "OLD design (R290 direct expansion inside the room, pomegranate 150 kg a day, 5 °C, band 2–8 °C, 115 kg ice melting at 4 °C) against the NEW flower design (outdoor R290 chiller + glycol loop, 4 °C, band 2–6 °C), same room, same PV, same 2026 weather. Comparison only: the two rooms store different produce on different loading plans.",
        "date_range": dr, "note": note, "old": old,
        "new": {"ideal": {**newc(fi), "T_evap_C": [GLY.evap_T(cfg, "room"), GLY.evap_T(cfg, "ice")], "r290_inside_room_g": 0},
                "best_practice": {**newc(fb), "T_evap_C": [GLY.evap_T(cfg, "room") - 2, GLY.evap_T(cfg, "ice") - 2], "r290_inside_room_g": 0},
                "realistic_smart": {**newc(fr), "T_evap_C": [GLY.evap_T(cfg, "room") - 2, GLY.evap_T(cfg, "ice") - 2], "r290_inside_room_g": 0}},
        "new_ice_kg": chosen, "new_storage": cfg["pcm"]["name"], "old_ice_kg": 115, "r290_room_limit_g": limit_g}, ROOT / "results")

    # ---- hourly exports for the website
    for tag, m in (("flowers", fb), ("flowers_ideal", fi)):
        H = m["_H"]
        cols = ["time_ist", "T_out", "RH_out", "T_room", "RH_room", "pcm_pct", "T_pcm", "T_sup", "T_ret", "P_pv", "P_solar_used", "P_grid", "P_comp", "P_pump",
                "grid_on", "running_h", "v_room", "v_ice", "kg_inside", "Q_air", "Q_ch", "Q_pcm_room", "Q_chill", "cop", "door_s"]
        H[cols].round({c_: 3 for c_ in cols[1:]}).to_csv(RES / f"hourly_{tag}.csv", index=False)
    fb["_bt"].drop(columns=["cool_steps", "out_step", "step"]).round(3).to_csv(RES / "fills_flowers.csv", index=False)
    print(json.dumps(clean({"chosen_ice_kg": chosen, "ideal": short(fi, ("value_INR", "kg_stored")), "best": short(fb, ("value_INR", "kg_stored")), "poor": short(fp, ("value_INR", "kg_stored")), "realistic": short(fr, ("value_INR", "kg_stored")),
                            "old": old}), indent=1))
    return chosen


if __name__ == "__main__":
    main()
