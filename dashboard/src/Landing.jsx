import React, { useState, useEffect, useRef } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import previewShot from './assets/469shots_so.png';
import shortlyLogoExpanded from './assets/ShortlyLogoExpanded.png';
import cloudscapeWebp from './assets/dark-purple-chevron-cloudscape.webp';
import cloudscapeJpg from './assets/dark-purple-chevron-cloudscape.jpg';
import {
  Sparkles,
  ArrowRight,
  Play,
  Layers,
  Scissors,
  CheckCircle2,
  Cpu,
  Shield,
  Bot,
  Zap,
  Github,
  Globe,
  ExternalLink,
  ChevronDown,
  FileVideo,
  Flame,
} from 'lucide-react';

export default function Landing({ onLaunchApp }) {
  const [quickUrl, setQuickUrl] = useState('');
  const lenisRef = useRef(null);

  // High-performance Lenis scroll (lerp: 0.1 for instant response, 0 lag, smooth deceleration)
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
    });
    lenisRef.current = lenis;

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const handleLaunch = () => {
    if (onLaunchApp) onLaunchApp();
    else window.location.hash = '#app';
  };

  const handleQuickSubmit = (e) => {
    e.preventDefault();
    if (quickUrl.trim()) {
      try {
        localStorage.setItem('os_pending_url', quickUrl.trim());
      } catch (_) { }
    }
    handleLaunch();
  };

  const scrollToInfo = () => {
    const el = document.getElementById('info');
    if (lenisRef.current && el) {
      lenisRef.current.scrollTo(el, { offset: 0, duration: 0.8 });
    } else if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#07070a] text-zinc-100 selection:bg-purple-500/30 selection:text-white font-sans relative overflow-x-hidden">
      {/* =========================================================================
          ATMOSPHERIC HORIZON: Dark Purple Chevron Cloudscape Background (GPU Accelerated)
          ========================================================================= */}
      <div className="absolute top-0 left-0 right-0 h-[800px] pointer-events-none select-none overflow-hidden z-0 transform-gpu">
        {/* Optimized 239KB WebP Cloudscape Horizon with JPG Fallback */}
        <picture>
          <source srcSet={cloudscapeWebp} type="image/webp" />
          <img
            src={cloudscapeJpg}
            alt="Cloudscape horizon"
            loading="eager"
            decoding="async"
            className="w-full h-full object-cover object-top opacity-75 will-change-transform"
          />
        </picture>
        {/* Smooth Dark Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#07070a]/60 to-[#07070a]" />
        {/* Subtle Ambient Violet Glow (Hardware Accelerated) */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-purple-600/15 blur-3xl rounded-full pointer-events-none transform-gpu" />
      </div>

      {/* =========================================================================
          TOP NAVIGATION HEADER
          ========================================================================= */}
      <header className="relative z-30 max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        <a
          href="#landing"
          className="flex items-center no-underline group select-none hover:opacity-90 transition-opacity"
          title="Shortly"
        >
          <img
            src={shortlyLogoExpanded}
            alt="Shortly"
            className="h-[52px] sm:h-[60px] w-auto object-contain"
          />
        </a>

        {/* Quick Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs text-zinc-400 font-medium">
          <button
            type="button"
            onClick={scrollToInfo}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Architecture
          </button>
          <a
            href="https://github.com/ItzVirAj"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors flex items-center gap-1"
          >
            <Github size={13} />
            <span>GitHub</span>
          </a>
        </nav>

        {/* CTA Launch Studio */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleLaunch}
            className="h-8 px-3.5 rounded-lg bg-[#e31084] hover:bg-[#e31084]/90 text-white font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <span>Open Studio</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </header>

      {/* =========================================================================
          PAGE 1: CRAZY MODERN HERO (Two-Column Layout with Realtime macOS Screen)
          ========================================================================= */}
      <section className="relative z-10 pt-4 sm:pt-6 lg:pt-8 pb-12 sm:pb-16 overflow-hidden min-h-[calc(100vh-5rem)] flex items-center">
        <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-4 my-auto">
          {/* Left Column: Heading, Subtitle, Action Buttons, URL Paste Form */}
          <div className="w-full lg:w-[50%] xl:w-[48%] flex justify-end px-4 sm:px-6 lg:pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))] lg:pr-6 shrink-0 z-10">
            <div className="w-full max-w-2xl xl:max-w-3xl flex flex-col items-start text-left">
              {/* Release Pill Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium mb-5 shadow-xs">
                <Sparkles size={13} className="text-purple-400" />
                <span>v2.0 · Open Source AI Clipping &amp; UGC Engine</span>
              </div>

              {/* Display Typography Marquee Heading */}
              <h1
                className="text-4xl sm:text-5xl xl:text-6xl 2xl:text-7xl font-bold tracking-[-0.035em] leading-[1.06] text-white mb-5"
                style={{ fontFamily: "'Sk-Modernist', 'Nevanta', sans-serif" }}
              >
                Turn Long Videos Into Viral Shorts in Seconds
              </h1>

              {/* Body Subtitle */}
              <p
                className="text-sm sm:text-base xl:text-lg text-zinc-300 font-normal leading-relaxed tracking-[-0.01em] mb-7 max-w-xl xl:max-w-2xl"
                style={{ fontFamily: "'Inter Display', 'Geist', ui-sans-serif, system-ui, sans-serif" }}
              >
                Render multi-track composition with frame-accurate WebCodecs preview. Transform raw video footage into high-converting 9:16 vertical shorts in seconds.
              </p>

              {/* Primary Action Group - Compact One-Line Layout */}
              <div className="flex items-center gap-3 mb-7 flex-wrap">
                <button
                  type="button"
                  onClick={handleLaunch}
                  className="h-9 px-4 rounded-lg bg-[#e31084] hover:bg-[#e31084]/90 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <Play size={13} fill="currentColor" />
                  <span>Launch Studio Free</span>
                  <ArrowRight size={13} />
                </button>

                <button
                  type="button"
                  onClick={scrollToInfo}
                  className="h-9 px-3.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <span>Architecture</span>
                  <ChevronDown size={13} />
                </button>
              </div>

              {/* Instant Paste Video URL Input Bar */}
              <div className="w-full max-w-lg xl:max-w-xl">
                <form
                  onSubmit={handleQuickSubmit}
                  className="w-full p-1.5 rounded-xl bg-[#101117] border border-zinc-800 focus-within:border-purple-500/80 shadow-xl flex items-center gap-2 transition-all"
                >
                  <input
                    type="text"
                    placeholder="Paste YouTube, Twitch, or Kick URL to clip instantly…"
                    value={quickUrl}
                    onChange={(e) => setQuickUrl(e.target.value)}
                    className="flex-1 bg-transparent px-3 py-1.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/20"
                  >
                    <span>Auto-Clip</span>
                    <ArrowRight size={12} />
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Right Column: Showcase Image moved more to right, cropped out slightly, smaller and vertically centered */}
          <div className="w-full lg:w-[50%] xl:w-[52%] flex justify-end items-center self-center my-auto relative select-none pr-0 overflow-visible">
            <div className="relative w-full flex justify-end items-center translate-x-12 sm:translate-x-16 lg:translate-x-20 xl:translate-x-28">
              {/* Subtle ambient purple horizon glow */}
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-purple-600/20 via-indigo-600/10 to-purple-500/15 blur-3xl opacity-40 -z-10 pointer-events-none transform-gpu" />
              <img
                src={previewShot}
                alt="Shortly Studio Interface"
                className="w-full max-w-[760px] lg:max-w-[820px] xl:max-w-[920px] h-auto object-contain object-right drop-shadow-2xl"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PAGE 2: SYSTEM CAPABILITIES & ARCHITECTURE (Info Page)
          ========================================================================= */}
      <section
        id="info"
        className="relative z-10 py-24 px-4 sm:px-6 max-w-6xl mx-auto border-t border-zinc-800/80"
      >
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-purple-400">
            02 · System Capabilities &amp; Architecture
          </p>
          <h2
            className="text-3xl sm:text-5xl font-bold text-white tracking-[-0.032em] leading-tight"
            style={{ fontFamily: "'Sk-Modernist', 'Nevanta', sans-serif" }}
          >
            Engineered for Maximum Virality &amp; Retention
          </h2>
          <p
            className="text-zinc-400 text-sm sm:text-base leading-relaxed tracking-[-0.01em]"
            style={{ fontFamily: "'Inter Display', 'Geist', ui-sans-serif, system-ui, sans-serif" }}
          >
            A high-performance offline and cloud video pipeline combining Google Gemini multimodal reasoning,
            intelligent OpenCV computer-vision tracking, and Remotion subtitle compositing.
          </p>
        </div>

        {/* 3 Core Power Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {/* Card 1 */}
          <div className="rounded-2xl bg-[#0d0d12] border border-zinc-800 hover:border-purple-500/50 p-6 flex flex-col justify-between transition-all group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                <Flame size={24} />
              </div>
              <h3 className="text-lg font-bold text-white">Multimodal Viral Detection</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Gemini reads speech transcripts and video cuts simultaneously. It pinpoints peak emotional hooks,
                standout one-liners, and story punchlines, scoring every slice from 0 to 100.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono text-purple-300">
              <span>Retention Scoring</span>
              <span className="text-zinc-500">100% Contextual</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl bg-[#0d0d12] border border-zinc-800 hover:border-purple-500/50 p-6 flex flex-col justify-between transition-all group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <Layers size={24} />
              </div>
              <h3 className="text-lg font-bold text-white">Intelligent 9:16 Reframe</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Automatic face-tracking centers speakers seamlessly. Two-person podcast interviews are stacked into
                two-shot split views, and screencasts place the presenter neatly above the desktop.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono text-indigo-300">
              <span>Computer Vision</span>
              <span className="text-zinc-500">Zero Keyframing</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="rounded-2xl bg-[#0d0d12] border border-zinc-800 hover:border-purple-500/50 p-6 flex flex-col justify-between transition-all group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                <Scissors size={24} />
              </div>
              <h3 className="text-lg font-bold text-white">Kinetic Subtitles &amp; Hooks</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Generates 17 high-CTR subtitle styles with word-by-word highlights (Hormozi, Pills, Karaoke, Outline)
                and auto-hook titles rendered in real-time Remotion code.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono text-purple-300">
              <span>Remotion Render</span>
              <span className="text-zinc-500">17 Presets</span>
            </div>
          </div>
        </div>

        {/* Bento Specifications Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Cpu size={16} className="text-purple-400" />
              <span>BYOK or Managed Cloud</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Run totally free using your own Gemini API key (1,500 daily free requests) or upgrade to our zero-setup managed GPU cloud.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Bot size={16} className="text-purple-400" />
              <span>Agent &amp; MCP Automation</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Comes with built-in Model Context Protocol (MCP) server. Automate clipping straight from Claude Code, ChatGPT, or n8n workflows.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Shield size={16} className="text-purple-400" />
              <span>100% Privacy &amp; Data Control</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Local media stays on your machine. Keys are encrypted in your local browser sandbox and never shared across users.
            </p>
          </div>
        </div>

        {/* Bottom Call To Action Terminal */}
        <div className="relative rounded-3xl p-8 sm:p-12 overflow-hidden border border-purple-500/40 bg-gradient-to-b from-[#140f26] via-[#0d091a] to-[#07070a] text-center space-y-6 shadow-2xl">
          {/* Lightweight Ambient Highlight */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-36 bg-purple-500/20 blur-3xl rounded-full pointer-events-none transform-gpu" />

          <h3
            className="text-2xl sm:text-4xl font-bold text-white relative z-10 tracking-[-0.032em]"
            style={{ fontFamily: "'Sk-Modernist', 'Nevanta', sans-serif" }}
          >
            Ready to Multiply Your Content Reach?
          </h3>
          <p className="text-xs sm:text-sm text-zinc-300 max-w-lg mx-auto relative z-10">
            Start turning 60-minute recordings into high-converting viral shorts today. No credit card required.
          </p>

          <div className="pt-2 flex items-center justify-center gap-3 relative z-10 flex-wrap">
            <button
              type="button"
              onClick={handleLaunch}
              className="h-9 px-4 rounded-lg bg-[#e31084] hover:bg-[#e31084]/90 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Get Started Free</span>
              <ArrowRight size={14} />
            </button>
            <a
              href="https://github.com/ItzVirAj"
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 transition-colors"
            >
              <Github size={14} />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </section>

      {/* =========================================================================
          GLOBAL FOOTER
          ========================================================================= */}
      <footer className="relative z-10 border-t border-zinc-900 py-12 px-4 sm:px-6 max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
        <div className="flex items-center gap-3">
          <img src={shortlyLogoExpanded} alt="Shortly" className="h-6 w-auto object-contain opacity-80" />
          <span>· MIT Licensed Open Source</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#app" className="hover:text-zinc-200 transition-colors">
            Studio
          </a>
          <a href="#legal" className="hover:text-zinc-200 transition-colors">
            Legal &amp; Privacy
          </a>
          <a
            href="https://github.com/ItzVirAj"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-200 transition-colors"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
