"""Two-stage freshness (Trust & Trade v2). Same equations in web/trust/freshness_v2.js (golden-tested).

Stage A – the trip, picking → our door (estimate, E):
    life used += k(T_flower) · Δt / SL_ref_h,   k(T) = max(Q10^((T − T_opt)/10), 1 + a_c·(T_chill − T)² below the chilling limit)
    i.e. Δt / SL(T) with SL(T) = SL_ref_h · Q10^((T_opt − T)/10)     (SL_ref_h, Q10, T_opt from data/crops.json)
    T_flower = outside air (hourly weather) + bag heating of the packing (E)
    water points += 100 · WL_rate(T_air, RH, v) · Δt · water_factor / WL_max      (WL_rate as in the twin, %/h)
    F = 100 · (1 − life used) − water points
  Stages: picking (the average flower waits half the picking window), waiting at the farm, transport (distance ÷ speed, or a
  given travel time), waiting at the market until the check-in at our door.
Stage B – inside the room (from the sensors, S): the same equation every 5 minutes with T_core (or room air), room RH,
  and the liner water factor. F never goes up.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "config" / "trust_v2.json"
DT_H = 5.0 / 60.0


def load_cfg() -> dict[str, Any]:
    return json.loads(CFG.read_text(encoding="utf-8"))


def rate_k(crop: dict, T: float) -> float:
    f = crop["freshness"]
    kT = crop["Q10"] ** ((min(T, 60.0) - f["T_opt_C"]) / 10.0)
    ci = crop.get("chill_injury_below_C")
    kC = 1.0 + f["chill_a_c_per_K2"] * (ci - T) ** 2 if (ci is not None and T < ci) else 1.0
    return max(kT, kC)


def shelf_life_h(crop: dict, T: float) -> float:
    """SL(T) in hours: how long the flower would last at a constant T (from 100 %)."""
    return crop["freshness"]["SL_ref_h"] / rate_k(crop, T)


def wl_rate_pct_h(crop: dict, T: float, RH: float, v: float) -> float:
    vpd = 6.112 * math.exp(17.62 * T / (243.12 + T)) * (1 - min(100.0, max(0.0, RH)) / 100.0)
    return crop["freshness"]["K_t_mg_kg_s_MPa"] * 3.6e-5 * vpd * math.sqrt(max(v, 0.0))


class State:
    def __init__(self, life_used: float = 0.0, water_pts: float = 0.0):
        self.life_used, self.water_pts = life_used, water_pts

    @classmethod
    def fromF(cls, F: float) -> "State":
        """Start the room stage from the freshness at our door (same as FreshV2.State.fromF in JS)."""
        return cls(1.0 - F / 100.0, 0.0)

    @property
    def F(self) -> float:
        return max(0.0, 100.0 * (1.0 - self.life_used) - self.water_pts)

    def step(self, crop: dict, T_flower: float, T_air: float, RH: float, v: float, dt_h: float, water_factor: float) -> float:
        self.life_used += rate_k(crop, T_flower) * dt_h / crop["freshness"]["SL_ref_h"]
        self.water_pts += 100.0 * wl_rate_pct_h(crop, T_air, RH, v) * dt_h * water_factor / crop["freshness"]["WL_max_pct"]
        return self.F


def travel_h(distance_km: float, mode: str, cfg: dict | None = None) -> float:
    cfg = cfg or load_cfg()
    return distance_km / cfg["trip"]["speeds_km_h"][mode]


def trip(crop: dict, weather: Callable[[float], tuple[float, float]], pick_start: float, pick_end: float, checkin: float,
         distance_km: float | None = None, band: str | None = None, mode: str | None = None, packing: str | None = None,
         travel_time_h: float | None = None, cfg: dict | None = None) -> dict[str, Any]:
    """Stage A. Times in hours on one clock (e.g. hours since 1 Jan 2026 00:00 IST); weather(t) -> (T_air °C, RH %)."""
    cfg = cfg or load_cfg()
    tc = cfg["trip"]
    mode = mode or tc["default_mode"]
    packing = packing or tc["default_packing"]
    if distance_km is None:
        distance_km = tc["distance_bands_km"][band or tc["default_band"]]
    if pick_end < pick_start:
        return {"ok": False, "error": "Picking end is before picking start."}
    if pick_end > checkin + 1e-9:
        return {"ok": False, "error": "Picking cannot end after the check-in time."}
    pk = tc["packing"][packing]
    full_travel = travel_time_h if travel_time_h is not None else travel_h(distance_km, mode, cfg)
    avail = checkin - pick_end
    trav = min(full_travel, avail)
    fw = min(tc["farm_wait_h"], max(0.0, avail - trav))
    mw = max(0.0, avail - trav - fw)
    half = (pick_end - pick_start) / 2.0
    segs = [("Picking (average flower waits half the window)", pick_end - half, half), ("Waiting at the farm", pick_end, fw),
            ("Transport", pick_end + fw, trav), ("Waiting at the market / our gate", pick_end + fw + trav, mw)]
    st = State()
    out = []
    for name, t0, dur in segs:
        n = max(1, int(math.ceil(dur / DT_H - 1e-9))) if dur > 0 else 0
        F0, Ts = st.F, []
        for i in range(n):
            dt = min(DT_H, dur - i * DT_H)
            Ta, RH = weather(t0 + (i + 0.5) * dt if n == 1 else t0 + i * DT_H + dt / 2)
            Tf = Ta + pk["bag_heating_K"]
            st.step(crop, Tf, Ta, RH, tc["air_speed_m_s"], dt, pk["water_factor"])
            Ts.append(Tf)
        out.append({"stage": name, "hours": round(dur, 3), "T_flower_C": round(sum(Ts) / len(Ts), 2) if Ts else None, "loss_pct": round(F0 - st.F, 3)})
    return {"ok": True, "F_door": st.F, "life_used": st.life_used, "water_pts": st.water_pts, "stages": out, "travel_h": trav,
            "travel_full_h": full_travel, "travel_cut": trav < full_travel - 1e-9, "distance_km": distance_km, "mode": mode, "packing": packing}


def weather_fn(t0_hours: float, T: list[float], RH: list[float]) -> Callable[[float], tuple[float, float]]:
    """Linear interpolation of hourly values; t in hours on the same clock as t0_hours (value i at t0_hours + i)."""
    def f(t: float) -> tuple[float, float]:
        x = t - t0_hours
        i = max(0, min(len(T) - 2, int(math.floor(x))))
        a = min(1.0, max(0.0, x - i))
        return T[i] + a * (T[i + 1] - T[i]), RH[i] + a * (RH[i + 1] - RH[i])
    return f
