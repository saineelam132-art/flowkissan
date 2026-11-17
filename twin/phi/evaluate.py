"""Run the trust check (φ) on the honest 310-day 2026 record and on every attack case.

python -m twin.phi.evaluate      → results/live/phi_eval_2026.json and docs/phi_results.md
Everything here is a SIMULATION (S): a truth plant with different parameters from the checker's model, simulated sensors
with offsets/noise/lag, and simulated attacks. Nothing is measured.
"""
from __future__ import annotations

import json
import math
import pickle
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from engine.config import load_config
from twin import study
from twin.phi import attacks as AT
from twin.phi import isolate as IS
from twin.phi import model as M
from twin.phi import plant as PL
from twin.phi import residuals as RS
from twin.phi import score as SC
from twin.phi import watermark as WM

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "results" / "live" / "phi_eval_2026.json"
DOC = ROOT / "docs" / "phi_results.md"
CACHE = ROOT / "results" / "phi_cache"
SPD = 288
EXTERNAL = {"R7T", "R7W", "R8", "R8d"}


def door_g(cfg: dict, R: pd.DataFrame) -> np.ndarray:
    return M.door_g_full(cfg, R["T_out_api"].to_numpy(), R["RH_out_api"].to_numpy(), R["ps_api"].to_numpy() * 100.0)


def honest(cfg: dict, P: dict, use_cache: bool = False) -> dict[str, Any]:
    """Honest year → residuals → calibration (first 21 days) → scores with daily state snapshots."""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / "honest.pkl"
    if use_cache and f.exists():
        return pickle.loads(f.read_bytes())
    w = study.study_weather()
    S, _ = PL.run_truth(w, cfg, P)
    R = PL.make_readings(S, w, cfg, P)
    dg = door_g(cfg, R)
    N = M.nominal(cfg, P)
    X = RS.compute(R, N, P, dg)
    cal = SC.calibrate(X, P)
    Sc = SC.score(X, cal, P, snapshots=True)
    H = {"R": R, "w": w, "dg": dg, "N": N, "X": X, "cal": cal, "Sc": Sc}
    f.write_bytes(pickle.dumps(H))
    return H


def _layer(name: str) -> str:
    if name in EXTERNAL:
        return "external"
    return "physics"


def run_window(H: dict, Ra: pd.DataFrame, cfg: dict, P: dict, start: int, w0: int, w1: int, sensors: list[str],
               isolate: bool) -> dict[str, Any]:
    R, N, cal = H["R"], H["N"], H["cal"]
    Rw = Ra.iloc[w0:w1]
    dg = H["dg"][w0:w1]
    X = RS.compute(Rw, N, P, dg)
    d0 = w0 // SPD
    Sc = SC.score(X, cal, P, state=H["Sc"]["snapshots"][d0], day_offset=d0)
    s = start - w0
    hor = int(P["evaluation"]["horizon_h"] * 12)
    res: dict[str, Any] = {"start": int(start), "layers": {}}
    fl = np.where(Sc["flag"][s:s + hor])[0]
    if len(fl):
        k = s + int(fl[0])
        fired = SC.which_fired(Sc, cal, k)
        res["layers"][_layer(fired)] = float(fl[0] * 5)
        res["fired"] = fired
        if isolate:
            iso = IS.isolate(Rw, X, Sc, cal, N, P, dg, k)
            res["suspects"] = iso["suspects"]
            res["bias"] = iso["bias"]
            res["confidence"] = iso["confidence"]
            res["iso_correct"] = bool(sensors) and set(sensors) <= set(iso["suspects"])
            res["iso_exact"] = bool(sensors) and set(sensors) == set(iso["suspects"])
    # watermark (glycol supply pattern known only to the server), judged at the end of each day
    Wc = P["watermark"]
    run = Rw["run_frac"].to_numpy() > 0
    z = WM.supply_z(Rw["T_sup"].to_numpy(dtype=float), run, Rw["v_ice"].to_numpy(), R["dither_sup"].to_numpy()[w0:w1], P,
                    min_steps=Wc["supply_min_steps"])
    for d in range(len(z)):
        end = (d + 1) * SPD
        if end <= s or d * SPD >= s + hor:
            continue
        if np.isfinite(z[d]) and z[d] < Wc["supply_z_flag"]:
            res["layers"]["watermark"] = float((end - s) * 5)
            break
    # hash chain / replay fingerprint
    fp = AT.replay_fingerprint(Ra.iloc[max(0, w0 - SPD):w1])[min(SPD, w0):]
    hit = np.where(fp[s:s + hor])[0]
    if len(hit):
        res["layers"]["hash"] = float(hit[0] * 5)
    res["caught"] = bool(res["layers"])
    res["ttf_min"] = min(res["layers"].values()) if res["layers"] else None
    res["first_layer"] = min(res["layers"], key=res["layers"].get) if res["layers"] else None
    return res


