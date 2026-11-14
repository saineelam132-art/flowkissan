"""KoolKisaan Flowers digital twin: the 8.8 m3 flower cold room on real 2026 Visakhapatnam weather.

New design (all values in config/design.json):
  * OUTDOOR factory-sealed R290 chiller -> plate heat exchanger -> 30-35 % propylene glycol loop -> room.
    0 g of R290 inside the room. Chiller max 1.5 kW cooling, inverter 30-100 %.
  * Two motorised valves: V-ROOM (glycol air cooler with EC fan) and V-WAX (glycol coils inside the wax panels).
    Room first. V-WAX opens only with spare SOLAR and wax below 100 %. At night: pump off, both valves closed,
    the wax panels cool the room by natural convection. Minimum ON time 3 min.
  * Chiller evaporating temperature = glycol supply - plate-exchanger approach; supply 0 C for the air cooler,
    -2 C when the wax is charged. COP from CoolProp R290 at that temperature (engine/glycol.py).
    Pump power, pump heat and pipe heat gain are counted.
  * Wax: paraffin blend + 7 % expanded graphite, melts over 3.0-4.0 C, 177 kJ/kg, conductivity x5.
  * Flowers arrive at the outside air temperature at 13:00 and leave at 05:00 after 1, 2 or 3 days ('hold').
    With a hold of N days the room is filled every N days (one fill inside at a time).
  * Humidity: water balance of the room air every step (engine/humidity.py) with 4 options
    (nothing / liners / liners + tray / liners + fogger).
  * Freshness per flower: Q10 ageing + chilling penalty + water loss (engine/flowers.py).

real=... switches on the reality-check options (twin/reality_check.py); {} = the ideal model.
Every 5-minute step is integrated (explicit Euler for heat, implicit for water vapour) and summed per hour.
Nothing here is measured: results are digital-twin (S) values.
"""
import copy
import math

import numpy as np
import pandas as pd

from engine import fins as FINS
from engine import flowers as FL
from engine import glycol as GLY
from engine import humidity as HUM
from engine import loads, psychro, pv
from engine.config import load_config, load_crops

DT = 300.0
HV = HUM.H_V
CPA = HUM.CP_AIR


def _steps(hourly, centre_offset_h, n_hours):
    """Hourly values -> 5-minute steps by straight lines between hour 'centres'."""
    x = np.arange(n_hours) + centre_offset_h
    t = (np.arange(n_hours * 12) + 0.5) / 12.0
    return np.interp(t, x, np.asarray(hourly, dtype=float))


def poa_hourly(cfg, weather):
    site, p = cfg["site"], cfg["pv"]
    mid = weather["time_ist"] + pd.Timedelta(minutes=30)
    return np.array([pv.poa_irradiance(g, t.dayofyear, t.hour + t.minute / 60, site["lat_deg"], site["lon_deg"],
                                       site["utc_offset_h"], p["tilt_deg"], p["azimuth_deg"], p["ground_albedo"])
                     for g, t in zip(weather["ghi"].values, mid)])


def mix_of(cfg, crop_key):
    """{'marigold': 1.0} or the mixed load shares."""
    if crop_key == "mixed":
        return dict(cfg["flowers"]["mixed"])
    return {crop_key: 1.0}


