import React, { useMemo, useState, useEffect } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  Zap, 
  Sliders, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Check, 
  Volume2, 
  Flame,
  Coffee,
  Scale,
  Scissors,
  X,
  Loader2
} from 'lucide-react';
import InfoBead from './InfoBead';
import { apiJson } from '../../lib/api';

const SENSITIVITY_PRESETS_QUICK = [
  {
    key: 'quiet',
    label: 'Quiet Chat',
    ratio: 1.25,
    minCount: 3,
    cooldown: 30,
    tagline: '1.25× • 3+ msgs',
    icon: Coffee,
  },
  {
    key: 'sensitive',
    label: 'Aggressive',
    ratio: 1.45,
    minCount: 5,
    cooldown: 45,
    tagline: '1.45× • 5+ msgs',
    icon: Flame,
  },
  {
    key: 'balanced',
    label: 'Balanced',
    ratio: 1.8,
    minCount: 8,
    cooldown: 60,
    tagline: '1.8× • 8+ msgs',
    icon: Scale,
    recommended: true,
  },
  {
    key: 'strict',
    label: 'Hype / Raids',
    ratio: 2.5,
    minCount: 16,
    cooldown: 90,
    tagline: '2.5× • 16+ msgs',
    icon: Zap,
  },
];

/**
 * Pure lightweight SVG chart for live chat velocity, baseline, and trigger threshold.
 *
 * Props:
 * - points: Array of { t, count, baseline, gap }
 * - spikes: Array of Spike objects { id, onset, peak, end, score, peak_count }
 * - audioEnergy: Array of { t, smooth, db, is_peak }
 * - audioPeaks: Array of { t, db_above_floor, label }
 * - heatmap: Array of { start_time, end_time, value }
 * - sessionDuration: Current session clock float seconds
 * - windowSec: Rolling display window in seconds (default: 600s = 10 min)
 * - sessionId: Active session UUID for live filter adjustments
 * - detectorConfig: { ratio_threshold, min_count, cooldown_sec }
 * - onDetectorUpdate: callback when detector settings are changed
 */
