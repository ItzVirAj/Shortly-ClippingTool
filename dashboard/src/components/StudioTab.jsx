import React from 'react';
import { Bot, Youtube, Instagram, Sparkles } from 'lucide-react';
import MediaInput from './MediaInput';

const TikTokIcon = ({ size = 15, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z" />
  </svg>
);

export default function StudioTab({
  onProcess,
  isProcessing = false,
  tutorialLock = false,
  billingEnabled = false,
  goToTab,
  processingMode = 'auto',
  onModeChange,
}) {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar animate-fade relative z-10 selection:bg-purple-500/30 flex flex-col">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 pt-4 pb-6 sm:pt-6 sm:pb-8 flex flex-col justify-between min-h-full space-y-4 sm:space-y-5">
        {/* Apple-Style Glass Header Banner */}
        <header className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-white/[0.08] shrink-0">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.12] backdrop-blur-xl shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[11px] font-medium tracking-wide text-white/80 font-mono">
                CLIP STUDIO WORKBENCH
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl text-white tracking-[-0.025em]">
              Create Viral Shorts
            </h1>

            <p className="text-white/60 text-xs sm:text-sm leading-relaxed max-w-xl font-normal">
              Drop footage or stream links to extract high-retention clips formatted for vertical social platforms.
            </p>
          </div>

          {!tutorialLock && (
            <div className="shrink-0">
              <a
                href={billingEnabled ? '#/account' : '#app'}
                onClick={(e) => {
                  if (!billingEnabled && goToTab) {
                    e.preventDefault();
                    goToTab('settings');
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] hover:border-white/[0.22] text-xs font-medium text-white/90 hover:text-white transition-all duration-150 active:scale-[0.97] no-underline shadow-xs backdrop-blur-xl cursor-pointer"
              >
                <Bot size={13} className="text-purple-400" />
                <span>Connect Agent API</span>
                <span className="text-[10px] text-white/40 font-mono">Claude · n8n</span>
              </a>
            </div>
          )}
        </header>

        {/* Studio Ingestion Deck */}
        <MediaInput
          onProcess={onProcess}
          isProcessing={isProcessing}
          processingMode={processingMode}
          onModeChange={onModeChange}
        />

        {/* Apple-Style Platform Telemetry Footer */}
        <footer className="pt-2 pb-1 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-white/50 shrink-0">
          <div className="flex items-center gap-2.5 text-white/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-xs font-sans tracking-wide">AI Models Online · Multi-Speaker Layout Active</span>
          </div>

          <div className="flex items-center gap-6 text-white/60 font-sans text-xs">
            <span className="flex items-center gap-1.5 hover:text-white transition-colors cursor-default">
              <Youtube size={14} className="text-red-400" /> YouTube Shorts
            </span>
            <span className="flex items-center gap-1.5 hover:text-white transition-colors cursor-default">
              <Instagram size={14} className="text-pink-400" /> Instagram Reels
            </span>
            <span className="flex items-center gap-1.5 hover:text-white transition-colors cursor-default">
              <TikTokIcon size={14} className="text-cyan-400" /> TikTok
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
