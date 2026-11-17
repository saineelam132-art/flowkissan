"""Golden vectors: the JavaScript φ checker must give the same φ as the Python checker (±0.01) on the exported week."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
GOLD = ROOT / "results" / "live" / "phi_golden.json"


@pytest.mark.skipif(shutil.which("node") is None or not GOLD.exists(), reason="needs node and results/live/phi_golden.json")
def test_js_matches_python():
    js = json.loads(subprocess.run(["node", str(ROOT / "tests" / "js" / "phi_golden.js")], capture_output=True, text=True, check=True).stdout)
    gold = json.loads(GOLD.read_text())
    for name in ("honest", "out_minus_8"):
        a, b = gold[name]["phi"], js[name]["phi"]
        assert len(a) == len(b)
        worst = max(abs(x - y) for x, y in zip(a, b))
        assert worst <= 0.01, f"{name}: max |φ_py − φ_js| = {worst}"
        assert gold[name]["flag"] == js[name]["flag"]
    g, j = gold["out_minus_8"], js["out_minus_8"]
    assert g.get("first_flag") == j.get("first_flag")
    assert g.get("fired") == j.get("fired")
    assert g.get("suspects") == j.get("suspects")
