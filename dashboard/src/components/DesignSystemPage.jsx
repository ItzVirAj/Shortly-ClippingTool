import React, { useState } from 'react';
import shortlyLogo from '../assets/ShortlyLogo.png';
import {
  Sparkles,
  Copy,
  Check,
  ArrowLeft,
  Sliders,
  Type,
  Palette,
  Layers,
  Box,
  Eye,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Film,
  Music,
  FolderOpen,
  ArrowLeftRight,
  Wand2,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  Search,
  ExternalLink,
  ChevronDown,
  Compass,
  Code
} from 'lucide-react';
import { UNICORN_THEME } from '../theme/config';

export default function DesignSystemPage({ onLaunchApp }) {
  const [copiedToken, setCopiedToken] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [sampleSlider, setSampleSlider] = useState(65);
  const [sampleToggle, setSampleToggle] = useState(true);
  const [sampleInputText, setSampleInputText] = useState('Viral Hook Opening');
  const [sampleNumber, setSampleNumber] = useState(1080);
  const [demoSelectedClip, setDemoSelectedClip] = useState('video');
  const [demoActiveRail, setDemoActiveRail] = useState('Media');
  const [btnLoading, setBtnLoading] = useState(false);

  const copyToClipboard = (text, id) => {
    navigator.clipboard?.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 1800);
  };

  const navTo = (target) => {
    if (target === 'app') {
      if (onLaunchApp) onLaunchApp();
      else window.location.hash = '#app';
    } else if (target === 'landing') {
      window.location.hash = '#landing';
    } else if (target === 'pricing') {
      window.location.hash = '#/pricing';
    }
  };

  const unicornTokens = [
    { name: '--uni-void', hex: '#08080a', role: 'Page canvas background', category: 'Surface' },
    { name: '--uni-panel', hex: '#0d0d12', role: 'Section containers, headers, modals', category: 'Surface' },
    { name: '--uni-card', hex: '#17171c', role: 'Cards, inputs, clip containers', category: 'Surface' },
    { name: '--uni-elevated', hex: '#25252d', role: 'Hover states, selected items, popovers', category: 'Surface' },
    { name: '--uni-iron', hex: '#31313a', role: 'Keylines, dividers, slider tracks', category: 'Line' },
    { name: '--uni-ash', hex: '#62626f', role: 'Muted text, placeholders, disabled controls', category: 'Text' },
    { name: '--uni-fog', hex: '#8b8e9c', role: 'Secondary text, icon strokes, input borders', category: 'Text' },
    { name: '--uni-pearl', hex: '#aeaac0', role: 'Body copy, secondary button borders', category: 'Text' },
    { name: '--uni-chalk', hex: '#dad7de', role: 'Headings, primary button fill', category: 'Text' },
    { name: '--uni-violet', hex: '#ab8ff1', role: 'Accent: focus rings, active tabs, links', category: 'Accent' },
    { name: '--uni-iris', hex: '#8960f0', role: 'Accent hover, gradient transitions', category: 'Accent' },
  ];

  const semanticTokens = [
    { name: '--uni-success', hex: '#75b385', role: 'Active status, ready indicators, published', label: 'Success' },
    { name: '--uni-warning', hex: '#dcb360', role: 'Warnings, low quota notice, pending', label: 'Warning' },
    { name: '--uni-danger', hex: '#db6e59', role: 'Destructive actions, error badges, failed jobs', label: 'Danger' },
  ];

  const lumenTokens = [
    { name: 'paper', val: 'oklch(13% 0.014 265)', hex: '#101119', role: 'Canvas (Night Foundry baseline)' },
    { name: 'paper2', val: 'oklch(16.5% 0.015 265)', hex: '#161722', role: 'Elevated baseline surface' },
    { name: 'brass', val: 'oklch(76% 0.17 50)', hex: '#ff8c3f', role: 'Molten brass accent (hallmark)' },
    { name: 'coral', val: 'oklch(68% 0.16 18)', hex: '#f05b5b', role: 'Secondary verb landmark' },
  ];

  const typeScales = [
    { name: 'Display Hero', font: 'Sk-Modernist (Bold)', size: '48px / clamp(3rem, 6vw, 6rem)', weight: '700', sample: 'the viral moment you didn\'t know was there', classDesc: 'font-display tracking-[-0.032em] text-white' },
    { name: 'Heading 1 (h1)', font: 'Inter Display / Sans', size: '32px', weight: '500', sample: 'AI Clip Generation Engine', classDesc: 'text-3xl font-medium tracking-[-0.04em]' },
    { name: 'Heading 2 (h2)', font: 'Inter Display / Sans', size: '24px', weight: '500', sample: 'Timeline & Project Settings', classDesc: 'text-2xl font-medium tracking-[-0.03em]' },
    { name: 'Heading 3 (h3)', font: 'Inter Display / Sans', size: '18px', weight: '500', sample: 'Video Inspector & Effects', classDesc: 'text-lg font-medium tracking-[-0.02em]' },
    { name: 'Body Regular', font: 'Inter Display / Sans', size: '16px', weight: '400', sample: 'Shortly extracts high-engagement moments from long-form video using semantic boundary detection.', classDesc: 'text-base text-ink2 leading-relaxed tracking-[-0.01em]' },
    { name: 'Body Secondary', font: 'Inter Display / Sans', size: '14px', weight: '400', sample: 'Export configurations render at 60 FPS with hardware acceleration.', classDesc: 'text-sm text-muted tracking-[-0.01em]' },
    { name: 'Eyebrow', font: 'JetBrains Mono', size: '11px', weight: '500', sample: 'WORKBENCH · PIPELINE ID: 4892', classDesc: 'eyebrow font-mono uppercase tracking-[0.10em]' },
    { name: 'Machine Readout', font: 'JetBrains Mono', size: '10.5px', weight: '500', sample: '00:42.18 · 1080X1920 · 60FPS · 9:16 · BYOK', classDesc: 'readout font-mono uppercase tabular-nums' },
  ];

  return (
    <div className={`min-h-screen bg-[var(--uni-void,#08080a)] text-[var(--uni-pearl,#aeaac0)] font-body ${UNICORN_THEME ? 'theme-unicorn' : ''}`}>
      {/* Top Header */}
      <header className="sticky top-0 z-40 h-16 border-b border-[rgba(174,170,192,0.18)] bg-[rgba(8,8,10,0.85)] backdrop-blur-md px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navTo('app')}
            className="flex items-center gap-2 p-1.5 -ml-1 text-[var(--uni-fog,#8b8e9c)] hover:text-[var(--uni-chalk,#dad7de)] transition-colors"
            title="Return to App"
          >
            <ArrowLeft size={16} />
            <span className="text-xs font-medium hidden sm:inline">Back to App</span>
          </button>
          <div className="h-4 w-px bg-[rgba(174,170,192,0.18)]" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] flex items-center justify-center overflow-hidden">
              <img src={shortlyLogo} alt="Shortly" className="w-full h-full object-cover" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display lowercase text-lg text-[var(--uni-chalk,#dad7de)] font-normal tracking-tight">shortly</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--uni-violet,#ab8ff1)] px-1.5 py-0.5 rounded-xs bg-[rgba(171,143,241,0.1)] border border-[rgba(171,143,241,0.25)]">
                Design System
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => navTo('landing')}
            className="text-xs px-2.5 py-1.5 rounded-xs text-[var(--uni-fog,#8b8e9c)] hover:text-[var(--uni-chalk,#dad7de)] hover:bg-[var(--uni-elevated,#25252d)] transition-colors hidden md:inline-flex"
          >
            Landing
          </button>
          <button
            onClick={() => navTo('pricing')}
            className="text-xs px-2.5 py-1.5 rounded-xs text-[var(--uni-fog,#8b8e9c)] hover:text-[var(--uni-chalk,#dad7de)] hover:bg-[var(--uni-elevated,#25252d)] transition-colors hidden md:inline-flex"
          >
            Pricing
          </button>
          <button
            onClick={() => navTo('app')}
            className="btn-primary text-xs flex items-center gap-1.5 px-3.5 py-1.5"
          >
            <span>Launch Editor</span>
            <ExternalLink size={12} />
          </button>
        </div>
      </header>

      {/* Hero Marquee */}
      <section className="relative overflow-hidden border-b border-[rgba(174,170,192,0.18)] px-4 sm:px-8 py-12 lg:py-16 bg-gradient-to-b from-[rgba(171,143,241,0.06)] to-transparent">
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="eyebrow">DESIGN SPECIFICATION · V2.4</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--uni-violet,#ab8ff1)]" />
                <span className="readout">LUMEN NIGHT FOUNDRY + UNICORN STUDIO</span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-[0.02em] leading-none font-normal">
                Shortly Design System
              </h1>
              <p className="text-[var(--uni-pearl,#aeaac0)] text-sm sm:text-base leading-relaxed">
                The visual language, typography scales, tokens, and components governing the Shortly
                dashboard, clip generator, and non-linear video editor.
              </p>
            </div>

            {/* Metric Chips */}
            <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-xs bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] text-xs flex items-center justify-between gap-4">
                <span className="text-[var(--uni-fog,#8b8e9c)]">Theme Active:</span>
                <span className="text-[var(--uni-violet,#ab8ff1)] font-mono font-medium">Unicorn Dark (Violet)</span>
              </div>
              <div className="px-3 py-1.5 rounded-xs bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] text-xs flex items-center justify-between gap-4">
                <span className="text-[var(--uni-fog,#8b8e9c)]">Design Register:</span>
                <span className="text-[var(--uni-chalk,#dad7de)] font-mono font-medium">Atmospheric Workbench</span>
              </div>
              <div className="px-3 py-1.5 rounded-xs bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] text-xs flex items-center justify-between gap-4">
                <span className="text-[var(--uni-fog,#8b8e9c)]">Radius Policy:</span>
                <span className="text-[var(--uni-chalk,#dad7de)] font-mono font-medium">10px Cards / 3px Controls</span>
              </div>
            </div>
          </div>

          {/* Section Filter Tabs */}
          <div className="flex items-center gap-1 mt-10 overflow-x-auto pb-1 border-b border-[rgba(174,170,192,0.18)]">
            {[
              { id: 'all', label: 'All Specifications', icon: Layers },
              { id: 'colors', label: 'Colors & Tokens', icon: Palette },
              { id: 'typography', label: 'Typography & Fonts', icon: Type },
              { id: 'components', label: 'UI Components', icon: Box },
              { id: 'forms', label: 'Form Controls', icon: Sliders },
              { id: 'editor', label: 'Editor Chrome', icon: Film },
              { id: 'principles', label: 'Design Rules', icon: Compass },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-xs transition-colors whitespace-nowrap border-b-2 ${isActive
                    ? 'border-[var(--uni-violet,#ab8ff1)] text-[var(--uni-chalk,#dad7de)] bg-[rgba(171,143,241,0.08)]'
                    : 'border-transparent text-[var(--uni-fog,#8b8e9c)] hover:text-[var(--uni-chalk,#dad7de)] hover:bg-[var(--uni-elevated,#25252d)]'
                    }`}
                >
                  <Icon size={14} className={isActive ? 'text-[var(--uni-violet,#ab8ff1)]' : 'text-[var(--uni-fog,#8b8e9c)]'} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-10 space-y-16">

        {/* 1. COLOR TOKENS & PALETTE */}
        {(activeTab === 'all' || activeTab === 'colors') && (
          <section id="colors" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-[rgba(174,170,192,0.18)] pb-3">
              <div>
                <span className="eyebrow">COLOR FOUNDATIONS</span>
                <h2 className="text-2xl font-medium text-[var(--uni-chalk,#dad7de)]">Unicorn Dark &amp; Violet Accent Tokens</h2>
              </div>
              <span className="text-xs text-[var(--uni-fog,#8b8e9c)]">Click any swatch to copy CSS variable</span>
            </div>

            {/* Core Surfaces & Text */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {unicornTokens.map((t) => (
                <div
                  key={t.name}
                  onClick={() => copyToClipboard(`var(${t.name})`, t.name)}
                  className="group p-3 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] hover:border-[var(--uni-violet,#ab8ff1)] transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <div
                      style={{ backgroundColor: t.hex }}
                      className="w-10 h-10 rounded-xs border border-[rgba(174,170,192,0.2)] shrink-0 shadow-inner flex items-center justify-center"
                    >
                      {copiedToken === t.name ? (
                        <Check size={16} className={['#dad7de', '#ab8ff1', '#aeaac0'].includes(t.hex) ? 'text-black' : 'text-white'} />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-mono font-medium text-[var(--uni-chalk,#dad7de)] block truncate">
                        {t.name}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--uni-fog,#8b8e9c)] uppercase">
                        {t.hex}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--uni-ash,#62626f)] leading-tight">
                    {t.role}
                  </p>
                  <span className="absolute top-2 right-2 text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)] opacity-0 group-hover:opacity-100 transition-opacity">
                    copy
                  </span>
                </div>
              ))}
            </div>

            {/* Muted Semantic Colors */}
            <div className="pt-4 space-y-3">
              <span className="eyebrow block">MUTED SEMANTIC STATES (~60% SATURATION)</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {semanticTokens.map((s) => (
                  <div
                    key={s.name}
                    onClick={() => copyToClipboard(`var(${s.name})`, s.name)}
                    className="p-3.5 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] hover:border-[var(--uni-violet,#ab8ff1)] transition-colors cursor-pointer flex items-center gap-3.5"
                  >
                    <div
                      style={{ backgroundColor: s.hex }}
                      className="w-9 h-9 rounded-xs shrink-0 flex items-center justify-center shadow-xs"
                    >
                      {copiedToken === s.name ? <Check size={16} className="text-black" /> : null}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium text-[var(--uni-chalk,#dad7de)]">{s.name}</span>
                        <span className="text-[10px] font-mono uppercase px-1 rounded-xs bg-[var(--uni-panel,#0d0d12)] text-[var(--uni-fog,#8b8e9c)]">{s.label}</span>
                      </div>
                      <p className="text-[11px] text-[var(--uni-fog,#8b8e9c)] mt-0.5">{s.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Baseline Night Foundry Comparison */}
            <div className="pt-4 space-y-3">
              <span className="eyebrow block">LUMEN BASELINE TOKENS (WHEN UNICORN_THEME = FALSE)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {lumenTokens.map((l) => (
                  <div
                    key={l.name}
                    className="p-3 rounded-card bg-[var(--uni-panel,#0d0d12)] border border-[rgba(174,170,192,0.12)] text-xs"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div style={{ backgroundColor: l.hex }} className="w-4 h-4 rounded-xs shrink-0" />
                      <span className="font-mono text-[var(--uni-chalk,#dad7de)]">{l.name}</span>
                    </div>
                    <p className="text-[11px] text-[var(--uni-fog,#8b8e9c)]">{l.role}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 2. TYPOGRAPHY & FONTS */}
        {(activeTab === 'all' || activeTab === 'typography') && (
          <section id="typography" className="space-y-6">
            <div className="border-b border-[rgba(174,170,192,0.18)] pb-3">
              <span className="eyebrow">TYPE HIERARCHY &amp; SCALE</span>
              <h2 className="text-2xl font-medium text-[var(--uni-chalk,#dad7de)]">Self-Hosted Font Stack &amp; The Two-Register Signature</h2>
            </div>

            {/* Font Family Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">DISPLAY FACE</span>
                  <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">font-display</span>
                </div>
                <h3 className="font-display text-2xl text-[var(--uni-chalk,#dad7de)] font-bold leading-tight">Sk-Modernist (Bold)</h3>
                <p className="text-xs text-[var(--uni-fog,#8b8e9c)]">
                  Always roman (never italic), lowercase headings, tracking -0.032em. Used for marquee marketing and brand headers.
                </p>
                <div className="p-2.5 rounded-xs bg-[var(--uni-panel,#0d0d12)] font-display text-lg text-[var(--uni-chalk,#dad7de)] lowercase tracking-[-0.032em]">
                  the viral moment you didn't know was there
                </div>
              </div>

              <div className="p-4 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">BODY FACE</span>
                  <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">font-body / font-sans</span>
                </div>
                <h3 className="font-sans text-2xl text-[var(--uni-chalk,#dad7de)] font-medium leading-tight">Inter Display</h3>
                <p className="text-xs text-[var(--uni-fog,#8b8e9c)]">
                  Standard UI body, form fields, and inspector controls. 16px body, 1.4 line-height, -0.01em tracking.
                </p>
                <div className="p-2.5 rounded-xs bg-[var(--uni-panel,#0d0d12)] font-sans text-xs text-[var(--uni-pearl,#aeaac0)] tracking-[-0.01em]">
                  Render multi-track composition with frame-accurate WebCodecs preview.
                </div>
              </div>

              <div className="p-4 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">TECHNICAL FACE</span>
                  <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">font-mono</span>
                </div>
                <h3 className="font-mono text-2xl text-[var(--uni-chalk,#dad7de)] font-medium leading-tight">JetBrains Mono</h3>
                <p className="text-xs text-[var(--uni-fog,#8b8e9c)]">
                  Machine readouts, UPPERCASE eyebrows, timecodes, tabular numerals with 0.10em tracking.
                </p>
                <div className="p-2.5 rounded-xs bg-[var(--uni-panel,#0d0d12)] font-mono text-xs text-[var(--uni-fog,#8b8e9c)] tracking-wider uppercase">
                  00:42.18 · 1080X1920 · 60FPS · 9:16
                </div>
              </div>
            </div>

            {/* Type Scale Table */}
            <div className="rounded-card border border-[rgba(174,170,192,0.18)] bg-[var(--uni-card,#17171c)] overflow-hidden">
              <div className="p-3 border-b border-[rgba(174,170,192,0.18)] bg-[var(--uni-panel,#0d0d12)] flex items-center justify-between">
                <span className="eyebrow">TYPE SCALE LADDER</span>
                <span className="text-[11px] text-[var(--uni-fog,#8b8e9c)]">Inter Display + Sk-Modernist + JetBrains Mono</span>
              </div>
              <div className="divide-y divide-[rgba(174,170,192,0.1)]">
                {typeScales.map((item) => (
                  <div key={item.name} className="p-4 flex flex-col md:flex-row md:items-baseline justify-between gap-3">
                    <div className="w-48 shrink-0">
                      <span className="text-xs font-medium text-[var(--uni-chalk,#dad7de)] block">{item.name}</span>
                      <span className="text-[11px] font-mono text-[var(--uni-fog,#8b8e9c)] block">{item.size} · w{item.weight}</span>
                      <span className="text-[10px] font-mono text-[var(--uni-ash,#62626f)] block mt-0.5">{item.classDesc}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`${item.classDesc} truncate text-[var(--uni-chalk,#dad7de)]`}>
                        {item.sample}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Two Register Rule Demonstration */}
            <div className="p-4 rounded-card bg-[var(--uni-panel,#0d0d12)] border border-[rgba(174,170,192,0.18)] space-y-2">
              <div className="flex items-center gap-2">
                <span className="eyebrow">THE TWO-REGISTER TYPOGRAPHIC SIGNATURE</span>
                <span className="text-[11px] text-[var(--uni-violet,#ab8ff1)] font-mono font-medium">DESIGN PRINCIPLE</span>
              </div>
              <p className="text-xs text-[var(--uni-pearl,#aeaac0)] leading-relaxed">
                UI prose (headings, button labels, nav links, empty states, helper text) always renders <strong className="text-[var(--uni-chalk,#dad7de)]">lowercase</strong>.
                Machine data (eyebrows, badges, readouts, stat labels, keyboard hints) always renders <strong className="text-[var(--uni-chalk,#dad7de)]">UPPERCASE 10.5–11px tracking 0.10em</strong>.
                User content (transcripts, video titles, filenames) preserves original casing untouched.
              </p>
            </div>
          </section>
        )}

        {/* 3. UI COMPONENTS & BUTTONS */}
        {(activeTab === 'all' || activeTab === 'components') && (
          <section id="components" className="space-y-6">
            <div className="border-b border-[rgba(174,170,192,0.18)] pb-3">
              <span className="eyebrow">UI COMPONENTS</span>
              <h2 className="text-2xl font-medium text-[var(--uni-chalk,#dad7de)]">Buttons, Actions &amp; State Badges</h2>
            </div>

            {/* Button Varieties */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-4">
                <span className="eyebrow block">BUTTON ACTIONS &amp; HIERARCHIES</span>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Primary */}
                  <button className="btn-primary text-xs">
                    Primary Action
                  </button>

                  {/* Primary with Loading */}
                  <button
                    onClick={() => {
                      setBtnLoading(true);
                      setTimeout(() => setBtnLoading(false), 1500);
                    }}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    {btnLoading && <span className="w-3 h-3 rounded-full border-2 border-black border-t-transparent animate-spin" />}
                    <span>{btnLoading ? 'Processing...' : 'Click to Load'}</span>
                  </button>

                  {/* Disabled Primary */}
                  <button disabled className="btn-primary text-xs">
                    Disabled
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {/* Secondary */}
                  <button className="btn-secondary text-xs px-3.5 py-1.5">
                    Secondary
                  </button>

                  {/* Quiet / Ghost */}
                  <button className="btn-ghost text-xs px-3.5 py-1.5">
                    Ghost Action
                  </button>

                  {/* Danger */}
                  <button className="btn-danger text-xs px-3.5 py-1.5">
                    Delete Project
                  </button>
                </div>

                <div className="pt-2 flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--uni-fog,#8b8e9c)]">Circular Play:</span>
                    <button className="w-8 h-8 rounded-full bg-[var(--uni-chalk,#dad7de)] text-[var(--uni-void,#08080a)] flex items-center justify-center hover:bg-[#c8c5cd] transition-colors shadow-sm">
                      <Play size={14} className="ml-0.5" fill="currentColor" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--uni-fog,#8b8e9c)]">Icon Tools:</span>
                    <button className="p-1.5 rounded-xs text-[var(--uni-fog,#8b8e9c)] hover:text-[var(--uni-chalk,#dad7de)] hover:bg-[var(--uni-elevated,#25252d)] transition-colors">
                      <Sliders size={15} />
                    </button>
                    <button className="p-1.5 rounded-xs text-[var(--uni-fog,#8b8e9c)] hover:text-[var(--uni-chalk,#dad7de)] hover:bg-[var(--uni-elevated,#25252d)] transition-colors">
                      <RotateCcw size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Badges and Chips */}
              <div className="p-5 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-4">
                <span className="eyebrow block">STATUS BADGES &amp; READOUT CHIPS</span>
                <div className="flex flex-wrap gap-2.5">
                  <span className="badge-ok text-xs px-2.5 py-1 flex items-center gap-1.5">
                    <CheckCircle2 size={12} />
                    <span>ready / published</span>
                  </span>

                  <span className="badge-brass text-xs px-2.5 py-1 flex items-center gap-1.5">
                    <Sparkles size={12} />
                    <span>new feature</span>
                  </span>

                  <span className="badge-danger text-xs px-2.5 py-1 flex items-center gap-1.5">
                    <XCircle size={12} />
                    <span>failed render</span>
                  </span>

                  <span className="px-2.5 py-1 rounded-xs bg-[var(--uni-card,#17171c)] border border-[rgba(220,179,96,0.4)] text-[var(--uni-warning,#dcb360)] text-xs flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    <span>low quota (2m left)</span>
                  </span>
                </div>

                <div className="pt-2 space-y-2">
                  <span className="eyebrow block">TECHNICAL READOUT CHIPS</span>
                  <div className="flex flex-wrap gap-2">
                    <span className="readout px-2 py-1 rounded-xs bg-[var(--uni-panel,#0d0d12)] border border-[rgba(174,170,192,0.15)]">
                      BYOK MODE
                    </span>
                    <span className="readout px-2 py-1 rounded-xs bg-[var(--uni-panel,#0d0d12)] border border-[rgba(174,170,192,0.15)]">
                      1080X1920 (9:16)
                    </span>
                    <span className="readout px-2 py-1 rounded-xs bg-[var(--uni-panel,#0d0d12)] border border-[rgba(174,170,192,0.15)]">
                      FPS: 60
                    </span>
                    <span className="readout px-2 py-1 rounded-xs bg-[var(--uni-panel,#0d0d12)] border border-[rgba(174,170,192,0.15)]">
                      DUR: 00:32.40
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Containers: Card, Dropzone, Floating Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-2">
                <span className="eyebrow block">HAIRLINE CARD (.card)</span>
                <p className="text-xs text-[var(--uni-pearl,#aeaac0)]">
                  Standard surface container with 10px radius and hairline border at 18% opacity.
                </p>
                <div className="pt-2 text-[11px] font-mono text-[var(--uni-fog,#8b8e9c)]">
                  --uni-card: #17171c
                </div>
              </div>

              <div className="p-4 rounded-card bg-[var(--uni-panel,#0d0d12)] border border-[rgba(174,170,192,0.18)] space-y-2">
                <span className="eyebrow block">SECTION CONTAINER (.split-view-panel)</span>
                <p className="text-xs text-[var(--uni-pearl,#aeaac0)]">
                  Used for major application partitions, timeline trays, and inspector panels.
                </p>
                <div className="pt-2 text-[11px] font-mono text-[var(--uni-fog,#8b8e9c)]">
                  --uni-panel: #0d0d12
                </div>
              </div>

              <div className="p-4 rounded-card bg-[var(--uni-card,#17171c)] border border-dashed border-[var(--uni-iron,#31313a)] hover:border-[var(--uni-violet,#ab8ff1)] transition-colors text-center space-y-1 cursor-pointer">
                <span className="eyebrow block">DROPZONE CONTAINER</span>
                <p className="text-xs text-[var(--uni-pearl,#aeaac0)]">
                  Drag and drop files or click to upload
                </p>
                <div className="text-[11px] font-mono text-[var(--uni-violet,#ab8ff1)]">
                  1px dashed border
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 4. FORM CONTROLS & INPUTS */}
        {(activeTab === 'all' || activeTab === 'forms') && (
          <section id="forms" className="space-y-6">
            <div className="border-b border-[rgba(174,170,192,0.18)] pb-3">
              <span className="eyebrow">FORM CONTROLS</span>
              <h2 className="text-2xl font-medium text-[var(--uni-chalk,#dad7de)]">Inputs, Sliders, Toggles &amp; Selects</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Text & Number Inputs */}
              <div className="p-5 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-4">
                <span className="eyebrow block">TEXT &amp; NUMBER FIELDS</span>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--uni-fog,#8b8e9c)] block">Project Title (Text Input)</label>
                  <input
                    type="text"
                    value={sampleInputText}
                    onChange={(e) => setSampleInputText(e.target.value)}
                    placeholder="Enter project name..."
                    className="w-full h-8 px-2.5 text-xs rounded-xs border border-[var(--uni-fog,#8b8e9c)] bg-[var(--uni-card,#17171c)] text-[var(--uni-pearl,#aeaac0)] focus:border-[var(--uni-violet,#ab8ff1)] focus:ring-2 focus:ring-[rgba(171,143,241,0.25)] outline-hidden transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--uni-fog,#8b8e9c)] block">Width (Number)</label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        value={sampleNumber}
                        onChange={(e) => setSampleNumber(Number(e.target.value))}
                        className="w-full h-8 px-2.5 pr-8 font-mono text-xs rounded-xs border border-[var(--uni-fog,#8b8e9c)] bg-[var(--uni-card,#17171c)] text-[var(--uni-chalk,#dad7de)] focus:border-[var(--uni-violet,#ab8ff1)] focus:ring-2 focus:ring-[rgba(171,143,241,0.25)] outline-hidden transition-all"
                      />
                      <span className="absolute right-2 text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">px</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--uni-fog,#8b8e9c)] block">Aspect Ratio (Select)</label>
                    <select className="w-full h-8 px-2 text-xs rounded-xs border border-[var(--uni-fog,#8b8e9c)] bg-[var(--uni-card,#17171c)] text-[var(--uni-pearl,#aeaac0)] focus:border-[var(--uni-violet,#ab8ff1)] outline-hidden">
                      <option value="9:16">9:16 (Vertical Short)</option>
                      <option value="16:9">16:9 (Landscape)</option>
                      <option value="1:1">1:1 (Square)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--uni-fog,#8b8e9c)] block">Search Filter (Icon Trailing)</label>
                  <div className="relative flex items-center">
                    <Search size={14} className="absolute left-2.5 text-[var(--uni-fog,#8b8e9c)]" />
                    <input
                      type="text"
                      placeholder="Search transitions and effects..."
                      className="w-full h-8 pl-8 pr-2.5 text-xs rounded-xs border border-[var(--uni-fog,#8b8e9c)] bg-[var(--uni-card,#17171c)] text-[var(--uni-pearl,#aeaac0)] focus:border-[var(--uni-violet,#ab8ff1)] outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Sliders, Toggles & Radios */}
              <div className="p-5 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-4">
                <span className="eyebrow block">SLIDERS &amp; TOGGLES</span>

                {/* Range Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--uni-fog,#8b8e9c)]">Zoom Level / Scrub Scale</span>
                    <span className="font-mono text-[var(--uni-violet,#ab8ff1)] font-medium">{sampleSlider}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sampleSlider}
                    onChange={(e) => setSampleSlider(Number(e.target.value))}
                    className="w-full h-1 bg-[var(--uni-iron,#31313a)] appearance-none cursor-pointer accent-[var(--uni-violet,#ab8ff1)] rounded-xs"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[var(--uni-ash,#62626f)]">
                    <span>MIN (0%)</span>
                    <span>DEF (50%)</span>
                    <span>MAX (100%)</span>
                  </div>
                </div>

                {/* Switch Toggle */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <span className="text-xs font-medium text-[var(--uni-chalk,#dad7de)] block">Snap to Clip Edges</span>
                    <span className="text-[11px] text-[var(--uni-fog,#8b8e9c)]">Align playhead to nearest keyframe boundary</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sampleToggle}
                    onClick={() => setSampleToggle(!sampleToggle)}
                    className={`w-8 h-4 rounded-xs transition-colors relative focus:outline-hidden ${sampleToggle ? 'bg-[var(--uni-violet,#ab8ff1)]' : 'bg-[var(--uni-iron,#31313a)]'
                      }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-xs bg-[var(--uni-void,#08080a)] transition-transform ${sampleToggle ? 'translate-x-4' : 'translate-x-0'
                        }`}
                    />
                  </button>
                </div>

                {/* Checkbox and Radio */}
                <div className="pt-2 flex items-center gap-6 text-xs text-[var(--uni-pearl,#aeaac0)]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-[var(--uni-violet,#ab8ff1)]" />
                    <span>Auto-caption subtitles</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="sample-radio" defaultChecked className="accent-[var(--uni-violet,#ab8ff1)]" />
                    <span>60 FPS</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="sample-radio" className="accent-[var(--uni-violet,#ab8ff1)]" />
                    <span>30 FPS</span>
                  </label>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 5. EDITOR CHROME & TIMELINE SPEC */}
        {(activeTab === 'all' || activeTab === 'editor') && (
          <section id="editor" className="space-y-6">
            <div className="border-b border-[rgba(174,170,192,0.18)] pb-3">
              <span className="eyebrow">NON-LINEAR EDITOR CHROME</span>
              <h2 className="text-2xl font-medium text-[var(--uni-chalk,#dad7de)]">Left Rail, Timeline Lane Identities &amp; Playhead</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left Rail Specimen */}
              <div className="p-4 rounded-card bg-[var(--uni-panel,#0d0d12)] border border-[rgba(174,170,192,0.18)] space-y-3">
                <span className="eyebrow block">LEFT RAIL ACTIVE INDICATOR</span>
                <p className="text-xs text-[var(--uni-fog,#8b8e9c)]">
                  Active item receives elevated fill, chalk icon, and 2px left violet stripe.
                </p>
                <div className="flex flex-col items-center py-2 gap-1.5 bg-[var(--uni-panel,#0d0d12)] w-[92px] mx-auto border border-[rgba(174,170,192,0.18)] rounded-xs">
                  {[
                    { id: 'Media', label: 'Media', icon: FolderOpen },
                    { id: 'Text', label: 'Text', icon: Type },
                    { id: 'Effects', label: 'Effects', icon: Wand2 },
                    { id: 'Transitions', label: 'Transitions', icon: ArrowLeftRight },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isActive = demoActiveRail === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setDemoActiveRail(item.id)}
                        className={`w-[76px] py-2 px-1 flex flex-col items-center justify-center transition-all ${isActive
                          ? 'bg-[var(--uni-elevated,#25252d)] text-[var(--uni-chalk,#dad7de)] border-l-2 border-[var(--uni-violet,#ab8ff1)] rounded-r-xs'
                          : 'text-[var(--uni-fog,#8b8e9c)] hover:bg-[var(--uni-elevated,#25252d)] hover:text-[var(--uni-chalk,#dad7de)] rounded-xs'
                          }`}
                      >
                        <Icon size={18} className={isActive ? 'text-[var(--uni-chalk,#dad7de)]' : 'text-[var(--uni-fog,#8b8e9c)]'} />
                        <span className="text-[10px] mt-1 truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Timeline Track Identity Strip (3px Rule) */}
              <div className="lg:col-span-2 p-4 rounded-card bg-[var(--uni-panel,#0d0d12)] border border-[rgba(174,170,192,0.18)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">TIMELINE CLIP IDENTITIES (3PX STRIPE)</span>
                  <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">Click a clip to test selection state</span>
                </div>

                <div className="space-y-2.5 pt-1">
                  {/* Video Clip */}
                  <div
                    onClick={() => setDemoSelectedClip('video')}
                    className={`h-10 px-3 rounded-xs bg-[var(--uni-card,#17171c)] border flex items-center justify-between text-xs cursor-pointer relative overflow-hidden transition-all ${demoSelectedClip === 'video'
                      ? 'border-[var(--uni-violet,#ab8ff1)] ring-2 ring-[rgba(171,143,241,0.35)] font-medium text-[var(--uni-chalk,#dad7de)]'
                      : 'border-[rgba(174,170,192,0.18)] text-[var(--uni-pearl,#aeaac0)] hover:bg-[var(--uni-elevated,#25252d)]'
                      }`}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--uni-violet,#ab8ff1)]" />
                    <div className="flex items-center gap-2 pl-2">
                      <Film size={14} className="text-[var(--uni-violet,#ab8ff1)]" />
                      <span>interview_camera_a_cut01.mp4</span>
                      <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">Video Clip · --uni-violet stripe</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">12.4s</span>
                  </div>

                  {/* Audio Clip */}
                  <div
                    onClick={() => setDemoSelectedClip('audio')}
                    className={`h-10 px-3 rounded-xs bg-[var(--uni-card,#17171c)] border flex items-center justify-between text-xs cursor-pointer relative overflow-hidden transition-all ${demoSelectedClip === 'audio'
                      ? 'border-[var(--uni-violet,#ab8ff1)] ring-2 ring-[rgba(171,143,241,0.35)] font-medium text-[var(--uni-chalk,#dad7de)]'
                      : 'border-[rgba(174,170,192,0.18)] text-[var(--uni-pearl,#aeaac0)] hover:bg-[var(--uni-elevated,#25252d)]'
                      }`}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--uni-fog,#8b8e9c)]" />
                    <div className="flex items-center gap-2 pl-2">
                      <Music size={14} className="text-[var(--uni-fog,#8b8e9c)]" />
                      <span>ambient_soundtrack_bed.mp3</span>
                      <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">Audio Clip · --uni-fog stripe</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">28.0s</span>
                  </div>

                  {/* Text Clip */}
                  <div
                    onClick={() => setDemoSelectedClip('text')}
                    className={`h-10 px-3 rounded-xs bg-[var(--uni-card,#17171c)] border flex items-center justify-between text-xs cursor-pointer relative overflow-hidden transition-all ${demoSelectedClip === 'text'
                      ? 'border-[var(--uni-violet,#ab8ff1)] ring-2 ring-[rgba(171,143,241,0.35)] font-medium text-[var(--uni-chalk,#dad7de)]'
                      : 'border-[rgba(174,170,192,0.18)] text-[var(--uni-pearl,#aeaac0)] hover:bg-[var(--uni-elevated,#25252d)]'
                      }`}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--uni-chalk,#dad7de)]" />
                    <div className="flex items-center gap-2 pl-2">
                      <Type size={14} className="text-[var(--uni-chalk,#dad7de)]" />
                      <span>"Never ignore this pattern in AI..."</span>
                      <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">Text Overlay · --uni-chalk stripe</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">4.5s</span>
                  </div>

                  {/* Overlay / Shape Clip */}
                  <div
                    onClick={() => setDemoSelectedClip('shape')}
                    className={`h-10 px-3 rounded-xs bg-[var(--uni-card,#17171c)] border flex items-center justify-between text-xs cursor-pointer relative overflow-hidden transition-all ${demoSelectedClip === 'shape'
                      ? 'border-[var(--uni-violet,#ab8ff1)] ring-2 ring-[rgba(171,143,241,0.35)] font-medium text-[var(--uni-chalk,#dad7de)]'
                      : 'border-[rgba(174,170,192,0.18)] text-[var(--uni-pearl,#aeaac0)] hover:bg-[var(--uni-elevated,#25252d)]'
                      }`}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--uni-iris,#8960f0)]" />
                    <div className="flex items-center gap-2 pl-2">
                      <Layers size={14} className="text-[var(--uni-iris,#8960f0)]" />
                      <span>Lower Third Rectangle Accent</span>
                      <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">Graphic Shape · --uni-iris stripe</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--uni-fog,#8b8e9c)]">6.0s</span>
                  </div>
                </div>

                {/* Playhead and Guide Rules */}
                <div className="pt-2 flex flex-wrap items-center gap-6 text-xs text-[var(--uni-fog,#8b8e9c)]">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[var(--uni-chalk,#dad7de)]" />
                    <span>Playhead scrub: --uni-chalk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-[var(--uni-violet,#ab8ff1)] opacity-70" />
                    <span>Snapping guideline: --uni-violet (70%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-4 bg-[var(--uni-chalk,#dad7de)] rounded-xs" />
                    <span>Trim handle: 2px --uni-chalk</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 6. DESIGN PRINCIPLES & GOVERNANCE */}
        {(activeTab === 'all' || activeTab === 'principles') && (
          <section id="principles" className="space-y-6">
            <div className="border-b border-[rgba(174,170,192,0.18)] pb-3">
              <span className="eyebrow">DESIGN GOVERNANCE</span>
              <h2 className="text-2xl font-medium text-[var(--uni-chalk,#dad7de)]">Core System Axioms &amp; Invariants</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-2">
                <span className="text-xs font-mono font-medium text-[var(--uni-violet,#ab8ff1)]">AXIOM 01 · SURFACES OVER SHADOWS</span>
                <p className="text-xs text-[var(--uni-pearl,#aeaac0)] leading-relaxed">
                  Depth is expressed through discrete surface steps (void → panel → card → elevated), not through drop shadows. Static cards and panels do not cast shadows; floating popovers and dialogs use a calibrated <code>rgba(0,0,0,0.4) 0 2px 4px -1.5px</code> elevation.
                </p>
              </div>

              <div className="p-4 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-2">
                <span className="text-xs font-mono font-medium text-[var(--uni-violet,#ab8ff1)]">AXIOM 02 · CONTRAST &amp; ACCENT DISCIPLINE</span>
                <p className="text-xs text-[var(--uni-pearl,#aeaac0)] leading-relaxed">
                  Violet is reserved exclusively for interactive focus rings, link underlines, active tab indicators, and progress states. It is <strong>never</strong> used as a button fill or on large text blocks. Primary buttons use high-contrast chalk fill.
                </p>
              </div>

              <div className="p-4 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-2">
                <span className="text-xs font-mono font-medium text-[var(--uni-violet,#ab8ff1)]">AXIOM 03 · DUAL RADII POLICY</span>
                <p className="text-xs text-[var(--uni-pearl,#aeaac0)] leading-relaxed">
                  Structural containers (cards, modals, panels) use <code>--uni-radius-card: 10px</code>. Controls (buttons, inputs, badges, tags, toggles) use <code>--uni-radius-ctl: 3px</code>. Nothing is rounder than 10px except full circles (avatars, spinners, play button).
                </p>
              </div>

              <div className="p-4 rounded-card bg-[var(--uni-card,#17171c)] border border-[rgba(174,170,192,0.18)] space-y-2">
                <span className="text-xs font-mono font-medium text-[var(--uni-violet,#ab8ff1)]">AXIOM 04 · SINGLE-SWITCH PORTABILITY</span>
                <p className="text-xs text-[var(--uni-pearl,#aeaac0)] leading-relaxed">
                  The entire Unicorn dark theme is switchable via <code>UNICORN_THEME</code> in <code>dashboard/src/theme/config.js</code>. Setting it to <code>false</code> completely restores the original Lumen night foundry styling across the entire suite.
                </p>
              </div>
            </div>
          </section>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-[rgba(174,170,192,0.18)] bg-[var(--uni-panel,#0d0d12)] py-8 px-4 sm:px-8 mt-20">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--uni-fog,#8b8e9c)]">
          <div className="flex items-center gap-2">
            <span className="font-display lowercase text-base text-[var(--uni-chalk,#dad7de)]">shortly</span>
            <span>· design system &amp; token registry</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navTo('app')} className="hover:text-[var(--uni-chalk,#dad7de)] transition-colors">
              App
            </button>
            <button onClick={() => navTo('landing')} className="hover:text-[var(--uni-chalk,#dad7de)] transition-colors">
              Landing
            </button>
            <button onClick={() => navTo('pricing')} className="hover:text-[var(--uni-chalk,#dad7de)] transition-colors">
              Pricing
            </button>
            <a
              href="https://github.com/ItzVirAj/Shortly-ClippingTool"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--uni-chalk,#dad7de)] transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
