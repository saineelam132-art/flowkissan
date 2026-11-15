"""Can the flower room run on solar only (no grid at all)?        python -m twin.solar_only -> results/live/solar_only.json

Every option is run on the seasonal plan with the realistic model + smart controller, twice: with grid backup and with
the grid removed completely. Options (values E, see 'options' in the JSON):
  current  paraffin blend + graphite, melts 3-4 C (the first flower design)
  A        water / ice panels at 0 C (334 kJ/kg, nucleating agent), glycol -5 C when charging; 60 / 80 / 100 kg
  B        paraffin blend melting 1-2 C
  D        night room allowed to 5-6 C (grid help only above 7 C)
  E        +0.6 kWp PV and +30 % storage
Option C (night fan on the fins + small battery) is NOT modelled here (the owner chose to go straight to water / ice).
Nothing is measured: digital-twin (S) results."""
import json
from multiprocessing import Pool

import numpy as np
import pandas as pd

from twin import run_all as RA
from twin import study

ICE = {"name": "Water / ice with nucleating agent", "word": "ice", "T_melt_C": 0.0, "melt_range_C": [0.0, 0.0], "latent_kJ_kg": 334.0,
       "latent_pure_kJ_kg": 334.0, "graphite_wt_frac": 0.0, "cp_solid_kJ_kgK": 2.1, "cp_liquid_kJ_kgK": 4.19, "k_pure_W_mK": 0.6, "k_multiplier": 1.0,
       "k_W_mK": 0.6, "density_kg_m3": 1000.0, "charge_stop_C": -1.0, "price_INR_kg": 0}
ICE_GLY = {"supply_wax_C": -5.0}
ICE_REAL = {"latent_frac": 0.90, "melt_range_C": [-0.5, 0.0], "k_multiplier": 1.0}     # reality check for ice: 90 % freezes, slight supercooling


def options(cfg):
    w = 100.0                                                         # the paraffin mass of the first flower design
    para = {"name": "Paraffin blend + 7 % graphite", "word": "wax", "T_melt_C": 3.5, "melt_range_C": [3.0, 4.0], "latent_kJ_kg": 176.7, "latent_pure_kJ_kg": 190.0,
            "graphite_wt_frac": 0.07, "cp_solid_kJ_kgK": 1.8, "cp_liquid_kJ_kgK": 2.1, "k_pure_W_mK": 0.2, "k_multiplier": 5.0, "k_W_mK": 1.0,
            "density_kg_m3": 800.0, "charge_stop_C": 2.0, "price_INR_kg": 1000}
    gly = {"supply_wax_C": -2.0}
    wax_real = {"latent_frac": 0.90, "melt_range_C": [2.5, 4.5], "k_multiplier": 3.0}
    o = {"current": {"label": f"Paraffin wax + graphite, melts 3–4 °C, {w:.0f} kg (first flower design)", "pcm": para, "gly": gly, "kg": w, "real": wax_real,
                     "extra_cost_INR": [0, 0, 0], "cost_note": "reference"}}
    for m in (60, 80, 100):
        o[f"A_ice_{m}"] = {"label": f"A. Water / ice panels at 0 °C, {m} kg, glycol −5 °C when charging", "pcm": ICE, "gly": ICE_GLY, "kg": m, "real": ICE_REAL,
                           "extra_cost_INR": [2000 - w * 600, 5000 - w * 1000, 10000 - w * 1600],
                           "cost_note": "E – water costs about nothing; Rs 2,000 / 5,000 / 10,000 for nucleating agent, biocide and leak-tight containers, MINUS the paraffin wax that is no longer bought"}
    o["B_wax_1_2"] = {"label": f"B. Paraffin blend melting 1–2 °C, {w:.0f} kg", "pcm": dict(para, T_melt_C=1.5, melt_range_C=[1.0, 2.0], charge_stop_C=0.0), "gly": {"supply_wax_C": -4.0},
                      "kg": w, "real": dict(wax_real, melt_range_C=[0.5, 2.5]), "extra_cost_INR": [0, 0, 0], "cost_note": "E – same price per kg assumed (Rs 1,000/kg)"}
    o["D_night_5_6"] = {"label": "D. Current wax, night room allowed to 5–6 °C (grid help only above 7 °C)", "pcm": para, "gly": gly, "kg": w, "real": wax_real, "protect": 7.0,
                        "extra_cost_INR": [0, 0, 0], "cost_note": "no hardware"}
    o["E_more_pv_storage"] = {"label": f"E. Current wax +30 % ({w * 1.3:.0f} kg) and +0.6 kWp PV (2.4 kWp)", "pcm": para, "gly": gly, "kg": w * 1.3, "real": wax_real, "pv": 2.4,
                              "extra_cost_INR": [0.6 * 39000 + 0.3 * w * 600, 0.6 * 50000 + 0.3 * w * 1000, 0.6 * 67000 + 0.3 * w * 1600],
                              "cost_note": "E – PV at the BOM price per kWp + 30 % more wax"}
    return o


