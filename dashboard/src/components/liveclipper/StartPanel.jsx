import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Coffee,
  Flame,
  HardDrive,
  Layers,
  Play,
  Scale,
  Sparkles,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { apiJson } from '../../lib/api';
import WebcamBoxPicker from '../WebcamBoxPicker';

// Sensitivity presets definition with Apple-style metadata
const PRESET_OPTIONS = [
  {
    key: 'quiet',
    label: 'Quiet Chat',
    ratio: 1.25,
    minCount: 3,
    cooldown: 30,
    description: 'Capture smaller bursts in quieter chats.',
  },
  {
    key: 'sensitive',
    label: 'Aggressive',
    ratio: 1.45,
    minCount: 5,
    cooldown: 45,
    description: 'Capture frequent reactions with a shorter cooldown.',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    ratio: 1.8,
    minCount: 8,
    cooldown: 60,
    description: 'Capture distinct bursts of chat activity with a one-minute cooldown.',
  },
  {
    key: 'strict',
    label: 'Hype / Raids',
    ratio: 2.5,
    minCount: 16,
    cooldown: 90,
    description: 'Wait for larger spikes and leave more time between clips.',
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

  // Multi-signal toggles
  const [audioPeaksEnabled, setAudioPeaksEnabled] = useState(true);
  const [audioPeakDb, setAudioPeakDb] = useState(14);
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);

  // Advanced accordion

  const [hookMode, setHookMode] = useState('auto');
  const [autoProcess, setAutoProcess] = useState(false);
  const [waitForLive, setWaitForLive] = useState(false);
  const [mirrorVideo, setMirrorVideo] = useState(false);
  const [webcamMode, setWebcamMode] = useState('auto');
  const [webcamBox, setWebcamBox] = useState(null);
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
      mirror_video: Boolean(mirrorVideo),
      webcam_mode: webcamMode,
      webcam_box: webcamMode === 'custom' ? webcamBox : null,
      audio_peaks_enabled: Boolean(audioPeaksEnabled),
      audio_peak_db: Number(audioPeakDb),
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
    <div className="lc-setup">
      <header className="lc-heading">
        <div>
          <h2>New session</h2>
          <p>Choose a stream to start capturing highlights.</p>
        </div>
        <button className="lc-icon" aria-label="Open clipping guide" onClick={() => setShowGuideModal(true)}>
          <BookOpen size={18} />
        </button>
      </header>
      <form className="lc-form" onSubmit={handleStart}>
        <div className="lc-source">
          <label>
            Platform
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="kick">Kick</option>
              <option value="twitch">Twitch</option>
              <option value="youtube">YouTube</option>
            </select>
          </label>
          <label>
            Channel or stream URL
            <input
              value={rawChannel}
              onChange={(e) => setRawChannel(e.target.value)}
              placeholder={platform === 'youtube' ? '@channel or video URL' : 'Channel name or stream URL'}
              aria-invalid={!!rawChannel && !isChannelValid}
            />
          </label>
        </div>
        {rawChannel && !isChannelValid && (
          <p className="lc-hint">Enter a valid {platform} channel or stream URL.</p>
        )}
        <fieldset>
          <legend>Highlight detection</legend>
          <div className="lc-segment">
            {PRESET_OPTIONS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={selectedPreset === p.key}
                onClick={() => handleSelectPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="lc-hint">
            {PRESET_OPTIONS.find((p) => p.key === selectedPreset)?.description ||
              'Using custom detection thresholds.'}
          </p>
        </fieldset>
        <details>
          <summary>Capture settings</summary>
          <div className="lc-options">
            <label>
              Recording
              <select value={recordingMode} onChange={(e) => setRecordingMode(e.target.value)}>
                <option value="rolling">Rolling buffer</option>
                <option value="full">Full recording</option>
              </select>
            </label>
            {recordingMode === 'rolling' && (
              <label>
                Buffer · {bufferMinutes} min
                <input
                  type="range"
                  min="3"
                  max="30"
                  value={bufferMinutes}
                  onChange={(e) => setBufferMinutes(+e.target.value)}
                />
              </label>
            )}
            <small>{diskEstimate}</small>
            <label>
              AI title hooks
              <select value={hookMode} onChange={(e) => setHookMode(e.target.value)}>
                <option value="auto">Automatic</option>
                <option value="manual">Prompt preset</option>
                <option value="none">Off</option>
              </select>
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <WebcamBoxPicker
                mode={webcamMode}
                box={webcamBox}
                onChange={({ webcam_mode: nextMode, webcam_box: nextBox }) => {
                  setWebcamMode(nextMode);
                  if (nextBox !== undefined) setWebcamBox(nextBox);
                }}
              />
            </div>
            {[
              ['Audio peaks', audioPeaksEnabled, setAudioPeaksEnabled],
              ...(platform === 'youtube'
                ? [['Most replayed moments', heatmapEnabled, setHeatmapEnabled]]
                : []),
              ['Auto-approve clips', autoProcess, setAutoProcess],
              ['Wait for stream to go live', waitForLive, setWaitForLive],
              ['Mirror video (flip before subtitles)', mirrorVideo, setMirrorVideo],
            ].map(([name, value, set]) => (
              <label className="lc-check" key={name}>
                <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
                {name}
              </label>
            ))}
            {audioPeaksEnabled && (
              <label>
                Loudness scream threshold (+{audioPeakDb} dB)
                <input
                  type="range"
                  min="8"
                  max="28"
                  step="1"
                  value={audioPeakDb}
                  onChange={(e) => setAudioPeakDb(Number(e.target.value))}
                />
              </label>
            )}
            {[
              ['ratio_threshold', 'Spike ratio', 1.2, 5, 0.05],
              ['min_count', 'Minimum messages', 2, 50, 1],
            ].map(([key, name, min, max, step]) => (
              <label key={key}>
                {name}
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={customFilter[key]}
                  onChange={(e) => {
                    setSelectedPreset('custom');
                    setCustomFilter({ ...customFilter, [key]: e.target.value });
                  }}
                />
              </label>
            ))}
            {[
              ['before_sec', 'Lead time (s)'],
              ['after_sec', 'Tail time (s)'],
              ['min_len', 'Minimum length (s)'],
              ['max_len', 'Maximum length (s)'],
            ].map(([key, name]) => (
              <label key={key}>
                {name}
                <input
                  type="number"
                  value={advConfig[key]}
                  onChange={(e) => setAdvConfig({ ...advConfig, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </details>
        <label className="lc-check">
          <input
            type="checkbox"
            checked={permissionAck}
            onChange={(e) => setPermissionAck(e.target.checked)}
          />
          I own or have permission to clip this stream and will credit the creator.
        </label>
        {errorMsg && <p role="alert">{errorMsg}</p>}
        <footer>
          <button className="lc-primary" disabled={!permissionAck || !isChannelValid || starting}>
            <Play size={15} />
            {starting ? 'Connecting…' : 'Start monitoring'}
          </button>
          <small>
            {healthLoading
              ? 'Checking recorder…'
              : health?.error
                ? 'Recorder unavailable'
                : health?.disk_free_gb != null
                  ? health.disk_free_gb + ' GB free'
                  : 'Recorder ready'}
          </small>
        </footer>
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
                <BookOpen size={18} className="text-[#f03b9f]" />
                <div>
                  <h3 className="text-base font-semibold text-white">Live Clipper Studio Guide</h3>
                  <p className="text-micro font-mono text-white/50">
                    Multi-signal detection, buffer strategy, &amp; sensitivities
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close Guide"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body - Scrollable Cards */}
            <div className="overflow-y-auto p-6 space-y-4 text-xs leading-relaxed text-white/80">
              {/* Card 1: Multi-Signal Intelligence */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-white text-sm">
                  <Sparkles size={16} className="text-[#f03b9f]" />
                  <span>Multi-Signal Detection Engine</span>
                </div>
                <p className="text-white/55">
                  Shortly does not just monitor chat velocity—it listens to the audio and reads platform
                  retention graphs simultaneously to guarantee no epic moment is missed:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/[0.08] space-y-1">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                      <Zap size={12} /> Chat Velocity
                    </span>
                    <p className="text-[11px] text-white/55">
                      Detects sudden message spikes against a moving 60s baseline window.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/[0.08] space-y-1">
                    <span className="font-semibold text-[#f03b9f] flex items-center gap-1">
                      <Volume2 size={12} /> Audio Screams
                    </span>
                    <p className="text-[11px] text-white/55">
                      16 kHz RMS volume analyzer catches loud screams, laughs, and hype peaks above normal speech.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/[0.08] space-y-1">
                    <span className="font-semibold text-rose-400 flex items-center gap-1">
                      <Flame size={12} /> YouTube Heatmaps
                    </span>
                    <p className="text-[11px] text-white/55">
                      Pulls &quot;Most Replayed&quot; viewer retention graphs from YouTube directly.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Sensitivity Guide */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-white text-sm">
                  <Scale size={16} className="text-[#f03b9f]" />
                  <span>Sensitivity Presets: Which one to choose?</span>
                </div>
                <div className="space-y-2 pt-1 font-mono text-[11.5px]">
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/[0.08] flex items-start gap-2.5">
                    <Coffee size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-white font-semibold">Quiet Chat (1.25× • 3+ msgs): </span>
                      <span className="text-white/55">
                        For small streams or slow chats (1–25 viewers). Ensures even minor bursts are captured.
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/[0.08] flex items-start gap-2.5">
                    <Flame size={14} className="text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-white font-semibold">Aggressive (1.45× • 5+ msgs): </span>
                      <span className="text-white/55">
                        High clip volume. Perfect for comedy, IRL banter, or streams where you want lots of candidate clips.
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/[0.08] flex items-start gap-2.5">
                    <Scale size={14} className="text-[#f03b9f] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-white font-semibold">Balanced (1.8× • 8+ msgs) [Default]: </span>
                      <span className="text-white/55">
                        Ideal for standard active streams. Strong highlights with low false alarm clutter.
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/30 border border-white/[0.08] flex items-start gap-2.5">
                    <Zap size={14} className="text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-white font-semibold">Hype / Raids (2.5× • 16+ msgs): </span>
                      <span className="text-white/55">
                        Only triggers on viral raids, dramatic tournament clutches, and massive chat floods.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Storage Strategies */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-white text-sm">
                  <HardDrive size={16} className="text-[#f03b9f]" />
                  <span>Buffer Memory vs Full Recording</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/55">
                  <div className="p-3 rounded-xl bg-black/30 border border-white/[0.08] space-y-1">
                    <span className="font-semibold text-white">Rolling Ring Buffer (~240 MB)</span>
                    <p>
                      Keeps the last 8–30 minutes of stream video in a cyclic ring buffer. Older segments are
                      pruned automatically so your local SSD never fills up.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/30 border border-white/[0.08] space-y-1">
                    <span className="font-semibold text-white">Full Recording (~1.8 GB / hr)</span>
                    <p>
                      Saves the entire live broadcast to your drive from start to finish. Best if you want to
                      keep the whole VOD for manual editing later.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 4: Shortly Pipeline */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-white text-sm">
                  <Layers size={16} className="text-[#f03b9f]" />
                  <span>Auto AI Shorts Pipeline</span>
                </div>
                <p className="text-white/55">
                  Once a highlight moment is confirmed, Shortly cuts the video with a 25s lead-in, reframes it
                  to 9:16 vertical using face &amp; webcam tracking, animates word-level subtitles, and overlays a
                  3–4 word AI title hook ready for TikTok, Shorts, and Reels.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-3.5 border-t border-white/10 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] text-white font-semibold text-xs shadow-[0_4px_18px_rgba(227,16,132,0.35)] border-t border-white/20 hover:brightness-110 active:scale-[0.97] transition-all cursor-pointer"
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
