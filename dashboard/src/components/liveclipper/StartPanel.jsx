import React, { useState, useEffect, useMemo } from 'react';
import { 
  Play, 
  Shield, 
  CheckCircle2, 
  AlertCircle, 
  Sliders, 
  ChevronDown, 
  ChevronUp, 
  HardDrive, 
  Radio, 
  Clock, 
  Info,
  Loader2,
  Tv,
  HelpCircle,
  Sparkles,
  Flame,
  Scale,
  Coffee,
  Volume2,
  TrendingUp,
  X,
  BookOpen,
  Zap,
  Layers,
  Check
} from 'lucide-react';
import { apiJson } from '../../lib/api';
import InfoBead from './InfoBead';

// Sensitivity presets definition with Apple-style metadata
const PRESET_OPTIONS = [
  {
    key: 'quiet',
    label: 'Quiet Chat',
    ratio: 1.25,
    minCount: 3,
    cooldown: 30,
    icon: Coffee,
    badge: '1.25× • 3+ msgs',
    description: 'For small streams (1–20 viewers). Triggers on subtle laughs and jokes.',
    color: 'teal',
  },
  {
    key: 'sensitive',
    label: 'Aggressive',
    ratio: 1.45,
    minCount: 5,
    cooldown: 45,
    icon: Flame,
    badge: '1.45× • 5+ msgs',
    description: 'Catches laughter bursts, punchlines, and frequent chat reactions (125+ msg/min friendly).',
    color: 'coral',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    ratio: 1.8,
    minCount: 8,
    cooldown: 60,
    icon: Scale,
    badge: '1.8× • 8+ msgs',
    description: 'Recommended sweet spot for active streams (100–250 msgs/min). Strong highlights with clean cooldown.',
    color: 'brass',
    recommended: true,
  },
  {
    key: 'strict',
    label: 'Hype / Raids',
    ratio: 2.5,
    minCount: 16,
    cooldown: 90,
    icon: Zap,
    badge: '2.5× • 16+ msgs',
    description: 'For massive viral floods, raids, and screaming hype moments only.',
    color: 'ink',
  },
];

