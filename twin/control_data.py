"""Data for the Control centre page:  python -m twin.control_data -> results/live/control.json

  calculations  every main formula with the design-point numbers plugged in (C)
  how_sure      the best-practice year again with the weather shifted the way a real site can differ from the weather
                service (hot site, cool site, random sites) - expected errors from published studies, not our measurements
  money         our room against the same room on grid only, and on grid + diesel in power cuts (E prices), CO2
  what_if       one change at a time against the headline (best practice)
  sensors, fixed inputs, room and capacity
Digital twin (S). Nothing is measured."""
import copy
import json
import math
from multiprocessing import Pool

import numpy as np

from engine import glycol as GLY
from engine import loads, psychro, r290
from engine import flowers as FL
from engine.config import load_config, load_crops
from twin import reality as RL
from twin import run_all as RA
from twin import site_error as SE
from twin import study

MONEY = {"diesel_INR_L": 93.0, "diesel_L_per_kWh": 0.5, "power_cut_hours": [10, 18], "grid_kg_CO2_kWh": 0.71, "diesel_kg_CO2_L": 2.68,
         "note": "E – same assumptions as the earlier KoolKisaan money page: diesel Rs 93/L, 0.5 L per kWh from a small genset, power cut 10:00-18:00, CEA grid factor 0.71 kg CO2/kWh, diesel 2.68 kg CO2/L."}
N_RANDOM = 16


