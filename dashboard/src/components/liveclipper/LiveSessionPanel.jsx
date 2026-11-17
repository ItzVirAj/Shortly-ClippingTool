import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Square, 
  Pause, 
  Play, 
  HardDrive, 
  Clock, 
  Scissors, 
  CheckCircle2, 
  XCircle, 
  Zap, 
  AlertTriangle,
  Loader2,
  ExternalLink
} from 'lucide-react';

export default function LiveSessionPanel({
  session,
  onStop,
  isPaused,
  onTogglePause,
}) {
  const [showStopConfirm, setShowStopConfirm] = useState(false);
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
      await onStop({ keep_buffer: keepBuffer });
    }
  };

  const stats = session?.stats || {};
  const config = session?.config || {};
  const isWaitingForLive = session?.state === 'waiting_for_live';

  const isChatHealthy = session?.chat_state === 'connected';
  const isChatReconnecting = session?.chat_state === 'reconnecting';

  const isVideoHealthy = session?.recorder_state === 'recording';
  const isVideoReconnecting = session?.recorder_state === 'reconnecting';

  const liveUrl = config.platform === 'youtube'
    ? (config.channel?.startsWith('http') ? config.channel : `https://youtube.com/${config.channel?.startsWith('@') ? config.channel : '@' + config.channel}/live`)
    : config.platform === 'twitch'
    ? `https://twitch.tv/${config.channel}`
    : `https://kick.com/${config.channel}`;

  return (
    <div className="bg-paper2/60 backdrop-blur-xl border border-white/10 rounded-2xl p-3 sm:p-3.5 shadow-lg space-y-2.5 transition-all duration-200">
      {/* Ultra-compact single control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Live dot + Stream info + Elapsed Clock */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute opacity-75" />
            <span className="w-2 h-2 rounded-full bg-emerald-400 relative" />
          </div>

          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white tracking-tight">
              {config.channel || 'Live Stream'}
            </h2>
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted hover:text-brass transition-colors"
              title="Open stream"
            >
              <ExternalLink size={12} />
            </a>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/[0.06] text-muted border border-white/10">
              {config.platform || 'kick'}
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
              isWaitingForLive
                ? 'bg-warn/15 text-warn border-warn/30 animate-pulse font-semibold'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
            }`}>
              {isWaitingForLive ? 'WAITING FOR LIVE' : (session?.state || 'Active')}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-xs font-mono text-ink ml-1 pl-2.5 border-l border-white/10">
            <Clock size={12} className="text-brass" />
            <span>{formatTimer(elapsedSec)}</span>
          </div>
        </div>

        {/* Center: Sleek Inline Metrics Chips */}
        <div className="hidden md:flex items-center gap-1.5 text-micro font-mono">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-ink/80" title="Spikes Detected">
            <Zap size={10} className="text-coral" />
            <span>{stats.spikes_total || 0} Spikes</span>
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-ink/80" title="Clips Cut">
            <Scissors size={10} className="text-brass" />
            <span>{stats.clips_cut || 0} Cut</span>
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-ink/80" title="Approved into Pipeline">
            <CheckCircle2 size={10} className="text-ok" />
            <span>{stats.clips_approved || 0} Approved</span>
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-muted" title="Disk Buffer Used">
            <HardDrive size={10} />
            <span>{stats.disk_used_mb ? `${stats.disk_used_mb}MB` : '0MB'}</span>
          </span>
        </div>

        {/* Right: Health Chips & Primary Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Health indicator dots */}
          <div className="hidden lg:flex items-center gap-2 text-micro font-mono text-muted mr-1">
            <span className="flex items-center gap-1" title={`Chat: ${session?.chat_state || 'idle'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isChatHealthy ? 'bg-emerald-400' : isChatReconnecting ? 'bg-warn' : 'bg-danger'}`} />
              Chat
            </span>
            <span className="flex items-center gap-1" title={`Recorder: ${session?.recorder_state || 'idle'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isVideoHealthy ? 'bg-emerald-400' : isVideoReconnecting ? 'bg-warn' : 'bg-danger'}`} />
              Video
            </span>
          </div>

          {/* Pause Pipeline Button */}
          <button
            type="button"
            onClick={onTogglePause}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-micro font-mono transition-all cursor-pointer active:scale-95 ${
              isPaused
                ? 'border-warn/40 bg-warn/15 text-warn hover:bg-warn/25'
                : 'border-white/10 bg-white/[0.03] text-muted hover:text-ink hover:bg-white/[0.06]'
            }`}
            title={isPaused ? "Resume pipeline rendering" : "Pause pipeline rendering"}
          >
            {isPaused ? <Play size={11} /> : <Pause size={11} />}
            <span className="hidden sm:inline">{isPaused ? "Resume" : "Pause"}</span>
          </button>

          {/* Stop Session Button */}
          <button
            type="button"
            onClick={() => setShowStopConfirm(true)}
            disabled={stopping}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 text-xs font-mono font-medium transition-all cursor-pointer"
          >
            <Square size={11} fill="currentColor" />
            <span>Stop</span>
          </button>
        </div>
      </div>

      {/* Stop confirmation drawer */}
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
        <div className="p-2.5 rounded-xl bg-warn/10 border border-warn/25 text-warn text-xs flex items-center justify-between gap-3 animate-fade font-mono">
          <div className="flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-warn shrink-0" />
            <span className="text-micro">
              Stream is offline. Polling every 30s. Recording begins automatically when live.
            </span>
          </div>
          <button
            type="button"
            onClick={handleConfirmStop}
            className="px-2 py-0.5 rounded bg-warn/20 hover:bg-warn/30 text-warn border border-warn/40 text-micro font-medium"
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
    </div>
  );
}