def jobs_for(key, o, cfg):
    base, wk = RA.realistic()
    base = dict(base)
    base.update(o["real"])
    out = []
    kw = {"seasonal": True, "pcm_kg": o["kg"], "cfg_patch": {"pcm": o["pcm"], "glycol": o["gly"]}}
    if o.get("pv"):
        kw["pv_kWp"] = o["pv"]
    for mode, extra in (("grid", {}), ("nogrid", {"no_grid": True})):
        j = dict(kw, key=(key, mode), real=(dict(base, **extra), wk), keep=(mode == "nogrid"))
        if o.get("protect"):
            j["protect"] = o["protect"]
        out.append(j)
    crops = RA._G["crops"]
    places = cfg["flowers"]["crate_places"]
    rl, _ = RA.realistic(skip="load_var")
    rl = dict(rl)
    rl.update(o["real"])
    for ck in ("jasmine", "marigold"):
        for hd in (1, 2, 3):
            j = {"key": (key, "hold", ck, hd), "crop_key": ck, "hold_days": hd, "load_kg": places * crops[ck]["kg_per_crate_mid"], "pcm_kg": o["kg"],
                 "cfg_patch": kw["cfg_patch"], "real": (rl, wk)}
            if o.get("pv"):
                j["pv_kWp"] = o["pv"]
            if o.get("protect"):
                j["protect"] = o["protect"]
            out.append(j)
    return out


def failed_night_freshness(H, bt, alarm):
    """Freshness at take-out of the fills that sat through a failed night (room above the alarm) against the other fills."""
    hot = H.set_index("time_ist").T_room > alarm
    bad, ok = [], []
    for r in bt.itertuples():
        t0 = pd.Timestamp(r.date) + pd.Timedelta(hours=13)
        seg = hot[t0:t0 + pd.Timedelta(hours=float(r.hours))]
        (bad if seg.any() else ok).append(r.F_room)
    return {"fills_hit": len(bad), "fills_not_hit": len(ok), "freshness_hit_pct": float(np.mean(bad)) if bad else None,
            "freshness_not_hit_pct": float(np.mean(ok)) if ok else None,
            "freshness_lost_pct_points": float(np.mean(ok) - np.mean(bad)) if bad and ok else None}


