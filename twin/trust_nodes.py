"""Trust & Trade: the four inside sensor nodes, simulated from OUR flower twin (tag S), the physics check Φ and the glycol energy check.

    python -m twin.trust_nodes        ->  web/trust/data/trust_data.js  +  data/trust/phi_2026_stats.json

Nodes (every 5 min):
    N1 supply air (coil outlet): T_s, RH_s, v      N2 produce core probe: T_core (lag, tau = 4 h / ln 8)
    N3 door: open, angle, leakage W (ASHRAE)        N4 return air: T_r, RH_r
    plus outside air (W) and the compressor electrical power P_el (S, energy meter).

How the node values are made (so a NORMAL run is physically consistent by construction):
    T_r, T_core, door, P_el and the ice numbers come straight from twin/live_sim.py.
    RH_r = room set point (90 %).  v = evaporator airflow / coil face area while the fan runs, else 0.
    T_s is solved so that the air side carries exactly the twin's cooling Q_air:
        m_dot * (cp (T_r - T_s) + h_fg (W_r - W_s)) = Q_air,   W_s = min(W_r, 0.98 W_sat(T_s)).
    Then sensor noise (config trust.sensor_noise, fixed seed) is added, like real sensors.

Φ: four residuals (moisture, energy, room heat balance, core lag), z = r / sigma,
    Φ = sqrt(sum w z^2 / sum w); green < 2, orange 2-3; Φ >= 3 for 3 steps in a row -> physics flag.
sigma is tuned on the twin's own normal 2026 run (frozen study weather) with sensor noise:
    sigma_k = max(default_k, 99.9th percentile of |r_k| / 3).
Nothing here is measured. Results are NOT written to results/.
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from engine import loads
from engine import physics_check as PC
from engine import shelf_life as SL
from engine.config import load_config, load_crops
from engine import flowers as FL
from engine import glycol as GLY
from twin.flower_sim import DT, simulate

ROOT = Path(__file__).resolve().parent.parent
WEATHER = ROOT / "data" / "uncertainty" / "weather_2026_study.csv"
OUT_JS = ROOT / "web" / "trust" / "data" / "trust_data.js"
OUT_STATS = ROOT / "data" / "trust" / "phi_2026_stats.json"
KEYS = ("r1", "r2", "r3", "r4")
SIG = ("W_kg_kg", "E_W", "Q_W", "core_K")


def study_weather():
    return pd.read_csv(WEATHER, parse_dates=["time_ist"])


def constants(cfg, crop):
    """Scalars the physics check needs (all from config, same as the twin). The heat of the flowers is part of the
    controller log 'Q_int_kW' (fans + lights + flowers + evaporation), so the produce term of the old check is zero."""
    lr = cfg["live_run"]
    W, L, H = lr["inside_m"]
    return {"dt_s": DT, "m_kg": 0.0, "cp_kJ_kgK": crop["cp_kJ_kgK"],
            "tau_s": cfg["product"]["pulldown_hours"] * 3600.0 / math.log(8.0),
            "C_room_kJ_K": 1.25 * W * H * L * 1.006 + cfg["simulation"]["structure_heat_capacity_kJ_K"],
            "UA_kW_K": cfg["chamber"]["insulation_k_W_mK"] / lr["insulation_thickness_m"] * cfg["chamber"]["envelope_area_m2"] / 1000.0,
            "A_face_m2": cfg["trust"]["coil_face_area_m2"], "r_ref_W_kg": 0.0, "Q10": crop["Q10"], "T_ref_C": crop["T_ref_C"],
            "glycol_m_dot_kg_s": GLY.m_dot(cfg), "glycol_cp_kJ_kgK": cfg["glycol"]["cp_kJ_kgK"]}


def solve_Ts(T_r, W_r, Q_air_kW, mdot, p_hPa):
    """Supply-air temperature that makes the air side carry Q_air (bisection, vectorised)."""
    lo, hi = T_r - 40.0, T_r.copy()
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        W_s = np.minimum(W_r, 0.98 * PC.humidity_ratio(mid, 100.0, p_hPa))
        q = mdot * (PC.CP_AIR * (T_r - mid) + PC.H_FG * (W_r - W_s)) / 1000.0
        big = q > Q_air_kW
        lo, hi = np.where(big, mid, lo), np.where(big, hi, mid)
    T_s = 0.5 * (lo + hi)
    W_s = np.minimum(W_r, 0.98 * PC.humidity_ratio(T_s, 100.0, p_hPa))
    return T_s, W_s


def truth_nodes(S, cfg, door_leak=0.0):
    """Exact (noise-free) node values from the twin's 5-minute steps S (DataFrame from steps=True)."""
    tr = cfg["trust"]
    n = len(S)
    p_hPa = S["ps_Pa"].values / 100.0
    T_r = S["T_room"].values
    RH_r = S["RH_room"].values
    W_r = PC.humidity_ratio(T_r, RH_r, p_hPa)
    running = S["Q_air"].values > 1e-9
    v_fan = tr["evaporator_airflow_m3_h"] / 3600.0 / tr["coil_face_area_m2"]
    v = np.where(running, v_fan, 0.0)
    mdot = PC.RHO_AIR * v * tr["coil_face_area_m2"]
    T_s, W_s = solve_Ts(T_r, W_r, S["Q_air"].values, np.maximum(mdot, 1e-9), p_hPa)
    T_s = np.where(running, T_s, T_r)
    W_s = np.where(running, W_s, W_r)
    RH_s = 100.0 * W_s * p_hPa / (0.622 + W_s) / PC.e_s(T_s)
    door_open_frac = np.minimum(1.0, S["door_s"].values / DT)
    Dt_all = np.maximum(door_open_frac, door_leak) if door_leak else door_open_frac
    # N3 only sees the door it can see: a torn seal is invisible to the door switch
    Q_door_seen = np.where(Dt_all > 0, S["Q_door"].values * door_open_frac / np.maximum(Dt_all, 1e-9), 0.0)
    T_r_prev = np.r_[T_r[0], T_r[:-1]]
    T_p_prev = np.r_[S["T_pcm"].values[0], S["T_pcm"].values[:-1]]
    dTw = T_r_prev - T_p_prev
    G_w = np.where(np.abs(dTw) > 1e-6, S["Q_pcm_room"].values / np.where(np.abs(dTw) > 1e-6, dTw, 1.0), 0.0)
    on = S["running"].values > 0.5
    mcp = GLY.m_dot(cfg) * cfg["glycol"]["cp_kJ_kgK"]
    # glycol sensors: 5-minute means; when the pump is off both read the loop (shown as equal)
    T_sup = np.where(on, np.nan_to_num(S["T_sup"].values), T_r)
    T_ret = np.where(on, T_sup + S["Q_chill"].values / mcp, T_r)
    return pd.DataFrame({
        "T_s": T_s, "RH_s": RH_s, "v_s": v, "T_core": S["T_batch"].values,
        "door_open": (door_open_frac > 0).astype(float), "door_angle_deg": np.where(door_open_frac > 0, 90.0, 0.0),
        "Q_door_kW": Q_door_seen, "T_r": T_r, "RH_r": RH_r,
        "T_out": S["T_out"].values, "RH_out": S["RH_out"].values, "p_hPa": p_hPa,
        "P_el_kW": S["P_chiller"].values + S["P_fan"].values, "P_fan_kW": S["P_fan"].values, "cop": S["cop"].values,
        "Q_wax_branch_kW": S["Q_ch"].values + S["Q_pipe"].values + S["Q_pump"].values,
        "Q_int_kW": S["Q_other"].values + S["Q_door"].values - Q_door_seen * 0 - S["Q_door"].values,
        "G_wax_kW_K": G_w, "T_pcm": S["T_pcm"].values,
        "load_event": S["load_event"].values,
        "grid_on": S["grid_on"].values, "running": on.astype(float), "pcm_pct": S["pcm_pct"].values,
        "T_sup": T_sup, "T_ret": T_ret, "Q_gly_true_kW": S["Q_chill"].values, "P_chiller_kW": S["P_chiller"].values,
        "Q_room_side_kW": S["Q_air"].values + S["Q_ch"].values + S["Q_pipe"].values + S["Q_pump"].values,
        "v_room": S["v_room"].values, "v_ice": S["v_ice"].values, "kg_inside": S["kg_inside"].values,
    }, index=S.index)


