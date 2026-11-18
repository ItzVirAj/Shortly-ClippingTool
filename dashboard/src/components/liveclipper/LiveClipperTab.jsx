import Skipper from './Skipper';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, History, Scissors, Radio, Loader2, Bot, ArrowLeft } from 'lucide-react';
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
  const [monitorView, setMonitorView] = useState('feed');

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
    setMonitorView('feed');
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

  async function updateClip(id, action) {
    try {
      await apiJson(`/api/liveclipper/queue/${id}/${action}`, { method: 'POST' });
      const update = (items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: action === 'approve' ? 'approved' : 'rejected' } : item,
        );
      setQueueItems(update);
      setPastItems(update);
    } catch (err) {
      alert(err.detail || err.message || 'Could not update clip.');
    }
  }

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-muted gap-3 font-mono text-sm">
        <Loader2 size={32} className="animate-spin text-brass" />
        <span>Initializing Live Clipper...</span>
      </div>
    );
  }

  const running =
    activeSession &&
    ['waiting_for_live', 'connecting', 'recording', 'stopping'].includes(activeSession.state);
  const rate = chatStats.msgs_per_min ?? activeSession?.stats?.msgs_per_min_now ?? 0;
  const destinations = [
    ['live', Radio, 'Session'],
    ['clips', Scissors, 'Clips'],
    ['history', History, 'History'],
    ['skipper', Bot, 'Skipper'],
  ];
  const review = (items) => (
    <ReviewQueue
      items={items}
      onApprove={(id) => updateClip(id, 'approve')}
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
    <section className="lc-window" aria-label="Live Clipper">
      <div className="lc-bar">
        <h1>
          <Activity size={20} />
          Live Clipper
        </h1>
        <span className="lc-state" role="status">
          {running ? activeSession.state.replaceAll('_', ' ') : 'Standby'}
        </span>
      </div>
      <div className="lc-body">
        <aside className="lc-rail">
          <nav aria-label="Live Clipper views">
            {destinations.map(([key, Icon, label]) => (
              <button
                key={key}
                aria-current={activeTabSubView === key ? 'page' : undefined}
                onClick={() => setActiveTabSubView(key)}
              >
                <Icon size={17} />
                <span>{label}</span>
                {key === 'clips' && <small>{queueItems.length}</small>}
              </button>
            ))}
          </nav>
          <button
            className="lc-companion"
            onClick={() => setActiveTabSubView('skipper')}
            aria-label="Open Skipper automation"
          >
            <SkipperPortrait />
            <span>
              Skipper <span aria-hidden="true">↗</span>
            </span>
          </button>
        </aside>
        <div className="lc-pane">
          {connectionLost && (
            <p role="alert">
              Connection lost. Reconnecting… <button onClick={checkInitialState}>Retry now</button>
            </p>
          )}
          <section hidden={activeTabSubView !== 'live'}>
            {running ? (
              <>
                <LiveSessionPanel
                  session={activeSession}
                  onStop={handleStopSession}
                  isPaused={isPaused}
                  onTogglePause={handleTogglePause}
                />
                <div className="lc-segment lc-monitor">
                  {[
                    ['feed', 'Stream & chat'],
                    ['signal', 'Signal timeline'],
                  ].map(([key, label]) => (
                    <button key={key} aria-pressed={monitorView === key} onClick={() => setMonitorView(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                {monitorView === 'feed' ? (
                  <LiveFeedPreview
                    session={activeSession}
                    messages={liveMessages}
                    transport={chatStats.chat_transport}
                    streamRate={chatStats.msgs_per_sec ?? 0}
                    msgsPerMin={rate}
                  />
                ) : (
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
                    msgsPerMin={rate}
                    msgsPerSec={chatStats.msgs_per_sec || activeSession?.stats?.msgs_per_sec_now || 0}
                    onDetectorUpdate={(newCfg) => {
                      setActiveSession((prev) =>
                        prev
                          ? {
                              ...prev,
                              config: {
                                ...prev.config,
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
                )}
              </>
            ) : (
              <StartPanel onSessionStarted={handleSessionStarted} />
            )}
          </section>
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
