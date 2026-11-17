"""Small throwaway probe tool for Kick webhook reliability measurement (Phase 2 Part B Step 3a).

Receives Kick webhooks, verifies HMAC signatures, and prints messages received per
minute so the owner can send a known number of chat messages and measure how many arrive.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import hmac
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import sys
import threading
import time
from typing import List, Optional


def verify_kick_signature(raw_body: bytes, signature_header: Optional[str], secret: str) -> bool:
    """Verify HMAC-SHA256 signature from Kick webhook header.

    Supports raw hex strings, sha256= prefixes, and case-insensitive comparison.
    """
    if not secret:
        return True  # If no secret is configured, verification is bypassed
    if not signature_header:
        return False

    clean_sig = signature_header.strip()
    if clean_sig.startswith("sha256="):
        clean_sig = clean_sig[7:].strip()

    expected_sig = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(clean_sig.lower(), expected_sig.lower())


class ProbeStats:
    """Thread-safe statistics tracking rolling 1-minute throughput."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.total_received: int = 0
        self.timestamps: List[float] = []
        self.signature_failures: int = 0

    def record_message(self) -> int:
        now = time.time()
        with self.lock:
            self.total_received += 1
            self.timestamps.append(now)
            cutoff = now - 60.0
            self.timestamps = [t for t in self.timestamps if t >= cutoff]
            return len(self.timestamps)

    def record_failure(self) -> int:
        with self.lock:
            self.signature_failures += 1
            return self.signature_failures

    def get_summary(self) -> dict:
        now = time.time()
        with self.lock:
            cutoff = now - 60.0
            active = [t for t in self.timestamps if t >= cutoff]
            return {
                "total_received": self.total_received,
                "msgs_last_minute": len(active),
                "signature_failures": self.signature_failures,
            }


class KickProbeHandler(BaseHTTPRequestHandler):
    """HTTP request handler for Kick webhook probe."""

    stats = ProbeStats()
    secret = os.environ.get("KICK_WEBHOOK_SECRET", "")
    endpoint_path = "/api/liveclipper/webhooks/kick"

    def log_message(self, format, *args):
        # Suppress default noisy access logs to keep terminal output clean
        pass

    def do_GET(self):
        if self.path in ("/stats", "/health"):
            summary = self.stats.get_summary()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(summary).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        # Read payload
        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len)

        # Signature verification
        sig_header = (
            self.headers.get("Kick-Event-Signature")
            or self.headers.get("X-Kick-Signature")
            or self.headers.get("Kick-Signature")
        )

        is_valid = verify_kick_signature(raw_body, sig_header, self.secret)
        if not is_valid:
            fails = self.stats.record_failure()
            now_str = datetime.now().strftime("%H:%M:%S")
            print(f"[{now_str}] ❌ Signature verification FAILED (failures: {fails})")
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"invalid_signature"}')
            return

        # Parse event
        sender_name = "unknown"
        content_text = ""
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            event_data = payload.get("data") or payload
            sender = event_data.get("sender") or {}
            sender_name = sender.get("username") or sender.get("slug") or "anonymous"
            content_text = event_data.get("content") or event_data.get("message") or ""
        except Exception:
            pass

        rate_1m = self.stats.record_message()
        total = self.stats.total_received
        now_str = datetime.now().strftime("%H:%M:%S")

        # Display clean, informative progress line
        preview = (content_text[:40] + "...") if len(content_text) > 40 else content_text
        print(f"[{now_str}] 💬 {sender_name:<16} : {preview:<43} | 1m Rate: {rate_1m:<3} msgs/min | Total: {total}")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')


def run_probe(port: int = 8088, secret: str = "", path: str = "/api/liveclipper/webhooks/kick"):
    """Run the standalone probe server."""
    KickProbeHandler.secret = secret
    KickProbeHandler.endpoint_path = path

    server_address = ("", port)
    httpd = HTTPServer(server_address, KickProbeHandler)

    print("=" * 90)
    print(f"🚀 Kick Webhook Probe listening on http://0.0.0.0:{port}{path}")
    print(f"   Signature verification: {'ENABLED (HMAC-SHA256)' if secret else 'DISABLED (no secret supplied)'}")
    print(f"   Stats endpoint:         http://localhost:{port}/stats")
    print("   Send test chat messages to your Kick channel to measure arrival count and rate.")
    print("   Press Ctrl+C to stop and display final summary.")
    print("=" * 90)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping probe server...")
    finally:
        httpd.server_close()
        summary = KickProbeHandler.stats.get_summary()
        print("\n" + "=" * 50)
        print("📊 FINAL MEASUREMENT SUMMARY:")
        print(f"   Total Messages Received : {summary['total_received']}")
        print(f"   Signature Failures      : {summary['signature_failures']}")
        print("=" * 50)


def main():
    parser = argparse.ArgumentParser(description="Kick Webhook Probe & Reliability Meter")
    parser.add_argument("--port", type=int, default=8088, help="Port to listen on (default 8088)")
    parser.add_argument("--secret", type=str, default=os.environ.get("KICK_WEBHOOK_SECRET", ""), help="Kick webhook secret")
    parser.add_argument("--path", type=str, default="/api/liveclipper/webhooks/kick", help="Webhook path")
    args = parser.parse_args()

    run_probe(port=args.port, secret=args.secret, path=args.path)


if __name__ == "__main__":
    main()
