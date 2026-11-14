"""Room humidity model (new for the flower room).

Water vapour in the room air (humidity ratio W, kg water per kg dry air), one balance every step:

    M dW/dt = sum_j g_j (W_j - W) + S_fog

    source / sink        g_j [kg dry air / s]                 W_j                         active when
    door air             infiltration mass flow               outside air W               door open
    flower transpiration m K_t sqrt(v) liner p/0.622          saturated at FLOWER temp    W < W_j   (flowers give water)
    water tray           h A / cp_air                         saturated at room temp      W < W_j
    air cooler coil      duty x G_coil / cp_air               saturated at coil surface   W > W_j   (water condenses)
    wax panels           G_wax / cp_air                       saturated at wax temp       W > W_j   (water condenses)
    fogger               S_fog [kg/s], only enough to reach its target RH

The room air holds very little water (about 11 kg of air), so the balance is solved implicitly (stable for any step).
Latent heat: water that condenses on the coil is extra load on the chiller; on the wax it melts wax; water that
evaporates (flowers, tray, fog) cools what it leaves. H_V = 2501 kJ/kg everywhere, so the energy balance closes.
"""
from . import psychro

H_V = 2501.0          # kJ/kg
CP_AIR = 1.006        # kJ/kg.K


def w_sat(T_C, p_Pa):
    return psychro.humidity_ratio(T_C, 100.0, p_Pa)


def rh_of(W, T_C, p_Pa):
    pw = W * p_Pa / (0.621945 + W)
    return 100.0 * pw / psychro.p_sat(T_C)


def w_of(rh_pct, T_C, p_Pa):
    return psychro.humidity_ratio(T_C, rh_pct, p_Pa)


def solve(W_old, M_kg, dt_s, terms, S_const=0.0):
    """terms: list of (g, W_target, kind) with kind 'both' (always), 'source' (only if W < target) or
    'sink' (only if W > target). Returns (W_new, flows) with flows[j] = g_j (W_j - W_new), + = into the air."""
    active = [True] * len(terms)
    W = W_old
    for _ in range(4):
        num = M_kg / dt_s * W_old + S_const
        den = M_kg / dt_s
        for a, (g, Wt, kind) in zip(active, terms):
            if a and g > 0.0:
                num += g * Wt
                den += g
        W = num / den
        new = [kind == "both" or (kind == "source" and W < Wt) or (kind == "sink" and W > Wt) for (g, Wt, kind) in terms]
        if new == active:
            break
        active = new
    flows = [g * (Wt - W) if a and g > 0.0 else 0.0 for a, (g, Wt, kind) in zip(active, terms)]
    return W, flows
