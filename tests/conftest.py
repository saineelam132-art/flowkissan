import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine.config import _strip_notes, load_config, load_crops  # noqa: E402


@pytest.fixture(scope="session")
def cfg():
    """Formula tests copied from the old project check the engine against the OLD design values (legacy/old_design.json)."""
    return _strip_notes(json.loads((ROOT / "legacy" / "old_design.json").read_text(encoding="utf-8")))


@pytest.fixture(scope="session")
def fcfg():
    """The new KoolKisaan Flowers design (config/design.json)."""
    return load_config()


@pytest.fixture(scope="session")
def crops():
    return load_crops()


@pytest.fixture(scope="session")
def weather():
    from twin import study
    return study.study_weather()


@pytest.fixture(scope="session")
def short_run(fcfg, weather):
    from twin.flower_sim import simulate
    return simulate(weather.iloc[:24 * 25], cfg=fcfg, steps=True)
