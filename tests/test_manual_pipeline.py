"""Integration tests for manual mode pipeline and API endpoints."""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import jobs, ManualInputRequest, submit_manual_input, enqueue_output


class DummyRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}
        self.state = type("State", (), {})()


class DummyStream:
    def __init__(self, lines):
        self._lines = [line.encode("utf-8") + b"\n" for line in lines]
        self._idx = 0

    def readline(self):
        if self._idx < len(self._lines):
            line = self._lines[self._idx]
            self._idx += 1
            return line
        return b""

    def close(self):
        pass


class TestManualPipeline(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.job_id = "test_manual_job_123"
        jobs[self.job_id] = {
            "status": "processing",
            "logs": [],
            "output_dir": self.test_dir,
            "user_id": None,
            "mode": "manual",
        }

    def tearDown(self):
        jobs.pop(self.job_id, None)
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_enqueue_output_catches_awaiting_manual_input(self):
        prompt_pkg = {
            "prompt_text": "Sample prompt...",
            "video_duration": 60.0,
            "word_count": 50,
        }
        with open(os.path.join(self.test_dir, "manual_prompt.json"), "w", encoding="utf-8") as f:
            json.dump(prompt_pkg, f)

        stream = DummyStream([
            "Transcribing audio...",
            "AWAITING_MANUAL_INPUT",
            "Waiting for user...",
        ])

        enqueue_output(stream, self.job_id)

        self.assertEqual(jobs[self.job_id]["status"], "awaiting_prompt_input")
        self.assertIsNotNone(jobs[self.job_id].get("manual_prompt_package"))
        self.assertEqual(jobs[self.job_id]["manual_prompt_package"]["video_duration"], 60.0)

    async def test_submit_manual_input_resumes_job(self):
        jobs[self.job_id]["status"] = "awaiting_prompt_input"
        jobs[self.job_id]["manual_prompt_package"] = {"video_duration": 100.0}

        req = ManualInputRequest(
            raw_input="""```json
[
  {"start": 15.0, "end": 45.0, "viral_hook_text": "Mind blown 🔥", "video_title_for_youtube_short": "Awesome Tip"}
]
```"""
        )

        res = await submit_manual_input(self.job_id, req, DummyRequest())
        self.assertTrue(res["success"])
        self.assertEqual(res["clips_count"], 1)
        self.assertEqual(jobs[self.job_id]["status"], "processing")

        # Verify manual_input.json was written to output_dir
        input_file = os.path.join(self.test_dir, "manual_input.json")
        self.assertTrue(os.path.exists(input_file))
        with open(input_file, "r", encoding="utf-8") as f:
            saved = json.load(f)
        self.assertEqual(len(saved["shorts"]), 1)
        self.assertEqual(saved["shorts"][0]["start"], 15.0)
        self.assertEqual(saved["shorts"][0]["end"], 45.0)


if __name__ == "__main__":
    unittest.main()

