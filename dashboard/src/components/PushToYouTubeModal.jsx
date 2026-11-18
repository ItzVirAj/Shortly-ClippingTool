import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  Tag,
  X,
  Youtube,
} from 'lucide-react';
import { apiJson } from '../lib/api';
import { getApiUrl } from '../config';

const EMOJI_PALETTE = [
  '😱', '🔥', '💀', '🚨', '🎮', '🤯', '😂',
  '💥', '⚡', '🏆', '👀', '💯', '👑', '🚀',
];

function buildInitialDraft(clip, defaults) {
  const defaultTitle = (defaults?.title || '').trim();
  const defaultDesc = (defaults?.description || '').trim();
  const defaultTags = Array.isArray(defaults?.tags) ? defaults.tags.join(', ') : '';

  const clipTitle = (clip.title || '').trim();
  const clipDesc = (clip.description || '').trim();

  return {
    clip_id: clip.clip_id || clip.id || null,
    job_id: clip.job_id || null,
    filename: clip.filename || null,
    video_url: clip.video_url || clip.view_url || null,
    title: (clipTitle || defaultTitle || 'Viral Short 🔥').slice(0, 100),
    description: clipDesc && defaultDesc && !clipDesc.includes(defaultDesc)
      ? `${clipDesc}\n\n${defaultDesc}`.slice(0, 5000)
      : (clipDesc || defaultDesc || '#Shorts #Gaming').slice(0, 5000),
    tagsText: defaultTags,
    privacy: 'public',
    made_for_kids: false,
    useSchedule: false,
    publishAtLocal: '',
  };
}

