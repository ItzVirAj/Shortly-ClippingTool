import React, { useState, useEffect, useMemo } from 'react';
import { 
  Zap, 
  Sliders, 
  Flame, 
  Scale, 
  ShieldAlert, 
  Check, 
  Loader2, 
  RotateCcw,
  Sparkles,
  Layers,
  AlertCircle,
  Coffee,
  CheckCircle2
} from 'lucide-react';
import InfoBead from './InfoBead';
import { apiJson } from '../../lib/api';

export const SENSITIVITY_PRESETS = {
  quiet: {
    key: 'quiet',
    label: 'Quiet Chat',
    ratio_threshold: 1.8,
    min_count: 3,
    cooldown_sec: 45,
    icon: Coffee,
    color: 'teal',
    tagline: '1.8× surge • 3 msgs min',
    summary: 'Tailored for slow or quiet chats (<30 msgs/min). Triggers on gentle reactions with at least 3 messages.',
    lowResult: 'Sensitive to quiet stream banter and small chuckles.',
    highResult: 'Ensures highlights are caught even with few active chatters.',
    example: 'Chat jumps from 1 to 3 msgs in 10s → CLIP CUTS! ✂️',
    minVelocity: 0,
    maxVelocity: 30,
  },
  sensitive: {
    key: 'sensitive',
    label: 'Aggressive',
    ratio_threshold: 2.0,
    min_count: 4,
    cooldown_sec: 45,
    icon: Flame,
    color: 'coral',
    tagline: '2.0× surge • 4 msgs min',
    summary: 'High clip volume. Catches modest laughter bursts, punchlines & frequent reactions.',
    lowResult: 'High clip volume. Sensitive to modest chat laughter and reactions (e.g. 125 → 180 msgs/min).',
    highResult: 'Never misses a reaction, captures frequent highlights.',
    example: 'Chat jumps from 2 to 4 msgs in 10s → CLIP CUTS! ✂️',
    minVelocity: 30,
    maxVelocity: 80,
  },
  balanced: {
    key: 'balanced',
    label: 'Balanced (Default)',
    ratio_threshold: 2.5,
    min_count: 5,
    cooldown_sec: 60,
    icon: Scale,
    color: 'brass',
    tagline: '2.5× surge • 5 msgs min (Default)',
    summary: '10s buckets · 2.5× median of last 3 min · at least 5 msgs min. Perfect baseline formula.',
    lowResult: 'Balanced volume with minimal false alarms.',
    highResult: 'Requires a genuine chat surge 2.5× above the 3-minute median.',
    example: 'Chat surges 2.5× above 3-min median (≥5 msgs in 10s) → CLIP CUTS! ✂️',
    minVelocity: 80,
    maxVelocity: 300,
  },
  strict: {
    key: 'strict',
    label: 'Hype / Raids',
    ratio_threshold: 3.5,
    min_count: 10,
    cooldown_sec: 90,
    icon: ShieldAlert,
    color: 'ink',
    tagline: '3.5× surge • 10 msgs min',
    summary: 'Only triggers on massive viral floods, raids, and screaming hype.',
    lowResult: 'Zero clutter. Only the top 1% hype moments get clipped.',
    highResult: 'Requires a massive wall of text or raid to trigger.',
    example: 'Chat jumps 3.5× above baseline to 10+ msgs in 10s → CLIP CUTS! ✂️',
    minVelocity: 300,
    maxVelocity: 999999,
  },
};

/**
 * Compute the recommended sensitivity filter based on measured messages/min.
 */
