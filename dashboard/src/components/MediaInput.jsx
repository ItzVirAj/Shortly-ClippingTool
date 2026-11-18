import React, { useState, useEffect, useRef } from 'react';
import {
    Link2,
    Upload,
    FileVideo,
    X,
    Info,
    Loader2,
    ChevronDown,
    Sparkles,
    AlertCircle,
    Sliders,
    Layers,
    Clock,
    Check,
} from 'lucide-react';
import { track } from '../lib/analytics';
import { getApiUrl } from '../config';
import SourceCost from './SourceCost';
import WebcamBoxPicker from './WebcamBoxPicker';

const SUPPORTED_PLATFORMS = [
    'YouTube', 'Vimeo', 'TikTok', 'X / Twitter', 'Twitch', 'Kick',
    'Facebook', 'Instagram', 'Dailymotion', 'Reddit', 'Streamable',
];

const MIN_SOURCE_SECONDS = 45;

const readVideoDuration = (file) => new Promise((resolve) => {
    try {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.preload = 'metadata';
        const done = (d) => { URL.revokeObjectURL(url); resolve(d); };
        v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
        v.onerror = () => done(null);
        setTimeout(() => done(null), 8000);
        v.src = url;
    } catch { resolve(null); }
});

const readVideoFrame = (file) => new Promise((resolve) => {
    try {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        let finished = false;
        const finish = (dataUrl) => {
            if (finished) return;
            finished = true;
            URL.revokeObjectURL(url);
            resolve(dataUrl);
        };
        v.onloadedmetadata = () => {
            const target = Number.isFinite(v.duration) && v.duration > 3 ? Math.min(5, v.duration * 0.15) : 0.2;
            try { v.currentTime = target; } catch { finish(null); }
        };
        v.onseeked = () => {
            try {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 640 / Math.max(1, v.videoWidth || 640));
                canvas.width = Math.max(2, Math.round((v.videoWidth || 640) * scale));
                canvas.height = Math.max(2, Math.round((v.videoHeight || 360) * scale));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                finish(canvas.toDataURL('image/jpeg', 0.8));
            } catch { finish(null); }
        };
        v.onerror = () => finish(null);
        setTimeout(() => finish(null), 6000);
        v.src = url;
    } catch { resolve(null); }
});