def add_noise(N, cfg, seed=None):
    """Sensor noise like real cheap sensors (config trust.sensor_noise)."""
    sn = cfg["trust"]["sensor_noise"]
    rng = np.random.default_rng(sn["seed"] if seed is None else seed)
    R = N.copy()
    n = len(R)
    for c in ("T_s", "T_r", "T_core", "T_out", "T_pcm"):
        R[c] = R[c] + rng.normal(0, sn["T_K"], n)
    for c in ("RH_s", "RH_r"):
        R[c] = np.clip(R[c] + rng.normal(0, sn["RH_pct"], n), 0, 100)
    R["P_el_kW"] = R["P_el_kW"] * (1 + rng.normal(0, sn["P_rel"], n))
    R["v_s"] = R["v_s"] * (1 + sn["airflow_bias_rel"])            # a fixed calibration bias
    for c in ("T_sup", "T_ret"):
        R[c] = R[c] + rng.normal(0, sn["glycol_T_K"], n)
    R["P_chiller_kW"] = R["P_chiller_kW"] * (1 + rng.normal(0, sn["P_rel"], n))
    return R


def fake(R, cfg, start, seed=11):
    """'Report fake readings from now on': air and core read 4.0 °C (with normal-looking sensor noise)."""
    F = R.copy()
    rng = np.random.default_rng(seed)
    m = np.arange(len(F)) >= start
    k = int(m.sum())
    for c in ("T_s", "T_r", "T_core"):
        F.loc[m, c] = cfg["trust"]["fake_reading_C"] + rng.normal(0, cfg["trust"]["sensor_noise"]["T_K"], k)
    return F


