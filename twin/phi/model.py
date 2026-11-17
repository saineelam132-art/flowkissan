"""The NOMINAL model the trust checker believes, plus small lookup tables.

Everything the website (JavaScript) needs to recompute the residuals is turned into plain numbers and
tables here, so Python and JavaScript use exactly the same model:
  * COP(T_out, T_supply) table from CoolProp R290 (evaporating = T_sup - 3 K, condensing = T_out + 10 K)
  * ice-panel natural-convection conductance G(ΔT) table (finned panels)
  * flower respiration table (W/kg at 0/5/10/20 °C)
  * door: kg/s of outside air through a fully open door, per 5-minute step, from the WEATHER SERVICE values
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

from engine import fins as FINS
from engine import glycol as GLY
from engine import loads
from engine import r290
from engine.config import load_config, load_crops

ROOT = Path(__file__).resolve().parents[2]
PHI_CFG = ROOT / "config" / "phi.json"
HV = 2501.0          # kJ/kg, latent heat (same as the twin)
CPA = 1.006          # kJ/kg.K, dry air


def load_phi_cfg() -> dict[str, Any]:
    return json.loads(PHI_CFG.read_text(encoding="utf-8"))


def e_s(T: Any) -> Any:
    """Saturation vapour pressure [hPa], Magnus (same formula in trust_core.js)."""
    return 6.112 * np.exp(17.62 * np.asarray(T, dtype=float) / (243.12 + np.asarray(T, dtype=float)))


def w_of(T: Any, RH: Any, p_hPa: Any) -> Any:
    """Humidity ratio [kg/kg] from T [°C], RH [%], pressure [hPa]."""
    e = np.asarray(RH, dtype=float) / 100.0 * e_s(T)
    return 0.621945 * e / (np.asarray(p_hPa, dtype=float) - e)


def nominal(cfg: dict | None = None, P: dict | None = None) -> dict[str, Any]:
    """Scalars and tables of the nominal model (all values traceable to config/design.json and config/phi.json)."""
    cfg = cfg or load_config()
    P = P or load_phi_cfg()
    rc, gl, lr, pc = cfg["reality"], cfg["glycol"], cfg["live_run"], cfg["pcm"]
    bp = rc["best"]
    rk = rc["racks"][bp["rack_material"]]
    W, L, H = lr["inside_m"]
    wall_factor = rc["wall_outside_area_m2"] / 25.6 * (1 + rc["wall_bridge_frac"])
    UA = cfg["chamber"]["insulation_k_W_mK"] / lr["insulation_thickness_m"] * cfg["chamber"]["envelope_area_m2"] / 1000.0 * wall_factor
    C_a = 1.25 * W * L * H * CPA + cfg["simulation"]["structure_heat_capacity_kJ_K"] + rk["kg_total"] * rk["cp_kJ_kgK"]
    mdot = GLY.m_dot(cfg)
    G_coil = gl["air_cooler_G_kW_K"] * rc["glycol"]["air_cooler_G_frac"]
    f_air = gl["air_cooler_air_side_frac"]
    # ice panels (realistic engineer's estimate: fins 25 % weaker, 90 % of latent heat usable)
    m_ice = float(pc["mass_kg"])
    A = pc["slab_area_m2"]
    k_ice = pc["k_pure_W_mK"] * rc["ice"]["k_multiplier"]
    half = m_ice / (pc["density_kg_m3"] * A) / 2 / k_ice
    hx = lr["ice_hx"]
    dTs, G_tab = FINS.conductance_tables(A, hx["L"], hx["S"], hx["b"], hx["t"], half, None)[2:4]
    G_tab = rc["ice"]["fin_UA_frac"] * np.asarray(G_tab) / 1000.0
    # COP table
    rf = cfg["refrigeration"]
    To = np.arange(0.0, 50.01, 1.0)
    Ts = np.arange(-9.0, 6.01, 0.5)
    cop = np.array([[r290.cycle(ts - gl["hx_approach_K"], to + rf["cond_approach_K"], 1.0, rf["eta_isentropic"], rf["eta_motor_drive"], 0.0, 0.0,
                                rf["coolprop_name"])["COP_elec"] for ts in Ts] for to in To]) * P["nominal"]["part_load_cop_factor"]
    crop = load_crops()[cfg["flowers"]["design_flower"]]
    resp = sorted((float(k), float(v) / 1000.0) for k, v in crop["respiration_mW_kg"].items())
    hu = cfg["humidity"]
    tau_f = P["nominal"]["flower_pulldown_hours"] * 3600.0 / math.log(8.0)
    return {
        "dt_s": float(P["dt_s"]), "UA_kW_K": UA, "C_a_kJ_K": C_a, "m_air_kg": 1.25 * W * L * H,
        "mdot_kg_s": mdot, "cp_g_kJ_kgK": gl["cp_kJ_kgK"], "G_coil_kW_K": G_coil, "f_air": f_air,
        "pipe_UA_kW_K": gl["pipe_UA_W_K"] / 1000.0 * rc["glycol"]["pipe_UA_factor"], "pump_kW": gl["pump_W"] * rc["glycol"]["pump_W_factor"] / 1000.0,
        "fan_kW": rc["fans_lights"]["evap_fan_W"] / 1000.0, "ctrl_kW": rc["fans_lights"]["controller_W"] / 1000.0,
        "light_kW": cfg["internal_loads"]["lights_W"] / 1000.0, "nfan_kW": bp["night_fan"]["W"] / 1000.0,
        "fog_kg_s": hu["fogger_L_h"] / 3600.0, "fog_kW": hu["fogger_W"] / 1000.0,
        "flower_cp": P["nominal"]["flower_cp_kJ_kgK"], "tau_f_s": tau_f,
        "Kt": crop["freshness"]["K_t_mg_kg_s_MPa"], "liner": hu["liner_transpiration_factor"],
        "v_on": hu["flower_air_speed_fan_on_m_s"], "v_off": hu["flower_air_speed_fan_off_m_s"],
        "m_ice_kg": m_ice, "L_ice": pc["latent_kJ_kg"] * rc["ice"]["latent_frac"], "cps_ice": pc["cp_solid_kJ_kgK"], "cpl_ice": pc["cp_liquid_kJ_kgK"],
        "G_ice_dT": [float(x) for x in dTs], "G_ice_kW_K": [float(x) for x in G_tab],
        "cop_To": [float(x) for x in To], "cop_Ts": [float(x) for x in Ts], "cop": cop.round(5).tolist(),
        "resp_T": [x[0] for x in resp], "resp_W_kg": [x[1] for x in resp],
        "strat": P["nominal"]["stratification"], "approach_K": gl["hx_approach_K"], "cond_approach_K": rf["cond_approach_K"],
        "setpoint_C": lr["setpoint_C"],
    }


def interp(x: Any, xs: list[float], ys: list[float]) -> Any:
    return np.interp(x, xs, ys)


def cop_lookup(N: dict, To: Any, Ts: Any) -> Any:
    """Bilinear COP(T_out, T_supply); clipped to the table (same in JS)."""
    To0, Ts0 = np.asarray(To, dtype=float), np.asarray(Ts, dtype=float)
    bad = ~(np.isfinite(To0) & np.isfinite(Ts0))
    To = np.clip(np.where(bad, N["cop_To"][0], To0), N["cop_To"][0], N["cop_To"][-1])
    Ts = np.clip(np.where(bad, N["cop_Ts"][0], Ts0), N["cop_Ts"][0], N["cop_Ts"][-1])
    a = np.asarray(N["cop"])
    xo = (To - N["cop_To"][0]) / (N["cop_To"][1] - N["cop_To"][0])
    xs = (Ts - N["cop_Ts"][0]) / (N["cop_Ts"][1] - N["cop_Ts"][0])
    i0 = np.minimum(np.floor(xo).astype(int), a.shape[0] - 2)
    j0 = np.minimum(np.floor(xs).astype(int), a.shape[1] - 2)
    fo, fs = xo - i0, xs - j0
    v = (a[i0, j0] * (1 - fo) * (1 - fs) + a[i0 + 1, j0] * fo * (1 - fs) + a[i0, j0 + 1] * (1 - fo) * fs + a[i0 + 1, j0 + 1] * fo * fs)
    return np.where(bad, np.nan, v)


def resp_W_kg(N: dict, T: Any) -> Any:
    """Respiration heat, log-linear between table points, held at the 20 °C value above 20 °C."""
    T = np.clip(np.asarray(T, dtype=float), N["resp_T"][0], N["resp_T"][-1])
    return np.exp(np.interp(T, N["resp_T"], np.log(N["resp_W_kg"])))


def door_g_full(cfg: dict, T_o: np.ndarray, RH_o: np.ndarray, p_Pa: np.ndarray, T_r_nom: float = 4.0, RH_r_nom: float = 92.5,
                curtain_E: float | None = None) -> np.ndarray:
    """kg/s of outside air through the FULLY open door, from weather-service values and the nominal room state.
    Using the nominal room (not the reported one) keeps this term independent of the sensors under test."""
    c = cfg
    if curtain_E is not None:
        import copy
        c = copy.deepcopy(cfg)
        c["door"]["curtain_effectiveness_E"] = curtain_E
    out = np.zeros(len(T_o))
    cache: dict[tuple, float] = {}
    for i, (t, rh, p) in enumerate(zip(T_o, RH_o, p_Pa)):
        key = (round(float(t), 1), round(float(rh)), round(float(p), -2))
        if key not in cache:
            inf = loads.infiltration_load(c, key[0], key[1], T_r_nom, RH_r_nom, D_t=1.0, curtain=True, p=key[2])
            dh = inf["h_out_kJ_kg"] - inf["h_in_kJ_kg"]
            cache[key] = inf["Q_kW"] / dh if dh > 1e-9 else 0.0
        out[i] = cache[key]
    return out
