"""Season plan: from data/season_calendar.json build the yearly loading schedule (which flower, how many kg,
which day in, which day out) and the price of every flower on every day. Everything here is E (assumption).

Rules (data/season_calendar.json -> plan, price_model):
  * Sale days = festivals, every Friday, and Sundays in wedding seasons (stand-ins for muhurtham days).
  * Before a festival the room is filled in two halves, 4 and 3 days ahead (never longer than the flower's max hold).
  * Before an ordinary sale day: two halves, 3 and 2 days ahead (Friday sale -> Tuesday and Wednesday loading).
  * After Sankranti, Vinayaka Chavithi, Dasara and Deepavali: unsold surplus goes in the next day and is held 4 days
    until the price crash is over ('glut saving').
  * Kanakambaram: Thursday in, Friday out (1 day only), 2 crates.
  * A flower is held only if it should pay: sale price x expected freshness > 1.05 x the price on the loading day.
  * Everyday surplus: on any day with free crates, unsold flowers of the season are held 1-3 days if the expected
    freshness after the hold is at least 80 % and the expected price is not below today's price.
  * Never more crates than the space model allows (12 places; 'extra racks' option 16).
"""
import datetime as dt
import json
from pathlib import Path

from engine.config import load_crops

ROOT = Path(__file__).resolve().parent.parent
CAL = ROOT / "data" / "season_calendar.json"
Y0 = dt.date(2026, 1, 1)
MONTH_FLOWERS = {1: ["chamanthi", "marigold"], 2: ["rose"], 3: ["jasmine"], 4: ["jasmine", "tuberose"], 5: ["jasmine", "tuberose"],
                 6: ["jasmine", "tuberose"], 7: ["jasmine", "tuberose"], 8: ["marigold", "rose"], 9: ["marigold", "chamanthi"],
                 10: ["marigold", "chamanthi"], 11: ["chamanthi", "marigold"], 12: ["chamanthi", "rose"]}
SURPLUS_AFTER = ("sankranti", "chavithi", "dasara", "deepavali")
SEASONS = {"summer_jasmine": "Summer jasmine (Mar–Jul)", "sravana": "Sravana (Aug–early Sep)",
           "dasara_deepavali_karthika": "Dasara–Deepavali–Karthika (mid Sep–mid Dec)", "sankranti": "Sankranti (mid Dec–Jan)",
           "valentine": "Valentine's / weddings (Feb)"}


def load_calendar():
    return json.loads(CAL.read_text(encoding="utf-8"))


def D(s):
    return dt.date.fromisoformat(s)


def season_of(d):
    if d.month in (3, 4, 5, 6, 7):
        return "summer_jasmine"
    if d.month == 8 or (d.month == 9 and d.day <= 6):
        return "sravana"
    if d.month == 2:
        return "valentine"
    if d.month == 1 or (d.month == 12 and d.day >= 16):
        return "sankranti"
    return "dasara_deepavali_karthika"


def wedding_day(cal, d):
    return any(w["weddings"] and D(w["from"]) <= d <= D(w["to"]) for w in cal["windows"])


def price(cal, crops, crop, d):
    """Rs/kg of 'crop' on date d (E): base of the month x supply factor x day factor."""
    pm = cal["price_model"]
    p = crops[crop]["price_base_INR_kg"][str(d.month)]
    sup = cal["supply"][crop][d.month - 1]
    p *= pm["peak_supply_multiplier"] if sup == 2 else (pm["off_season_multiplier"] if sup == 0 else 1.0)
    f_day = None
    for f in cal["festivals"]:
        if crop not in f["flowers"]:
            continue
        fd = D(f["date"])
        if fd - dt.timedelta(days=pm["pre_festival_days"]) <= d <= fd + dt.timedelta(days=f["days"] - 1):
            return p * pm["pre_festival_multiplier"]
        if fd + dt.timedelta(days=f["days"]) <= d <= fd + dt.timedelta(days=f["days"] - 1 + pm["post_crash_days"]):
            f_day = pm["post_crash_multiplier"]
    if f_day is not None:
        return p * f_day
    wd = d.strftime("%a")
    if wd == "Fri" or (wd == "Sun" and wedding_day(cal, d)):
        return p * pm["sale_day_multiplier"]
    if wd in cal["muhurtham_proxy"]["load_weekdays"]:
        return p * pm["slack_day_multiplier"]
    return p


