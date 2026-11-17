"""Exercise the actual FFmpeg filtergraph, including literal punctuation."""
import subprocess
import shutil
import pytest
from PIL import Image
from clip_text_overlays import apply_text_overlays

@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg required')
@pytest.mark.parametrize('font', ['anton', 'montserrat', 'inter'])
def test_render_literal_text_preserves_audio(tmp_path, font):
    source, output = str(tmp_path / 'source.mp4'), str(tmp_path / 'output.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i',
                    'color=c=black:s=360x640:d=0.2', '-f', 'lavfi', '-i',
                    'sine=frequency=440:duration=0.2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', source], check=True)
    assert apply_text_overlays(source, output, [{
        'text': "It's 100%: [hello], \\ world\nSecond line", 'font_id': font,
        'font_size': 45, 'x_pct': 0.5, 'y_pct': 0.5, 'color': '#ffffff',
        'bg_color': '#ff0000', 'bg_opacity': 0.5,
    }])
    frame = str(tmp_path / 'frame.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', output, '-frames:v', '1', frame], check=True)
    image = Image.open(frame).convert('RGB')
    assert image.size == (360, 640)
    assert sum(max(image.getpixel((x, y))) > 100 for y in range(image.height) for x in range(image.width)) > 100
    audio = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', output])
    assert b'aac' in audio