def simulate(weather, cfg=None, crop_key=None, pcm_kg=None, pv_kWp=None, load_kg=None, hold_days=None,
             humidity=None, setpoint_C=None, real=None, init=None, steps=False, scenario=None, schedule=None):
    """Run the flower twin. weather: hourly frame with time_ist, T_out, RH_out, ps_Pa, ghi, wind.
    Returns (hourly DataFrame, totals dict, end_state dict, batches DataFrame).
    humidity: key of config humidity.options (default config humidity.default_option).
    scenario (Trust & Trade demo faults): {"from_step": i, "door_leak": fraction of an open door,
      "setpoint_C": failed-thermostat set point, "no_grid": True, "load_once": True}
    real (reality-check options, all optional): wall_factor, curtain_E, door_times, door_seconds, evap_fan_W,
      circ_fan_W, lights_door_only, controller_W, defrost {times, minutes, heater_W, fan_on}, ats_release_C,
      ats_delay_steps, solar_first, latent_frac, melt_range_C, fin_UA_frac, k_multiplier, start_loss_frac,
      cop_hot_penalty, pv_dust_per_day, pv_clean_days, pv_wiring_loss, intake_random [lo, hi, seed], band_K,
      no_grid, crate {kJ_K_each}, extra_C_room_kJ_K, pump_W, pipe_UA_factor, hx_approach_K, air_cooler_G_frac,
      loop_restart, protect_above_C"""
    cfg = copy.deepcopy(cfg or load_config())
    R = dict(real or {})
    if R.get("curtain_E") is not None:
        cfg["door"]["curtain_effectiveness_E"] = float(R["curtain_E"])
    lr, gl, hu, pc = cfg["live_run"], cfg["glycol"], cfg["humidity"], cfg["pcm"]
    crops = load_crops()
    crop_key = crop_key or cfg["flowers"]["design_flower"]
    mix = mix_of(cfg, crop_key)
    hopt = hu["options"][humidity or hu["default_option"]]
    if isinstance(crop_key, dict):
        mix, crop_key = dict(crop_key), "+".join(crop_key)
    weather = weather.copy()
    weather["ghi"] = weather["ghi"] * lr.get("sun_factor", 1.0)
    nH = len(weather)
    n = nH * 12
    t0 = pd.Timestamp(weather["time_ist"].iloc[0])

    # ---- weather at every step
    T_out = _steps(weather["T_out"], 0.0, nH)
    RH_o = np.clip(_steps(weather["RH_out"], 0.0, nH), 1, 100)
    ps = _steps(weather["ps_Pa"], 0.0, nH)
    poa = np.clip(_steps(poa_hourly(cfg, weather), 0.5, nH), 0, None)
    pvc = cfg["pv"]
    kWp = lr["designs"]["current"]["pv_kWp"] if pv_kWp is None else float(pv_kWp)
    T_cell = T_out + (pvc["NOCT_C"] - 20.0) / 800.0 * poa
    P_pv = np.clip(kWp * poa / 1000.0 * pvc["performance_ratio"] * (1 + pvc["temp_coeff_per_C"] * (T_cell - 25.0)), 0, None)
    if R.get("pv_wiring_loss") or R.get("pv_dust_per_day"):
        day_i = np.arange(n) // int(86400 / DT)
        dust = R.get("pv_dust_per_day", 0.0) * (day_i % int(R.get("pv_clean_days", 7)))
        P_pv = P_pv * (1 - R.get("pv_wiring_loss", 0.0)) * (1 - dust)

    # ---- chiller + glycol loop
    Tt, CT = GLY.cop_tables(cfg, R.get("hx_approach_K"))
    cop_room = np.interp(T_out, Tt, CT["room"]["COP_elec"])
    cop_wax = np.interp(T_out, Tt, CT["wax"]["COP_elec"])
    if R.get("cop_hot_penalty"):
        ch = R["cop_hot_penalty"]
        pen = np.where(T_out > ch["above_T_out_C"], 1 - ch["frac"], 1.0)
        cop_room, cop_wax = cop_room * pen, cop_wax * pen
    Qmax = lr["compressor_max_kW"]
    Qmin = cfg["simulation"]["inverter_min_capacity_frac"] * Qmax
    mcp = GLY.m_dot(cfg) * gl["cp_kJ_kgK"]                              # kW/K
    pump_kW = (gl["pump_W"] if R.get("pump_W") is None else R["pump_W"]) / 1000.0
    pump_heat = pump_kW * gl["pump_heat_to_fluid_frac"]
    UA_pipe = gl["pipe_UA_W_K"] / 1000.0 * R.get("pipe_UA_factor", 1.0)
    G_coil = gl["air_cooler_G_kW_K"] * R.get("air_cooler_G_frac", 1.0)
    f_air = gl["air_cooler_air_side_frac"]                                # share of the coil resistance on the air side
    G_cm = G_coil / f_air / CPA                                           # moisture conductance of the wet fin surface, kg/s
    Ts_room, Ts_wax = gl["supply_room_C"], gl["supply_wax_C"]
    min_on = gl["min_on_min"] * 60.0 / DT
    C_loop = gl["loop_volume_L"] / 1000.0 * gl["density_kg_m3"] * gl["cp_kJ_kgK"] if R.get("loop_restart") else 0.0

    # ---- room
    W_in, L_in, H_in = lr["inside_m"]
    UAw = cfg["chamber"]["insulation_k_W_mK"] / lr["insulation_thickness_m"] * cfg["chamber"]["envelope_area_m2"] / 1000.0
    if R.get("wall_factor"):
        UAw *= R["wall_factor"]
    V_room = W_in * L_in * H_in
    M_air = 1.25 * V_room
    C_room = M_air * CPA + cfg["simulation"]["structure_heat_capacity_kJ_K"] + R.get("extra_C_room_kJ_K", 0.0)
    Tset0 = lr["setpoint_C"] if setpoint_C is None else float(setpoint_C)
    shift = Tset0 - lr["setpoint_C"]                                   # a 5 C run moves the control limits with it
    protect = (cfg["controller"]["protect_above_C"] if R.get("protect_above_C") is None else R["protect_above_C"]) + shift
    ats_thr = cfg["controller"]["ats_pcm_pct"]
    if not R.get("simple_controller"):                                    # the design controller = the 'smart' rules
        for k_, v_ in cfg["controller"]["smart"].items():
            R.setdefault(k_, v_)
    fan_kW = (cfg["internal_loads"]["evaporator_fan_W"] if R.get("evap_fan_W") is None else R["evap_fan_W"]) / 1000.0
    il = cfg["internal_loads"]
    ctrl_kW = (il["controller_sensors_W"] if R.get("controller_W") is None else R["controller_W"]) / 1000.0
    circ_kW = R.get("circ_fan_W", 0.0) / 1000.0
    curtain = lr["curtain_installed"]
    assist = lr.get("grid_assist_during_loading", False)
    load_steps = int(lr.get("loading_window_h", 3) * 3600 / DT)
    tau = cfg["product"]["pulldown_hours"] * 3600.0 / math.log(8.0)
    v_on, v_off = hu["flower_air_speed_fan_on_m_s"], hu["flower_air_speed_fan_off_m_s"]
    g_tray = hu["tray_h_W_m2K"] * hu["tray_area_m2"] / 1000.0 / CPA if hopt["tray"] else 0.0
    fog_rate = hu["fogger_L_h"] / 3600.0 if hopt["fogger"] else 0.0   # kg/s
    fog_kW = hu["fogger_W"] / 1000.0
    rh_fog = 0.5 * (hu["fogger_on_below_pct"] + hu["fogger_off_at_pct"])

    # ---- wax
    m_p = float(lr["designs"]["current"]["pcm_kg"] if pcm_kg is None else pcm_kg)
    L = pc["latent_kJ_kg"] * R.get("latent_frac", 1.0)
    cps, cpl = pc["cp_solid_kJ_kgK"], pc["cp_liquid_kJ_kgK"]
    mlo, mhi = R.get("melt_range_C") or pc["melt_range_C"]
    k_wax = pc["k_pure_W_mK"] * (R.get("k_multiplier") or pc["k_multiplier"])
    hx = dict(lr["wax_hx"])
    if R.get("fin_UA_frac"):
        hx["h_scale"] = hx.get("h_scale", 1.0) * R["fin_UA_frac"]
    wax_info = None
    if m_p > 0:
        A = pc["slab_area_m2"]
        half = m_p / (pc["density_kg_m3"] * A) / 2 / k_wax
        UA_ch = A / (half + gl["wax_coil_R_m2K_W"]) / 1000.0
        _, _, dTs, G_nat_tab, _ = FINS.conductance_tables(A, hx["L"], hx["S"], hx["b"], hx["t"], half, None)
        G_nat_tab = hx.get("h_scale", 1.0) * G_nat_tab / 1000.0          # kW/K
        wax_info = {"kind": "fins", "A_m2": A, "R_wax_m2K_W": half, "UA_charge_kW_K": UA_ch, "k_W_mK": k_wax,
                    "calc_2K": FINS.array(A, hx["L"], hx["S"], hx["b"], hx["t"], half, 2.0)}
    else:
        UA_ch, dTs, G_nat_tab = 0.0, np.array([0.0, 1.0]), np.array([0.0, 0.0])
    h_min = cps * min(0.0, pc["charge_stop_C"] - mlo)
    T_gm_wax = Ts_wax + gl["design_dT_K"] / 2.0

    def T_pcm_of(h):
        if h < 0:
            return mlo + h / cps
        if h > L:
            return mhi + (h - L) / cpl
        return mlo + (mhi - mlo) * h / L

    # ---- schedules
    hrs = t0 + pd.to_timedelta(np.arange(n) * DT, unit="s")
    hod, minute, day = hrs.hour.values, hrs.minute.values, ((hrs - t0.normalize()).days).values
    door = np.zeros(n)
    d_sec = R.get("door_seconds", lr["door_seconds"])
    for (hh, mm) in (R.get("door_times") or lr["door_openings"]):
        door[(hod == hh) & (minute == (mm // 5) * 5)] += d_sec
    hold = int(lr["hold_days"] if hold_days is None else hold_days)
    kg_fill = float(lr["load_kg"] if load_kg is None else load_kg)
    n_days = int(day.max()) + 1
    if schedule is None:
        schedule = FL.daily_schedule(n_days, {k_: kg_fill * v_ for k_, v_ in mix.items()}, hold)
    spd = int(86400 / DT)
    load_at, out_at = {}, {}
    for fi, f_ in enumerate(schedule):
        load_at.setdefault(f_["in_day"] * spd + int(lr["load_hour"] * 3600 / DT), []).append(fi)
        out_at.setdefault(f_["out_day"] * spd + int(lr["takeout_hour"] * 3600 / DT), []).append(fi)
    intake = None
    if R.get("intake_random"):                                            # each fill is 50-150 % of the plan (same mean)
        lo_, hi_, seed_ = R["intake_random"]
        intake = np.random.default_rng(int(seed_)).uniform(lo_, hi_, n_days)
    defrost = np.zeros(n, bool)
    if R.get("defrost"):
        for (hh, mm) in R["defrost"]["times"]:
            for j in np.where((hod == hh) & (minute == mm))[0]:
                defrost[j:j + int(R["defrost"]["minutes"] * 60 / DT)] = True
    band = R.get("band_K")
    crate = R.get("crate")
    sc = scenario or {}
    sc_from = int(sc.get("from_step", 0))
    loaded_once = False

    # ---- state
    st = init or {}
    T_r = st.get("T_room", Tset0)
    W_r = st.get("W_room", HUM.w_of(cfg["setpoint"]["rh_room_pct"], T_r, ps[0]))
    h = st.get("pcm_h", 0.0) if m_p > 0 else 0.0
    grid_mode = st.get("grid_mode", False)
    nodes = [dict(nd, fill=None, fresh=FL.FlowerFreshness(crops[nd["crop"]], nd["fresh_state"]), amb=FL.FlowerFreshness(crops[nd["crop"]], nd["amb_state"]))
             for nd in st.get("nodes", [])]
    T_loop = st.get("T_loop", Ts_room)
    debt = 0.0
    comp_on, was_running, hot_run = True, False, 0
    last_load = None
    E0 = C_room * T_r + M_air * W_r * HV + m_p * h + sum(nd["C"] * nd["T"] for nd in nodes)

    keys = ("T_room", "RH_room", "W_room", "T_batch", "pcm_pct", "T_pcm", "pcm_h", "Q_wall", "Q_door", "Q_door_lat", "Q_batch", "Q_resp",
            "Q_int", "Q_air", "Q_air_sens", "Q_air_lat", "Q_ch", "Q_pcm_room", "Q_wax_lat", "Q_pipe", "Q_pump", "Q_chill",
            "P_comp", "P_chiller", "P_pump", "P_fan", "P_fog", "P_pv", "P_solar_used", "P_grid", "grid_on", "running", "run_frac",
            "door_s", "solar_ok", "G_wax", "cop", "T_out", "RH_out", "poa", "v_room", "v_wax", "T_sup", "T_ret",
            "w_transp", "w_coil", "w_wax", "w_fog", "w_tray", "w_door", "kg_inside", "valve_duty", "Q_evap_air", "ps_Pa", "load_event", "Q_other")
    out = {k: np.zeros(n) for k in keys}
    acc = dict(in_=0.0, out=0.0, prod_in=0.0, prod_out=0.0)
    batches = []

    for i in range(n):
        fault = i >= sc_from and any(k_ in sc for k_ in ("door_leak", "setpoint_C", "no_grid"))
        Tset = sc.get("setpoint_C", Tset0) if fault else Tset0
        p = ps[i]

        # ---- flowers out (05:00) and in (13:00)
        load_ev = 0.0
        if i in out_at and nodes:
            gone = set(out_at[i])
            for nd in nodes:
                if nd.get("fill") in gone or (nd.get("fill") is None and nd.get("out_step") == i):
                    acc["prod_out"] += nd["C"] * nd["T"]
                    b = batches[nd["b"]] if nd["b"] is not None else None
                    if b is not None:
                        b.update(out_step=i, F_room=nd["fresh"].value, F_ambient=nd["amb"].value, wl_pct=nd["fresh"].wl,
                                 fragrance=nd["fresh"].fragrance, T_out_C=nd["T"], hours=(i - b["step"]) * DT / 3600.0)
                    nd["gone"] = True
            nodes = [nd for nd in nodes if not nd.get("gone")]
        if i in load_at and not (sc.get("load_once") and loaded_once):
            for fi in load_at[i]:
                f_ = schedule[fi]
                scale = float(intake[min(int(day[i]), len(intake) - 1)]) if intake is not None else 1.0
                bag = bool(f_.get("bag", True)) and hopt["liner"]
                for ck, kg0 in f_["parts"].items():
                    cr = crops[ck]
                    m = kg0 * scale
                    C = m * cr.get("cp_kJ_kgK", cfg["product"]["cp_kJ_kgK"])
                    if crate:
                        C += FL.crates_needed(cr, m) * crate["kJ_K_each"]
                    batches.append({"fill": fi, "step": i, "date": str(hrs[i].date()), "crop": ck, "kg": m, "T_in_C": float(T_out[i]), "cool_steps": None,
                                    "out_step": None, "F_room": None, "F_ambient": None, "wl_pct": None, "fragrance": None, "T_out_C": None, "hours": None,
                                    "bag": bag, "boric": bool(f_.get("boric")), "reason": f_.get("reason"), "season": f_.get("season")})
                    nodes.append({"crop": ck, "m": m, "C": C, "T": float(T_out[i]), "b": len(batches) - 1, "fill": fi,
                                  "off": (cr.get("shelf") or {}).get("warmest_shelf_offset_K", 0.0), "liner": hu["liner_transpiration_factor"] if bag else 1.0,
                                  "fresh": FL.FlowerFreshness(cr, bagged=bag, boric=bool(f_.get("boric"))), "amb": FL.FlowerFreshness(cr)})
                    acc["prod_in"] += C * T_out[i]
            last_load = i
            loaded_once = True
            load_ev = 1.0

        T_p = T_pcm_of(h) if m_p > 0 else T_r
        pct = 100.0 * (1 - min(1.0, max(0.0, h / L))) if m_p > 0 else 0.0
        RH_r = min(100.0, HUM.rh_of(W_r, T_r, p))

        # ---- power available (room first; grid only as backup)
        loading_now = last_load is not None and i - last_load < load_steps
        hot = T_r > protect and (assist or not loading_now)
        if R.get("ats_delay_steps"):
            hot_run = hot_run + 1 if hot else 0
            hot = hot_run >= R["ats_delay_steps"]
        aux = fan_kW + pump_kW
        Q_sun_room = min(Qmax, max(0.0, P_pv[i] - aux) * cop_room[i])
        Q_sun_wax = min(Qmax, max(0.0, P_pv[i] - aux) * cop_wax[i])
        solar_ok = Q_sun_room >= Qmin
        hot_day = False
        if solar_ok:
            grid_mode = False
            hot_day = hot                                                 # grid help by day only if the SUN is what limits (below)
        else:
            grid_mode = grid_mode or (m_p > 0 and pct < ats_thr) or (m_p == 0) or hot
            if R.get("ats_release_C") is not None and grid_mode and m_p > 0 and pct >= ats_thr and T_r < R["ats_release_C"] + shift:
                grid_mode = False
        no_grid = (fault and sc.get("no_grid")) or R.get("no_grid")
        if no_grid:
            grid_mode = False
        Q_avail = Qmax if grid_mode else (Q_sun_room if solar_ok else 0.0)       # chiller cold, supply 0 C
        if defrost[i]:
            Q_avail = 0.0

        # ---- heat gains
        Dt_door = min(1.0, door[i] / DT)
        Dt = max(Dt_door, float(sc["door_leak"])) if (fault and sc.get("door_leak")) else Dt_door
        Q_wall = UAw * (T_out[i] - T_r)
        g_door, W_o = 0.0, psychro.humidity_ratio(T_out[i], RH_o[i], p)
        Q_door = 0.0
        if Dt > 0:
            inf = loads.infiltration_load(cfg, T_out[i], RH_o[i], T_r, RH_r, D_t=1.0, curtain=curtain, p=p)
            dh = inf["h_out_kJ_kg"] - inf["h_in_kJ_kg"]
            g_door = inf["Q_kW"] / dh * Dt if dh > 1e-9 else 0.0        # kg of outside air per second
            Q_door = g_door * (CPA + 1.86 * W_o) * (T_out[i] - T_r)    # sensible part; the water goes to the vapour balance
        lights = il["lights_W"] / 1000.0 * (Dt_door if R.get("lights_door_only") else max(il["lights_on_fraction"], Dt_door))
        heat_def = (R["defrost"].get("heater_W", 0.0) / 1000.0 + (fan_kW if R["defrost"].get("fan_on") else 0.0)) if defrost[i] else 0.0
        Q_bs = [nd["C"] / tau * (nd["T"] - T_r - nd.get("off", 0.0)) for nd in nodes]
        Q_b = sum(Q_bs)
        Q_rs = [nd["m"] * FL.respiration_W_kg(crops[nd["crop"]], nd["T"]) / 1000.0 for nd in nodes]

        dTw = T_r - T_p if m_p > 0 else 0.0
        G_w = float(np.interp(max(dTw, 0.0), dTs, G_nat_tab)) if m_p > 0 else 0.0
        Q_pa = G_w * dTw if dTw > 0 else (G_nat_tab[1] * dTw if m_p > 0 else 0.0)
        base = Q_wall + Q_door + Q_b + lights + ctrl_kW + circ_kW + heat_def

        # ---- V-ROOM: air cooler duty needed to bring the room to the set point this step
        target = Tset
        if band:
            if T_r >= Tset + band:
                comp_on = True
            elif T_r <= Tset - band:
                comp_on = False
            target = Tset - band
        Q_req = base + fan_kW - Q_pa + C_room * (T_r - target) / DT
        if band and not comp_on:
            Q_req = 0.0
        pipe_room = UA_pipe * max(0.0, T_out[i] - (Ts_room + gl["design_dT_K"] / 2))
        loss_room = pipe_room + pump_heat
        Ts = Ts_room
        duty = Q_air_s = Q_air_l = Q_ch = 0.0
        q_s1 = T_surf = 0.0
        for _try in (0, 1):
            duty = 0.0
            if Q_avail > loss_room and Q_req > 1e-9:
                q_s1 = GLY.coil_sensible_kW(G_coil, T_r, Ts, mcp)             # while the valve is open
                if q_s1 > 1e-9:
                    T_surf = T_r - f_air * (T_r - (Ts + q_s1 / (2 * mcp)))
                    q_l1 = G_cm * max(0.0, W_r - HUM.w_sat(T_surf, p)) * HV
                    d_need, d_pow = min(1.0, Q_req / q_s1), (Q_avail - loss_room) / (q_s1 + q_l1)
                    duty = min(d_need, d_pow)
                    if hot_day and d_pow < d_need - 1e-9 and not no_grid and not defrost[i] and _try == 0:
                        grid_mode, Q_avail = True, Qmax                   # the sun is too weak for a hot room: grid helps
                        continue
            elif hot_day and Q_req > 1e-9 and not no_grid and not defrost[i] and _try == 0:
                grid_mode, Q_avail = True, Qmax
                continue
            break
        want_wax = m_p > 0 and solar_ok and not grid_mode and not defrost[i] and h > h_min + 1e-9
        if want_wax:                                                      # spare solar after the room -> V-WAX, supply -2 C
            q_s1w = GLY.coil_sensible_kW(G_coil, T_r, Ts_wax, mcp)
            duty_w = min(1.0, Q_req / q_s1w) if (Q_req > 1e-9 and q_s1w > 1e-9) else 0.0
            T_surf_w = T_r - f_air * (T_r - (Ts_wax + q_s1w / (2 * mcp)))
            q_l1w = G_cm * max(0.0, W_r - HUM.w_sat(T_surf_w, p)) * HV
            pipe_w = UA_pipe * max(0.0, T_out[i] - T_gm_wax)
            spare = Q_sun_wax - pipe_w - pump_heat - duty_w * (q_s1w + q_l1w)
            ch_max = min(UA_ch * max(0.0, T_p - T_gm_wax), m_p * (h - h_min) / DT)
            if spare > 1e-6 and ch_max > 1e-6 and duty_w * q_s1w >= min(Q_req, duty * q_s1 if duty > 0 else Q_req) - 1e-9:
                Q_ch = min(spare, ch_max)
                Ts, duty, q_s1, T_surf, loss_room = Ts_wax, duty_w, q_s1w, T_surf_w, pipe_w + pump_heat
        if duty > 0 and Q_ch <= 0:                                        # V-ROOM alone: at least the minimum speed for 3 min
            need = min(Q_avail, Qmin) * min(1.0, min_on) - loss_room
            if duty * q_s1 < need:
                duty = min(1.0, max(duty, need / max(q_s1, 1e-9)))

        # ---- water vapour balance (implicit), with the coil as a sink while its valve is open
        terms = []
        if g_door > 0:
            terms.append((g_door, W_o, "both"))
        v_fl = v_on if duty > 0 else v_off
        tr_i0 = len(terms)
        for nd in nodes:
            f = crops[nd["crop"]]["freshness"]
            g_t = nd["m"] * f["K_t_mg_kg_s_MPa"] * 3.6e-5 / 100.0 / 3600.0 * math.sqrt(v_fl) * nd.get("liner", 1.0) * (p / 100.0) / 0.621945
            terms.append((g_t, HUM.w_sat(nd["T"], p), "source"))
        tray_i = len(terms)
        if g_tray > 0:
            terms.append((g_tray, HUM.w_sat(T_r, p), "source"))
        coil_i = len(terms)
        if duty > 0:
            terms.append((duty * G_cm, HUM.w_sat(T_surf, p), "sink"))
        wax_i = len(terms)
        if m_p > 0 and G_w > 0:
            terms.append((G_w / CPA, HUM.w_sat(T_p, p), "sink"))
        W_new, fl = HUM.solve(W_r, M_air, DT, terms)
        S_fog = 0.0
        if fog_rate > 0 and nodes:
            W_t = HUM.w_of(rh_fog, T_r, p)
            if W_new < W_t:
                den = M_air / DT + sum(g for (g, Wt, kind), f_ in zip(terms, fl) if f_ != 0.0 or kind == "both")
                S_fog = min(fog_rate, (W_t - W_new) * den)
                W_new, fl = HUM.solve(W_r, M_air, DT, terms, S_fog)
        W_sat_r = HUM.w_sat(T_r, p)
        w_excess = max(0.0, W_new - W_sat_r) * M_air / DT                 # fog / dew on the walls: latent heat stays in the room
        W_new = min(W_new, W_sat_r)
        w_door = fl[0] if g_door > 0 else 0.0
        w_tr = fl[tr_i0:tray_i]
        w_tray = fl[tray_i] if g_tray > 0 else 0.0
        w_coil = -fl[coil_i] if duty > 0 else 0.0
        w_wax = -fl[wax_i] if (m_p > 0 and G_w > 0) else 0.0
        Q_air_s = duty * q_s1 if duty > 0 else 0.0
        Q_air_l = w_coil * HV
        Q_air = Q_air_s + Q_air_l
        Q_wax_l = w_wax * HV

        # ---- chiller
        running = (Q_air + Q_ch) > 1e-9
        Q_chill = Q_air + Q_ch + loss_room if running else 0.0
        if running and C_loop > 0 and debt > 0:                           # reality: re-cool the warm glycol loop after a stop
            pay = min(debt, 0.5 * Q_chill * DT)
            debt -= pay
            Q_chill += pay / DT
        run_frac = min(1.0, max(Q_chill / Qmin, min(1.0, min_on))) if running else 0.0
        cop_i = cop_wax[i] if Q_ch > 0 else cop_room[i]
        P_chiller = Q_chill / cop_i if running else 0.0
        P_fan = fan_kW * run_frac if Q_air > 0 else 0.0
        P_pump = pump_kW * run_frac
        P_fog = fog_kW * (S_fog / fog_rate) if fog_rate > 0 else 0.0
        if R.get("start_loss_frac") and running and not was_running:
            k_ = 1 - R["start_loss_frac"]                                 # a start: power but little cold in the first minute
            Q_air_s *= k_
            Q_ch *= k_
            Q_air = Q_air_s + Q_air_l
        was_running = running
        P_comp = P_chiller + P_fan + P_pump + heat_def + P_fog            # all electricity of the cooling system
        if grid_mode:
            P_sol = min(P_comp, P_pv[i]) if solar_ok else 0.0
            P_grid = P_comp - P_sol
        else:
            P_sol = min(P_comp, P_pv[i]) if running else min(P_fog, P_pv[i])
            P_grid = P_comp - P_sol if not running else 0.0               # fogger at night: from the grid / battery
        if C_loop > 0:
            if running:
                T_loop = Ts
            else:
                T_new = T_out[i] + (T_loop - T_out[i]) * math.exp(-UA_pipe * DT / C_loop)
                debt += C_loop * (T_new - T_loop)
                T_loop = T_new

        # ---- integrate
        Q_int = lights + ctrl_kW + circ_kW + heat_def + P_fan + P_fog
        evap_air = (w_tray + S_fog - w_excess) * HV                       # evaporation in the air cools the air
        dT_r = (Q_wall + Q_door + Q_int - Q_pa - Q_air_s - evap_air) * DT / C_room
        Cn = sum(nd["C"] for nd in nodes)
        stab = Cn / tau * DT / C_room
        if stab <= 0.5:
            T_r_new = T_r + dT_r + Q_b * DT / C_room
            for nd, qb, qr, wt in zip(nodes, Q_bs, Q_rs, w_tr):
                nd["T"] += (-qb + qr - wt * HV) * DT / nd["C"]
        else:                                                             # lots of flowers for little air: sub-steps
            T_x = T_r + dT_r
            nsub = int(math.ceil(stab / 0.25))
            dts = DT / nsub
            for _ in range(nsub):
                for nd, qr, wt in zip(nodes, Q_rs, w_tr):
                    q = nd["C"] / tau * (nd["T"] - T_x - nd.get("off", 0.0))
                    T_x += q * dts / C_room
                    nd["T"] += (-q + qr - wt * HV) * dts / nd["C"]
            T_r_new = T_x
        Q_other = C_room * (T_r_new - T_r) / DT - (Q_wall + Q_door - Q_pa - Q_air)   # fans, lights, flowers, evaporation (controller log)
        v_now = v_on if duty > 0 else v_off
        for nd in nodes:
            nd["fresh"].step(T_r, RH_r, v_now, DT / 3600.0, T_core=nd["T"], liner=nd.get("liner", 1.0))
            nd["amb"].step(T_out[i], RH_o[i], 0.25, DT / 3600.0)
            b = batches[nd["b"]] if nd["b"] is not None else None
            if b is not None and b["cool_steps"] is None and nd["T"] <= lr["cooled_to_C"] + shift:
                b["cool_steps"] = i - b["step"]
        if m_p > 0:
            h += (Q_pa + Q_wax_l - Q_ch) * DT / m_p
        T_r, W_r = T_r_new, W_new

        acc["in_"] += (Q_wall + Q_door + w_door * HV + sum(Q_rs) + Q_int) * DT
        acc["out"] += (Q_air + Q_ch) * DT
        T_b = nodes[0]["T"] if nodes else T_r
        Tret = Ts + (Q_chill / run_frac) / mcp if running else np.nan
        for key, val in (("T_room", T_r), ("RH_room", min(100.0, HUM.rh_of(W_r, T_r, p))), ("W_room", W_r), ("T_batch", T_b), ("pcm_pct", pct),
                         ("T_pcm", T_pcm_of(h) if m_p > 0 else np.nan), ("pcm_h", h), ("Q_wall", Q_wall), ("Q_door", Q_door),
                         ("Q_door_lat", w_door * HV), ("Q_batch", Q_b), ("Q_resp", sum(Q_rs)), ("Q_int", Q_int), ("Q_air", Q_air),
                         ("Q_air_sens", Q_air_s), ("Q_air_lat", Q_air_l), ("Q_ch", Q_ch), ("Q_pcm_room", Q_pa), ("Q_wax_lat", Q_wax_l),
                         ("Q_pipe", (loss_room - pump_heat) if running else 0.0), ("Q_pump", pump_heat if running else 0.0), ("Q_chill", Q_chill),
                         ("P_comp", P_comp), ("P_chiller", P_chiller), ("P_pump", P_pump), ("P_fan", P_fan), ("P_fog", P_fog), ("P_pv", P_pv[i]),
                         ("P_solar_used", P_sol), ("P_grid", P_grid), ("grid_on", float(grid_mode)), ("running", float(running)),
                         ("run_frac", run_frac), ("door_s", door[i]), ("solar_ok", float(solar_ok)), ("G_wax", G_w * 1000), ("cop", cop_i),
                         ("T_out", T_out[i]), ("RH_out", RH_o[i]), ("poa", poa[i]), ("v_room", float(Q_air > 1e-9)), ("v_wax", float(Q_ch > 1e-9)),
                         ("T_sup", Ts if running else np.nan), ("T_ret", Tret), ("w_transp", sum(w_tr)), ("w_coil", w_coil), ("w_wax", w_wax),
                         ("w_fog", S_fog), ("w_tray", w_tray), ("w_door", w_door), ("kg_inside", sum(nd["m"] for nd in nodes)),
                         ("valve_duty", duty), ("Q_evap_air", evap_air), ("ps_Pa", p), ("load_event", load_ev), ("Q_other", Q_other)):
            out[key][i] = val

    E1 = C_room * T_r + M_air * W_r * HV + m_p * h + sum(nd["C"] * nd["T"] for nd in nodes)
    heat_in = acc["in_"] + acc["prod_in"]
    heat_out = acc["out"] + acc["prod_out"]
    bal = heat_in - heat_out - (E1 - E0)

    S5 = pd.DataFrame(out, index=hrs) if steps else None
    mean_keys = [k for k in keys if k not in ("door_s", "T_sup", "T_ret", "load_event")]
    H = pd.DataFrame({k: out[k].reshape(nH, 12).mean(axis=1) for k in mean_keys})
    H["door_s"] = out["door_s"].reshape(nH, 12).sum(axis=1)
    with np.errstate(invalid="ignore"):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            H["T_sup"] = np.nanmean(out["T_sup"].reshape(nH, 12), axis=1)
            H["T_ret"] = np.nanmean(out["T_ret"].reshape(nH, 12), axis=1)
    H["running_h"] = H.pop("run_frac")
    H.insert(0, "time_ist", weather["time_ist"].values)
    H["ghi"] = weather["ghi"].values
    H["Q_cool"] = H["Q_air"] + H["Q_ch"]
    H["Q_load"] = H["Q_wall"] + H["Q_door"] + H["Q_door_lat"] + H["Q_resp"] + H["Q_int"]

    bt = pd.DataFrame(batches)
    if len(bt):
        bt["cool_h"] = bt["cool_steps"].astype(float) * DT / 3600.0
    totals = {"pcm_kg": m_p, "pv_kWp": kWp, "hours": nH, "crop": crop_key, "load_kg": kg_fill, "hold_days": hold,
              "humidity": humidity or hu["default_option"], "setpoint_C": Tset0,
              "energy_in_kWh": heat_in / 3600, "energy_out_kWh": heat_out / 3600, "stored_change_kWh": (E1 - E0) / 3600,
              "energy_balance_error_kWh": bal / 3600, "energy_balance_error_pct": 100 * abs(bal) / heat_out if heat_out else 0.0,
              "wax": wax_info, "glycol": {"m_dot_kg_s": GLY.m_dot(cfg), "T_evap_room_C": CT["room"]["T_evap_C"], "T_evap_wax_C": CT["wax"]["T_evap_C"]}}
    end_state = {"T_room": T_r, "W_room": W_r, "pcm_h": h, "grid_mode": grid_mode, "T_loop": T_loop,
                 "nodes": [{"crop": nd["crop"], "m": nd["m"], "C": nd["C"], "T": nd["T"], "b": None, "off": nd.get("off", 0.0), "liner": nd.get("liner", 1.0),
                            "fresh_state": nd["fresh"].state(), "amb_state": nd["amb"].state()} for nd in nodes]}
    if steps:
        totals["steps"] = S5
    return H, totals, end_state, bt
