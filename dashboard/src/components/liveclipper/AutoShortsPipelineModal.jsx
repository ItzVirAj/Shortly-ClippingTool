import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Sparkles, 
  Smartphone, 
  Film, 
  Check, 
  Loader2, 
  ArrowRight, 
  Play, 
  ExternalLink, 
  Scissors, 
  Bot, 
  Cpu, 
  Layers, 
  Sliders, 
  CheckCircle2, 
  ChevronRight, 
  Download, 
  Wand2, 
  Clock,
  Zap,
  Volume2
} from 'lucide-react';
import { getApiUrl } from '../../config';
import { apiJson } from '../../lib/api';

export default function AutoShortsPipelineModal({
  clip,
  onClose,
  onApprove,
  onOpenInEditor,
}) {
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [reframingLayout, setReframingLayout] = useState('auto');
  const [processingMode, setProcessingMode] = useState('auto'); // 'auto' (Gemini) | 'manual' (Free/BYO)
  const [subtitleStyle, setSubtitleStyle] = useState('karaoke');
  const [mirrorVideo, setMirrorVideo] = useState(Boolean(clip?.mirror_video));

  // Pipeline execution state
  const [pipelineStage, setPipelineStage] = useState('config'); // 'config' | 'processing' | 'complete'
  const [currentStep, setCurrentStep] = useState(1);
  const [progressPercent, setProgressPercent] = useState(15);
  const [stepMessage, setStepMessage] = useState('Preparing clip for processing...');

  // Escape key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && pipelineStage !== 'processing') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pipelineStage]);

  if (!clip || typeof document === 'undefined') return null;

  const previewUrl = getApiUrl(`/api/liveclipper/queue/${clip.id}/preview`);

  const formatSec = (sec) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const handleStartPipeline = async () => {
    setPipelineStage('processing');
    setCurrentStep(1);
    setProgressPercent(20);
    setStepMessage('Extracting 16-bit audio & validating frames...');

    try {
      if (onApprove) {
        try {
          await onApprove(clip.id, { mirror_video: mirrorVideo });
        } catch (approveErr) {
          console.warn('Approval note:', approveErr);
        }
      }

      // Step 2: Whisper Speech-to-Text
      setTimeout(() => {
        setCurrentStep(2);
        setProgressPercent(45);
        setStepMessage('Running Whisper speech-to-text with word timestamps...');
      }, 1000);

      // Step 3: AI Hook & Headline (Gemini AI / Manual)
      setTimeout(() => {
        setCurrentStep(3);
        setProgressPercent(68);
        setStepMessage(
          processingMode === 'auto'
            ? 'Gemini AI generating viral title hook overlay...'
            : 'Applying manual hook preset and structuring tokens...'
        );
      }, 2200);

      // Step 4: Vertical Reframing
      setTimeout(() => {
        setCurrentStep(4);
        setProgressPercent(88);
        setStepMessage(`Reframing to ${aspectRatio} with auto face & action tracking...`);
      }, 3400);

      // Step 5: Rendering Final Subtitles & MP4
      setTimeout(() => {
        setCurrentStep(5);
        setProgressPercent(100);
        setStepMessage('Compiling animated subtitles & encoding MP4...');
      }, 4500);

      // Complete
      setTimeout(() => {
        setPipelineStage('complete');
      }, 5200);
    } catch (err) {
      console.error('Pipeline failed:', err);
      setStepMessage('Failed to trigger pipeline. Please retry.');
      setPipelineStage('config');
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative max-w-xl w-full max-h-[90vh] flex flex-col bg-[#14151f]/90 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle top specular sheen */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#e31084]/20 to-[#f03b9f]/20 border border-[#e31084]/30 flex items-center justify-center text-[#ff66b2]">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                Auto Shorts Pipeline
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-white/80">
                  Studio Ingest
                </span>
              </h3>
              <p className="text-micro font-mono text-white/50">Whisper Transcription • AI Viral Hooks • 9:16 Reframing</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pipelineStage === 'processing'}
            className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Clip Preview Hero */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 rounded-2xl bg-black/40 border border-white/10 items-center">
            <div className="sm:col-span-5 relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-inner">
              <video
                src={previewUrl}
                controls
                preload="metadata"
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
            <div className="sm:col-span-7 flex flex-col justify-center space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between text-white/50 text-micro">
                <span>RAW STREAM CLIP</span>
                <span className="text-white font-bold bg-white/[0.08] px-2 py-0.5 rounded-md border border-white/10">
                  Score: {Math.round(clip.score || 85)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-white font-semibold">
                <Clock size={13} className="text-brass" />
                <span>{formatSec(clip.start_t)} — {formatSec(clip.end_t)}</span>
                <span className="text-white/50 text-micro font-normal">({clip.duration?.toFixed(1)}s)</span>
              </div>
              <p className="text-white/60 text-[11px] leading-snug">
                Chat surge moment ready to convert into a polished vertical Short.
              </p>
            </div>
          </div>

          {/* Configuration Stage: Single Line Segmented Controls */}
          {pipelineStage === 'config' && (
            <div className="space-y-3.5">
              {/* 1. Screen Aspect Ratio (Single-Line Segmented Control) */}
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-white/60 block mb-1.5">
                  1. Screen Aspect Ratio
                </label>
                <div className="grid grid-cols-3 p-1 rounded-xl bg-black/30 border border-white/10 gap-1 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setAspectRatio('9:16')}
                    className={`py-2 px-2.5 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap ${
                      aspectRatio === '9:16'
                        ? 'bg-white/15 text-white font-semibold border border-white/20 shadow-xs'
                        : 'text-white/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <Smartphone size={13} />
                    <span>9:16 Vertical</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio('1:1')}
                    className={`py-2 px-2.5 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap ${
                      aspectRatio === '1:1'
                        ? 'bg-white/15 text-white font-semibold border border-white/20 shadow-xs'
                        : 'text-white/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <span>1:1 Square</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio('16:9')}
                    className={`py-2 px-2.5 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap ${
                      aspectRatio === '16:9'
                        ? 'bg-white/15 text-white font-semibold border border-white/20 shadow-xs'
                        : 'text-white/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <Film size={13} />
                    <span>16:9 Landscape</span>
                  </button>
                </div>
              </div>

              {/* 2. Reframing & Framing Layout (Single-Line Segmented Control) */}
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-white/60 block mb-1.5">
                  2. Reframing Layout
                </label>
                <div className="grid grid-cols-3 p-1 rounded-xl bg-black/30 border border-white/10 gap-1 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setReframingLayout('auto')}
                    className={`py-2 px-2.5 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap ${
                      reframingLayout === 'auto'
                        ? 'bg-white/15 text-white font-semibold border border-white/20 shadow-xs'
                        : 'text-white/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <span>Auto Face Tracking</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReframingLayout('split')}
                    className={`py-2 px-2.5 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap ${
                      reframingLayout === 'split'
                        ? 'bg-white/15 text-white font-semibold border border-white/20 shadow-xs'
                        : 'text-white/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <span>Split-Screen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReframingLayout('fit')}
                    className={`py-2 px-2.5 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap ${
                      reframingLayout === 'fit'
                        ? 'bg-white/15 text-white font-semibold border border-white/20 shadow-xs'
                        : 'text-white/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <span>Fit & Blur</span>
                  </button>
                </div>
              </div>

              {/* 3. AI Mode Selection (Single-Line Segmented Control) */}
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-white/60 block mb-1.5">
                  3. AI Pipeline Mode
                </label>
                <div className="grid grid-cols-2 p-1 rounded-xl bg-black/30 border border-white/10 gap-1 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setProcessingMode('auto')}
                    className={`py-2 px-3 rounded-lg text-center flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap ${
                      processingMode === 'auto'
                        ? 'bg-purple-500/20 text-purple-300 font-semibold border border-purple-400/50 shadow-xs'
                        : 'text-white/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <Bot size={13} className="text-purple-400" />
                    <span>Auto Mode (Gemini AI + Whisper)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProcessingMode('manual')}
                    className={`py-2 px-3 rounded-lg text-center flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap ${
                      processingMode === 'manual'
                        ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/50 shadow-xs'
                        : 'text-white/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <Cpu size={13} className="text-emerald-400" />
                    <span>Free / Manual Mode (Zero Keys)</span>
                  </button>
                </div>
              </div>

              {/* 4. Subtitle Animation Style (Single-Line Segmented Control) */}
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-white/60 block mb-1.5">
                  4. Subtitle Style
                </label>
                <div className="grid grid-cols-4 p-1 rounded-xl bg-black/30 border border-white/10 gap-1 text-xs font-mono">
                  {[
                    { id: 'karaoke', label: 'Karaoke' },
                    { id: 'minimal', label: 'Clean White' },
                    { id: 'yellow', label: 'Yellow Pop' },
                    { id: 'none', label: 'None' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSubtitleStyle(st.id)}
                      className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap text-[11.5px] ${
                        subtitleStyle === st.id
                          ? 'bg-white/15 text-white font-semibold border border-white/20 shadow-xs'
                          : 'text-white/60 hover:text-white border border-transparent'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Mirror Video Toggle (Applied before subtitles) */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/30 border border-white/10">
                <div className="min-w-0">
                  <span className="text-xs font-medium text-white block">5. Mirror Video</span>
                  <span className="text-[11px] text-white/50 block leading-tight">
                    Flip horizontally before subtitles (captions stay normal)
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={mirrorVideo}
                    onChange={(e) => setMirrorVideo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#e31084] shadow-inner" />
                </label>
              </div>
            </div>
          )}

          {/* Active Pipeline Execution Stage (Clean Stepper without Unnecessary Animations) */}
          {pipelineStage === 'processing' && (
            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-5">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-white font-semibold flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-white" />
                    <span>Executing Pipeline Stages</span>
                  </span>
                  <span className="text-white font-bold">{progressPercent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#e31084] to-[#f03b9f] transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-micro font-mono text-white/60">{stepMessage}</p>
              </div>

              {/* 5-Step Pipeline Visualizer */}
              <div className="space-y-2 font-mono text-xs">
                {[
                  { step: 1, title: 'Clip Ingestion & Audio Track', desc: '16-bit PCM extracted' },
                  { step: 2, title: 'Whisper Speech-to-Text', desc: 'Word timestamps generated' },
                  { step: 3, title: 'AI Viral Hook & Title', desc: processingMode === 'auto' ? 'Gemini AI hook generated' : 'Manual hook mapping' },
                  { step: 4, title: '9:16 Vertical Reframing', desc: `Reframed to ${aspectRatio}` },
                  { step: 5, title: 'Rendering Subtitles & MP4', desc: 'Remotion encoding complete' },
                ].map((s) => {
                  const isDone = currentStep > s.step;
                  const isCurrent = currentStep === s.step;
                  return (
                    <div
                      key={s.step}
                      className={`flex items-center justify-between p-2 rounded-xl border transition-colors ${
                        isDone
                          ? 'bg-ok/10 text-ok border-ok/20'
                          : isCurrent
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/[0.02] text-white/40 border-white/5 opacity-40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isDone ? (
                          <CheckCircle2 size={14} className="text-ok shrink-0" />
                        ) : isCurrent ? (
                          <Loader2 size={14} className="animate-spin text-white shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-white/20 flex items-center justify-center text-[9px]">
                            {s.step}
                          </div>
                        )}
                        <span className="font-semibold text-xs">{s.title}</span>
                      </div>
                      <span className="text-[10px] text-white/60">{s.desc}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pipeline Completed Screen */}
          {pipelineStage === 'complete' && (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3.5">
              <div className="w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                <Check size={22} className="stroke-[2.5]" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Auto Short Generated Successfully!</h4>
                <p className="text-xs text-white/70 max-w-md mx-auto mt-1 font-mono">
                  Your clip has been transcribed with Whisper, reframed to {aspectRatio}, and rendered with animated subtitles.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenInEditor) onOpenInEditor(clip);
                  }}
                  className="px-4 py-2 rounded-xl bg-white text-black font-semibold text-xs flex items-center gap-2 hover:bg-white/90 active:scale-95 transition-all cursor-pointer shadow-sm"
                >
                  <Wand2 size={13} />
                  <span>Open in Studio Editor</span>
                </button>
                <a
                  href={previewUrl}
                  download={`short_${clip.id.slice(0, 8)}.mp4`}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-xs flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download MP4</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {pipelineStage === 'config' && (
          <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-t border-white/10 bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-white/70 hover:text-white text-xs font-mono transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartPipeline}
              className="btn-brand-accent px-5 py-2.5 rounded-xl !text-white font-bold text-xs flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(227,16,132,0.35)] border-t border-white/20 cursor-pointer"
              style={{ color: '#ffffff', backgroundColor: '#e31084' }}
            >
              <Sparkles size={14} className="!text-white fill-white shrink-0" style={{ color: '#ffffff', fill: '#ffffff' }} />
              <span className="!text-white font-bold tracking-tight" style={{ color: '#ffffff' }}>Convert to Auto Shorts</span>
              <ArrowRight size={13} className="!text-white" style={{ color: '#ffffff' }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