export default function MediaInput({
    onProcess,
    isProcessing,
    processingMode: externalProcessingMode,
    onModeChange,
}) {
    const [youtubeUrlEnabled, setYoutubeUrlEnabled] = useState(true);
    const [mode, setMode] = useState('file'); // 'file' | 'url'
    const [url, setUrl] = useState('');
    const [file, setFile] = useState(null);
    const [fileSeconds, setFileSeconds] = useState(null);
    const fileTooShort = fileSeconds != null && fileSeconds < MIN_SOURCE_SECONDS;
    const [acknowledged, setAcknowledged] = useState(false);
    const [range, setRange] = useState(null);
    const [outputFormat, setOutputFormat] = useState('vertical'); // vertical | horizontal | square
    const [showInfo, setShowInfo] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [targetClips, setTargetClips] = useState('');
    const [clipMinSeconds, setClipMinSeconds] = useState('');
    const [clipMaxSeconds, setClipMaxSeconds] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);

    const [autoHook, setAutoHook] = useState(() => {
        try { return localStorage.getItem('os_auto_hook') !== '0'; } catch { return true; }
    });
    const [autoHookStyle, setAutoHookStyle] = useState(() => {
        try { return localStorage.getItem('os_auto_hook_style_v2') || 'pill'; } catch { return 'pill'; }
    });
    const [streamerName, setStreamerName] = useState(() => {
        try { return localStorage.getItem('os_streamer_name') || ''; } catch { return ''; }
    });
    const [mirrorVideo, setMirrorVideo] = useState(() => {
        try { return localStorage.getItem('os_mirror_video') === '1'; } catch { return false; }
    });
    const [webcamMode, setWebcamMode] = useState(() => {
        try { return localStorage.getItem('os_webcam_mode') || 'auto'; } catch { return 'auto'; }
    });
    const [webcamBox, setWebcamBox] = useState(() => {
        try {
            const raw = localStorage.getItem('os_webcam_box');
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    });
    const [autoPushYt, setAutoPushYt] = useState(() => {
        try { return localStorage.getItem('os_auto_push_yt') === '1'; } catch { return false; }
    });
    const [autoPushYtMode, setAutoPushYtMode] = useState(() => {
        try { return localStorage.getItem('os_auto_push_yt_mode') || 'review'; } catch { return 'review'; }
    });
    const [autoPushYtTitle, setAutoPushYtTitle] = useState(() => {
        try { return localStorage.getItem('os_auto_push_yt_title') || ''; } catch { return ''; }
    });
    const [autoPushYtDesc, setAutoPushYtDesc] = useState(() => {
        try { return localStorage.getItem('os_auto_push_yt_desc') || ''; } catch { return ''; }
    });
    const [autoPushYtPrivacy, setAutoPushYtPrivacy] = useState(() => {
        try { return localStorage.getItem('os_auto_push_yt_privacy') || 'public'; } catch { return 'public'; }
    });
    const [filePreviewFrame, setFilePreviewFrame] = useState(null);
    const [layout, setLayout] = useState(() => {
        try { return localStorage.getItem('os_layout') || 'auto'; } catch { return 'auto'; }
    });
    const [internalProcessingMode, setInternalProcessingMode] = useState(() => {
        try { return localStorage.getItem('os_processing_mode') || 'auto'; } catch { return 'auto'; }
    });
    const processingMode = externalProcessingMode || internalProcessingMode;
    const setProcessingMode = (newMode) => {
        setInternalProcessingMode(newMode);
        try { localStorage.setItem('os_processing_mode', newMode); } catch { /* ignore */ }
        onModeChange?.(newMode);
    };
    const [manualStyle, setManualStyle] = useState('viral');
    const infoRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        setFileSeconds(null);
        setFilePreviewFrame(null);
        if (!file) return undefined;
        readVideoDuration(file).then((d) => {
            if (cancelled) return;
            setFileSeconds(d);
            if (d != null && d < MIN_SOURCE_SECONDS) {
                track('SourceTooShort', { props: { seconds: String(Math.round(d)) } });
            }
        });
        readVideoFrame(file).then((frameUrl) => {
            if (!cancelled && frameUrl) setFilePreviewFrame(frameUrl);
        });
        return () => { cancelled = true; };
    }, [file]);

    useEffect(() => {
        fetch(getApiUrl('/api/config'))
            .then((r) => r.ok ? r.json() : null)
            .then((cfg) => {
                if (cfg && cfg.youtubeUrlEnabled === false) {
                    setYoutubeUrlEnabled(false);
                    setMode('file');
                }
            })
            .catch(() => { });
    }, []);

    useEffect(() => {
        let pending = null;
        try {
            pending = localStorage.getItem('os_pending_url');
            if (pending) localStorage.removeItem('os_pending_url');
        } catch { /* ignore */ }
        if (pending) {
            setMode('url');
            setUrl(pending);
        }
    }, []);

    useEffect(() => {
        if (!showInfo) return;
        const onClick = (e) => {
            if (infoRef.current && !infoRef.current.contains(e.target)) setShowInfo(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [showInfo]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!acknowledged) return;
        const advanced = {
            mode: processingMode,
            manualStyle: processingMode === 'manual' ? manualStyle : null,
            targetClips: targetClips || null,
            clipMinSeconds: clipMinSeconds || null,
            clipMaxSeconds: clipMaxSeconds || null,
            autoHook,
            autoHookStyle,
            streamer: streamerName.trim() || null,
            mirrorVideo,
            webcamMode,
            webcamBox: webcamMode === 'custom' ? webcamBox : null,
            autoPushYouTube: autoPushYt
                ? {
                    enabled: true,
                    mode: autoPushYtMode, // 'auto' | 'review'
                    title: autoPushYtTitle.trim(),
                    description: autoPushYtDesc.trim(),
                    privacy: autoPushYtPrivacy,
                }
                : null,
            layout,
            sourceStart: range ? Math.round(range.start) : null,
            sourceEnd: range ? Math.round(range.end) : null,
        };
        try {
            localStorage.setItem('os_processing_mode', processingMode);
            localStorage.setItem('os_auto_hook', autoHook ? '1' : '0');
            localStorage.setItem('os_auto_hook_style_v2', autoHookStyle);
            localStorage.setItem('os_streamer_name', streamerName);
            localStorage.setItem('os_mirror_video', mirrorVideo ? '1' : '0');
            localStorage.setItem('os_webcam_mode', webcamMode);
            if (webcamBox) localStorage.setItem('os_webcam_box', JSON.stringify(webcamBox));
            localStorage.setItem('os_auto_push_yt', autoPushYt ? '1' : '0');
            localStorage.setItem('os_auto_push_yt_mode', autoPushYtMode);
            localStorage.setItem('os_auto_push_yt_title', autoPushYtTitle);
            localStorage.setItem('os_auto_push_yt_desc', autoPushYtDesc);
            localStorage.setItem('os_auto_push_yt_privacy', autoPushYtPrivacy);
            localStorage.setItem('os_layout', layout);
        } catch { /* ignore */ }
        if (mode === 'url' && url) {
            onProcess({ type: 'url', payload: url, acknowledged: true, outputFormat, ...advanced });
        } else if (mode === 'file' && file && !fileTooShort) {
            onProcess({ type: 'file', payload: file, acknowledged: true, outputFormat, ...advanced });
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
            setMode('file');
        }
    };

    const formatSeconds = (s) => {
        if (!s) return '0s';
        const m = Math.floor(s / 60);
        const rem = Math.round(s % 60);
        return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
    };

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-7 items-start">
                {/* =========================================================
                    STAGE 1: SOURCE INGESTION (7 Columns)
                   ========================================================= */}
                <div className="lg:col-span-7 space-y-5">
                    {/* Apple Segmented Pill Switcher */}
                    <div
                        className="inline-flex p-1 rounded-full bg-black/40 border border-white/[0.08] backdrop-blur-2xl shadow-inner gap-1"
                        data-tutorial="source-tabs"
                    >
                        <button
                            type="button"
                            onClick={() => setMode('file')}
                            className={`flex items-center gap-2 py-2 px-5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer active:scale-[0.97] ${mode === 'file'
                                    ? 'bg-white/15 text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] border border-white/[0.16]'
                                    : 'text-white/60 hover:text-white/90 hover:bg-white/[0.04]'
                                }`}
                        >
                            <Upload size={13} className={mode === 'file' ? 'text-purple-400' : 'text-white/40'} />
                            <span>Upload Footage</span>
                        </button>

                        {youtubeUrlEnabled && (
                            <button
                                type="button"
                                onClick={() => setMode('url')}
                                className={`flex items-center gap-2 py-2 px-5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer active:scale-[0.97] ${mode === 'url'
                                        ? 'bg-white/15 text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] border border-white/[0.16]'
                                        : 'text-white/60 hover:text-white/90 hover:bg-white/[0.04]'
                                    }`}
                            >
                                <Link2 size={13} className={mode === 'url' ? 'text-purple-400' : 'text-white/40'} />
                                <span>Paste Stream Link</span>
                            </button>
                        )}
                    </div>

                    {/* Mode Content: File Upload or Stream URL */}
                    {mode === 'url' ? (
                        <div
                            className="bg-white/[0.04] border border-white/[0.08] border-t-white/[0.14] rounded-2xl p-4 sm:p-5 space-y-3 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.36)] transition-all"
                            data-tutorial="drop-zone"
                        >
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-white tracking-wide flex items-center gap-2">
                                    <Link2 size={13} className="text-purple-400" /> Video Stream URL
                                </label>
                                <p className="text-[11.5px] text-white/50">
                                    Paste a link from YouTube, Twitch, TikTok, Vimeo, X, or Reddit.
                                </p>
                            </div>

                            <div className="relative">
                                <input
                                    type="url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    className="w-full h-11 pl-4 pr-12 text-xs sm:text-sm rounded-xl border border-white/[0.1] bg-black/40 text-white placeholder-white/30 focus:border-purple-400/80 focus:ring-2 focus:ring-purple-400/20 focus:outline-none transition-all shadow-inner"
                                    required
                                />
                                <div className="absolute inset-y-0 right-2 flex items-center" ref={infoRef}>
                                    <button
                                        type="button"
                                        onClick={() => setShowInfo((v) => !v)}
                                        aria-label="Supported platforms"
                                        className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer"
                                    >
                                        <Info size={15} />
                                    </button>

                                    {showInfo && (
                                        <div className="absolute right-0 top-full mt-2 w-72 z-30 bg-[#161720]/95 backdrop-blur-2xl border border-white/[0.12] rounded-2xl p-4 text-left shadow-2xl animate-fade">
                                            <p className="text-xs font-semibold text-white mb-2">Supported Platforms</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {SUPPORTED_PLATFORMS.map((p) => (
                                                    <span
                                                        key={p}
                                                        className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/80 border border-white/[0.08] font-mono"
                                                    >
                                                        {p}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-[11px] text-white/40 mt-3 leading-relaxed">
                                                …and 1,000+ more sites. If a link has a public video stream, our pipeline can fetch it.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            data-tutorial="drop-zone"
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDrop}
                            className={`rounded-2xl border transition-all duration-300 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.36)] ${file
                                    ? 'bg-white/[0.04] border-white/[0.08] border-t-white/[0.14] p-4 sm:p-5 space-y-3'
                                    : isDragOver
                                        ? 'bg-white/[0.08] border-white/40 shadow-lg p-6 sm:p-8 text-center'
                                        : 'bg-white/[0.02] hover:bg-white/[0.04] border-dashed border-white/15 hover:border-white/30 p-6 sm:p-8 text-center'
                                }`}
                        >
                            {file ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-black/40 border border-white/[0.08] shadow-sm">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center shrink-0 text-purple-400">
                                                <FileVideo size={18} />
                                            </div>
                                            <div className="min-w-0 text-left">
                                                <p className="text-xs sm:text-sm font-medium text-white truncate max-w-xs sm:max-w-md">
                                                    {file.name}
                                                </p>
                                                <div className="flex items-center gap-2 text-[11px] text-white/50 font-mono mt-0.5">
                                                    <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                                                    {fileSeconds != null && (
                                                        <>
                                                            <span>·</span>
                                                            <span className="flex items-center gap-1 text-emerald-400">
                                                                <Clock size={11} /> {formatSeconds(fileSeconds)}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setFile(null)}
                                            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-all duration-150 cursor-pointer active:scale-[0.92]"
                                            title="Remove file"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>

                                    {fileTooShort && (
                                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-left text-xs text-amber-200">
                                            <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-400" />
                                            <p className="leading-relaxed">
                                                This video is {Math.round(fileSeconds)}s long. Clip generation requires at least {MIN_SOURCE_SECONDS}s of source footage to analyze and extract viral segments.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <label className="cursor-pointer block select-none group">
                                    <input
                                        type="file"
                                        accept="video/*"
                                        onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
                                        className="hidden"
                                    />
                                    <div className="w-11 h-11 rounded-xl bg-white/[0.05] border border-white/[0.1] shadow-sm flex items-center justify-center text-white/70 group-hover:scale-105 group-hover:text-purple-400 group-hover:border-purple-400/40 transition-all duration-200 mx-auto mb-2.5">
                                        <Upload size={18} className="text-purple-400" />
                                    </div>
                                    <p className="text-xs sm:text-sm font-medium text-white tracking-[-0.01em]">
                                        Drop video file here, or <span className="text-purple-400 hover:text-purple-300 underline underline-offset-4 decoration-purple-400/40">browse files</span>
                                    </p>
                                    <p className="text-[11px] text-white/40 mt-1 font-normal">
                                        MP4, MOV, WebM · Up to 500MB · Minimum {MIN_SOURCE_SECONDS}s of source video
                                    </p>
                                </label>
                            )}
                        </div>
                    )}

                    {/* Source Range & Cost Breakdown */}
                    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 backdrop-blur-xl">
                        <SourceCost
                            mode={mode}
                            url={url}
                            fileSeconds={fileSeconds}
                            range={range}
                            onRangeChange={setRange}
                        />
                    </div>
                </div>

                {/* =========================================================
                    STAGE 2: APPLE-STYLE PRO INSPECTOR (5 Columns)
                   ========================================================= */}
                <div className="lg:col-span-5 space-y-3">
                    <div className="bg-white/[0.04] border border-white/[0.08] border-t-white/[0.16] rounded-2xl p-4 sm:p-5 space-y-3.5 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
                        {/* 1. AI Processing Mode: Auto (Gemini API) vs Free / Manual (BYO-Agent) */}
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-white tracking-wide flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-purple-400" /> AI Processing Mode
                                </p>
                                <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full ${processingMode === 'manual'
                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                        : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                    }`}>
                                    {processingMode === 'manual' ? 'Zero Cost · BYO Agent' : 'Autonomous'}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setProcessingMode('auto')}
                                    className={`p-3 rounded-2xl border flex flex-col items-start gap-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${processingMode === 'auto'
                                            ? 'border-purple-400/80 bg-purple-500/15 text-white shadow-sm'
                                            : 'border-white/[0.08] bg-black/30 text-white/60 hover:border-white/20 hover:text-white'
                                        }`}
                                >
                                    <div className="flex items-center gap-1.5 font-medium text-xs text-white">
                                        <span>⚡ Auto Mode</span>
                                    </div>
                                    <span className="text-[10.5px] text-white/50 text-left leading-tight">Gemini API picks clips</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setProcessingMode('manual')}
                                    className={`p-3 rounded-2xl border flex flex-col items-start gap-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${processingMode === 'manual'
                                            ? 'border-emerald-400/80 bg-emerald-500/15 text-white shadow-sm'
                                            : 'border-white/[0.08] bg-black/30 text-white/60 hover:border-white/20 hover:text-white'
                                        }`}
                                >
                                    <div className="flex items-center gap-1.5 font-medium text-xs text-emerald-400">
                                        <span>📋 Free / Manual</span>
                                    </div>
                                    <span className="text-[10.5px] text-white/50 text-left leading-tight">Free · Use ChatGPT/Claude</span>
                                </button>
                            </div>

                            {processingMode === 'manual' && (
                                <div className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 space-y-2 backdrop-blur-md animate-fade">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-emerald-300 font-medium">Prompt Editorial Style:</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                                        {[
                                            { id: 'viral', label: '🔥 Viral Retention' },
                                            { id: 'educational', label: '🧠 Educational' },
                                            { id: 'story', label: '🎭 Story & Drama' },
                                            { id: 'humor', label: '😂 Punchlines' },
                                        ].map((style) => (
                                            <button
                                                key={style.id}
                                                type="button"
                                                onClick={() => setManualStyle(style.id)}
                                                className={`py-1.5 px-2.5 rounded-xl text-[11px] font-medium transition-all duration-150 text-left active:scale-[0.97] cursor-pointer ${manualStyle === style.id
                                                        ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                                                        : 'bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1]'
                                                    }`}
                                            >
                                                {style.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2. Output Aspect Ratio */}
                        <div data-tutorial="output-format" className="space-y-3">
                            <p className="text-xs font-semibold text-white tracking-wide flex items-center gap-1.5">
                                <Layers size={13} className="text-purple-400" /> Output Aspect Ratio
                            </p>
                            <div className="grid grid-cols-3 gap-2.5">
                                {[
                                    { value: 'vertical', label: '9:16', hint: 'Shorts · Reels', w: 14, h: 26 },
                                    { value: 'square', label: '1:1', hint: 'Square Feed', w: 20, h: 20 },
                                    { value: 'horizontal', label: '16:9', hint: 'Landscape', w: 26, h: 14 },
                                ].map((f) => {
                                    const active = outputFormat === f.value;
                                    return (
                                        <button
                                            key={f.value}
                                            type="button"
                                            onClick={() => setOutputFormat(f.value)}
                                            className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all duration-150 cursor-pointer active:scale-[0.97] ${active
                                                    ? 'border-purple-400/80 bg-purple-500/15 text-white shadow-sm font-medium'
                                                    : 'border-white/[0.08] bg-black/30 text-white/60 hover:border-white/20 hover:text-white'
                                                }`}
                                        >
                                            <span
                                                className="rounded-[3px] border-2 transition-colors"
                                                style={{
                                                    width: `${f.w}px`,
                                                    height: `${f.h}px`,
                                                    borderColor: active ? '#c084fc' : 'rgba(255, 255, 255, 0.25)',
                                                    backgroundColor: active ? 'rgba(192, 132, 252, 0.25)' : 'transparent',
                                                }}
                                            />
                                            <span className="font-mono text-xs font-semibold leading-none">{f.label}</span>
                                            <span className="text-[10px] text-white/40 text-center leading-tight truncate w-full">{f.hint}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. Apple Inset Grouped Parameters List */}
                        <div className="pt-2 border-t border-white/[0.08] space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-white tracking-wide flex items-center gap-1.5">
                                    <Sliders size={13} className="text-purple-400" /> AI Parameters
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setShowAdvanced((v) => !v)}
                                    className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer flex items-center gap-1 font-medium transition-colors"
                                >
                                    <span>{showAdvanced ? 'Simple' : 'Fine-tune'}</span>
                                    <ChevronDown size={13} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
                                </button>
                            </div>

                            {/* Inset Group Container */}
                            <div className="rounded-2xl bg-black/30 border border-white/[0.08] overflow-hidden divide-y divide-white/[0.06] backdrop-blur-md">
                                {/* Speaker Layout Row */}
                                <div className="p-3 sm:px-4 space-y-1.5">
                                    <label className="text-[11px] font-medium text-white/70 block">Vertical Speaker Layout</label>
                                    <select
                                        value={layout}
                                        onChange={(e) => setLayout(e.target.value)}
                                        className="w-full h-9 px-3 text-xs rounded-xl border border-white/[0.1] bg-[#161720] text-white focus:border-purple-400 focus:outline-none cursor-pointer"
                                    >
                                        <option value="auto">Auto (AI detects speaker framing)</option>
                                        <option value="streamer_top">Streamer Top / Stream Bottom (Gaming Shorts)</option>
                                        <option value="streamer_bottom">Stream Top / Streamer Bottom (Reaction / Tutorial)</option>
                                        <option value="split">Two speakers stacked (Split view)</option>
                                        <option value="screencast">Screen over presenter (Screencast)</option>
                                        <option value="none">Single centered crop only</option>
                                    </select>
                                </div>

                                {/* Streamer Webcam Corner / Tracing Box Row */}
                                {outputFormat === 'vertical' && ['auto', 'streamer_top', 'streamer_bottom'].includes(layout) && (
                                    <div className="p-3 sm:px-4">
                                        <WebcamBoxPicker
                                            compact
                                            mode={webcamMode}
                                            box={webcamBox}
                                            previewSrc={mode === 'file' ? filePreviewFrame : null}
                                            onChange={({ webcam_mode: nextMode, webcam_box: nextBox }) => {
                                                setWebcamMode(nextMode);
                                                if (nextBox !== undefined) setWebcamBox(nextBox);
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Auto-Hook Titles Row with Apple Toggle Switch */}
                                <div className="p-3 sm:px-4 space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <label className="relative inline-flex items-center cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={autoHook}
                                                    onChange={(e) => setAutoHook(e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-10 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 shadow-inner" />
                                            </label>
                                            <span className="text-xs font-medium text-white select-none">Auto-Hook Titles</span>
                                        </div>

                                        {autoHook && (
                                            <select
                                                value={autoHookStyle}
                                                onChange={(e) => setAutoHookStyle(e.target.value)}
                                                className="h-7 px-2.5 text-[11px] rounded-lg border border-white/[0.1] bg-[#161720] text-white focus:outline-none cursor-pointer"
                                            >
                                                <option value="pill">Pills</option>
                                                <option value="cyan_glow">Neon Cyan (Gamer)</option>
                                                <option value="classic">Classic</option>
                                                <option value="dark">Dark</option>
                                                <option value="yellow">Yellow</option>
                                                <option value="red">Red</option>
                                                <option value="outline">Outline</option>
                                                <option value="outline_yellow">Outline+</option>
                                            </select>
                                        )}
                                    </div>
                                    {autoHook && (
                                        <input
                                            type="text"
                                            value={streamerName}
                                            onChange={(e) => setStreamerName(e.target.value)}
                                            placeholder="Streamer name for 3-4 word hooks (auto-detected on links)"
                                            className="w-full h-8 px-2.5 text-[11.5px] rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/35 focus:border-[#e31084] focus:outline-none"
                                        />
                                    )}
                                </div>

                                {/* Mirror Video Row (flipped before subtitles) */}
                                <div className="p-3 sm:px-4 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={mirrorVideo}
                                                onChange={(e) => setMirrorVideo(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-10 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#e31084] shadow-inner" />
                                        </label>
                                        <div className="min-w-0">
                                            <span className="text-xs font-medium text-white select-none block">Mirror Video</span>
                                            <span className="text-[10.5px] text-white/45 block leading-tight">
                                                Flip horizontally before subtitles (captions stay normal)
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Auto-Push to YouTube Automation Row */}
                                <div className="p-3 sm:px-4 space-y-2.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={autoPushYt}
                                                    onChange={(e) => setAutoPushYt(e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-10 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#e31084] shadow-inner" />
                                            </label>
                                            <div className="min-w-0">
                                                <span className="text-xs font-medium text-white select-none block">Auto-Push to YouTube</span>
                                                <span className="text-[10.5px] text-white/45 block leading-tight">
                                                    Direct YouTube upload when Studio clips finish (no Live Clipper pipeline)
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {autoPushYt && (
                                        <div className="space-y-2.5 pt-1 pl-1 animate-fade">
                                            <div className="grid grid-cols-2 p-1 rounded-xl bg-black/40 border border-white/10 gap-1 text-[11px]">
                                                <button
                                                    type="button"
                                                    onClick={() => setAutoPushYtMode('review')}
                                                    className={`py-1.5 px-2 rounded-lg font-medium transition-all cursor-pointer ${
                                                        autoPushYtMode === 'review'
                                                            ? 'bg-white/15 text-white border border-white/20'
                                                            : 'text-white/55 hover:text-white border border-transparent'
                                                    }`}
                                                >
                                                    Tick &amp; Ask Title/Desc
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAutoPushYtMode('auto')}
                                                    className={`py-1.5 px-2 rounded-lg font-medium transition-all cursor-pointer ${
                                                        autoPushYtMode === 'auto'
                                                            ? 'bg-[#e31084]/25 text-pink-100 border border-[#e31084]/45'
                                                            : 'text-white/55 hover:text-white border border-transparent'
                                                    }`}
                                                >
                                                    Auto-Upload Immediately
                                                </button>
                                            </div>

                                            {autoPushYtMode === 'auto' && (
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        maxLength={100}
                                                        value={autoPushYtTitle}
                                                        onChange={(e) => setAutoPushYtTitle(e.target.value)}
                                                        placeholder="Title (leave blank to use clip/default title) 😱"
                                                        className="w-full h-8 px-2.5 text-xs rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/35 focus:border-[#e31084] focus:outline-none"
                                                    />
                                                    <div className="flex flex-wrap gap-1">
                                                        {['😱', '🔥', '💀', '🚨', '🎮', '🤯'].map((em) => (
                                                            <button
                                                                key={em}
                                                                type="button"
                                                                onClick={() => setAutoPushYtTitle((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${em}`.slice(0, 100))}
                                                                className="w-6 h-6 rounded-md bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-xs flex items-center justify-center cursor-pointer active:scale-90"
                                                                title={`Add ${em} to title`}
                                                            >
                                                                {em}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <textarea
                                                        rows={2}
                                                        maxLength={5000}
                                                        value={autoPushYtDesc}
                                                        onChange={(e) => setAutoPushYtDesc(e.target.value)}
                                                        placeholder="Description & #hashtags (blank uses .env default)…"
                                                        className="w-full p-2 text-xs rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/35 focus:border-[#e31084] focus:outline-none resize-none"
                                                    />
                                                    <select
                                                        value={autoPushYtPrivacy}
                                                        onChange={(e) => setAutoPushYtPrivacy(e.target.value)}
                                                        className="w-full h-8 px-2.5 text-xs rounded-lg bg-[#161720] border border-white/10 text-white focus:outline-none cursor-pointer"
                                                    >
                                                        <option value="public">Public</option>
                                                        <option value="unlisted">Unlisted</option>
                                                        <option value="private">Private</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Fine-Tuning Drawer */}
                                {showAdvanced && (
                                    <div className="p-3 sm:px-4 space-y-3 bg-white/[0.02] animate-fade">
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <label className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Clips Count</label>
                                                <input
                                                    type="number" min="1" max="15" step="1"
                                                    value={targetClips}
                                                    onChange={(e) => setTargetClips(e.target.value)}
                                                    placeholder="Auto"
                                                    className="w-full h-8 px-2 text-xs rounded-xl border border-white/[0.1] bg-black/40 text-white focus:outline-none text-center"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Min Sec</label>
                                                <input
                                                    type="number" min="15" max="180" step="5"
                                                    value={clipMinSeconds}
                                                    onChange={(e) => setClipMinSeconds(e.target.value)}
                                                    placeholder="15s"
                                                    className="w-full h-8 px-2 text-xs rounded-xl border border-white/[0.1] bg-black/40 text-white focus:outline-none text-center"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Max Sec</label>
                                                <input
                                                    type="number" min="30" max="300" step="5"
                                                    value={clipMaxSeconds}
                                                    onChange={(e) => setClipMaxSeconds(e.target.value)}
                                                    placeholder="60s"
                                                    className="w-full h-8 px-2 text-xs rounded-xl border border-white/[0.1] bg-black/40 text-white focus:outline-none text-center"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10.5px] text-white/40 leading-tight">
                                            Duration guidelines for clips. Leave blank to allow Gemini to maximize retention.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 4. Rights Confirmation & Primary Launch CTA */}
                        <div className="pt-2 border-t border-white/[0.08] space-y-4">
                            <label className="flex items-start gap-3 text-left text-[11px] leading-relaxed text-white/50 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={acknowledged}
                                    onChange={(e) => setAcknowledged(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 shrink-0 rounded accent-purple-600 cursor-pointer"
                                />
                                <span>
                                    I confirm I own or have rights to process this video footage. See our <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white underline underline-offset-2" onClick={(e) => e.stopPropagation()}>Terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white underline underline-offset-2" onClick={(e) => e.stopPropagation()}>Privacy</a>.
                                </span>
                            </label>

                            <button
                                type="submit"
                                data-tutorial="generate"
                                disabled={isProcessing || !acknowledged || (mode === 'url' && !url) || (mode === 'file' && (!file || fileTooShort))}
                                className="relative overflow-hidden w-full h-12 rounded-2xl font-medium text-sm flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-[0_4px_24px_rgba(227,16,132,0.35)] bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 text-white disabled:opacity-40 disabled:cursor-not-allowed border-t border-white/20"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin text-white" />
                                        <span>Processing Video Pipeline...</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={16} />
                                        <span>Generate Viral Clips</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
}