def calculations(cfg, crops):
    To, RHo = 35.0, 65.0
    Tin, RHin = cfg["live_run"]["setpoint_C"], cfg["setpoint"]["rh_room_pct"]
    ch, g, pc = cfg["chamber"], cfg["glycol"], cfg["pcm"]
    U = ch["insulation_k_W_mK"] / ch["insulation_thickness_m"]
    Qw = U * ch["envelope_area_m2"] * (To - Tin)
    inf = loads.infiltration_load(cfg, To, RHo, Tin, RHin, D_t=1.0)
    n_open, sec = len(cfg["reality"]["best"]["door"]["times"]), cfg["reality"]["best"]["door"]["seconds"]
    door_day_kWh = inf["Q_kW"] * n_open * sec / 3600.0
    cr = crops[cfg["flowers"]["design_flower"]]
    kg = cfg["flowers"]["crate_places"] * cr["kg_per_crate_mid"]
    pull_kWh = kg * cr["cp_kJ_kgK"] * (To - Tin) / 3600.0
    resp_W = kg * FL.respiration_W_kg(cr, Tin) * 1000.0 / 1000.0
    rf = cfg["refrigeration"]
    cyc = {m: r290.cycle(GLY.evap_T(cfg, m), To + rf["cond_approach_K"], 1.0, rf["eta_isentropic"], rf["eta_motor_drive"], 0.0, 0.0, rf["coolprop_name"]) for m in ("room", "ice")}
    mdot = GLY.m_dot(cfg)
    ice_kWh = pc["mass_kg"] * pc["latent_kJ_kg"] / 3600.0
    night_W = Qw * (28.0 - Tin) / (To - Tin) + resp_W + 10.0
    pv = cfg["pv"]
    rows = [
        {"name": "Wall heat leak", "formula": "Q = U × A × (T_out − T_room)", "numbers": f"{U:.2f} × {ch['envelope_area_m2']} × ({To:.0f} − {Tin:.0f})", "value": Qw, "unit": "W"},
        {"name": "Door, while open (ASHRAE infiltration, with strip curtain)", "formula": "q = 0.221 A (h_out − h_in) ρ √(1 − ρ_out/ρ_in) √(gH) F_m × D_f × (1 − E)",
         "numbers": f"h_out {inf['h_out_kJ_kg']:.1f}, h_in {inf['h_in_kJ_kg']:.1f} kJ/kg; curtain E {inf['E']:.2f}", "value": inf["Q_kW"] * 1000, "unit": "W while open"},
        {"name": "Door, per day (best practice)", "formula": "E = q × openings × seconds", "numbers": f"{n_open} × {sec} s", "value": door_day_kWh, "unit": "kWh/day"},
        {"name": f"Cooling one full room of {cr['label'].split(' (')[0].lower()} from the field", "formula": "E = m × cp × (T_field − T_room)",
         "numbers": f"{kg:.0f} kg × {cr['cp_kJ_kgK']} × ({To:.0f} − {Tin:.0f}) / 3600", "value": pull_kWh, "unit": "kWh"},
        {"name": "Respiration heat of the flowers at 4 °C", "formula": "Q = m × r(T)", "numbers": f"{kg:.0f} kg × {FL.respiration_W_kg(cr, Tin) * 1000:.0f} mW/kg", "value": resp_W, "unit": "W"},
        {"name": "R290 evaporating temperature (room / ice making)", "formula": "T_evap = glycol supply − plate-exchanger approach",
         "numbers": f"{g['supply_room_C']:.0f} − {g['hx_approach_K']:.0f}  /  {g['supply_ice_C']:.0f} − {g['hx_approach_K']:.0f}", "value": None,
         "text": f"{GLY.evap_T(cfg, 'room'):.0f} / {GLY.evap_T(cfg, 'ice'):.0f} °C", "unit": ""},
        {"name": "Chiller COP at 35 °C outside (room / ice making)", "formula": "COP = q_evap / w_compressor × motor efficiency (CoolProp R290 cycle)",
         "numbers": f"condensing at {To + rf['cond_approach_K']:.0f} °C; pressures {cyc['room']['P_evap_bar']:.1f} → {cyc['room']['P_cond_bar']:.1f} bar", "value": None,
         "text": f"{cyc['room']['COP_elec']:.2f} / {cyc['ice']['COP_elec']:.2f}", "unit": ""},
        {"name": "Glycol flow", "formula": "m_dot = Q_max / (cp × ΔT)", "numbers": f"{cfg['live_run']['compressor_max_kW']} / ({g['cp_kJ_kgK']} × {g['design_dT_K']})", "value": mdot, "unit": "kg/s", "digits": 3},
        {"name": "Glycol energy check", "formula": "Q = m_dot × cp × (T_return − T_supply)", "numbers": f"{mdot:.3f} × {g['cp_kJ_kgK']} × {g['design_dT_K']}", "value": mdot * g["cp_kJ_kgK"] * g["design_dT_K"], "unit": "kW", "digits": 2},
        {"name": "Cold stored in the ice", "formula": "E = m × L", "numbers": f"{pc['mass_kg']:.0f} kg × {pc['latent_kJ_kg']:.0f} kJ/kg / 3600", "value": ice_kWh, "unit": "kWh", "digits": 2},
        {"name": "Night heat load at 28 °C outside (walls + flowers + controller)", "formula": "Q = U A ΔT + respiration + electronics", "numbers": "", "value": night_W, "unit": "W"},
        {"name": "Hours the full ice can carry that night load", "formula": "t = E_ice / Q_night", "numbers": f"{ice_kWh:.2f} kWh / {night_W:.0f} W", "value": ice_kWh * 1000 / night_W, "unit": "h", "digits": 1},
        {"name": "Largest R290 charge allowed INSIDE this room", "formula": "m = 0.20 × LFL × V", "numbers": "0.20 × 0.038 kg/m³ × 8.8 m³", "value": GLY.r290_room_limit_g(8.8), "unit": "g  (ours: 0 g)"},
        {"name": "Solar panel power", "formula": "P = kWp × G/1000 × PR × (1 + γ (T_cell − 25))", "numbers": f"{pv['rated_kWp']} kWp, PR {pv['performance_ratio']}, γ {pv['temp_coeff_per_C']}/°C", "value": None,
         "text": f"{pv['rated_kWp'] * pv['performance_ratio'] * (1 + pv['temp_coeff_per_C'] * 30):.2f} kW at 1000 W/m², 55 °C cell", "unit": ""},
    ]
    return {"design_point": {"T_out_C": To, "RH_out_pct": RHo, "T_room_C": Tin}, "rows": rows}