export function getRecommendedFilter(msgsPerMin) {
  const m = Number(msgsPerMin) || 0;
  if (m <= 0 || m < 30) {
    return {
      presetKey: 'quiet',
      preset: SENSITIVITY_PRESETS.quiet,
      label: 'Quiet Chat',
      paceLabel: m > 0 ? `~${m} msgs/min (quiet stream)` : 'quiet pace',
      reason: m > 0 
        ? `With ~${m} msgs/min, standard filters will skip clips. A 1.8× surge with 3 msgs min reliably catches every highlight on low-activity streams.` 
        : 'Ideal for slow or quiet streams so subtle jokes and reactions are clipped with only 3 messages.',
    };
  } else if (m < 80) {
    return {
      presetKey: 'sensitive',
      preset: SENSITIVITY_PRESETS.sensitive,
      label: 'Aggressive',
      paceLabel: `~${m} msgs/min (moderate stream)`,
      reason: `With ~${m} msgs/min, 2.0× surge with 4 msgs min is the sweet spot to capture punchlines without clutter.`,
    };
  } else if (m < 300) {
    return {
      presetKey: 'balanced',
      preset: SENSITIVITY_PRESETS.balanced,
      label: 'Balanced (Default)',
      paceLabel: `~${m} msgs/min (active stream)`,
      reason: `Standard formula: 10s buckets, 2.5× median of last 3 min, at least 5 msgs min.`,
    };
  } else {
    return {
      presetKey: 'strict',
      preset: SENSITIVITY_PRESETS.strict,
      label: 'Hype / Raids',
      paceLabel: `~${m} msgs/min (fast stream)`,
      reason: `With high velocity (~${m} msgs/min), 3.5× surge ensures only massive viral spikes and raid moments cut clips.`,
    };
  }
}

/**
 * SpikeFilterControl
 *
 * User-friendly manual sensitivity filter controls with presets,
 * manual sliders, info beads, explicit "Set / Apply Filters" button,
 * smart AI recommendation engine based on live msgs/min, and
 * expanded support for quiet / low chat rate streams.
 */
