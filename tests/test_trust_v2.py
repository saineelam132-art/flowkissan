"""Trust & Trade v2: the JavaScript engine (phi_stream.js, freshness_v2.js) gives the Python numbers; attacks are flagged
within the times of the 2026 evaluation; honest data gives no flag; impact numbers repeat exactly."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
GOLD = ROOT / "results" / "live" / "trust_v2_golden.json"
EVAL = ROOT / "results" / "live" / "phi_eval_2026.json"
CASE = {"room_core_offset_2": "room_offset_2", "room_offset_5": "room_offset_5", "out_offset_8": "out_offset_8", "power_20": "power_20",
        "drift": "drift", "replay": "replay"}


@pytest.fixture(scope="module")
def js():
    if shutil.which("node") is None or not GOLD.exists():
        pytest.skip("needs node and results/live/trust_v2_golden.json")
    return json.loads(subprocess.run(["node", str(ROOT / "tests" / "js" / "trust_v2_check.js")], capture_output=True, text=True, check=True).stdout)


def test_honest_stream_matches_and_never_flags(js):
    g = json.loads(GOLD.read_text())
    assert max(abs(a - b) for a, b in zip(g["honest"]["phi"], js["honest"]["phi"])) <= 0.01
    assert g["honest"]["flags_after_warmup"] == 0 and js["honest"]["flags_after_warmup"] == 0


def test_attacks_match_python_and_are_caught_in_time(js):
    g = json.loads(GOLD.read_text())
    ev = {c["key"]: c for c in json.loads(EVAL.read_text())["cases"]}
    for name, key in CASE.items():
        c, p = js["cases"][name], g[name]
        assert max(abs(a - b) for a, b in zip(p["phi"], c["phi"])) <= 0.01, name
        assert c["first_flag"] == p["first_flag"] and c["fired"] == p["fired"] and c["suspects"] == p["suspects"], name
        minutes = (c["first_flag"] - p["cfg"]["start"]) * 5
        assert minutes <= ev[key]["p90_ttf_min"], (name, minutes, ev[key]["p90_ttf_min"])
        assert c["impact_repeat_same"], name


def test_trip_freshness_js_equals_python(js):
    g = json.loads(GOLD.read_text())
    for a, t in zip(js["trips"], g["trips"]):
        assert abs(a - t["F_door"]) < 0.01
    assert js["reject"]["ok"] is False


def test_room_attack_costs_the_farmer_and_hides_loss(js):
    i = js["cases"]["room_core_offset_2"]["impact"]
    assert i["lost"] > 0 and i["hidden"] > 0 and i["farmer"] > 0 and i["owner"] > 0
    o = js["cases"]["out_offset_8"]["impact"]
    assert o["lost"] == 0 and o["farmer"] == 0            # outside T does not steer the room
