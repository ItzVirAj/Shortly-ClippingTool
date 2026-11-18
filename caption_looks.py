"""Shortly caption and sticker compositor. All times are clip-relative seconds."""
import json
import math
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Literal

from PIL import ImageFont
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ffmpeg_utils import QUALITY, video_encode_args

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'dashboard/public/captions'
STYLES = {s['id']: s for s in json.loads((ASSETS / 'captionStyles.json').read_text())}
ASSET_IDS = frozenset(json.loads((ASSETS / 'stickers.json').read_text()))


class Controls(BaseModel):
    model_config = ConfigDict(extra='forbid')
    size: int | None = Field(None, ge=30, le=120)
    position: Literal['top', 'center', 'bottom'] | None = None
    highlight: str | None = Field(None, pattern=r'^#[0-9a-fA-F]{6}$')
    words: int | None = Field(None, ge=1, le=18)


class Look(BaseModel):
    captionsEnabled: bool = True
    captionStyleId: str = 'trio'
    captionSettings: Controls = Field(default_factory=Controls)

    @field_validator('captionStyleId')
    @classmethod
    def known(cls, value):
        if value not in STYLES:
            raise ValueError('Unknown caption look')
        return value


class Sticker(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=100)
    asset: str
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    scale: float = Field(ge=.05, le=.6)
    start: float = Field(ge=0)
    end: float = Field(gt=0)

    @model_validator(mode='after')
    def valid(self):
        if self.asset not in ASSET_IDS or self.end <= self.start:
            raise ValueError('Invalid sticker asset or time range')
        return self


def font_file(style):
    filename = style['file']
    return next(p for p in (ASSETS / filename, ROOT / 'fonts' / filename) if p.is_file())


@lru_cache(maxsize=100)
def font(path, size):
    return ImageFont.truetype(str(path), size)


def groups(words, style):
    group = []
    for word in words:
        if group and (len(group) >= style['words'] or word['s'] - group[-1]['e'] > .55
                      or group[-1]['w'].endswith(('.', '!', '?', '。', '！', '？'))):
            yield group
            group = []
        group.append(word)
    if group:
        yield group


def ass_time(sec):
    cs = max(0, round(sec * 100))
    return f'{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}'


def color(hex_value):
    return '&H' + hex_value[5:7] + hex_value[3:5] + hex_value[1:3] + '&'


