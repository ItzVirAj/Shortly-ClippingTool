import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ExternalLink,
    Loader2,
    Sparkles,
    Tv,
    X,
    Youtube,
} from 'lucide-react';
import { apiJson } from '../../lib/api';
import { getApiUrl } from '../../config';
import { LookPicker } from '../../captions/CaptionPanel';
import { defaultLook, useClipFrame } from '../../captions/clipCaptionState';

const DEFAULT_LAYOUT = 'streamer_bottom';

const LAYOUT_MODES = [
    {
        id: 'streamer_bottom',
        shortLabel: 'Split · Stream + Cam',
        title: 'Stream Top · Cam Bottom',
        subtitle: 'Full screen on top half, speaker cam below',
        badge: 'Default',
    },
    {
        id: 'blurred_center',
        shortLabel: 'Single · Centered Blur',
        title: 'Single Centered · Blur',
        subtitle: 'Full video centered over blurred 9:16 backdrop',
        badge: null,
    },
];

function LayoutThumbnail({ mode, active }) {
    const borderTone = active ? 'border-brass/70' : 'border-white/15';
    if (mode === 'blurred_center') {
        return (
            <div
                aria-hidden="true"
                className={`relative w-8 h-14 rounded-[7px] border ${borderTone} overflow-hidden shrink-0 bg-gradient-to-b from-white/[0.10] via-white/[0.04] to-white/[0.10]`}
            >
                {/* Blurred backdrop texture bands */}
                <div className="absolute inset-0 backdrop-blur-[2px] bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.16),transparent_55%),radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.14),transparent_55%)]" />
                {/* Sharp 16:9 centered frame */}
                <div
                    className={`absolute inset-x-0.5 top-1/2 -translate-y-1/2 h-[18px] rounded-[3px] border transition-colors duration-200 ${
                        active
                            ? 'bg-brass/30 border-brass/80 shadow-[0_0_10px_rgba(255,255,255,0.12)]'
                            : 'bg-white/20 border-white/35'
                    }`}
                />
            </div>
        );
    }

    // Default: streamer_bottom — full screen top half, speaker/streamer cam bottom half
    return (
        <div
            aria-hidden="true"
            className={`relative w-8 h-14 rounded-[7px] border ${borderTone} overflow-hidden shrink-0 flex flex-col bg-black/50`}
        >
            {/* Top half: Full stream/gameplay */}
            <div
                className={`flex-1 flex items-center justify-center transition-colors duration-200 ${
                    active ? 'bg-brass/25' : 'bg-white/[0.12]'
                }`}
            >
                <div className="w-4 h-2.5 rounded-[2px] border border-white/40 bg-white/10" />
            </div>
            {/* Crisp divider */}
            <div className="h-[1.5px] bg-black/90 shrink-0" />
            {/* Bottom half: Speaker / streamer cam */}
            <div
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 ${
                    active ? 'bg-brass/15' : 'bg-white/[0.06]'
                }`}
            >
                <div className="w-2.5 h-2.5 rounded-full bg-white/55" />
                <div className="w-4 h-1.5 rounded-t-full bg-white/35" />
            </div>
        </div>
    );
}

function StatusPill({ status }) {
    const map = {
        published: { label: 'Published', dot: 'bg-emerald-400', text: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
        processing: { label: 'Processing', dot: 'bg-sky-400 animate-pulse', text: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
        uploading: { label: 'Uploading', dot: 'bg-sky-400 animate-pulse', text: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
        queued: { label: 'Queued', dot: 'bg-amber-300', text: 'text-amber-200 bg-amber-500/10 border-amber-500/20' },
        metadata: { label: 'Metadata', dot: 'bg-purple-400 animate-pulse', text: 'text-purple-200 bg-purple-500/10 border-purple-500/20' },
        editing: { label: 'Rendering', dot: 'bg-brass animate-pulse', text: 'text-ink bg-white/[0.08] border-white/[0.12]' },
        attention: { label: 'Attention', dot: 'bg-rose-400', text: 'text-rose-300 bg-rose-500/10 border-rose-500/20' },
        cancelled: { label: 'Cancelled', dot: 'bg-white/30', text: 'text-muted bg-white/[0.04] border-white/[0.08]' },
    };
    const meta = map[status] || { label: status, dot: 'bg-white/40', text: 'text-muted bg-white/[0.05] border-white/[0.08]' };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium tracking-[0.01em] shrink-0 ${meta.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
        </span>
    );
}

export default function Skipper({ captureId }) {
    const [setup, setSetup] = useState(false);
    const [look, setLook] = useState(defaultLook);
    const [layout, setLayout] = useState(DEFAULT_LAYOUT);
    const [layoutSaving, setLayoutSaving] = useState(false);
    const [showActivity, setShowActivity] = useState(true);
    const frame = useClipFrame(
        setup && captureId
            ? getApiUrl('/api/liveclipper/queue/' + encodeURIComponent(captureId) + '/preview')
            : null,
    );
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const next = await apiJson('/api/publishing/skipper');
            setData(next);
            const serverLayout = next?.settings?.skipper_layout || DEFAULT_LAYOUT;
            setLayout((prev) => (prev === serverLayout ? prev : serverLayout));
        } catch {
            /* local mode only */
        }
    }, []);

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 5000);
        return () => clearInterval(id);
    }, [refresh]);

    if (!data) return null;

    const auto = !!data.settings.skipper;
    const saved = data.settings.skipper_look;
    const activeLayout = data.settings.skipper_layout || DEFAULT_LAYOUT;
    const effectiveLayout = setup && !auto ? layout : layout || activeLayout;
    const activeLayoutIdx = Math.max(0, LAYOUT_MODES.findIndex((m) => m.id === effectiveLayout));

    const captionLabel =
        saved?.captionsEnabled === false
            ? 'Captions off'
            : saved
              ? saved.captionStyleId.charAt(0).toUpperCase() + saved.captionStyleId.slice(1) + ' captions'
              : 'Default captions';

    const channelName = data.channel?.title || data.settings.skipper_name || 'your connected YouTube channel';
    const liveItems = (data.items || []).filter((i) => i.clip_key.startsWith('live:')).slice(0, 8);

    async function toggle(enabled) {
        setBusy(true);
        try {
            await apiJson('/api/publishing/skipper', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled,
                    ...(enabled ? { look, layout: effectiveLayout } : {}),
                }),
            });
            setError('');
            setSetup(false);
            await refresh();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleQuickLayoutChange(nextLayout) {
        if (nextLayout === effectiveLayout || layoutSaving) return;
        const previous = effectiveLayout;
        // Instant optimistic response (Apple Design §1: kill latency)
        setLayout(nextLayout);
        if (setup && !auto) return;
        setLayoutSaving(true);
        try {
            await apiJson('/api/publishing/skipper', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout: nextLayout }),
            });
            setError('');
            await refresh();
        } catch (e) {
            setLayout(previous);
            setError(e.message || 'Could not switch framing layout');
        } finally {
            setLayoutSaving(false);
        }
    }

    return (
        <section
            aria-label="Skipper Auto Publisher"
            className="relative overflow-hidden rounded-[20px] border border-white/[0.10] bg-paper2/80 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_-16px_rgba(0,0,0,0.55)] supports-[not(backdrop-filter:blur(1px))]:bg-paper2"
        >
            {/* Subtle top ambient light line */}
            <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${
                    auto ? 'via-emerald-400/50' : 'via-white/20'
                } to-transparent transition-colors duration-500 motion-reduce:transition-none`}
            />

            <div className="p-5 space-y-4">
                {/* Header Row: Identity, Live Status, Primary Action */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            className={`w-10 h-10 rounded-[13px] flex items-center justify-center border shrink-0 transition-colors duration-300 motion-reduce:transition-none ${
                                auto
                                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300 shadow-[0_0_24px_-6px_rgba(52,211,153,0.45)]'
                                    : 'bg-white/[0.06] border-white/[0.10] text-ink'
                            }`}
                        >
                            <Sparkles size={18} strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5">
                                <h3 className="text-[16px] font-semibold tracking-[-0.02em] leading-tight text-ink">
                                    Skipper
                                </h3>
                                <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-[0.02em] border transition-colors duration-300 motion-reduce:transition-none ${
                                        auto
                                            ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                                            : 'bg-white/[0.06] border-white/[0.10] text-muted'
                                    }`}
                                >
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                            auto ? 'bg-emerald-400 animate-pulse' : 'bg-white/35'
                                        }`}
                                    />
                                    {auto ? 'Auto · Live' : 'Manual'}
                                </span>
                            </div>
                            <p className="text-[12.5px] leading-relaxed text-muted mt-0.5 truncate">
                                {auto
                                    ? `Auto-uploading 9:16 highlights to ${channelName} · ${captionLabel}`
                                    : `Automatically frame, caption, and publish highlights to ${channelName}`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                                if (auto) {
                                    toggle(false);
                                } else {
                                    setLook(data.settings.skipper_look || defaultLook);
                                    setLayout(data.settings.skipper_layout || DEFAULT_LAYOUT);
                                    setSetup((open) => !open);
                                }
                            }}
                            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                                auto
                                    ? 'bg-white/[0.08] hover:bg-white/[0.13] text-ink border border-white/[0.12]'
                                    : 'btn-brand-accent hover:brightness-110 shadow-[0_6px_22px_-6px_rgba(227,16,132,0.55)]'
                            }`}
                        >
                            {busy && <Loader2 size={14} className="animate-spin" />}
                            {auto ? 'Switch to Manual' : setup ? 'Hide Setup' : 'Enable Auto'}
                        </button>
                    </div>
                </div>

                {/* Persistent Apple Segmented Layout Control — 1-tap framing mode toggle */}
                <div className="rounded-2xl bg-black/25 border border-white/[0.07] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <LayoutThumbnail mode={effectiveLayout} active={auto || setup} />
                        <div className="min-w-0">
                            <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">
                                9:16 Auto Frame Mode
                            </p>
                            <p className="text-[13px] font-medium text-ink tracking-[-0.01em] truncate">
                                {LAYOUT_MODES[activeLayoutIdx]?.title}
                            </p>
                            <p className="text-[11.5px] text-muted truncate">
                                {LAYOUT_MODES[activeLayoutIdx]?.subtitle}
                            </p>
                        </div>
                    </div>

                    {/* Tactile Segmented Control with critically damped sliding pill */}
                    <div
                        role="radiogroup"
                        aria-label="Skipper 9:16 framing layout"
                        className="relative grid grid-cols-2 p-1 rounded-xl bg-black/45 border border-white/[0.08] shrink-0 sm:w-[340px]"
                    >
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-[9px] bg-white/[0.13] border border-white/[0.14] shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                            style={{ transform: `translateX(${activeLayoutIdx * 100}%)` }}
                        />
                        {LAYOUT_MODES.map((mode) => {
                            const selected = effectiveLayout === mode.id;
                            return (
                                <button
                                    key={mode.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    disabled={layoutSaving || busy}
                                    onClick={() => handleQuickLayoutChange(mode.id)}
                                    className={`relative z-10 px-2.5 py-1.5 rounded-[9px] text-[12px] font-medium tracking-[-0.01em] text-center transition-colors duration-150 active:scale-[0.98] motion-reduce:transition-none ${
                                        selected ? 'text-ink' : 'text-muted hover:text-ink2'
                                    }`}
                                >
                                    {mode.shortLabel}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Smoothly Expandable Auto Setup Panel (Interruptible & Spatially Consistent) */}
                <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                        setup && !auto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                >
                    <div className="overflow-hidden">
                        <fieldset
                            disabled={busy || !(setup && !auto)}
                            className="pt-2 space-y-4"
                        >
                            <div className="rounded-2xl bg-black/25 border border-white/[0.08] p-4 space-y-4">
                                {/* Destination Summary Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
                                    <div>
                                        <legend className="text-[14px] font-semibold tracking-[-0.015em] text-ink">
                                            Configure Auto Mode
                                        </legend>
                                        <p className="text-[12px] text-muted mt-0.5">
                                            Applies to future captured highlights. Switching back to Manual keeps past items intact.
                                        </p>
                                    </div>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.09] text-[11.5px] text-ink2">
                                        <Youtube size={13} className="text-rose-400 shrink-0" />
                                        <span className="truncate max-w-[180px]">
                                            {data.channel?.title || data.settings.skipper_name || 'Connect YouTube in Publishing'}
                                        </span>
                                        <span className="text-muted">· 9:16</span>
                                    </span>
                                </div>

                                {/* Visual Layout Cards */}
                                <div className="space-y-2">
                                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                                        Framing Layout
                                    </p>
                                    <div className="grid sm:grid-cols-2 gap-2.5">
                                        {LAYOUT_MODES.map((mode) => {
                                            const active = layout === mode.id;
                                            return (
                                                <button
                                                    key={mode.id}
                                                    type="button"
                                                    onClick={() => setLayout(mode.id)}
                                                    className={`group text-left p-3 rounded-2xl border flex items-center gap-3 transition-all duration-200 ease-out active:scale-[0.985] motion-reduce:transition-none ${
                                                        active
                                                            ? 'bg-white/[0.09] border-brass/70 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
                                                            : 'bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.15]'
                                                    }`}
                                                >
                                                    <LayoutThumbnail mode={mode.id} active={active} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink truncate">
                                                                {mode.title}
                                                            </span>
                                                            {mode.badge && (
                                                                <span className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[10px] font-medium text-ink2">
                                                                    {mode.badge}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11.5px] text-muted leading-snug mt-0.5">
                                                            {mode.subtitle}
                                                        </p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Caption Look Picker */}
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                                            Caption Style
                                        </p>
                                        {!frame && (
                                            <span className="text-[11px] text-muted">
                                                Sample preview · waiting for a captured frame
                                            </span>
                                        )}
                                    </div>
                                    <div className="max-w-lg">
                                        <LookPicker look={look} onChange={setLook} frame={frame} />
                                    </div>
                                </div>

                                {/* Setup Actions */}
                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.07]">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSetup(false);
                                            setError('');
                                        }}
                                        className="px-4 py-2 rounded-full text-[13px] font-medium text-muted hover:text-ink hover:bg-white/[0.06] transition-colors active:scale-[0.97] motion-reduce:transition-none"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggle(true)}
                                        className="btn-brand-accent inline-flex items-center gap-2 px-5 py-2 rounded-full text-[13px] font-semibold tracking-[-0.01em] hover:brightness-110 shadow-[0_6px_22px_-6px_rgba(227,16,132,0.55)] transition-all active:scale-[0.97] motion-reduce:transition-none"
                                    >
                                        {busy && <Loader2 size={14} className="animate-spin" />}
                                        Start Auto Mode
                                    </button>
                                </div>
                            </div>
                        </fieldset>
                    </div>
                </div>

                {/* Inline Error Feedback */}
                {error && (
                    <div
                        role="alert"
                        className="flex items-start justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-200 text-[12.5px]"
                    >
                        <div className="flex items-start gap-2 min-w-0">
                            <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                            <span className="leading-snug break-words">{error}</span>
                        </div>
                        <button
                            type="button"
                            aria-label="Dismiss error"
                            onClick={() => setError('')}
                            className="p-0.5 rounded-md text-rose-300/70 hover:text-rose-100 hover:bg-rose-500/20 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Recent Auto-Publishing Activity */}
                {liveItems.length > 0 && (
                    <div className="pt-1 border-t border-white/[0.07]">
                        <button
                            type="button"
                            onClick={() => setShowActivity((v) => !v)}
                            className="w-full flex items-center justify-between py-1.5 text-left group"
                        >
                            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted group-hover:text-ink2 transition-colors">
                                <Tv size={12} />
                                Recent Auto Uploads
                                <span className="px-1.5 py-0.5 rounded-full bg-white/[0.07] text-[10px] tabular-nums text-ink2">
                                    {liveItems.length}
                                </span>
                            </span>
                            <ChevronDown
                                size={14}
                                className={`text-muted transition-transform duration-200 motion-reduce:transition-none ${
                                    showActivity ? 'rotate-180' : ''
                                }`}
                            />
                        </button>

                        {showActivity && (
                            <div className="mt-1.5 divide-y divide-white/[0.05] rounded-xl bg-black/20 border border-white/[0.06] overflow-hidden">
                                {liveItems.map((item) => {
                                    const firstErrorLine = item.error ? String(item.error).split('\n')[0] : '';
                                    const itemLayout = item.layout === 'blurred_center' ? 'Centered Blur' : 'Split';
                                    return (
                                        <div
                                            key={item.id}
                                            className="px-3 py-2 flex items-center justify-between gap-3 text-[12.5px] hover:bg-white/[0.02] transition-colors"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-ink font-medium truncate">
                                                        {item.title}
                                                    </span>
                                                    <span className="text-[10.5px] text-muted px-1.5 py-0.5 rounded bg-white/[0.05] shrink-0">
                                                        {itemLayout}
                                                    </span>
                                                </div>
                                                {item.status === 'attention' && firstErrorLine && (
                                                    <p className="text-[11px] text-rose-300/90 truncate mt-0.5" title={item.error}>
                                                        {firstErrorLine}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {item.video_id && (
                                                    <a
                                                        href={`https://youtube.com/shorts/${item.video_id}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink transition-colors"
                                                        title="Open on YouTube"
                                                    >
                                                        <CheckCircle2 size={12} className="text-emerald-400" />
                                                        <ExternalLink size={11} />
                                                    </a>
                                                )}
                                                <StatusPill status={item.status} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
