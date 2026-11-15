import React, { useState, useEffect } from 'react';
import {
  X,
  Youtube,
  Key,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  Layers,
  ArrowRight,
  Info,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, apiJson } from '../lib/api';

export default function YouTubeSetupModal({
  isOpen,
  onClose,
  onConnected = null,
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [channelData, setChannelData] = useState(null);
  const [copiedText, setCopiedText] = useState(null);
  const [error, setError] = useState(null);

  // Load existing credentials and status on open
  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    // Check status
    apiFetch('/api/youtube/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setIsConnected(Boolean(data.connected));
          if (data.channel) setChannelData(data.channel);
        }
      })
      .catch(() => {});

    // Check config
    apiFetch('/api/youtube/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg && cfg.client_id) {
          setClientId(cfg.client_id);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Listen for callback completion via BroadcastChannel
  useEffect(() => {
    if (!isOpen) return;

    let bc = null;
    try {
      bc = new BroadcastChannel('shortly_youtube');
      bc.onmessage = (event) => {
        if (event.data?.type === 'CONNECTED') {
          setIsConnected(true);
          setIsConnecting(false);
          // Reload channel details
          apiFetch('/api/youtube/status')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d?.channel) setChannelData(d.channel);
              if (onConnected) onConnected(d);
            });
        }
      };
    } catch (_) {}

    return () => {
      if (bc) bc.close();
    };
  }, [isOpen, onConnected]);

  if (!isOpen) return null;

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedText(key);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Please provide both Client ID and Client Secret.');
      return false;
    }
    setIsSaving(true);
    setError(null);
    try {
      await apiJson('/api/youtube/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        }),
      });
      return true;
    } catch (e) {
      setError(e.detail || e.message || 'Failed to save credentials.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartOAuth = async () => {
    setError(null);
    // Save first if inputs were updated
    if (clientId.trim() && clientSecret.trim()) {
      const ok = await handleSaveCredentials();
      if (!ok) return;
    }

    setIsConnecting(true);
    try {
      const res = await apiJson('/api/youtube/auth-url');
      if (res?.auth_url) {
        window.open(res.auth_url, '_blank', 'noopener,noreferrer');
      }

      // Poll status every 2.5s for 3 minutes
      let attempts = 0;
      const pollTimer = setInterval(async () => {
        attempts++;
        if (attempts > 72) {
          clearInterval(pollTimer);
          setIsConnecting(false);
          return;
        }

        try {
          const st = await apiJson('/api/youtube/status');
          if (st?.connected) {
            clearInterval(pollTimer);
            setIsConnected(true);
            setIsConnecting(false);
            if (st.channel) setChannelData(st.channel);
            if (onConnected) onConnected(st);
          }
        } catch (_) {}
      }, 2500);
    } catch (e) {
      setIsConnecting(false);
      setError(e.detail || e.message || 'Could not initiate Google authorization.');
    }
  };

  const steps = [
    {
      id: 1,
      title: 'Google Cloud Project',
      desc: 'Create a free project in Google Cloud Console',
    },
    {
      id: 2,
      title: 'Enable YouTube API',
      desc: 'Enable YouTube Data API v3 in API Library',
    },
    {
      id: 3,
      title: 'OAuth Consent Screen',
      desc: 'Configure user consent & add test user',
    },
    {
      id: 4,
      title: 'Desktop Credentials',
      desc: 'Create OAuth 2.0 Client ID (Desktop App)',
    },
    {
      id: 5,
      title: 'Connect & Authorize',
      desc: 'Paste credentials and connect with Google',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-fade">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden rounded-3xl bg-[#0f1016]/95 border border-white/[0.12] border-t-white/[0.22] shadow-[0_24px_64px_rgba(0,0,0,0.7)] text-white">
        {/* Glow ambient background */}
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-gradient-to-br from-[#ff0033]/20 via-[#e31084]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-gradient-to-tr from-[#3b82f6]/10 via-[#e31084]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative z-10 flex items-center justify-between px-6 sm:px-8 py-5 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#ff0033] to-[#e31084] p-0.5 flex items-center justify-center shadow-[0_4px_14px_rgba(255,0,51,0.35)]">
              <div className="w-full h-full bg-[#12131b] rounded-[14px] flex items-center justify-center">
                <Youtube size={20} className="text-[#ff3355]" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Direct YouTube Integration</h2>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-white/[0.08] text-white/80 rounded-full border border-white/[0.1]">
                  Official API v3
                </span>
                {isConnected && (
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-white/60">Connect your YouTube Channel directly without any 3rd-party middlemen</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-white/70 hover:text-white transition-all active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="relative z-10 px-6 sm:px-8 py-3 bg-white/[0.015] border-b border-white/[0.06] overflow-x-auto no-scrollbar">
          <div className="flex items-center justify-between min-w-[540px] gap-2">
            {steps.map((s, idx) => {
              const active = currentStep === s.id;
              const completed = currentStep > s.id || isConnected;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentStep(s.id)}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all text-left ${
                    active
                      ? 'bg-white/[0.1] border border-white/[0.18] shadow-[0_2px_10px_rgba(0,0,0,0.3)]'
                      : completed
                      ? 'text-white/80 hover:bg-white/[0.04]'
                      : 'text-white/40 hover:bg-white/[0.03]'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                      completed
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : active
                        ? 'bg-gradient-to-tr from-[#e31084] to-[#ff0033] text-white shadow-sm'
                        : 'bg-white/[0.06] text-white/50 border border-white/[0.08]'
                    }`}
                  >
                    {completed ? <Check size={13} strokeWidth={3} /> : s.id}
                  </div>
                  <div className="truncate">
                    <div className={`text-xs font-semibold ${active ? 'text-white' : 'text-white/70'}`}>
                      {s.title}
                    </div>
                  </div>
                  {idx < steps.length - 1 && (
                    <ChevronRight size={14} className="text-white/20 shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Body Content */}
        <div className="relative z-10 flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          {error && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3 animate-shake">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* STEP 1: GCP Project */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-fade">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Step 1: Create a Google Cloud Project</h3>
                  <p className="text-sm text-white/70 leading-relaxed">
                    Google provides free access to the YouTube Data API. First, create a project inside the Google Cloud Console.
                  </p>
                </div>
                <a
                  href="https://console.cloud.google.com/projectcreate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] text-xs font-semibold text-white transition-all active:scale-95 shadow-sm"
                >
                  Open Cloud Console
                  <ExternalLink size={14} />
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-[#e31084]/20 text-[#ff47a3] font-bold text-xs flex items-center justify-center">1</div>
                  <h4 className="text-sm font-semibold text-white">Click New Project</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Log in with your Google account at Google Cloud Console and click "New Project" at the top.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-[#e31084]/20 text-[#ff47a3] font-bold text-xs flex items-center justify-center">2</div>
                  <h4 className="text-sm font-semibold text-white">Project Name</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Name the project <strong className="text-white">Shortly</strong> or any name you prefer. Organization can be left as "No organization".
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-[#e31084]/20 text-[#ff47a3] font-bold text-xs flex items-center justify-center">3</div>
                  <h4 className="text-sm font-semibold text-white">Click Create</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Hit "Create" and wait ~15 seconds for Google to initialize your project. Make sure it's selected in the top dropdown.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex items-start gap-3">
                <Info size={16} className="shrink-0 mt-0.5 text-blue-400" />
                <div>
                  <strong>Completely Free:</strong> Google gives 10,000 free YouTube Data API quota units every single day. This is more than enough for daily video publishing and live metrics tracking.
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Enable YouTube API */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-fade">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Step 2: Enable YouTube Data API v3</h3>
                  <p className="text-sm text-white/70 leading-relaxed">
                    Enable the official YouTube Data API so Shortly can read your channel metrics and upload your Shorts.
                  </p>
                </div>
                <a
                  href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] text-xs font-semibold text-white transition-all active:scale-95 shadow-sm"
                >
                  Open API Library
                  <ExternalLink size={14} />
                </a>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#ff0033]/20 flex items-center justify-center">
                    <Youtube size={22} className="text-[#ff3355]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">YouTube Data API v3</h4>
                    <p className="text-xs text-white/60">Required for channel info, analytics stats, and video uploads</p>
                  </div>
                </div>

                <div className="text-xs text-white/70 leading-relaxed space-y-2 border-t border-white/[0.06] pt-3">
                  <p>1. In the Google Cloud Console, open <strong>APIs & Services → Library</strong>.</p>
                  <p>2. Search for <code className="px-1.5 py-0.5 bg-white/[0.08] rounded text-pink-300">YouTube Data API v3</code>.</p>
                  <p>3. Click the blue <strong className="text-white">"ENABLE"</strong> button.</p>
                  <p className="text-white/50">(Optional) You can also enable <em>YouTube Analytics API</em> for deeper watch-time statistics.</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: OAuth Consent Screen */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-fade">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Step 3: Configure OAuth Consent Screen</h3>
                  <p className="text-sm text-white/70 leading-relaxed">
                    Set up who can authorize Shortly and add required YouTube permissions.
                  </p>
                </div>
                <a
                  href="https://console.cloud.google.com/apis/credentials/consent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] text-xs font-semibold text-white transition-all active:scale-95 shadow-sm"
                >
                  Open Consent Screen
                  <ExternalLink size={14} />
                </a>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="w-5 h-5 rounded-md bg-[#e31084]/20 text-[#ff47a3] flex items-center justify-center text-xs">A</span>
                    User Type: External
                  </div>
                  <p className="text-xs text-white/60">
                    Select <strong>External</strong> and click <strong>Create</strong>. Provide an App Name (e.g. <em>Shortly</em>) and your email.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="w-5 h-5 rounded-md bg-[#e31084]/20 text-[#ff47a3] flex items-center justify-center text-xs">B</span>
                    Add Scopes
                  </div>
                  <p className="text-xs text-white/60">
                    On the Scopes step, click <strong>Add or Remove Scopes</strong> and check:
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs font-mono text-emerald-300">
                      .../auth/youtube.readonly
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs font-mono text-emerald-300">
                      .../auth/youtube.upload
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs font-mono text-emerald-300">
                      .../auth/youtube
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                    <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-300 flex items-center justify-center text-xs">C</span>
                    Crucial: Add Test User!
                  </div>
                  <p className="text-xs text-amber-200/80 leading-relaxed">
                    Under the <strong>"Test users"</strong> section, click <strong>"+ ADD USERS"</strong> and enter your Google account email (the one that owns your YouTube channel). Since your app is personal/unverified, only test users can log in!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Desktop Credentials */}
          {currentStep === 4 && (
            <div className="space-y-5 animate-fade">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Step 4: Create OAuth 2.0 Client ID</h3>
                  <p className="text-sm text-white/70 leading-relaxed">
                    Generate the Client ID and Client Secret keys specifically for desktop apps.
                  </p>
                </div>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] text-xs font-semibold text-white transition-all active:scale-95 shadow-sm"
                >
                  Open Credentials
                  <ExternalLink size={14} />
                </a>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                  <div className="text-sm font-semibold text-white">1. Click "+ Create Credentials" → "OAuth client ID"</div>
                  <p className="text-xs text-white/60">
                    Located at the top of the Credentials page.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                  <div className="text-sm font-semibold text-white">2. Application Type: Select "Desktop app"</div>
                  <p className="text-xs text-white/60">
                    Important: Choose <strong className="text-white">Desktop app</strong> (do not choose Web application). Name it "Shortly Desktop" and click Create.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                  <div className="text-sm font-semibold text-white">3. Copy your Credentials</div>
                  <p className="text-xs text-white/60">
                    Google will show a dialog with your <strong className="text-pink-300">Client ID</strong> and <strong className="text-pink-300">Client Secret</strong>. You will paste them in the next step!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Connect & Authorize */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-fade">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Step 5: Paste Credentials & Connect</h3>
                <p className="text-sm text-white/70 leading-relaxed">
                  Enter your Google OAuth credentials below. They are saved securely on your local device.
                </p>
              </div>

              {isConnected && channelData && (
                <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    {channelData.avatar ? (
                      <img
                        src={channelData.avatar}
                        alt={channelData.title}
                        className="w-12 h-12 rounded-xl object-cover border border-emerald-500/40"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Youtube size={24} />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{channelData.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                          Connected
                        </span>
                      </div>
                      <p className="text-xs text-white/60">
                        {channelData.handle} • {channelData.subscribers?.toLocaleString()} subscribers
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleStartOAuth}
                    className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-semibold text-white transition-all active:scale-95"
                  >
                    Switch Channel
                  </button>
                </div>
              )}

              {/* Form Inputs */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-white/70 font-semibold mb-1.5">
                    Google OAuth Client ID
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. 123456789-xxxxxx.apps.googleusercontent.com"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.1] focus:border-[#e31084] focus:outline-none focus:ring-2 focus:ring-[#e31084]/20 text-sm text-white placeholder-white/25 font-mono transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-white/70 font-semibold mb-1.5">
                    Google OAuth Client Secret
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="e.g. GOCSPX-xxxxxxxxxxxxxxxx"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.1] focus:border-[#e31084] focus:outline-none focus:ring-2 focus:ring-[#e31084]/20 text-sm text-white placeholder-white/25 font-mono transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Troubleshooting Warning */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2 text-xs text-white/70">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-amber-400" />
                  What to expect when connecting:
                </div>
                <p>
                  Because this is your personal desktop app, Google may display a screen saying <em>"Google hasn't verified this app"</em>.
                </p>
                <p className="text-white/90">
                  👉 Click <strong className="text-white">"Advanced"</strong> at the bottom left, then click <strong className="text-pink-300">"Go to Shortly (unsafe)"</strong> to authorize your channel. This is standard for self-hosted OAuth.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  disabled={isSaving || !clientId.trim() || !clientSecret.trim()}
                  className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.12] text-xs font-semibold text-white transition-all disabled:opacity-40 active:scale-95"
                >
                  {isSaving ? 'Saving...' : 'Save Credentials Only'}
                </button>

                <button
                  type="button"
                  onClick={handleStartOAuth}
                  disabled={isConnecting || !clientId.trim() || !clientSecret.trim()}
                  className="w-full sm:flex-1 py-3 px-6 rounded-2xl bg-[#ff0000] hover:bg-[#cc0000] text-white text-sm font-bold shadow-[0_8px_25px_rgba(255,0,0,0.35)] transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Waiting for Google Authorization...
                    </>
                  ) : isConnected ? (
                    <>
                      <Youtube size={18} />
                      Reconnect YouTube Channel
                    </>
                  ) : (
                    <>
                      <Youtube size={18} />
                      Connect YouTube Channel
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Navigation */}
        <div className="relative z-10 flex items-center justify-between px-6 sm:px-8 py-4 border-t border-white/[0.08] bg-white/[0.02]">
          <button
            type="button"
            disabled={currentStep === 1}
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95"
          >
            <ChevronLeft size={16} />
            Previous
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50">
              Step {currentStep} of {steps.length}
            </span>
          </div>

          {currentStep < steps.length ? (
            <button
              type="button"
              onClick={() => setCurrentStep((prev) => Math.min(steps.length, prev + 1))}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.15] text-xs font-bold text-white transition-all active:scale-95 shadow-sm"
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-bold text-white transition-all active:scale-95"
            >
              {isConnected ? 'Done' : 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