def fake_ramp(R, cfg, start, ramp=12, seed=3):
    """A more careful cheater: each temperature slides from its real value to 4.0 °C over 1 h, then holds."""
    F = R.copy()
    rng = np.random.default_rng(seed)
    for c in ("T_s", "T_r", "T_core"):
        v = F[c].values.copy()
        v0 = v[start]
        for j in range(start + 1, len(v)):
            v[j] = v0 + (cfg["trust"]["fake_reading_C"] - v0) * min(1.0, (j - start) / ramp) + rng.normal(0, cfg["trust"]["sensor_noise"]["T_K"])
        F[c] = v
    return F


def as_input(R, const):
    d = {c: R[c].values for c in ("T_s", "RH_s", "v_s", "T_r", "RH_r", "T_core", "P_el_kW", "P_fan_kW", "cop",
                                  "Q_wax_branch_kW", "Q_int_kW", "G_wax_kW_K", "T_pcm", "T_out", "Q_door_kW",
                                  "p_hPa", "load_event")}
    d.update(const)
    return d


def phi_of(R, cfg, const, sigma):
    res = PC.residuals(as_input(R, const), cfg)
    p = cfg["trust"]["phi"]
    phi, z = PC.phi_from(res, sigma, p["weights"], p["window_steps"])
    return phi, z, res


def tune_sigma(res, cfg):
    """sigma_k = max(floor, 99.9th percentile of |15-min mean residual| / 3) over the normal run
    (r1, r2 only while the coil fan runs)."""
    p = cfg["trust"]["phi"]
    d = p["sigma_default"]
    out = {}
    for k, s in zip(KEYS, SIG):
        r = PC.trailing_mean(res[k], p["window_steps"])[1:]
        if k in ("r1", "r2"):
            r = r[res["coil_on"][1:]]
        out[s] = float(max(d[s], np.nanpercentile(np.abs(r), 99.9) / 3.0))
    return out


def detection_steps(R, cfg, const, sigma, start, horizon=36, how=None):
    """Readings (5 min each) from the first fake reading until the physics flag is raised
    (Φ >= red_at for red_steps in a row). None if not raised within `horizon` readings."""
    lo = max(0, start - 12)
    W = R.iloc[lo:start + horizon]
    F = (how or fake)(W, cfg, start - lo)
    phi, _, _ = phi_of(F, cfg, const, sigma)
    p = cfg["trust"]["phi"]
    s0 = start - lo
    for a, b in PC.phi_flags(phi, p["red_at"], p["red_steps"]):
        raised = a + p["red_steps"] - 1
        if raised >= s0:
            return raised - s0 + 1
    return None