export default function LiveChatGraph({
  points = [],
  spikes = [],
  audioEnergy = [],
  audioPeaks = [],
  heatmap = [],
  sessionDuration = 0,
  windowSec = 600,
  sessionId = null,
  detectorConfig = null,
  msgsPerMin = 0,
  msgsPerSec = 0,
  totalSpikes = null,
  clipsCut = null,
  clipsCutting = 0,
  onDetectorUpdate = null,
}) {
  const width = 800;
  const height = 220;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Active filter state (syncs with session or user live edits)
  const [activeRatio, setActiveRatio] = useState(detectorConfig?.ratio_threshold || 2.5);
  const [activeCount, setActiveCount] = useState(detectorConfig?.min_count || 5);
  const [activeCooldown, setActiveCooldown] = useState(detectorConfig?.cooldown_sec || 60);
  const [activeAudioDb, setActiveAudioDb] = useState(detectorConfig?.audio_peak_db ?? 14);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  useEffect(() => {
    if (detectorConfig) {
      if (detectorConfig.ratio_threshold !== undefined) setActiveRatio(detectorConfig.ratio_threshold);
      if (detectorConfig.min_count !== undefined) setActiveCount(detectorConfig.min_count);
      if (detectorConfig.cooldown_sec !== undefined) setActiveCooldown(detectorConfig.cooldown_sec);
      if (detectorConfig.audio_peak_db !== undefined) setActiveAudioDb(detectorConfig.audio_peak_db);
    }
  }, [detectorConfig]);

  // Window range: [windowStart, windowEnd]
  const windowEnd = Math.max(windowSec, sessionDuration);
  const windowStart = Math.max(0, windowEnd - windowSec);

  // Filter visible points within window
  const visiblePoints = useMemo(() => {
    return points.filter((p) => p.t >= windowStart - 10 && p.t <= windowEnd + 10);
  }, [points, windowStart, windowEnd]);

  // Find max value for Y scaling (including trigger line so it's always in view)
  const maxY = useMemo(() => {
    let max = 10;
    for (const p of visiblePoints) {
      if (p.count > max) max = p.count;
      if (p.baseline > max) max = p.baseline;
      const trig = Math.max(p.baseline * activeRatio, activeCount);
      if (trig > max) max = trig;
    }
    for (const s of spikes) {
      if (s.peak >= windowStart && s.peak <= windowEnd && s.peak_count > max) {
        max = s.peak_count;
      }
    }
    return Math.ceil(max * 1.25);
  }, [visiblePoints, spikes, windowStart, windowEnd, activeRatio, activeCount]);

  // Coordinate projection helpers
  const getX = (t) => {
    const ratio = (t - windowStart) / (windowEnd - windowStart || 1);
    return padLeft + Math.max(0, Math.min(1, ratio)) * chartW;
  };

  const getY = (val) => {
    const ratio = Math.max(0, val) / maxY;
    return padTop + chartH - ratio * chartH;
  };

  // Build SVG paths (Smoothed Rate, Raw Count, Baseline, Trigger Level line, and Gaps)
  const { smoothedPath, rawPath, areaPath, baselinePath, triggerPath, gapRects } = useMemo(() => {
    if (visiblePoints.length === 0) {
      return { smoothedPath: '', rawPath: '', areaPath: '', baselinePath: '', triggerPath: '', gapRects: [] };
    }

    const sCoords = [];
    const rCoords = [];
    const bCoords = [];
    const tCoords = [];
    const gaps = [];

    let currentGap = null;

    visiblePoints.forEach((p) => {
      const x = getX(p.t);
      const smoothedVal = p.smoothed !== undefined ? p.smoothed : p.count;
      const ySmoothed = getY(smoothedVal);
      const yRaw = getY(p.count);
      const yBase = getY(p.baseline);
      const trigVal = Math.max(p.baseline * activeRatio, activeCount);
      const yTrig = getY(trigVal);

      sCoords.push(`${x},${ySmoothed}`);
      rCoords.push(`${x},${yRaw}`);
      bCoords.push(`${x},${yBase}`);
      tCoords.push(`${x},${yTrig}`);

      // Track gap intervals
      if (p.gap) {
        if (!currentGap) {
          currentGap = { startX: x };
        }
      } else if (currentGap) {
        currentGap.endX = x;
        gaps.push(currentGap);
        currentGap = null;
      }
    });

    if (currentGap) {
      currentGap.endX = padLeft + chartW;
      gaps.push(currentGap);
    }

    const sPath = `M ${sCoords.join(' L ')}`;
    const rPath = `M ${rCoords.join(' L ')}`;
    const bPath = `M ${bCoords.join(' L ')}`;
    const tPath = `M ${tCoords.join(' L ')}`;

    // Area closed path under smoothed rate
    const firstX = padLeft;
    const lastX = padLeft + chartW;
    const zeroY = padTop + chartH;
    const aPath = `M ${firstX},${zeroY} L ${sCoords.join(' L ')} L ${lastX},${zeroY} Z`;

    return {
      smoothedPath: sPath,
      rawPath: rPath,
      areaPath: aPath,
      baselinePath: bPath,
      triggerPath: tPath,
      gapRects: gaps,
    };
  }, [visiblePoints, maxY, windowStart, windowEnd, activeRatio, activeCount]);

  // Visible audio energy, audio peaks, and YouTube retention heatmap paths
  const { audioPath, heatmapPath, visibleAudioPeaks } = useMemo(() => {
    // 1. Audio Energy Path
    const aCoords = [];
    if (audioEnergy && audioEnergy.length > 0) {
      const visAudio = audioEnergy.filter((a) => a.t >= windowStart - 5 && a.t <= windowEnd + 5);
      visAudio.forEach((a) => {
        const x = getX(a.t);
        // Map dB (range -60 to -5) into bottom 40% of the chart
        const norm = Math.max(0, Math.min(1, ((a.smooth !== undefined ? a.smooth : a.db) - (-60)) / 55));
        const y = padTop + chartH - (norm * chartH * 0.45);
        aCoords.push(`${x},${y}`);
      });
    }

    // 2. YouTube Retention Heatmap Path
    const hCoords = [];
    if (heatmap && heatmap.length > 0) {
      const visHeat = heatmap.filter((h) => (h.start_time || 0) >= windowStart - 30 && (h.end_time || 0) <= windowEnd + 30);
      visHeat.forEach((h) => {
        const midT = ((h.start_time || 0) + (h.end_time || 0)) / 2;
        const x = getX(midT);
        const y = padTop + chartH - (Math.max(0, Math.min(1, h.value || 0)) * chartH * 0.85);
        hCoords.push(`${x},${y}`);
      });
    }

    // 3. Audio peaks in window
    const visPeaks = (audioPeaks || []).filter((p) => p.t >= windowStart && p.t <= windowEnd);

    return {
      audioPath: aCoords.length > 0 ? `M ${aCoords.join(' L ')}` : '',
      heatmapPath: hCoords.length > 0 ? `M ${hCoords.join(' L ')}` : '',
      visibleAudioPeaks: visPeaks,
    };
  }, [audioEnergy, audioPeaks, heatmap, windowStart, windowEnd, chartH, chartW]);

  // Current live baseline reading
  const latestBaseline = useMemo(() => {
    if (visiblePoints.length === 0) return 0;
    return visiblePoints[visiblePoints.length - 1].baseline || 0;
  }, [visiblePoints]);

  const currentTriggerThreshold = Math.max(activeCount, Math.round(latestBaseline * activeRatio));

  // Visible spikes within window
  const visibleSpikes = useMemo(() => {
    return spikes.filter((s) => s.peak >= windowStart && s.peak <= windowEnd);
  }, [spikes, windowStart, windowEnd]);

  // Format seconds to M:SS or H:MM:SS
  const formatTime = (sec) => {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const [syncing, setSyncing] = useState(false);
  const [syncSaved, setSyncSaved] = useState(false);

  const handleLiveFilterUpdate = async (newSettings) => {
    if (newSettings.ratio_threshold !== undefined) setActiveRatio(newSettings.ratio_threshold);
    if (newSettings.min_count !== undefined) setActiveCount(newSettings.min_count);
    if (newSettings.cooldown_sec !== undefined) setActiveCooldown(newSettings.cooldown_sec);
    if (newSettings.audio_peak_db !== undefined) setActiveAudioDb(newSettings.audio_peak_db);

    if (onDetectorUpdate) {
      onDetectorUpdate(newSettings);
    }

    if (sessionId) {
      setSyncing(true);
      try {
        await apiJson(`/api/liveclipper/sessions/${sessionId}/detector`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSettings),
        });
        setSyncSaved(true);
        setTimeout(() => setSyncSaved(false), 2000);
      } catch (err) {
        console.warn('Failed to update live detector settings:', err);
      } finally {
        setSyncing(false);
      }
    }
  };

  const handleSelectPreset = (preset) => {
    handleLiveFilterUpdate({
      ratio_threshold: preset.ratio,
      min_count: preset.minCount,
      cooldown_sec: preset.cooldown,
    });
  };

  const spikeTotalCount = totalSpikes ?? spikes.length;
  const clipsCutCount = clipsCut ?? 0;

  return (
    <div className="w-full bg-paper2/60 border border-white/10 rounded-2xl p-4 sm:p-5 relative overflow-hidden backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_36px_-16px_rgba(0,0,0,0.55)] space-y-3.5">
      {/* Header bar with title, live spikes/clips metrics, and spike controls toggle */}
      <div className="flex flex-col gap-3 border-b border-white/10 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Title, Live status, and Chat Velocity Speedometer */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-ink">
            <Activity size={15} className="text-[#ff66b2] animate-pulse" />
            <span className="font-semibold uppercase tracking-wider text-micro">Live Chat Velocity</span>
            <span className="text-muted text-[11px]">(rolling 10m window)</span>
            <InfoBead
              title="Live Chat Velocity Graph"
              desc="Displays real-time message volume and baseline. When the orange Chat Rate crosses above the amber Trigger Level, a clip is created!"
              lowResult="If chat peaks below the amber line, no clip is cut because the surge wasn't strong enough."
              highResult="Click 'Spike Controls' to pick 'Aggressive' or lower the surge multiplier so smaller peaks cut clips!"
              example="In your graph: Baseline ~12 msgs, peaks ~25 msgs. Setting 2.0× brings the trigger line to ~24 msgs!"
              align="left"
            />

            {/* Real-time Messages/Min Speed Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.12] font-mono text-micro text-ink">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="tabular-nums">
                Speed: <strong className="text-white font-semibold">~{msgsPerMin} msgs/min</strong>
                {msgsPerSec > 0 ? ` (${msgsPerSec}/s)` : ''}
              </span>
            </div>
          </div>

          {/* Live Spikes & Clips Counters + Spike Controls Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/12 border border-rose-500/25 text-xs font-mono text-rose-200 tabular-nums"
              title="Total spikes detected in this session"
            >
              <Zap size={12} className="text-rose-400" />
              <span>Spikes:</span>
              <strong className="text-white font-semibold">{spikeTotalCount}</strong>
            </div>

            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-xs font-mono text-emerald-200 tabular-nums"
              title="Total clips cut in this session"
            >
              <Scissors size={12} className="text-emerald-400" />
              <span>Clips cut:</span>
              <strong className="text-white font-semibold">{clipsCutCount}</strong>
            </div>

            {clipsCutting > 0 && (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#e31084]/15 border border-[#e31084]/35 text-xs font-mono text-pink-200 tabular-nums"
                title="Clips currently being cut or processed"
              >
                <Loader2 size={12} className="animate-spin text-[#ff66b2]" />
                <span>Cutting {clipsCutting}…</span>
              </div>
            )}

            {/* Spike Controls Toggle Button */}
            <button
              type="button"
              aria-expanded={showFilterDrawer}
              onClick={() => setShowFilterDrawer((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all duration-150 cursor-pointer active:scale-[0.97] ${
                showFilterDrawer
                  ? 'btn-brand-accent'
                  : 'bg-white/[0.07] text-white/90 hover:text-white hover:bg-white/[0.13] border-white/[0.14]'
              }`}
              title="Toggle live spike detection controls without restarting stream"
            >
              <Sliders size={12} />
              <span>Spike Controls</span>
              {showFilterDrawer ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>

        {/* Legend with interactive Info Beads */}
        <div className="flex flex-wrap items-center gap-3.5 text-micro font-mono">
          <div className="flex items-center gap-1.5" title="Smoothed chat velocity evaluated against the trigger line">
            <span className="w-2.5 h-0.5 bg-brass rounded-full" />
            <span className="text-ink">Chat Velocity</span>
            <InfoBead
              title="Chat Velocity (Smoothed)"
              desc="The continuous 2-bin moving average of chat messages. This smooth curve is what evaluates against the Trigger Line so 1-second burst noise doesn't trigger false clips."
              align="center"
            />
          </div>

          <div className="flex items-center gap-1.5" title="Raw instant message count in each 10s bin">
            <span className="w-2.5 h-0.5 bg-brass/50 border-t border-dashed border-brass" />
            <span className="text-muted text-[10px]">Raw Bursts</span>
          </div>

          <div className="flex items-center gap-1.5" title="Rolling 3-min median baseline of normal chat activity">
            <span className="w-2.5 h-0.5 bg-muted/60 border-t border-dashed border-muted" />
            <span className="text-muted">Baseline (~{latestBaseline.toFixed(0)})</span>
          </div>

          {/* Trigger Level Guideline (The secret ingredient!) */}
          <div className="flex items-center gap-1.5 bg-white/[0.06] px-2.5 py-0.5 rounded-full border border-white/[0.12]" title="When Chat Rate rises above this line, a clip is triggered!">
            <span className="w-2.5 h-0.5 bg-amber-300 border-t border-dotted border-amber-300" />
            <span className="text-amber-200 font-semibold">Trigger: {activeRatio}× (~{currentTriggerThreshold} msgs)</span>
            <InfoBead
              title="Clip Trigger Level"
              desc={`A clip is cut when chat surges above this line (currently ${activeRatio}× baseline of last 3 min, min ${activeCount} msgs). If peaks don't reach this line, lower the sensitivity multiplier!`}
              example={`At ${activeRatio}×: Chat must surge above ${currentTriggerThreshold} messages in a 10s window to trigger a clip.`}
              align="right"
            />
          </div>

          {/* Audio Loudness & Scream Indicator */}
          {audioEnergy && audioEnergy.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30" title="Audio RMS volume energy. Spikes +6dB above floor flag shout/laugh reactions!">
              <Volume2 size={12} className="text-purple-400" />
              <span className="text-purple-300 font-mono text-[10px]">Audio Loudness ({visibleAudioPeaks.length} Peaks)</span>
            </div>
          )}

          {/* YouTube Most Replayed Heatmap Indicator */}
          {heatmap && heatmap.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ff4d4d]/10 border border-[#ff4d4d]/30" title="YouTube viewer retention graph ('Most replayed')">
              <Flame size={12} className="text-[#ff4d4d]" />
              <span className="text-[#ff4d4d] font-mono text-[10px]">Retention Heatmap</span>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Live Filter Tuning Drawer (Apple Minimal Glass Design) */}
      {showFilterDrawer && (
        <div className="p-4 sm:p-5 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10 shadow-2xl animate-fade space-y-4">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Sliders size={14} className="text-brass" />
              <span className="text-xs font-semibold text-white font-mono uppercase tracking-wider">Live Sensitivity Tuner</span>
              {msgsPerMin > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-muted">
                  Pace: ~{msgsPerMin} msgs/min
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-micro font-mono">
              {syncing ? (
                <span className="text-brass flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Updating live...
                </span>
              ) : syncSaved ? (
                <span className="text-ok flex items-center gap-1">
                  <Check size={11} /> Saved live
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setShowFilterDrawer(false)}
                className="p-1 rounded-full text-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close sensitivity tuner"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Preset Pills (Apple Segmented Picker) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SENSITIVITY_PRESETS_QUICK.map((preset) => {
              const IconComp = preset.icon;
              const isSelected = Math.abs(activeRatio - preset.ratio) < 0.15 && activeCount === preset.minCount;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-brass/15 border-brass/50 text-brass shadow-xs'
                      : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/10 text-muted hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <IconComp size={12} className={isSelected ? 'text-brass' : 'text-muted'} />
                      {preset.label}
                    </span>
                    {isSelected && <Check size={11} className="text-brass" />}
                  </div>
                  <span className="text-[10.5px] font-mono opacity-75">{preset.tagline}</span>
                </button>
              );
            })}
          </div>

          {/* Fine-Tuning Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 text-xs font-mono">
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted text-[11px]">Surge Multiplier</span>
                <span className="text-brass font-bold">{activeRatio.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min="1.1"
                max="4.0"
                step="0.05"
                value={activeRatio}
                onChange={(e) => handleLiveFilterUpdate({
                  ratio_threshold: Number(e.target.value),
                  min_count: activeCount,
                  cooldown_sec: activeCooldown,
                  audio_peak_db: activeAudioDb,
                })}
                className="w-full accent-brass cursor-pointer"
              />
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted text-[11px]">Min Message Count</span>
                <span className="text-brass font-bold">{activeCount} msgs</span>
              </div>
              <input
                type="range"
                min="2"
                max="40"
                step="1"
                value={activeCount}
                onChange={(e) => handleLiveFilterUpdate({
                  ratio_threshold: activeRatio,
                  min_count: Number(e.target.value),
                  cooldown_sec: activeCooldown,
                  audio_peak_db: activeAudioDb,
                })}
                className="w-full accent-brass cursor-pointer"
              />
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted text-[11px]">Cooldown Window</span>
                <span className="text-brass font-bold">{activeCooldown}s</span>
              </div>
              <input
                type="range"
                min="15"
                max="180"
                step="5"
                value={activeCooldown}
                onChange={(e) => handleLiveFilterUpdate({
                  ratio_threshold: activeRatio,
                  min_count: activeCount,
                  cooldown_sec: Number(e.target.value),
                  audio_peak_db: activeAudioDb,
                })}
                className="w-full accent-brass cursor-pointer"
              />
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted text-[11px]">Loudness Surge</span>
                <span className="text-[#ff66b2] font-bold">+{activeAudioDb} dB</span>
              </div>
              <input
                type="range"
                min="8"
                max="28"
                step="1"
                value={activeAudioDb}
                onChange={(e) => handleLiveFilterUpdate({
                  ratio_threshold: activeRatio,
                  min_count: activeCount,
                  cooldown_sec: activeCooldown,
                  audio_peak_db: Number(e.target.value),
                })}
                className="w-full accent-[#e31084] cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* SVG Canvas */}
      <div className="w-full relative h-[220px]">
        {visiblePoints.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted gap-2 font-mono text-xs">
            <Activity size={24} className="opacity-40 animate-pulse" />
            <span>Waiting for stream chat activity...</span>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full select-none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="liveRateGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(76% 0.17 50)" stopOpacity="0.30" />
                <stop offset="100%" stopColor="oklch(76% 0.17 50)" stopOpacity="0.0" />
              </linearGradient>
              <pattern id="gapHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="oklch(66% 0.18 25)" strokeWidth="1.5" strokeOpacity="0.3" />
              </pattern>
            </defs>

            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac, i) => {
              const y = padTop + chartH * (1 - frac);
              const val = Math.round(maxY * frac);
              return (
                <g key={i}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + chartW}
                    y2={y}
                    stroke="var(--color-rule)"
                    strokeDasharray={frac > 0 ? "3 3" : undefined}
                    strokeOpacity={frac > 0 ? "0.4" : "0.8"}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="currentColor"
                    className="text-[10px] font-mono fill-muted"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Gap shaded intervals */}
            {gapRects.map((g, idx) => (
              <rect
                key={idx}
                x={g.startX}
                y={padTop}
                width={Math.max(2, (g.endX || g.startX + 10) - g.startX)}
                height={chartH}
                fill="url(#gapHatch)"
              />
            ))}

            {/* Area fill under chat rate curve */}
            <path d={areaPath} fill="url(#liveRateGrad)" />

            {/* Baseline dashed path */}
            <path
              d={baselinePath}
              fill="none"
              stroke="oklch(64% 0.012 262)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeOpacity="0.65"
            />

            {/* Trigger Threshold Dotted Guideline */}
            <path
              d={triggerPath}
              fill="none"
              stroke="oklch(76% 0.17 75)"
              strokeWidth="1.6"
              strokeDasharray="3 3"
              strokeOpacity="0.8"
            />

            {/* Raw instant burst line (faint dashed) */}
            <path
              d={rawPath}
              fill="none"
              stroke="oklch(76% 0.17 50)"
              strokeWidth="1.2"
              strokeDasharray="2 2"
              strokeOpacity="0.45"
            />

            {/* Smoothed chat velocity line (evaluates against trigger line) */}
            <path
              d={smoothedPath}
              fill="none"
              stroke="oklch(76% 0.17 50)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* YouTube 'Most Replayed' Heatmap Retention line */}
            {heatmapPath && (
              <path
                d={heatmapPath}
                fill="none"
                stroke="#ff4d4d"
                strokeWidth="1.8"
                strokeDasharray="4 2"
                strokeOpacity="0.85"
              />
            )}

            {/* Audio RMS volume loudness line */}
            {audioPath && (
              <path
                d={audioPath}
                fill="none"
                stroke="#a855f7"
                strokeWidth="1.4"
                strokeDasharray="2 2"
                strokeOpacity="0.65"
              />
            )}

            {/* Audio Peak scream/hype markers */}
            {visibleAudioPeaks.map((p, idx) => {
              const xAudio = getX(p.t);
              const yAudio = padTop + chartH - 12;
              return (
                <g key={`audio-${idx}`} className="cursor-pointer" opacity="0.9">
                  <circle cx={xAudio} cy={yAudio} r={4.5} fill="#a855f7" fillOpacity="0.3" />
                  <circle cx={xAudio} cy={yAudio} r={2.5} fill="#c084fc" />
                  <text
                    x={xAudio}
                    y={yAudio - 5}
                    textAnchor="middle"
                    fill="#c084fc"
                    className="text-[8px] font-mono select-none font-semibold"
                  >
                    🔊 +{p.db_above_floor}dB
                  </text>
                </g>
              );
            })}

            {/* Spike vertical markers & badges */}
            {visibleSpikes.map((spk) => {
              const xPeak = getX(spk.peak);
              const yPeak = getY(spk.peak_count);
              return (
                <g key={spk.id} className="cursor-pointer group">
                  {/* Vertical spike indicator line */}
                  <line
                    x1={xPeak}
                    y1={padTop}
                    x2={xPeak}
                    y2={padTop + chartH}
                    stroke="oklch(68% 0.16 18)"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                    strokeOpacity="0.8"
                  />
                  {/* Glow circle */}
                  <circle
                    cx={xPeak}
                    cy={yPeak}
                    r={6}
                    fill="oklch(68% 0.16 18)"
                    fillOpacity="0.3"
                  />
                  <circle
                    cx={xPeak}
                    cy={yPeak}
                    r={3.5}
                    fill="oklch(68% 0.16 18)"
                  />
                  {/* Score pill on top */}
                  <g transform={`translate(${xPeak - 18}, ${padTop - 12})`}>
                    <rect
                      width="36"
                      height="15"
                      rx="3"
                      fill="oklch(68% 0.16 18)"
                      fillOpacity="0.9"
                    />
                    <text
                      x="18"
                      y="11"
                      textAnchor="middle"
                      fill="#fff"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {Math.round(spk.score)}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Time labels on bottom axis */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac, i) => {
              const t = windowStart + (windowEnd - windowStart) * frac;
              const x = padLeft + chartW * frac;
              return (
                <text
                  key={i}
                  x={x}
                  y={height - 8}
                  textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
                  fill="currentColor"
                  className="text-[10px] font-mono fill-muted"
                >
                  {formatTime(t)}
                </text>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
