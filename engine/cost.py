"""Cost and ROI of KoolKisaan Flowers  ->  results/live/cost_roi.json        python -m engine.cost

Uses the twin's own numbers (results/live/flowers_2026.json, season_plan.json): grid kWh, pump kWh, fogger water,
kg stored, kg-days, Rs value captured per season. Every price is E (config/cost.json). Simple payback, no interest.
    yearly net = benefit - running cost;  payback = total cost / yearly net;  10-year net = 10 x yearly net - total cost
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "results" / "live"
LV = ("low", "mid", "high")


def build():
    from engine.config import load_config
    cfg = load_config()
    C = json.loads((ROOT / "config" / "cost.json").read_text(encoding="utf-8"))
    F = json.loads((RES / "flowers_2026.json").read_text(encoding="utf-8"))
    W = json.loads((RES / "wax_sweep.json").read_text(encoding="utf-8"))
    P = json.loads((RES / "season_plan.json").read_text(encoding="utf-8"))
    HU = json.loads((RES / "humidity_options.json").read_text(encoding="utf-8"))
    case_key = F["headline_case"]
    m = F[case_key]
    days = F["date_range"]["days"]
    hc, r = C["humidity"], C["running"]
    tariff = r["grid_tariff_INR_kWh"]
    rk = cfg["reality"]["racks"][cfg["reality"]["rack_material"]]
    special = {"storage": cfg["pcm"]["fixed_cost_INR"], "racks": rk["INR"],
               "humidity": [a + b for a, b in zip(hc["fogger_unit_controller_INR"], hc["ro_filter_or_can_INR"])]}
    bom, tot = [], [0.0, 0.0, 0.0]
    for b in C["bom"]:
        v = special[b["INR"]] if isinstance(b["INR"], str) else b["INR"]
        item = b["item"] + (f" – {W['chosen_kg']} kg" if b["key"] == "wax" else "") + (f" – {rk['label']}" if b["key"] == "racks" else "")
        bom.append({"item": item, "key": b["key"], **dict(zip(LV, v))})
        tot = [a + x for a, x in zip(tot, v)]
    by = {b["key"]: b for b in bom}
    old = C["old_design_refrigeration"]["INR"]
    new_lines = [by["chiller"], by["loop"], by["air_cooler"]]
    gly = [sum(b[lv] for b in new_lines) for lv in LV]
    kg_sim = m["kg_stored"]
    kg_year = sum(sum(f["parts"].values()) for f in P["fills_full_year"])
    scale = kg_year / kg_sim if kg_sim else 365.0 / days
    grid_kWh, pump_kWh = m["grid_kWh_per_year"], m["pump_kWh_day"] * 365
    water_L = m["water_fog_L_day"] * 365
    fog_kWh = m["fogger_kWh_day"] * 365
    fog_h = fog_kWh / (cfg["humidity"]["fogger_W"] / 1000.0)
    fogger_yearly = []
    for i in range(3):
        f = {"ro_water_INR": water_L * hc["ro_water_INR_per_L"][i], "electricity_INR": fog_kWh * tariff[i], "disc_parts_INR": hc["disc_parts_INR_yr"][i],
             "cleaning_INR": hc["cleaning_INR_yr"][i]}
        f["total_INR"] = sum(f.values())
        fogger_yearly.append(f)
    running = []
    for i in range(3):
        parts = {"grid_electricity_INR": grid_kWh * tariff[i], "upkeep_INR": r["upkeep_INR_yr"][i], "bags_INR": kg_year * r["bags_INR_per_kg"][i],
                 "fogger_INR": fogger_yearly[i]["total_INR"]}
        parts["total_INR"] = sum(parts.values())
        running.append(parts)
    # ---- humidity options: one-time and yearly cost, value per % RH gained (RH from the twin, realistic model)
    ho = HU["options"]
    rh0 = ho["nothing"]["rh_avg_pct"]
    def hopt(key, one, yearly, parts):
        gain = ho[key]["rh_avg_pct"] - rh0
        return {"label": ho[key]["label"], "one_time_INR": dict(zip(LV, one)), "yearly_INR": dict(zip(LV, yearly)), "yearly_parts": parts,
                "rh_avg_pct": ho[key]["rh_avg_pct"], "rh_gain_pct_points": gain, "weight_loss_pct_per_day": ho[key]["weight_loss_pct_per_day"],
                "rh_below_85_h_day": ho[key]["rh_below_85_h_day"],
                "yearly_INR_per_pct_RH_gained": (yearly[1] / gain) if gain > 0.5 else None}
    bags = [kg_year * x for x in r["bags_INR_per_kg"]]
    tray_w = ho["liners_tray"]["water_use_L_day"] * 365
    hum = {
        "nothing": hopt("nothing", [0, 0, 0], [0, 0, 0], "no cost"),
        "liners": hopt("liners", [0, 0, 0], bags, f"PE bags for {kg_year:,.0f} kg a year"),
        "liners_tray": hopt("liners_tray", hc["tray_INR"], [b + tray_w * w for b, w in zip(bags, hc["tap_water_INR_per_L"])], f"bags + {tray_w:,.0f} L of water a year"),
        "liners_fogger": hopt("liners_fogger", special["humidity"], [b + f["total_INR"] for b, f in zip(bags, fogger_yearly)],
                              f"bags + RO water {water_L:,.0f} L + electricity {fog_kWh:,.1f} kWh ({fog_h:,.0f} run hours x {cfg['humidity']['fogger_W']:.0f} W) + disc/parts + cleaning"),
    }
    gains = {k: v["yearly_INR_per_pct_RH_gained"] for k, v in hum.items() if v["yearly_INR_per_pct_RH_gained"]}
    best_h = min(gains, key=gains.get) if gains else None
    kg_days_year = m["kg_days"] * scale
    value_year = m["value_INR"] * scale
    B = C["benefit"]
    benefit = {
        "farmer_group": {"label": "(a) Farmer group: value captured (price uplift + losses avoided)", "INR_yr": [value_year * f for f in B["value_factor"]],
                         "how": f"seasonal twin run (best practice): ₹{m['value_INR']:,.0f} in {days} days × {scale:.2f} (kg planned for the full year / kg simulated), × 0.7 / 1.0 / 1.3"},
        "rent_only": {"label": "(b) Rent only", "INR_yr": [kg_days_year * x for x in B["rent_INR_kg_day"]],
                      "how": f"₹3 / 4 / 5 per kg per day × {kg_days_year:,.0f} kg-days a year from the seasonal plan"},
    }
    cases = {}

    def case(key, label, ben, cost, note=None):
        rows = {}
        for i, lv in enumerate(LV):
            net = ben[i] - running[i]["total_INR"]
            rows[lv] = {"total_cost_INR": cost[i], "benefit_INR_yr": ben[i], "running_INR_yr": running[i]["total_INR"], "net_INR_yr": net,
                        "payback_years": cost[i] / net if net > 0 else None, "ten_year_net_INR": C["years"] * net - cost[i]}
        best = ben[2] - running[0]["total_INR"]
        worst = ben[0] - running[2]["total_INR"]
        cases[key] = {"label": label, "note": note, **rows,
                      "payback_best_years": cost[0] / best if best > 0 else None, "payback_worst_years": cost[2] / worst if worst > 0 else None}
    case("farmer_group", benefit["farmer_group"]["label"], benefit["farmer_group"]["INR_yr"], tot)
    case("rent_only", benefit["rent_only"]["label"], benefit["rent_only"]["INR_yr"], tot)
    for pct, key in ((B["subsidy_pct"], "rent_subsidy_35"), (B["subsidy_scheduled_areas_pct"], "rent_subsidy_50")):
        case(key, f"(c) Rent with {pct} % MIDH subsidy" + (" (scheduled areas)" if pct == 50 else ""), benefit["rent_only"]["INR_yr"],
             [t * (1 - pct / 100.0) for t in tot], B["subsidy_note"])
        case(key.replace("rent", "farmer"), f"Farmer group with {pct} % MIDH subsidy" + (" (scheduled areas)" if pct == 50 else ""),
             benefit["farmer_group"]["INR_yr"], [t * (1 - pct / 100.0) for t in tot], B["subsidy_note"])
    seasons = {}
    for k, s in m["by_season"].items():
        share = s["kg"] / kg_sim if kg_sim else 0
        run_share = running[1]["total_INR"] * share
        seasons[k] = {"label": s["label"], "kg": s["kg"], "value_INR": s["value_INR"], "price_uplift_INR": s["price_uplift_INR"],
                      "loss_avoided_INR": s["loss_avoided_INR"], "running_share_INR": run_share, "net_INR": s["value_INR"] - run_share,
                      "roi_on_total_cost_pct": 100 * (s["value_INR"] - run_share) / tot[1]}
    out = {
        "about": "Cost and ROI of KoolKisaan Flowers (ice-panel design). ALL PRICES ARE E (assumptions) – replace with quotations. Energy, water, kg and Rs value come from the twin (best-practice case, seasonal plan).",
        "date_range": F["date_range"], "note": "Simple payback, no interest, no tax. E = assumption. Nothing is measured.", "twin_case": case_key,
        "bom": bom, "total_cost_INR": dict(zip(LV, tot)), "total_check": "TOTAL = sum of the BOM lines (tests/test_cost.py fails if not).",
        "glycol_vs_old": {"label": "For comparison only – already inside the total",
                          "new_items": [{"item": b["item"], **{lv: b[lv] for lv in LV}} for b in new_lines],
                          "new_total_INR": dict(zip(LV, gly)), "old_item": C["old_design_refrigeration"]["item"], "old_total_INR": dict(zip(LV, old)),
                          "difference_INR": dict(zip(LV, [a - b for a, b in zip(gly, old)])),
                          "why": "The glycol design adds a pump, two motorised valves, an expansion tank and an air cooler, and the chiller costs more than a bare condensing unit. In return there is 0 g of R290 inside the room."},
        "running_INR_yr": dict(zip(LV, running)), "fogger_yearly_INR": dict(zip(LV, fogger_yearly)),
        "fogger_inputs": {"water_L_per_year": water_L, "water_L_per_day": m["water_fog_L_day"], "electric_kWh_per_year": fog_kWh, "run_hours_per_year": fog_h,
                          "fogger_W": cfg["humidity"]["fogger_W"]},
        "humidity_options": hum, "humidity_best_value": best_h,
        "humidity_best_value_why": "lowest yearly cost per % of RH gained against doing nothing (options that do not raise the RH are left out)",
        "tariff_INR_kWh": dict(zip(LV, tariff)),
        "twin_inputs": {"grid_kWh_per_year": grid_kWh, "pump_kWh_per_year": pump_kWh, "electric_kWh_per_year": m["electric_kWh_day"] * 365,
                        "fogger_water_L_per_year": water_L, "kg_stored_simulated": kg_sim, "kg_planned_full_year": kg_year, "full_year_scale": scale,
                        "kg_days_per_year": kg_days_year, "value_INR_simulated": m["value_INR"], "days_simulated": days,
                        "pump_note": "Pump energy is already inside the electricity numbers; most of it is solar."},
        "benefit": benefit, "cases": cases, "seasons": seasons,
        "season_note": "ROI per season = (Rs value captured in that season - its share of the yearly running cost) / total cost (mid). Simulated period only; mid-Nov to Dec is not in the weather file yet.",
        "assumptions_E": {"prices": "every BOM line, tariff, upkeep, bag, water, fogger part and cleaning price (config/cost.json)", "benefit": B, "price_model": "data/season_calendar.json -> price_model"},
    }
    return out


def main():
    out = build()
    (RES / "cost_roi.json").write_text(json.dumps(out, indent=1, ensure_ascii=False, default=float), encoding="utf-8")
    print("total", out["total_cost_INR"])
    for k, c in out["cases"].items():
        print(f"{k:22s} payback low/mid/high: {c['low']['payback_years']}, {c['mid']['payback_years']}, {c['high']['payback_years']}  10y mid {c['mid']['ten_year_net_INR']:.0f}")
    print({k: round(v["value_INR"]) for k, v in out["seasons"].items()})


if __name__ == "__main__":
    main()
