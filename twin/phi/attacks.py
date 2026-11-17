"""Attack cases for the trust check (all simulated, S). Each case changes what the owner's sensors and logs REPORT
from a start step; external references (weather service, PV inverter log, utility meter) and the server's secret
watermark patterns are never touched, because the owner cannot edit them.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

from twin.phi.plant import OWNER

COMMANDS = ["duty_room", "v_ice", "run_frac", "fog_duty", "nfan", "defrost", "kg", "load_event", "door", "ATS"]


@dataclass
class Case:
    key: str
    label: str
    sensors: list[str]                        # sensors the attacker changes (for the isolation score)
    kind: str                                 # offset / gain / freeze / drift / replay / consistent / physical
    apply: Callable[[pd.DataFrame, int, dict], pd.DataFrame]
    needs: list[str] = field(default_factory=list)   # extra runs: 'chiller_off', 'fake_shift', 'fake_same'
    isolable: bool = True


def _offset(cols: dict[str, float]) -> Callable:
    def f(R: pd.DataFrame, k: int, ctx: dict) -> pd.DataFrame:
        Q = R.copy()
        for c, b in cols.items():
            v = Q[c].to_numpy(dtype=float).copy()
            v[k:] += b
            Q[c] = v
        return Q
    return f


def _gain(cols: dict[str, float]) -> Callable:
    def f(R: pd.DataFrame, k: int, ctx: dict) -> pd.DataFrame:
        Q = R.copy()
        for c, g in cols.items():
            v = Q[c].to_numpy(dtype=float).copy()
            v[k:] *= (1.0 + g)
            Q[c] = v
        return Q
    return f


def _combo(*fs: Callable) -> Callable:
    def f(R: pd.DataFrame, k: int, ctx: dict) -> pd.DataFrame:
        for g in fs:
            R = g(R, k, ctx)
        return R
    return f


def _drift(col: str, K_per_h: float) -> Callable:
    def f(R: pd.DataFrame, k: int, ctx: dict) -> pd.DataFrame:
        Q = R.copy()
        v = Q[col].to_numpy(dtype=float).copy()
        t_h = np.arange(len(v) - k) * 300.0 / 3600.0
        v[k:] += K_per_h * t_h
        Q[col] = np.round(v, 1)
        return Q
    return f


def _frozen_room(R: pd.DataFrame, k: int, ctx: dict) -> pd.DataFrame:
    """Chiller really broken from k (truth run 'chiller_off'), owner freezes the middle room probe at 4.0 °C."""
    Q = ctx["chiller_off"].copy()
    v = Q["T_mid"].to_numpy(dtype=float).copy()
    v[k:] = 4.0
    Q["T_mid"] = v
    return Q


def _ice_fake(R: pd.DataFrame, k: int, ctx: dict) -> pd.DataFrame:
    Q = R.copy()
    v = Q["T_ice"].to_numpy(dtype=float).copy()
    v[k:] = -0.4                          # 'still frozen' whatever happens
    Q["T_ice"] = v
    return Q


def _replace_owner(src_key: str) -> Callable:
    def f(R: pd.DataFrame, k: int, ctx: dict) -> pd.DataFrame:
        Q = R.copy()
        F = ctx[src_key]
        for c in OWNER + COMMANDS:
            v = Q[c].to_numpy(dtype=float).copy()
            v[k:] = F[c].to_numpy(dtype=float)[k:]
            Q[c] = v
        return Q
    return f


def _replay(R: pd.DataFrame, k: int, ctx: dict) -> pd.DataFrame:
    """Owner sensors and controller log from exactly 24 h earlier."""
    Q = R.copy()
    for c in OWNER + COMMANDS:
        v = Q[c].to_numpy(dtype=float).copy()
        v[k:] = v[k - 288:len(v) - 288]
        Q[c] = v
    return Q


CASES: list[Case] = [
    Case("honest", "Honest (4 door openings a day)", [], "none", lambda R, k, c: R.copy(), isolable=False),
    Case("room_offset_2", "Room T offset −2 K", ["T_mid"], "offset", _offset({"T_mid": -2.0})),
    Case("room_offset_5", "Room T offset −5 K", ["T_mid"], "offset", _offset({"T_mid": -5.0})),
    Case("room_frozen", "Room T frozen at 4.0 °C while the chiller is really off", ["T_mid"], "physical", _frozen_room, ["chiller_off"]),
    Case("out_offset_2", "Outside T −2 K", ["T_out_s"], "offset", _offset({"T_out_s": -2.0})),
    Case("out_offset_5", "Outside T −5 K", ["T_out_s"], "offset", _offset({"T_out_s": -5.0})),
    Case("out_offset_8", "Outside T −8 K", ["T_out_s"], "offset", _offset({"T_out_s": -8.0})),
    Case("out8_power20", "Outside T −8 K and power −20 %", ["T_out_s", "P_el"], "offset", _combo(_offset({"T_out_s": -8.0}), _gain({"P_el": -0.2}))),
    Case("glycol_fake", "Glycol supply and return both reported 2 K colder", ["T_sup", "T_ret"], "offset", _offset({"T_sup": -2.0, "T_ret": -2.0})),
    Case("power_20", "Chiller power −20 %", ["P_el"], "gain", _gain({"P_el": -0.2})),
    Case("power_40", "Chiller power −40 %", ["P_el"], "gain", _gain({"P_el": -0.4})),
    Case("drift", "Room T slow drift −0.1 K per hour", ["T_mid"], "drift", _drift("T_mid", -0.1)),
    Case("consistent_shift", "All owner sensors from a model run with outside T 4 K lower", list(OWNER), "consistent", _replace_owner("fake_shift"),
         ["fake_shift"], isolable=False),
    Case("consistent_same", "All owner sensors from a model run on the real weather (no watermark)", list(OWNER), "consistent",
         _replace_owner("fake_same"), ["fake_same"], isolable=False),
    Case("replay", "Replay of yesterday (all owner sensors and logs)", list(OWNER), "replay", _replay, isolable=False),
    Case("ice_fake", "Ice-panel T faked as 'still frozen' (−0.4 °C)", ["T_ice"], "freeze", _ice_fake),
]


def replay_fingerprint(R: pd.DataFrame, run_steps: int = 12) -> np.ndarray:
    """Hash-chain layer: a reading whose owner values are bit-identical to the reading 24 h earlier is a replay.
    Flag after `run_steps` identical readings in a row (honest sensors with noise never repeat a whole row)."""
    V = R[OWNER].to_numpy(dtype=float)
    same = np.zeros(len(V), dtype=bool)
    if len(V) > 288:
        a, b = V[288:], V[:-288]
        same[288:] = np.all((a == b) | (np.isnan(a) & np.isnan(b)), axis=1)
    run = np.zeros(len(V), dtype=int)
    for i in range(len(V)):
        run[i] = (run[i - 1] + 1 if i else 1) if same[i] else 0
    return run >= run_steps