def main():
    RA._init()
    cfg = RA._G["cfg"]
    opts = options(cfg)
    jobs = [j for k, o in opts.items() for j in jobs_for(k, o, cfg)]
    with Pool(4, initializer=RA._init) as p:
        r = dict(p.map(RA.run_job, jobs))
    tariff = json.loads((RA.ROOT / "config" / "cost.json").read_text(encoding="utf-8"))["running"]["grid_tariff_INR_kWh"]
    alarm = cfg["setpoint"]["alarm_high_C"]
    rows = {}
    for k, o in opts.items():
        g, ng = r[(k, "grid")], r[(k, "nogrid")]
        rows[k] = {
            "label": o["label"], "storage_kg": o["kg"], "extra_cost_INR": dict(zip(("low", "mid", "high"), o["extra_cost_INR"])), "cost_note": o["cost_note"],
            "with_grid_backup": {"days_full_solar": g["days_full_solar_wax"], "grid_h_per_year": g["grid_h_per_year"], "grid_kWh_per_year": g["grid_kWh_per_year"],
                                 "grid_bill_INR_per_year": dict(zip(("low", "mid", "high"), [g["grid_kWh_per_year"] * t for t in tariff])),
                                 "hours_above_6C_per_year": g["hours_above_band_top_per_year"], "hours_above_8C_per_year": g["hours_above_alarm_per_year"],
                                 "hours_below_2C_per_year": g["hours_below_band_low_per_year"], "COP_chiller": g["COP_chiller"], "electric_kWh_day": g["electric_kWh_day"],
                                 "rh_avg_pct": g["rh_avg_pct"], "value_INR": g["value_INR"], "room_min_C": g["room_min_C"]},
            "no_grid": {"hours_above_6C_per_year": ng["hours_above_band_top_per_year"], "hours_above_8C_per_year": ng["hours_above_alarm_per_year"],
                        "hours_below_2C_per_year": ng["hours_below_band_low_per_year"], "worst_night_peak_C": ng["night_room_max_C"], "room_max_C": ng["room_max_C"],
                        "room_min_C": ng["room_min_C"], "nights_failed_above_8C": ng["nights_failed"], "nights_above_6C": ng["nights_above_band_top"], "nights": ng["nights"],
                        "hours_above_6C_by_month": ng["hours_above_band_top_by_month"], "hours_above_6C_by_hour": ng["hours_above_band_top_by_hour"],
                        "failed_nights_freshness": failed_night_freshness(ng["_H"], ng["_bt"], alarm), "value_INR": ng["value_INR"],
                        "storage_sunrise_worst_pct": ng["wax_sunrise_worst_pct"], "storage_sunrise_mean_pct": ng["wax_sunrise_mean_pct"]},
            "chilling_check": {"panel_min_C": g["panel_min_C"], "panel_hours_below_2C_with_flowers": g["panel_hours_below_2C_with_flowers"],
                               "room_hours_below_2C_per_year": g["hours_below_band_low_per_year"],
                               "note": "Panels colder than 2 °C can chill jasmine, tuberose, marigold and kanakambaram that touch them: keep the 10 cm keep-clear gap in front of the panels."},
            "freshness_after_days": {ck: {str(hd): r[(k, "hold", ck, hd)]["flowers"][ck]["freshness_kept_pct"] for hd in (1, 2, 3)} for ck in ("jasmine", "marigold")},
        }
    zero = [k for k in rows if rows[k]["with_grid_backup"]["grid_h_per_year"] < 1]
    best = (min(zero, key=lambda k: rows[k]["extra_cost_INR"]["mid"]) if zero else
            min(rows, key=lambda k: (round(rows[k]["with_grid_backup"]["grid_kWh_per_year"]), rows[k]["extra_cost_INR"]["mid"])))
    cur = rows["current"]
    out = {"about": "Solar-only study: every option on the seasonal plan, realistic model + smart controller, with grid backup and with NO grid at all.",
           "date_range": study.date_range(RA._G["w"]), "note": "Digital twin (S). Nothing is measured. E = assumption. Hours are scaled to a full year (x 365 / 310).",
           "tariff_INR_kWh": dict(zip(("low", "mid", "high"), tariff)), "options": rows, "order": list(rows),
           "option_C": "Not modelled (night fan on the fins + small battery): the owner chose to go straight to water / ice panels.",
           "best": best, "best_rule": "cheapest option with 0 grid hours a year in the realistic model; if none reaches 0, the one with the smallest yearly grid bill (fewest grid kWh)",
           "best_reaches_zero_grid": bool(zero),
           "current_design_grid_bill": {"grid_kWh_per_year": cur["with_grid_backup"]["grid_kWh_per_year"], **cur["with_grid_backup"]["grid_bill_INR_per_year"]},
           "why_current_fails": {
               "cause": "The paraffin wax melts at 3–4 °C and the room must stay at or below 6 °C, so there is only about 2 K between wax and room air. With natural convection only (no fan at night) the fins then move too little heat for the night heat load (walls, door openings, warm flowers, and by day the pump and pipe losses eat part of the solar cold that should have gone into the wax).",
               "hours_above_6C_by_hour": cur["no_grid"]["hours_above_6C_by_hour"], "hours_above_6C_by_month": cur["no_grid"]["hours_above_6C_by_month"]},
           "E": {"ice": ICE, "ice_glycol_supply_C": ICE_GLY["supply_wax_C"], "ice_reality": ICE_REAL,
                 "ice_note": "E – water with a nucleating agent freezes at about 0 °C (supercooling 0.5 K in the reality check); 334 kJ/kg; conductivity of liquid water (0.6 W/m.K) used for the whole slab (careful: ice is 2.2); glycol supply −5 °C when charging -> R290 evaporates at −8 °C. Glycol 30–35 % freezes at about −13 °C, so −5 °C is safe. Water expands 9 % when it freezes: panels need room for that."}}
    RA.write("solar_only.json", out)
    for k, v in rows.items():
        g, ng = v["with_grid_backup"], v["no_grid"]
        print(f"{k:18s} grid: days {g['days_full_solar']:3d} h {g['grid_h_per_year']:6.0f} kWh {g['grid_kWh_per_year']:5.0f} >6 {g['hours_above_6C_per_year']:5.0f} <2 {g['hours_below_2C_per_year']:5.0f} min {g['room_min_C']:.1f} COP {g['COP_chiller']:.2f} kWh/d {g['electric_kWh_day']:.2f} RH {g['rh_avg_pct']:.0f} val {g['value_INR']:.0f}"
              f" | nogrid >6 {ng['hours_above_6C_per_year']:5.0f} >8 {ng['hours_above_8C_per_year']:5.0f} peak {ng['worst_night_peak_C']:.1f} failed {ng['nights_failed_above_8C']} <2 {ng['hours_below_2C_per_year']:.0f} | fresh {v['freshness_after_days']}")
    print("best", best)


if __name__ == "__main__":
    main()
