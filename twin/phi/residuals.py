"""Physics residuals R1..R10 and hard rules H1..H3 from the REPORTED readings (5-min steps).

A residual is "what the physics says should have happened" minus "what the sensors say happened". With honest
sensors they are small and random (model error + sensor noise); a lie breaks one or more of them.
Step k compares the change from reading k-1 to reading k with the heat flows during step k (inputs at k, states at k-1),
the same way the twin integrates. Units: R1, R3 in W; R4, R8 in %; R2 in W/kg; R5, R7T, R9 in K; R6 in mg/s; R7W in g/kg.

R1  room air energy          C_a ΔT_r/Δt − [UA(T_o^API − T_r) + Q_door + Q_inside + hA_f(T_f,bulk − T_r) − G_ice(T_r − T_ice) − Q_coil − Q_fog]
R2  flower energy (per kg)   c ΔT_f/Δt − [(c/τ)(T_r − T_f) + q_resp(T_f) − transpiration·h_fg]
R3  glycol (V-ICE closed)    ṁc(T_ret − T_sup) − [Q_coil,sens + Q_coil,lat + pipe gain + pump heat]
R4  chiller map              [P_chiller·COP(T_o^API, T_sup) − ṁc(T_ret − T_sup)] / ṁc(T_ret − T_sup)   (%)
R5  ice state                T_ice,meas − T_ice(enthalpy observer driven by glycol charging and room heat)
R6  moisture (kg/s)          m_a Δw_r/Δt − [door exchange + transpiration + fogger − coil condensation − ice condensation]
R7T outside temperature      T_o,sensor − T_o^API ;  R7W outside humidity ratio w_o,sensor − w_o^API
R8  electricity (solar mode) [P_inverter − (P_el + fan + fogger + night fan)] / P_inverter   (%)
R9  room probes              T_high − T_mid − stratification model
R10 daily closure            Σ24h R1·Δt (kWh)  ;  R8d daily grid energy: DISCOM meter − (owner energy − inverter energy)
    (T_f,bulk = the checker's own mass-weighted flower temperature: new crates enter at the weather-service outside T, then relax with τ_f)
H1  measured COP > 0.6 × Carnot(T_o^API + 10 K, T_sup − 3 K)
H2  room RH > 100 %, or (cooling and T_sup ≥ T_room)
H3  ice partly frozen (observer) but |T_ice| > 0.5 K for 3 readings
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from twin.phi import model as M

NAMES = ["R1", "R2", "R3", "R4", "R5", "R6", "R7T", "R7W", "R8", "R9"]
UNITS = {"R1": "W", "R2": "W/kg", "R3": "W", "R4": "%", "R5": "K", "R6": "mg/s", "R7T": "K", "R7W": "g/kg", "R8": "%", "R9": "K"}
LABELS = {"R1": "Room air energy", "R2": "Flower energy", "R3": "Glycol loop vs air cooler", "R4": "Chiller map (COP with weather-service T)",
          "R5": "Ice state", "R6": "Moisture balance", "R7T": "Outside T vs weather service", "R7W": "Outside humidity vs weather service",
          "R8": "Power vs PV inverter log", "R9": "Room probes (stratification)", "R10": "Daily energy closure", "R8d": "Daily grid kWh vs utility meter",
          "H1": "Second law (COP vs Carnot)", "H2": "Dew point / supply colder than room", "H3": "Ice must sit at 0 °C while melting"}
LAYER = {"R1": "physics", "R2": "physics", "R3": "physics", "R4": "physics", "R5": "physics", "R6": "physics", "R9": "physics", "R10": "physics",
         "H1": "physics", "H2": "physics", "H3": "physics", "R7T": "external", "R7W": "external", "R8": "external", "R8d": "external"}


def _prev(x: np.ndarray) -> np.ndarray:
    return np.r_[x[0], x[:-1]]


def _hold_mask(event: np.ndarray, steps: int) -> np.ndarray:
    """True during the step of an event and the next `steps`-1 steps."""
    m = np.zeros(len(event), bool)
    for j in np.where(event)[0]:
        m[j:j + steps] = True
    return m


def compute(R: pd.DataFrame | dict, N: dict, P: dict, door_g: np.ndarray, h0: float | None = None) -> dict[str, Any]:
    """Residuals from a readings frame. door_g = kg/s through the fully open door (from the weather service)."""
    g = (lambda k: np.asarray(R[k], dtype=float))
    n = len(g("T_mid"))
    dt = N["dt_s"]
    T, Tp = g("T_mid"), _prev(g("T_mid"))
    Tf, Tfp = g("T_flower"), _prev(g("T_flower"))
    Ti, Tip = g("T_ice"), _prev(g("T_ice"))
    p = g("ps_api")
    W = M.w_of(T, g("RH_mid"), p)
    Wp = _prev(W)
    To = g("T_out_api")
    Wo = M.w_of(To, g("RH_out_api"), p)
    Tsup, Tret, flow = g("T_sup"), g("T_ret"), g("flow")
    duty, run, vice = g("duty_room"), g("run_frac"), g("v_ice") > 0.5
    fog, nfan, defr, kg = g("fog_duty"), g("nfan") > 0.5, g("defrost") > 0.5, g("kg")
    Dt = np.clip(g("door") / dt, 0, 1)
    running = run > 1e-6
    # ---- flows (kW)
    gd = door_g * Dt
    Q_door = gd * (M.CPA + 1.86 * Wo) * (To - Tp)
    Q_wall = N["UA_kW_K"] * (To - Tp)
    Q_int = N["light_kW"] * Dt + N["ctrl_kW"] + N["fan_kW"] * run * (duty > 0) + N["fog_kW"] * fog + N["nfan_kW"] * nfan + N["fan_kW"] * defr
    hA = kg * N["flower_cp"] / N["tau_f_s"]
    # mass-weighted flower temperature: the checker's own observer (new crates arrive at the weather-service outside T, E)
    Tb = np.full(n, np.nan)
    tb, kp = float(np.nan_to_num(T[0], nan=4.0)), 0.0
    for k in range(n):
        kk = kg[k] if np.isfinite(kg[k]) else kp
        tr = Tp[k] if np.isfinite(Tp[k]) else tb
        if k:
            tb = tb + dt / N["tau_f_s"] * (tr - tb)
        if kk > kp + 1e-9:
            tb = (tb * kp + (kk - kp) * (To[k] if np.isfinite(To[k]) else tr)) / kk
        kp = kk
        Tb[k] = tb
    Tbp = _prev(Tb)
    Q_fl = hA * (Tbp - Tp)
    dTw = Tp - Tip
    G_w = np.interp(np.maximum(dTw, 0.0), N["G_ice_dT"], N["G_ice_kW_K"]) * np.where(nfan, 2.0, 1.0)
    Q_ice = np.where(dTw > 0, G_w * dTw, N["G_ice_kW_K"][1] * dTw)
    mcp = N["mdot_kg_s"] * N["cp_g_kJ_kgK"]
    Gc = N["G_coil_kW_K"]
    q_s1 = np.maximum(0.0, Gc * (Tp - Tsup) / (1.0 + Gc / (2.0 * mcp)))
    Q_coil_s = np.where(running & (duty > 0), duty * q_s1, 0.0)
    T_surf = Tp - N["f_air"] * (Tp - (Tsup + q_s1 / (2 * mcp)))
    G_cm = Gc / N["f_air"] / M.CPA
    cond_coil = np.where(running & (duty > 0), duty * G_cm * np.maximum(0.0, W - M.w_of(T_surf, 100.0, p)), 0.0)
    Q_coil_l = cond_coil * M.HV
    Q_fog = fog * N["fog_kg_s"] * M.HV
    r1 = 1000.0 * (N["C_a_kJ_K"] * (T - Tp) / dt - (Q_wall + Q_door + Q_int + Q_fl - Q_ice - Q_coil_s - Q_fog))
    # ---- flowers, per kg
    v = np.where(running & (duty > 0), N["v_on"], N["v_off"])
    gt_kg = N["Kt"] * 3.6e-5 / 100.0 / 3600.0 * np.sqrt(v) * N["liner"] * p / 0.621945
    transp_kg = gt_kg * np.maximum(0.0, M.w_of(Tfp, 100.0, p) - W)
    c = N["flower_cp"]
    r2 = c * 1000.0 * (Tf - Tfp) / dt - (c * 1000.0 / N["tau_f_s"] * (Tp - Tfp) + M.resp_W_kg(N, Tfp) - transp_kg * M.HV * 1000.0)
    # ---- glycol and chiller
    Q_g = flow * N["cp_g_kJ_kgK"] * (Tret - Tsup)
    loss = np.where(running, N["pipe_UA_kW_K"] * np.maximum(0.0, To - (Tsup + 1.5)) + N["pump_kW"], 0.0)
    r3 = 1000.0 * (Q_g - (Q_coil_s + Q_coil_l + loss))
    P_ch = g("P_el") - N["pump_kW"] * run
    cop = M.cop_lookup(N, To, Tsup)
    r4 = 100.0 * (P_ch * cop - Q_g) / np.maximum(Q_g, 0.3)            # % of the glycol cooling (scales with load)
    with np.errstate(divide="ignore", invalid="ignore"):
        cop_meas = np.where(P_ch > 0.05, Q_g / P_ch, np.nan)
    Te, Tc = Tsup - N["approach_K"] + 273.15, To + N["cond_approach_K"] + 273.15
    carnot = Te / np.maximum(Tc - Te, 1.0)
    # implied outside temperature from the measured COP (diagnostic)
    grid_To = np.asarray(N["cop_To"])
    implied = np.full(n, np.nan)
    for k in np.where(np.isfinite(cop_meas) & running)[0]:
        col = M.cop_lookup(N, grid_To, np.full(len(grid_To), Tsup[k]))
        if cop_meas[k] <= col[0] and cop_meas[k] >= col[-1]:
            implied[k] = float(np.interp(-cop_meas[k], -col, grid_To))
    # ---- ice observer (R5) and H3
    L, cps, cpl, m_i = N["L_ice"], N["cps_ice"], N["cpl_ice"], N["m_ice_kg"]
    Q_charge = np.where(vice & running, np.maximum(0.0, Q_g - Q_coil_s - Q_coil_l - loss), 0.0)
    cond_ice = G_w / M.CPA * np.maximum(0.0, W - M.w_of(Tip, 100.0, p))
    T_of = lambda h: h / cps if h < 0 else ((h - L) / cpl if h > L else 0.0)
    h_of = lambda t: cps * t if t < 0 else L + cpl * t
    gain, band = P["ice_observer"]["gain"], P["ice_observer"]["plateau_K"]
    h = 0.0 if h0 is None else h0
    r5 = np.zeros(n)
    u5 = np.zeros(n)
    f_pred = np.zeros(n)
    for k in range(n):
        dq = Q_ice[k] + cond_ice[k] * M.HV - Q_charge[k]
        if np.isfinite(dq):
            h = h + dq * dt / m_i
        h = min(max(h, cps * -10.0), L + cpl * 15.0)
        tpred = T_of(h)
        f_pred[k] = 1.0 - min(1.0, max(0.0, h / L))
        # R5 is a rate check: only when the last and this reading are both off the melting plateau (observer just restarted)
        ok5 = np.isfinite(Ti[k]) and np.isfinite(Tip[k]) and abs(Ti[k]) > band and abs(Tip[k]) > band and k > 0
        r5[k] = Ti[k] - tpred if ok5 else np.nan
        u5[k] = abs(dq) * dt / m_i / (cps if tpred < 0 else cpl) if (ok5 and np.isfinite(dq)) else 0.0
        if np.isfinite(Ti[k]) and abs(Ti[k]) > band:
            h = h + gain * (h_of(Ti[k]) - h)
    # ---- moisture (mg/s)
    m_a = N["m_air_kg"]
    transp = kg * transp_kg
    cond_ice_now = G_w / M.CPA * np.maximum(0.0, W - M.w_of(Tip, 100.0, p))
    r6 = 1e6 * (m_a * (W - Wp) / dt - (gd * (Wo - W) + transp + fog * N["fog_kg_s"] - cond_coil - cond_ice_now))
    # ---- outside (external), electricity (external)
    r7t = g("T_out_s") - To
    r7w = 1000.0 * (M.w_of(g("T_out_s"), g("RH_out_s"), p) - Wo)
    aux = N["fan_kW"] * run * (duty > 0) + N["fog_kW"] * fog + N["nfan_kW"] * nfan + N["fan_kW"] * defr
    r8 = 100.0 * (g("P_inv") - (g("P_el") + aux)) / np.maximum(g("P_inv"), 0.3)     # % (both meters have relative errors)
    st = N["strat"]
    r9 = g("T_high") - T - (np.where(duty > 0, st["fan_on_K"], st["fan_off_K"]) + st["per_K_outside"] * (To - T))
    r = np.vstack([r1, r2, r3, r4, r5, r6, r7t, r7w, r8, r9]).T
    # ---- model uncertainty (E, config 'model_uncertainty'): the allowed spread grows with the uncertain flows
    U = P["model_uncertainty"]
    nz = lambda x: np.nan_to_num(np.abs(np.asarray(x, dtype=float)))
    u = np.zeros_like(r)
    u[:, 0] = 1000.0 * np.sqrt((U["wall"] * nz(Q_wall)) ** 2 + (U["door"] * nz(Q_door)) ** 2 + (U["flowers"] * nz(Q_fl)) ** 2
                               + (U["ice"] * nz(Q_ice)) ** 2 + (U["coil"] * nz(Q_coil_s)) ** 2)
    u[:, 1] = np.sqrt((U["flowers"] * nz(c * 1000.0 / N["tau_f_s"] * (Tp - Tfp))) ** 2 + (U["respiration"] * nz(M.resp_W_kg(N, Tfp))) ** 2
                      + (U["transpiration"] * nz(transp_kg * M.HV * 1000.0)) ** 2)
    u[:, 2] = 1000.0 * np.sqrt((U["coil"] * nz(Q_coil_s + Q_coil_l)) ** 2 + (U["pipe"] * nz(loss)) ** 2)
    u[:, 4] = U["ice"] * u5
    u[:, 5] = 1e6 * np.sqrt((U["door"] * nz(gd * (Wo - W))) ** 2 + (U["transpiration"] * nz(transp)) ** 2 + (U["coil"] * nz(cond_coil)) ** 2
                            + (U["ice"] * nz(cond_ice_now)) ** 2 + (U["fogger"] * nz(fog * N["fog_kg_s"])) ** 2)
    # ---- which residuals count at each step
    mk = P["masking"]
    door_ev = g("door") > 0
    load_ev = g("load_event") > 0.5
    masked = _hold_mask(door_ev, int(mk["after_door_min"] * 60 / dt) + 1) | _hold_mask(load_ev, int(mk["after_load_min"] * 60 / dt) + 1)
    chg = (np.abs(duty - _prev(duty)) > 0.05) | (np.abs(fog - _prev(fog)) > 0.05) | (vice != _prev(vice)) | (nfan != _prev(nfan)) \
        | (defr != _prev(defr)) | (running != _prev(running))
    ctl = _hold_mask(chg, int(mk["after_control_steps"]) + 1)          # probes lag the commanded heat flows
    act = np.isfinite(r)
    act[:, 4] &= ~ctl & ~defr
    act[:, 0] &= ~masked & ~ctl
    act[:, 1] &= ~masked & (kg > 0) & (_prev(kg) > 0)
    start = running & ~_prev(running)
    act[:, 2] &= running & ~vice & ~defr & (flow > 0.2 * N["mdot_kg_s"] * np.maximum(run, 1e-9)) & ~_hold_mask(start, 24)   # the warm glycol loop is re-cooled for up to 2 h after a stop
    act[:, 3] &= running & (P_ch > 0.05) & (flow > 0)
    act[:, 5] &= ~masked & ~ctl
    act[:, 8] &= (g("ATS") < 0.5) & running
    act[0, :] = False
    # ---- hard rules
    hr = P["hard_rules"]
    h1 = running & (P_ch > hr["min_chiller_kW"]) & (cop_meas > hr["carnot_frac"] * carnot)
    h2 = (g("RH_mid") > 100.5) | (running & (duty > 0) & (Tsup >= T))
    lo, hi = hr["ice_f_range"]
    off = (f_pred > lo) & (f_pred < hi) & (np.abs(Ti) > hr["ice_band_K"])
    run_len = np.zeros(n)
    for k in range(n):
        run_len[k] = run_len[k - 1] + 1 if (off[k] and k) else (1.0 if off[k] else 0.0)
    h3 = run_len >= hr["ice_steps"]
    hard = np.vstack([np.nan_to_num(h1).astype(bool), np.nan_to_num(h2).astype(bool), h3]).T
    # ---- daily: closure and utility meter
    spd = int(86400 / dt)
    nd = n // spd
    r1_all = np.where(np.isfinite(r1), r1, 0.0)
    R10 = np.array([r1_all[d * spd:(d + 1) * spd].sum() * dt / 3.6e6 for d in range(nd)])
    own = np.nan_to_num(g("P_el")) + aux
    disc = g("discom_kWh")
    R8d = np.array([disc[(d + 1) * spd - 1] - (own[d * spd:(d + 1) * spd].sum() - np.nan_to_num(g("P_inv")[d * spd:(d + 1) * spd]).sum()) * dt / 3600.0
                    for d in range(nd)])
    return {"r": r, "u": u, "active": act, "hard": hard, "R10": R10, "R8d": R8d, "f_ice": f_pred, "implied_T_out": implied, "cop_meas": cop_meas,
            "masked": masked, "running": running, "h_end": h}
