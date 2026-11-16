"""Glycol loop between the OUTDOOR R290 chiller and the room (0 g of R290 inside the room).

    outdoor R290 chiller  ->  plate heat exchanger  ->  glycol pump  ->  V-ROOM (air cooler)  /  V-ICE (ice panels)

Physics used by the twin (values in config/design.json -> glycol, the E ones are assumptions):
    T_evap   = glycol supply - plate-exchanger approach                (supply 0 C for the room, -2 C for the ice)
    COP      = R290 cycle from CoolProp at T_evap and T_cond = outside air + 10 K (engine/r290.py, same as the old twin)
    m_dot    = design capacity / (cp * design dT)                      fixed-speed pump, runs only with the chiller
    Q_glycol = m_dot * cp * (T_return - T_supply)                      what the two glycol sensors + the flow meter see
    Q_glycol = cold to the room air cooler + cold into the ice + pipe heat gain + pump heat
    P_el     = Q_glycol / COP  (+ pump + cooler fan)
Air cooler:  Q_sensible = G * (T_room - T_glycol_mean),  T_glycol_mean = T_supply + Q / (2 m_dot cp)
"""
import numpy as np

from . import r290


def m_dot(cfg):
    """Glycol mass flow [kg/s] of the fixed-speed pump."""
    g = cfg["glycol"]
    return cfg["live_run"]["compressor_max_kW"] / (g["cp_kJ_kgK"] * g["design_dT_K"])


def evap_T(cfg, mode, approach=None):
    g = cfg["glycol"]
    sup = g["supply_ice_C"] if mode == "ice" else g["supply_room_C"]
    return sup - (g["hx_approach_K"] if approach is None else approach)


def cop_tables(cfg, approach=None):
    """COP (electrical, per kW of cold at the chiller) against outside temperature for the two supply modes."""
    r = cfg["refrigeration"]
    T = np.arange(-5.0, 55.01, 0.25)
    out = {}
    for mode in ("room", "ice"):
        Te = evap_T(cfg, mode, approach)
        rows = [r290.cycle(Te, t + r["cond_approach_K"], 1.0, r["eta_isentropic"], r["eta_motor_drive"],
                           r["superheat_K"], r["subcool_K"], r["coolprop_name"]) for t in T]
        out[mode] = {"T_evap_C": Te, "COP_elec": np.array([x["COP_elec"] for x in rows]),
                     "P_evap_bar": rows[0]["P_evap_bar"], "P_cond_bar": np.array([x["P_cond_bar"] for x in rows])}
    return T, out


def coil_sensible_kW(G_kW_K, T_room, T_supply, mdot_cp_kW_K):
    """Sensible cooling of the air cooler while its valve is open (glycol warms along the coil)."""
    return max(0.0, G_kW_K * (T_room - T_supply) / (1.0 + G_kW_K / (2.0 * mdot_cp_kW_K)))


def q_from_sensors(mdot_kg_s, cp_kJ_kgK, T_supply, T_return):
    """Q = m_dot * cp * (T_return - T_supply)  [kW] - the glycol energy-balance check."""
    return mdot_kg_s * cp_kJ_kgK * (T_return - T_supply)


def r290_room_limit_g(volume_m3, lfl_kg_m3=0.038, factor=0.20):
    """Largest R290 charge allowed INSIDE an occupied space of this volume by the '20 % of LFL' rule
    (EN 378 / ISO 5149 logic, IS 16678): m = 0.20 x LFL x V.  LFL of propane = 0.038 kg/m3."""
    return 1000.0 * factor * lfl_kg_m3 * volume_m3
