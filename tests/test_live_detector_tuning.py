"""Tests for live detector sensitivity filter adjustment and clamping."""
from pathlib import Path
import tempfile
import shutil
import pytest

from live_clipper.models import LiveConfig, DetectorConfig
from live_clipper.session import LiveClipperSession


@pytest.fixture
def temp_session_dir():
    td = tempfile.mkdtemp(prefix="test_detector_tuning_")
    p = Path(td)
    yield p
    shutil.rmtree(td, ignore_errors=True)


def test_live_clipper_update_detector_config(temp_session_dir):
    config = LiveConfig(
        channel="testchannel",
        platform="kick",
        permission_ack=True,
        detector=DetectorConfig(ratio_threshold=3.0, min_count=15),
    )
    session = LiveClipperSession(
        session_id="00000000-0000-0000-0000-000000000001",
        config=config,
        session_dir=temp_session_dir,
    )

    # Initial settings
    assert session.detector.config.ratio_threshold == 3.0
    assert session.detector.config.min_count == 15

    # Update to Aggressive (2.0x, 8 msgs)
    res = session.update_detector_config(
        ratio_threshold=2.0,
        min_count=8,
        cooldown_sec=60.0,
    )

    assert res["ratio_threshold"] == 2.0
    assert res["min_count"] == 8
    assert res["cooldown_sec"] == 60.0

    # Verify session in-memory state updated
    assert session.detector.config.ratio_threshold == 2.0
    assert session.detector.config.min_count == 8
    assert session.detector.cooldown_sec == 60.0

    # Verify clamping behavior (e.g. ratio < 1.2 clamped to 1.2, > 10 clamped to 10)
    res_clamped = session.update_detector_config(
        ratio_threshold=0.5,
        min_count=0,
    )
    assert res_clamped["ratio_threshold"] == 1.2
    assert res_clamped["min_count"] == 1