def starts(P: dict, nd: int) -> list[int]:
    E = P["evaluation"]
    rng = np.random.default_rng(E["seed"])
    lo = P["calibration"]["days"] + E["pre_days"]
    days = rng.integers(lo, nd - 3, E["starts"])
    return [int(d * SPD + rng.integers(0, SPD)) for d in days]


def evaluate(cfg: dict | None = None, P: dict | None = None, use_cache: bool = False, cases: list[str] | None = None) -> dict[str, Any]:
    cfg = cfg or load_config()
    P = P or M.load_phi_cfg()
    H = honest(cfg, P, use_cache)
    R, w = H["R"], H["w"]
    n = len(R)
    nd = n // SPD
    st = starts(P, nd)
    pre = P["evaluation"]["pre_days"]
    ctx: dict[str, Any] = {}
    zeros = np.zeros(n)
    out_cases = []
    for case in AT.CASES:
        if cases and case.key not in cases:
            continue
        if "fake_shift" in case.needs and "fake_shift" not in ctx:
            Sf, _ = PL.run_truth(w, cfg, P, dither=zeros, dither_sup=zeros, site_shift_C=-4.0)
            ctx["fake_shift"] = PL.make_readings(Sf, w, cfg, P, seed=99)
        if "fake_same" in case.needs and "fake_same" not in ctx:
            Sf, _ = PL.run_truth(w, cfg, P, dither=zeros, dither_sup=zeros)
            ctx["fake_same"] = PL.make_readings(Sf, w, cfg, P)          # attacker knows their own sensors: same offsets and noise
        rows = []
        for k in st:
            d = k // SPD
            w0, w1 = (d - pre) * SPD, min(n, (d + 3) * SPD)
            if "chiller_off" in case.needs:
                Soff, _ = PL.run_truth(w, cfg, P, scenario={"from_step": k, "chiller_off": True})
                ctx["chiller_off"] = PL.make_readings(Soff, w, cfg, P)
            Ra = case.apply(R, k, ctx)
            rows.append(run_window(H, Ra, cfg, P, k, w0, w1, case.sensors, case.isolable))
        out_cases.append(summarise(case, rows))
        print(f"{case.key:18s} caught {out_cases[-1]['detection_rate']:.2f}  median {out_cases[-1]['median_ttf_min']} min", flush=True)
    honest_year = honest_summary(H, P)
    res = {"_note": "S (simulated): truth plant ≠ checker model, simulated sensors and attacks. Nothing here is measured. "
                    "All assumptions are in config/phi.json (E).",
           "starts_per_case": len(st), "horizon_h": P["evaluation"]["horizon_h"], "honest_year": honest_year, "cases": out_cases,
           "calibration": {k: H["cal"][k] for k in ("cusum_kappa", "cusum_h", "cusum_h_bootstrap", "calibration_days", "calibrated")},
           "biased_cusum": SC.biased_cusum_demo(H["Sc"])}
    return res


