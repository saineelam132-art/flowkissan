"""Multi-sensor, physics-based trust verification (φ) for the flower cold room.

plant.py      the 'truth plant' (twin with perturbed parameters) + realistic sensors + external references
model.py      the NOMINAL model the checker believes (tables, constants)
residuals.py  physics residuals R1..R10 and hard rules H1..H3
score.py      whitening, chi-square -> sigma-equivalent φ, CUSUM, daily closure, flags
isolate.py    which sensor lies, by how much, and the reconstructed value (GLR)
watermark.py  secret set-point pattern and the correlation test
attacks.py    the attack cases
design.py     which sensor sets an attacker could fake without being seen
evaluate.py   runs everything on the 2026 year -> results/live/phi_*.json
"""