export default function PushToYouTubeModal({
  clips = [],
  onClose,
  onConnectYouTube,
  onSuccess,
}) {
  const [channel, setChannel] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [drafts, setDrafts] = useState(() => clips.map((c) => buildInitialDraft(c, null)));
  const [activeIdx, setActiveIdx] = useState(0);
  const [applyToAll, setApplyToAll] = useState(false);
  const [activeField, setActiveField] = useState('title'); // 'title' | 'description'

  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState('');
  const [pushedIds, setPushedIds] = useState([]);
  const [liveStatusMap, setLiveStatusMap] = useState({});

  const pollRef = useRef(null);

  // Load connected channel + configured .env defaults
  useEffect(() => {
    let alive = true;
    setLoadingMeta(true);
    apiJson('/api/publishing')
      .then((data) => {
        if (!alive) return;
        setChannel(data?.channel || null);
        const defs = data?.defaults || {};
        setDefaults(defs);
        setDrafts(clips.map((c) => buildInitialDraft(c, defs)));
      })
      .catch(() => {
        if (alive) setDrafts(clips.map((c) => buildInitialDraft(c, null)));
      })
      .finally(() => {
        if (alive) setLoadingMeta(false);
      });
    return () => { alive = false; };
  }, [clips]);

  // Escape to close
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !pushing) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pushing]);

  // Poll live upload statuses once pushed
  useEffect(() => {
    if (!pushedIds.length) return undefined;
    let alive = true;
    const poll = async () => {
      try {
        const data = await apiJson('/api/publishing');
        if (!alive) return;
        const map = {};
        for (const it of data?.items || []) {
          if (pushedIds.includes(it.id)) map[it.id] = it;
        }
        setLiveStatusMap(map);
      } catch (_) {}
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pushedIds]);

  const current = drafts[activeIdx] || drafts[0];

  const updateField = (key, value) => {
    setDrafts((prev) =>
      prev.map((d, idx) => {
        if (applyToAll || idx === activeIdx) {
          return { ...d, [key]: value };
        }
        return d;
      }),
    );
  };

  const insertEmoji = (emoji) => {
    if (!current) return;
    if (activeField === 'description') {
      const next = `${current.description || ''}${current.description && !current.description.endsWith(' ') ? ' ' : ''}${emoji}`.slice(0, 5000);
      updateField('description', next);
    } else {
      const next = `${current.title || ''}${current.title && !current.title.endsWith(' ') ? ' ' : ''}${emoji}`.slice(0, 100);
      updateField('title', next);
    }
  };

  const handleUseDefaults = () => {
    if (!defaults) return;
    setDrafts((prev) =>
      prev.map((d, idx) => {
        if (!applyToAll && idx !== activeIdx) return d;
        return {
          ...d,
          title: (defaults.title || d.title).slice(0, 100),
          description: (defaults.description || d.description).slice(0, 5000),
          tagsText: Array.isArray(defaults.tags) ? defaults.tags.join(', ') : d.tagsText,
        };
      }),
    );
  };

  const handlePush = async () => {
    setError('');
    for (let i = 0; i < drafts.length; i++) {
      if (!drafts[i].title.trim()) {
        setActiveIdx(i);
        setError(`Clip ${i + 1} needs a YouTube title.`);
        return;
      }
      if (drafts[i].useSchedule && !drafts[i].publishAtLocal) {
        setActiveIdx(i);
        setError(`Select a schedule date/time for Clip ${i + 1}, or turn off scheduling.`);
        return;
      }
    }

    setPushing(true);
    try {
      const payloadItems = drafts.map((d) => {
        const tags = (d.tagsText || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 50);
        let publish_at = null;
        let privacy = d.privacy;
        if (d.useSchedule && d.publishAtLocal) {
          publish_at = new Date(d.publishAtLocal).toISOString();
          privacy = 'public';
        }
        return {
          clip_id: d.clip_id,
          job_id: d.job_id,
          filename: d.filename,
          title: d.title.trim().slice(0, 100),
          description: (d.description || '').slice(0, 5000),
          tags,
          privacy,
          made_for_kids: Boolean(d.made_for_kids),
          publish_at,
        };
      });

      const res = await apiJson('/api/publishing/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payloadItems, auto_start: true }),
      });

      const ids = (res?.items || []).map((it) => it.id);
      setPushedIds(ids);
      const initialMap = {};
      for (const it of res?.items || []) initialMap[it.id] = it;
      setLiveStatusMap(initialMap);
      onSuccess?.(res?.items || []);
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to push video(s) to YouTube.');
    } finally {
      setPushing(false);
    }
  };

  const allFinished = useMemo(() => {
    if (!pushedIds.length) return false;
    return pushedIds.every((id) => {
      const st = liveStatusMap[id]?.status;
      return ['published', 'scheduled', 'processing', 'attention', 'cancelled'].includes(st);
    });
  }, [pushedIds, liveStatusMap]);

  if (!clips.length || typeof document === 'undefined') return null;

  const modalNode = (
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-fade"
      onClick={() => !pushing && onClose?.()}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-[#12131b]/95 border border-white/[0.12] border-t-white/[0.22] shadow-[0_28px_80px_rgba(0,0,0,0.75)] backdrop-blur-2xl overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-white/[0.08] bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-[#e31084]/18 border border-[#e31084]/40 flex items-center justify-center text-[#ff66b2] shrink-0">
              <Youtube size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-[-0.015em] text-white flex items-center gap-2">
                <span>Push Directly to YouTube</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/[0.08] border border-white/10 text-white/85 tabular-nums">
                  {clips.length} {clips.length === 1 ? 'video' : 'videos'}
                </span>
              </h2>
              <p className="text-[11.5px] text-white/55 truncate">
                Direct YouTube upload pipeline · skips Live Clipper rendering
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={pushing}
            onClick={onClose}
            className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-4">
          {/* Channel Status Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-xs">
            {loadingMeta ? (
              <span className="flex items-center gap-2 text-white/60">
                <Loader2 size={13} className="animate-spin" /> Checking connected YouTube channel…
              </span>
            ) : channel?.title ? (
              <span className="flex items-center gap-2 text-white/90">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                <span>Uploading to</span>
                <strong className="text-white">{channel.title}</strong>
              </span>
            ) : (
              <div className="flex items-center justify-between gap-3 w-full">
                <span className="flex items-center gap-2 text-amber-300">
                  <AlertCircle size={14} /> No YouTube channel connected yet.
                </span>
                {onConnectYouTube && (
                  <button
                    type="button"
                    onClick={onConnectYouTube}
                    className="btn-brand-accent px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer"
                  >
                    Connect YouTube
                  </button>
                )}
              </div>
            )}

            {defaults && (defaults.title || defaults.description) && !pushedIds.length && (
              <button
                type="button"
                onClick={handleUseDefaults}
                className="text-[11px] font-medium text-[#ff7dc2] hover:text-pink-200 transition-colors cursor-pointer flex items-center gap-1"
                title="Fill configured .env default GTA title, hashtags & tags"
              >
                <Sparkles size={11} />
                <span>Apply Default Preset</span>
              </button>
            )}
          </div>

          {pushedIds.length > 0 ? (
            /* Live Upload Progress View */
            <div className="space-y-3 animate-fade">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] font-mono text-white/75">
                  Direct Upload Status
                </h3>
                <span className="text-[11px] text-white/50">
                  {allFinished ? 'All uploads processed' : 'Uploading directly to YouTube…'}
                </span>
              </div>

              <div className="space-y-2">
                {pushedIds.map((id, i) => {
                  const st = liveStatusMap[id] || { status: 'queued', title: drafts[i]?.title };
                  const status = st.status || 'queued';
                  const isDone = status === 'published' || status === 'scheduled' || status === 'processing';
                  const isErr = status === 'attention';
                  const ytUrl = st.video_id ? `https://youtube.com/shorts/${st.video_id}` : null;
                  return (
                    <div
                      key={id}
                      className="p-3.5 rounded-2xl bg-black/35 border border-white/[0.08] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-medium text-white truncate">{st.title || `Clip ${i + 1}`}</p>
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          {isDone ? (
                            <span className="text-emerald-300 flex items-center gap-1 capitalize">
                              <CheckCircle2 size={12} /> {status}
                            </span>
                          ) : isErr ? (
                            <span className="text-rose-300 flex items-center gap-1">
                              <AlertCircle size={12} /> {st.error || 'Upload attention required'}
                            </span>
                          ) : (
                            <span className="text-[#ff7dc2] flex items-center gap-1 capitalize">
                              <Loader2 size={12} className="animate-spin" /> {status}
                              {st.bytes_sent > 0 ? ` (${(st.bytes_sent / (1024 * 1024)).toFixed(1)} MB)` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {ytUrl && (
                        <a
                          href={ytUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-[11px] font-medium text-white no-underline shrink-0"
                        >
                          <span>YouTube</span>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-white/45 leading-relaxed">
                Uploads continue safely in the background if you close this window. You can also view full history in the Publishing tab.
              </p>
            </div>
          ) : (
            /* Metadata Form View */
            <div className="space-y-4">
              {/* Multi-clip switcher + Apply-to-all toggle */}
              {drafts.length > 1 && (
                <div className="space-y-2.5 p-3 rounded-2xl bg-black/30 border border-white/[0.08]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-white/60">
                      Editing Clip {activeIdx + 1} of {drafts.length}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={applyToAll}
                        onChange={(e) => setApplyToAll(e.target.checked)}
                        className="accent-[#e31084] rounded w-3.5 h-3.5"
                      />
                      <span>Apply title &amp; description to all {drafts.length} clips</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {drafts.map((d, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveIdx(idx)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-all cursor-pointer active:scale-95 ${
                          activeIdx === idx
                            ? 'bg-[#e31084] text-white font-semibold shadow-sm'
                            : 'bg-white/[0.06] text-white/70 hover:text-white border border-white/10'
                        }`}
                      >
                        #{idx + 1} · {(d.title || 'Clip').slice(0, 18)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Clip Preview + Quick Emoji Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                {current?.video_url && (
                  <div className="sm:col-span-4 aspect-[9/16] max-h-[260px] mx-auto w-full rounded-2xl overflow-hidden bg-black border border-white/10 shadow-inner">
                    <video
                      src={getApiUrl(current.video_url)}
                      controls
                      preload="metadata"
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                <div className={`${current?.video_url ? 'sm:col-span-8' : 'sm:col-span-12'} space-y-3`}>
                  {/* Title */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label className="font-medium text-white/80">YouTube Title</label>
                      <span className="font-mono text-white/45 tabular-nums">
                        {(current?.title || '').length}/100
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={100}
                      value={current?.title || ''}
                      onFocus={() => setActiveField('title')}
                      onChange={(e) => updateField('title', e.target.value)}
                      placeholder="GTA 6 Has Something INSANE! 😱"
                      className="w-full h-10 px-3.5 text-xs sm:text-sm rounded-xl bg-black/40 border border-white/[0.12] text-white placeholder-white/30 focus:border-[#e31084] focus:outline-none"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label className="font-medium text-white/80">Description &amp; Hashtags</label>
                      <span className="font-mono text-white/45 tabular-nums">
                        {(current?.description || '').length}/5000
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      maxLength={5000}
                      value={current?.description || ''}
                      onFocus={() => setActiveField('description')}
                      onChange={(e) => updateField('description', e.target.value)}
                      placeholder="Add description, emojis 🔥 and #hashtags..."
                      className="w-full p-3 text-xs rounded-xl bg-black/40 border border-white/[0.12] text-white placeholder-white/30 focus:border-[#e31084] focus:outline-none resize-y leading-relaxed"
                    />
                  </div>

                  {/* Quick Emoji Bar */}
                  <div className="space-y-1">
                    <span className="text-[10.5px] text-white/50 block">
                      Click an emoji to insert into <strong className="text-white/80">{activeField}</strong>:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {EMOJI_PALETTE.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => insertEmoji(em)}
                          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.14] border border-white/[0.08] flex items-center justify-center text-sm transition-all active:scale-90 cursor-pointer"
                          title={`Insert ${em} into ${activeField}`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-white/80 flex items-center gap-1.5">
                  <Tag size={11} className="text-[#ff66b2]" />
                  <span>YouTube Tags (comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={current?.tagsText || ''}
                  onChange={(e) => updateField('tagsText', e.target.value)}
                  placeholder="GTA 6, GTA 5, GTA Shorts, Gaming Shorts"
                  className="w-full h-9 px-3 text-xs rounded-xl bg-black/40 border border-white/[0.12] text-white placeholder-white/30 focus:border-[#e31084] focus:outline-none font-mono"
                />
              </div>

              {/* Privacy + Made for Kids + Optional Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-white/80 block">Visibility</label>
                  <div className="grid grid-cols-3 p-1 rounded-xl bg-black/40 border border-white/10 gap-1 text-xs">
                    {['public', 'unlisted', 'private'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        disabled={current?.useSchedule && p !== 'public'}
                        onClick={() => updateField('privacy', p)}
                        className={`py-1.5 rounded-lg capitalize font-medium transition-all cursor-pointer ${
                          current?.privacy === p
                            ? 'bg-white/15 text-white border border-white/20'
                            : 'text-white/55 hover:text-white border border-transparent'
                        } disabled:opacity-35`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 flex flex-col justify-end">
                  <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(current?.useSchedule)}
                      onChange={(e) => {
                        updateField('useSchedule', e.target.checked);
                        if (e.target.checked) updateField('privacy', 'public');
                      }}
                      className="accent-[#e31084] w-3.5 h-3.5"
                    />
                    <Calendar size={12} className="text-[#ff66b2]" />
                    <span>Schedule publish time</span>
                  </label>
                  {current?.useSchedule && (
                    <input
                      type="datetime-local"
                      value={current?.publishAtLocal || ''}
                      onChange={(e) => updateField('publishAtLocal', e.target.value)}
                      className="h-8 px-2.5 text-xs rounded-lg bg-black/40 border border-white/15 text-white focus:border-[#e31084] focus:outline-none"
                    />
                  )}
                  <label className="flex items-center gap-2 text-[11.5px] text-white/60 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(current?.made_for_kids)}
                      onChange={(e) => updateField('made_for_kids', e.target.checked)}
                      className="accent-[#e31084] w-3.5 h-3.5"
                    />
                    <span>Made for kids</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-white/[0.08] bg-white/[0.02] shrink-0">
          <button
            type="button"
            disabled={pushing}
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-medium text-white/75 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-all cursor-pointer"
          >
            {pushedIds.length > 0 ? 'Done (Keep Uploading)' : 'Cancel'}
          </button>

          {!pushedIds.length && (
            <button
              type="button"
              disabled={pushing || loadingMeta || !channel?.title}
              onClick={handlePush}
              className="btn-brand-accent inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-40"
            >
              {pushing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Starting Direct Upload…</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>
                    Push &amp; Upload to YouTube ({drafts.length})
                  </span>
                </>
              )}
            </button>
          )}
        </footer>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}