def festival_window(cal, d):
    pm = cal["price_model"]
    for f in cal["festivals"]:
        fd = D(f["date"])
        if fd - dt.timedelta(days=pm["pre_festival_days"] + 2) <= d <= fd + dt.timedelta(days=f["days"] - 1):
            return f["name"]
    return None


def build(places=12, year_end=dt.date(2026, 12, 31), cal=None, crops=None):
    """-> list of fills {in_day, out_day, parts {crop: kg}, crates, bag, boric, reason, season, event}."""
    cal = cal or load_calendar()
    crops = crops or load_crops()
    n = (year_end - Y0).days + 1
    occ = [0] * (n + 10)
    fills = []

    def add(d_in, d_out, flowers, crates, reason, event):
        i0, i1 = (d_in - Y0).days, (d_out - Y0).days
        if i0 < 0 or i1 >= n or i1 <= i0:
            return
        flowers = [f for f in flowers if cal["supply"][f][d_in.month - 1] > 0] or flowers[:1]
        flowers = flowers[:2]
        hold = min([i1 - i0] + [crops[f].get("plan_hold_days", crops[f]["max_hold_days"]) for f in flowers])
        i0 = i1 - hold
        if "surplus" not in reason and "everyday" not in reason:   # hold only what should pay: sale price x expected freshness > today's price
            d0, d1 = Y0 + dt.timedelta(days=i0), Y0 + dt.timedelta(days=i1)
            flowers = [f for f in flowers if price(cal, crops, f, d1) * max(0.0, 1 - 1.3 * hold / crops[f]["shelf_life_bagged_4C_days"])
                       > 1.05 * price(cal, crops, f, d0)]
            if not flowers:
                return
        free = places - max(occ[i0:i1 + 1])
        crates = min(crates, free)
        if crates < len(flowers):
            return
        per = crates // len(flowers)
        parts = {f: per * crops[f]["kg_per_crate_mid"] for f in flowers}
        for j in range(i0, i1):
            occ[j] += per * len(flowers)
        fills.append({"in_day": i0, "out_day": i1, "in_date": str(Y0 + dt.timedelta(days=i0)), "out_date": str(Y0 + dt.timedelta(days=i1)),
                      "parts": parts, "crates": per * len(flowers), "bag": True, "boric": False, "reason": reason,
                      "season": season_of(Y0 + dt.timedelta(days=i1)), "event": event})

    half = places // 2
    for f in cal["festivals"]:                                   # 1) festivals first
        fd = D(f["date"])
        for lead in (4, 3):
            add(fd - dt.timedelta(days=lead), fd, f["flowers"], half, "hold for festival", f["name"])
        if f["key"] in SURPLUS_AFTER:
            a = fd + dt.timedelta(days=f["days"])
            add(a, a + dt.timedelta(days=4), ["marigold", "chamanthi"], half, "glut saving (post-festival surplus)", f["name"] + " surplus")
    d = Y0
    while d <= year_end:                                         # 2) kanakambaram: 1 day only
        if d.strftime("%a") == "Thu" and cal["supply"]["crossandra"][d.month - 1] > 0:
            add(d, d + dt.timedelta(days=1), ["crossandra"], 2, "1-day hold (chilling risk)", "Friday")
        d += dt.timedelta(days=1)
    d = Y0
    while d <= year_end:                                         # 3) weekly sale days
        wd = d.strftime("%a")
        if wd == "Fri" or (wd == "Sun" and wedding_day(cal, d)):
            for lead in (3, 2):
                add(d - dt.timedelta(days=lead), d, MONTH_FLOWERS[d.month], half, "hold for sale day", "Friday" if wd == "Fri" else "muhurtham Sunday")
        d += dt.timedelta(days=1)
    pm = cal["price_model"]                                      # 4) everyday surplus: hold while it stays fresh and the price is not lower
    d = Y0
    while d <= year_end:
        i0 = (d - Y0).days
        free = places - occ[i0]
        cands = []
        for f in MONTH_FLOWERS[d.month]:
            if cal["supply"][f][d.month - 1] == 0:
                continue
            best = None
            for hd in range(1, crops[f].get("plan_hold_days", 1) + 1):
                d1 = d + dt.timedelta(days=hd)
                fr = max(0.0, 1 - 1.3 * hd / crops[f]["shelf_life_bagged_4C_days"])
                if d1 > year_end or fr < pm["surplus_min_freshness"] or price(cal, crops, f, d1) < price(cal, crops, f, d):
                    continue
                if places - max(occ[i0:i0 + hd + 1]) < 1:
                    continue
                sc_ = price(cal, crops, f, d1) * fr
                if best is None or sc_ > best[0]:
                    best = (sc_, hd)
            if best:
                cands.append((f, best[1]))
        if free >= 1 and cands:
            f, hd = max(cands, key=lambda x: price(cal, crops, x[0], d + dt.timedelta(days=x[1])))
            add(d, d + dt.timedelta(days=hd), [f], min(half, free), "everyday surplus hold", "surplus")
        d += dt.timedelta(days=1)
    fills.sort(key=lambda f: (f["in_day"], f["out_day"]))
    return fills


