import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiJson } from '../../lib/api';
import { getApiUrl } from '../../config';
import SkipperPortrait from './SkipperPortrait';
import { LookPicker } from '../../captions/CaptionPanel';
import { defaultLook, useClipFrame } from '../../captions/clipCaptionState';

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