def glycol_check(R, cfg, const):
    """Glycol energy balance: Q = m_dot cp (T_return - T_supply) must match (a) the room side
    (air cooler + ice + pipe gain + pump heat) and (b) COP x chiller electric power, inside the error band.
    Band = what the sensor noise gives (2 glycol sensors, flow meter, power meter), 3 sigma, 15-minute means."""
    sn = cfg["trust"]["sensor_noise"]
    mcp = const["glycol_m_dot_kg_s"] * const["glycol_cp_kJ_kgK"]
    q = mcp * (R["T_ret"].values - R["T_sup"].values)
    q_room = R["Q_room_side_kW"].values
    q_el = R["cop"].values * R["P_chiller_kW"].values
    w = cfg["trust"]["phi"]["window_steps"]
    m3 = lambda x: PC.trailing_mean(x, w)
    band = 3.0 * np.sqrt((mcp * sn["glycol_T_K"] * math.sqrt(2)) ** 2 / w + (sn["flow_rel"] * np.abs(m3(q))) ** 2 + (sn["P_rel"] * np.abs(m3(q_el))) ** 2 / w) + 0.01
    r_room, r_el = m3(q - q_room), m3(q - q_el)
    ok = (np.abs(r_room) <= band) & (np.abs(r_el) <= band)
    return {"Q_gly_kW": q, "Q_room_kW": q_room, "Q_el_kW": q_el, "band_kW": band, "ok": ok, "r_room_kW": r_room, "r_el_kW": r_el}


def year_study(cfg=None):
    cfg = cfg or load_config()
    crop = load_crops()[cfg["trust"]["crop"]]
    const = constants(cfg, crop)
    w = study_weather()
    _, T, _, _ = simulate(w, cfg=cfg, crop_key=cfg["trust"]["crop"], steps=True)
    S = T["steps"]
    R = add_noise(truth_nodes(S, cfg), cfg)
    gc = glycol_check(R, cfg, const)
    res = PC.residuals(as_input(R, const), cfg)
    sigma = tune_sigma(res, cfg)
    p = cfg["trust"]["phi"]
    phi, z = PC.phi_from(res, sigma, p["weights"], p["window_steps"])
    flags = PC.phi_flags(phi, p["red_at"], p["red_steps"])
    days = len(R) * DT / 86400.0
    # fake readings started at many times of the year (every 7 h 5 min, so all hours of the day are hit)
    starts = list(range(300, len(R) - 400, 85))
    hod = R.index.hour.values
    det = [(s, detection_steps(R, cfg, const, sigma, s)) for s in starts]
    day_d = [d for s, d in det if 7 <= hod[s] < 17]
    night_d = [d for s, d in det if not (7 <= hod[s] < 17)]
    detr = [(s, detection_steps(R, cfg, const, sigma, s, horizon=72, how=fake_ramp)) for s in starts]

    def summ(ds):
        ok = [d for d in ds if d is not None]
        mins = np.array(ok) * DT / 60.0
        return {"n": len(ds), "caught_pct": 100.0 * len(ok) / max(1, len(ds)),
                "caught_within_30min_pct": 100.0 * sum(1 for d in ok if d * DT <= 1800) / max(1, len(ds)),
                "median_min": float(np.median(mins)) if len(mins) else None,
                "p90_min": float(np.percentile(mins, 90)) if len(mins) else None}
    stats = {
        "_note": "Digital twin (S) with simulated sensor noise; frozen 2026 study weather. Nothing measured.",
        "sigma_tuned": sigma, "days": days, "phi_mean": float(phi.mean()), "phi_p99": float(np.percentile(phi, 99)),
        "time_green_pct": float(100 * (phi < p["green_below"]).mean()),
        "false_flags": len(flags), "false_flags_per_year": len(flags) * 365.0 / days,
        "false_flags_per_month": len(flags) * 30.4 / days,
        "false_flag_times": [str(R.index[a]) for a, _ in flags],
        "glycol_check": {"readings_inside_band_pct": float(100 * gc["ok"].mean()), "band_mean_kW": float(gc["band_kW"].mean()),
                         "mean_abs_error_room_kW": float(np.abs(gc["r_room_kW"]).mean()), "mean_abs_error_electric_kW": float(np.abs(gc["r_el_kW"]).mean()),
                         "note": "Normal year, simulated sensor noise: share of 5-minute readings where Q = m_dot cp (T_return - T_supply) agrees with the room side and with COP x electric power."},
        "fake_detection_day_07_17": summ(day_d), "fake_detection_night": summ(night_d),
        "fake_detection_all": summ([d for _, d in det]),
        "fake_detection_note": "Fake = air and core report 4.0 °C from one reading on (the demo). Horizon 3 h.",
        "slow_fake_day_07_17": summ([d for s, d in detr if 7 <= hod[s] < 17]),
        "slow_fake_night": summ([d for s, d in detr if not (7 <= hod[s] < 17)]),
        "slow_fake_note": "Harder case: the cheater slides the readings to 4.0 °C over 1 h (no jump). Horizon 6 h.",
    }
    return stats, sigma, cfg, const


