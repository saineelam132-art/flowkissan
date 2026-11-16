#!/bin/sh
# Re-make every number on the website from the twin (about 4 minutes).
set -e
cd "$(dirname "$0")/.."
python -m twin.run_all          # all studies -> results/
python -m twin.pipe_pump       # pipe / pump options -> results/live/pipe_pump.json
python -m twin.solar_only      # solar-only options -> results/live/solar_only.json
python -m twin.live_run        # Live 2026 report, 1 Jan -> newest saved weather (add --fetch to download)
python -m twin.control_data    # Control centre data -> results/live/control.json
python -m engine.cost           # cost and ROI -> results/live/cost_roi.json
python -m twin.trust_nodes      # Trust & Trade node data + glycol check -> web/trust/data/trust_data.js
python tools/export_site.py     # results -> web/data/site_data.js
python tools/build_static.py    # web/ -> static_site/ (the folder Vercel serves)
python -m pytest -q
