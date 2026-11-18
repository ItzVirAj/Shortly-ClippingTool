import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    MoveVertical,
    RotateCcw,
    Type,
    Sparkles,
    Frame,
    X,
    Check,
    Sliders,
    Camera,
    Youtube,
    FlipHorizontal2,
} from 'lucide-react';
import WebcamBoxPicker from './WebcamBoxPicker';

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

const SUBTITLE_COLOR_PRESETS = [
    { id: 'shortly_pink', label: 'White + Shortly Pink', fontColor: '#FFFFFF', highlightColor: '#E31084' },
    { id: 'neon_cyan', label: 'White + Neon Cyan', fontColor: '#FFFFFF', highlightColor: '#00F0FF' },
    { id: 'kick_green', label: 'White + Kick Green', fontColor: '#FFFFFF', highlightColor: '#53FC18' },
    { id: 'twitch_purple', label: 'White + Twitch Purple', fontColor: '#FFFFFF', highlightColor: '#9146FF' },
    { id: 'vibrant_red', label: 'White + Crimson Red', fontColor: '#FFFFFF', highlightColor: '#FF2E4C' },
    { id: 'classic_yellow', label: 'White + Classic Yellow', fontColor: '#FFFFFF', highlightColor: '#FFE500' },
    { id: 'pure_white', label: 'Pure White', fontColor: '#FFFFFF', highlightColor: '#FFFFFF' },
    { id: 'all_pink', label: 'All Pink + White', fontColor: '#F03B9F', highlightColor: '#FFFFFF' },
    { id: 'all_cyan', label: 'All Cyan + White', fontColor: '#00F0FF', highlightColor: '#FFFFFF' },
    { id: 'all_green', label: 'All Green + White', fontColor: '#53FC18', highlightColor: '#FFFFFF' },
];

const LAYOUT_OPTIONS = [
    {
        id: 'auto',
        label: 'Auto (AI)',
        hint: 'Smart speaker detection',
        img: '/screens/layout-single.webp',
        video: '/demo/clip-vertical.mp4',
        seamPct: null,
    },
    {
        id: 'streamer_top',
        label: 'Streamer Top',
        hint: 'Facecam top · Game bottom',
        img: '/screens/layout-streamer-top.webp',
        video: null,
        seamPct: 35,
    },
    {
        id: 'streamer_bottom',
        label: 'Streamer Bottom',
        hint: 'Stream top · Reaction cam',
        img: '/screens/layout-streamer-bottom.webp',
        video: null,
        seamPct: 65,
    },
    {
        id: 'split',
        label: 'Split View',
        hint: 'Two speakers stacked 50/50',
        img: '/screens/layout-split.webp',
        video: null,
        seamPct: 50,
    },
    {
        id: 'screencast',
        label: 'Screencast',
        hint: 'Screen top · Presenter below',
        img: '/screens/layout-screencast.webp',
        video: null,
        seamPct: 62,
    },
    {
        id: 'none',
        label: 'Single Crop',
        hint: 'Centered full-frame crop',
        img: '/screens/layout-single.webp',
        video: null,
        seamPct: null,
    },
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
    outline_yellow: 'bg-transparent text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.95)]',
};

const TABS = [
    { id: 'overlays', label: 'Overlays & Frame', icon: MoveVertical },
    { id: 'camera', label: 'Framing & Cam', icon: Camera },
    { id: 'publishing', label: 'Publishing & Clips', icon: Youtube },
];

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

function PinkToggle({ checked, onChange, ariaLabel }) {
    return (
        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
            <input
                type="checkbox"
                aria-label={ariaLabel}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="sr-only peer"
            />
            <div className="w-10 h-6 bg-white/15 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-transform after:duration-150 peer-checked:bg-[#e31084] shadow-inner transition-colors duration-150" />
        </label>
    );
}

