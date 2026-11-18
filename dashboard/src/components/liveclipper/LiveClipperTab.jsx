import Skipper from './Skipper';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Radio, 
  History, 
  Scissors, 
  AlertTriangle, 
  RefreshCw, 
  Loader2,
  WifiOff,
  Sparkles,
  ArrowLeft,
  Clock,
  Zap,
  CheckCircle2,
  HardDrive,
  ExternalLink,
  Tv,
  Play,
  Sliders,
  Copy,
  Check
} from 'lucide-react';
import { apiJson } from '../../lib/api';
import StartPanel from './StartPanel';
import LiveSessionPanel from './LiveSessionPanel';
import LiveChatGraph from './LiveChatGraph';
import ReviewQueue from './ReviewQueue';
import SessionHistory from './SessionHistory';
import AfterStreamReviewModal from './AfterStreamReviewModal';
import LiveFeedPreview from './LiveFeedPreview';

export default function LiveClipperTab({ onOpenInEditor }) {
  const [activeSession, setActiveSession] = useState(null);
  const [selectedPastSession, setSelectedPastSession] = useState(null);
  const [reviewingSession, setReviewingSession] = useState(null);
  const [activeTabSubView, setActiveTabSubView] = useState('live'); // 'live' | 'history'
  const [points, setPoints] = useState([]);
  const [spikes, setSpikes] = useState([]);
  const [audioEnergy, setAudioEnergy] = useState([]);
  const [audioPeaks, setAudioPeaks] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [liveMessages, setLiveMessages] = useState([]);
  const [queueItems, setQueueItems] = useState([]);
  const [chatStats, setChatStats] = useState({ msgs_per_sec: 0, msgs_per_min: 0, events_total: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const lastPointTRef = useRef(0.0);
  const failureCountRef = useRef(0);
  const pollTimerRef = useRef(null);

  const [copiedId, setCopiedId] = useState(false);

  const sessionDurationText = useMemo(() => {
    if (!selectedPastSession?.started_at) return 'N/A';
    try {
      const start = new Date(selectedPastSession.started_at).getTime();
      const end = selectedPastSession.stopped_at ? new Date(selectedPastSession.stopped_at).getTime() : Date.now();
      const diffSec = Math.max(0, Math.floor((end - start) / 1000));
      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
      return `${mins}m ${secs}s`;
    } catch {
      return 'N/A';
    }
  }, [selectedPastSession]);

  const pastSessionUrl = useMemo(() => {
    const c = selectedPastSession?.config?.channel || '';
    const p = selectedPastSession?.config?.platform || 'kick';
    if (p === 'youtube') {
      return c.startsWith('http') ? c : `https://youtube.com/${c.startsWith('@') ? c : '@' + c}/live`;
    }
    if (p === 'twitch') return `https://twitch.tv/${c}`;
    return `https://kick.com/${c}`;
  }, [selectedPastSession]);

  // 1. Initial check for existing active session & queue
  const checkInitialState = useCallback(async () => {
    try {
      setInitialLoading(true);
      const data = await apiJson('/api/liveclipper/sessions');
      const sessions = Array.isArray(data) ? data : data.sessions || [];
      const running = sessions.find((s) => ['connecting', 'recording', 'stopping', 'waiting_for_live'].includes(s.state));

      if (running) {
        setActiveSession(running);
        lastPointTRef.current = 0.0;
      } else {
        setActiveSession(null);
        // Load general review queue if no active session
        try {
          const qData = await apiJson('/api/liveclipper/queue');
          setQueueItems(qData.items || []);
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Live Clipper initial check error:', e);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    checkInitialState();
  }, [checkInitialState]);

  // 2. Incremental polling loop when an active session is running
  useEffect(() => {
    if (!activeSession || ['stopped', 'failed'].includes(activeSession.state)) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const pollTick = async () => {
      try {
        // A. Session Status
        const sessData = await apiJson(`/api/liveclipper/sessions/${activeSession.id}`);
        setActiveSession(sessData);
        failureCountRef.current = 0;
        setConnectionLost(false);

        // Terminal state cleanup
        if (['stopped', 'failed'].includes(sessData.state)) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          return;
        }

        // B. Incremental Chat Velocity Points
        const sinceT = lastPointTRef.current;
        const seriesData = await apiJson(`/api/liveclipper/sessions/${activeSession.id}/series?since=${sinceT}`);

        if (seriesData.points && seriesData.points.length > 0) {
          setPoints((prev) => {
            const byTime = new Map(prev.map(p => [p.t, p]));
            for (const point of seriesData.points) byTime.set(point.t, point);
            const merged = [...byTime.values()];
            // Sort and clamp to last 30 minutes of points to keep memory bounded
            merged.sort((a, b) => a.t - b.t);
            return merged.slice(-600);
          });
          const maxT = Math.max(...seriesData.points.map((p) => p.t));
          if (maxT > lastPointTRef.current) {
            lastPointTRef.current = maxT;
          }
        }

        if (seriesData.spikes) {
          setSpikes(seriesData.spikes);
        }

        if (seriesData.audio_energy) {
          setAudioEnergy(seriesData.audio_energy);
        }

        if (seriesData.audio_peaks) {
          setAudioPeaks(seriesData.audio_peaks);
        }

        if (seriesData.heatmap) {
          setHeatmap(seriesData.heatmap);
        }

        // C. Live Chat Messages
        if (seriesData.messages && seriesData.messages.length > 0) {
          setLiveMessages((prev) => {
            const seen = new Set(prev.map((m) => `${m.t}-${m.user}-${m.text}`));
            const fresh = seriesData.messages.filter((m) => !seen.has(`${m.t}-${m.user}-${m.text}`));
            if (fresh.length === 0) return prev;
            const merged = [...prev, ...fresh];
            return merged.slice(-250);
          });
        }

        // D. Chat velocity stats (msgs/sec & msgs/min)
        if (seriesData.stats) {
          setChatStats(seriesData.stats);
        }

        // E. Review Queue items
        const queueData = await apiJson(`/api/liveclipper/sessions/${activeSession.id}/queue`);
        setQueueItems(queueData.items || []);

      } catch (err) {
        failureCountRef.current += 1;
        if (failureCountRef.current >= 3) {
          setConnectionLost(true);
        }
      }
    };

    // Immediate first tick then 1s interval for ultra-responsive live chat
    pollTick();
    pollTimerRef.current = setInterval(pollTick, 1000);

    // Instant catch-up when returning from other window / tab
    const handleReactivation = () => {
      if (!document.hidden) {
        pollTick();
      }
    };
    document.addEventListener('visibilitychange', handleReactivation);
    window.addEventListener('focus', handleReactivation);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleReactivation);
      window.removeEventListener('focus', handleReactivation);
    };
  }, [activeSession?.id, activeSession?.state]);

  // Actions
  const handleSessionStarted = async (newSessionId) => {
    setPoints([]);
    setSpikes([]);
    setLiveMessages([]);
    setQueueItems([]);
    lastPointTRef.current = 0.0;
    try {
      const sess = await apiJson(`/api/liveclipper/sessions/${newSessionId}`);
      setActiveSession(sess);
      setActiveTabSubView('live');
    } catch (_) {
      checkInitialState();
    }
  };

  const handleStopSession = async ({ keep_buffer = false }) => {
    if (!activeSession) return;
    try {
      await apiJson(`/api/liveclipper/sessions/${activeSession.id}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_buffer }),
      });
      const updated = await apiJson(`/api/liveclipper/sessions/${activeSession.id}`);
      setActiveSession(updated);
    } catch (e) {
      alert(e.detail || 'Failed to stop session.');
    }
  };

  const handleTogglePause = async () => {
    const nextState = !isPaused;
    try {
      const res = await apiJson('/api/liveclipper/processing/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: nextState }),
      });
      setIsPaused(res.paused);
    } catch (e) {
      alert(e.detail || 'Could not toggle pause.');
    }
  };

  const handleApprove = async (itemId) => {
    // Optimistic status update
    setQueueItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: 'approved' } : it))
    );
    try {
      await apiJson(`/api/liveclipper/queue/${itemId}/approve`, { method: 'POST' });
    } catch (err) {
      const msg = String(err?.detail || err?.message || '');
      if (!msg.toLowerCase().includes('approved')) {
        checkInitialState();
        alert(msg || 'Failed to approve clip.');
      }
    }
  };

  const handleReject = async (itemId) => {
    // Optimistic removal
    setQueueItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: 'rejected' } : it))
    );
    try {
      await apiJson(`/api/liveclipper/queue/${itemId}/reject`, { method: 'POST' });
    } catch (err) {
      checkInitialState();
      alert(err.detail || 'Failed to reject clip.');
    }
  };

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-muted gap-3 font-mono text-sm">
        <Loader2 size={32} className="animate-spin text-brass" />
        <span>Initializing Live Clipper...</span>
      </div>
    );
  }

  const isLiveActive = activeSession && ['connecting', 'recording', 'stopping'].includes(activeSession.state);

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      <Skipper captureId={queueItems.find(item => !activeSession || item.session_id === activeSession.id)?.id} />
      {/* Connection Failure Toast Notice */}
      {connectionLost && (
        <div className="p-3.5 rounded-2xl bg-warn/15 backdrop-blur-xl border border-warn/30 text-warn text-xs font-mono flex items-center justify-between gap-3 shadow-lg animate-pulse">
          <div className="flex items-center gap-2">
            <WifiOff size={16} className="shrink-0" />
            <span>Connection to Shortly server lost. Retrying automatically...</span>
          </div>
          <button
            type="button"
            onClick={checkInitialState}
            className="px-3 py-1 rounded-xl bg-warn text-paper text-micro font-bold uppercase hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Retry Now
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs (Apple Segmented Picker) */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="p-1 rounded-2xl bg-black/25 backdrop-blur-xl border border-white/10 flex items-center gap-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTabSubView('live')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all duration-200 cursor-pointer active:scale-95 ${
              activeTabSubView === 'live'
                ? 'bg-white/10 text-white border border-white/15 shadow-xs'
                : 'text-muted hover:text-ink border border-transparent'
            }`}
          >
            <Radio size={13} className={isLiveActive ? 'text-emerald-400 animate-pulse' : 'text-muted'} />
            <span>{isLiveActive ? 'Live Session (Active)' : 'Start Session'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabSubView('history')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all duration-200 cursor-pointer active:scale-95 ${
              activeTabSubView === 'history'
                ? 'bg-white/10 text-white border border-white/15 shadow-xs'
                : 'text-muted hover:text-ink border border-transparent'
            }`}
          >
            <History size={13} />
            <span>Session History</span>
          </button>
        </div>

        {/* Global queue count tag if idle */}
        {!isLiveActive && queueItems.length > 0 && (
          <span className="text-micro font-mono text-muted flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10">
            <Scissors size={12} className="text-brass" />
            <span>{queueItems.length} clips in queue</span>
          </span>
        )}
      </div>

      {/* Sub-view Content */}
      {activeTabSubView === 'history' ? (
        <SessionHistory
          onSelectSession={async (sess) => {
            try {
              const qData = await apiJson(`/api/liveclipper/sessions/${sess.id}/queue`);
              setQueueItems(qData.items || []);
            } catch (_) {
              setQueueItems([]);
            }
            setSelectedPastSession(sess);
            setActiveTabSubView('live');
          }}
          onClipCut={(newClip) => {
            if (newClip) setQueueItems((prev) => [newClip, ...prev]);
          }}
        />
      ) : isLiveActive ? (
        /* Active Live Session Experience */
        <div className="space-y-5">
          <LiveSessionPanel
            session={activeSession}
            onStop={handleStopSession}
            isPaused={isPaused}
            onTogglePause={handleTogglePause}
          />

          <LiveFeedPreview
            session={activeSession}
            messages={liveMessages}
            transport={chatStats.chat_transport}
            streamRate={chatStats.msgs_per_sec || activeSession?.stats?.msgs_per_sec_now || 0}
            msgsPerMin={chatStats.msgs_per_min || activeSession?.stats?.msgs_per_min_now || 0}
          />

          <LiveChatGraph
            points={points}
            spikes={spikes}
            audioEnergy={audioEnergy}
            audioPeaks={audioPeaks}
            heatmap={heatmap}
            sessionDuration={
              activeSession.started_at
                ? (Date.now() - new Date(activeSession.started_at).getTime()) / 1000
                : 0
            }
            sessionId={activeSession.id}
            detectorConfig={activeSession.config?.detector}
            msgsPerMin={chatStats.msgs_per_min || activeSession?.stats?.msgs_per_min_now || 0}
            msgsPerSec={chatStats.msgs_per_sec || activeSession?.stats?.msgs_per_sec_now || 0}
            onDetectorUpdate={(newCfg) => {
              setActiveSession((prev) => prev ? {
                ...prev,
                config: {
                  ...prev.config,
                  detector: {
                    ...prev.config?.detector,
                    ...newCfg,
                  }
                }
              } : prev);
            }}
          />

          <ReviewQueue
            items={queueItems}
            onApprove={handleApprove}
            onReject={handleReject}
            onOpenInEditor={onOpenInEditor}
          />
        </div>
      ) : selectedPastSession ? (
        /* Inspect Past Session View (Elaborative Apple Design Studio View) */
        <div className="space-y-5 animate-fade">
          {/* 1. Dedicated, Prominent Back Button Row */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setSelectedPastSession(null);
                setActiveTabSubView('history');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 border border-white/15 text-xs font-semibold text-white transition-all shadow-sm cursor-pointer group"
            >
              <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform text-white/80" />
              <span>Back to All Sessions</span>
            </button>

            {/* Quick Session ID pill with one-click copy */}
            <button
              type="button"
              onClick={() => handleCopyId(selectedPastSession.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-micro font-mono text-muted hover:text-white transition-all cursor-pointer"
              title="Click to copy Session UUID"
            >
              {copiedId ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
              <span>{copiedId ? 'Copied UUID' : `ID: ${selectedPastSession.id.slice(0, 8)}...`}</span>
            </button>
          </div>

          {/* 2. Elaborative Hero Glassmorphic Header Card */}
          <div className="rounded-3xl bg-paper2/50 backdrop-blur-xl border border-white/10 shadow-xl p-5 sm:p-6 space-y-5 relative overflow-hidden">
            {/* Top Specular Sheen */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

            {/* Header Identity & Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-inner ${
                  selectedPastSession.config?.platform === 'youtube'
                    ? 'bg-red-500/15 border-red-500/30 text-red-400'
                    : selectedPastSession.config?.platform === 'twitch'
                    ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                }`}>
                  {selectedPastSession.config?.platform === 'youtube' ? (
                    <Play size={20} fill="currentColor" />
                  ) : selectedPastSession.config?.platform === 'twitch' ? (
                    <Radio size={20} />
                  ) : (
                    <Tv size={20} />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      {selectedPastSession.config?.channel || 'Stream Broadcast'}
                    </h2>
                    <a
                      href={pastSessionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-white transition-colors"
                      title="Open stream channel"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-muted uppercase">
                      {selectedPastSession.config?.platform || 'kick'}
                    </span>
                    <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                      {selectedPastSession.state?.toUpperCase() || 'COMPLETED'}
                    </span>
                  </div>

                  <p className="text-micro font-mono text-muted mt-0.5">
                    Recorded live session timeline • {queueItems.length} candidate clips available in queue
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setReviewingSession(selectedPastSession)}
                  className="px-4 py-2 rounded-xl border border-brass/40 bg-brass/15 text-xs font-mono text-brass hover:bg-brass/25 active:scale-95 transition-all flex items-center gap-2 font-semibold cursor-pointer shadow-sm"
                >
                  <Sparkles size={14} />
                  <span>After-Stream Review</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPastSession(null)}
                  className="px-4 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-mono text-muted hover:text-white active:scale-95 transition-all cursor-pointer"
                >
                  Start New Session
                </button>
              </div>
            </div>

            {/* Elaborative 6-Metric Visualizer Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs font-mono">
              <div className="p-3 rounded-2xl bg-black/25 border border-white/5 space-y-1">
                <span className="text-muted text-micro flex items-center gap-1">
                  <Clock size={11} className="text-brass" /> Duration
                </span>
                <div className="font-bold text-white text-sm">{sessionDurationText}</div>
                <div className="text-[10px] text-muted">Recorded length</div>
              </div>

              <div className="p-3 rounded-2xl bg-black/25 border border-white/5 space-y-1">
                <span className="text-muted text-micro flex items-center gap-1">
                  <Zap size={11} className="text-coral" /> Spikes
                </span>
                <div className="font-bold text-coral text-sm">
                  {selectedPastSession.stats?.spikes_total || queueItems.length}
                </div>
                <div className="text-[10px] text-muted">Surge moments</div>
              </div>

              <div className="p-3 rounded-2xl bg-black/25 border border-white/5 space-y-1">
                <span className="text-muted text-micro flex items-center gap-1">
                  <Scissors size={11} className="text-brass" /> Clips Cut
                </span>
                <div className="font-bold text-brass text-sm">{queueItems.length}</div>
                <div className="text-[10px] text-muted">In review queue</div>
              </div>

              <div className="p-3 rounded-2xl bg-black/25 border border-white/5 space-y-1">
                <span className="text-muted text-micro flex items-center gap-1">
                  <CheckCircle2 size={11} className="text-ok" /> Approved
                </span>
                <div className="font-bold text-ok text-sm">
                  {selectedPastSession.stats?.clips_approved || 0}
                </div>
                <div className="text-[10px] text-muted">Sent to pipeline</div>
              </div>

              <div className="p-3 rounded-2xl bg-black/25 border border-white/5 space-y-1">
                <span className="text-muted text-micro flex items-center gap-1">
                  <HardDrive size={11} /> Storage
                </span>
                <div className="font-bold text-white text-sm">
                  {selectedPastSession.stats?.disk_used_mb ? `${selectedPastSession.stats.disk_used_mb}MB` : '180MB'}
                </div>
                <div className="text-[10px] text-muted">Buffer footprint</div>
              </div>

              <div className="p-3 rounded-2xl bg-black/25 border border-white/5 space-y-1">
                <span className="text-muted text-micro flex items-center gap-1">
                  <Sliders size={11} className="text-purple-400" /> Sensitivity
                </span>
                <div className="font-bold text-purple-300 text-sm">
                  {selectedPastSession.config?.detector?.ratio_threshold || 2.5}×
                </div>
                <div className="text-[10px] text-muted">
                  min {selectedPastSession.config?.detector?.min_count || 5} msgs
                </div>
              </div>
            </div>

            {/* Additional Strategy & Pipeline Meta Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 text-micro font-mono text-muted">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/5">
                  Buffer Mode: <strong className="text-ink">{selectedPastSession.config?.recording_mode === 'rolling' ? `Rolling Buffer (${selectedPastSession.config?.buffer_minutes || 8}m)` : 'Full Recording Archival'}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/5">
                  AI Hooks: <strong className="text-brass">{selectedPastSession.config?.hook_mode || 'Auto Gemini AI'}</strong>
                </span>
              </div>
              <div>
                <span>Started: {selectedPastSession.started_at ? new Date(selectedPastSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}</span>
                {selectedPastSession.stopped_at && (
                  <span className="ml-2">Finished: {new Date(selectedPastSession.stopped_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                )}
              </div>
            </div>
          </div>

          {/* 3. Review Queue List */}
          {queueItems.length > 0 ? (
            <ReviewQueue
              items={queueItems}
              onApprove={handleApprove}
              onReject={handleReject}
              onOpenInEditor={onOpenInEditor}
            />
          ) : (
            <div className="p-8 rounded-card bg-paper2/60 border border-rule text-center space-y-3 font-mono">
              <Scissors size={28} className="mx-auto text-muted/60" />
              <div className="text-sm font-semibold text-ink">No clips were cut during this session</div>
              <p className="text-xs text-muted max-w-md mx-auto">
                No chat spikes exceeded the sensitivity threshold during this recording. You can use <strong>After-Stream Review</strong> to inspect the chat timeline and cut clips manually or with lower thresholds.
              </p>
              <button
                type="button"
                onClick={() => setReviewingSession(selectedPastSession)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-brass text-brassink text-xs font-bold uppercase hover:brightness-110 cursor-pointer"
              >
                <Sparkles size={14} />
                <span>Open After-Stream Review</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Idle Start Panel + Existing Queue View */
        <div className="space-y-6">
          <StartPanel onSessionStarted={handleSessionStarted} />

          {queueItems.length > 0 && (
            <div className="pt-4">
              <ReviewQueue
                items={queueItems}
                onApprove={handleApprove}
                onReject={handleReject}
                onOpenInEditor={onOpenInEditor}
              />
            </div>
          )}
        </div>
      )}

      {/* Review Modal if triggered */}
      {reviewingSession && (
        <AfterStreamReviewModal
          session={reviewingSession}
          onClose={() => setReviewingSession(null)}
          onClipCut={(newClip) => {
            if (newClip) setQueueItems((prev) => [newClip, ...prev]);
          }}
        />
      )}
    </div>
  );
}
