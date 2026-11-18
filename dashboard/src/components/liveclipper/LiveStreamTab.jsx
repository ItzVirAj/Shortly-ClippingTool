import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  HardDrive,
  Loader2,
  Play,
  Square,
  Tv,
  WifiOff,
} from 'lucide-react';
import { apiJson } from '../../lib/api';
import LiveFeedPreview from './LiveFeedPreview';
import ManualCutPanel from './ManualCutPanel';
import ReviewQueue from './ReviewQueue';

const PLATFORMS = [
  { id: 'kick', label: 'Kick', placeholder: 'e.g. xqc or https://kick.com/xqc' },
  { id: 'twitch', label: 'Twitch', placeholder: 'e.g. shroud or https://twitch.tv/shroud' },
  { id: 'youtube', label: 'YouTube', placeholder: 'e.g. https://youtube.com/watch?v=... or @channel' },
];

const BUFFER_PRESETS = [
  { label: '8 min', mode: 'rolling', minutes: 8 },
  { label: '15 min', mode: 'rolling', minutes: 15 },
  { label: '30 min', mode: 'rolling', minutes: 30 },
  { label: 'Full', mode: 'continuous', minutes: 60 },
];

function formatTimer(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(rem)}` : `${m}:${pad(rem)}`;
}

export default function LiveStreamTab({ onOpenInEditor, onGoToClips }) {
  const [activeSession, setActiveSession] = useState(null);
  const [liveMessages, setLiveMessages] = useState([]);
  const [chatStats, setChatStats] = useState({});
  const [manualCuts, setManualCuts] = useState([]);
  const [queueItems, setQueueItems] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [connectionLost, setConnectionLost] = useState(false);

  // Manual start form state
  const [platform, setPlatform] = useState('kick');
  const [channel, setChannel] = useState('');
  const [recordingMode, setRecordingMode] = useState('rolling');
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [permissionAck, setPermissionAck] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  // Stop confirmation
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const pollTimerRef = useRef(null);
  const failureCountRef = useRef(0);

  const checkActive = useCallback(async () => {
    try {
      setInitialLoading(true);
      const data = await apiJson('/api/liveclipper/sessions');
      const sessions = Array.isArray(data) ? data : data.sessions || [];
      const running = sessions.find((s) =>
        ['waiting_for_live', 'connecting', 'recording', 'stopping'].includes(s.state),
      );
      setActiveSession(running || null);
      if (running) {
        try {
          const qData = await apiJson(`/api/liveclipper/sessions/${running.id}/queue`);
          setQueueItems(qData.items || []);
        } catch (_) {}
      } else {
        setQueueItems([]);
        setManualCuts([]);
        setLiveMessages([]);
      }
    } catch (e) {
      console.warn('Live Stream initial check error:', e);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    checkActive();
  }, [checkActive]);

  // Clock ticker
  useEffect(() => {
    if (!activeSession?.started_at) {
      setElapsedSec(0);
      return undefined;
    }
    const startMs = new Date(activeSession.started_at).getTime();
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeSession?.started_at]);

  // Live poll while active
  useEffect(() => {
    if (!activeSession || ['stopped', 'failed'].includes(activeSession.state)) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return undefined;
    }

    const pollTick = async () => {
      try {
        const sessData = await apiJson(`/api/liveclipper/sessions/${activeSession.id}`);
        setActiveSession(sessData);
        failureCountRef.current = 0;
        setConnectionLost(false);
        if (['stopped', 'failed'].includes(sessData.state)) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          return;
        }

        const seriesData = await apiJson(`/api/liveclipper/sessions/${activeSession.id}/series?since=0`);
        if (seriesData.messages?.length) {
          setLiveMessages((prev) => {
            const seen = new Set(prev.map((m) => `${m.t}-${m.user}-${m.text}`));
            const fresh = seriesData.messages.filter((m) => !seen.has(`${m.t}-${m.user}-${m.text}`));
            if (!fresh.length) return prev;
            return [...prev, ...fresh].slice(-250);
          });
        }
        if (seriesData.stats) setChatStats(seriesData.stats);
        if (Array.isArray(seriesData.manual_cuts)) setManualCuts(seriesData.manual_cuts);

        const queueData = await apiJson(`/api/liveclipper/sessions/${activeSession.id}/queue`);
        setQueueItems(queueData.items || []);
      } catch (_) {
        failureCountRef.current += 1;
        if (failureCountRef.current >= 3) setConnectionLost(true);
      }
    };

    pollTick();
    pollTimerRef.current = setInterval(pollTick, 1500);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeSession?.id, activeSession?.state]);

  const handleStartStream = async (e) => {
    e.preventDefault();
    if (!channel.trim() || !permissionAck || starting) return;
    setStarting(true);
    setStartError('');
    try {
      const res = await apiJson('/api/liveclipper/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          channel: channel.trim(),
          permission_ack: true,
          recording_mode: recordingMode,
          buffer_minutes: bufferMinutes,
          auto_process: false,
          hook_mode: 'none',
          // Keep automatic spike triggers high so this stays purely manual-first
          detector: {
            ratio_threshold: 99.0,
            min_count: 9999,
            cooldown_sec: 300,
          },
        }),
      });
      const newId = res?.session_id || res?.id;
      if (newId) {
        const sess = await apiJson(`/api/liveclipper/sessions/${newId}`);
        setActiveSession(sess);
        setManualCuts([]);
        setLiveMessages([]);
        setQueueItems([]);
      } else {
        await checkActive();
      }
    } catch (err) {
      setStartError(err?.detail || err?.message || 'Could not start live stream recording.');
    } finally {
      setStarting(false);
    }
  };

  const handleStopStream = async () => {
    if (!activeSession || stopping) return;
    setStopping(true);
    try {
      await apiJson(`/api/liveclipper/sessions/${activeSession.id}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_buffer: false }),
      });
      setShowStopConfirm(false);
      await checkActive();
    } catch (err) {
      setStartError(err?.detail || err?.message || 'Failed to stop stream.');
    } finally {
      setStopping(false);
    }
  };

  const handleClipAction = async (id, action, options = null) => {
    try {
      const fetchOpts = { method: 'POST' };
      if (action === 'approve' && options && typeof options === 'object') {
        fetchOpts.headers = { 'Content-Type': 'application/json' };
        fetchOpts.body = JSON.stringify(options);
      }
      await apiJson(`/api/liveclipper/queue/${id}/${action}`, fetchOpts);
      setQueueItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: action === 'approve' ? 'approved' : 'rejected',
                ...(options && 'mirror_video' in options ? { mirror_video: Boolean(options.mirror_video) } : {}),
              }
            : item,
        ),
      );
    } catch (err) {
      alert(err?.detail || err?.message || 'Could not update clip.');
    }
  };

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-white/60 gap-3 text-sm">
        <Loader2 size={28} className="animate-spin text-[#e31084]" />
        <span>Checking live stream…</span>
      </div>
    );
  }

  const running = Boolean(
    activeSession && ['waiting_for_live', 'connecting', 'recording', 'stopping'].includes(activeSession.state),
  );
  const selectedPlatformObj = PLATFORMS.find((p) => p.id === platform) || PLATFORMS[0];
  const rate = chatStats.msgs_per_min ?? activeSession?.stats?.msgs_per_min_now ?? 0;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8 space-y-5 animate-fade">
      {/* Unified Apple Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.12] backdrop-blur-xl">
            <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'}`} />
            <span className="text-[11px] font-medium tracking-[0.06em] text-white/80 font-mono uppercase">
              {running ? `Live · ${activeSession.state.replaceAll('_', ' ')}` : 'Manual Live Deck'}
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-white tracking-[-0.025em]">
            Live Stream
          </h1>
          <p className="text-white/60 text-xs sm:text-sm leading-relaxed">
            Watch a live stream and manually cut clips around any moment you like, with custom before/after windows and buffer cleanup.
          </p>
        </div>

        {running && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.10] font-mono text-xs text-white/85 tabular-nums">
              <Clock size={12} className="text-white/55" />
              {formatTimer(elapsedSec)}
            </span>
            {activeSession?.stats?.disk_used_mb != null && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.10] font-mono text-xs text-white/75 tabular-nums">
                <HardDrive size={12} className="text-white/55" />
                {activeSession.stats.disk_used_mb} MB
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowStopConfirm((v) => !v)}
              disabled={stopping}
              className="btn-danger px-4 py-1.5 text-xs inline-flex items-center gap-1.5"
            >
              <Square size={12} />
              <span>Stop Stream</span>
            </button>
          </div>
        )}
      </header>

      {connectionLost && (
        <div className="px-4 py-3 rounded-2xl bg-amber-500/12 border border-amber-500/25 text-amber-200 text-xs flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <WifiOff size={15} />
            Connection lost. Reconnecting…
          </span>
          <button type="button" onClick={checkActive} className="btn-ghost px-3 py-1 text-xs">
            Retry
          </button>
        </div>
      )}

      {showStopConfirm && running && (
        <div className="card p-4 border-rose-500/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-rose-200">
            <AlertTriangle size={15} className="text-rose-400 shrink-0" />
            <span>Stop recording this live stream? Existing cut clips remain saved.</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowStopConfirm(false)} className="btn-ghost px-3.5 py-1.5 text-xs">
              Cancel
            </button>
            <button
              type="button"
              disabled={stopping}
              onClick={handleStopStream}
              className="btn-danger px-4 py-1.5 text-xs inline-flex items-center gap-1.5"
            >
              {stopping && <Loader2 size={12} className="animate-spin" />}
              Confirm Stop
            </button>
          </div>
        </div>
      )}

      {running ? (
        <div className="space-y-5">
          {/* Live Stream Player & Chat */}
          <LiveFeedPreview
            session={activeSession}
            messages={liveMessages}
            transport={chatStats.chat_transport}
            streamRate={chatStats.msgs_per_sec ?? 0}
            msgsPerMin={rate}
          />

          {/* Manual Cut & Old Buffer Cleanup Controls (Manual-Only) */}
          <ManualCutPanel
            session={activeSession}
            manualCuts={manualCuts}
            onCutScheduled={(cut) => setManualCuts((prev) => [cut, ...prev.filter((c) => c.id !== cut.id)])}
            onGoToClips={onGoToClips}
          />

          {/* Cut Clips from This Stream */}
          {queueItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-white tracking-[-0.015em]">
                Clips Cut from This Stream ({queueItems.length})
              </h2>
              <ReviewQueue
                items={queueItems}
                onApprove={(id, options) => handleClipAction(id, 'approve', options)}
                onReject={(id) => handleClipAction(id, 'reject')}
                onOpenInEditor={onOpenInEditor}
              />
            </section>
          )}
        </div>
      ) : (
        /* Start Manual Live Stream Form — Clean, Manual-Only */
        <form onSubmit={handleStartStream} className="card p-5 sm:p-6 max-w-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[13px] bg-[#e31084]/15 border border-[#e31084]/35 text-[#ff66b2] flex items-center justify-center shrink-0">
              <Tv size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-[-0.015em]">
                Connect a Live Stream (Manual Mode)
              </h2>
              <p className="text-xs text-white/60">
                Records a rolling buffer with zero automatic spike cuts — you decide every moment to clip.
              </p>
            </div>
          </div>

          {/* Platform Picker */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/60 block">
              Platform
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all active:scale-[0.98] ${
                    platform === p.id
                      ? 'bg-white/[0.13] border-[#e31084]/65 text-white'
                      : 'bg-black/25 border-white/[0.09] text-white/65 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Channel / URL */}
          <div className="space-y-1.5">
            <label htmlFor="manual-stream-channel" className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/60 block">
              Channel or Stream URL
            </label>
            <input
              id="manual-stream-channel"
              type="text"
              required
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder={selectedPlatformObj.placeholder}
              className="input-field w-full text-sm py-2.5 px-3.5"
            />
          </div>

          {/* Buffer Size */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/60 block">
              Rolling Buffer Window
            </label>
            <div className="grid grid-cols-4 gap-2">
              {BUFFER_PRESETS.map((b) => {
                const active = recordingMode === b.mode && (b.mode === 'continuous' || bufferMinutes === b.minutes);
                return (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => {
                      setRecordingMode(b.mode);
                      setBufferMinutes(b.minutes);
                    }}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all active:scale-[0.98] ${
                      active
                        ? 'bg-white/[0.13] border-[#e31084]/65 text-white'
                        : 'bg-black/25 border-white/[0.09] text-white/65 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permission Checkbox */}
          <label className="flex items-start gap-2.5 text-xs text-white/75 cursor-pointer select-none leading-relaxed">
            <input
              type="checkbox"
              checked={permissionAck}
              onChange={(e) => setPermissionAck(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>I have permission to record and clip footage from this stream.</span>
          </label>

          {startError && (
            <div role="alert" className="px-3.5 py-2.5 rounded-xl bg-rose-500/12 border border-rose-500/25 text-xs text-rose-200">
              {startError}
            </div>
          )}

          <button
            type="submit"
            disabled={!channel.trim() || !permissionAck || starting}
            className="btn-brand-accent inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold"
          >
            {starting ? <Loader2 size={15} className="animate-spin" /> : <Play size={14} />}
            <span>{starting ? 'Connecting to stream…' : 'Start Manual Live Stream'}</span>
          </button>
        </form>
      )}
    </div>
  );
}