def _one(job):
    if not RA._G:
        RA._init()
    key, kind, seed = job
    cfg, w = RA._G["cfg"], RA._G["w"]
    real, _, patch, hum = RL.practice("best", cfg)
    c = copy.deepcopy(cfg)
    c["live_run"].update(patch["live_run"])
    B = SE.load_budget()
    if kind == "grid":
        ww = w
    elif kind in ("hot", "cool"):
        ww = SE.site_case(w, c, B, kind)
    else:
        ww = SE.random_case(w, c, B, B["random_runs"]["seed"], seed)
    from twin.flower_sim import simulate
    sched = RA._G[f"sched{cfg['flowers']['crate_places']}"]
    H, T, _, bt = simulate(ww, cfg=c, real=real, schedule=sched, humidity=hum)
    m = study.metrics(H, T, bt, c)
    return key, {k: m[k] for k in ("days_full_solar_ice", "grid_h_per_year", "grid_kWh_per_year", "hours_above_band_top", "electric_kWh_day", "COP_chiller")}


def main():
    RA._init()
    cfg, crops = RA._G["cfg"], RA._G["crops"]
    F = json.loads((RA.RES / "flowers_2026.json").read_text(encoding="utf-8"))
    head = F[F["headline_case"]]
    jobs = [("grid", "grid", 0), ("hot", "hot", 0), ("cool", "cool", 0)] + [(f"r{k}", "random", k) for k in range(N_RANDOM)]
    # what-if and money runs (best practice with one change)
    def pj(key, tweak=None, **kw):
        real, wk, patch, hum = RL.practice("best", cfg)
        real, patch = dict(real), copy.deepcopy(patch)
        if tweak:
            tweak(real, patch)
        return {"key": key, "real": (real, wk), "cfg_patch": patch, "humidity": kw.pop("humidity", hum), "seasonal": True, "pcm_kg": kw.pop("pcm_kg", cfg["pcm"]["mass_kg"]), **kw}
    WI = [("pv_1_2", "Solar panels 1.2 kWp instead of 1.8", pj("pv_1_2", pv_kWp=1.2)), ("pv_2_4", "Solar panels 2.4 kWp", pj("pv_2_4", pv_kWp=2.4)),
          ("ice_60", "Ice 60 kg instead of 100", pj("ice_60", pcm_kg=60.0)), ("ice_140", "Ice 140 kg", pj("ice_140", pcm_kg=140.0)),
          ("no_curtain", "No strip curtain", pj("no_curtain", lambda r, p: r.update(curtain_E=0.0))),
          ("door_12", "12 door openings a day", pj("door_12", lambda r, p: r.update(door_times=[[h, 0] for h in range(5, 17)]))),
          ("sp_5", "Set-point 5 °C", pj("sp_5", setpoint_C=5.0)), ("sp_3", "Set-point 3 °C", pj("sp_3", setpoint_C=3.0)),
          ("no_fogger", "Bags but no fogger", pj("no_fogger", humidity="liners")),
          ("insul_150", "Insulation 150 mm instead of 100 mm", pj("insul_150", lambda r, p: r.update(wall_factor=r["wall_factor"] * 100.0 / 150.0))),
          ("grid_only", "Same room on grid only (no solar, no ice)", pj("grid_only", pv_kWp=0.0, pcm_kg=0.0))]
    with Pool(4, initializer=RA._init) as p:
        ur = dict(p.map(_one, jobs))
        wr = dict(p.map(RA.run_job, [j for _, _, j in WI]))
    rnd = [ur[f"r{k}"] for k in range(N_RANDOM)]
    q = lambda key, pp: float(np.percentile([x[key] for x in rnd], pp))
    how_sure = {"about": "The best-practice year run again with the weather shifted the way a real site can differ from the weather service. Expected errors come from published studies (config/site_error_budget.json); they are NOT our measurements.",
                "cases": {"grid": {"label": "Weather service as is", **ur["grid"]}, "hot": {"label": "Hot site (+1.5 °C, less sun) – used for the headline", **ur["hot"]},
                          "cool": {"label": "Cool site", **ur["cool"]}},
                "random": {"n": N_RANDOM, "days_full_solar_ice": {"p5": q("days_full_solar_ice", 5), "median": q("days_full_solar_ice", 50), "p95": q("days_full_solar_ice", 95)},
                           "grid_kWh_per_year": {"p5": q("grid_kWh_per_year", 5), "median": q("grid_kWh_per_year", 50), "p95": q("grid_kWh_per_year", 95)},
                           "note": f"{N_RANDOM} random sites, errors that drift over about 6 hours, fixed seed."}}
    keys = ("days_full_solar_ice", "grid_h_per_year", "grid_kWh_per_year", "hours_above_band_top", "hours_below_2C", "electric_kWh_day", "rh_avg_pct", "value_INR", "COP_chiller")
    what_if = {"about": "Best practice with ONE thing changed.", "headline": {k: head.get(k) for k in keys},
               "rows": [{"key": k, "label": lab, **{kk: wr[k].get(kk) for kk in keys}} for k, lab, _ in WI if k != "grid_only"]}
    go = wr["grid_only"]
    t = cfg["live_run"]["money"]["grid_tariff_INR_kWh"]
    go_kWh = go["electric_kWh_day"] * 365
    c0, c1 = MONEY["power_cut_hours"]
    cut_frac = (c1 - c0) / 24.0                                      # share of the grid-only room's energy that falls in the cut window (E: even over the day)
    diesel_L = go_kWh * cut_frac * MONEY["diesel_L_per_kWh"]
    ours_kWh = head["grid_kWh_per_year"]
    money = {"about": "Running-cost comparison of three rooms with the same flowers and weather (E prices).", "E": MONEY, "tariff_INR_kWh": t,
             "rows": [{"label": "Our room (solar + ice, grid backup)", "grid_kWh": ours_kWh, "diesel_L": 0.0, "cost_INR": ours_kWh * t, "co2_kg": ours_kWh * MONEY["grid_kg_CO2_kWh"]},
                      {"label": "Same room on grid only", "grid_kWh": go_kWh, "diesel_L": 0.0, "cost_INR": go_kWh * t, "co2_kg": go_kWh * MONEY["grid_kg_CO2_kWh"]},
                      {"label": "Grid + diesel genset in the 10:00–18:00 power cut", "grid_kWh": go_kWh * (1 - cut_frac), "diesel_L": diesel_L,
                       "cost_INR": go_kWh * (1 - cut_frac) * t + diesel_L * MONEY["diesel_INR_L"],
                       "co2_kg": go_kWh * (1 - cut_frac) * MONEY["grid_kg_CO2_kWh"] + diesel_L * MONEY["diesel_kg_CO2_L"]}]}
    for r_ in money["rows"][1:]:
        r_["saved_INR"] = r_["cost_INR"] - money["rows"][0]["cost_INR"]
        r_["co2_saved_kg"] = r_["co2_kg"] - money["rows"][0]["co2_kg"]
    sens = json.loads((RA.ROOT / "config" / "sensors.json").read_text(encoding="utf-8"))
    space = json.loads((RA.RES / "space_budget.json").read_text(encoding="utf-8"))
    fixed = {k: cfg[k] for k in ("chamber", "setpoint", "door", "refrigeration", "glycol", "pv", "pcm", "controller")}
    fixed["live_run"] = {k: v for k, v in cfg["live_run"].items() if k not in ("designs", "ice_hx", "battery_12V")}
    RA.write("control.json", {"about": "Control centre data.", "date_range": study.date_range(RA._G["w"]), "note": "Digital twin (S) and calculations (C). Nothing is measured.",
                              "calculations": calculations(cfg, crops), "how_sure": how_sure, "what_if": what_if, "money": money,
                              "sensors": {"about": sens["_about"] if "_about" in sens else json.loads((RA.ROOT / 'config' / 'sensors.json').read_text())["_about"], "rows": sens["sensors"]},
                              "room": {"table": space["table"], "layout": space["layout"], "crate_places": space["crate_places"], "zones_sum_m3": space["zones_sum_m3"], "ice": space["ice"]},
                              "fixed_inputs": fixed, "assumptions_E": cfg["assumptions_E"]})
    print({k: (round(v["days_full_solar_ice"]), round(v["grid_kWh_per_year"])) for k, v in how_sure["cases"].items()}, how_sure["random"]["days_full_solar_ice"])
    for r_ in money["rows"]:
        print(r_["label"], round(r_["grid_kWh"]), round(r_["cost_INR"]), round(r_["co2_kg"]))
    for r_ in what_if["rows"]:
        print(r_["key"], r_["days_full_solar_ice"], round(r_["grid_kWh_per_year"]), r_["hours_above_band_top"], r_["hours_below_2C"])


if __name__ == "__main__":
    main()
