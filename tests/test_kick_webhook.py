"""Unit tests for Kick webhook probe and signature verification (Phase 2 Part B Step 3a)."""
import hashlib
import hmac
import json
import urllib.request
import threading
import time
from http.server import HTTPServer

from live_clipper.probe_webhook import (
    verify_kick_signature,
    ProbeStats,
    KickProbeHandler,
)


def test_signature_verification_algorithm():
    """Verify HMAC-SHA256 signature computation and edge cases."""
    secret = "my_webhook_secret_key_123"
    body = b'{"event":"chat.message.sent","data":{"content":"LUL"}}'

    # Correct signature
    expected_hex = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    assert verify_kick_signature(body, expected_hex, secret) is True
    assert verify_kick_signature(body, f"sha256={expected_hex}", secret) is True
    assert verify_kick_signature(body, expected_hex.upper(), secret) is True

    # Bad signature
    assert verify_kick_signature(body, "bad_signature_value", secret) is False
    # Empty signature header
    assert verify_kick_signature(body, None, secret) is False
    assert verify_kick_signature(body, "", secret) is False
    # Tampered body
    tampered_body = b'{"event":"chat.message.sent","data":{"content":"TAMPERED"}}'
    assert verify_kick_signature(tampered_body, expected_hex, secret) is False


def test_probe_stats_rolling_counter():
    """ProbeStats correctly computes total and rolling 1-minute rate."""
    stats = ProbeStats()
    assert stats.get_summary()["total_received"] == 0
    assert stats.get_summary()["msgs_last_minute"] == 0

    # Record 5 messages
    for _ in range(5):
        stats.record_message()

    summary = stats.get_summary()
    assert summary["total_received"] == 5
    assert summary["msgs_last_minute"] == 5
    assert summary["signature_failures"] == 0

    stats.record_failure()
    assert stats.get_summary()["signature_failures"] == 1


def test_probe_server_handling():
    """Run an in-process probe server and test valid/invalid webhook POSTs."""
    secret = "test_secret_abc"
    KickProbeHandler.secret = secret
    KickProbeHandler.stats = ProbeStats()

    server = HTTPServer(("127.0.0.1", 0), KickProbeHandler)
    port = server.server_port

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        url = f"http://127.0.0.1:{port}/api/liveclipper/webhooks/kick"
        payload = json.dumps({
            "event": "chat.message.sent",
            "data": {
                "content": "Poggers moment",
                "sender": {"username": "tester1"},
            }
        }).encode("utf-8")

        # 1. Valid request
        sig = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Kick-Event-Signature": sig,
            },
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "ok"

        # 2. Invalid signature request -> 401
        bad_req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Kick-Event-Signature": "invalid_sig",
            },
            method="POST",
        )
        try:
            urllib.request.urlopen(bad_req)
            assert False, "Should have raised 401"
        except urllib.error.HTTPError as e:
            assert e.code == 401

        # 3. GET /stats
        stats_req = urllib.request.Request(f"http://127.0.0.1:{port}/stats", method="GET")
        with urllib.request.urlopen(stats_req) as resp:
            assert resp.status == 200
            stats_data = json.loads(resp.read().decode())
            assert stats_data["total_received"] == 1
            assert stats_data["signature_failures"] == 1

    finally:
        server.shutdown()
        server.server_close()
