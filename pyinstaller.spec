# -*- mode: python ; coding: utf-8 -*-

import sys
import os
import dis

# Fix Python 3.10.0 standard library bug (bpo-45434) where extended_arg was not reset on op < HAVE_ARGUMENT (e.g. NOP)
def _fixed_unpack_opargs(code):
    extended_arg = 0
    for i in range(0, len(code), 2):
        op = code[i]
        if op >= dis.HAVE_ARGUMENT:
            arg = code[i+1] | extended_arg
            extended_arg = (arg << 8) if op == dis.EXTENDED_ARG else 0
        else:
            arg = None
            extended_arg = 0
        yield (i, op, arg)

dis._unpack_opargs = _fixed_unpack_opargs

block_cipher = None

from PyInstaller.utils.hooks import collect_data_files

added_files = [
    ('manual_prompt_builder.py', '.'),
    ('manual_parser.py', '.'),
    ('main.py', '.'),
    ('quality_probe.py', '.'),
    ('yt_oauth.py', '.'),
    ('yolov8n.pt', '.'),
] + collect_data_files('mediapipe') + collect_data_files('faster_whisper')

hidden_imports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'starlette',
    'starlette.routing',
    'starlette.responses',
    'pydantic',
    'faster_whisper',
    'google.genai',
    'manual_prompt_builder',
    'manual_parser',
    'main',
    'quality_probe',
    'yt_oauth',
]

a = Analysis(
    ['app.py'],
    pathex=['.'],
    binaries=[],
    datas=added_files,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='shortly-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='shortly-backend',
)