export default function StartPanel({ onSessionStarted }) {
  const [platform, setPlatform] = useState('kick');
  const [rawChannel, setRawChannel] = useState('');
  const [recordingMode, setRecordingMode] = useState('rolling');
  const [bufferMinutes, setBufferMinutes] = useState(8);
  const [selectedPreset, setSelectedPreset] = useState('balanced');
  const [customFilter, setCustomFilter] = useState({
    ratio_threshold: 1.8,
    min_count: 8,
    cooldown_sec: 60,
  });
  const [showManualTuning, setShowManualTuning] = useState(false);

  // Multi-signal toggles
  const [audioPeaksEnabled, setAudioPeaksEnabled] = useState(true);
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);

  // Advanced accordion
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hookMode, setHookMode] = useState('auto');
  const [autoProcess, setAutoProcess] = useState(false);
  const [waitForLive, setWaitForLive] = useState(false);
  const [advConfig, setAdvConfig] = useState({
    before_sec: 25,
    after_sec: 10,
    min_len: 20,
    max_len: 60,
    cooldown_sec: 90,
    max_clips_per_hour: 12,
    sync_offset_sec: 0,
    confirm_delay_sec: 8,
  });

  // Permission acknowledgment
  const [permissionAck, setPermissionAck] = useState(false);

  // Stream Guide / Specs Modal
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Health and loading states
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch health status
  useEffect(() => {
    let mounted = true;
    apiJson('/api/liveclipper/health')
      .then((data) => {
        if (mounted) {
          setHealth(data);
          setHealthLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setHealth({ error: err.detail || 'Health check failed' });
          setHealthLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Listen for Escape to close Guide Modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showGuideModal) {
        setShowGuideModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showGuideModal]);

  // Channel sanitization
  const cleanSlug = useMemo(() => {
    let s = rawChannel.trim();
    if (platform === 'youtube') {
      return s;
    }
    s = s.replace(/^https?:\/\//i, '');
    s = s.replace(/^(www\.)?(kick\.com|twitch\.tv)\//i, '');
    s = s.split('/')[0].split('?')[0].trim();
    return s;
  }, [rawChannel, platform]);

  const isChannelValid = useMemo(() => {
    if (platform === 'youtube') {
      return cleanSlug.length >= 2;
    }
    return /^[A-Za-z0-9_-]{3,30}$/.test(cleanSlug);
  }, [cleanSlug, platform]);

  // Update filter when preset changes
  const handleSelectPreset = (presetKey) => {
    setSelectedPreset(presetKey);
    const p = PRESET_OPTIONS.find((opt) => opt.key === presetKey);
    if (p) {
      setCustomFilter({
        ratio_threshold: p.ratio,
        min_count: p.minCount,
        cooldown_sec: p.cooldown,
      });
    }
  };

  // Disk estimate text
  const diskEstimate = useMemo(() => {
    if (recordingMode === 'rolling') {
      const mb = Math.round(bufferMinutes * 30);
      return `~${mb} MB buffer (auto-pruned)`;
    }
    return `~1.8 GB / hr recorded`;
  }, [recordingMode, bufferMinutes]);

  const handleStart = async (e) => {
    e.preventDefault();
    if (!permissionAck || !isChannelValid || starting) return;

    setStarting(true);
    setErrorMsg('');

    const payload = {
      platform,
      channel: cleanSlug,
      permission_ack: true,
      recording_mode: recordingMode,
      buffer_minutes: Number(bufferMinutes),
      confirm_delay_sec: Number(advConfig.confirm_delay_sec),
      cooldown_sec: Number(customFilter.cooldown_sec || advConfig.cooldown_sec),
      max_clips_per_hour: Number(advConfig.max_clips_per_hour),
      sync_offset_sec: Number(advConfig.sync_offset_sec),
      hook_mode: hookMode,
      auto_process: Boolean(autoProcess),
      wait_for_live: Boolean(waitForLive),
      audio_peaks_enabled: Boolean(audioPeaksEnabled),
      heatmap_enabled: Boolean(heatmapEnabled),
      detector: {
        ratio_threshold: Number(customFilter.ratio_threshold),
        min_count: Number(customFilter.min_count),
        before_sec: Number(advConfig.before_sec),
        after_sec: Number(advConfig.after_sec),
        min_len: Number(advConfig.min_len),
        max_len: Number(advConfig.max_len),
      },
    };

    try {
      const res = await apiJson('/api/liveclipper/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (onSessionStarted) {
        onSessionStarted(res.id);
      }
    } catch (err) {
      setErrorMsg(err.detail || 'Failed to start Live Clipper session.');
      setStarting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Top Bar: Minimal Header + Status Pill + Guide Button */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-base font-semibold text-ink tracking-tight">Live Clipper Studio</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Health indicator badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] backdrop-blur-md border border-white/10 text-micro font-mono text-muted">
            {healthLoading ? (
              <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Readying...</span>
            ) : health?.error ? (
              <span className="text-danger flex items-center gap-1"><AlertCircle size={10} /> Degraded</span>
            ) : (
              <span className="text-ok flex items-center gap-1"><CheckCircle2 size={10} /> System Ready • {health?.disk_free_gb || 0}GB Free</span>
            )}
          </div>

          {/* Dedicated "How it Works / Guide" Button */}
          <button
            type="button"
            onClick={() => setShowGuideModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 border border-white/10 hover:border-white/20 text-xs font-medium text-ink transition-all cursor-pointer shadow-xs backdrop-blur-md"
            title="Open comprehensive stream clipping guide & specs"
          >
            <BookOpen size={13} className="text-brass" />
            <span>Guide & Specs</span>
          </button>
        </div>
      </div>

      {/* Main Glassmorphic Panel */}
      <form
        onSubmit={handleStart}
        className="relative rounded-3xl bg-paper2/50 backdrop-blur-xl border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.35)] p-6 sm:p-7 space-y-5 overflow-hidden"
      >
        {/* Subtle top edge specular reflection */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-danger/10 border border-danger/25 text-danger text-xs flex items-start gap-2.5 animate-fade">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div className="flex-1 font-mono">{errorMsg}</div>
          </div>
        )}

        {/* 1. Platform Selector (Apple Segmented Control) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted flex items-center gap-1.5">
              <span>Platform</span>
              <InfoBead
                title="Streaming Platform"
                desc="Pick Kick, Twitch, or YouTube. Shortly monitors live chat velocity, detects scream peaks in audio, and extracts YouTube viewer heatmaps."
                align="left"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 p-1 rounded-2xl bg-black/25 backdrop-blur-md border border-white/10 gap-1">
            <button
              type="button"
              onClick={() => setPlatform('kick')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                platform === 'kick'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : 'text-muted hover:text-ink border border-transparent'
              }`}
            >
              <Tv size={14} /> Kick
            </button>
            <button
              type="button"
              onClick={() => setPlatform('twitch')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                platform === 'twitch'
                  ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-xs'
                  : 'text-muted hover:text-ink border border-transparent'
              }`}
            >
              <Radio size={14} /> Twitch
            </button>
            <button
              type="button"
              onClick={() => setPlatform('youtube')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                platform === 'youtube'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-xs'
                  : 'text-muted hover:text-ink border border-transparent'
              }`}
            >
              <Play size={14} /> YouTube
            </button>
          </div>
        </div>

        {/* 2. Channel or Stream URL Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted flex items-center gap-1.5">
              <span>Channel Name or Stream URL</span>
              <InfoBead
                title="Channel Identifier"
                desc="Enter a username, handle (@streamer), or paste the full live stream / video link."
                example="Supports 'xqc', '@LofiGirl', or full URLs like 'https://youtube.com/watch?v=...'."
                align="left"
              />
            </label>
            {cleanSlug && (
              <span className="text-[11px] font-mono">
                {isChannelValid ? (
                  <span className="text-ok flex items-center gap-1">
                    <CheckCircle2 size={12} /> Valid
                  </span>
                ) : (
                  <span className="text-warn flex items-center gap-1">
                    <AlertCircle size={12} /> Invalid format
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder={
                platform === 'youtube'
                  ? '@streamer, handle, or https://youtube.com/watch?v=...'
                  : platform === 'twitch'
                  ? 'e.g. shroud or https://twitch.tv/channel'
                  : 'e.g. xqc or https://kick.com/channel'
              }
              value={rawChannel}
              onChange={(e) => setRawChannel(e.target.value)}
              className="w-full bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:border-brass/70 focus:ring-2 focus:ring-brass/20 transition-all font-mono"
            />
          </div>

          {/* Multi-Signal Intelligence Quick Chips */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <label
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro font-mono border transition-all cursor-pointer select-none active:scale-95 ${
                audioPeaksEnabled
                  ? 'bg-brass/10 border-brass/30 text-brass'
                  : 'bg-white/[0.02] border-white/5 text-muted hover:text-ink'
              }`}
            >
              <input
                type="checkbox"
                checked={audioPeaksEnabled}
                onChange={(e) => setAudioPeaksEnabled(e.target.checked)}
                className="hidden"
              />
              <Volume2 size={11} />
              <span>Audio Scream Peaks (+6dB)</span>
              <InfoBead
                title="Audio Loudness Peaks"
                desc="Continuously computes 16 kHz audio RMS energy to pinpoint screamed reactions, sudden laughter, and streamer hype moments."
                align="left"
              />
            </label>

            {platform === 'youtube' && (
              <label
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro font-mono border transition-all cursor-pointer select-none active:scale-95 ${
                  heatmapEnabled
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-white/[0.02] border-white/5 text-muted hover:text-ink'
                }`}
              >
                <input
                  type="checkbox"
                  checked={heatmapEnabled}
                  onChange={(e) => setHeatmapEnabled(e.target.checked)}
                  className="hidden"
                />
                <Flame size={11} />
                <span>YouTube "Most Replayed"</span>
                <InfoBead
                  title="YouTube Heatmaps"
                  desc="Reads YouTube playback retention graphs to find the exact moments thousands of viewers replayed."
                  align="left"
                />
              </label>
            )}
          </div>
        </div>

        {/* 3. Sensitivity Segmented Picker */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted flex items-center gap-1.5">
              <span>Sensitivity Preset</span>
              <InfoBead
                title="Spike Sensitivity"
                desc="Defines how large a chat surge must be relative to the 60s baseline to trigger a clip cut."
                recommendation="Balanced (2.6×) is recommended for most streams."
                align="left"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowManualTuning(!showManualTuning)}
              className="text-micro font-mono text-muted hover:text-brass transition-colors cursor-pointer"
            >
              {showManualTuning ? 'Hide Sliders' : 'Fine-tune Sliders'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_OPTIONS.map((opt) => {
              const IconComp = opt.icon;
              const isSelected = selectedPreset === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleSelectPreset(opt.key)}
                  className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                    isSelected
                      ? 'bg-brass/10 border-brass/50 text-brass shadow-xs'
                      : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/10 text-muted hover:text-ink'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <IconComp size={13} className={isSelected ? 'text-brass' : 'text-muted'} />
                      {opt.label}
                    </span>
                    {isSelected && <Check size={12} className="text-brass" />}
                  </div>
                  <span className="text-[11px] font-mono opacity-80">{opt.badge}</span>
                </button>
              );
            })}
          </div>

          {/* Optional Fine-Tune Sliders */}
          {showManualTuning && (
            <div className="mt-3 p-3.5 rounded-2xl bg-black/20 border border-white/10 space-y-3 animate-fade">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-muted">Surge Threshold Multiplier</span>
                <span className="text-brass font-semibold">{customFilter.ratio_threshold}×</span>
              </div>
              <input
                type="range"
                min="1.2"
                max="5.0"
                step="0.1"
                value={customFilter.ratio_threshold}
                onChange={(e) => {
                  setSelectedPreset('custom');
                  setCustomFilter({ ...customFilter, ratio_threshold: Number(e.target.value) });
                }}
                className="w-full accent-brass cursor-pointer"
              />
              <div className="flex items-center justify-between text-xs font-mono pt-1">
                <span className="text-muted">Minimum Messages to Trigger</span>
                <span className="text-brass font-semibold">{customFilter.min_count} msgs</span>
              </div>
              <input
                type="range"
                min="2"
                max="50"
                step="1"
                value={customFilter.min_count}
                onChange={(e) => {
                  setSelectedPreset('custom');
                  setCustomFilter({ ...customFilter, min_count: Number(e.target.value) });
                }}
                className="w-full accent-brass cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* 4. Buffer Strategy (Apple Segmented Bar) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted flex items-center gap-1.5">
              <span>Buffer Strategy</span>
              <InfoBead
                title="Recording Buffer"
                desc="Rolling Buffer keeps only the last 8-30 min in RAM/disk to save drive space (~240MB). Full Recording archives the entire live stream (~1.8GB/hr)."
                align="left"
              />
            </label>
            <span className="text-[11px] font-mono text-muted flex items-center gap-1">
              <HardDrive size={11} /> {diskEstimate}
            </span>
          </div>

          <div className="grid grid-cols-2 p-1 rounded-2xl bg-black/25 backdrop-blur-md border border-white/10 gap-1">
            <button
              type="button"
              onClick={() => setRecordingMode('rolling')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer active:scale-[0.98] text-center ${
                recordingMode === 'rolling'
                  ? 'bg-white/10 text-ink border border-white/20 shadow-xs'
                  : 'text-muted hover:text-ink border border-transparent'
              }`}
            >
              Rolling Buffer ({bufferMinutes}m)
            </button>
            <button
              type="button"
              onClick={() => setRecordingMode('full')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer active:scale-[0.98] text-center ${
                recordingMode === 'full'
                  ? 'bg-white/10 text-ink border border-white/20 shadow-xs'
                  : 'text-muted hover:text-ink border border-transparent'
              }`}
            >
              Full Recording
            </button>
          </div>

          {recordingMode === 'rolling' && (
            <div className="mt-3 px-1">
              <div className="flex justify-between text-micro font-mono text-muted mb-1">
                <span>3 min (Light)</span>
                <span className="text-brass font-semibold">{bufferMinutes} minutes</span>
                <span>30 min (Heavy)</span>
              </div>
              <input
                type="range"
                min="3"
                max="30"
                step="1"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
                className="w-full accent-brass cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* 5. Collapsible Advanced Settings (Progressive Disclosure) */}
        <div className="border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-xs font-mono text-muted hover:text-ink transition-colors py-1 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Sliders size={13} />
              <span>Advanced Tuning (Clip Durations, AI Hooks, Sync)</span>
            </span>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 rounded-2xl bg-black/25 backdrop-blur-md border border-white/10 space-y-4 animate-fade">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <label className="text-muted block mb-1">Lead Before Onset</label>
                  <input
                    type="number"
                    value={advConfig.before_sec}
                    onChange={(e) => setAdvConfig({ ...advConfig, before_sec: Number(e.target.value) })}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-2.5 py-1.5 text-ink"
                  />
                  <span className="text-micro text-muted">Secs (default: 25)</span>
                </div>
                <div>
                  <label className="text-muted block mb-1">Lag After End</label>
                  <input
                    type="number"
                    value={advConfig.after_sec}
                    onChange={(e) => setAdvConfig({ ...advConfig, after_sec: Number(e.target.value) })}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-2.5 py-1.5 text-ink"
                  />
                  <span className="text-micro text-muted">Secs (default: 10)</span>
                </div>
                <div>
                  <label className="text-muted block mb-1">Min Duration</label>
                  <input
                    type="number"
                    value={advConfig.min_len}
                    onChange={(e) => setAdvConfig({ ...advConfig, min_len: Number(e.target.value) })}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-2.5 py-1.5 text-ink"
                  />
                  <span className="text-micro text-muted">Secs (default: 20)</span>
                </div>
                <div>
                  <label className="text-muted block mb-1">Max Duration</label>
                  <input
                    type="number"
                    value={advConfig.max_len}
                    onChange={(e) => setAdvConfig({ ...advConfig, max_len: Number(e.target.value) })}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-2.5 py-1.5 text-ink"
                  />
                  <span className="text-micro text-muted">Secs (default: 60)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10 text-xs">
                <div>
                  <label className="text-muted font-mono block mb-1">AI Title Hook Mode</label>
                  <select
                    value={hookMode}
                    onChange={(e) => setHookMode(e.target.value)}
                    className="w-full bg-paper border border-white/10 rounded-xl px-3 py-1.5 text-ink font-mono"
                  >
                    <option value="auto">Auto (Gemini AI title hooks)</option>
                    <option value="manual">Manual (Prompt preset)</option>
                    <option value="none">None (Standard pipeline)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-ink font-mono text-xs">
                    <input
                      type="checkbox"
                      checked={autoProcess}
                      onChange={(e) => setAutoProcess(e.target.checked)}
                      className="rounded border-white/20 accent-brass w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Auto-approve cuts into pipeline</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-ink font-mono text-xs">
                    <input
                      type="checkbox"
                      checked={waitForLive}
                      onChange={(e) => setWaitForLive(e.target.checked)}
                      className="rounded border-white/20 accent-brass w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Wait for live (queue before start)</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 6. Permission Checkbox */}
        <div className="border-t border-white/10 pt-3">
          <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 transition-colors">
            <input
              type="checkbox"
              checked={permissionAck}
              onChange={(e) => setPermissionAck(e.target.checked)}
              className="mt-0.5 rounded border-white/20 accent-brass w-4 h-4 cursor-pointer"
            />
            <div className="text-xs text-ink/85 leading-snug">
              <span className="font-semibold text-brass">Attribution Agreement: </span>
              I confirm I own or have permission to clip this live stream, and will credit the creator on published shorts.
            </div>
          </label>
        </div>

        {/* 7. Action Button (Apple Tactile Fluid Glow) */}
        <div>
          <button
            type="submit"
            disabled={!permissionAck || !isChannelValid || starting}
            className={`w-full py-3.5 px-6 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-md cursor-pointer active:scale-[0.99] ${
              !permissionAck || !isChannelValid || starting
                ? 'bg-white/[0.05] text-muted border border-white/10 cursor-not-allowed opacity-50'
                : 'bg-brass text-brassink hover:brightness-105 shadow-[0_4px_20px_rgba(230,175,46,0.25)]'
            }`}
          >
            {starting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Connecting to Stream...
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                Start Live Clipper Session
              </>
            )}
          </button>
        </div>
      </form>

      {/* POP-UP MODAL: Stream Guide & Technical Specifications */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade">
          <div
            className="relative max-w-2xl w-full max-h-[85vh] flex flex-col bg-paper2/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.7)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <BookOpen size={18} className="text-brass" />
                <div>
                  <h3 className="text-base font-semibold text-ink">Live Clipper Studio Guide</h3>
                  <p className="text-micro font-mono text-muted">Multi-signal detection, buffer strategy, & sensitivities</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-full text-muted hover:text-ink hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close Guide"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body - Scrollable Cards */}
            <div className="overflow-y-auto p-6 space-y-4 text-xs leading-relaxed text-ink/80">
              {/* Card 1: Multi-Signal Intelligence */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-ink text-sm">
                  <Sparkles size={16} className="text-brass" />
                  <span>Multi-Signal Detection Engine</span>
                </div>
                <p className="text-muted">
                  Shortly does not just monitor chat velocity—it listens to the audio and reads platform retention graphs simultaneously to guarantee no epic moment is missed:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-1">
                    <span className="font-semibold text-ok flex items-center gap-1"><Zap size={12} /> Chat Velocity</span>
                    <p className="text-[11px] text-muted">Detects sudden message spikes against a moving 60s baseline window.</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-1">
                    <span className="font-semibold text-brass flex items-center gap-1"><Volume2 size={12} /> Audio Screams</span>
                    <p className="text-[11px] text-muted">16 kHz RMS volume analyzer catches loud screams, laughs, and +6dB hype peaks.</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-1">
                    <span className="font-semibold text-red-400 flex items-center gap-1"><Flame size={12} /> YouTube Heatmaps</span>
                    <p className="text-[11px] text-muted">Pulls "Most Replayed" viewer retention graphs from YouTube directly.</p>
                  </div>
                </div>
              </div>

              {/* Card 2: Sensitivity Guide */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-ink text-sm">
                  <Scale size={16} className="text-brass" />
                  <span>Sensitivity Presets: Which one to choose?</span>
                </div>
                <div className="space-y-2 pt-1 font-mono text-[11.5px]">
                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 flex items-start gap-2.5">
                    <Coffee size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-ink font-semibold">Quiet Chat (1.4× • 3+ msgs): </span>
                      <span className="text-muted">For small streams or slow chats (1–25 viewers). Ensures even minor chuckles are captured.</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 flex items-start gap-2.5">
                    <Flame size={14} className="text-coral shrink-0 mt-0.5" />
                    <div>
                      <span className="text-ink font-semibold">Aggressive (1.8× • 6+ msgs): </span>
                      <span className="text-muted">High clip volume. Perfect for comedy, IRL banter, or streams where you want lots of candidate clips.</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 flex items-start gap-2.5">
                    <Scale size={14} className="text-brass shrink-0 mt-0.5" />
                    <div>
                      <span className="text-ink font-semibold">Balanced (2.6× • 12+ msgs) [Default]: </span>
                      <span className="text-muted">Ideal for standard active streams. Strong highlights with virtually zero false alarm clutter.</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 flex items-start gap-2.5">
                    <Zap size={14} className="text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-ink font-semibold">Hype / Raids (4.0× • 25+ msgs): </span>
                      <span className="text-muted">Only triggers on viral raids, dramatic tournament clutches, and massive chat floods.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Storage Strategies */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-ink text-sm">
                  <HardDrive size={16} className="text-brass" />
                  <span>Buffer Memory vs Full Recording</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted">
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-1">
                    <span className="font-semibold text-ink">Rolling Ring Buffer (~240 MB)</span>
                    <p>Keeps the last 8–30 minutes of stream video in a cyclic ring buffer. Older segments are pruned automatically so your local SSD never fills up.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-1">
                    <span className="font-semibold text-ink">Full Recording (~1.8 GB / hr)</span>
                    <p>Saves the entire live broadcast to your drive from start to finish. Best if you want to keep the whole VOD for manual editing later.</p>
                  </div>
                </div>
              </div>

              {/* Card 4: Shortly Pipeline */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-ink text-sm">
                  <Layers size={16} className="text-brass" />
                  <span>Auto AI Shorts Pipeline</span>
                </div>
                <p className="text-muted">
                  Once a highlight moment is confirmed, Shortly cuts the video with a 25s lead-in, reframes it to 9:16 vertical using face & action tracking, animates word-level subtitles, and overlays a Gemini AI title hook ready for TikTok, Shorts, and Reels.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-3.5 border-t border-white/10 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 rounded-xl bg-brass text-brassink font-semibold text-xs hover:brightness-105 active:scale-95 transition-all cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