def honest_summary(H: dict, P: dict) -> dict[str, Any]:
    Sc, cal, R = H["Sc"], H["cal"], H["R"]
    c0 = P["calibration"]["days"] * SPD
    ev = [e for e in SC.events(Sc["flag"]) if e[0] >= c0]
    days = (len(R) - c0) / SPD
    by = Counter(SC.which_fired(Sc, cal, e[0]) for e in ev)
    layer = Counter()
    for e in ev:
        parts = {"instant": Sc["phi_inst"][e[0]], "slow (CUSUM)": Sc["phi_slow"][e[0]], "daily": Sc["phi_day"][e[0]]}
        layer["hard rule" if Sc["hard"][e[0]].any() else max(parts, key=parts.get)] += 1
    run = R["run_frac"].to_numpy() > 0
    z = WM.supply_z(R["T_sup"].to_numpy(dtype=float), run, R["v_ice"].to_numpy(), R["dither_sup"].to_numpy(), P,
                    min_steps=P["watermark"]["supply_min_steps"])[P["calibration"]["days"]:]
    zv = z[np.isfinite(z)]
    return {"days_scored": round(days, 1), "false_flags": len(ev), "false_flags_per_30_days": round(len(ev) / days * 30, 2),
            "flagged_fraction": round(float(Sc["flag"][c0:].mean()), 4), "by_residual": dict(by.most_common()), "by_layer": dict(layer),
            "phi_inst_ge3_fraction": round(float((Sc["phi_inst"][c0:] >= 3).mean()), 4),
            "watermark_days": int(len(zv)), "watermark_false_days": int((zv < P["watermark"]["supply_z_flag"]).sum()),
            "watermark_z_p1": round(float(np.percentile(zv, 1)), 1) if len(zv) else None,
            "watermark_z_median": round(float(np.median(zv)), 1) if len(zv) else None}


def summarise(case: AT.Case, rows: list[dict]) -> dict[str, Any]:
    n = len(rows)
    caught = [r for r in rows if r["caught"]]
    ttf = [r["ttf_min"] for r in caught]
    layers = Counter()
    first = Counter()
    for r in rows:
        for L in r["layers"]:
            layers[L] += 1
        if r["first_layer"]:
            first[r["first_layer"]] += 1
    fired = Counter(r["fired"] for r in rows if r.get("fired"))
    iso = [r for r in rows if "iso_correct" in r]
    bias = {}
    for s in case.sensors:
        v = [r["bias"][s] for r in iso if s in r.get("bias", {})]
        if v:
            bias[s] = round(float(np.median(v)), 2)
    out = {"key": case.key, "label": case.label, "kind": case.kind, "sensors": case.sensors, "n": n,
           "detection_rate": round(len(caught) / n, 3),
           "median_ttf_min": round(float(np.median(ttf)), 0) if ttf else None,
           "p90_ttf_min": round(float(np.percentile(ttf, 90)), 0) if ttf else None,
           "by_layer_rate": {k: round(v / n, 3) for k, v in layers.items()},
           "first_layer": dict(first.most_common()), "fired": dict(fired.most_common(4)),
           "isolation_correct_rate": round(sum(r["iso_correct"] for r in iso) / len(iso), 3) if (case.isolable and iso) else None,
           "isolation_exact_rate": round(sum(r["iso_exact"] for r in iso) / len(iso), 3) if (case.isolable and iso) else None,
           "median_bias_estimate": bias or None,
           "suspects_top": dict(Counter(",".join(r["suspects"]) for r in iso if r.get("suspects")).most_common(3)) if iso else None}
    return out


def write(res: dict[str, Any]) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(res, indent=1, ensure_ascii=False, default=float), encoding="utf-8")
    DOC.write_text(render_doc(res), encoding="utf-8")


def _why(c: dict) -> str:
    if c["key"] == "honest":
        return "honest data: any flag here is a false alarm"
    if c["detection_rate"] >= 0.9:
        L = max(c["first_layer"], key=c["first_layer"].get) if c["first_layer"] else "-"
        return f"caught, mostly first by the {L} layer"
    if c["detection_rate"] >= 0.5:
        return "caught often but not always: the lie is close to the honest noise"
    return "NOT reliably caught: the lie stays inside the honest noise of every residual this layer can see"


