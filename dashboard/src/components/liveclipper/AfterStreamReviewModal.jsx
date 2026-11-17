import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Sparkles, 
  Scissors, 
  Sliders, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Zap, 
  RotateCw,
  Tv,
  Flame,
  ArrowRight
} from 'lucide-react';
import { apiJson } from '../../lib/api';

export default function AfterStreamReviewModal({ session, onClose, onClipCut }) {
  const [loading, setLoading] = useState(true);
  const [reviewData, setReviewData] = useState(null);
  const [error, setError] = useState('');
  
  // Tunable parameters
  const [ratioThreshold, setRatioThreshold] = useState(3.0);
  const [minSpikeScore, setMinSpikeScore] = useState(2.0);
  const [binSec, setBinSec] = useState(5.0);

  // Custom Cut Form
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [cuttingId, setCuttingId] = useState(null);
  const [cutSuccess, setCutSuccess] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const fetchReview = async (overrideParams = {}) => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        ratio_threshold: Number(overrideParams.ratioThreshold ?? ratioThreshold),
        min_spike_score: Number(overrideParams.minSpikeScore ?? minSpikeScore),
        bin_sec: Number(overrideParams.binSec ?? binSec),
      };
      const res = await apiJson(`/api/liveclipper/sessions/${session.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setReviewData(res);
    } catch (err) {
      setError(err.detail || 'Failed to analyze session chat events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.id) {
      fetchReview();
    }
  }, [session?.id]);

  const handleCut = async (startSec, endSec, title = '', spike = null) => {
    setCuttingId(spike?.id || 'custom');
    setCutSuccess('');
    setError('');
    try {
      const payload = {
        start_sec: Number(startSec),
        end_sec: Number(endSec),
        title: title || undefined,
        spike: spike || undefined,
      };
      const res = await apiJson(`/api/liveclipper/sessions/${session.id}/cut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setCutSuccess(`Clip queued successfully! (${res.item?.duration?.toFixed(1)}s)`);
      if (onClipCut) {
        onClipCut(res.item);
      }
    } catch (err) {
      setError(err.detail || 'Failed to extract clip from recording.');
    } finally {
      setCuttingId(null);
    }
  };

  const formatSec = (sec) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const series = reviewData?.series || [];
  const spikes = reviewData?.spikes || [];
  const hasRecording = reviewData?.has_recording ?? false;
  const maxCount = Math.max(...series.map((p) => p.count), 1);

  const modalContent = (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xl animate-fade"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#121319]/90 border border-white/[0.12] border-t-white/[0.22] rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.7)] backdrop-blur-2xl overflow-hidden text-ink transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Apple-style Glass Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02] backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-brass shadow-inner">
              <Sparkles size={19} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-tight">
                  After-Stream Review: {session.config?.channel || 'Session'}
                </h2>
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.08] text-white/80 border border-white/10">
                  {session.config?.platform || 'kick'}
                </span>
              </div>
              <p className="text-xs text-white/50 tracking-tight">
                Re-analyze saved chat logs, fine-tune sensitivity thresholds, and extract standalone clips.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-white/10 bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/15 flex items-center justify-center transition-all cursor-pointer active:scale-95"
            title="Close modal (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center gap-2.5 backdrop-blur-md">
              <AlertCircle size={16} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {cutSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-mono flex items-center gap-2.5 backdrop-blur-md">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
              <span>{cutSuccess}</span>
            </div>
          )}

          {/* Recording status banner */}
          {!hasRecording && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2.5 backdrop-blur-md">
              <AlertCircle size={16} className="shrink-0 text-amber-400" />
              <span>
                <strong className="text-amber-100">Recording video unavailable:</strong> {reviewData?.message || 'Full stream video was not preserved for this session.'} Spikes can be analyzed, but video extraction requires kept stream recordings.
              </span>
            </div>
          )}

          {/* Tuner Controls Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2">
                <Sliders size={14} className="text-brass" /> Batch Detector Sensitivity
              </span>
              <button
                type="button"
                onClick={() => fetchReview()}
                disabled={loading}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 border border-white/15 shadow-xs disabled:opacity-50"
              >
                {loading ? <Loader2 size={13} className="animate-spin text-brass" /> : <RotateCw size={13} />}
                <span>{loading ? 'Re-analyzing...' : 'Re-Run Detection'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-white/70">
                  <span>Velocity Threshold:</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-white font-bold">{ratioThreshold}x</span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="6.0"
                  step="0.1"
                  value={ratioThreshold}
                  onChange={(e) => setRatioThreshold(Number(e.target.value))}
                  className="w-full accent-brass cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-white/70">
                  <span>Min Spike Score:</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-white font-bold">{minSpikeScore}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.2"
                  value={minSpikeScore}
                  onChange={(e) => setMinSpikeScore(Number(e.target.value))}
                  className="w-full accent-brass cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-white/70">
                  <span>Resolution:</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-white font-bold">{binSec}s</span>
                </div>
                <select
                  value={binSec}
                  onChange={(e) => setBinSec(Number(e.target.value))}
                  className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-3 py-1.5 text-white text-xs font-mono cursor-pointer focus:outline-none focus:border-brass/60"
                >
                  <option value="2.0" className="bg-[#121319] text-white">2s (High resolution)</option>
                  <option value="5.0" className="bg-[#121319] text-white">5s (Standard)</option>
                  <option value="10.0" className="bg-[#121319] text-white">10s (Broad)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Chat Velocity Timeline Graph */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3 backdrop-blur-md">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-white/60">
                Velocity Timeline · {series.length} buckets ({reviewData?.events_total || 0} events)
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-brass/15 text-brass font-bold border border-brass/30">
                {spikes.length} Spikes Detected
              </span>
            </div>

            {loading ? (
              <div className="h-36 flex items-center justify-center text-white/40">
                <Loader2 size={24} className="animate-spin text-brass" />
              </div>
            ) : series.length === 0 ? (
              <div className="h-28 flex items-center justify-center text-xs font-mono text-white/40">
                No chat events recorded for this session.
              </div>
            ) : (
              <div className="relative h-36 w-full pt-2">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${series.length} 100`}>
                  <defs>
                    <linearGradient id="afterStreamVelGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffb800" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#ffb800" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal gridlines */}
                  <line x1="0" y1="25" x2={series.length} y2="25" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1="0" y1="50" x2={series.length} y2="50" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1="0" y1="75" x2={series.length} y2="75" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                  {/* Velocity Area */}
                  <path
                    d={`M 0 100 ${series.map((p, i) => `L ${i} ${100 - (p.count / maxCount) * 90}`).join(' ')} L ${series.length - 1} 100 Z`}
                    fill="url(#afterStreamVelGrad)"
                  />
                  {/* Velocity Line */}
                  <path
                    d={`M 0 ${100 - (series[0]?.count / maxCount) * 90} ${series.map((p, i) => `L ${i} ${100 - (p.count / maxCount) * 90}`).join(' ')}`}
                    fill="none"
                    stroke="#ffb800"
                    strokeWidth="1.75"
                  />
                  {/* Spike Indicators */}
                  {series.map((p, i) => p.has_spike ? (
                    <circle
                      key={i}
                      cx={i}
                      cy={100 - (p.count / maxCount) * 90}
                      r="3.5"
                      fill="#e31084"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  ) : null)}
                </svg>
              </div>
            )}
          </div>

          {/* Detected Spikes List */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2">
              <Zap size={14} className="text-rose-400" /> Detected Spikes Ready to Cut
            </h3>

            {spikes.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-center text-xs font-mono text-white/50">
                No spikes detected at current threshold. Lower the velocity threshold above to catch more subtle chat spikes.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {spikes.map((spk) => {
                  const isCutting = cuttingId === spk.id;
                  const clipStart = Math.max(0, spk.onset - 25);
                  const clipEnd = spk.end + 10;
                  const dur = clipEnd - clipStart;

                  return (
                    <div
                      key={spk.id}
                      className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/20 flex items-center justify-between gap-3 transition-all backdrop-blur-md shadow-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-white">
                            {formatSec(clipStart)} - {formatSec(clipEnd)}
                          </span>
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Score {spk.score?.toFixed(1)}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-white/50 flex items-center gap-2">
                          <span>{dur.toFixed(1)}s</span>
                          <span>•</span>
                          <span>Peak: {spk.peak_count} msgs</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCut(clipStart, clipEnd, `Spike @ ${formatSec(spk.onset)}`, spk)}
                        disabled={isCutting || !hasRecording}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
                          hasRecording
                            ? 'bg-brass text-brassink hover:brightness-110 active:scale-95 cursor-pointer'
                            : 'bg-white/5 text-white/40 border border-white/10 cursor-not-allowed opacity-50'
                        }`}
                        title={hasRecording ? 'Extract this clip into review queue' : 'Full recording not kept'}
                      >
                        {isCutting ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />}
                        <span>Cut to Queue</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Custom Range Cutter */}
          {hasRecording && (
            <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3 backdrop-blur-md">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2">
                <Scissors size={14} className="text-brass" /> Cut Custom Time Range
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <label className="text-white/60 block mb-1">Start Time (sec)</label>
                  <input
                    type="number"
                    placeholder="e.g. 120"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder-white/20 focus:outline-none focus:border-brass/60"
                  />
                </div>
                <div>
                  <label className="text-white/60 block mb-1">End Time (sec)</label>
                  <input
                    type="number"
                    placeholder="e.g. 180"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder-white/20 focus:outline-none focus:border-brass/60"
                  />
                </div>
                <div>
                  <label className="text-white/60 block mb-1">Title / Tag (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. funny reaction"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder-white/20 focus:outline-none focus:border-brass/60"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => handleCut(customStart, customEnd, customTitle)}
                    disabled={!customStart || !customEnd || cuttingId === 'custom'}
                    className="w-full py-1.5 px-3.5 rounded-xl bg-brass text-brassink font-semibold flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all shadow-xs"
                  >
                    {cuttingId === 'custom' ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />}
                    <span>Cut Range</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