export default function StudioParametersModal({
    isOpen,
    onClose,
    clipName = '',
    outputFormat = 'vertical',
    mode = 'file',
    previewSrc = null,
    // Layout & Webcam
    layout,
    setLayout,
    webcamMode,
    setWebcamMode,
    webcamBox,
    setWebcamBox,
    mirrorVideo,
    setMirrorVideo,
    // Auto-Hook
    autoHook,
    setAutoHook,
    autoHookStyle,
    setAutoHookStyle,
    streamerName,
    setStreamerName,
    hookPosition,
    setHookPosition,
    hookY,
    setHookY,
    hookScale,
    setHookScale,
    // Subtitles
    subtitlePosition,
    setSubtitlePosition,
    subtitleY,
    setSubtitleY,
    subtitleScale,
    setSubtitleScale,
    subtitleColor = '#FFFFFF',
    setSubtitleColor,
    subtitleHighlightColor = '#E31084',
    setSubtitleHighlightColor,
    // Social Brand Frame
    brandFrameEnabled,
    setBrandFrameEnabled,
    brandFrameType,
    setBrandFrameType,
    brandFrameText,
    setBrandFrameText,
    brandFrameY,
    setBrandFrameY,
    brandFrameScale,
    setBrandFrameScale,
    // Auto-Push YouTube
    autoPushYt,
    setAutoPushYt,
    autoPushYtMode,
    setAutoPushYtMode,
    autoPushYtTitle,
    setAutoPushYtTitle,
    autoPushYtDesc,
    setAutoPushYtDesc,
    autoPushYtPrivacy,
    setAutoPushYtPrivacy,
    // Clip Duration / Count limits
    targetClips,
    setTargetClips,
    clipMinSeconds,
    setClipMinSeconds,
    clipMaxSeconds,
    setClipMaxSeconds,
}) {
    const [activeTab, setActiveTab] = useState('overlays');
    const [dragging, setDragging] = useState(null); // 'hook' | 'subtitle' | 'frame' | null
    const [showLayoutSample, setShowLayoutSample] = useState(false);
    const stageRef = useRef(null);
    const grabOffsetRef = useRef(0);

    const activeLayoutOption = LAYOUT_OPTIONS.find((l) => l.id === layout) || LAYOUT_OPTIONS[0];
    const useSampleCanvas = !previewSrc || showLayoutSample;

    useEffect(() => {
        if (previewSrc) setShowLayoutSample(false);
    }, [previewSrc]);

    const displayHookY = resolveHookDisplayY(hookPosition, hookY);
    const displaySubY = resolveSubtitleDisplayY(subtitlePosition, subtitleY);
    const displayFrameY = clamp(Number.isFinite(brandFrameY) ? brandFrameY : 0.95, 0.04, 0.98);
    const activePlatform = FRAME_PLATFORMS.find((p) => p.id === brandFrameType) || FRAME_PLATFORMS[0];
    const cleanHandle = cleanHandlePreview(brandFrameText);

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const stageSizeClass =
        outputFormat === 'horizontal'
            ? 'aspect-video w-full max-w-[480px]'
            : outputFormat === 'square'
                ? 'aspect-square w-[320px] sm:w-[390px]'
                : 'aspect-[9/16] h-[480px] sm:h-[580px] max-h-[68vh]';

    const boundsFor = (kind) => {
        if (kind === 'hook') return [0.03, 0.90];
        if (kind === 'frame') return [0.04, 0.98];
        return [0.08, 0.94];
    };

    const currentYFor = (kind) => {
        if (kind === 'hook') return displayHookY;
        if (kind === 'frame') return displayFrameY;
        return displaySubY;
    };

    // Apple Design §2: 1:1 direct manipulation respecting exact grab offset
    const applyPointerY = (kind, clientY) => {
        const el = stageRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (!rect.height) return;
        const [lo, hi] = boundsFor(kind);
        const adjustedY = clientY - grabOffsetRef.current;
        const nextY = Number(clamp((adjustedY - rect.top) / rect.height, lo, hi).toFixed(3));
        if (kind === 'hook') {
            setHookPosition('custom');
            setHookY(nextY);
        } else if (kind === 'frame') {
            setBrandFrameY(nextY);
        } else {
            setSubtitlePosition('custom');
            setSubtitleY(nextY);
        }
    };

    const handlePointerDown = (kind) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const stage = stageRef.current;
        if (stage) {
            const rect = stage.getBoundingClientRect();
            const currentCenterPx = rect.top + currentYFor(kind) * rect.height;
            grabOffsetRef.current = e.clientY - currentCenterPx;
        } else {
            grabOffsetRef.current = 0;
        }
        setDragging(kind);
    };

    const handlePointerMove = (kind) => (e) => {
        if (dragging !== kind) return;
        e.preventDefault();
        applyPointerY(kind, e.clientY);
    };

    const handlePointerUp = (e) => {
        if (!dragging) return;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        setDragging(null);
        grabOffsetRef.current = 0;
    };

    const handleResetOverlays = () => {
        setHookPosition('auto');
        setHookY(0.06);
        setHookScale(1.0);
        setSubtitlePosition('auto');
        setSubtitleY(0.82);
        setSubtitleScale(1.0);
        setSubtitleColor?.('#FFFFFF');
        setSubtitleHighlightColor?.('#E31084');
        setBrandFrameEnabled(false);
        setBrandFrameY(0.95);
        setBrandFrameScale(1.0);
    };

    const matchedColorPreset = SUBTITLE_COLOR_PRESETS.find(
        (c) =>
            c.fontColor.toUpperCase() === String(subtitleColor || '#FFFFFF').toUpperCase() &&
            c.highlightColor.toUpperCase() === String(subtitleHighlightColor || '#E31084').toUpperCase()
    );

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

    return createPortal(
        <div
            className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-6 bg-black/78 backdrop-blur-md animate-fade"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose?.();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Clip Studio Parameters & Overlay Placement"
                className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-[28px] bg-[#10111a]/95 backdrop-blur-2xl border border-white/[0.12] border-t-white/[0.22] shadow-[0_32px_96px_rgba(0,0,0,0.85)] overflow-hidden"
            >
                {/* Translucent Apple-style Header */}
                <div className="flex items-center justify-between gap-4 px-5 sm:px-7 py-4 bg-white/[0.025] border-b border-white/[0.08]">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-2xl bg-[#e31084]/18 border border-[#e31084]/40 flex items-center justify-center text-[#f03b9f] shrink-0 shadow-[0_0_20px_rgba(227,16,132,0.2)]">
                            <Sliders size={16} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base sm:text-lg font-semibold text-white tracking-[-0.02em] leading-tight truncate">
                                Clip Studio Parameters &amp; Overlays
                            </h2>
                            <p className="text-xs text-white/50 truncate mt-0.5">
                                {clipName
                                    ? `Editing pre-render layout for "${clipName}" — drag overlays 1:1 on the preview.`
                                    : 'Configure framing, webcam tracking, overlays, social frames & YouTube publishing before rendering.'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        aria-label="Close studio parameters modal"
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white/55 hover:text-white bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] transition-all duration-150 active:scale-[0.94] cursor-pointer shrink-0"
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* Full-View 2-Column Workspace */}
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
                    {/* LEFT STAGE (5 cols): Large Sticky Interactive Preview */}
                    <div className="lg:col-span-5 flex flex-col items-center justify-center gap-3 p-5 sm:p-6 bg-black/30 lg:border-r border-b lg:border-b-0 border-white/[0.07]">
                        <div
                            ref={stageRef}
                            className={`relative ${stageSizeClass} rounded-2xl overflow-hidden bg-[#08090f] border border-white/[0.16] shadow-[0_24px_60px_rgba(0,0,0,0.7)] select-none touch-none`}
                        >
                            {/* Real uploaded clip frame or layout-specific preview */}
                            {!useSampleCanvas ? (
                                <>
                                    <img
                                        src={previewSrc}
                                        alt="Clip frame preview"
                                        draggable={false}
                                        className={`w-full h-full object-cover opacity-90 pointer-events-none ${mirrorVideo ? '-scale-x-100' : ''}`}
                                    />
                                    {activeLayoutOption.seamPct != null && (
                                        <div
                                            className="absolute inset-x-0 border-t border-white/35 pointer-events-none z-10"
                                            style={{ top: `${activeLayoutOption.seamPct}%` }}
                                        >
                                            <span className="absolute left-2 -top-4 px-1.5 py-0.5 rounded bg-black/70 text-[8.5px] font-mono uppercase tracking-wider text-white/75">
                                                {activeLayoutOption.label} Seam
                                            </span>
                                        </div>
                                    )}
                                </>
                            ) : activeLayoutOption.video ? (
                                <video
                                    key={activeLayoutOption.id}
                                    src={activeLayoutOption.video}
                                    poster={activeLayoutOption.img}
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    className={`w-full h-full object-cover opacity-90 pointer-events-none ${mirrorVideo ? '-scale-x-100' : ''}`}
                                />
                            ) : (
                                <img
                                    key={activeLayoutOption.id}
                                    src={activeLayoutOption.img}
                                    alt={`${activeLayoutOption.label} layout preview`}
                                    draggable={false}
                                    className={`w-full h-full object-cover opacity-92 pointer-events-none ${mirrorVideo ? '-scale-x-100' : ''}`}
                                />
                            )}

                            {/* Top-left Layout Preview Pill (with Your Frame / Layout Sample switch when file uploaded) */}
                            <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[9.5px] font-mono uppercase tracking-wider text-white/85 pointer-events-none">
                                    {useSampleCanvas ? `Layout · ${activeLayoutOption.label}` : `Clip · ${activeLayoutOption.label}`}
                                </span>
                                {previewSrc && (
                                    <button
                                        type="button"
                                        onClick={() => setShowLayoutSample((v) => !v)}
                                        className="px-2 py-0.5 rounded-full bg-[#e31084]/85 hover:bg-[#e31084] text-[9.5px] font-semibold text-white transition-all active:scale-95 cursor-pointer shadow-sm"
                                        title={showLayoutSample ? 'Switch back to your uploaded clip frame' : 'Preview this speaker layout sample'}
                                    >
                                        {showLayoutSample ? 'My Clip' : 'See Layout'}
                                    </button>
                                )}
                            </div>

                            {/* Clean Monochrome Safe-Zone Guides (Zero Amber) */}
                            <div className="absolute inset-x-0 top-[6%] border-t border-dashed border-white/20 pointer-events-none">
                                <span className="absolute right-2.5 top-1 text-[9px] font-mono uppercase tracking-wider text-white/40">
                                    Very Top
                                </span>
                            </div>
                            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/15 pointer-events-none" />
                            <div className="absolute inset-x-0 bottom-[15%] border-t border-dashed border-white/20 pointer-events-none">
                                <span className="absolute right-2.5 -top-4 text-[9px] font-mono uppercase tracking-wider text-white/40">
                                    Shorts Safe Zone
                                </span>
                            </div>

                            {/* Live Pink Alignment Line While Dragging */}
                            {dragging && (
                                <div
                                    className="absolute inset-x-0 border-t-2 border-[#e31084] pointer-events-none z-30 shadow-[0_0_12px_rgba(227,16,132,0.85)]"
                                    style={{ top: `${dragReadoutY * 100}%` }}
                                />
                            )}

                            {/* Draggable Hook Pill */}
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
                                    className={`absolute left-1/2 z-10 cursor-grab active:cursor-grabbing max-w-[90%] px-3.5 py-1.5 text-[14px] font-extrabold tracking-tight whitespace-nowrap ${
                                        HOOK_STYLE_CLASSES[autoHookStyle] || HOOK_STYLE_CLASSES.pill
                                    } ${
                                        dragging === 'hook'
                                            ? 'ring-2 ring-[#e31084] ring-offset-2 ring-offset-black/75 shadow-[0_8px_28px_rgba(227,16,132,0.45)]'
                                            : 'hover:ring-2 hover:ring-[#e31084]/85'
                                    }`}
                                >
                                    {hookLabel}
                                </div>
                            )}

                            {/* Draggable Subtitle Preview */}
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
                                className={`absolute left-1/2 z-10 cursor-grab active:cursor-grabbing px-3 py-1 rounded-xl font-black uppercase tracking-wide whitespace-nowrap text-[21px] leading-none ${
                                    dragging === 'subtitle'
                                        ? 'bg-black/50 ring-2 ring-[#e31084] shadow-[0_8px_28px_rgba(227,16,132,0.45)]'
                                        : 'hover:bg-black/30 hover:ring-2 hover:ring-[#e31084]/80'
                                }`}
                            >
                                <span style={{ color: subtitleHighlightColor || '#E31084' }}>WAIT</span>{' '}
                                <span style={{ color: subtitleColor || '#FFFFFF' }}>WHAT JUST</span>
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
                                            ? 'ring-2 ring-[#e31084] shadow-[0_8px_28px_rgba(227,16,132,0.45)]'
                                            : 'hover:ring-2 hover:ring-white/80'
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
                                                className="absolute text-white font-black uppercase tracking-tight leading-none truncate pointer-events-none text-[10px] sm:text-[11px]"
                                            >
                                                {cleanHandle}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Live Drag Coordinate Pill */}
                            {dragging && (
                                <div className="absolute bottom-3 right-3 z-40 px-2.5 py-1 rounded-xl bg-black/85 backdrop-blur-md border border-[#e31084]/60 text-[11px] font-mono tabular-nums font-semibold text-white pointer-events-none shadow-lg">
                                    {dragReadoutLabel} · {Math.round(dragReadoutY * 100)}%
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap justify-center">
                            <span className="text-[11px] text-white/45">
                                Drag Hook, Subtitles or Frame vertically on canvas
                            </span>
                            <button
                                type="button"
                                onClick={() => setMirrorVideo(!mirrorVideo)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150 active:scale-[0.96] cursor-pointer ${
                                    mirrorVideo
                                        ? 'bg-[#e31084]/20 border-[#e31084]/50 text-pink-200'
                                        : 'bg-white/[0.05] border-white/[0.1] text-white/60 hover:text-white'
                                }`}
                            >
                                <FlipHorizontal2 size={11} />
                                {mirrorVideo ? 'Mirrored' : 'Mirror Off'}
                            </button>
                        </div>
                    </div>

                    {/* RIGHT CONTROLS (7 cols): Apple Segmented Tabs + Spacious Inset Cards */}
                    <div className="lg:col-span-7 flex flex-col min-h-0">
                        {/* Apple Segmented Control */}
                        <div className="px-5 sm:px-7 pt-5 pb-3 shrink-0">
                            <div className="grid grid-cols-3 p-1 rounded-2xl bg-black/45 border border-white/[0.09] gap-1">
                                {TABS.map((t) => {
                                    const Icon = t.icon;
                                    const active = activeTab === t.id;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setActiveTab(t.id)}
                                            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                                                active
                                                    ? 'bg-[#e31084] text-white shadow-[0_2px_14px_rgba(227,16,132,0.4)]'
                                                    : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                                            }`}
                                        >
                                            <Icon size={13} />
                                            <span className="truncate">{t.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Scrollable Tab Body */}
                        <div className="flex-1 overflow-y-auto px-5 sm:px-7 pb-6 space-y-4">
                            {activeTab === 'overlays' && (
                                <>
                                    {/* 1. AUTO-HOOK CARD */}
                                    <div className="rounded-2xl bg-white/[0.035] border border-white/[0.09] p-4 sm:p-5 space-y-3.5">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <PinkToggle
                                                    checked={autoHook}
                                                    onChange={setAutoHook}
                                                    ariaLabel="Toggle Auto-Hook Titles"
                                                />
                                                <div className="min-w-0">
                                                    <span className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5">
                                                        <Sparkles size={13} className="text-[#f03b9f]" />
                                                        Auto-Hook Titles
                                                    </span>
                                                    <p className="text-[11px] text-white/45 leading-tight">
                                                        Single-line 3–4 word streamer-relative hook
                                                    </p>
                                                </div>
                                            </div>

                                            {autoHook && (
                                                <select
                                                    value={autoHookStyle}
                                                    onChange={(e) => setAutoHookStyle(e.target.value)}
                                                    className="h-8 px-3 text-xs rounded-xl border border-white/[0.12] bg-[#161722] text-white focus:border-[#e31084] focus:outline-none cursor-pointer"
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
                                            <div className="space-y-3 pt-1">
                                                <input
                                                    type="text"
                                                    value={streamerName}
                                                    onChange={(e) => setStreamerName(e.target.value)}
                                                    placeholder="Streamer name for 3–4 word hooks (auto-detected on stream links)"
                                                    className="w-full h-9 px-3 text-xs rounded-xl bg-black/45 border border-white/[0.12] text-white placeholder-white/35 focus:border-[#e31084] focus:outline-none transition-colors"
                                                />

                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="text-white/55 font-medium">Placement</span>
                                                    <span className="font-mono tabular-nums text-white/60">
                                                        {hookPosition === 'custom'
                                                            ? `Dragged · ${Math.round(displayHookY * 100)}%`
                                                            : hookSummary}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {HOOK_PRESETS.map((p) => {
                                                        const active = hookPosition === p.id;
                                                        return (
                                                            <button
                                                                key={p.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setHookPosition(p.id);
                                                                    setHookY(p.y);
                                                                }}
                                                                className={`py-2 px-2 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                                                                    active
                                                                        ? 'bg-[#e31084] text-white shadow-[0_2px_10px_rgba(227,16,132,0.35)]'
                                                                        : 'bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.11]'
                                                                }`}
                                                            >
                                                                {p.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                <div className="flex items-center gap-3 pt-0.5">
                                                    <span className="text-xs text-white/55 w-10 shrink-0">Size</span>
                                                    <input
                                                        type="range"
                                                        min="0.6"
                                                        max="1.6"
                                                        step="0.05"
                                                        value={hookScale}
                                                        onChange={(e) => setHookScale(parseFloat(e.target.value))}
                                                        className="w-full h-1.5 accent-[#e31084] cursor-pointer"
                                                    />
                                                    <span className="text-xs font-mono tabular-nums text-white/80 w-11 text-right shrink-0">
                                                        {Math.round(hookScale * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 2. SUBTITLES CARD */}
                                    <div className="rounded-2xl bg-white/[0.035] border border-white/[0.09] p-4 sm:p-5 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5">
                                                <Type size={13} className="text-[#f03b9f]" />
                                                Subtitle Placement &amp; Size
                                            </span>
                                            <span className="text-[11px] font-mono tabular-nums text-white/60 px-2.5 py-0.5 rounded-lg bg-black/40 border border-white/[0.08]">
                                                {subtitlePosition === 'custom'
                                                    ? `Dragged · ${Math.round(displaySubY * 100)}%`
                                                    : subSummary}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-4 gap-1.5">
                                            {SUBTITLE_PRESETS.map((p) => {
                                                const active = subtitlePosition === p.id;
                                                return (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSubtitlePosition(p.id);
                                                            setSubtitleY(p.y);
                                                        }}
                                                        className={`py-2 px-2 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                                                            active
                                                                ? 'bg-[#e31084] text-white shadow-[0_2px_10px_rgba(227,16,132,0.35)]'
                                                                : 'bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.11]'
                                                        }`}
                                                    >
                                                        {p.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="flex items-center gap-3 pt-0.5">
                                            <span className="text-xs text-white/55 w-10 shrink-0">Size</span>
                                            <input
                                                type="range"
                                                min="0.6"
                                                max="1.6"
                                                step="0.05"
                                                value={subtitleScale}
                                                onChange={(e) => setSubtitleScale(parseFloat(e.target.value))}
                                                className="w-full h-1.5 accent-[#e31084] cursor-pointer"
                                            />
                                            <span className="text-xs font-mono tabular-nums text-white/80 w-11 text-right shrink-0">
                                                {Math.round(subtitleScale * 100)}%
                                            </span>
                                        </div>

                                        {/* Subtitle Color Dropdown + Custom Swatch */}
                                        <div className="flex items-center gap-2.5 pt-1">
                                            <span className="text-xs text-white/55 w-10 shrink-0">Color</span>
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <span
                                                    className="w-5 h-5 rounded-full border border-white/25 shrink-0 shadow-inner"
                                                    style={{
                                                        background: `linear-gradient(135deg, ${subtitleColor || '#FFFFFF'} 50%, ${subtitleHighlightColor || '#E31084'} 50%)`,
                                                    }}
                                                    title={`Text ${subtitleColor} / Highlight ${subtitleHighlightColor}`}
                                                />
                                                <select
                                                    aria-label="Subtitle color preset"
                                                    value={matchedColorPreset ? matchedColorPreset.id : 'custom'}
                                                    onChange={(e) => {
                                                        const preset = SUBTITLE_COLOR_PRESETS.find((c) => c.id === e.target.value);
                                                        if (preset) {
                                                            setSubtitleColor?.(preset.fontColor);
                                                            setSubtitleHighlightColor?.(preset.highlightColor);
                                                        }
                                                    }}
                                                    className="flex-1 h-9 px-3 text-xs rounded-xl border border-white/[0.12] bg-[#161722] text-white focus:border-[#e31084] focus:outline-none cursor-pointer min-w-0"
                                                >
                                                    {SUBTITLE_COLOR_PRESETS.map((c) => (
                                                        <option key={c.id} value={c.id}>
                                                            {c.label}
                                                        </option>
                                                    ))}
                                                    {!matchedColorPreset && <option value="custom">Custom Color</option>}
                                                </select>
                                                <label
                                                    className="relative w-9 h-9 rounded-xl border border-white/[0.14] bg-black/40 hover:border-[#e31084] flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                                                    title="Pick custom active highlight color"
                                                >
                                                    <span
                                                        className="w-4 h-4 rounded-md border border-white/25"
                                                        style={{ backgroundColor: subtitleHighlightColor || '#E31084' }}
                                                    />
                                                    <input
                                                        type="color"
                                                        aria-label="Custom subtitle highlight color"
                                                        value={subtitleHighlightColor || '#E31084'}
                                                        onChange={(e) => setSubtitleHighlightColor?.(e.target.value.toUpperCase())}
                                                        className="sr-only"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. SOCIAL BRAND FRAME CARD (Kick / YouTube / Twitch / Instagram) */}
                                    <div className={`rounded-2xl border p-4 sm:p-5 space-y-3.5 transition-colors ${
                                        brandFrameEnabled
                                            ? 'bg-white/[0.045] border-[#e31084]/35'
                                            : 'bg-white/[0.03] border-white/[0.09]'
                                    }`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <PinkToggle
                                                    checked={brandFrameEnabled}
                                                    onChange={setBrandFrameEnabled}
                                                    ariaLabel="Toggle Social Frame"
                                                />
                                                <div className="min-w-0">
                                                    <span className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5">
                                                        <Frame size={13} className="text-[#f03b9f]" />
                                                        Social Frame (Kick · YouTube · Twitch · Insta)
                                                    </span>
                                                    <p className="text-[11px] text-white/45 leading-tight">
                                                        Optional platform banner with your streamer handle beside the link
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-[11px] font-mono tabular-nums text-white/55 shrink-0">
                                                {brandFrameEnabled ? `Y ${Math.round(displayFrameY * 100)}%` : 'Off'}
                                            </span>
                                        </div>

                                        {brandFrameEnabled && (
                                            <div className="space-y-3 pt-1">
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {FRAME_PLATFORMS.map((p) => {
                                                        const active = brandFrameType === p.id;
                                                        return (
                                                            <button
                                                                key={p.id}
                                                                type="button"
                                                                onClick={() => setBrandFrameType(p.id)}
                                                                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all duration-150 active:scale-[0.97] cursor-pointer flex items-center justify-center gap-1.5 ${
                                                                    active
                                                                        ? 'border-[#e31084] bg-[#e31084]/20 text-white shadow-xs'
                                                                        : 'border-white/[0.09] bg-white/[0.04] text-white/65 hover:text-white hover:bg-white/[0.09]'
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

                                                <div className="flex items-center rounded-xl bg-black/45 border border-white/[0.14] focus-within:border-[#e31084] overflow-hidden transition-colors">
                                                    <span className="px-3 py-2 text-xs font-mono font-semibold text-white/75 bg-white/[0.06] border-r border-white/[0.1] shrink-0 select-none">
                                                        {activePlatform.domain}
                                                    </span>
                                                    <input
                                                        type="text"
                                                        maxLength={40}
                                                        value={brandFrameText}
                                                        onChange={(e) => setBrandFrameText(e.target.value)}
                                                        placeholder="streamer name / handle (optional)"
                                                        className="w-full h-9 px-3 text-xs bg-transparent text-white placeholder-white/35 focus:outline-none"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {FRAME_PRESETS.map((p) => {
                                                        const active = Math.abs(displayFrameY - p.y) < 0.025;
                                                        return (
                                                            <button
                                                                key={p.id}
                                                                type="button"
                                                                onClick={() => setBrandFrameY(p.y)}
                                                                className={`py-2 px-2 rounded-xl text-xs font-medium transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                                                                    active
                                                                        ? 'bg-[#e31084] text-white shadow-[0_2px_10px_rgba(227,16,132,0.35)]'
                                                                        : 'bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.11]'
                                                                }`}
                                                            >
                                                                {p.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                <div className="flex items-center gap-3 pt-0.5">
                                                    <span className="text-xs text-white/55 w-10 shrink-0">Size</span>
                                                    <input
                                                        type="range"
                                                        min="0.4"
                                                        max="1.4"
                                                        step="0.05"
                                                        value={brandFrameScale}
                                                        onChange={(e) => setBrandFrameScale(parseFloat(e.target.value))}
                                                        className="w-full h-1.5 accent-[#e31084] cursor-pointer"
                                                    />
                                                    <span className="text-xs font-mono tabular-nums text-white/80 w-11 text-right shrink-0">
                                                        {Math.round(brandFrameScale * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {activeTab === 'camera' && (
                                <>
                                    {/* Vertical Speaker Layout Visual Picker + Dropdown */}
                                    <div className="rounded-2xl bg-white/[0.035] border border-white/[0.09] p-4 sm:p-5 space-y-3.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <label className="text-xs sm:text-sm font-semibold text-white">
                                                Vertical Speaker Layout
                                            </label>
                                            <span className="text-[11px] font-mono text-white/55">
                                                {activeLayoutOption.label}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                            {LAYOUT_OPTIONS.map((opt) => {
                                                const active = layout === opt.id;
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setLayout(opt.id);
                                                            if (previewSrc) setShowLayoutSample(true);
                                                        }}
                                                        className={`group rounded-xl p-1.5 border text-left transition-all duration-150 active:scale-[0.96] cursor-pointer flex flex-col gap-1.5 ${
                                                            active
                                                                ? 'border-[#e31084] bg-[#e31084]/15 shadow-[0_0_16px_rgba(227,16,132,0.25)]'
                                                                : 'border-white/[0.08] bg-black/35 hover:border-white/25 hover:bg-white/[0.05]'
                                                        }`}
                                                    >
                                                        <div className="relative w-full aspect-[9/16] rounded-lg overflow-hidden bg-black/60">
                                                            <img
                                                                src={opt.img}
                                                                alt={opt.label}
                                                                loading="lazy"
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                            />
                                                            {active && (
                                                                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#e31084] text-white flex items-center justify-center shadow">
                                                                    <Check size={10} />
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 px-0.5">
                                                            <span className={`block text-[10px] font-semibold leading-tight truncate ${active ? 'text-white' : 'text-white/75'}`}>
                                                                {opt.label}
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <select
                                            value={layout}
                                            onChange={(e) => {
                                                setLayout(e.target.value);
                                                if (previewSrc) setShowLayoutSample(true);
                                            }}
                                            className="w-full h-9 px-3 text-xs rounded-xl border border-white/[0.12] bg-[#161722] text-white focus:border-[#e31084] focus:outline-none cursor-pointer"
                                        >
                                            <option value="auto">Auto (AI detects speaker framing)</option>
                                            <option value="streamer_top">Streamer Top / Stream Bottom (Gaming Shorts)</option>
                                            <option value="streamer_bottom">Stream Top / Streamer Bottom (Reaction / Tutorial)</option>
                                            <option value="split">Two speakers stacked (Split view)</option>
                                            <option value="screencast">Screen over presenter (Screencast)</option>
                                            <option value="none">Single centered crop only</option>
                                        </select>
                                    </div>

                                    {/* Streamer Webcam Corner / Tracing Box (Full spacious view!) */}
                                    {outputFormat === 'vertical' && ['auto', 'streamer_top', 'streamer_bottom'].includes(layout) && (
                                        <div className="rounded-2xl bg-white/[0.035] border border-white/[0.09] p-4 sm:p-5">
                                            <WebcamBoxPicker
                                                mode={webcamMode}
                                                box={webcamBox}
                                                previewSrc={mode === 'file' ? previewSrc : null}
                                                onChange={({ webcam_mode: nextMode, webcam_box: nextBox }) => {
                                                    setWebcamMode(nextMode);
                                                    if (nextBox !== undefined) setWebcamBox(nextBox);
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* Mirror Video Toggle */}
                                    <div className="rounded-2xl bg-white/[0.035] border border-white/[0.09] p-4 sm:p-5 flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <span className="text-xs sm:text-sm font-semibold text-white block">
                                                Mirror Video
                                            </span>
                                            <span className="text-[11.5px] text-white/50 block mt-0.5 leading-snug">
                                                Flip video horizontally before subtitles so captions &amp; hooks stay normal and readable.
                                            </span>
                                        </div>
                                        <PinkToggle
                                            checked={mirrorVideo}
                                            onChange={setMirrorVideo}
                                            ariaLabel="Toggle Mirror Video"
                                        />
                                    </div>
                                </>
                            )}

                            {activeTab === 'publishing' && (
                                <>
                                    {/* Auto-Push to YouTube */}
                                    <div className="rounded-2xl bg-white/[0.035] border border-white/[0.09] p-4 sm:p-5 space-y-3.5">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="min-w-0">
                                                <span className="text-xs sm:text-sm font-semibold text-white block">
                                                    Auto-Push to YouTube
                                                </span>
                                                <span className="text-[11.5px] text-white/50 block mt-0.5 leading-snug">
                                                    Direct YouTube upload when Studio clips finish (bypasses Live Clipper pipeline).
                                                </span>
                                            </div>
                                            <PinkToggle
                                                checked={autoPushYt}
                                                onChange={setAutoPushYt}
                                                ariaLabel="Toggle Auto-Push to YouTube"
                                            />
                                        </div>

                                        {autoPushYt && (
                                            <div className="space-y-3 pt-1">
                                                <div className="grid grid-cols-2 p-1 rounded-xl bg-black/45 border border-white/[0.1] gap-1 text-xs">
                                                    <button
                                                        type="button"
                                                        onClick={() => setAutoPushYtMode('review')}
                                                        className={`py-2 px-3 rounded-lg font-medium transition-all active:scale-[0.97] cursor-pointer ${
                                                            autoPushYtMode === 'review'
                                                                ? 'bg-[#e31084] text-white shadow-xs'
                                                                : 'text-white/60 hover:text-white'
                                                        }`}
                                                    >
                                                        Tick &amp; Ask Title/Desc
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAutoPushYtMode('auto')}
                                                        className={`py-2 px-3 rounded-lg font-medium transition-all active:scale-[0.97] cursor-pointer ${
                                                            autoPushYtMode === 'auto'
                                                                ? 'bg-[#e31084] text-white shadow-xs'
                                                                : 'text-white/60 hover:text-white'
                                                        }`}
                                                    >
                                                        Auto-Upload Immediately
                                                    </button>
                                                </div>

                                                {autoPushYtMode === 'auto' && (
                                                    <div className="space-y-2.5">
                                                        <input
                                                            type="text"
                                                            maxLength={100}
                                                            value={autoPushYtTitle}
                                                            onChange={(e) => setAutoPushYtTitle(e.target.value)}
                                                            placeholder="Title (leave blank to use clip/default title) 😱"
                                                            className="w-full h-9 px-3 text-xs rounded-xl bg-black/45 border border-white/[0.12] text-white placeholder-white/35 focus:border-[#e31084] focus:outline-none"
                                                        />
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {['😱', '🔥', '💀', '🚨', '🎮', '🤯'].map((em) => (
                                                                <button
                                                                    key={em}
                                                                    type="button"
                                                                    onClick={() => setAutoPushYtTitle((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${em}`.slice(0, 100))}
                                                                    className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] text-xs flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
                                                                    title={`Add ${em} to title`}
                                                                >
                                                                    {em}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <textarea
                                                            rows={3}
                                                            maxLength={5000}
                                                            value={autoPushYtDesc}
                                                            onChange={(e) => setAutoPushYtDesc(e.target.value)}
                                                            placeholder="Description & #hashtags (blank uses .env default)…"
                                                            className="w-full p-3 text-xs rounded-xl bg-black/45 border border-white/[0.12] text-white placeholder-white/35 focus:border-[#e31084] focus:outline-none resize-none"
                                                        />
                                                        <select
                                                            value={autoPushYtPrivacy}
                                                            onChange={(e) => setAutoPushYtPrivacy(e.target.value)}
                                                            className="w-full h-9 px-3 text-xs rounded-xl bg-[#161722] border border-white/[0.12] text-white focus:border-[#e31084] focus:outline-none cursor-pointer"
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

                                    {/* Fine-Tune Clip Count & Duration */}
                                    <div className="rounded-2xl bg-white/[0.035] border border-white/[0.09] p-4 sm:p-5 space-y-3">
                                        <div>
                                            <span className="text-xs sm:text-sm font-semibold text-white block">
                                                Clip Count &amp; Duration Targets
                                            </span>
                                            <p className="text-[11px] text-white/45 mt-0.5">
                                                Leave blank to let AI pick optimal clip count and length for retention.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-[10.5px] text-white/55 uppercase tracking-wider block mb-1.5">
                                                    Clips Count
                                                </label>
                                                <input
                                                    type="number" min="1" max="15" step="1"
                                                    value={targetClips}
                                                    onChange={(e) => setTargetClips(e.target.value)}
                                                    placeholder="Auto"
                                                    className="w-full h-9 px-3 text-xs font-mono tabular-nums rounded-xl border border-white/[0.12] bg-black/45 text-white focus:border-[#e31084] focus:outline-none text-center"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10.5px] text-white/55 uppercase tracking-wider block mb-1.5">
                                                    Min Sec
                                                </label>
                                                <input
                                                    type="number" min="15" max="180" step="5"
                                                    value={clipMinSeconds}
                                                    onChange={(e) => setClipMinSeconds(e.target.value)}
                                                    placeholder="15s"
                                                    className="w-full h-9 px-3 text-xs font-mono tabular-nums rounded-xl border border-white/[0.12] bg-black/45 text-white focus:border-[#e31084] focus:outline-none text-center"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10.5px] text-white/55 uppercase tracking-wider block mb-1.5">
                                                    Max Sec
                                                </label>
                                                <input
                                                    type="number" min="30" max="300" step="5"
                                                    value={clipMaxSeconds}
                                                    onChange={(e) => setClipMaxSeconds(e.target.value)}
                                                    placeholder="60s"
                                                    className="w-full h-9 px-3 text-xs font-mono tabular-nums rounded-xl border border-white/[0.12] bg-black/45 text-white focus:border-[#e31084] focus:outline-none text-center"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Translucent Apple-style Modal Footer */}
                <div className="flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 bg-white/[0.025] border-t border-white/[0.08]">
                    <button
                        type="button"
                        onClick={handleResetOverlays}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-white/65 hover:text-white hover:bg-white/[0.08] transition-all duration-150 active:scale-[0.97] cursor-pointer"
                    >
                        <RotateCcw size={13} />
                        Reset Overlays
                    </button>

                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 shadow-[0_6px_24px_rgba(227,16,132,0.4)] border-t border-white/25 transition-all duration-150 active:scale-[0.97] cursor-pointer"
                    >
                        <Check size={15} />
                        Apply &amp; Continue
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