export default function SpikeFilterControl({
  ratioThreshold = 2.5,
  minCount = 5,
  cooldownSec = 60,
  onChange,
  sessionId = null, // If provided, enables live real-time API syncing!
  currentMsgsPerMin = 0,
  compact = false,
  className = '',
}) {
  // Pending slider / preset values
  const [ratio, setRatio] = useState(ratioThreshold);
  const [count, setCount] = useState(minCount);
  const [cooldown, setCooldown] = useState(cooldownSec);
  const [activePreset, setActivePreset] = useState('balanced');
  const [showManual, setShowManual] = useState(false);

  // Confirmed applied values
  const [appliedRatio, setAppliedRatio] = useState(ratioThreshold);
  const [appliedCount, setAppliedCount] = useState(minCount);
  const [appliedCooldown, setAppliedCooldown] = useState(cooldownSec);

  const [syncing, setSyncing] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState('');

  // Active AI recommendation based on measured velocity
  const recommendation = useMemo(() => {
    return getRecommendedFilter(currentMsgsPerMin);
  }, [currentMsgsPerMin]);

  // Keep local state in sync when parent props change from external updates
  useEffect(() => {
    setAppliedRatio(ratioThreshold);
    setAppliedCount(minCount);
    setAppliedCooldown(cooldownSec);

    setRatio(ratioThreshold);
    setCount(minCount);
    setCooldown(cooldownSec);

    // Detect matching preset
    if (ratioThreshold <= 1.8 && minCount <= 3) {
      setActivePreset('quiet');
    } else if (ratioThreshold <= 2.2 && minCount <= 4) {
      setActivePreset('sensitive');
    } else if (ratioThreshold <= 2.8 && minCount <= 7) {
      setActivePreset('balanced');
    } else if (ratioThreshold >= 3.2 && minCount >= 8) {
      setActivePreset('strict');
    } else {
      setActivePreset('custom');
    }
  }, [ratioThreshold, minCount, cooldownSec]);

  // Is dirty: current inputs differ from applied values
  const isDirty = useMemo(() => {
    return (
      Math.abs(ratio - appliedRatio) > 0.01 ||
      count !== appliedCount ||
      cooldown !== appliedCooldown
    );
  }, [ratio, count, cooldown, appliedRatio, appliedCount, appliedCooldown]);

  const handleSelectPreset = (key) => {
    const p = SENSITIVITY_PRESETS[key];
    if (!p) return;
    setRatio(p.ratio_threshold);
    setCount(p.min_count);
    setCooldown(p.cooldown_sec);
    setActivePreset(key);

    if (!sessionId && onChange) {
      onChange({
        ratio_threshold: p.ratio_threshold,
        min_count: p.min_count,
        cooldown_sec: p.cooldown_sec,
        preset: key,
      });
    }
  };

  const handleApply = async (overrideRatio = null, overrideCount = null, overrideCooldown = null, overridePreset = null) => {
    const r = overrideRatio !== null ? overrideRatio : ratio;
    const c = overrideCount !== null ? overrideCount : count;
    const cd = overrideCooldown !== null ? overrideCooldown : cooldown;
    const pr = overridePreset !== null ? overridePreset : activePreset;

    setSyncing(true);
    setSavedFeedback('');
    try {
      if (sessionId) {
        await apiJson(`/api/liveclipper/sessions/${sessionId}/detector`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ratio_threshold: r,
            min_count: c,
            cooldown_sec: cd,
          }),
        });
      }

      setRatio(r);
      setCount(c);
      setCooldown(cd);
      if (overridePreset) setActivePreset(overridePreset);

      setAppliedRatio(r);
      setAppliedCount(c);
      setAppliedCooldown(cd);

      if (onChange) {
        onChange({
          ratio_threshold: r,
          min_count: c,
          cooldown_sec: cd,
          preset: pr,
        });
      }

      setSavedFeedback(`✓ Filter Applied: ${r.toFixed(1)}× surge • ${c} msgs min`);
      setTimeout(() => setSavedFeedback(''), 3500);
    } catch (err) {
      console.error('Failed to apply detector filters:', err);
      alert(err.detail || 'Failed to apply filter settings to server.');
    } finally {
      setSyncing(false);
    }
  };

  const handleApplyRecommendation = () => {
    const p = recommendation.preset;
    handleApply(p.ratio_threshold, p.min_count, p.cooldown_sec, recommendation.presetKey);
  };

  const handleReset = () => {
    setRatio(appliedRatio);
    setCount(appliedCount);
    setCooldown(appliedCooldown);
  };

  // Dynamic calculation based on current pace (10s buckets)
  const pace = currentMsgsPerMin > 0 ? currentMsgsPerMin : 5;
  const normal10sMsgs = Math.max(1, Math.round(pace / 6));
  const triggerMsgsIn10s = Math.max(count, Math.round(normal10sMsgs * ratio));
  const isRecommendedActive = appliedRatio === recommendation.preset.ratio_threshold && appliedCount === recommendation.preset.min_count;

  return (
    <div className={`space-y-3 font-sans ${className}`}>
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rule pb-2.5">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-brass shrink-0" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink">
            Spike Detection Filter
          </span>
          <InfoBead
            title="Spike Detection Filter"
            desc="Counts messages in 10s buckets; a spike triggers when rate is 2.5× the median of the last 3 minutes and meets the minimum message count."
            lowResult="More clips cut. Catches small chuckles, giggles, and quiet streamer moments (ideal for quiet streams)."
            highResult="Fewer clips cut. Catches only massive hype moments, clutch plays, or viral floods."
            example="With a baseline of 2 msgs per 10s, setting 2.5× with 5 msgs min cuts a clip whenever 5+ messages arrive in 10 seconds."
            recommendation="Balanced (2.5× surge, 5 msgs min in 10s buckets) is the standard recommended formula."
            align="left"
          />

          {/* Active status pill */}
          <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-paper3 border border-rule text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-ok" />
            <span>Active: <strong className="text-ink">{appliedRatio.toFixed(1)}×</strong> surge • <strong className="text-ink">{appliedCount}</strong> msgs min</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {savedFeedback && (
            <span className="text-[11px] font-mono text-ok animate-fade flex items-center gap-1 font-semibold">
              <Check size={12} /> {savedFeedback}
            </span>
          )}

          {isDirty && !syncing && (
            <button
              type="button"
              onClick={handleReset}
              className="text-micro font-mono text-muted hover:text-ink flex items-center gap-1 px-1.5 py-0.5 cursor-pointer"
              title="Revert sliders to currently applied settings"
            >
              <RotateCcw size={11} />
              <span>Revert</span>
            </button>
          )}

          {/* Explicit Apply & Set Filters Button */}
          <button
            type="button"
            onClick={() => handleApply()}
            disabled={syncing || !isDirty}
            className={`px-3 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
              isDirty
                ? 'bg-brass text-brassink hover:brightness-110 ring-2 ring-brass/40 animate-pulse'
                : 'bg-ok/10 border border-ok/30 text-ok cursor-default opacity-90'
            }`}
            title={isDirty ? 'Click to apply new filter settings to the live clipper' : 'Current settings are applied and active'}
          >
            {syncing ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Applying...</span>
              </>
            ) : isDirty ? (
              <>
                <Zap size={12} className="fill-brassink" />
                <span>Set Live Filters</span>
              </>
            ) : (
              <>
                <Check size={12} />
                <span>Filters Applied</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowManual((prev) => !prev)}
            className={`text-micro font-mono flex items-center gap-1 px-2 py-1 rounded border transition-colors cursor-pointer ${
              showManual || activePreset === 'custom'
                ? 'bg-brass/10 border-brass/40 text-brass'
                : 'bg-paper border-rule text-muted hover:text-ink'
            }`}
          >
            <Sliders size={11} />
            <span>{showManual ? 'Hide Sliders' : 'Manual Tuning'}</span>
          </button>
        </div>
      </div>

      {/* Smart Recommendation Banner Based on Live Messages/Min */}
      <div className={`p-2.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-mono ${
        isRecommendedActive 
          ? 'bg-ok/[0.06] border-ok/30' 
          : 'bg-brass/[0.08] border-brass/35 shadow-sm'
      }`}>
        <div className="flex items-start gap-2.5">
          <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
            isRecommendedActive ? 'bg-ok/20 text-ok' : 'bg-brass/20 text-brass'
          }`}>
            <Sparkles size={15} />
          </div>
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink font-bold uppercase tracking-wide text-micro">
                Recommended for your stream:
              </span>
              <span className={`px-2 py-0.5 rounded font-bold text-micro ${
                isRecommendedActive 
                  ? 'bg-ok text-paper' 
                  : 'bg-brass text-brassink'
              }`}>
                {recommendation.label} ({recommendation.preset.ratio_threshold}×)
              </span>
              <span className="text-[11px] text-muted font-normal">
                Pace: <strong className="text-ink">{recommendation.paceLabel}</strong>
              </span>
              {isRecommendedActive && (
                <span className="text-[10px] text-ok flex items-center gap-0.5 font-bold">
                  <CheckCircle2 size={11} /> Active Now
                </span>
              )}
            </div>
            <p className="text-[11px] font-sans text-ink/80 leading-snug">
              {recommendation.reason}
            </p>
          </div>
        </div>

        {!isRecommendedActive && (
          <button
            type="button"
            onClick={handleApplyRecommendation}
            disabled={syncing}
            className="shrink-0 px-3 py-1.5 rounded bg-brass text-brassink hover:brightness-110 font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer self-start sm:self-center"
            title="Instantly set filter parameters to the recommended values for this stream speed"
          >
            <Sparkles size={12} className="fill-brassink" />
            <span>Apply Recommendation</span>
          </button>
        )}
      </div>

      {/* Preset Buttons Grid (4 Tiers including Quiet / Low-Chat) */}
      <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
        {Object.entries(SENSITIVITY_PRESETS).map(([key, p]) => {
          const isSelected = activePreset === key;
          const isAppliedPreset = appliedRatio === p.ratio_threshold && appliedCount === p.min_count;
          const isRec = recommendation.presetKey === key;
          const Icon = p.icon;

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectPreset(key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectPreset(key);
                }
              }}
              className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
                isSelected
                  ? 'bg-brass/10 border-brass/50 text-ink shadow-sm ring-1 ring-brass/30'
                  : 'bg-paper/70 hover:bg-paper border-rule text-muted hover:text-ink hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-ink">
                  <Icon
                    size={14}
                    className={
                      isSelected
                        ? 'text-brass'
                        : key === 'quiet'
                        ? 'text-teal-400'
                        : key === 'sensitive'
                        ? 'text-coral'
                        : 'text-muted'
                    }
                  />
                  <span>{p.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-muted bg-white/5 px-1.5 py-0.5 rounded">
                    {p.ratio_threshold}×
                  </span>
                  {isAppliedPreset && !isDirty && (
                    <span className="text-[9px] font-mono text-ok bg-ok/10 border border-ok/30 px-1 py-0.2 rounded flex items-center gap-0.5">
                      <Check size={9} /> Active
                    </span>
                  )}
                  {isRec && !isAppliedPreset && (
                    <span className="text-[9px] font-mono text-brass bg-brass/15 border border-brass/30 px-1 py-0.2 rounded flex items-center gap-0.5">
                      ★ Rec
                    </span>
                  )}
                </div>
              </div>

              {!compact && (
                <p className="text-[11px] text-muted mt-1 leading-snug line-clamp-2">
                  {p.summary}
                </p>
              )}

              {/* Tagline / Subtext */}
              <div className="flex items-center justify-between text-[10px] font-mono text-muted/80 mt-1.5 pt-1.5 border-t border-white/[0.05]">
                <span>{p.tagline}</span>
                <InfoBead
                  title={`${p.label} Mode (${p.ratio_threshold}×)`}
                  desc={p.summary}
                  lowResult={p.lowResult}
                  highResult={p.highResult}
                  example={p.example}
                  align={key === 'strict' ? 'right' : 'center'}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual Sliders Drawer */}
      {showManual && (
        <div className="p-3.5 rounded-xl bg-paper/80 border border-rule space-y-3.5 animate-fade text-xs font-mono">
          <div className="flex items-center justify-between border-b border-rule pb-2">
            <span className="text-ink font-semibold flex items-center gap-1.5 text-micro">
              <Sliders size={12} className="text-brass" /> MANUAL FILTER TUNING (EXPANDED RANGES)
            </span>
            <span className="text-micro text-muted">
              {isDirty ? (
                <span className="text-warn flex items-center gap-1 font-semibold">
                  <AlertCircle size={11} /> Unapplied changes (Click 'Set Live Filters' above)
                </span>
              ) : (
                <span className="text-ok flex items-center gap-1">
                  <Check size={11} /> Active in live clipper
                </span>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Slider 1: Surge Multiplier */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-muted flex items-center gap-1">
                  <span>Surge Multiplier</span>
                  <InfoBead
                    title="Surge Multiplier (Ratio Threshold)"
                    desc="How many times higher chat rate must surge above the 3-minute median baseline in a 10s bucket to count as a spike."
                    lowResult="1.5× – 2.0×: Quiet streams / modest reactions. Easily catches 3–5 messages."
                    highResult="3.5× – 5.0×: Requires huge chat floods or raids to trigger."
                    example="At 2.5×: Baseline median of 2 msgs requires at least 5 messages in 10s to trigger a clip."
                    recommendation="Standard default is 2.5× over the last 3-minute median."
                    align="left"
                  />
                </label>
                <span className="text-brass font-bold text-xs">{ratio.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min="1.2"
                max="5.0"
                step="0.1"
                value={ratio}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setRatio(val);
                  setActivePreset('custom');
                  if (!sessionId && onChange) {
                    onChange({
                      ratio_threshold: val,
                      min_count: count,
                      cooldown_sec: cooldown,
                      preset: 'custom',
                    });
                  }
                }}
                className="w-full accent-brass cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted">
                <span>1.2×</span>
                <span>2.0×</span>
                <span>2.5× (Default)</span>
                <span>5.0× (Strict)</span>
              </div>
            </div>

            {/* Slider 2: Minimum Messages */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-muted flex items-center gap-1">
                  <span>Min Messages (--min)</span>
                  <InfoBead
                    title="Minimum Messages in Peak Window (--min)"
                    desc="Absolute minimum total chat messages required during the 10s surge window. Supports down to 2 messages for quiet streams."
                    lowResult="2 – 4 msgs: Perfect for low chat streamers with 1–15 viewers."
                    highResult="25 – 50 msgs: For large streamers with thousands of viewers."
                    example="At 5 msgs: A burst of 5 messages in 10 seconds (and ≥2.5× median) can trigger a clip."
                    align="center"
                  />
                </label>
                <span className="text-brass font-bold text-xs">{count} msgs</span>
              </div>
              <input
                type="range"
                min="2"
                max="50"
                step="1"
                value={count}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setCount(val);
                  setActivePreset('custom');
                  if (!sessionId && onChange) {
                    onChange({
                      ratio_threshold: ratio,
                      min_count: val,
                      cooldown_sec: cooldown,
                      preset: 'custom',
                    });
                  }
                }}
                className="w-full accent-brass cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted">
                <span>2 (Low Chat)</span>
                <span>6</span>
                <span>15</span>
                <span>50 (Huge)</span>
              </div>
            </div>

            {/* Slider 3: Cooldown */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-muted flex items-center gap-1">
                  <span>Clip Cooldown</span>
                  <InfoBead
                    title="Clip Cooldown Period"
                    desc="Minimum time the clipper must wait after cutting a clip before cutting another one. Prevents back-to-back duplicate clips of the exact same moment."
                    lowResult="20s – 45s: Cuts clips in rapid succession during fun stream sequences."
                    highResult="120s – 180s: Ensures each clip is a distinct separate highlight."
                    align="right"
                  />
                </label>
                <span className="text-brass font-bold text-xs">{cooldown}s</span>
              </div>
              <input
                type="range"
                min="20"
                max="180"
                step="5"
                value={cooldown}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setCooldown(val);
                  setActivePreset('custom');
                  if (!sessionId && onChange) {
                    onChange({
                      ratio_threshold: ratio,
                      min_count: count,
                      cooldown_sec: val,
                      preset: 'custom',
                    });
                  }
                }}
                className="w-full accent-brass cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted">
                <span>20s (Rapid)</span>
                <span>60s</span>
                <span>90s (Normal)</span>
                <span>180s (Spread)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic User-Friendly Example Callout Bead */}
      <div className="p-2.5 rounded-lg bg-brass/[0.07] border border-brass/20 text-[11px] text-ink/90 flex items-start gap-2 leading-relaxed font-mono">
        <Sparkles size={14} className="text-brass shrink-0 mt-0.5" />
        <div className="font-sans">
          <strong className="text-brass font-semibold font-mono">Real-Time Threshold:</strong>{' '}
          At your stream's pace (<span className="font-mono text-brass font-semibold">~{pace} msgs/min</span>), 
          a clip triggers when chat accelerates to{' '}
          <strong className="text-brass font-mono underline decoration-brass/40 underline-offset-2">
            {triggerMsgsIn10s} messages
          </strong>{' '}
          in 10 seconds (≥ 2.5× median of last 3 min, and at least <span className="font-mono font-semibold">{count}</span> total messages).
          {count <= 4 && (
            <span className="text-teal-400 font-mono ml-1 font-semibold">
              ✓ Low-Chat Mode Active (perfect for quiet streams).
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
