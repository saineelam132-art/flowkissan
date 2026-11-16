# KoolKisaan Flowers

*Cold from the sun, ice for the night, truth in the ledger.*

A solar cold room for loose flowers (jasmine, marigold, rose, tuberose, chamanthi) in Visakhapatnam, with its digital twin
and website. New project, new repository: the earlier KoolKisaan (pomegranate) project was used only as a source and is not changed.

* Room: inside 2.0 × 2.0 × 2.2 m = 8.8 m³, U = 0.22 W/m²K, set-point 4 °C, normal band 2–6 °C.
* Refrigeration: **outdoor** factory-sealed R290 chiller + glycol loop → **0 g of R290 inside the room**.
  Two motorised valves: V-ROOM (air cooler) and V-ICE (glycol coils in the ice panels).
* Cold storage for the night: 100 kg of water / ice (0 °C) in finned aluminium panels – it replaced the paraffin + graphite wax to save cost (`results/live/solar_only.json`).
* Headline numbers = the **best-practice** case (realistic losses + good design + good operation); ideal and poor practice are shown next to it.
* Solar: 1.8 kWp. Grid only as backup.

**Every number on the website comes from a results file written by the twin.** Nothing is measured: results are
simulated (S) on real 2026 Visakhapatnam weather (Open-Meteo, 1 Jan – 6 Nov 2026, 310 days). Assumptions are tagged E.

## Run it

```
pip install -r requirements.txt
```
```
sh tools/build_all.sh
```

That runs all studies (`python -m twin.run_all`), the cost model (`python -m engine.cost`), the Trust & Trade data
(`python -m twin.trust_nodes`), the website data (`python tools/export_site.py`) and the tests. To look at the site:

```
python -m http.server 8000 --directory web
```

then open http://localhost:8000. Hosting on its own Firebase project: **docs/firebase_setup.md**.

## Where things are

| Path | What |
|---|---|
| `config/design.json` | All design values; `assumptions_E` lists every E value with its source |
| `config/cost.json` | Prices (all E, low / mid / high) |
| `data/crops.json` | Flower table with a source next to every value; blocked flowers; handling rules |
| `data/season_calendar.json` | Supply by month, festivals 2026, price model (all E) |
| `engine/glycol.py`, `humidity.py`, `flowers.py`, `cost.py` | New physics: glycol loop, room humidity, flower freshness, cost |
| `twin/flower_sim.py` | The flower twin (5-minute steps) |
| `twin/season_plan.py` | Yearly loading plan and prices |
| `twin/run_all.py`, `twin/reality.py` | All studies, reality check |
| `twin/live_sim.py`, `legacy/` | The OLD design's twin and config – used only for the comparison table |
| `results/` | What the twin wrote (`results/live/flowers_2026.json` is the headline file) |
| `web/` | The website source (plain files). `web/data/site_data.js` is generated from `results/` |
| `static_site/` | Exact copy of `web/` made by `python tools/build_static.py` – the folder Vercel serves (Root Directory = `static_site`) |
| `tests/` | Automatic checks |

## Results files

`results/live/`: `flowers_2026.json` (final design, ideal and realistic + smart controller), `monthly_2026.json`,
`season_plan.json`, `holds.json` (freshness after 1/2/3 days), `ice_sweep.json`, `load_sweep.json`,
`humidity_options.json`, `reality_check.json`, `practice.json` (ideal / best / poor practice, each rule alone, racks), `solar_only.json`, `live_2026.json` (1 Jan → newest weather; `python -m twin.live_run --fetch` downloads newer weather), `night_limit.json`, `cost_roi.json`, `hourly_flowers.csv`;
`results/compare_old_vs_new.json`.

Copied from the old project: the physics engine, the 2026 weather file, the real photos (credits in
`web/assets/CREDITS.md`), the ledger and Φ check. Not copied: secrets, service-account files, the ISHRAE weather file.