def hottest_day(w):
    d = w.groupby(w.time_ist.dt.date).T_out.max().idxmax()
    return pd.Timestamp(d)


SCENARIOS = {
    "normal": {"label": "Normal", "fault": None},
    "door_seal": {"label": "Door seal failure (warm)", "fault": {"door_leak": 0.06}, "from_h": 24 + 11},
    "overcool": {"label": "Thermostat stuck: over-cooling (chilling risk)", "fault": {"setpoint_C": -5.0}, "from_h": 24 + 10},
    "power_cut": {"label": "Power cut on a hot night", "fault": {"no_grid": True}, "from_h": 24 + 18},
}


def scenario_streams(cfg, const, sigma):
    """72-h streams (00:00 the day before the hottest day of 2026 -> 3 days) for the website demos."""
    w = study_weather()
    d0 = hottest_day(w) - pd.Timedelta(days=1)
    i0 = int(np.where(w.time_ist == d0)[0][0])
    # warm-up: run the 3 days before so the room, ice and produce start from a real state
    warm = w.iloc[i0 - 72:i0].reset_index(drop=True)
    _, _, st, _ = simulate(warm, cfg=cfg, crop_key=cfg["trust"]["crop"])
    st["nodes"] = []                                              # the demo starts with an empty room; one fill at 13:00
    win = w.iloc[i0:i0 + 72].reset_index(drop=True)
    crop = load_crops()[cfg["trust"]["crop"]]
    out = {}
    for key, sc in SCENARIOS.items():
        fault = dict(sc["fault"], from_step=int(sc["from_h"] * 12)) if sc["fault"] else None
        _, T, _, _ = simulate(win, cfg=cfg, crop_key=cfg["trust"]["crop"], init=st, steps=True, hold_days=3,
                              scenario=dict(fault or {}, load_once=True))
        S = T["steps"]
        R = add_noise(truth_nodes(S, cfg, door_leak=(fault or {}).get("door_leak", 0.0)), cfg, seed=101)
        phi, z, res = phi_of(R, cfg, const, sigma)
        p = cfg["trust"]["phi"]
        # freshness on the TRUE produce (core) temperature, air RH and speed
        F = FL.FlowerFreshness(crop)
        Fv = []
        hu = cfg["humidity"]
        v_prod = np.where(R["running"] > 0.5, hu["flower_air_speed_fan_on_m_s"], hu["flower_air_speed_fan_off_m_s"])
        for i in range(len(S)):
            if S["kg_inside"].iloc[i] > 0:
                F.step(S["T_room"].iloc[i], S["RH_room"].iloc[i], v_prod[i], DT / 3600.0, T_core=S["T_batch"].iloc[i], liner=hu["liner_transpiration_factor"])
            Fv.append(F.value)
        gc = glycol_check(R, cfg, const)
        r = lambda a, k=3: [round(float(x), k) for x in a]
        out[key] = {
            "label": sc["label"], "from_step": fault["from_step"] if fault else None,
            "checkin_step": int(cfg["live_run"]["load_hour"] * 12),
            "t0": str(S.index[0]), "dt_s": DT,
            "N1": {"T_s": r(R.T_s, 2), "RH_s": r(R.RH_s, 1), "v_s": r(R.v_s, 2)},
            "N2": {"T_core": r(R.T_core, 2)},
            "N3": {"open": r(R.door_open, 0), "angle_deg": r(R.door_angle_deg, 0), "Q_door_kW": r(R.Q_door_kW, 4)},
            "N4": {"T_r": r(R.T_r, 2), "RH_r": r(R.RH_r, 1)},
            "out": {"T_out": r(R.T_out, 2), "RH_out": r(R.RH_out, 1), "p_hPa": r(R.p_hPa, 1)},
            "ctl": {"P_el_kW": r(R.P_el_kW, 4), "P_fan_kW": r(R.P_fan_kW, 3), "cop": r(R.cop, 3),
                    "Q_wax_branch_kW": r(R.Q_wax_branch_kW, 4), "Q_int_kW": r(R.Q_int_kW, 4),
                    "G_wax_kW_K": r(R.G_wax_kW_K, 5), "T_pcm": r(R.T_pcm, 2), "load_event": r(R.load_event, 0),
                    "grid_on": r(R.grid_on, 0), "pcm_pct": r(R.pcm_pct, 1)},
            "glycol": {"T_sup": r(R.T_sup, 2), "T_ret": r(R.T_ret, 2), "Q_gly_kW": r(gc["Q_gly_kW"], 3), "Q_room_kW": r(gc["Q_room_kW"], 3),
                       "Q_el_kW": r(gc["Q_el_kW"], 3), "band_kW": r(gc["band_kW"], 3), "ok": [int(x) for x in gc["ok"]],
                       "v_room": r(R.v_room, 0), "v_ice": r(R.v_ice, 0)},
            "phi": r(phi, 2), "flags": PC.phi_flags(phi, p["red_at"], p["red_steps"]),
            "freshness": r(Fv, 2), "T_room_true": r(S.T_room, 2), "T_core_true": r(S.T_batch, 2),
        }
    return out


