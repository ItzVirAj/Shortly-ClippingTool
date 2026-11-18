import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    MoveVertical,
    RotateCcw,
    Type,
    Sparkles,
    Frame,
    X,
    Maximize2,
    Check,
} from 'lucide-react';

const HOOK_PRESETS = [
    { id: 'auto', label: 'Auto', y: 0.18 },
    { id: 'very_top', label: 'Very Top', y: 0.06 },
    { id: 'top', label: 'Upper', y: 0.20 },
    { id: 'center', label: 'Center', y: 0.50 },
];

const SUBTITLE_PRESETS = [
    { id: 'auto', label: 'Auto', y: 0.84 },
    { id: 'bottom', label: 'Bottom', y: 0.84 },
    { id: 'middle', label: 'Middle', y: 0.50 },
    { id: 'top', label: 'Top', y: 0.15 },
];

const FRAME_PLATFORMS = [
    { id: 'kick', label: 'Kick', domain: 'kick.com/', color: '#53FC18', img: '/frames/kick.png', textLeftPct: 52.5, textTopPct: 58, textHeightPct: 24 },
    { id: 'youtube', label: 'YouTube', domain: 'youtube.com/', color: '#FF0000', img: '/frames/youtube.png', textLeftPct: 67.7, textTopPct: 59, textHeightPct: 24 },
    { id: 'twitch', label: 'Twitch', domain: 'twitch.tv/', color: '#9146FF', img: '/frames/twitch.png', textLeftPct: 53.9, textTopPct: 57.5, textHeightPct: 25 },
    { id: 'instagram', label: 'Instagram', domain: 'instagram.com/', color: '#E1306C', img: '/frames/instagram.png', textLeftPct: 77.2, textTopPct: 60, textHeightPct: 23.5 },
];

const FRAME_PRESETS = [
    { id: 'bottom', label: 'Bottom', y: 0.95 },
    { id: 'lower', label: 'Lower', y: 0.72 },
    { id: 'middle', label: 'Middle', y: 0.50 },
    { id: 'top', label: 'Top', y: 0.07 },
];