def value_batches(bt, cal=None, crops=None):
    """Add prices and Rs value to the batches table of a seasonal run (all E).
    value captured = kg sold x price at sale x freshness  -  kg x price on the storage day     (hold for a sale day)
    loss avoided   = kg sold x price at sale x freshness                                      (post-festival surplus that had no buyer)
    surplus held   = kg sold x price at sale x freshness  -  kg x 0.5 x price on the storage day (everyday surplus: distress sale otherwise)"""
    cal = cal or load_calendar()
    crops = crops or load_crops()
    bt = bt.dropna(subset=["F_room"]).copy()
    P_in, P_out, val, kind = [], [], [], []
    for r in bt.itertuples():
        d_in = D(r.date)
        d_out = d_in + dt.timedelta(days=int(round((r.hours + 8) / 24.0)))
        pi, po = price(cal, crops, r.crop, d_in), price(cal, crops, r.crop, d_out)
        sold = r.kg * (1 - r.wl_pct / 100.0) * po * r.F_room / 100.0
        reason = r.reason or ""
        glut = "post-festival" in reason
        everyday = "everyday" in reason
        P_in.append(pi)
        P_out.append(po)
        val.append(sold if glut else (sold - r.kg * pi * cal["price_model"]["surplus_distress_factor"] if everyday else sold - r.kg * pi))
        kind.append("loss avoided" if glut else ("surplus held" if everyday else "price uplift"))
    bt["price_in"], bt["price_out"], bt["value_INR"], bt["value_kind"] = P_in, P_out, val, kind
    bt["out_date"] = [str(D(a) + dt.timedelta(days=int(round((h + 8) / 24.0)))) for a, h in zip(bt.date, bt.hours)]
    return bt


def stock_days(schedule, n_days, cal=None):
    cal = cal or load_calendar()
    stock, high = set(), set()
    for f in schedule:
        for j in range(f["in_day"], min(f["out_day"], n_days)):
            stock.add(j)
            if "post-festival" in f["reason"] or "festival" in f["reason"]:
                high.add(j)
    return len(stock), len(high)
