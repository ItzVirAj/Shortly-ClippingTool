import Skipper from './Skipper';
import Watchlist from './Watchlist';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, History, Scissors, Film, Radio, Loader2, Bot, ArrowLeft, Zap, Eye, ChevronRight } from 'lucide-react';
import SkipperPortrait from './SkipperPortrait';
import './liveDesk.css';
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

  const [pastItems, setPastItems] = useState([]);
  const [manualCuts, setManualCuts] = useState([]);

  const sessionDurationText = useMemo(() => {
    if (!selectedPastSession?.started_at) return 'N/A';
    try {
      const start = new Date(selectedPastSession.started_at).getTime();
      const end = selectedPastSession.stopped_at
        ? new Date(selectedPastSession.stopped_at).getTime()
        : Date.now();
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

  // 1. Initial check for existing active session & queue
  const checkInitialState = useCallback(async () => {
    try {
      setInitialLoading(true);
      const data = await apiJson('/api/liveclipper/sessions');
      const sessions = Array.isArray(data) ? data : data.sessions || [];
      const running = sessions.find((s) =>
        ['connecting', 'recording', 'stopping', 'waiting_for_live'].includes(s.state),
      );

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

  // Watches can start a recording while the setup form is open.
  useEffect(() => {
    if (activeSession && !['failed', 'stopped'].includes(activeSession.state)) return;
    let mounted = true;
    const timer = setInterval(async () => {
      try {
        const { id } = await apiJson('/api/liveclipper/active');
        if (!id || !mounted) return;
        const session = await apiJson('/api/liveclipper/sessions/' + id);
        if (mounted) {
          lastPointTRef.current = 0;
          setPoints([]); setSpikes([]); setLiveMessages([]); setChatStats({});
          setAudioEnergy([]); setAudioPeaks([]); setHeatmap([]); setQueueItems([]);
          setActiveSession(session);
        }
      } catch { /* Retry on the next poll. */ }
    }, 5000);
    return () => { mounted = false; clearInterval(timer); };
  }, [activeSession?.id, activeSession?.state]);

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
        const seriesData = await apiJson(
          `/api/liveclipper/sessions/${activeSession.id}/series?since=${sinceT}`,
        );

        if (seriesData.points && seriesData.points.length > 0) {
          setPoints((prev) => {
            const byTime = new Map(prev.map((p) => [p.t, p]));
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

        if (Array.isArray(seriesData.manual_cuts)) {
          setManualCuts(seriesData.manual_cuts);
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
    setAudioEnergy([]);
    setAudioPeaks([]);
    setHeatmap([]);
    setChatStats({});
    setPoints([]);
    setSpikes([]);
    setLiveMessages([]);
    setQueueItems([]);
    setManualCuts([]);
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

  const handleToggleMirror = async () => {
    if (!activeSession) return;
    const nextVal = !activeSession.config?.mirror_video;
    setActiveSession((prev) =>
      prev ? { ...prev, config: { ...prev.config, mirror_video: nextVal } } : prev,
    );
    try {
      await apiJson(`/api/liveclipper/sessions/${activeSession.id}/detector`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mirror_video: nextVal }),
      });
    } catch (e) {
      setActiveSession((prev) =>
        prev ? { ...prev, config: { ...prev.config, mirror_video: !nextVal } } : prev,
      );
      alert(e.detail || 'Could not toggle Mirror Video.');
    }
  };

  const handleUpdateWebcam = async ({ webcam_mode: nextMode, webcam_box: nextBox }) => {
    if (!activeSession) return;
    const prevMode = activeSession.config?.webcam_mode || 'auto';
    const prevBox = activeSession.config?.webcam_box || null;
    setActiveSession((prev) =>
      prev
        ? {
            ...prev,
            config: {
              ...prev.config,
              webcam_mode: nextMode,
              webcam_box: nextMode === 'custom' ? nextBox : null,
            },
          }
        : prev,
    );
    try {
      await apiJson(`/api/liveclipper/sessions/${activeSession.id}/detector`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webcam_mode: nextMode,
          webcam_box: nextMode === 'custom' ? nextBox : null,
        }),
      });
    } catch (e) {
      setActiveSession((prev) =>
        prev ? { ...prev, config: { ...prev.config, webcam_mode: prevMode, webcam_box: prevBox } } : prev,
      );
      alert(e.detail || 'Could not update webcam box.');
    }
  };

  async function updateClip(id, action, options = null) {
    try {
      const fetchOpts = { method: 'POST' };
      if (action === 'approve' && options && typeof options === 'object') {
        fetchOpts.headers = { 'Content-Type': 'application/json' };
        fetchOpts.body = JSON.stringify(options);
      }
      await apiJson(`/api/liveclipper/queue/${id}/${action}`, fetchOpts);
      const update = (items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                status: action === 'approve' ? 'approved' : 'rejected',
                ...(options && 'mirror_video' in options ? { mirror_video: Boolean(options.mirror_video) } : {}),
              }
            : item,
        );
      setQueueItems(update);
      setPastItems(update);
    } catch (err) {
      alert(err.detail || err.message || 'Could not update clip.');
    }
  }

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-white/60 gap-3 font-mono text-xs">
        <Loader2 size={28} className="animate-spin text-[#f03b9f]" />
        <span>Initializing Live Clipper…</span>
      </div>
    );
  }

  const running =
    activeSession &&
    ['waiting_for_live', 'connecting', 'recording', 'stopping'].includes(activeSession.state);
  const rate = chatStats.msgs_per_min ?? activeSession?.stats?.msgs_per_min_now ?? 0;
  const activeSessionClips = queueItems.filter(
    (item) =>
      (!activeSession || item.session_id === activeSession.id) &&
      item.status !== 'rejected' &&
      item.status !== 'failed',
  );
  const totalSpikes = Math.max(spikes.length, activeSession?.stats?.spikes_total ?? 0);
  const clipsCut = Math.max(activeSessionClips.length, activeSession?.stats?.clips_cut ?? 0);
  const queueCutting = activeSessionClips.filter((item) =>
    ['cutting', 'rendering', 'processing', 'editing'].includes(item.status),
  ).length;
  const activeManualCuts = manualCuts.filter((c) => c.status === 'waiting' || c.status === 'cutting').length;
  const clipsCutting = isPaused
    ? activeManualCuts
    : Math.max(queueCutting + activeManualCuts, Math.max(0, totalSpikes - clipsCut));
  const destinations = [
    ['live', Radio, 'Session'],
    ['watch', Eye, 'Watchlist'],
    ['clips', Film, 'Clips'],
    ['history', History, 'History'],
    ['skipper', Bot, 'Skipper'],
  ];
  const review = (items) => (
    <ReviewQueue
      items={items}
      onApprove={(id, options) => updateClip(id, 'approve', options)}
      onReject={(id) => updateClip(id, 'reject')}
      onOpenInEditor={onOpenInEditor}
    />
  );
  async function inspectSession(session) {
    try {
      const data = await apiJson(`/api/liveclipper/sessions/${session.id}/queue`);
      setPastItems(data.items || []);
      setSelectedPastSession(session);
    } catch (err) {
      alert(err.message || 'Could not load session clips.');
    }
  }
  return (
    <section
      className="lc-window h-full overflow-y-auto custom-scrollbar animate-fade relative z-10"
      aria-label="Live Clipper"
    >
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 pt-4 pb-8 sm:pt-6 sm:pb-10 space-y-5">
        {/* Unified Shortly Apple Glass Header + Segmented Navigation */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.12] backdrop-blur-xl shadow-xs">
              <span className="relative flex h-2 w-2">
                {running && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    running ? 'bg-emerald-400' : 'bg-[#f03b9f]'
                  }`}
                />
              </span>
              <span className="text-[11px] font-medium tracking-[0.06em] text-white/80 font-mono uppercase" role="status">
                {running ? `LIVE · ${activeSession.state.replaceAll('_', ' ')}` : 'LIVE CLIPPER · STANDBY'}
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl text-white tracking-[-0.025em] flex items-center gap-3">
              <span>Live Clipper</span>
            </h1>

            <p className="text-white/60 text-xs sm:text-sm leading-relaxed max-w-xl font-normal">
              Detect viral spikes automatically from chat velocity, audio peaks &amp; heatmaps and cut vertical Shorts in real time.
            </p>
          </div>

          {/* Apple Translucent Segmented Navigation Bar */}
          <nav
            aria-label="Live Clipper views"
            className="inline-flex flex-wrap items-center p-1 rounded-2xl sm:rounded-full bg-black/45 border border-white/[0.09] backdrop-blur-2xl shadow-inner gap-1 shrink-0 self-start lg:self-end"
          >
            {destinations.map(([key, Icon, label]) => {
              const active = activeTabSubView === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setActiveTabSubView(key)}
                  className={`inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl sm:rounded-full text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-[0.97] ${
                    active
                      ? 'bg-gradient-to-r from-[#e31084] to-[#f03b9f] text-white shadow-[0_2px_14px_rgba(227,16,132,0.38)] border-t border-white/20'
                      : 'text-white/65 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon size={13} className={active ? 'text-white' : 'text-white/50'} />
                  <span>{label}</span>
                  {key === 'clips' && queueItems.length > 0 && (
                    <span
                      className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums leading-none ${
                        active ? 'bg-black/25 text-white' : 'bg-white/[0.1] text-white/80'
                      }`}
                    >
                      {queueItems.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        {/* Main Workspace Pane */}
        <div className="lc-pane space-y-5">
          {connectionLost && (
            <div
              role="alert"
              className="px-4 py-3 rounded-2xl bg-[#e31084]/12 border border-[#e31084]/35 text-pink-100 text-xs flex items-center justify-between gap-3 backdrop-blur-xl"
            >
              <span>Connection lost. Reconnecting to live session…</span>
              <button
                type="button"
                onClick={checkInitialState}
                className="px-3 py-1 rounded-lg bg-[#e31084] hover:brightness-110 text-white font-semibold text-xs"
              >
                Retry now
              </button>
            </div>
          )}
          <section hidden={activeTabSubView !== 'live'}>
            {running ? (
              <div className="space-y-4">
                <LiveSessionPanel
                  session={activeSession}
                  onStop={handleStopSession}
                  isPaused={isPaused}
                  onTogglePause={handleTogglePause}
                  mirrorVideo={Boolean(activeSession?.config?.mirror_video)}
                  onToggleMirror={handleToggleMirror}
                  webcamMode={activeSession?.config?.webcam_mode || 'auto'}
                  webcamBox={activeSession?.config?.webcam_box || null}
                  onUpdateWebcam={handleUpdateWebcam}
                  totalSpikes={totalSpikes}
                  clipsCut={clipsCut}
                  clipsCutting={clipsCutting}
                />
                <p className="lc-hint" role="status">{activeSession.stats?.last_decision || "Listening for highlight signals…"}</p>
                <LiveFeedPreview
                  session={activeSession}
                  messages={liveMessages}
                  transport={chatStats.chat_transport}
                  streamRate={chatStats.msgs_per_sec ?? 0}
                  msgsPerMin={rate}
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
                  detectorConfig={{
                    ...(activeSession.config?.detector || {}),
                    cooldown_sec: activeSession.config?.cooldown_sec,
                    audio_peak_db: activeSession.config?.audio_peak_db ?? 14,
                  }}
                  msgsPerMin={rate}
                  msgsPerSec={chatStats.msgs_per_sec || activeSession?.stats?.msgs_per_sec_now || 0}
                  totalSpikes={totalSpikes}
                  clipsCut={clipsCut}
                  clipsCutting={clipsCutting}
                  onDetectorUpdate={(newCfg) => {
                    setActiveSession((prev) =>
                      prev
                        ? {
                            ...prev,
                            config: {
                              ...prev.config,
                              ...(newCfg.cooldown_sec !== undefined ? { cooldown_sec: newCfg.cooldown_sec } : {}),
                              ...(newCfg.audio_peak_db !== undefined ? { audio_peak_db: newCfg.audio_peak_db } : {}),
                              detector: {
                                ...prev.config?.detector,
                                ...newCfg,
                              },
                            },
                          }
                        : prev,
                    );
                  }}
                />

                {/* Live Clips Being Cut & Recent Session Cuts */}
                <div className="rounded-2xl bg-paper2/60 border border-white/10 backdrop-blur-2xl p-4 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_36px_-16px_rgba(0,0,0,0.45)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Scissors size={14} className="text-[#ff66b2]" />
                      <span className="text-xs font-semibold uppercase tracking-[0.06em] font-mono text-white">
                        Live Clips &amp; Spikes
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/12 border border-rose-500/25 text-[11px] font-mono text-rose-200 tabular-nums">
                        <Zap size={10} className="text-rose-400" />
                        {totalSpikes} spikes
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-[11px] font-mono text-emerald-200 tabular-nums">
                        {clipsCut} cut
                      </span>
                      {clipsCutting > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e31084]/15 border border-[#e31084]/35 text-[11px] font-mono text-pink-200 tabular-nums">
                          <Loader2 size={10} className="animate-spin text-[#ff66b2]" />
                          Cutting {clipsCutting}…
                        </span>
                      )}
                    </div>
                    {activeSessionClips.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTabSubView('clips')}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.12] text-xs font-medium text-white/90 transition-colors"
                      >
                        <span>Open Clips ({activeSessionClips.length})</span>
                        <ChevronRight size={13} />
                      </button>
                    )}
                  </div>

                  {activeSessionClips.length === 0 ? (
                    <p className="text-xs text-muted">
                      {clipsCutting > 0
                        ? 'Spike detected — confirming and cutting highlight clip now…'
                        : 'Watching chat velocity and audio peaks. Detected highlights will appear here as they are cut.'}
                    </p>
                  ) : (
                    <div className="divide-y divide-white/[0.06] rounded-xl bg-black/25 border border-white/[0.06] overflow-hidden">
                      {activeSessionClips.slice(0, 5).map((clip) => (
                        <div
                          key={clip.id}
                          className="px-3 py-2 flex items-center justify-between gap-3 text-xs hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="min-w-0 flex items-center gap-2.5">
                            <span className="font-medium text-white truncate">
                              {clip.title || `Highlight @ ${Math.round(clip.start_t || 0)}s`}
                            </span>
                            {clip.duration ? (
                              <span className="text-[11px] font-mono text-muted tabular-nums shrink-0">
                                {Math.round(clip.duration)}s
                              </span>
                            ) : null}
                            {clip.score ? (
                              <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-white/75 tabular-nums shrink-0">
                                score {Math.round(clip.score)}
                              </span>
                            ) : null}
                          </div>
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium border shrink-0 capitalize ${
                              clip.status === 'skipper'
                                ? 'bg-[#e31084]/15 border-[#e31084]/30 text-pink-200'
                                : clip.status === 'approved' || clip.status === 'completed'
                                  ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-300'
                                  : 'bg-white/[0.06] border-white/[0.12] text-white/80'
                            }`}
                          >
                            {clip.status === 'skipper'
                              ? 'Sent to Skipper'
                              : (clip.status || 'pending_review').replaceAll('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <StartPanel onSessionStarted={handleSessionStarted} />
            )}
          </section>
          {activeTabSubView === 'watch' && <Watchlist onOpen={handleSessionStarted} />}
          {activeTabSubView === 'clips' && review(queueItems)}
          {activeTabSubView === 'history' &&
            (selectedPastSession ? (
              <>
                <button className="lc-back" onClick={() => setSelectedPastSession(null)}>
                  <ArrowLeft size={15} /> All sessions
                </button>
                <header className="lc-heading">
                  <div>
                    <h2>{selectedPastSession.config?.channel}</h2>
                    <p>
                      {selectedPastSession.config?.platform} · {sessionDurationText} · {pastItems.length}{' '}
                      clips
                    </p>
                  </div>
                  <button className="lc-primary" onClick={() => setReviewingSession(selectedPastSession)}>
                    Review timeline
                  </button>
                </header>
                <dl className="lc-metrics">
                  {[
                    ['Spikes', selectedPastSession.stats?.spikes_total],
                    ['Approved', selectedPastSession.stats?.clips_approved],
                    ['Buffer', selectedPastSession.config?.recording_mode],
                    ['Storage (MB)', selectedPastSession.stats?.disk_used_mb],
                    ['Spike ratio', selectedPastSession.config?.detector?.ratio_threshold],
                    ['AI hooks', selectedPastSession.config?.hook_mode],
                  ].map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
                <p className="lc-hint">
                  Session ID · <code>{selectedPastSession.id}</code>
                </p>
                {review(pastItems)}
              </>
            ) : (
              <SessionHistory
                onSelectSession={inspectSession}
                onClipCut={(clip) => clip && setQueueItems((prev) => [clip, ...prev])}
              />
            ))}
          {activeTabSubView === 'skipper' && <Skipper captureId={queueItems[0]?.id} />}
        </div>
      </div>
      {reviewingSession && (
        <AfterStreamReviewModal
          session={reviewingSession}
          onClose={() => setReviewingSession(null)}
          onClipCut={(clip) => {
            if (clip) setPastItems((prev) => [clip, ...prev]);
          }}
        />
      )}
    </section>
  );
}
