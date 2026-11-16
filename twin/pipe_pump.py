"""Pipe and pump losses: is it worth moving the chiller close to the wall and fitting a small DC pump?
    python -m twin.pipe_pump -> results/live/pipe_pump.json
Best-practice case, seasonal plan. Options (E): chiller within 1.5 m of the wall (3 m of pipe), 32 mm nitrile insulation, insulated
tank and plate exchanger (pipe heat gain 3 -> 1 W/K); 18 W DC pump instead of 40 W. Digital twin (S); prices E."""
import copy
import json
from multiprocessing import Pool

from twin import reality as RL
from twin import run_all as RA
from twin import study

OPT = {"pipe_UA_W_K": 1.0, "pump_W": 18.0,
       "cost_INR": {"pipe": [1500, 3000, 5000], "pump": [1500, 3000, 5000]},
       "note": "E – extra cost of thicker (32 mm) insulation and insulating the tank and plate exchanger, less the saving from 3 m less pipe; "
               "extra cost of an 18 W electronically commutated DC pump over a plain 40 W pump."}


def main():
    RA._init()
    cfg = RA._G["cfg"]
    base_g = json.loads((RA.ROOT / "config" / "design.json").read_text(encoding="utf-8"))["glycol"]
    first = {"pipe_UA_W_K": base_g.get("pipe_UA_first_design_W_K", base_g["pipe_UA_W_K"]), "pump_W": base_g.get("pump_first_design_W", base_g["pump_W"])}
    combos = {"first": {}, "pipe": {"pipe_UA_W_K": OPT["pipe_UA_W_K"]}, "pump": {"pump_W": OPT["pump_W"]},
              "both": {"pipe_UA_W_K": OPT["pipe_UA_W_K"], "pump_W": OPT["pump_W"]}}
    jobs = []
    for k, ch in combos.items():
        g = dict(first, **ch)
        real, wk, patch, hum = RL.practice("best", cfg)
        real = dict(real, pump_W=g["pump_W"] * cfg["reality"]["glycol"]["pump_W_factor"])
        patch = copy.deepcopy(patch)
        patch["glycol"] = g
        jobs.append({"key": k, "real": (real, wk), "cfg_patch": patch, "humidity": hum, "seasonal": True, "pcm_kg": cfg["pcm"]["mass_kg"]})
    with Pool(4, initializer=RA._init) as p:
        r = dict(p.map(RA.run_job, jobs))
    tariff = cfg["live_run"]["money"]["grid_tariff_INR_kWh"]
    b = r["first"]
    rows = {}
    for k, m in r.items():
        cost = [sum(OPT["cost_INR"][x][i] for x in ("pipe", "pump") if (x == k or k == "both")) for i in range(3)]
        el = (b["electric_kWh_day"] - m["electric_kWh_day"]) * 365
        gr = b["grid_kWh_per_year"] - m["grid_kWh_per_year"]
        rows[k] = {"pipe_UA_W_K": dict(first, **combos[k])["pipe_UA_W_K"], "pump_W": dict(first, **combos[k])["pump_W"],
                   "electric_kWh_per_year": m["electric_kWh_day"] * 365, "grid_kWh_per_year": m["grid_kWh_per_year"], "days_full_solar_ice": m["days_full_solar_ice"],
                   "pipe_loss_kWh_day": m["pipe_loss_kWh_day"], "pump_kWh_day": m["pump_kWh_day"], "pump_heat_kWh_day": m["pump_heat_kWh_day"], "COP_system": m["COP_system"],
                   "electric_kWh_saved_per_year": el, "grid_kWh_saved_per_year": gr, "extra_cost_INR": dict(zip(("low", "mid", "high"), cost)),
                   "INR_per_kWh_saved_10yr": (cost[1] / (10 * el)) if el > 1e-6 else None,
                   "INR_per_grid_kWh_saved_10yr": (cost[1] / (10 * gr)) if gr > 1e-6 else None}
    cand = {k: v for k, v in rows.items() if k != "first" and v["INR_per_kWh_saved_10yr"] and v["INR_per_kWh_saved_10yr"] < tariff}
    best = max(cand, key=lambda k: cand[k]["electric_kWh_saved_per_year"]) if cand else "first"
    RA.write("pipe_pump.json", {"about": "Pipe and pump options on the best-practice case (seasonal plan).", "date_range": study.date_range(RA._G["w"]),
                                "note": "Digital twin (S). Prices E. Rule: keep the combination that saves the most electricity, as long as its extra cost per kWh saved over 10 years is below the grid tariff.",
                                "tariff_INR_kWh": tariff, "options": rows, "best": best, "E": OPT,
                                "labels": {"first": "First design: 6 m of pipe (3 W/K), 40 W pump", "pipe": "Short, well-insulated pipes (1 W/K)", "pump": "18 W DC pump",
                                           "both": "Short insulated pipes + 18 W DC pump"}})
    for k, v in rows.items():
        print(k, {a: (round(x, 2) if isinstance(x, float) else x) for a, x in v.items()})
    print("best", best)


if __name__ == "__main__":
    main()
