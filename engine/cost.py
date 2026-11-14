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
    C = json.loads((ROOT / "config" / "cost.json").read_text(encoding="utf-8"))
    F = json.loads((RES / "flowers_2026.json").read_text(encoding="utf-8"))
    W = json.loads((RES / "wax_sweep.json").read_text(encoding="utf-8"))
    P = json.loads((RES / "season_plan.json").read_text(encoding="utf-8"))
    m = F["realistic_smart"]
    days = F["date_range"]["days"]
    wax = [W["chosen_kg"] * p for p in (W["wax_price_range_INR_kg"][0], W["wax_price_INR_kg"], W["wax_price_range_INR_kg"][1])]
    bom, tot = [], [0.0, 0.0, 0.0]
    for b in C["bom"]:
        v = wax if b["INR"] == "wax" else b["INR"]
        bom.append({"item": b["item"] + (f" – {W['chosen_kg']} kg × ₹{W['wax_price_INR_kg']}/kg" if b["key"] == "wax" else ""), "key": b["key"], **dict(zip(LV, v))})
        tot = [a + x for a, x in zip(tot, v)]
    gly = [sum(b["INR"][i] for b in C["bom"] if b.get("glycol_only")) for i in range(3)]
    old = C["old_design_refrigeration"]["INR"]
    # the simulated period is 310 days; the plan for the full year gives the scale factor (E)
    kg_sim = m["kg_stored"]
    kg_year = sum(sum(f["parts"].values()) for f in P["fills_full_year"])
    scale = kg_year / kg_sim if kg_sim else 365.0 / days
    yr = 365.0 / days
    r = C["running"]
    grid_kWh, pump_kWh = m["grid_kWh_per_year"], m["pump_kWh_day"] * 365
    water_L = m["water_fog_L_day"] * 365
    running = []
    for i in range(3):
        parts = {"grid_electricity_INR": grid_kWh * r["grid_tariff_INR_kWh"][i], "upkeep_INR": r["upkeep_INR_yr"][i],
                 "bags_INR": kg_year * r["bags_INR_per_kg"][i], "water_INR": water_L * r["water_INR_per_L"][i]}
        parts["total_INR"] = sum(parts.values())
        running.append(parts)
    kg_days_year = m["kg_days"] * scale
    value_year = m["value_INR"] * scale
    B = C["benefit"]
    benefit = {
        "farmer_group": {"label": "(a) Farmer group: value captured (price uplift + losses avoided)", "INR_yr": [value_year * f for f in B["value_factor"]],
                         "how": f"seasonal twin run: ₹{m['value_INR']:,.0f} in {days} days × {scale:.2f} (kg planned for the full year / kg simulated), × 0.7 / 1.0 / 1.3"},
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
        "about": "Cost and ROI of KoolKisaan Flowers. ALL PRICES ARE E (assumptions) – replace with quotations. Energy, water, kg and Rs value come from the twin (realistic model + smart controller, seasonal plan).",
        "date_range": F["date_range"], "note": "Simple payback, no interest, no tax. E = assumption. Nothing is measured.",
        "bom": bom, "total_cost_INR": dict(zip(LV, tot)),
        "glycol_vs_old": {"glycol_parts_INR": dict(zip(LV, gly)), "old_parts_INR": dict(zip(LV, old)), "old_item": C["old_design_refrigeration"]["item"],
                          "extra_cost_INR": dict(zip(LV, [a - b for a, b in zip(gly, old)])),
                          "why": "The glycol design adds a pump, two motorised valves, an expansion tank and an air cooler, and the chiller costs more than a bare condensing unit. In return there is 0 g of R290 inside the room."},
        "running_INR_yr": dict(zip(LV, running)),
        "twin_inputs": {"grid_kWh_per_year": grid_kWh, "pump_kWh_per_year": pump_kWh, "electric_kWh_per_year": m["electric_kWh_day"] * 365,
                        "fogger_water_L_per_year": water_L, "kg_stored_simulated": kg_sim, "kg_planned_full_year": kg_year, "full_year_scale": scale,
                        "kg_days_per_year": kg_days_year, "value_INR_simulated": m["value_INR"], "days_simulated": days,
                        "pump_note": "Pump energy is already inside the electricity numbers; most of it is solar."},
        "benefit": benefit, "cases": cases, "seasons": seasons,
        "season_note": "ROI per season = (Rs value captured in that season - its share of the yearly running cost) / total cost (mid). Simulated period only; mid-Nov to Dec is not in the weather file yet.",
        "assumptions_E": {"prices": "every BOM line, tariff, upkeep, bag and water price (config/cost.json)", "benefit": B, "price_model": "data/season_calendar.json -> price_model"},
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
