from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from caption_looks import ASSETS, ASSET_IDS, STYLES, Look, Sticker, caption_ass, font_file, groups
from live_clipper.skipper import capture
from publishing_store import Store
from recut import transcript_words, virtual_transcript


def test_registry_and_assets():
    assert len(STYLES) == 12
    for key, style in STYLES.items():
        assert Look(captionStyleId=key).captionStyleId == key
        assert font_file(style).is_file()
        assert style['words'] >= 1
    assert all((ASSETS / f'{key}.png').is_file() for key in ASSET_IDS)
    with pytest.raises(ValidationError):
        Look(captionStyleId='missing')


def test_segment_fallback_and_recut():
    original = {
        'segments': [
            {'text': 'one two', 'start': 10, 'end': 12},
            {
                'text': 'three',
                'start': 12,
                'end': 14,
                'words': [{'word': 'three', 'start': 13.1, 'end': 13.8}],
            },
        ]
    }
    assert transcript_words(original)[-1]['s'] == 13.1
    result = virtual_transcript(original, [{'start': 10.5, 'end': 14}])
    assert transcript_words(result)[:2] == [
        {'w': 'one', 's': 0, 'e': 0.5},
        {'w': 'two', 's': 0.5, 'e': 1.5},
    ]


def test_grouping_render_and_empty_audio():
    words = [
        {'w': token, 's': i / 4, 'e': (i + 1) / 4}
        for i, token in enumerate(['hi', 'שלום', '💥!', 'w' * 200])
    ]
    assert [len(g) for g in groups(words, STYLES['trio'])] == [3, 1]
    for style in STYLES.values():
        assert 'Dialogue:' in caption_ass(words, style)
        assert 'Dialogue:' not in caption_ass([], style)
    assert r'\kf' in caption_ass(words, STYLES['karaoke'])
    assert '0:00:00.25' in caption_ass(words, STYLES['pixel'])


@pytest.mark.parametrize('patch', [{'asset': '../../private'}, {'end': 1}, {'x': 2}, {'start': -1}])
def test_sticker_validation(patch):
    with pytest.raises(ValidationError):
        Sticker(**(dict(id='a', asset='eyes', x=0.2, y=0.3, scale=0.1, start=1, end=2) | patch))


def test_skipper_freezes_look_for_each_capture(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    store = Store(tmp_path / 'output/.publishing')
    store.configure(
        {
            'skipper': True,
            'skipper_channel': 'test',
            'skipper_name': 'test',
            'skipper_look': Look(captionStyleId='pixel').model_dump(),
        }
    )
    clip = SimpleNamespace(
        id='a', session_id='s', clip_path='clip.mp4', start_t=0, end_t=3, score=1, duration=3
    )
    assert capture(clip, 'test', 'kick')
    store.configure({'skipper_look': Look(captionsEnabled=False).model_dump()})
    assert store.list()[0]['captionLook']['captionStyleId'] == 'pixel'
    assert store.list()[0]['captionLook']['captionsEnabled']


def test_export_sticker_visible_only_inside_interval(tmp_path):
    import shutil
    import subprocess
    from PIL import Image
    from caption_looks import composite

    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        pytest.skip('FFmpeg is required for this export test')
    source = tmp_path / 'source.mp4'
    output = tmp_path / 'output.mp4'
    subprocess.run(
        [
            'ffmpeg',
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            'color=black:s=160x284:r=25:d=1',
            '-c:v',
            'libx264',
            str(source),
        ],
        check=True,
    )
    sticker = Sticker(id='eyes', asset='eyes', x=0.5, y=0.5, scale=0.45, start=0.25, end=0.75)
    assert composite(source, output, [], Look(captionsEnabled=False), [sticker])
    for t, visible in [(0.12, False), (0.44, True), (0.88, False)]:
        pixels = subprocess.check_output(
            [
                'ffmpeg',
                '-v',
                'error',
                '-ss',
                str(t),
                '-i',
                str(output),
                '-frames:v',
                '1',
                '-pix_fmt',
                'rgb24',
                '-f',
                'rawvideo',
                '-',
            ]
        )
        assert (Image.frombytes('RGB', (160, 284), pixels).getextrema()[0][1] > 60) == visible