const HOOK_STYLE_CLASSES = {
    pill: 'bg-white text-black shadow-[0_6px_22px_rgba(0,0,0,0.5)] rounded-full',
    cyan_glow: 'bg-[#08131d]/90 text-[#67f8ff] border border-[#00f0ff]/75 shadow-[0_0_18px_rgba(0,240,255,0.5)] rounded-xl',
    classic: 'bg-white text-black rounded-lg shadow-lg',
    dark: 'bg-black/85 text-white border border-white/25 rounded-xl shadow-lg',
    yellow: 'bg-[#ffe500] text-black rounded-lg shadow-lg',
    red: 'bg-[#ef233c] text-white rounded-lg shadow-lg',
    outline: 'bg-transparent text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.95)]',
    outline_yellow: 'bg-transparent text-[#ffe500] drop-shadow-[0_3px_4px_rgba(0,0,0,0.95)]',
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const cleanHandlePreview = (raw) =>
    String(raw || '')
        .trim()
        .replace(/^https?:\/\/(www\.)?/i, '')
        .replace(/^(kick\.com|youtube\.com|youtu\.be|twitch\.tv|instagram\.com)\/+/i, '')
        .replace(/^\/+/, '')
        .trim()
        .toUpperCase();

const resolveHookDisplayY = (position, customY) => {
    if (position === 'custom' && Number.isFinite(customY)) return clamp(customY, 0.03, 0.90);
    const preset = HOOK_PRESETS.find((p) => p.id === position);
    return preset ? preset.y : 0.18;
};

const resolveSubtitleDisplayY = (position, customY) => {
    if (position === 'custom' && Number.isFinite(customY)) return clamp(customY, 0.08, 0.94);
    const preset = SUBTITLE_PRESETS.find((p) => p.id === position);
    return preset ? preset.y : 0.84;
};

export default function OverlayPlacementPicker({
    isOpen = false,
    onOpen,
    onClose,
    clipName = '',
    autoHook = true,
    autoHookStyle = 'pill',
    streamerName = '',
    outputFormat = 'vertical',
    mirrorVideo = false,
    previewSrc = null,
    hookPosition = 'auto',
    hookY = 0.06,
    hookScale = 1.0,
    subtitlePosition = 'auto',
    subtitleY = 0.82,
    subtitleScale = 1.0,
    brandFrameEnabled = false,
    brandFrameType = 'kick',
    brandFrameText = '',
    brandFrameY = 0.95,
    brandFrameScale = 1.0,
    onChange,
}) {
    const [dragging, setDragging] = useState(null); // 'hook' | 'subtitle' | 'frame' | null
    const stageRef = useRef(null);

    const displayHookY = resolveHookDisplayY(hookPosition, hookY);
    const displaySubY = resolveSubtitleDisplayY(subtitlePosition, subtitleY);
    const displayFrameY = clamp(Number.isFinite(brandFrameY) ? brandFrameY : 0.95, 0.04, 0.98);
    const activePlatform = FRAME_PLATFORMS.find((p) => p.id === brandFrameType) || FRAME_PLATFORMS[0];
    const cleanHandle = cleanHandlePreview(brandFrameText);

    const isDefault =
        hookPosition === 'auto' &&
        Math.abs((hookScale ?? 1) - 1) < 0.01 &&
        subtitlePosition === 'auto' &&
        Math.abs((subtitleScale ?? 1) - 1) < 0.01 &&
        !brandFrameEnabled;

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    const stageSizeClass =
        outputFormat === 'horizontal'
            ? 'aspect-video w-full max-w-[480px]'
            : outputFormat === 'square'
                ? 'aspect-square w-[320px] sm:w-[380px]'
                : 'aspect-[9/16] h-[470px] sm:h-[560px] max-h-[68vh]';

    const update = (patch) => {
        onChange?.({
            hookPosition,
            hookY,
            hookScale,
            subtitlePosition,
            subtitleY,
            subtitleScale,
            brandFrameEnabled,
            brandFrameType,
            brandFrameText,
            brandFrameY,
            brandFrameScale,
            ...patch,
        });
    };

    const boundsFor = (kind) => {
        if (kind === 'hook') return [0.03, 0.90];
        if (kind === 'frame') return [0.04, 0.98];
        return [0.08, 0.94];
    };

    const yFromPointer = (clientY, kind) => {
        const el = stageRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        if (!rect.height) return null;
        const [lo, hi] = boundsFor(kind);
        return Number(clamp((clientY - rect.top) / rect.height, lo, hi).toFixed(3));
    };

    const applyDraggedY = (kind, y) => {
        if (y == null) return;
        if (kind === 'hook') update({ hookPosition: 'custom', hookY: y });
        else if (kind === 'frame') update({ brandFrameY: y });
        else update({ subtitlePosition: 'custom', subtitleY: y });
    };

    const handlePointerDown = (kind) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(kind);
        applyDraggedY(kind, yFromPointer(e.clientY, kind));
    };

    const handlePointerMove = (kind) => (e) => {
        if (dragging !== kind) return;
        e.preventDefault();
        applyDraggedY(kind, yFromPointer(e.clientY, kind));
    };

    const handlePointerUp = (e) => {
        if (!dragging) return;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        setDragging(null);
    };

    const handleReset = () => {
        update({
            hookPosition: 'auto',
            hookY: 0.06,
            hookScale: 1.0,
            subtitlePosition: 'auto',
            subtitleY: 0.82,
            subtitleScale: 1.0,
            brandFrameEnabled: false,
            brandFrameY: 0.95,
            brandFrameScale: 1.0,
        });
    };

    const hookLabel = (streamerName || '').trim()
        ? `${streamerName.trim().split(/\s+/)[0].toUpperCase()} broke GTA 😱`
        : 'INSANE CLUTCH MOMENT 😱';

    const hookSummary =
        hookPosition === 'custom'
            ? `${Math.round(displayHookY * 100)}%`
            : HOOK_PRESETS.find((p) => p.id === hookPosition)?.label || 'Auto';
    const subSummary =
        subtitlePosition === 'custom'
            ? `${Math.round(displaySubY * 100)}%`
            : SUBTITLE_PRESETS.find((p) => p.id === subtitlePosition)?.label || 'Auto';

    const dragReadoutY =
        dragging === 'hook' ? displayHookY : dragging === 'frame' ? displayFrameY : displaySubY;
    const dragReadoutLabel =
        dragging === 'hook' ? 'Hook' : dragging === 'frame' ? activePlatform.label : 'Subtitles';

    const modalNode = isOpen ? createPortal(
        <div
            className="fixed inset-0 z-[95] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-fade"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose?.();
            }}
        >
            <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[#11121a]/95 border border-white/[0.12] border-t-white/[0.2] shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden">
                {/* Modal Header */}
                <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-white/[0.08] bg-white/[0.02]">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-xl bg-[#e31084]/20 border border-[#e31084]/40 flex items-center justify-center text-[#e31084] shrink-0">
                                <MoveVertical size={14} />
                            </div>
                            <h3 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate">
                                Overlay Placement &amp; Size Studio
                            </h3>
                        </div>
                        <p className="text-[11.5px] text-white/50 mt-0.5 truncate">
                            {clipName
                                ? `Position Hook, Subtitles & Social Frame directly on "${clipName}" before rendering.`
                                : 'Drag Hook, Subtitles & Social Frame vertically and adjust sizes before rendering.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        aria-label="Close overlay placement studio"
                        className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Body: Large Interactive Canvas + Spacious Controls */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
                    {/* Left: Big Drag-and-Drop Live Canvas */}
                    <div className="flex flex-col items-center justify-center gap-2.5">
                        <div
                            ref={stageRef}
                            className={`relative ${stageSizeClass} rounded-2xl overflow-hidden bg-[#090a10] border border-white/20 shadow-[0_18px_50px_rgba(0,0,0,0.65)] select-none touch-none`}
                        >
                            {/* Real video frame or clean studio grid */}
                            {previewSrc ? (
                                <img
                                    src={previewSrc}
                                    alt="Video frame preview"
                                    draggable={false}
                                    className={`w-full h-full object-cover opacity-85 pointer-events-none ${mirrorVideo ? '-scale-x-100' : ''}`}
                                />
                            ) : (
                                <div
                                    className="w-full h-full opacity-55 pointer-events-none"
                                    style={{
                                        backgroundImage:
                                            'radial-gradient(circle at 50% 25%, rgba(227,16,132,0.2), transparent 60%), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px)',
                                        backgroundSize: '100% 100%, 100% 10%, 20% 100%',
                                    }}
                                />
                            )}

                            {/* Safe-zone guides */}
                            <div className="absolute inset-x-0 top-[6%] border-t border-dashed border-white/20 pointer-events-none">
                                <span className="absolute right-2 top-0.5 text-[9px] font-mono uppercase tracking-wider text-white/35">
                                    Very Top
                                </span>
                            </div>
                            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/15 pointer-events-none" />
                            <div className="absolute inset-x-0 bottom-[15%] border-t border-dashed border-amber-400/30 pointer-events-none">
                                <span className="absolute right-2 -top-3.5 text-[9px] font-mono uppercase tracking-wider text-amber-300/45">
                                    Shorts UI Safe
                                </span>
                            </div>

                            {/* Live horizontal alignment line while dragging */}
                            {dragging && (
                                <div
                                    className="absolute inset-x-0 border-t-2 border-[#e31084] pointer-events-none z-30 shadow-[0_0_8px_#e31084]"
                                    style={{ top: `${dragReadoutY * 100}%` }}
                                />
                            )}

                            {/* Draggable Hook Overlay */}
                            {autoHook && (
                                <div
                                    role="slider"
                                    aria-label="Drag hook vertical position"
                                    aria-valuemin={3}
                                    aria-valuemax={90}
                                    aria-valuenow={Math.round(displayHookY * 100)}
                                    tabIndex={0}
                                    onPointerDown={handlePointerDown('hook')}
                                    onPointerMove={handlePointerMove('hook')}
                                    onPointerUp={handlePointerUp}
                                    onPointerCancel={handlePointerUp}
                                    style={{
                                        top: `${displayHookY * 100}%`,
                                        transform: `translate(-50%, -50%) scale(${clamp(hookScale, 0.6, 1.6)})`,
                                    }}
                                    className={`absolute left-1/2 z-10 cursor-grab active:cursor-grabbing max-w-[90%] px-3.5 py-1.5 text-[14px] font-extrabold tracking-tight whitespace-nowrap transition-shadow ${
                                        HOOK_STYLE_CLASSES[autoHookStyle] || HOOK_STYLE_CLASSES.pill
                                    } ${
                                        dragging === 'hook'
                                            ? 'ring-2 ring-[#e31084] ring-offset-2 ring-offset-black/70'
                                            : 'hover:ring-2 hover:ring-[#e31084]/85'
                                    }`}
                                >
                                    {hookLabel}
                                </div>
                            )}

                            {/* Draggable Subtitle Overlay */}
                            <div
                                role="slider"
                                aria-label="Drag subtitle vertical position"
                                aria-valuemin={8}
                                aria-valuemax={94}
                                aria-valuenow={Math.round(displaySubY * 100)}
                                tabIndex={0}
                                onPointerDown={handlePointerDown('subtitle')}
                                onPointerMove={handlePointerMove('subtitle')}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                                style={{
                                    top: `${displaySubY * 100}%`,
                                    transform: `translate(-50%, -50%) scale(${clamp(subtitleScale, 0.6, 1.6)})`,
                                    textShadow: '0 2px 4px #000, 0 0 6px #000, 1.5px 0 0 #000, -1.5px 0 0 #000, 0 1.5px 0 #000, 0 -1.5px 0 #000',
                                    fontFamily: 'Anton, Impact, sans-serif',
                                }}
                                className={`absolute left-1/2 z-10 cursor-grab active:cursor-grabbing px-3 py-1 rounded-lg font-black uppercase tracking-wide whitespace-nowrap text-[20px] leading-none ${
                                    dragging === 'subtitle'
                                        ? 'bg-black/45 ring-2 ring-amber-400'
                                        : 'hover:bg-black/30 hover:ring-2 hover:ring-amber-300/80'
                                }`}
                            >
                                <span className="text-[#ffe500]">WAIT</span>{' '}
                                <span className="text-white">WHAT JUST</span>
                            </div>

                            {/* Draggable Social Brand Frame Overlay */}
                            {brandFrameEnabled && (
                                <div
                                    role="slider"
                                    aria-label="Drag brand frame vertical position"
                                    aria-valuemin={4}
                                    aria-valuemax={98}
                                    aria-valuenow={Math.round(displayFrameY * 100)}
                                    tabIndex={0}
                                    onPointerDown={handlePointerDown('frame')}
                                    onPointerMove={handlePointerMove('frame')}
                                    onPointerUp={handlePointerUp}
                                    onPointerCancel={handlePointerUp}
                                    style={{
                                        top: `${displayFrameY * 100}%`,
                                        width: `${clamp(brandFrameScale, 0.4, 1.4) * 100}%`,
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                    className={`absolute left-1/2 z-20 cursor-grab active:cursor-grabbing ${
                                        dragging === 'frame'
                                            ? 'ring-2 ring-emerald-400'
                                            : 'hover:ring-2 hover:ring-white/75'
                                    }`}
                                >
                                    <div className="relative w-full">
                                        <img
                                            src={activePlatform.img}
                                            alt={`${activePlatform.label} frame`}
                                            draggable={false}
                                            className="w-full h-auto block pointer-events-none select-none"
                                        />
                                        {cleanHandle && (
                                            <span
                                                style={{
                                                    left: `${activePlatform.textLeftPct}%`,
                                                    top: `${activePlatform.textTopPct + activePlatform.textHeightPct * 0.5}%`,
                                                    maxWidth: `${97.5 - activePlatform.textLeftPct}%`,
                                                    transform: 'translateY(-50%)',
                                                    fontFamily: 'Anton, Impact, sans-serif',
                                                }}
                                                className="absolute text-white font-black uppercase tracking-tight leading-none truncate pointer-events-none text-[9.5px] sm:text-[10.5px]"
                                            >
                                                {cleanHandle}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Live drag coordinate pill */}
                            {dragging && (
                                <div className="absolute bottom-2.5 right-2.5 z-40 px-2.5 py-1 rounded-lg bg-black/85 border border-white/20 text-[11px] font-mono font-semibold text-white pointer-events-none shadow-lg">
                                    {dragReadoutLabel} · Y {Math.round(dragReadoutY * 100)}%
                                </div>
                            )}
                        </div>
                        <p className="text-[11px] text-white/45 text-center">
                            Drag Hook, Subtitles or Social Frame directly up &amp; down on the preview
                        </p>
                    </div>

                    {/* Right: Clean Spacious Controls */}
                    <div className="space-y-4 min-w-0">
                        {/* 1. HOOK CARD */}
                        <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 space-y-3 ${autoHook ? '' : 'opacity-50 pointer-events-none'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-[#e31084]" /> Hook Placement &amp; Size
                                </span>
                                <span className="text-[11px] font-mono text-white/55 px-2 py-0.5 rounded-md bg-black/40 border border-white/10">
                                    {autoHook
                                        ? (hookPosition === 'custom' ? `Custom ${Math.round(displayHookY * 100)}%` : hookSummary)
                                        : 'Hook Off'}
                                </span>
                            </div>

                            <div className="grid grid-cols-4 gap-1.5">
                                {HOOK_PRESETS.map((p) => {
                                    const active = hookPosition === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => update({ hookPosition: p.id, hookY: p.y })}
                                            className={`py-1.5 px-2 rounded-xl text-[11.5px] font-medium transition-all cursor-pointer ${
                                                active
                                                    ? 'bg-[#e31084] text-white shadow-sm'
                                                    : 'bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.12]'
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-[11px] text-white/55 w-10 shrink-0">Size</span>
                                <input
                                    type="range"
                                    min="0.6"
                                    max="1.6"
                                    step="0.05"
                                    value={hookScale}
                                    onChange={(e) => update({ hookScale: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 accent-[#e31084] cursor-pointer"
                                />
                                <span className="text-[11px] font-mono text-white/80 w-11 text-right shrink-0">
                                    {Math.round(hookScale * 100)}%
                                </span>
                            </div>
                        </div>

                        {/* 2. SUBTITLES CARD */}
                        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                                    <Type size={13} className="text-amber-300" /> Subtitle Placement &amp; Size
                                </span>
                                <span className="text-[11px] font-mono text-white/55 px-2 py-0.5 rounded-md bg-black/40 border border-white/10">
                                    {subtitlePosition === 'custom' ? `Custom ${Math.round(displaySubY * 100)}%` : subSummary}
                                </span>
                            </div>

                            <div className="grid grid-cols-4 gap-1.5">
                                {SUBTITLE_PRESETS.map((p) => {
                                    const active = subtitlePosition === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => update({ subtitlePosition: p.id, subtitleY: p.y })}
                                            className={`py-1.5 px-2 rounded-xl text-[11.5px] font-medium transition-all cursor-pointer ${
                                                active
                                                    ? 'bg-amber-400 text-black font-semibold shadow-sm'
                                                    : 'bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.12]'
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-[11px] text-white/55 w-10 shrink-0">Size</span>
                                <input
                                    type="range"
                                    min="0.6"
                                    max="1.6"
                                    step="0.05"
                                    value={subtitleScale}
                                    onChange={(e) => update({ subtitleScale: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 accent-amber-400 cursor-pointer"
                                />
                                <span className="text-[11px] font-mono text-white/80 w-11 text-right shrink-0">
                                    {Math.round(subtitleScale * 100)}%
                                </span>
                            </div>
                        </div>

                        {/* 3. SOCIAL BRAND FRAME CARD (On/Off Toggle + Kick / YT / Twitch / Insta + Handle) */}
                        <div className={`rounded-2xl border p-4 space-y-3 transition-all ${
                            brandFrameEnabled
                                ? 'bg-white/[0.04] border-white/[0.14]'
                                : 'bg-white/[0.02] border-white/[0.08]'
                        }`}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={brandFrameEnabled}
                                            onChange={(e) => update({ brandFrameEnabled: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-10 h-5 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#e31084] shadow-inner" />
                                    </label>
                                    <span className="text-xs font-semibold text-white flex items-center gap-1.5 truncate">
                                        <Frame size={13} className="text-emerald-400 shrink-0" />
                                        Social Frame (Kick · YT · Twitch · Insta)
                                    </span>
                                </div>
                                <span className="text-[11px] font-mono text-white/50 shrink-0">
                                    {brandFrameEnabled ? `Y ${Math.round(displayFrameY * 100)}%` : 'Off'}
                                </span>
                            </div>

                            {brandFrameEnabled && (
                                <div className="space-y-3 pt-1 animate-fade">
                                    {/* Platform selector */}
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {FRAME_PLATFORMS.map((p) => {
                                            const active = brandFrameType === p.id;
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => update({ brandFrameType: p.id })}
                                                    style={active ? { borderColor: p.color, backgroundColor: `${p.color}24` } : undefined}
                                                    className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                                        active
                                                            ? 'text-white shadow-xs'
                                                            : 'border-white/[0.08] bg-white/[0.04] text-white/65 hover:text-white hover:bg-white/[0.08]'
                                                    }`}
                                                >
                                                    <span
                                                        className="w-2 h-2 rounded-full shrink-0"
                                                        style={{ backgroundColor: p.color }}
                                                    />
                                                    <span className="truncate">{p.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Streamer handle input right next to link prefix */}
                                    <div className="flex items-center rounded-xl bg-black/45 border border-white/15 focus-within:border-[#e31084] overflow-hidden">
                                        <span className="px-3 py-2 text-xs font-mono font-semibold text-white/70 bg-white/[0.06] border-r border-white/10 shrink-0 select-none">
                                            {activePlatform.domain}
                                        </span>
                                        <input
                                            type="text"
                                            maxLength={40}
                                            value={brandFrameText}
                                            onChange={(e) => update({ brandFrameText: e.target.value })}
                                            placeholder="streamer name / handle (optional)"
                                            className="w-full h-9 px-3 text-xs bg-transparent text-white placeholder-white/35 focus:outline-none"
                                        />
                                    </div>

                                    {/* Quick presets */}
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {FRAME_PRESETS.map((p) => {
                                            const active = Math.abs(displayFrameY - p.y) < 0.025;
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => update({ brandFrameY: p.y })}
                                                    className={`py-1.5 px-2 rounded-xl text-[11px] font-medium transition-all cursor-pointer ${
                                                        active
                                                            ? 'bg-emerald-500 text-black font-semibold'
                                                            : 'bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.12]'
                                                    }`}
                                                >
                                                    {p.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Size slider */}
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] text-white/55 w-10 shrink-0">Size</span>
                                        <input
                                            type="range"
                                            min="0.4"
                                            max="1.4"
                                            step="0.05"
                                            value={brandFrameScale}
                                            onChange={(e) => update({ brandFrameScale: parseFloat(e.target.value) })}
                                            className="w-full h-1.5 accent-emerald-400 cursor-pointer"
                                        />
                                        <span className="text-[11px] font-mono text-white/80 w-11 text-right shrink-0">
                                            {Math.round(brandFrameScale * 100)}%
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-white/[0.08] bg-white/[0.02]">
                    <button
                        type="button"
                        onClick={handleReset}
                        disabled={isDefault}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white/65 hover:text-white hover:bg-white/[0.08] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                        <RotateCcw size={13} />
                        Reset Defaults
                    </button>

                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 shadow-[0_4px_20px_rgba(227,16,132,0.35)] active:scale-[0.98] transition-all cursor-pointer"
                    >
                        <Check size={15} />
                        Save Placement
                    </button>
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            {/* Compact Inspector Summary Row */}
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <MoveVertical size={13} className="text-[#e31084] shrink-0" />
                        <span className="text-xs font-medium text-white truncate">
                            Hook, Subtitles &amp; Frame Placement
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpen?.()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#e31084]/20 hover:bg-[#e31084]/35 text-pink-200 border border-[#e31084]/45 transition-all cursor-pointer shrink-0 active:scale-[0.97]"
                    >
                        <Maximize2 size={11} />
                        Customize
                    </button>
                </div>

                {/* Live Summary Chips */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono">
                    <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-white/75">
                        Hook: {autoHook ? `${hookSummary} · ${Math.round(hookScale * 100)}%` : 'Off'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-white/75">
                        Subs: {subSummary} · {Math.round(subtitleScale * 100)}%
                    </span>
                    <span className={`px-2 py-0.5 rounded-md border ${
                        brandFrameEnabled
                            ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                            : 'bg-white/[0.04] border-white/10 text-white/45'
                    }`}>
                        Frame: {brandFrameEnabled
                            ? `${activePlatform.label}${cleanHandle ? `/${cleanHandle}` : ''}`
                            : 'Off'}
                    </span>
                </div>
            </div>

            {modalNode}
        </>
    );
}
