"""Flowers: respiration heat, crate rule, water loss and freshness (per flower, data/crops.json).

Freshness = same model as the old site (engine/shelf_life.py, Freshness v2):
    k   = max( Q10^((T - T_opt)/10),  1 + a_c (T_chill - T)^2 below the chilling limit )
    LifeUsed += k dt / SL_ref
    WL  += K_t * VPD * sqrt(v) * liner * dt            [% of weight]
    F   = 100 * (1 - LifeUsed) * (1 - WL / WL_max);    price = base price * F / 100
New for flowers: VPD is taken between the FLOWER (saturated at its own temperature) and the room air,
    VPD = max(0, e_s(T_flower) - RH/100 * e_s(T_air))  [hPa]
so warm flowers in a cold room lose water faster until they are cold; 'liner' is the perforated-liner factor (E).
"""
import math

from . import shelf_life as SL

BLOCK_KEY = "blocked_flowers"


def respiration_W_kg(crop, T_C):
    """Respiration heat [W/kg]: log-linear between the table values at 0/5/10/20 C. Above 20 C it is held at the 20 C value:
    there is no data there, and extrapolating with Q10 made the flowers heat an unpowered room far above the outside air (bug, fixed)."""
    T_C = max(-5.0, T_C)
    tab = crop.get("respiration_mW_kg")
    if not tab:
        return crop.get("respiration_W_per_kg_at_ref", 0.0) * crop["Q10"] ** ((T_C - crop["T_ref_C"]) / 10.0)
    xs = sorted((float(k), math.log(v)) for k, v in tab.items())
    T_C = min(T_C, xs[-1][0])                # no data above the last table point (20 C): held at that value, never extrapolated (E)
    if T_C <= xs[0][0]:
        (x0, y0), (x1, y1) = xs[0], xs[1]
    elif T_C >= xs[-1][0]:
        (x0, y0), (x1, y1) = xs[-2], xs[-1]
    else:
        for (x0, y0), (x1, y1) in zip(xs, xs[1:]):
            if x0 <= T_C <= x1:
                break
    return math.exp(y0 + (y1 - y0) * (T_C - x0) / (x1 - x0)) / 1000.0


def vpd_hPa(T_flower, T_air, RH):
    return max(0.0, SL.e_s_hPa(T_flower) - min(100.0, max(0.0, RH)) / 100.0 * SL.e_s_hPa(T_air))


def water_loss_pct_h(crop, T_flower, T_air, RH, v, liner=1.0):
    return crop["freshness"]["K_t_mg_kg_s_MPa"] * SL.KT_UNIT * vpd_hPa(T_flower, T_air, RH) * math.sqrt(max(v, 0.0)) * liner


class FlowerFreshness(SL.Freshness):
    """Freshness of one batch of flowers.
    Looks:     LifeUsed += k dt / (SL_ref x boric factor);  reaches 0 at the reference shelf life (bagged at 4 C / ambient).
    Fragrance: (jasmine) the same clock running 'life_factor' times faster - fragrance ends before looks.
    Water:     weight loss always counted; it lowers freshness only when the flowers are NOT in a PE bag."""

    def __init__(self, crop, state=None, bagged=True, boric=False):
        super().__init__(crop, state)
        s = state or {}
        self.bagged = s.get("bagged", bagged)
        self.life_mult = s.get("life_mult", crop.get("boric_life_factor", 1.0) if (boric and crop.get("boric_acid_dip")) else 1.0)
        self.frag_factor = (crop.get("fragrance") or {}).get("life_factor")

    def step(self, T_air, RH, v, dt_h, T_core=None, liner=1.0):
        T_core = T_air if T_core is None else T_core
        self.life_used += SL.rate_k(self.crop, T_core) * dt_h / (self.f["SL_ref_h"] * self.life_mult)
        self.wl += water_loss_pct_h(self.crop, T_core, T_air, RH, v, liner) * dt_h
        self.freeze_min = self.freeze_min + dt_h * 60.0 if T_core < self.f["T_freeze_C"] else 0.0
        if self.freeze_min > self.f["freeze_minutes_to_damage"]:
            self.damaged = True
        return self.value

    @property
    def value(self):
        F = 100.0 * max(0.0, 1.0 - self.life_used)
        if not self.bagged:
            F *= max(0.0, 1.0 - self.wl / self.f["WL_max_pct"])
        return min(F, self.f["damaged_freshness_pct"]) if self.damaged else F

    @property
    def fragrance(self):
        if not self.frag_factor:
            return None
        return 100.0 * max(0.0, 1.0 - self.life_used * self.frag_factor)

    def state(self):
        d = super().state()
        d.update(bagged=self.bagged, life_mult=self.life_mult, fragrance_pct=self.fragrance)
        return d


def check_in(crops, key, hold_days=1):
    """Check-in rule. Returns (ok, message)."""
    blocked = crops.get(BLOCK_KEY, {})
    if key in blocked:
        return False, blocked[key]["warning"]
    c = crops.get(key)
    if not c or c.get("kind") != "flower" or not c.get("ok_in_our_room"):
        return False, "Only jasmine, marigold, rose, tuberose, chamanthi (and kanakambaram for 1 day) are accepted in this 4 °C flower room."
    if hold_days > c.get("max_hold_days", 7):
        return False, f"{c['label']}: at most {c['max_hold_days']} day(s) in this room." + (" " + c["shelf"]["warning"] if c.get("shelf") else "")
    if c.get("shelf"):
        return True, c["shelf"]["warning"]
    return True, f"{c['label']}: OK for the 4 °C room ({c['fit_at_4C']})."


def crates_needed(crop, kg):
    return int(math.ceil(kg / crop["kg_per_crate_mid"] - 1e-9))


def daily_schedule(n_days, parts, hold=1, bag=True, boric=False):
    """Simple plan for the sweeps: one fill every 'hold' days, in at 13:00, out at 05:00 'hold' days later."""
    return [{"in_day": d, "out_day": d + hold, "parts": dict(parts), "bag": bag, "boric": boric, "reason": "daily surplus", "season": "sweep"}
            for d in range(0, n_days, hold)]
