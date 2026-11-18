import React, { useState, useEffect } from 'react';
import { AlertTriangle, Camera, FlipHorizontal2, Loader2 } from 'lucide-react';
import { getApiUrl } from '../../config';
import WebcamBoxPicker from '../WebcamBoxPicker';
export default function LiveSessionPanel({
  session,
  onStop,
  isPaused,
  onTogglePause,
  mirrorVideo = false,
  onToggleMirror,
  webcamMode = 'auto',
  webcamBox = null,
  onUpdateWebcam,
  totalSpikes,
  clipsCut,
  clipsCutting = 0,
}) {
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showWebcamDrawer, setShowWebcamDrawer] = useState(false);
  const [snapshotTick, setSnapshotTick] = useState(() => Date.now());
  const [keepBuffer, setKeepBuffer] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Monotonic local clock ticker
  useEffect(() => {
    if (!session?.started_at) return;
    const startMs = new Date(session.started_at).getTime();

    const interval = setInterval(() => {
      const nowMs = Date.now();
      setElapsedSec(Math.max(0, Math.floor((nowMs - startMs) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.started_at]);

  const formatTimer = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
    return `${mins}:${pad(secs)}`;
  };

  const handleConfirmStop = async () => {
    setStopping(true);
    if (onStop) {
      try {
        await onStop({ keep_buffer: keepBuffer });
      } finally {
        setStopping(false);
      }
    }
  };

  const stats = session?.stats || {};
  const config = session?.config || {};
  const isWaitingForLive = session?.state === 'waiting_for_live';

  const liveUrl =
    config.platform === 'youtube'
      ? config.channel?.startsWith('http')
        ? config.channel
        : `https://youtube.com/${config.channel?.startsWith('@') ? config.channel : '@' + config.channel}/live`
      : config.platform === 'twitch'
        ? `https://twitch.tv/${config.channel}`
        : `https://kick.com/${config.channel}`;

  return (
    <section className="lc-session">
      <header className="lc-heading">
        <div>
          <h2>{config.channel || 'Live stream'}</h2>
          <p>
            {config.platform} · {formatTimer(elapsedSec)} ·{' '}
            <a href={liveUrl} target="_blank" rel="noreferrer">
              Open stream ↗
            </a>
          </p>
        </div>
        <div className="lc-tools">
          {onUpdateWebcam && (
            <button
              type="button"
              onClick={() => {
                setSnapshotTick(Date.now());
                setShowWebcamDrawer((v) => !v);
              }}
              aria-pressed={showWebcamDrawer || webcamMode !== 'auto'}
              title="Set webcam corner or draw an exact tracing box on the live stream"
              className={
                showWebcamDrawer || webcamMode !== 'auto'
                  ? '!border-[#e31084]/50 !bg-[#e31084]/18 !text-pink-100'
                  : ''
              }
            >
              <Camera size={13} className="inline mr-1.5 -mt-0.5" />
              {webcamMode === 'custom'
                ? 'Cam: Box'
                : webcamMode === 'auto'
                  ? 'Cam: 4-Corner'
                  : `Cam: ${webcamMode.replace('_', '-')}`}
            </button>
          )}
          {onToggleMirror && (
            <button
              type="button"
              onClick={onToggleMirror}
              aria-pressed={mirrorVideo}
              title="Flip captured videos horizontally before Whisper and subtitles (captions stay normal)"
              className={
                mirrorVideo
                  ? '!border-[#e31084]/50 !bg-[#e31084]/18 !text-pink-100'
                  : ''
              }
            >
              <FlipHorizontal2 size={13} className="inline mr-1.5 -mt-0.5" />
              {mirrorVideo ? 'Mirror: On' : 'Mirror: Off'}
            </button>
          )}
          <button onClick={onTogglePause}>{isPaused ? 'Resume processing' : 'Pause processing'}</button>
          <button
            disabled={stopping || session.state === 'stopping'}
            onClick={() => setShowStopConfirm(true)}
          >
            Stop session
          </button>
        </div>
      </header>
      <dl className="lc-metrics">
        {[
          ['Chat', session.chat_state],
          ['Recorder', session.recorder_state],
          ['Total spikes', totalSpikes ?? stats.spikes_total ?? 0],
          ['Clips cut', clipsCut ?? stats.clips_cut ?? 0],
          ['Cutting now', clipsCutting],
          ['Buffer', stats.disk_used_mb == null ? '—' : stats.disk_used_mb + ' MB'],
        ].map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value || (value === 0 ? 0 : '—')}</dd>
          </div>
        ))}
      </dl>
      {/* Stop confirmation drawer */}
      {showWebcamDrawer && onUpdateWebcam && (
        <div className="mt-3 animate-fade">
          <WebcamBoxPicker
            mode={webcamMode}
            box={webcamBox}
            previewSrc={session?.id ? getApiUrl(`/api/liveclipper/sessions/${session.id}/snapshot?t=${snapshotTick}`) : null}
            onRefreshPreview={() => setSnapshotTick(Date.now())}
            onChange={onUpdateWebcam}
          />
        </div>
      )}
      {showStopConfirm && (
        <div className="p-3.5 rounded-xl bg-black/40 border border-red-500/30 space-y-2.5 animate-fade text-xs font-mono">
          <div className="flex items-center gap-2 text-red-400 font-semibold">
            <AlertTriangle size={14} /> Stop Live Session?
          </div>
          <p className="text-muted text-[11px]">
            Finalizes recording, renders any remaining detected spikes, and releases capture tools.
          </p>
          {config.recording_mode === 'rolling' && (
            <label className="flex items-center gap-2 text-ink/90 cursor-pointer text-micro">
              <input
                type="checkbox"
                checked={keepBuffer}
                onChange={(e) => setKeepBuffer(e.target.checked)}
                className="rounded border-white/20 accent-brass w-3.5 h-3.5"
              />
              <span>Keep buffer clips on disk</span>
            </label>
          )}
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setShowStopConfirm(false)}
              className="px-3 py-1 rounded-xl border border-white/10 text-muted hover:text-ink text-micro"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmStop}
              disabled={stopping}
              className="px-3.5 py-1 rounded-xl bg-red-500 text-white font-semibold text-micro flex items-center gap-1.5 hover:brightness-110 active:scale-95"
            >
              {stopping ? <Loader2 size={11} className="animate-spin" /> : null}
              Confirm Stop
            </button>
          </div>
        </div>
      )}

      {/* Waiting for Live Standby Banner */}
      {isWaitingForLive && (
        <div className="mt-3 p-3 rounded-xl bg-[#e31084]/12 border border-[#e31084]/35 text-pink-100 text-xs flex items-center justify-between gap-3 animate-fade font-mono">
          <div className="flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-[#f03b9f] shrink-0" />
            <span className="text-micro">
              Stream is offline. Polling every 30s. Recording begins automatically when live.
            </span>
          </div>
          <button
            type="button"
            onClick={handleConfirmStop}
            className="px-2.5 py-1 rounded-lg bg-[#e31084] hover:brightness-110 text-white text-micro font-semibold"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error or Alert banner if session reported an error */}
      {session?.error && (
        <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-mono flex items-center gap-2 animate-fade">
          <AlertTriangle size={13} className="shrink-0" />
          <span>{session.error}</span>
        </div>
      )}
    </section>
  );
}
