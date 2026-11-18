import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    Clock,
    ExternalLink,
    Film,
    Loader2,
    Pause,
    Play,
    RefreshCw,
    Send,
    Trash2,
    X,
    Youtube,
} from 'lucide-react';
import { apiJson } from '../lib/api';
import { getApiUrl } from '../config';

const GROUPS = [
    { id: 'Review', statuses: ['draft'] },
    { id: 'Queue', statuses: ['editing', 'metadata', 'queued', 'uploading', 'processing', 'scheduled'] },
    { id: 'Published', statuses: ['published', 'uploaded'] },
    { id: 'Needs attention', statuses: ['attention'] },
];

function StatusPill({ status }) {
    const map = {
        published: { label: 'Published', dot: 'bg-emerald-400', tone: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/25' },
        uploaded: { label: 'Uploaded', dot: 'bg-emerald-400', tone: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/25' },
        scheduled: { label: 'Scheduled', dot: 'bg-sky-400', tone: 'text-sky-300 bg-sky-500/12 border-sky-500/25' },
        processing: { label: 'Processing', dot: 'bg-sky-400 animate-pulse', tone: 'text-sky-300 bg-sky-500/12 border-sky-500/25' },
        uploading: { label: 'Uploading', dot: 'bg-sky-400 animate-pulse', tone: 'text-sky-300 bg-sky-500/12 border-sky-500/25' },
        queued: { label: 'Queued', dot: 'bg-amber-300', tone: 'text-amber-200 bg-amber-500/12 border-amber-500/25' },
        metadata: { label: 'Metadata', dot: 'bg-purple-400 animate-pulse', tone: 'text-purple-200 bg-purple-500/12 border-purple-500/25' },
        editing: { label: 'Rendering', dot: 'bg-[#e31084] animate-pulse', tone: 'text-pink-200 bg-[#e31084]/15 border-[#e31084]/30' },
        draft: { label: 'Draft', dot: 'bg-white/45', tone: 'text-white/80 bg-white/[0.07] border-white/[0.12]' },
        attention: { label: 'Attention', dot: 'bg-rose-400', tone: 'text-rose-300 bg-rose-500/12 border-rose-500/25' },
    };
    const meta = map[status] || { label: status, dot: 'bg-white/40', tone: 'text-white/70 bg-white/[0.06] border-white/[0.10]' };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium shrink-0 ${meta.tone}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
        </span>
    );
}

export default function PublishingTab({ onConnect }) {
    const [data, setData] = useState(null);
    const [tab, setTab] = useState('Review');
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setData(await apiJson('/api/publishing'));
        } catch (e) {
            setError(String(e.detail || e.message));
        }
    }, []);

    useEffect(() => {
        load();
        const timer = setInterval(load, 5000);
        return () => clearInterval(timer);
    }, [load]);

    const call = async (path, method, body) => {
        setBusy(true);
        setError('');
        try {
            const result = await apiJson(`/api/publishing${path}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            await load();
            return result;
        } catch (e) {
            setError(typeof e.detail === 'string' ? e.detail : e.message);
            return null;
        } finally {
            setBusy(false);
        }
    };

    if (!data) {
        return (
            <div className="max-w-6xl mx-auto p-6 md:p-8 flex items-center gap-3 text-sm text-white/70">
                <Loader2 size={16} className="animate-spin text-[#e31084]" />
                <span>{error || 'Loading publishing queue…'}</span>
            </div>
        );
    }

    const activeGroup = GROUPS.find((g) => g.id === tab) || GROUPS[0];
    const items = data.items.filter((i) => activeGroup.statuses.includes(i.status));
    const paused = !!data.settings.paused;

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8 space-y-6 animate-fade">
            {/* Unified Apple Glass Header Banner */}
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-white/[0.08]">
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.12] backdrop-blur-xl">
                        <span className={`w-2 h-2 rounded-full ${paused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                        <span className="text-[11px] font-medium tracking-[0.06em] text-white/80 font-mono uppercase">
                            {paused ? 'Queue Paused' : 'Automation Ready'}
                        </span>
                    </div>
                    <h1 className="font-display text-3xl sm:text-4xl text-white tracking-[-0.025em]">
                        Publishing
                    </h1>
                    <p className="text-white/60 text-xs sm:text-sm leading-relaxed flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-white/85 font-medium">
                            <Youtube size={14} className="text-rose-400" />
                            {data.channel?.title || 'YouTube not connected'}
                        </span>
                        <span className="text-white/30">·</span>
                        <span>Pause stops new manual transfers; accepted Skipper clips and scheduled uploads continue.</span>
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                        type="button"
                        className="btn-ghost px-4 py-2 text-xs"
                        onClick={onConnect}
                    >
                        <Youtube size={14} className="text-rose-400" />
                        <span>{data.channel ? 'Manage YouTube' : 'Connect YouTube'}</span>
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        className="btn-brand-accent inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium"
                        onClick={() => call('/settings', 'PUT', { paused: !paused })}
                    >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : paused ? <Play size={13} /> : <Pause size={13} />}
                        <span>{paused ? 'Resume Queue' : 'Pause Queue'}</span>
                    </button>
                </div>
            </header>

            {error && (
                <div
                    role="alert"
                    className="flex items-start justify-between gap-3 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-200 text-xs backdrop-blur-xl"
                >
                    <div className="flex items-start gap-2">
                        <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                        <span>{error}</span>
                    </div>
                    <button
                        type="button"
                        aria-label="Dismiss error"
                        onClick={() => setError('')}
                        className="text-rose-300/70 hover:text-rose-100"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Apple Segmented Filter Tabs */}
            <div
                role="tablist"
                aria-label="Publishing status groups"
                className="inline-flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-black/30 border border-white/[0.08] backdrop-blur-xl"
            >
                {GROUPS.map((group) => {
                    const count = data.items.filter((i) => group.statuses.includes(i.status)).length;
                    const active = tab === group.id;
                    return (
                        <button
                            key={group.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setTab(group.id)}
                            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                                active
                                    ? 'bg-white/[0.13] text-white border border-white/[0.16] shadow-[0_2px_10px_rgba(0,0,0,0.3)]'
                                    : 'text-white/60 hover:text-white hover:bg-white/[0.05] border border-transparent'
                            }`}
                        >
                            <span>{group.id}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums ${
                                active ? 'bg-[#e31084] text-white' : 'bg-white/[0.08] text-white/65'
                            }`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Queue Items List */}
            <div className="space-y-2.5">
                {items.map((item) => {
                    const firstErrorLine = item.error ? String(item.error).split('\n')[0] : '';
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelected({ ...item })}
                            className="w-full text-left card card-hover p-4 flex items-center justify-between gap-4"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-white tracking-[-0.01em] truncate">
                                        {item.title}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/55">
                                    <span>{item.channel_name}</span>
                                    {item.actual_privacy && (
                                        <>
                                            <span className="text-white/25">·</span>
                                            <span className="capitalize">{item.actual_privacy}</span>
                                        </>
                                    )}
                                    {item.publish_at && (
                                        <>
                                            <span className="text-white/25">·</span>
                                            <span className="inline-flex items-center gap-1 tabular-nums">
                                                <Clock size={11} />
                                                {new Date(item.publish_at).toLocaleString()}
                                            </span>
                                        </>
                                    )}
                                </div>
                                {item.status === 'attention' && firstErrorLine && (
                                    <p className="text-xs text-rose-300/90 truncate mt-1.5">{firstErrorLine}</p>
                                )}
                            </div>
                            <StatusPill status={item.status} />
                        </button>
                    );
                })}

                {!items.length && (
                    <div className="card p-8 text-center">
                        <p className="text-sm text-white/60">No items in {tab.toLowerCase()} yet.</p>
                    </div>
                )}
            </div>

            {/* Generated Clips Section (Review Tab) */}
            {tab === 'Review' && (
                <section className="card p-5 space-y-3">
                    <div>
                        <h2 className="text-sm font-semibold text-white tracking-[-0.01em] flex items-center gap-2">
                            <Film size={15} className="text-[#ff66b2]" />
                            Generated Clips
                        </h2>
                        <p className="text-xs text-white/55 mt-0.5">
                            Prepare a draft to freeze the current rendered video, including frames and text. Defaults to private visibility.
                        </p>
                    </div>

                    {data.clips.length === 0 ? (
                        <p className="text-xs text-white/45 py-2">No rendered clips available yet.</p>
                    ) : (
                        <div className="divide-y divide-white/[0.06] rounded-2xl bg-black/25 border border-white/[0.06] overflow-hidden">
                            {data.clips.map((clip) => (
                                <div key={clip.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors">
                                    <span className="text-xs sm:text-sm text-white/90 truncate">{clip.name}</span>
                                    <button
                                        type="button"
                                        disabled={busy || !data.channel}
                                        className="btn-ghost px-3.5 py-1.5 text-xs shrink-0"
                                        onClick={async () => {
                                            const item = await call('/items', 'POST', { clip_id: clip.id });
                                            if (item) setSelected(item);
                                        }}
                                    >
                                        Prepare draft
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* Local n8n Automation Card */}
            <details className="card p-5 group">
                <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-white tracking-[-0.01em]">
                    <span className="flex items-center gap-2">
                        <RefreshCw size={14} className="text-white/60" />
                        Local n8n Automation
                    </span>
                    <ChevronDown size={15} className="text-white/50 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="mt-4 pt-4 border-t border-white/[0.07] space-y-3 text-xs text-white/70">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${
                            data.n8n_token_configured
                                ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-300'
                                : 'bg-amber-500/12 border-amber-500/25 text-amber-200'
                        }`}>
                            <CheckCircle2 size={11} />
                            {data.n8n_token_configured ? 'Publishing token configured' : 'Set SHORTLY_PUBLISHING_TOKEN in .env'}
                        </span>
                        <span className="text-white/50 tabular-nums">
                            Last contact: {data.settings.last_contact ? new Date(data.settings.last_contact * 1000).toLocaleString() : 'None yet'}
                        </span>
                    </div>
                    <p className="text-white/55 leading-relaxed">
                        Import <code className="px-1.5 py-0.5 rounded bg-white/[0.08] text-white/85">examples/n8n/shortly-local-publishing.json</code> in n8n and keep Shortly running. A manual run triggers the same queue step.
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        className="btn-ghost px-4 py-2 text-xs"
                        onClick={() => call('/tick', 'POST', {})}
                    >
                        <Play size={12} />
                        <span>Run queue now</span>
                    </button>
                </div>
            </details>

            {/* Frosted Slide-Over Detail Sheet */}
            {selected && (
                <div
                    className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md flex justify-end animate-fade"
                    onClick={() => setSelected(null)}
                >
                    <div
                        role="dialog"
                        aria-label="Publication details"
                        className="bg-[#12131c]/95 backdrop-blur-3xl border-l border-white/[0.12] w-full max-w-xl p-6 overflow-y-auto custom-scrollbar space-y-5 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
                            <div>
                                <h2 className="text-base font-semibold text-white tracking-[-0.015em]">Publication Details</h2>
                                <p className="text-xs text-white/55 mt-0.5">{selected.channel_name}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <StatusPill status={selected.status} />
                                <button
                                    type="button"
                                    aria-label="Close"
                                    onClick={() => setSelected(null)}
                                    className="p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white transition-colors"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        </div>

                        {selected.preview_ready && (
                            <video
                                controls
                                className="w-full max-h-72 rounded-2xl bg-black border border-white/[0.08]"
                                src={getApiUrl(`/api/publishing/items/${selected.id}/preview`)}
                            />
                        )}

                        <fieldset disabled={busy || selected.status !== 'draft'} className="space-y-4">
                            <label className="block space-y-1.5">
                                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/60">Title</span>
                                <input
                                    className="input-field w-full"
                                    maxLength={100}
                                    value={selected.title}
                                    onChange={(e) => setSelected({ ...selected, title: e.target.value })}
                                />
                            </label>
                            <label className="block space-y-1.5">
                                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/60">Description</span>
                                <textarea
                                    rows={4}
                                    className="input-field w-full"
                                    maxLength={5000}
                                    value={selected.description}
                                    onChange={(e) => setSelected({ ...selected, description: e.target.value })}
                                />
                            </label>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <label className="block space-y-1.5">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/60">Visibility</span>
                                    <select
                                        className="input-field w-full"
                                        value={selected.privacy}
                                        onChange={(e) => setSelected({ ...selected, privacy: e.target.value })}
                                    >
                                        {['private', 'unlisted', 'public'].map((v) => (
                                            <option key={v}>{v}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block space-y-1.5">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/60">Schedule (optional)</span>
                                    <input
                                        type="datetime-local"
                                        className="input-field w-full"
                                        value={selected.localDate || ''}
                                        onChange={(e) =>
                                            setSelected({
                                                ...selected,
                                                localDate: e.target.value,
                                                publish_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                                            })
                                        }
                                    />
                                </label>
                            </div>
                            <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={selected.made_for_kids}
                                    onChange={(e) => setSelected({ ...selected, made_for_kids: e.target.checked })}
                                />
                                <span>Made for kids</span>
                            </label>
                        </fieldset>

                        {selected.error && (
                            <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                                {selected.error}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-white/[0.08]">
                            {selected.status === 'draft' && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    className="btn-brand-accent inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium"
                                    onClick={async () => {
                                        const saved = await call(`/items/${selected.id}`, 'PATCH', selected);
                                        if (!saved) return;
                                        setSelected(saved);
                                        const approved = await call(`/items/${saved.id}/approve`, 'POST', { revision: saved.revision });
                                        if (approved) {
                                            setSelected(approved);
                                            setTab('Queue');
                                        }
                                    }}
                                >
                                    <Send size={13} />
                                    <span>Save & approve upload</span>
                                </button>
                            )}
                            {selected.status === 'attention' && !selected.uncertain && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    className="btn-brand-accent inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium"
                                    onClick={async () => {
                                        const result = await call(`/items/${selected.id}/retry`, 'POST', { revision: selected.revision });
                                        if (result) setSelected(result);
                                    }}
                                >
                                    <RefreshCw size={13} />
                                    <span>Retry / check upload</span>
                                </button>
                            )}
                            {selected.video_id && (
                                <a
                                    className="btn-ghost px-4 py-2 text-xs inline-flex items-center gap-1.5"
                                    target="_blank"
                                    rel="noreferrer"
                                    href={`https://www.youtube.com/watch?v=${encodeURIComponent(selected.video_id)}`}
                                >
                                    <ExternalLink size={13} />
                                    <span>Open on YouTube</span>
                                </a>
                            )}
                            {['draft', 'queued', 'attention'].includes(selected.status) && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    className="btn-danger px-4 py-2 text-xs ml-auto inline-flex items-center gap-1.5"
                                    onClick={async () => {
                                        const result = await call(`/items/${selected.id}/cancel`, 'POST', { revision: selected.revision });
                                        if (result) setSelected(null);
                                    }}
                                >
                                    <Trash2 size={13} />
                                    <span>Remove</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
