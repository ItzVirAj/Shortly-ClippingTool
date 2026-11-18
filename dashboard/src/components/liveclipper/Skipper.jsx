import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiJson } from '../../lib/api';
import { getApiUrl } from '../../config';
import SkipperPortrait from './SkipperPortrait';
import { LookPicker } from '../../captions/CaptionPanel';
import { defaultLook, useClipFrame } from '../../captions/clipCaptionState';
import WebcamBoxPicker from '../WebcamBoxPicker';

const DEFAULT_LAYOUT = 'streamer_bottom';

const LAYOUT_MODES = [
  {
    id: 'streamer_bottom',
    title: 'Stream Top · Cam Bottom',
  },
  {
    id: 'blurred_center',
    title: 'Single Centered · Blur',
  },
];

function StatusPill({ status }) {
  const map = {
    published: {
      label: 'Published',
      dot: 'bg-emerald-400',
      text: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    },
    processing: {
      label: 'Processing',
      dot: 'bg-sky-400 animate-pulse',
      text: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
    },
    uploading: {
      label: 'Uploading',
      dot: 'bg-sky-400 animate-pulse',
      text: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
    },
    queued: {
      label: 'Queued',
      dot: 'bg-amber-300',
      text: 'text-amber-200 bg-amber-500/10 border-amber-500/20',
    },
    metadata: {
      label: 'Metadata',
      dot: 'bg-purple-400 animate-pulse',
      text: 'text-purple-200 bg-purple-500/10 border-purple-500/20',
    },
    editing: {
      label: 'Rendering',
      dot: 'bg-brass animate-pulse',
      text: 'text-ink bg-white/[0.08] border-white/[0.12]',
    },
    attention: {
      label: 'Attention',
      dot: 'bg-rose-400',
      text: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
    },
    cancelled: {
      label: 'Cancelled',
      dot: 'bg-white/30',
      text: 'text-muted bg-white/[0.04] border-white/[0.08]',
    },
  };
  const meta = map[status] || {
    label: status,
    dot: 'bg-white/40',
    text: 'text-muted bg-white/[0.05] border-white/[0.08]',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium tracking-[0.01em] shrink-0 ${meta.text}`}
    >
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
  const [mirror, setMirror] = useState(false);
  const [mirrorSaving, setMirrorSaving] = useState(false);
  const [webcamMode, setWebcamMode] = useState('auto');
  const [webcamBox, setWebcamBox] = useState(null);
  const [webcamSaving, setWebcamSaving] = useState(false);
  const [snapshotTick, setSnapshotTick] = useState(() => Date.now());
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!data)
    return (
      <p role="status">{loadError ? 'Skipper could not connect. Retrying…' : 'Connecting to Skipper…'}</p>
    );

  const auto = !!data.settings.skipper;
  const saved = data.settings.skipper_look;
  const activeLayout = data.settings.skipper_layout || DEFAULT_LAYOUT;
  const effectiveLayout = (setup && !auto) || layoutSaving ? layout : activeLayout;
  const activeMirror = !!data.settings.skipper_mirror;
  const effectiveMirror = (setup && !auto) || mirrorSaving ? mirror : activeMirror;
  const activeWebcamMode = data.settings.skipper_webcam_mode || 'auto';
  const activeWebcamBox = data.settings.skipper_webcam_box || null;
  const effectiveWebcamMode = (setup && !auto) || webcamSaving ? webcamMode : activeWebcamMode;
  const effectiveWebcamBox = (setup && !auto) || webcamSaving ? webcamBox : activeWebcamBox;
  const snapshotUrl = getApiUrl(`/api/liveclipper/snapshot?t=${snapshotTick}`);

  const captionLabel =
    saved?.captionsEnabled === false
      ? 'Captions off'
      : saved
        ? (saved.captionStyleId || 'Default') + ' captions'
        : 'Default captions';

  const channelName = data.channel?.title || data.settings.skipper_name || 'your connected YouTube channel';
  const liveItems = (data.items || []).filter((i) => i.clip_key?.startsWith('live:')).slice(0, 8);

  async function toggle(enabled) {
    setBusy(true);
    try {
      await apiJson('/api/publishing/skipper', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          ...(enabled
            ? {
                look,
                layout: effectiveLayout,
                mirror: effectiveMirror,
                webcam_mode: effectiveWebcamMode,
                webcam_box: effectiveWebcamMode === 'custom' ? effectiveWebcamBox : null,
              }
            : {}),
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

  async function handleQuickMirrorToggle(nextMirror) {
    if (mirrorSaving) return;
    const previous = effectiveMirror;
    setMirror(nextMirror);
    if (setup && !auto) return;
    setMirrorSaving(true);
    try {
      await apiJson('/api/publishing/skipper', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mirror: nextMirror }),
      });
      setError('');
      await refresh();
    } catch (e) {
      setMirror(previous);
      setError(e.message || 'Could not update mirror setting');
    } finally {
      setMirrorSaving(false);
    }
  }

  async function handleQuickWebcamChange({ webcam_mode: nextMode, webcam_box: nextBox }) {
    if (webcamSaving) return;
    const prevMode = effectiveWebcamMode;
    const prevBox = effectiveWebcamBox;
    setWebcamMode(nextMode);
    setWebcamBox(nextBox ?? null);
    if (setup && !auto) return;
    setWebcamSaving(true);
    try {
      await apiJson('/api/publishing/skipper', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webcam_mode: nextMode,
          webcam_box: nextMode === 'custom' ? nextBox : null,
        }),
      });
      setError('');
      await refresh();
    } catch (e) {
      setWebcamMode(prevMode);
      setWebcamBox(prevBox);
      setError(e.message || 'Could not update webcam box');
    } finally {
      setWebcamSaving(false);
    }
  }

  return (
    <section className="lc-bot" aria-label="Skipper Auto Publisher">
      <header className="lc-heading">
        <div>
          <h2>Skipper</h2>
          <p>
            {auto
              ? 'Automatically publishing to ' + channelName
              : 'Frame, caption, and publish captured highlights.'}
          </p>
        </div>
        <div className="lc-bot-badge">
          <SkipperPortrait />
          <span className="lc-state">{auto ? 'Auto on' : 'Manual'}</span>
        </div>
      </header>
      <div className="lc-summary">
        <span>YouTube destination</span>
        <strong>
          {data.channel?.title || data.settings.skipper_name || 'Connect YouTube in Publishing'}
        </strong>
      </div>
      <div className="lc-summary">
        <span>Output</span>
        <strong>9:16 · {captionLabel}</strong>
      </div>
      <label className="lc-field">
        Framing
        <select
          value={effectiveLayout}
          disabled={busy || layoutSaving}
          onChange={(e) => handleQuickLayoutChange(e.target.value)}
        >
          {LAYOUT_MODES.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.title}
            </option>
          ))}
        </select>
      </label>
      {effectiveLayout === 'streamer_bottom' && (
        <WebcamBoxPicker
          mode={effectiveWebcamMode}
          box={effectiveWebcamBox}
          previewSrc={snapshotUrl}
          onRefreshPreview={() => setSnapshotTick(Date.now())}
          disabled={busy || webcamSaving}
          onChange={handleQuickWebcamChange}
        />
      )}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
        <div className="min-w-0">
          <span className="text-xs font-medium text-white block">Mirror video</span>
          <span className="text-[11px] text-white/50 block leading-tight">
            Flip horizontally before Whisper &amp; captions (subtitles stay normal)
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            checked={effectiveMirror}
            disabled={busy || mirrorSaving}
            onChange={(e) => handleQuickMirrorToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#e31084] shadow-inner" />
        </label>
      </div>
      {setup && !auto ? (
        <div className="lc-bot-setup">
          <h3>Caption style</h3>
          <LookPicker look={look} onChange={setLook} frame={frame} />
          <p>New highlights will publish publicly to {channelName}.</p>
          <footer>
            <button disabled={busy} className="lc-primary" onClick={() => toggle(true)}>
              Start auto mode
            </button>
            <button disabled={busy} onClick={() => setSetup(false)}>
              Cancel
            </button>
          </footer>
        </div>
      ) : (
        <button
          disabled={busy || layoutSaving}
          className="lc-primary"
          onClick={() => {
            if (auto) toggle(false);
            else {
              setLook(saved || defaultLook);
              setLayout(activeLayout);
              setMirror(activeMirror);
              setWebcamMode(activeWebcamMode);
              setWebcamBox(activeWebcamBox);
              setSetup(true);
            }
          }}
        >
          {busy ? 'Saving…' : auto ? 'Switch to manual' : 'Set up auto mode'}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      <section className="lc-activity">
        <h3>Recent uploads</h3>
        {liveItems.length === 0 && <p>No automated uploads yet.</p>}
        {liveItems.map((item) => (
          <div className="lc-upload" key={item.id}>
            <div>
              <strong>{item.title || 'Untitled clip'}</strong>
              {item.error && <p>{item.error}</p>}
            </div>
            <StatusPill status={item.status} />
            {item.video_id && (
              <a
                href={`https://youtube.com/shorts/${item.video_id}`}
                target="_blank"
                rel="noreferrer"
                aria-label={'Open ' + item.title + ' on YouTube'}
              >
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        ))}
      </section>
    </section>
  );
}
