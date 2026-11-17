#!/bin/sh
# Trust check (φ): honest 2026 run, 16 attack cases × 50 starts, design rank test, website data + golden vectors (~45 min).
# Then run tools/build_all.sh (or export_site + build_static) so the website shows the new numbers.
set -e
cd "$(dirname "$0")/.."
python -m twin.phi.evaluate      # -> results/live/phi_eval_2026.json, docs/phi_results.md
python -m twin.phi.export_web    # -> web/trust/data/phi_lab.js, results/live/phi_golden.json
python -m twin.phi.design        # -> results/live/phi_design.json, docs/phi_design.md
