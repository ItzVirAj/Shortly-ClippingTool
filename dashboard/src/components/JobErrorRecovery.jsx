import React, { useState } from 'react';
import {
  AlertCircle,
  ShieldAlert,
  KeyRound,
  Youtube,
  AlertTriangle,
  ArrowLeft,
  Settings,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';

export default function JobErrorRecovery({
  error = '',
  logs = [],
  onBackToStudio,
  onOpenSettings,
  onRetry,
  onToggleLogs,
  logsVisible,
  isElectron = false,
  openLogFolder,
  keysMissing = false,
}) {
  const [copied, setCopied] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Normalize error message
  const rawError = String(error || '').trim();
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : '';
  const displayError = rawError || latestLog || 'Generation process was interrupted.';

  // Categorize error for Apple-style actionable human feedback
  const errorLower = `${rawError} ${latestLog}`.toLowerCase();

  let category = 'System Notice';
  let title = 'Generation Interrupted';
  let summary = 'The video clipping process could not be completed.';
  let detailHint = 'Return to the studio workbench to verify your input settings or restart the generation pipeline.';
  let Icon = AlertCircle;
  let accentType = 'danger'; // 'danger' | 'warning' | 'info'
  let primaryAction = 'studio'; // 'studio' | 'settings' | 'retry'

  if (
    errorLower.includes('rights') ||
    errorLower.includes('own the content') ||
    errorLower.includes('confirm you own') ||
    errorLower.includes('acknowledged')
  ) {
    category = 'Content Rights';
    title = 'Ownership Confirmation Needed';
    summary = 'Shortly requires explicit confirmation that you own or have the rights to process this media before starting.';
    detailHint = 'Ensure the rights agreement checkbox is checked on the ingestion deck, then re-launch the clipping pipeline.';
    Icon = ShieldAlert;
    accentType = 'warning';
    primaryAction = 'retry';
  } else if (
    errorLower.includes('api key') ||
    errorLower.includes('gemini') ||
    errorLower.includes('upload-post') ||
    errorLower.includes('unauthorized') ||
    errorLower.includes('401') ||
    errorLower.includes('403') ||
    keysMissing
  ) {
    category = 'API Configuration';
    title = 'Gemini API Key Required';
    summary = 'Shortly requires a valid Google Gemini API key to extract video highlights, transcribe audio, and format vertical clips.';
    detailHint = 'Navigate to Settings to input or verify your Gemini and Upload-Post API credentials.';
    Icon = KeyRound;
    accentType = 'warning';
    primaryAction = 'settings';
  } else if (
    errorLower.includes('youtube') ||
    errorLower.includes('yt-dlp') ||
    errorLower.includes('stream') ||
    errorLower.includes('video player') ||
    errorLower.includes('download') ||
    errorLower.includes('private') ||
    errorLower.includes('not found') ||
    errorLower.includes('404')
  ) {
    category = 'Media Stream';
    title = 'Could Not Access Video Stream';
    summary = 'The specified media source could not be resolved, streamed, or downloaded by the processing engine.';
    detailHint = 'Verify that the video is public and accessible on YouTube, or upload a video file (.mp4, .mov) directly from your computer.';
    Icon = Youtube;
    accentType = 'danger';
    primaryAction = 'studio';
  } else if (
    errorLower.includes('ffmpeg') ||
    errorLower.includes('transcode') ||
    errorLower.includes('render') ||
    errorLower.includes('whisper')
  ) {
    category = 'Rendering Pipeline';
    title = 'Pipeline Transcode Failed';
    summary = 'An error occurred while analyzing audio frames or generating vertical video compositions.';
    detailHint = 'Check the system logs below for technical diagnostics, or try processing with a shorter clip duration.';
    Icon = AlertTriangle;
    accentType = 'danger';
    primaryAction = 'retry';
  }

  const handleCopy = async () => {
    try {
      const payload = [
        `Shortly Error Diagnostic:`,
        `Category: ${category}`,
        `Title: ${title}`,
        `Error: ${displayError}`,
        `Timestamp: ${new Date().toISOString()}`,
        logs.length > 0 ? `Recent Logs:\n${logs.slice(-5).join('\n')}` : '',
      ].filter(Boolean).join('\n\n');

      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-3 sm:p-6 animate-fade text-center relative selection:bg-rose-500/30">
      {/* Apple Frosted Glass Recovery Card */}
      <div className="w-full max-w-lg mx-auto p-6 sm:p-8 rounded-3xl bg-paper2/80 backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.5)] relative overflow-hidden text-center transition-all duration-300">
        
        {/* Soft Ambient Glow */}
        <div className={`absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
          accentType === 'warning' ? 'bg-[#e31084]/15' : 'bg-rose-500/15'
        }`} />

        {/* Specular Hairline Top Reflection (Apple Glass Foundation) */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

        {/* Icon Squircle with Optical Depth - Distinct gap below */}
        <div className={`relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-sm transition-transform duration-200 ${
          accentType === 'warning'
            ? 'bg-[#e31084]/10 border border-[#e31084]/25 text-[#f03b9f]'
            : 'bg-rose-500/10 border border-rose-500/25 text-rose-400'
        }`}>
          <Icon size={26} className="shrink-0 stroke-[1.8]" />
        </div>

        {/* Category Pill */}
        <div className="relative z-10 mb-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-mono uppercase tracking-wider font-semibold ${
            accentType === 'warning'
              ? 'bg-[#e31084]/10 text-[#f03b9f] border border-[#e31084]/20'
              : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${accentType === 'warning' ? 'bg-[#e31084]' : 'bg-rose-400'}`} />
            {category}
          </span>
        </div>

        {/* Headline with Apple Optical Negative Tracking */}
        <h3 className="relative z-10 text-xl sm:text-2xl font-semibold text-ink tracking-tight mb-2 font-display">
          {title}
        </h3>

        {/* Humanized Plain-Language Summary */}
        <p className="relative z-10 text-xs sm:text-sm text-ink2/90 leading-relaxed max-w-md mx-auto mb-4 font-normal">
          {summary}
        </p>

        {/* Realtime Error (Single Line with Quick Copy) */}
        <div className="relative z-10 mb-5 w-full max-w-md mx-auto px-3.5 py-2 rounded-xl bg-black/45 border border-white/[0.08] backdrop-blur-md flex items-center justify-between gap-2.5 text-[11px] font-mono text-left shadow-inner">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
              ERR
            </span>
            <span className="truncate text-rose-200 select-all" title={displayError}>
              {displayError}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-sans text-white/60 hover:text-white transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-white/10 active:scale-95"
            title="Copy error message"
          >
            {copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Tactile Apple Spring Actions Group - Fixed to a clean single horizontal row */}
        <div className="relative z-10 flex flex-row items-center justify-center gap-2 sm:gap-2.5">
          {/* Primary Action Button (Brand Pink Gradient #e31084) */}
          {primaryAction === 'retry' && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold shadow-lg shadow-[#e31084]/25 bg-gradient-to-r from-[#e31084] to-[#f03b9f] text-white hover:brightness-110 active:scale-[0.97] transition-all duration-150 border-t border-white/25 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw size={14} className="shrink-0" />
              <span>Confirm & Retry</span>
            </button>
          ) : primaryAction === 'settings' && onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold shadow-lg shadow-[#e31084]/25 bg-gradient-to-r from-[#e31084] to-[#f03b9f] text-white hover:brightness-110 active:scale-[0.97] transition-all duration-150 border-t border-white/25 cursor-pointer whitespace-nowrap"
            >
              <KeyRound size={14} className="shrink-0" />
              <span>Open Settings</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onBackToStudio}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold shadow-lg shadow-[#e31084]/25 bg-gradient-to-r from-[#e31084] to-[#f03b9f] text-white hover:brightness-110 active:scale-[0.97] transition-all duration-150 border-t border-white/25 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft size={14} className="shrink-0" />
              <span>Return to Studio</span>
            </button>
          )}

          {/* Secondary Action: Studio (if primary wasn't studio) or Settings */}
          {primaryAction !== 'studio' ? (
            <button
              type="button"
              onClick={onBackToStudio}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-ink active:scale-[0.97] transition-all duration-150 backdrop-blur-md cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft size={14} className="shrink-0" />
              <span>Back to Studio</span>
            </button>
          ) : (
            onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-ink active:scale-[0.97] transition-all duration-150 backdrop-blur-md cursor-pointer whitespace-nowrap"
              >
                <Settings size={14} className="shrink-0" />
                <span>Configure Keys</span>
              </button>
            )
          )}
        </div>

      </div>
    </div>
  );
}
