"""Reality-check 'loopholes' for the flower room (values: config/design.json -> reality, all E).
Same list as the old KoolKisaan reality check, plus pump and glycol losses."""
from engine.config import load_config

ORDER = ["thermal_mass", "walls", "door", "fans_lights", "defrost", "wax_real", "machine_real", "glycol_real", "weather_hot", "load_var", "thermostat"]


def cases(cfg=None):
    rc = (cfg or load_config())["reality"]
    g = rc["glycol"]
    return {
        "thermal_mass": {"label": "Racks + crates cool down too", "real": {"extra_C_room_kJ_K": rc["rack_steel_kg"] * rc["steel_cp_kJ_kgK"],
                                                                       "crate": {"kJ_K_each": rc["crate_empty_kg"] * rc["pp_cp_kJ_kgK"]}},
                         "E": f"2 racks, {rc['rack_steel_kg']} kg steel; crates {rc['crate_empty_kg']} kg polypropylene arrive warm with the flowers"},
        "walls": {"label": "Walls: outside area 30.8 m² + 10 % thermal bridges", "real": {"wall_factor": rc["wall_outside_area_m2"] / 25.6 * (1 + rc["wall_bridge_frac"])},
                  "E": "+10 % for corners and the door frame"},
        "door": {"label": "Door: 8 openings × 20 s a day, worn curtain (E = 0.70)",
                 "real": {"door_times": rc["door"]["times"], "door_seconds": rc["door"]["seconds"], "curtain_E": rc["door"]["curtain_E"]}, "E": "8 openings instead of 6"},
        "fans_lights": {"label": "Fans and lights: cooler fan 30 W, 10 W circulation fan day and night, controller 10 W", "real": dict(rc["fans_lights"]),
                        "E": "circulation fan keeps the air moving at night (its heat stays in the room)"},
        "defrost": {"label": "Defrost: 2 × 20 min a day (off-cycle)", "real": {"defrost": rc["defrost"]}, "E": "03:00 and 15:00: chiller stopped 20 min, cooler fan on"},
        "wax_real": {"label": "Wax real-life: 90 % of latent heat, melts over 2.5–4.5 °C, fins 25 % weaker, conductivity only ×3", "real": dict(rc["wax"]),
                     "E": "blend not sharp, graphite less effective than hoped"},
        "machine_real": {"label": "Machine real-life: start losses, COP −10 % when hot, PV dust + 3 % wiring loss", "real": dict(rc["machine"]),
                         "E": "first minute of every start gives little cold; dust 0.3 %/day, cleaned weekly"},
        "glycol_real": {"label": "Pump and glycol losses: pump 55 W, pipe heat gain ×1.5, exchanger approach 5 K, cooler 20 % weaker, loop re-cooled after every stop",
                        "real": {"pump_W": g["pump_W"], "pipe_UA_factor": g["pipe_UA_factor"], "hx_approach_K": g["hx_approach_K"],
                                 "air_cooler_G_frac": g["air_cooler_G_frac"], "loop_restart": g["loop_restart"]},
                        "E": "NEW for the glycol design: wet insulation, fouled exchanger, 15 L of glycol warms up when the pump is off"},
        "weather_hot": {"label": "Weather error: hot site (+1.5 °C, less sun)", "real": {}, "weather": "hot", "E": "config/site_error_budget.json (published studies)"},
        "load_var": {"label": "Load varies 50–150 % of the plan", "real": {"intake_random": rc["load_random_frac"]}, "E": "uniform, fixed seed"},
        "thermostat": {"label": "Thermostat band ±1 °C (on/off)", "real": {"band_K": rc["thermostat_band_K"]}, "E": "simple on/off thermostat instead of exact control"},
    }


def spec(names, cfg=None, extra=None):
    """-> (real options, weather kind)."""
    cs, real, wk = cases(cfg), {}, None
    for k in names:
        real.update(cs[k]["real"])
        wk = wk or cs[k].get("weather")
    real.update(extra or {})
    return real, wk