def render_doc(res: dict[str, Any]) -> str:
    h = res["honest_year"]
    L = ["# φ trust check – results on the 2026 run (S, simulated)", "",
         "_Generated by `python -m twin.phi.evaluate` from `results/live/phi_eval_2026.json`. Do not edit by hand._", "",
         "Everything below is a **simulation (S)**: a truth plant whose parameters differ from the checker's model, simulated sensors "
         "(offsets, noise, lag, rounding, dropouts) and simulated attacks. Nothing is measured. Assumptions (E) are in `config/phi.json`.", "",
         "## Honest record (out of sample)", "",
         f"* Calibrated on the first {res['calibration']['calibration_days']} days (January) only; scored on the next {h['days_scored']} days.",
         f"* **False flags: {h['false_flags']} in {h['days_scored']} days = {h['false_flags_per_30_days']} per 30 days** "
         f"(target ≈ 1). Readings flagged: {100 * h['flagged_fraction']:.1f} %.",
         f"* By layer: {', '.join(f'{k} {v}' for k, v in h['by_layer'].items())}. By residual: {', '.join(f'{k} {v}' for k, v in h['by_residual'].items())}.",
         f"* Readings with φ_inst ≥ 3: {100 * h['phi_inst_ge3_fraction']:.2f} % (a perfect Gaussian model would give 0.13 %): "
         "honest residuals have heavier tails than the model assumes, which is why a flag needs 3 readings in a row.",
         f"* Glycol watermark: {h['watermark_false_days']} of {h['watermark_days']} honest days below the flag line "
         f"(z median {h['watermark_z_median']}, 1st percentile {h['watermark_z_p1']}).", "",
         f"Why not the old memory `S = S + Φ − 1` with Φ = max|z|: on this honest record max|z| averages "
         f"{res['biased_cusum']['mean_phi_max']:.2f}, so S grows by {res['biased_cusum']['drift_per_day']:.0f} per day "
         f"and reaches {res['biased_cusum']['S_after_30_days']:.0f} after 30 days – it alarms forever. "
         "The CUSUM used here subtracts the expected χ² (m) plus κ, so its honest drift is negative.", "",
         f"## Attacks ({res['starts_per_case']} random start times each, {res['horizon_h']} h to catch)", "",
         "| Case | Caught | Median time to flag | 90 % within | Layers that caught it | First residual | Isolation correct | Verdict |",
         "|---|---|---|---|---|---|---|---|"]
    for c in res["cases"]:
        lay = ", ".join(f"{k} {100 * v:.0f} %" for k, v in sorted(c["by_layer_rate"].items(), key=lambda x: -x[1])) or "–"
        fired = ", ".join(list(c["fired"])[:2]) or "–"
        iso = "–" if c["isolation_correct_rate"] is None else f"{100 * c['isolation_correct_rate']:.0f} % (exact {100 * c['isolation_exact_rate']:.0f} %)"
        med = "–" if c["median_ttf_min"] is None else f"{c['median_ttf_min']:.0f} min"
        p90 = "–" if c["p90_ttf_min"] is None else f"{c['p90_ttf_min']:.0f} min"
        L.append(f"| {c['label']} | {100 * c['detection_rate']:.0f} % | {med} | {p90} | {lay} | {fired} | {iso} | {_why(c)} |")
    L += ["", "Layers: **physics** = R1–R6, R9, R10 and hard rules; **external** = weather service (R7), PV inverter (R8), utility meter (R8d); "
          "**watermark** = secret glycol supply pattern (checked daily); **hash** = a reading identical to the one 24 h earlier (replay fingerprint).", "",
          "## Limits (plain English)", "",
          "* A fully consistent fake – every owner sensor taken from a good model of the same room on the real weather – breaks no physics: "
          "**φ alone cannot catch it.** Only data the owner cannot make (the weather service, the inverter log, the utility meter, and above all "
          "the secret watermark) can. That is why the watermark and external references are part of the design, not extras.",
          "* The watermark proves the GLYCOL readings are live. It cannot prove the room probes are honest if the owner fakes only those; "
          "then the physics residuals (R1, R9, R2) have to catch it.",
          "* Slow lies smaller than the season-to-season model error can be learnt into the baseline over weeks (14-day memory, bounded to 4 σ).",
          "* All of this is tested on a simulated plant. Real sensors, a real room and a real attacker will differ – see 'real-world data still needed'.", ""]
    return "\n".join(L)


def main() -> None:
    import sys
    res = evaluate(use_cache="--cache" in sys.argv)
    write(res)
    print(json.dumps(res["honest_year"], indent=1))


if __name__ == "__main__":
    main()
