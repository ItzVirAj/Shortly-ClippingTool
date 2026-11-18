import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  HardDrive,
  Loader2,
  Radio,
  Scissors,
  Trash2,
  X,
} from 'lucide-react';
import { apiJson } from '../../lib/api';

const QUICK_PRESETS = [
  { label: 'Last 30s', beforeVal: 30, beforeUnit: 'sec', afterVal: 0, afterUnit: 'sec' },
  { label: '25s · 10s', beforeVal: 25, beforeUnit: 'sec', afterVal: 10, afterUnit: 'sec' },
  { label: '1m · 15s', beforeVal: 1, beforeUnit: 'min', afterVal: 15, afterUnit: 'sec' },
  { label: '2m · 30s', beforeVal: 2, beforeUnit: 'min', afterVal: 30, afterUnit: 'sec' },
];

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  if (rem === 0) return `${m}m`;
  return `${m}m ${rem}s`;
}

function formatClock(sec) {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function UnitSegment({ value, onChange, label }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid grid-cols-2 p-0.5 rounded-xl bg-black/45 border border-white/[0.10] w-[104px] shrink-0"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-[9px] bg-white/[0.14] border border-white/[0.16] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${value === 'min' ? 100 : 0}%)` }}
      />
      {[
        ['sec', 'sec'],
        ['min', 'min'],
      ].map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`relative z-10 py-1.5 text-xs font-medium rounded-[9px] transition-colors ${
            value === id ? 'text-white' : 'text-white/55 hover:text-white/85'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export default function ManualCutPanel({
  session,
  manualCuts = [],
  onCutScheduled,
  onGoToSession,
  onGoToClips,
}) {
  const [beforeVal, setBeforeVal] = useState('30');
  const [beforeUnit, setBeforeUnit] = useState('sec');
  const [afterVal, setAfterVal] = useState('10');
  const [afterUnit, setAfterUnit] = useState('sec');
  const [pruneBufferBefore, setPruneBufferBefore] = useState(false);
  const [pruningNow, setPruningNow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!session?.started_at) {
      setElapsedSec(0);
      return undefined;
    }
    const startMs = new Date(session.started_at).getTime();
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session?.started_at]);

  const beforeSec = useMemo(() => {
    const n = parseFloat(beforeVal);
    if (!Number.isFinite(n) || n < 0) return 0;
    return beforeUnit === 'min' ? n * 60 : n;
  }, [beforeVal, beforeUnit]);

  const afterSec = useMemo(() => {
    const n = parseFloat(afterVal);
    if (!Number.isFinite(n) || n < 0) return 0;
    return afterUnit === 'min' ? n * 60 : n;
  }, [afterVal, afterUnit]);

  const totalSec = beforeSec + afterSec;
  const isRecording = Boolean(session && ['recording', 'connecting'].includes(session.state));
  const bufferLimitSec =
    session?.config?.recording_mode === 'rolling'
      ? (session.config.buffer_minutes || 8) * 60
      : null;
  const exceedsBuffer = bufferLimitSec !== null && beforeSec > bufferLimitSec;
  const invalidRange = totalSec < 2 || totalSec > 600;
  const beforePct = totalSec > 0 ? Math.round((beforeSec / totalSec) * 100) : 50;

  const applyPreset = (p) => {
    setBeforeVal(String(p.beforeVal));
    setBeforeUnit(p.beforeUnit);
    setAfterVal(String(p.afterVal));
    setAfterUnit(p.afterUnit);
    setError('');
  };

  const handleCut = async (e) => {
    e?.preventDefault?.();
    if (!session || !isRecording || invalidRange || submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const res = await apiJson(`/api/liveclipper/sessions/${session.id}/manual-cut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          before_sec: Math.round(beforeSec * 100) / 100,
          after_sec: Math.round(afterSec * 100) / 100,
          send_to_skipper: false,
          prune_buffer_before: pruneBufferBefore,
        }),
      });
      if (res?.cut && onCutScheduled) {
        onCutScheduled(res.cut);
      }
      setNotice(
        afterSec > 0
          ? `Moment marked at ${formatClock(res?.cut?.anchor_t ?? elapsedSec)} — capturing ${formatDuration(beforeSec)} before and waiting ${formatDuration(afterSec)} after.`
          : `Cutting ${formatDuration(beforeSec)} before ${formatClock(res?.cut?.anchor_t ?? elapsedSec)} now…`,
      );
    } catch (err) {
      setError(err?.detail || err?.message || 'Could not start manual clip cut.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePruneNow = async (keepLastSec) => {
    if (!session || pruningNow) return;
    setPruningNow(true);
    setError('');
    setNotice('');
    try {
      const res = await apiJson(`/api/liveclipper/sessions/${session.id}/buffer/prune`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_last_sec: Math.max(0, Math.round(keepLastSec * 100) / 100) }),
      });
      if (res?.deleted_segments > 0) {
        setNotice(
          `Deleted ${res.deleted_segments} old buffer segment${res.deleted_segments === 1 ? '' : 's'} · freed ${res.freed_mb} MB (${res.remaining_segments} kept).`,
        );
      } else {
        setNotice('No older buffer segments found before that point.');
      }
    } catch (err) {
      setError(err?.detail || err?.message || 'Could not prune old buffer.');
    } finally {
      setPruningNow(false);
    }
  };

  if (!session || !['waiting_for_live', 'connecting', 'recording', 'stopping'].includes(session.state)) {
    return (
      <section className="max-w-2xl mx-auto rounded-[20px] border border-white/[0.10] bg-paper2/75 backdrop-blur-2xl p-6 sm:p-8 text-center space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_-16px_rgba(0,0,0,0.55)]">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-[#ff66b2]">
          <Scissors size={22} />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-white">Manual Live Clip Cut</h2>
          <p className="text-sm text-white/60 max-w-md mx-auto leading-relaxed">
            Start a live recording session first to mark moments on demand with custom seconds or minutes before and after the current point.
          </p>
        </div>
        {onGoToSession && (
          <button
            type="button"
            onClick={onGoToSession}
            className="btn-brand-accent inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium"
          >
            <Radio size={15} />
            <span>Go to Session</span>
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="relative overflow-hidden rounded-[20px] border border-white/[0.10] bg-paper2/80 backdrop-blur-2xl p-5 sm:p-6 space-y-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_-16px_rgba(0,0,0,0.55)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e31084]/60 to-transparent"
        />

        {/* Header with active stream & live clock */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-[13px] bg-[#e31084]/15 border border-[#e31084]/35 text-[#ff66b2] flex items-center justify-center shrink-0">
              <Scissors size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-white">
                Cut Clip from Right Now
              </h2>
              <p className="text-xs text-white/60 truncate">
                {session.config?.channel} · {session.config?.platform}
                {bufferLimitSec ? ` · ${session.config.buffer_minutes}m rolling buffer` : ' · full recording'}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/35 border border-white/[0.10] font-mono text-xs text-white tabular-nums">
            <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <Clock size={12} className="text-white/60" />
            <span>{formatClock(elapsedSec)}</span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/55">
            Quick Window Presets
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PRESETS.map((preset) => {
              const pBefore = preset.beforeUnit === 'min' ? preset.beforeVal * 60 : preset.beforeVal;
              const pAfter = preset.afterUnit === 'min' ? preset.afterVal * 60 : preset.afterVal;
              const active = Math.abs(beforeSec - pBefore) < 0.01 && Math.abs(afterSec - pAfter) < 0.01;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-[0.97] ${
                    active
                      ? 'bg-white/[0.14] border-[#e31084]/60 text-white shadow-xs'
                      : 'bg-white/[0.04] border-white/[0.09] text-white/70 hover:text-white hover:bg-white/[0.09]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Before & After Inputs */}
        <form onSubmit={handleCut} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3.5">
            {/* Before this moment */}
            <div className="rounded-2xl bg-black/25 border border-white/[0.08] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="manual-cut-before" className="text-xs font-semibold text-white">
                  Before this moment
                </label>
                <span className="text-[11px] font-mono text-white/55 tabular-nums">
                  −{formatDuration(beforeSec)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="manual-cut-before"
                  type="number"
                  min="0"
                  max={beforeUnit === 'min' ? 10 : 600}
                  step={beforeUnit === 'min' ? '0.5' : '5'}
                  value={beforeVal}
                  onChange={(e) => setBeforeVal(e.target.value)}
                  className="input-field flex-1 text-sm font-mono tabular-nums py-2 px-3"
                />
                <UnitSegment
                  value={beforeUnit}
                  onChange={setBeforeUnit}
                  label="Before duration unit"
                />
              </div>
              <p className="text-[11px] text-white/50">
                Footage pulled backward from the exact second you click Cut.
              </p>
            </div>

            {/* After this moment */}
            <div className="rounded-2xl bg-black/25 border border-white/[0.08] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="manual-cut-after" className="text-xs font-semibold text-white">
                  After this moment
                </label>
                <span className="text-[11px] font-mono text-white/55 tabular-nums">
                  +{formatDuration(afterSec)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="manual-cut-after"
                  type="number"
                  min="0"
                  max={afterUnit === 'min' ? 10 : 600}
                  step={afterUnit === 'min' ? '0.5' : '5'}
                  value={afterVal}
                  onChange={(e) => setAfterVal(e.target.value)}
                  className="input-field flex-1 text-sm font-mono tabular-nums py-2 px-3"
                />
                <UnitSegment
                  value={afterUnit}
                  onChange={setAfterUnit}
                  label="After duration unit"
                />
              </div>
              <p className="text-[11px] text-white/50">
                Set to 0 for an instant cut, or add seconds/mins to keep capturing the reaction.
              </p>
            </div>
          </div>

          {/* Visual Window Summary Bar */}
          <div className="rounded-2xl bg-black/30 border border-white/[0.07] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-white/70 tabular-nums">
                −{formatDuration(beforeSec)} ← <strong className="text-[#ff66b2]">NOW</strong> → +{formatDuration(afterSec)}
              </span>
              <span className="font-mono text-white font-semibold tabular-nums">
                Total: {formatDuration(totalSec)}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-white/[0.08] overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-[#e31084]/70 to-[#e31084] transition-all duration-200"
                style={{ width: `${beforePct}%` }}
              />
              <div className="w-[2px] h-full bg-white shrink-0" />
              <div
                className="h-full bg-gradient-to-r from-purple-400/80 to-purple-400/40 transition-all duration-200"
                style={{ width: `${100 - beforePct}%` }}
              />
            </div>
            {exceedsBuffer && (
              <p className="text-[11.5px] text-amber-300 flex items-center gap-1.5">
                <AlertCircle size={13} className="shrink-0" />
                Rolling buffer holds up to {session.config.buffer_minutes}m — older footage will clamp to the start of the buffer.
              </p>
            )}
            {invalidRange && (
              <p className="text-[11.5px] text-rose-300 flex items-center gap-1.5">
                <AlertCircle size={13} className="shrink-0" />
                Total clip duration must be between 2 seconds and 10 minutes.
              </p>
            )}
          </div>

          {/* Manual Buffer Option + Primary Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pruneBufferBefore}
                onChange={(e) => setPruneBufferBefore(e.target.checked)}
              />
              <span className="inline-flex items-center gap-1.5">
                <Trash2 size={13} className="text-rose-400" />
                Delete old buffer before this clip (−{formatDuration(beforeSec)}) after cutting
              </span>
            </label>

            <button
              type="submit"
              disabled={!isRecording || invalidRange || submitting}
              className="btn-brand-accent inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold active:scale-[0.97] shrink-0"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}
              <span>
                {!isRecording
                  ? 'Waiting for recording…'
                  : afterSec > 0
                    ? `Mark Moment (−${formatDuration(beforeSec)} / +${formatDuration(afterSec)})`
                    : `Cut Last ${formatDuration(beforeSec)} Now`}
              </span>
            </button>
          </div>
        </form>

        {/* Standalone Old Buffer Cleanup Controls */}
        <div className="pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-white/65 min-w-0">
            <HardDrive size={14} className="text-white/50 shrink-0" />
            <span>
              Free disk space by deleting buffer older than a cutoff point
              {session?.stats?.disk_used_mb != null ? ` (${session.stats.disk_used_mb} MB used)` : ''}.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {beforeSec > 0 && (
              <button
                type="button"
                disabled={pruningNow}
                onClick={() => handlePruneNow(beforeSec)}
                className="btn-ghost px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
                title={`Delete buffer segments older than ${formatDuration(beforeSec)} ago`}
              >
                {pruningNow ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} className="text-rose-400" />}
                <span>Delete older than −{formatDuration(beforeSec)}</span>
              </button>
            )}
            <button
              type="button"
              disabled={pruningNow}
              onClick={() => handlePruneNow(0)}
              className="btn-danger px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
              title="Delete all completed buffer segments older than right now"
            >
              {pruningNow ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              <span>Clear buffer before NOW</span>
            </button>
          </div>
        </div>

        {/* Inline Feedback Banners */}
        {notice && (
          <div className="flex items-start justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-200 text-xs">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-400" />
              <span>{notice}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss notice"
              onClick={() => setNotice('')}
              className="text-emerald-300/70 hover:text-emerald-100"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-rose-500/12 border border-rose-500/25 text-rose-200 text-xs"
          >
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError('')}
              className="text-rose-300/70 hover:text-rose-100"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Active & Recent Manual Cuts */}
      {manualCuts.length > 0 && (
        <div className="rounded-[20px] border border-white/[0.10] bg-paper2/70 backdrop-blur-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.06em] font-mono text-white/80">
              Manual Cuts ({manualCuts.length})
            </h3>
            {onGoToClips && (
              <button
                type="button"
                onClick={onGoToClips}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.12] text-xs font-medium text-white/90"
              >
                <span>Open Clips</span>
                <ChevronRight size={13} />
              </button>
            )}
          </div>

          <div className="divide-y divide-white/[0.06] rounded-2xl bg-black/25 border border-white/[0.06] overflow-hidden">
            {manualCuts.map((cut) => (
              <div key={cut.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-white tabular-nums">
                    <span className="font-semibold">@{formatClock(cut.anchor_t)}</span>
                    <span className="text-white/55">
                      −{formatDuration(cut.before_sec)} / +{formatDuration(cut.after_sec)}
                    </span>
                    <span className="text-white/40">({formatDuration(cut.duration)})</span>
                  </div>
                  {cut.error && (
                    <p className="text-[11px] text-rose-300 mt-0.5 truncate">{cut.error}</p>
                  )}
                </div>

                {cut.status === 'waiting' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/12 border border-amber-500/25 text-amber-200 font-mono text-[11px] tabular-nums shrink-0">
                    <Loader2 size={11} className="animate-spin" />
                    Capturing +{Math.ceil(cut.remaining_sec || 0)}s
                  </span>
                )}
                {cut.status === 'cutting' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#e31084]/15 border border-[#e31084]/35 text-pink-200 font-mono text-[11px] shrink-0">
                    <Loader2 size={11} className="animate-spin" />
                    Cutting…
                  </span>
                )}
                {cut.status === 'done' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-emerald-300 text-[11px] font-medium shrink-0">
                    <CheckCircle2 size={11} />
                    {cut.skipper ? 'Sent to Skipper' : 'Saved to Clips'}
                    {cut.pruned_segments > 0 ? ` · Freed ${cut.freed_mb} MB` : ''}
                  </span>
                )}
                {cut.status === 'failed' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/12 border border-rose-500/25 text-rose-300 text-[11px] font-medium shrink-0">
                    <AlertCircle size={11} />
                    Failed
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
