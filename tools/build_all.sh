#!/bin/sh
# Re-make every number on the website from the twin (about 4 minutes).
set -e
cd "$(dirname "$0")/.."
python -m twin.run_all          # all studies -> results/
python -m engine.cost           # cost and ROI -> results/live/cost_roi.json
python -m twin.trust_nodes      # Trust & Trade node data + glycol check -> web/trust/data/trust_data.js
python tools/export_site.py     # results -> web/data/site_data.js
python -m pytest -q
