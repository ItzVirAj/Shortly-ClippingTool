import pytest

from live_clipper import caption_filter


def source():
    segments = [
        {"start": i, "end": i + 1, "text": text,
         "words": [{"word": text, "start": i + 0.05, "end": i + 0.9}]}
        for i, text in enumerate([" Bro, run!", " All units, dispatch here.", " Wait—"])
    ]
    return {"segments": segments, "language": "en", "source": "/local/private.mp4"}


def test_filter_projects_subtitles_only_and_keeps_original_records(monkeypatch):
    transcript = source()
    def review(phrases, key):
        assert phrases == [dict(id=i, start=i, end=i+1, text=s["text"])
                           for i, s in enumerate(transcript["segments"])]
        return {"hide_ids": [1]}
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setattr(caption_filter, "_ask_gemini", review)
    out = caption_filter.caption_transcript(transcript)
    assert len(transcript["segments"]) == 3
    assert len(out["segments"]) == 2
    assert out["segments"][0] is transcript["segments"][0]
    assert out["segments"][1] is transcript["segments"][2]


@pytest.mark.parametrize("answer", [{"hide_ids": [0, 99]}, {"hide_ids": [True]},
                                    {"text": "replacement"}, {"hide_ids": []}, None])
def test_invalid_or_empty_decision_keeps_all(monkeypatch, answer):
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setattr(caption_filter, "_ask_gemini", lambda *args: answer)
    transcript = source()
    assert caption_filter.caption_transcript(transcript) is transcript


def test_missing_key_and_timeout_keep_subtitles(monkeypatch):
    transcript = source()
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    def timeout(*args):
        raise TimeoutError
    monkeypatch.setattr(caption_filter, "_ask_gemini", timeout)
    assert caption_filter.caption_transcript(transcript) is transcript
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    assert caption_filter.caption_transcript(transcript) is transcript


@pytest.mark.parametrize("custom,hidden", [(True, [1]), (False, [1]), (False, [0, 1, 2])])
def test_render_filters_burned_captions_and_preserves_metadata(monkeypatch, tmp_path, custom, hidden):
    import json
    import sys
    from pathlib import Path
    from types import SimpleNamespace
    from live_clipper import skipper

    transcript = source()
    burned = []
    def words(data):
        return [w for seg in data["segments"] for w in seg["words"]]
    def default_render(path, data, *_):
        burned.extend(words(data))
        return path
    def composite(src, target, visible, *_):
        burned.extend(visible)
        return False
    def frame(src, target, platform):
        Path(target).write_bytes(b"fixture")
        return True
    monkeypatch.setitem(sys.modules, "main", SimpleNamespace(
        transcribe_video=lambda _: transcript, auto_caption_clip=default_render, apply_brand_frame=frame))
    monkeypatch.setitem(sys.modules, "recut", SimpleNamespace(transcript_words=words))
    monkeypatch.setitem(sys.modules, "caption_looks", SimpleNamespace(
        Look=SimpleNamespace(model_validate=lambda _: SimpleNamespace(captionsEnabled=True)), composite=composite))
    monkeypatch.setattr(skipper, "_probe_video_size", lambda _: (1080, 1920))
    monkeypatch.setattr(skipper.subprocess, "run", lambda *a, **kw: None)
    monkeypatch.setattr(skipper.subprocess, "check_output", lambda *a, **kw: "1")
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setattr(caption_filter, "_ask_gemini", lambda *_: {"hide_ids": hidden})
    item = dict(id="1", source="clip.mp4", duration=3, platform="kick",
                captionLook={"captionsEnabled": True} if custom else None)
    result = skipper.render(item, tmp_path)
    assert burned == [w for i, seg in enumerate(transcript["segments"]) if i not in hidden for w in seg["words"]]
    assert json.loads((tmp_path / "live/1/transcript.json").read_text()) == transcript
    assert result["status"] == "metadata"