def export(stats, sigma, cfg, const, streams):
    crop_key = cfg["trust"]["crop"]
    crop = load_crops()[crop_key]
    tc = dict(cfg["trust"])
    tc.update(produce_air_speed_fan_on_m_s=cfg["humidity"]["flower_air_speed_fan_on_m_s"], produce_air_speed_fan_off_m_s=cfg["humidity"]["flower_air_speed_fan_off_m_s"])
    allc = load_crops()
    data = {"generated_note": "S = digital twin (twin/flower_sim.py) + simulated sensor noise. Not measured.",
            "chamber_id": cfg["project"]["chamber_id"], "band_C": cfg["live_run"]["band_C"],
            "crops": {k: allc[k] for k in cfg["flowers"]["allowed"]}, "blocked": allc["blocked_flowers"], "flower_rules": allc["flower_rules"],
            "glycol_const": {"m_dot_kg_s": const["glycol_m_dot_kg_s"], "cp_kJ_kgK": const["glycol_cp_kJ_kgK"]},
            "sigma": sigma, "const": const, "stats": stats, "trust_cfg": tc,
            "crop_key": crop_key, "crop": crop, "life_table": SL.life_table(crop),
            "rh_room_pct": cfg["setpoint"]["rh_room_pct"], "scenarios": streams}
    data = json.loads(json.dumps(data, default=float).replace("NaN", "null"))
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text("// generated by python -m twin.trust_nodes  (do not edit)\nwindow.TRUST_DATA = "
                      + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    OUT_STATS.parent.mkdir(parents=True, exist_ok=True)
    OUT_STATS.write_text(json.dumps({"sigma": sigma, **stats}, indent=1, ensure_ascii=False), encoding="utf-8")


def main():
    stats, sigma, cfg, const = year_study()
    streams = scenario_streams(cfg, const, sigma)
    export(stats, sigma, cfg, const, streams)
    print(json.dumps({k: v for k, v in stats.items() if k != "false_flag_times"}, indent=1))


if __name__ == "__main__":
    main()