def caption_ass(words, style, ratio=9/16):
    """Use fixed design-width coordinates with the output's native aspect ratio."""
    height = round(1080 / ratio)
    y = round(height * {'top': .2, 'center': .5, 'bottom': .75}[style['position']])
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,{style['font']},{style['size']},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00777777,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    events = []
    def event(start, end, tags, text, layer=1):
        if ass_time(start) != ass_time(end):
            events.append(f'Dialogue: {layer},{ass_time(start)},{ass_time(end)},Main,,0,0,0,,{{{tags}}}{text}')
    for group in groups(words, style):
        def label(word):
            text = word['w'].strip()
            if style['case'] == 'upper':
                text = text.upper()
            if style['case'] == 'lower':
                text = text.lower()
            # Transcript text must never become an ASS override or escape.
            return text.replace('\\', '＼').replace('{', '｛').replace('}', '｝').replace('\n', ' ')
        labels = list(map(label, group))
        size = style['size']
        face = font(font_file(style), size)
        # Wrap at word boundaries, shrinking only for unbreakable words.
        longest = max(face.getlength(t) for t in labels)
        size = max(1, min(size, math.floor(size * 875 / max(1, longest))))
        face = font(font_file(style), size)
        lines = [[]]
        for index, text in enumerate(labels):
            candidate = ' '.join([labels[i] for i in lines[-1]] + [text])
            if lines[-1] and face.getlength(candidate) > 875:
                lines.append([])
            lines[-1].append(index)
        for active, word in enumerate(group):
            start = word['s']
            end = group[active + 1]['s'] if active + 1 < len(group) else word['e']
            if end <= start:
                continue
            duration = max(1, round((end-start)*100))
            for line_no, line in enumerate(lines):
                cy = round(y + (line_no - (len(lines)-1)/2) * size * 1.22)
                tags = rf"\pos(540,{cy})\fs{size}\i{int(style['italic'])}\bord{style['stroke']}\shad{style['shadow']}\3c{color(style['outline'])}"
                if style['glow']:
                    tags += rf"\blur{style['glow']}"
                if style['animation'] in ('pop', 'punch'):
                    initial = 75 if style['animation'] == 'pop' else 115
                    tags += rf"\fscx{initial}\fscy{initial}\t(0,110,\fscx100\fscy100)"
                parts = []
                for idx in line:
                    text = labels[idx]
                    current = idx == active
                    fill = style['highlight'] if current else style['fill']
                    overrides = rf'\1c{color(fill)}'
                    if current and style['box']:
                        overrides += rf"\bord5\3c{color(style['box'])}"
                        width = face.getlength(' '.join(labels[i] for i in line))
                        prefix = ''.join(labels[i]+' ' for i in line if i < idx)
                        left = round(540-width/2+face.getlength(prefix)-6)
                        w, h = round(face.getlength(text)+12), round(size*1.15)
                        event(start,end,rf"\an7\pos({left},{cy-h//2})\p1\bord0\shad0\1c{color(style['box'])}",
                              f'm 6 0 l {w-6} 0 q {w} 0 {w} 6 l {w} {h-6} l {w-5} {h} 5 {h} 0 {h-5} 0 5',0)
                    if style.get('gradient'):
                        n = max(1,len(text)-1)
                        def tint(j):
                            a,b=style['fill'],style['gradient']
                            return '#' + ''.join(f'{round(int(a[k:k+2],16)*(1-j/n)+int(b[k:k+2],16)*j/n):02x}' for k in (1,3,5))
                        text = ''.join(r'{\1c'+color(tint(j))+'}'+ch for j,ch in enumerate(text))
                        overrides += rf'\u{int(current)}'
                    if current and style['animation'] == 'sweep':
                        overrides += rf"\2c{color(style['fill'])}\kf{duration}"
                    if style['animation'] == 'typewriter':
                        if idx > active:
                            text = ''
                        elif current:
                            text = ''.join(r'{\k'+str(round((j+1)*duration/len(text))-round(j*duration/len(text)))+'}'+ch for j,ch in enumerate(text))
                            overrides += r'\2a&HFF&'
                    parts.append('{'+overrides+'}'+text+r'{\rMain'+tags+'}')
                event(start,end,tags,' '.join(parts))
    return header+'\n'.join(events)+'\n'


def composite(source, target, words, look, stickers):
    """Encode overlays in one pass, preserving the original audio stream."""
    source, target = Path(source).resolve(), Path(target).resolve()
    dims = subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries',
                                    'stream=width,height','-of','csv=p=0:s=x',str(source)],text=True)
    width,height = map(int,dims.strip().split('x'))
    with tempfile.TemporaryDirectory() as tmp:
        cwd = Path(tmp)
        filters, inputs = [], []
        video = '[0:v]'
        if look and look.captionsEnabled and words:
            style = STYLES[look.captionStyleId] | look.captionSettings.model_dump(exclude_none=True)
            (cwd/'fonts').mkdir()
            shutil.copy(font_file(style), cwd/'fonts')
            (cwd/'look.ass').write_text(caption_ass(words,style,width/height),encoding='utf-8')
            filters.append(video+"ass=look.ass:fontsdir=fonts[captioned]")
            video = '[captioned]'
        for idx, sticker in enumerate(stickers,1):
            inputs.extend(['-loop','1','-framerate','30','-i',str(ASSETS/(sticker.asset+'.png'))])
            px = max(2,round(width*sticker.scale))
            filters.append(f"[{idx}:v]scale=w='max(2,{px}*min(1,0.7+2.5*max(0,t-{sticker.start})))':h=-1:eval=frame[s{idx}]")
            filters.append(f"{video}[s{idx}]overlay=x='W*{sticker.x}-w/2':y='H*{sticker.y}-h/2':shortest=1:enable='gte(t,{sticker.start})*lt(t,{sticker.end})'[v{idx}]")
            video=f'[v{idx}]'
        if not filters:
            return False
        subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(source),*inputs,'-filter_complex_threads','1',
                        '-filter_complex',';'.join(filters),'-map',video,'-map','0:a?',*video_encode_args(QUALITY),
                        '-c:a','copy','-movflags','+faststart',str(target)],cwd=cwd,check=True,timeout=1800)
    return True
