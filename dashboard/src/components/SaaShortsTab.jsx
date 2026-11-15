import { useState, useEffect } from 'react';
import { Globe, Sparkles, Download, Copy, Check, ChevronRight, ChevronLeft, Loader2, AlertCircle, Volume2, User, Film, Terminal, ChevronDown, RefreshCw, Share2, Calendar, Upload } from 'lucide-react';
import { getApiUrl } from '../config';
import { apiFetch } from '../lib/api';
import StepIndicator from './ui/StepIndicator';
import SegmentedControl from './ui/SegmentedControl';
import StarBanner from './StarBanner';

const STYLE_OPTIONS = [
  { id: 'ugc', label: 'UGC Natural', desc: 'Authentic, talking to camera' },
  { id: 'educational', label: 'Educational', desc: 'Clear explanations' },
  { id: 'shock', label: 'Shock/Discovery', desc: 'Surprising opener' },
  { id: 'story', label: 'Storytelling', desc: 'Mini narrative arc' },
  { id: 'comparison', label: 'Before/After', desc: 'Comparison style' },
];

const STEPS = ['Setup', 'Analysis', 'Configure', 'Generate', 'Result'];

const CACHE_KEY = 'saasshorts_cache';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (Date.now() - cache.timestamp > CACHE_MAX_AGE) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cache;
  } catch { return null; }
}

function saveCache(url, analysis, webResearch, scripts) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      url, analysis, webResearch, scripts, timestamp: Date.now(),
    }));
  } catch { /* localStorage full */ }
}

export default function SaaShortsTab({ geminiApiKey, elevenLabsKey, falKey, uploadPostKey, uploadUserId, managed = false }) {
  // Managed (hosted plan): Gemini (script) + Upload-Post run server-side via the
  // bearer token — no BYOK Gemini key needed. fal.ai + ElevenLabs stay BYOK.
  const geminiHeader = geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {};
  const needsGeminiKey = !geminiApiKey && !managed;
  // Wizard state
  const [step, setStep] = useState(() => {
    const cache = loadCache();
    return cache ? 1 : 0;
  });

  // Step 0: URL input
  const [url, setUrl] = useState(() => loadCache()?.url || '');
  const [videoMode, setVideoMode] = useState('lowcost'); // "lowcost" or "premium"
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState('ugc');
  const [language, setLanguage] = useState('en');
  const [actorGender, setActorGender] = useState('female');
  const [numScripts, setNumScripts] = useState(3);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [fromCache, setFromCache] = useState(() => !!loadCache());

  // Step 1: Analysis results
  const [analysis, setAnalysis] = useState(() => loadCache()?.analysis || null);
  const [webResearch, setWebResearch] = useState(() => loadCache()?.webResearch || null);
  const [scripts, setScripts] = useState(() => loadCache()?.scripts || []);
  const [selectedScript, setSelectedScript] = useState(0);

  // Step 2: Configure
  const [shareToGallery, setShareToGallery] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('21m00Tcm4TlvDq8ikWAM');
  const [actorDescription, setActorDescription] = useState('');
  const [editedNarration, setEditedNarration] = useState('');
  const [actorOptions, setActorOptions] = useState([]);
  const [selectedActor, setSelectedActor] = useState(null);
  const [generatingActors, setGeneratingActors] = useState(false);
  const [actorGallery, setActorGallery] = useState([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [uploadedActorPreview, setUploadedActorPreview] = useState(null); // {localPreview, serverUrl}

  // Step 3: Generate
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [genLogs, setGenLogs] = useState([]);
  const [genStatus, setGenStatus] = useState('idle');
  const [genResult, setGenResult] = useState(null);

  // Publish
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [publishPlatforms, setPublishPlatforms] = useState({ tiktok: true, instagram: true, youtube: true });
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [ytDirectConnected, setYtDirectConnected] = useState(false);

  useEffect(() => {
    apiFetch('/api/youtube/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.connected) setYtDirectConnected(true);
      })
      .catch(() => {});
  }, []);

  // UI
  const [copied, setCopied] = useState('');
  const [logsExpanded, setLogsExpanded] = useState(true);

  // Pre-fill from cache on mount (once: later cache changes must not
  // overwrite what the user typed).
  useEffect(() => {
    if (fromCache && scripts.length > 0 && !actorDescription) {
      setActorDescription(scripts[0].actor_description || '');
      setEditedNarration(scripts[0].full_narration || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch actor gallery on mount
  useEffect(() => {
    setLoadingGallery(true);
    apiFetch('/api/saasshorts/actor-gallery')
      .then(res => res.ok ? res.json() : { images: [] })
      .then(data => setActorGallery(data.images || []))
      .catch(() => {})
      .finally(() => setLoadingGallery(false));
  }, []);

  // Fetch voices on mount
  useEffect(() => {
    if (elevenLabsKey) {
      fetchVoices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elevenLabsKey]);

  // Reset selected voice when actor gender changes
  useEffect(() => {
    const genderDefaults = {
      'en-female': '21m00Tcm4TlvDq8ikWAM',  // Rachel
      'en-male': '29vD33N1CtxCmqQRPOHJ',    // Drew
      'es-female': 'EXAVITQu4vr4xnSDxMaL',  // Bella
      'es-male': 'ErXwobaYiN019PkySvjV',     // Antoni
    };
    // If we have fetched voices, pick the first matching one; otherwise use hardcoded default
    const matchingVoice = voices.find(v => (v.labels?.gender || '').toLowerCase() === actorGender);
    if (matchingVoice) {
      setSelectedVoice(matchingVoice.voice_id);
    } else {
      setSelectedVoice(genderDefaults[`${language}-${actorGender}`] || genderDefaults['en-female']);
    }
    // Re-pick only when the gender/language choice changes, not on every voices refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorGender, language]);

  // Poll generation status
  useEffect(() => {
    let interval;
    if (jobId && genStatus === 'processing') {
      interval = setInterval(async () => {
        try {
          const res = await apiFetch(`/api/saasshorts/status/${jobId}`);
          if (res.status === 404) {
            // Job lost (server restart) — treat as failed so Retry appears
            setGenStatus('failed');
            setGenerating(false);
            setGenLogs((prev) => [...prev, 'Job lost after server restart. Click Retry to resume from cached assets.']);
            clearInterval(interval);
            return;
          }
          if (!res.ok) return;
          const data = await res.json();
          if (data.logs) setGenLogs(data.logs);
          if (data.status === 'completed') {
            setGenStatus('completed');
            setGenResult(data.result);
            setGenerating(false);
            setStep(4);
            clearInterval(interval);
          } else if (data.status === 'failed') {
            setGenStatus('failed');
            setGenerating(false);
            clearInterval(interval);
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, genStatus]);

  const fetchVoices = async () => {
    try {
      const res = await fetch(getApiUrl('/api/saasshorts/voices'), {
        headers: { 'X-ElevenLabs-Key': elevenLabsKey },
      });
      if (res.ok) {
        const data = await res.json();
        setVoices(data.voices || []);
      }
    } catch (e) {
      console.error('Voices fetch error:', e);
    }
  };

  const handleAnalyze = async () => {
    if (!url.trim() && !description.trim()) return;
    if (needsGeminiKey) {
      setAnalyzeError('Gemini API key required. Set it in Settings.');
      return;
    }

    setAnalyzing(true);
    setAnalyzeError('');

    try {
      const res = await apiFetch('/api/saasshorts/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...geminiHeader,
        },
        body: JSON.stringify({
          url: url.trim() || undefined,
          description: description.trim() || undefined,
          num_scripts: numScripts,
          style,
          language,
          actor_gender: actorGender,
        }),
      });

      if (!res.ok) {
        let msg = 'Analysis failed';
        try { const err = await res.json(); msg = err.detail || msg; } catch { msg = await res.text() || msg; }
        throw new Error(msg);
      }

      const data = await res.json();
      setAnalysis(data.analysis);
      setWebResearch(data.web_research || null);
      setScripts(data.scripts);
      setSelectedScript(0);
      setFromCache(false);

      // Cache results
      saveCache(url.trim(), data.analysis, data.web_research, data.scripts);

      // Pre-fill actor description and narration from first script
      if (data.scripts.length > 0) {
        setActorDescription(data.scripts[0].actor_description || '');
        setEditedNarration(data.scripts[0].full_narration || '');
      }

      setStep(1);
    } catch (e) {
      setAnalyzeError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSelectScript = (idx) => {
    setSelectedScript(idx);
    if (scripts[idx]) {
      setActorDescription(scripts[idx].actor_description || '');
      setEditedNarration(scripts[idx].full_narration || '');
    }
  };

  const handleGenerate = async () => {
    if (!falKey) {
      alert('fal.ai API key required. Set it in Settings.');
      return;
    }
    if (!elevenLabsKey) {
      alert('ElevenLabs API key required. Set it in Settings.');
      return;
    }

    setGenerating(true);
    setGenLogs(['Starting video generation...']);
    setGenStatus('processing');
    setGenResult(null);
    setStep(3);

    try {
      // Update script with edited narration
      const scriptToSend = { ...scripts[selectedScript] };
      scriptToSend._product_name = analysis?.product_name || analysis?.name || '';
      scriptToSend._product_url = url;
      if (editedNarration !== scriptToSend.full_narration) {
        scriptToSend.full_narration = editedNarration;
      }

      const res = await apiFetch('/api/saasshorts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fal-Key': falKey,
          'X-ElevenLabs-Key': elevenLabsKey,
        },
        body: JSON.stringify({
          script: scriptToSend,
          voice_id: selectedVoice,
          actor_description: actorDescription || undefined,
          selected_actor_url: selectedActor || undefined,
          video_mode: videoMode,
          share_to_gallery: shareToGallery,
        }),
      });

      if (!res.ok) {
        let msg = 'Generation failed';
        try { const err = await res.json(); msg = err.detail || msg; } catch { msg = await res.text() || msg; }
        throw new Error(msg);
      }

      const data = await res.json();
      setJobId(data.job_id);
    } catch (e) {
      setGenStatus('failed');
      setGenLogs((prev) => [...prev, `Error: ${e.message}`]);
      setGenerating(false);
    }
  };

  const handleRetry = async () => {
    if (!jobId) return;
    setGenerating(true);
    setGenLogs(['Retrying from cached assets...']);
    setGenStatus('processing');
    setGenResult(null);

    try {
      const scriptToSend = { ...scripts[selectedScript] };
      scriptToSend._product_name = analysis?.product_name || analysis?.name || '';
      scriptToSend._product_url = url;
      if (editedNarration !== scriptToSend.full_narration) {
        scriptToSend.full_narration = editedNarration;
      }

      const res = await apiFetch('/api/saasshorts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fal-Key': falKey,
          'X-ElevenLabs-Key': elevenLabsKey,
        },
        body: JSON.stringify({
          script: scriptToSend,
          voice_id: selectedVoice,
          actor_description: actorDescription || undefined,
          retry_job_id: jobId,
          video_mode: videoMode,
          share_to_gallery: shareToGallery,
        }),
      });

      if (!res.ok) {
        let msg = 'Retry failed';
        try { const err = await res.json(); msg = err.detail || msg; } catch { msg = await res.text() || msg; }
        throw new Error(msg);
      }

      const data = await res.json();
      setJobId(data.job_id);
    } catch (e) {
      setGenStatus('failed');
      setGenLogs((prev) => [...prev, `Retry error: ${e.message}`]);
      setGenerating(false);
    }
  };

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleReset = () => {
    setStep(0);
    setUrl('');
    setAnalyzeError('');
    setAnalysis(null);
    setWebResearch(null);
    setScripts([]);
    setFromCache(false);
    localStorage.removeItem(CACHE_KEY);
    setSelectedScript(0);
    setJobId(null);
    setGenLogs([]);
    setGenStatus('idle');
    setGenResult(null);
    setGenerating(false);
    setActorDescription('');
    setEditedNarration('');
  };

  // ─── Render Steps ─────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-mono font-medium text-white/80 uppercase tracking-wider mb-2.5 backdrop-blur-md">
              <Sparkles size={12} className="text-[#ff66b2]" />
              <span>03 · AI Shorts Studio</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">AI Shorts</h1>
            <p className="text-sm text-white/60 mt-1">
              Generate viral UGC videos for any product or business
            </p>
          </div>
          {step > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white/80 hover:text-white text-xs font-medium transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <RefreshCw size={12} /> Start over
            </button>
          )}
        </div>

        {/* Progress Stepper Dock */}
        <div className="mb-8 p-3.5 sm:p-4 rounded-2xl bg-black/25 backdrop-blur-xl border border-white/[0.08] shadow-sm">
          <StepIndicator steps={STEPS} current={step} />
        </div>

        {/* ── Step 0: URL Input & Config ───────────────────────── */}
        {step === 0 && (
          <div className="animate-fade space-y-6">
            <div className="p-5 sm:p-8 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-6">
              {/* Video Mode Selector */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-3 font-medium">Video Mode</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <button
                    type="button"
                    onClick={() => setVideoMode('lowcost')}
                    className={`p-4 sm:p-5 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                      videoMode === 'lowcost'
                        ? 'bg-gradient-to-br from-[#e31084]/15 via-white/[0.06] to-transparent border-[#e31084]/60 shadow-[0_4px_24px_rgba(227,16,132,0.2)] ring-1 ring-[#e31084]/40'
                        : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] hover:border-white/[0.16]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="text-sm font-semibold text-white">Low Cost</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">recommended</span>
                    </div>
                    <p className="font-mono text-xs font-medium text-white/90 mb-1.5 tracking-wide">~$0.80 / VIDEO</p>
                    <p className="text-xs text-white/60 leading-relaxed">Hailuo 2.3 img2video + VEED Lipsync. Good movement + lip-sync.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoMode('premium')}
                    className={`p-4 sm:p-5 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                      videoMode === 'premium'
                        ? 'bg-gradient-to-br from-[#e31084]/15 via-white/[0.06] to-transparent border-[#e31084]/60 shadow-[0_4px_24px_rgba(227,16,132,0.2)] ring-1 ring-[#e31084]/40'
                        : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] hover:border-white/[0.16]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="text-sm font-semibold text-white">Premium</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#e31084]/20 text-[#ff7dc2] border border-[#e31084]/35">best quality</span>
                    </div>
                    <p className="font-mono text-xs font-medium text-white/90 mb-1.5 tracking-wide">~$2.00 / VIDEO</p>
                    <p className="text-xs text-white/60 leading-relaxed">Kling Avatar v2 Standard. Full integrated movement.</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-2 font-medium">Website URL <span className="opacity-60 lowercase font-normal">(optional)</span></label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://your-website.com"
                      className="w-full bg-black/30 hover:bg-black/40 focus:bg-black/50 border border-white/[0.1] focus:border-[#e31084]/70 text-white placeholder:text-white/35 rounded-xl pl-10 pr-4 py-2.5 text-sm transition-all outline-none focus:ring-2 focus:ring-[#e31084]/30 shadow-inner"
                      onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                    />
                  </div>
                </div>
                <p className="text-xs text-white/50 mt-1.5">If provided, we&apos;ll scrape and research your site automatically</p>
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-2 font-medium">
                  {url.trim() ? 'Extra context' : 'Describe your product/business'} <span className="opacity-60 lowercase font-normal">{url.trim() ? '(optional)' : '(required if no URL)'}</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-black/30 hover:bg-black/40 focus:bg-black/50 border border-white/[0.1] focus:border-[#e31084]/70 text-white placeholder:text-white/35 rounded-xl px-4 py-2.5 text-sm transition-all outline-none focus:ring-2 focus:ring-[#e31084]/30 shadow-inner resize-none"
                  placeholder="e.g. artisan pizzeria in Madrid, productivity coach, sportswear store, meditation app..."
                />
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-2.5 font-medium">Language</label>
                  <SegmentedControl
                    options={[
                      { value: 'en', label: 'English', icon: '🇺🇸' },
                      { value: 'es', label: 'Español', icon: '🇪🇸' },
                    ]}
                    value={language}
                    onChange={setLanguage}
                  />
                </div>

                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-2.5 font-medium">Actor</label>
                  <SegmentedControl
                    options={[
                      { value: 'female', label: 'Woman', icon: '👩' },
                      { value: 'male', label: 'Man', icon: '👨' },
                    ]}
                    value={actorGender}
                    onChange={setActorGender}
                  />
                </div>

                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-2.5 font-medium">Video Style</label>
                  <SegmentedControl
                    options={STYLE_OPTIONS.map((s) => ({ value: s.id, label: s.label, hint: s.desc }))}
                    value={style}
                    onChange={setStyle}
                    columns={5}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-2.5 font-medium">Number of Scripts</label>
                <SegmentedControl
                  options={[1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))}
                  value={numScripts}
                  onChange={setNumScripts}
                  size="sm"
                />
              </div>

              {analyzeError && (
                <div className="flex items-center gap-2.5 text-sm text-red-300 bg-red-500/15 border border-red-500/30 rounded-xl p-3.5">
                  <AlertCircle size={16} className="shrink-0 text-red-400" />
                  <span>{analyzeError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing || (!url.trim() && !description.trim())}
                className="w-full py-3.5 px-6 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-[#e31084] via-[#f03b9f] to-[#ff47a3] hover:brightness-110 active:scale-[0.98] shadow-[0_4px_24px_rgba(227,16,132,0.4)] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {analyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-white" />
                    <span>{url.trim() ? 'Scraping + researching web + generating scripts... (45-90s)' : 'Generating scripts... (20-40s)'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} className="text-white" />
                    <span className="capitalize">{url.trim() ? 'Research & Generate Scripts' : 'Generate Scripts'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] hover:border-white/[0.14] transition-all">
                <h3 className="text-xs font-mono uppercase tracking-wider text-white font-medium">Deep Research</h3>
                <p className="text-xs text-white/60 mt-2 leading-relaxed">AI analyzes your product via URL scraping + web research, or generates directly from your description.</p>
              </div>
              <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] hover:border-white/[0.14] transition-all">
                <h3 className="text-xs font-mono uppercase tracking-wider text-white font-medium">Pain Point Scripts</h3>
                <p className="text-xs text-white/60 mt-2 leading-relaxed">Generates hook-problem-solution scripts targeting your audience&apos;s real pain points.</p>
              </div>
              <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] hover:border-white/[0.14] transition-all">
                <h3 className="text-xs font-mono uppercase tracking-wider text-white font-medium">AI Actor Videos</h3>
                <p className="text-xs text-white/60 mt-2 leading-relaxed">Realistic AI-generated actors with lip-sync, b-roll, and viral subtitles. From ~$0.50/video.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Analysis Results ─────────────────────────── */}
        {step === 1 && analysis && (
          <div className="animate-fade space-y-6">
            {/* Analysis Summary */}
            <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-5">
              <div className="flex items-center justify-between mb-4 gap-3">
                <h2 className="text-lg font-semibold text-white truncate">
                  {analysis.product_name || 'Analysis'}
                </h2>
                <div className="flex items-center gap-2 shrink-0">
                  {fromCache && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/35 flex items-center gap-1">
                      cached
                      <button onClick={() => { setStep(0); setFromCache(false); }} className="hover:text-white transition-colors cursor-pointer" title="Re-analyze">
                        <RefreshCw size={9} />
                      </button>
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-white/[0.08] text-white/80 border border-white/10">{analysis.industry}</span>
                </div>
              </div>
              <p className="text-sm text-white/80 leading-relaxed mb-5">{analysis.one_liner}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-white/[0.08]">
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-white/70 mb-3 font-medium">Pain Points</h3>
                  <div className="space-y-2.5">
                    {(analysis.pain_points || []).map((pp, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-sm">
                        <span className="mt-2 flex gap-0.5 shrink-0" title={pp.intensity}>
                          {[0, 1, 2].map((d) => (
                            <span
                              key={d}
                              className={`w-1.5 h-1.5 rounded-full ${
                                d < (pp.intensity === 'high' ? 3 : pp.intensity === 'medium' ? 2 : 1)
                                  ? 'bg-[#e31084] shadow-[0_0_6px_rgba(227,16,132,0.8)]'
                                  : 'bg-white/20'
                              }`}
                            />
                          ))}
                        </span>
                        <div>
                          <span className="text-white/90">{pp.pain}</span>
                          {pp.source && pp.source !== 'website' && (
                            <span className="ml-2 font-mono text-[10.5px] text-white/50 bg-white/[0.05] px-1.5 py-0.5 rounded">{pp.source}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-white/70 mb-3 font-medium">Emotional Hooks</h3>
                  <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
                    {(analysis.emotional_hooks || []).map((h, i) => (
                      <div key={i} className="text-sm text-white/80 py-2.5 leading-relaxed">
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Web Research Results */}
            {webResearch && (
              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-white font-medium">Web Research</h3>
                  {webResearch.grounding_sources && (
                    <span className="text-xs font-mono text-white/60 bg-white/[0.06] px-2 py-0.5 rounded-full border border-white/10">
                      {webResearch.grounding_sources.length} sources
                    </span>
                  )}
                </div>

                {/* Real user reviews */}
                {webResearch.real_reviews && webResearch.real_reviews.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-white/60 mb-2.5">Real User Reviews</h4>
                    <div className="space-y-2">
                      {webResearch.real_reviews.slice(0, 5).map((review, i) => (
                        <div key={i} className="text-xs bg-white/[0.03] rounded-xl p-3 border border-white/[0.08]">
                          <p className="text-white/85 leading-relaxed">&quot;{review.quote}&quot;</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-white/50">{review.source}</span>
                            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                              review.sentiment === 'positive' ? 'bg-emerald-500/20 text-emerald-300' :
                              review.sentiment === 'negative' ? 'bg-red-500/20 text-red-300' :
                              'text-white/60'
                            }`}>{review.sentiment}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Competitors */}
                {webResearch.competitors && webResearch.competitors.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-white/60 mb-2">Competitors</h4>
                    <div className="flex flex-wrap gap-2">
                      {webResearch.competitors.map((c, i) => (
                        <span key={i} className="text-xs bg-white/[0.06] border border-white/10 px-2.5 py-1 rounded-full text-white/80" title={c.comparison}>
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {webResearch.grounding_sources && webResearch.grounding_sources.length > 0 && (
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-wider text-white/60 mb-2">Sources</h4>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                      {webResearch.grounding_sources.slice(0, 8).map((src, i) => (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-white/60 underline underline-offset-2 hover:text-[#ff66b2] transition-colors truncate max-w-[200px]"
                          title={src.title}
                        >
                          {src.title || (() => { try { return new URL(src.url).hostname; } catch { return src.url; } })()}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Scripts */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white tracking-tight">Generated Scripts</h2>
                <span className="text-xs font-mono text-white/60 bg-white/[0.06] px-2.5 py-0.5 rounded-full border border-white/10">{scripts.length} scripts</span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {scripts.map((script, i) => (
                  <div
                    key={i}
                    onClick={() => handleSelectScript(i)}
                    className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer active:scale-[0.99] ${
                      selectedScript === i
                        ? 'bg-gradient-to-br from-[#e31084]/15 via-white/[0.06] to-transparent border-[#e31084]/60 shadow-[0_4px_24px_rgba(227,16,132,0.2)] ring-1 ring-[#e31084]/40'
                        : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] hover:border-white/[0.16]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full border flex items-center justify-center font-mono text-xs font-semibold ${
                          selectedScript === i ? 'border-[#e31084] bg-[#e31084]/20 text-white shadow-[0_0_10px_rgba(227,16,132,0.5)]' : 'border-white/15 text-white/60'
                        }`}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{script.title}</h3>
                          <span className="font-mono text-xs text-white/50">{script.duration_seconds}s &middot; {script.style} &middot; {script.target_platform}</span>
                        </div>
                      </div>
                      {selectedScript === i && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#e31084]/20 text-[#ff7dc2] border border-[#e31084]/35">selected</span>
                      )}
                    </div>

                    {/* Segments preview */}
                    <div className="flex gap-1 mb-1.5">
                      {(script.segments || []).map((seg, j) => (
                        <div
                          key={j}
                          className={`h-1.5 rounded-full ${
                            seg.type === 'hook' ? 'bg-[#e31084]' :
                            seg.type === 'problem' ? 'bg-[#e31084]/70' :
                            seg.type === 'solution' ? 'bg-[#e31084]/40' :
                            'bg-white/20'
                          }`}
                          style={{ flex: (seg.end - seg.start) }}
                          title={`${seg.type}: ${seg.start}s-${seg.end}s`}
                        />
                      ))}
                    </div>
                    <p className="font-mono text-[10.5px] text-white/50 mb-3">hook &middot; problem &middot; solution</p>

                    <div className="space-y-2">
                      {(script.segments || []).map((seg, j) => (
                        <div key={j} className="flex gap-3 text-xs">
                          <span className="font-mono text-[10.5px] uppercase tracking-wider text-white/50 shrink-0 w-16 pt-px">
                            {seg.type}
                          </span>
                          <span className="text-white/80 leading-relaxed">{seg.narration}</span>
                        </div>
                      ))}
                    </div>

                    {/* Hook text & hashtags */}
                    <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-[10.5px] uppercase text-[#ff66b2] font-semibold">hook</span>
                      <span className="text-xs text-white/90">&quot;{script.hook_text}&quot;</span>
                      {(script.hashtags || []).slice(0, 4).map((tag, j) => (
                        <span key={j} className="text-xs font-mono text-white/50 bg-white/[0.05] px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white/80 hover:text-white text-sm font-medium transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-95 text-white font-medium text-sm shadow-[0_4px_20px_rgba(227,16,132,0.35)] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                Configure video <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Configure ────────────────────────────────── */}
        {step === 2 && scripts[selectedScript] && (
          <div className="animate-fade space-y-6">
            <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white tracking-tight">Configure Video</h2>
                <p className="text-sm text-white/60 mt-1">
                  Selected script: <strong className="text-white font-medium">{scripts[selectedScript].title}</strong>
                </p>
              </div>

              {/* Voice Selection */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-2.5 font-medium">
                  Voice {language === 'es' ? '(Spanish)' : '(English)'}
                </label>
                {(() => {
                  const filtered = voices.length > 0
                    ? voices.filter((v) => {
                        const gender = (v.labels?.gender || '').toLowerCase();
                        return gender === actorGender;
                      })
                      .sort((a, b) => {
                        const aAccent = (a.labels?.accent || '').toLowerCase();
                        const bAccent = (b.labels?.accent || '').toLowerCase();
                        if (language === 'es') {
                          const aScore = (aAccent.includes('spanish') || aAccent.includes('latin')) ? 0 : 1;
                          const bScore = (bAccent.includes('spanish') || bAccent.includes('latin')) ? 0 : 1;
                          return aScore - bScore;
                        }
                        const aScore = (aAccent.includes('american') || aAccent.includes('british')) ? 0 : 1;
                        const bScore = (bAccent.includes('american') || bAccent.includes('british')) ? 0 : 1;
                        return aScore - bScore;
                      })
                    : [];

                  if (filtered.length > 0) {
                    return (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                        {filtered.map((v) => (
                          <button
                            key={v.voice_id}
                            type="button"
                            onClick={() => setSelectedVoice(v.voice_id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-150 active:scale-[0.99] cursor-pointer ${
                              selectedVoice === v.voice_id
                                ? 'border-[#e31084]/60 bg-gradient-to-r from-[#e31084]/15 to-white/[0.04] text-white shadow-sm ring-1 ring-[#e31084]/30'
                                : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/80 hover:text-white'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm truncate font-medium ${selectedVoice === v.voice_id ? 'text-white' : 'text-white/80'}`}>{v.name}</div>
                              <div className="font-mono text-[10.5px] text-white/50 mt-0.5">
                                {v.labels?.accent || ''} {v.labels?.gender || ''} {v.category ? `· ${v.category}` : ''}
                              </div>
                            </div>
                            {v.preview_url && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); new Audio(v.preview_url).play(); }}
                                className="shrink-0 w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                title="Preview voice"
                              >
                                <Volume2 size={12} />
                              </button>
                            )}
                            {selectedVoice === v.voice_id && <Check size={14} className="text-[#ff66b2] shrink-0" />}
                          </button>
                        ))}
                      </div>
                    );
                  }

                  const defaults = {
                    'en-female': [
                      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (calm)' },
                      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (soft)' },
                    ],
                    'en-male': [
                      { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew (confident)' },
                      { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (deep)' },
                      { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (raspy)' },
                    ],
                    'es-female': [
                      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (suave)' },
                      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (calmada)' },
                    ],
                    'es-male': [
                      { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (cálido)' },
                      { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew (confiado)' },
                    ],
                  };
                  const key = `${language}-${actorGender}`;
                  const opts = defaults[key] || defaults['en-female'];
                  return (
                    <select
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-full bg-black/30 hover:bg-black/40 focus:bg-black/50 border border-white/[0.1] focus:border-[#e31084]/70 text-white rounded-xl px-4 py-2.5 text-sm transition-all outline-none"
                    >
                      {opts.map((o) => <option key={o.id} value={o.id} className="bg-[#121318] text-white">{o.name}</option>)}
                    </select>
                  );
                })()}
                <p className="text-xs text-white/50 mt-1.5">
                  {actorGender === 'female' ? 'Female' : 'Male'} voices &middot; multilingual model &middot; click speaker to preview
                </p>
              </div>

              {/* Actor Selection */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-2.5 font-medium">
                  AI Actor — Choose Your Actor
                </label>

                {/* Existing Gallery from S3 */}
                {actorGallery.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-white/50 mb-2">Previously generated actors (click to select)</p>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                      {actorGallery.map((img, i) => (
                        <button
                          key={img.url}
                          type="button"
                          onClick={() => setSelectedActor(img.url)}
                          className={`relative rounded-xl overflow-hidden border-2 transition-all duration-150 aspect-[3/4] active:scale-95 cursor-pointer ${
                            selectedActor === img.url ? 'border-[#e31084] shadow-[0_0_12px_rgba(227,16,132,0.5)]' : 'border-white/10 hover:border-white/20'
                          }`}
                        >
                          <img src={img.url} alt={`Actor ${i+1}`} className="w-full h-full object-cover" />
                          {selectedActor === img.url && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-[#e31084] rounded-full flex items-center justify-center">
                              <Check size={10} className="text-white" strokeWidth={2.5} />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {loadingGallery && (
                  <p className="text-xs text-white/50 mb-3 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin text-[#ff66b2]" /> Loading actor gallery...</p>
                )}

                {/* Upload Custom Actor */}
                <div className="mb-4">
                  <div className="flex items-center gap-3">
                    <label className="flex-1 flex items-center justify-center gap-2 text-sm text-white/70 px-4 py-3 rounded-xl border border-dashed border-white/20 hover:border-[#e31084]/60 hover:text-white bg-white/[0.02] hover:bg-white/[0.05] transition-all cursor-pointer">
                      <Upload size={14} className="text-[#ff66b2]" />
                      <span>Upload your own photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const localPreview = URL.createObjectURL(file);
                          setUploadedActorPreview({ localPreview, serverUrl: null });
                          setSelectedActor(null);

                          const formData = new FormData();
                          formData.append('file', file);
                          try {
                            const res = await apiFetch('/api/saasshorts/actor-upload', {
                              method: 'POST',
                              body: formData,
                            });
                            if (res.ok) {
                              const data = await res.json();
                              if (data.url) {
                                setUploadedActorPreview({ localPreview, serverUrl: data.url });
                                setSelectedActor(data.url);
                              }
                            }
                          } catch (err) { console.error('Upload failed:', err); }
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {uploadedActorPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          if (uploadedActorPreview.serverUrl) {
                            setSelectedActor(uploadedActorPreview.serverUrl);
                          }
                        }}
                        className={`relative w-16 h-20 rounded-xl overflow-hidden border-2 transition-all duration-150 flex-shrink-0 cursor-pointer ${
                          selectedActor === uploadedActorPreview.serverUrl
                            ? 'border-[#e31084] shadow-[0_0_12px_rgba(227,16,132,0.5)]'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <img src={uploadedActorPreview.localPreview} alt="Uploaded" className="w-full h-full object-cover" />
                        {selectedActor === uploadedActorPreview.serverUrl && (
                          <div className="absolute top-1 right-1 w-4 h-4 bg-[#e31084] rounded-full flex items-center justify-center">
                            <Check size={8} className="text-white" strokeWidth={2.5} />
                          </div>
                        )}
                        {!uploadedActorPreview.serverUrl && (
                          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                            <Loader2 size={12} className="animate-spin text-white" />
                          </div>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Generate New Actors */}
                <p className="text-xs text-white/50 mb-2">{actorGallery.length > 0 ? 'Or generate new actors' : 'Or describe your actor'}</p>
                <textarea
                  value={actorDescription}
                  onChange={(e) => { setActorDescription(e.target.value); setActorOptions([]); }}
                  rows={2}
                  className="w-full bg-black/30 hover:bg-black/40 focus:bg-black/50 border border-white/[0.1] focus:border-[#e31084]/70 text-white placeholder:text-white/35 rounded-xl px-4 py-2.5 text-sm transition-all outline-none focus:ring-2 focus:ring-[#e31084]/30 shadow-inner resize-none"
                  placeholder="e.g. A young woman in her late 20s, dark hair, casual outfit..."
                />

                <button
                  type="button"
                  onClick={async () => {
                    if (!falKey || !actorDescription) return;
                    setGeneratingActors(true);
                    setActorOptions([]);
                    setSelectedActor(null);
                    try {
                      const res = await apiFetch('/api/saasshorts/actor-options', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Fal-Key': falKey },
                        body: JSON.stringify({ actor_description: actorDescription, num_options: 3 }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setActorOptions(data.images || []);
                        const galRes = await apiFetch('/api/saasshorts/actor-gallery');
                        if (galRes.ok) {
                          const galData = await galRes.json();
                          setActorGallery(galData.images || []);
                        }
                      }
                    } catch (e) { console.error(e); }
                    finally { setGeneratingActors(false); }
                  }}
                  disabled={generatingActors || !falKey || !actorDescription}
                  className="mt-2.5 w-full py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white/80 hover:text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generatingActors ? (
                    <><Loader2 size={14} className="animate-spin text-white" /> Generating 3 actors...</>
                  ) : (
                    <><User size={14} /> {actorOptions.length > 0 ? 'Regenerate actors' : 'Generate 3 new actors'} <span className="font-mono text-xs text-white/50">~$0.06</span></>
                  )}
                </button>

                {/* Newly Generated Actor Options */}
                {actorOptions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-white/50 mb-2">New actors (select one)</p>
                    <div className="grid grid-cols-3 gap-3">
                      {actorOptions.map((imgUrl, i) => (
                        <button
                          key={imgUrl}
                          type="button"
                          onClick={() => setSelectedActor(imgUrl)}
                          className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-150 aspect-[9/16] active:scale-95 cursor-pointer ${
                            selectedActor === imgUrl ? 'border-[#e31084] shadow-[0_0_14px_rgba(227,16,132,0.5)]' : 'border-white/10 hover:border-white/20'
                          }`}
                        >
                          <img src={imgUrl} alt={`New ${i+1}`} className="w-full h-full object-cover" />
                          {selectedActor === imgUrl && (
                            <div className="absolute top-2 right-2 w-6 h-6 bg-[#e31084] rounded-full flex items-center justify-center">
                              <Check size={12} className="text-white" strokeWidth={2.5} />
                            </div>
                          )}
                          <span className="absolute bottom-1.5 left-1.5 font-mono text-[10px] bg-black/75 text-white/90 px-2 py-0.5 rounded-full">
                            New {i+1}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!selectedActor && (actorOptions.length > 0 || actorGallery.length > 0) && (
                  <p className="text-xs text-amber-300 mt-2 flex items-center gap-1.5"><AlertCircle size={12} /> Select an actor to continue</p>
                )}
              </div>

              {/* Narration Edit */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-white/70 block mb-2 font-medium">
                  Narration Script
                </label>
                <textarea
                  value={editedNarration}
                  onChange={(e) => setEditedNarration(e.target.value)}
                  rows={5}
                  className="w-full bg-black/30 hover:bg-black/40 focus:bg-black/50 border border-white/[0.1] focus:border-[#e31084]/70 text-white rounded-xl p-3.5 font-mono text-xs outline-none focus:ring-2 focus:ring-[#e31084]/30 shadow-inner resize-none leading-relaxed"
                />
                <p className="font-mono text-xs text-white/50 mt-1.5">{editedNarration.length} chars &middot; ~{Math.round(editedNarration.split(' ').length / 2.5)}s speech</p>
              </div>

              {/* Cost Estimate */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Estimated Cost</span>
                  <span className="font-mono text-sm font-semibold text-white">~${videoMode === 'lowcost' ? '0.65' : '2.50'}</span>
                </div>
                <div className="space-y-1.5 text-xs text-white/60">
                  {(videoMode === 'lowcost'
                    ? [
                        ['Flux image', '$0.05'],
                        ['ElevenLabs voice', '$0.10'],
                        ['Hailuo 2.3 img2video', '$0.19'],
                        ['VEED Lipsync', '$0.20'],
                        ['Flux b-roll', '$0.10'],
                      ]
                    : [
                        ['Flux image', '$0.05'],
                        ['ElevenLabs voice', '$0.10'],
                        ['Kling avatar', '$1.69'],
                        ['Kling b-roll', '$0.70'],
                      ]
                  ).map(([item, cost]) => (
                    <div key={item} className="flex items-center justify-between font-mono">
                      <span>{item}</span>
                      <span>{cost}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Missing keys warning */}
              {(!falKey || !elevenLabsKey) && (
                <div className="p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center gap-2 text-sm text-amber-200">
                  <AlertCircle size={15} className="shrink-0 text-amber-400" />
                  <span>{!falKey && 'fal.ai API key missing. '}{!elevenLabsKey && 'ElevenLabs API key missing. '}Set them in Settings.</span>
                </div>
              )}

              <label className="flex items-start gap-3 text-sm text-white/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareToGallery}
                  onChange={(e) => setShareToGallery(e.target.checked)}
                  className="mt-0.5 accent-[#e31084] w-4 h-4 rounded cursor-pointer"
                />
                <span>
                  Share this video in the public gallery
                  <span className="block text-xs text-white/50 mt-0.5">
                    Your video, product name and script will be visible at shortly.app/gallery
                  </span>
                </span>
              </label>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white/80 hover:text-white text-sm font-medium transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!falKey || !elevenLabsKey || !selectedActor || generating}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#e31084] via-[#f03b9f] to-[#ff47a3] hover:brightness-110 active:scale-95 text-white font-medium text-sm shadow-[0_4px_20px_rgba(227,16,132,0.4)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <><Loader2 size={14} className="animate-spin text-white" /> Generating...</>
                ) : !selectedActor ? (
                  <><User size={14} /> Select an actor first</>
                ) : (
                  <><Film size={14} /> Generate video (~${videoMode === 'lowcost' ? '0.65' : '2.00'})</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Generation Progress ──────────────────────── */}
        {step === 3 && (
          <div className="animate-fade space-y-6">
            <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white tracking-tight">Video Generation</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                  genStatus === 'processing' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35' :
                  genStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35' :
                  'bg-red-500/20 text-red-300 border border-red-500/35'
                }`}>
                  {genStatus.toUpperCase()}
                </span>
              </div>

              {/* Progress steps */}
              <div className="border-y border-white/[0.08] divide-y divide-white/[0.08] my-4">
                {[
                  'Generating actor image + voiceover',
                  'Creating talking head video (2-5 min)',
                  'Generating b-roll clips',
                  'Compositing final video',
                ].map((label, i) => {
                  const logStr = genLogs.join(' ').toLowerCase();
                  const stepDone =
                    i === 0 ? logStr.includes('[2/6]') || logStr.includes('[3/6]') :
                    i === 1 ? logStr.includes('[3/6]') && (logStr.includes('[4/6]') || logStr.includes('talking head ready')) :
                    i === 2 ? logStr.includes('[5/6]') || logStr.includes('[6/6]') :
                    genStatus === 'completed';
                  const stepActive =
                    i === 0 ? logStr.includes('[1/6]') && !stepDone :
                    i === 1 ? (logStr.includes('[3/6]') && !logStr.includes('[4/6]')) :
                    i === 2 ? (logStr.includes('[4/6]') && !logStr.includes('[5/6]') && !logStr.includes('[6/6]')) :
                    logStr.includes('[6/6]') && genStatus !== 'completed';

                  return (
                    <div key={i} className="flex items-center gap-3 py-3 text-sm">
                      <span className="font-mono text-xs text-white/40 w-5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                      {stepDone ? (
                        <Check size={14} className="text-emerald-400 shrink-0" strokeWidth={2.5} />
                      ) : stepActive ? (
                        <Loader2 size={14} className="text-[#ff66b2] animate-spin shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
                      )}
                      <span className={`${stepDone ? 'text-white/40' : stepActive ? 'text-white font-medium' : 'text-white/60'}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Logs Terminal */}
              <div className="bg-black/50 backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between">
                  <span className="font-mono text-xs text-white/70 flex items-center gap-2">
                    <Terminal size={12} className="text-[#ff66b2]" /> Generation Logs
                  </span>
                  <button
                    type="button"
                    onClick={() => setLogsExpanded(!logsExpanded)}
                    className="text-white/50 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronDown size={14} className={logsExpanded ? '' : 'rotate-180'} />
                  </button>
                </div>
                {logsExpanded && (
                  <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1 custom-scrollbar">
                    {genLogs.map((log, i) => (
                      <div key={i} className={`${log.toLowerCase().includes('error') ? 'text-red-400' : log.includes('✅') ? 'text-emerald-400' : 'text-white/70'}`}>
                        {log}
                      </div>
                    ))}
                    {genStatus === 'processing' && (
                      <div className="animate-pulse text-[#ff66b2]">_</div>
                    )}
                  </div>
                )}
              </div>

              {/* Retry button when failed */}
              {genStatus === 'failed' && (
                <div className="mt-4 p-4 bg-red-500/15 border border-red-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-400 shrink-0" />
                    <span className="text-sm text-red-200">Generation failed. You can retry or go back to change settings.</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setStep(2); setGenStatus('idle'); setGenerating(false); }}
                      className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-sm font-medium transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ChevronLeft size={14} /> Change voice/settings
                    </button>
                    <button
                      type="button"
                      onClick={handleRetry}
                      disabled={generating}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-95 text-white text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw size={14} /> Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 4: Results ──────────────────────────────────── */}
        {step === 4 && genResult && (
          <div className="animate-fade space-y-6">
            <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                Your Short is Ready
              </h2>

              <div className="mb-4">
                <StarBanner message="Happy with your short?" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Video Player */}
                <div className="aspect-[9/16] max-h-[520px] rounded-2xl border border-white/[0.12] overflow-hidden bg-black shadow-2xl relative">
                  <video
                    src={getApiUrl(genResult.video_url)}
                    controls
                    className="w-full h-full object-contain"
                    autoPlay
                  />
                </div>

                {/* Details */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1">{genResult.script?.title}</h3>
                    <p className="font-mono text-xs text-white/50">{genResult.duration?.toFixed(1)}s &middot; 9:16 vertical</p>
                  </div>

                  {/* Cost breakdown */}
                  {genResult.cost_estimate && (
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                      <div className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium mb-2.5">Cost Breakdown</div>
                      <div className="space-y-1.5 font-mono text-xs text-white/60">
                        {Object.entries(genResult.cost_estimate).filter(([k]) => k !== 'total').map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                            <span>${v}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-white font-medium border-t border-white/[0.08] pt-2 mt-2">
                          <span>Total</span>
                          <span className="text-[#ff66b2]">${genResult.cost_estimate.total}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Caption */}
                  {genResult.script?.caption && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Caption</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(genResult.script.caption, 'caption')}
                          className="text-xs text-white/60 hover:text-[#ff66b2] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copied === 'caption' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          <span>{copied === 'caption' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <p className="text-xs text-white/80 bg-black/30 border border-white/[0.08] rounded-xl p-3 leading-relaxed">{genResult.script.caption}</p>
                    </div>
                  )}

                  {/* Hashtags */}
                  {genResult.script?.hashtags && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Hashtags</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(genResult.script.hashtags.join(' '), 'hashtags')}
                          className="text-xs text-white/60 hover:text-[#ff66b2] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copied === 'hashtags' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          <span>{copied === 'hashtags' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {genResult.script.hashtags.map((tag, i) => (
                          <span key={i} className="text-xs font-mono text-white/60 bg-white/[0.06] border border-white/10 px-2.5 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <a
                      href={getApiUrl(genResult.video_url)}
                      download
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-95 text-white font-medium text-sm shadow-[0_4px_20px_rgba(227,16,132,0.35)] transition-all flex items-center gap-2 cursor-pointer no-underline"
                    >
                      <Download size={14} /> Download
                    </a>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-sm font-medium transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw size={14} /> New video
                    </button>
                  </div>

                  {/* Publish to Social Media */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3.5 mt-3">
                    <h3 className="text-xs font-mono uppercase tracking-wider text-white font-medium">Publish to Social Media</h3>

                    {!uploadPostKey && !ytDirectConnected ? (
                      <p className="text-xs text-white/50">
                        Connect YouTube in Settings or configure your Upload-Post API key to enable social publishing.
                      </p>
                    ) : (
                      <>
                        {/* Platform toggles */}
                        <SegmentedControl
                          multi
                          size="sm"
                          options={[
                            ...(uploadPostKey ? [{ value: 'tiktok', label: 'TikTok' }, { value: 'instagram', label: 'Instagram' }] : []),
                            { value: 'youtube', label: ytDirectConnected ? 'YouTube (Direct)' : 'YouTube' },
                          ]}
                          value={Object.keys(publishPlatforms).filter((k) => publishPlatforms[k])}
                          onChange={(arr) => setPublishPlatforms({
                            tiktok: arr.includes('tiktok'),
                            instagram: arr.includes('instagram'),
                            youtube: arr.includes('youtube'),
                          })}
                        />

                        {publishPlatforms.tiktok && (
                          <p className="text-xs text-white/50 leading-relaxed">
                            TikTok arrives as a <b className="text-white">draft</b> and you'll get a notification in the app — finishing it there lets you add trending sounds and hashtags.
                          </p>
                        )}

                        {/* Schedule toggle */}
                        <div className="flex items-center gap-3 pt-1">
                          <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isScheduling}
                              onChange={(e) => setIsScheduling(e.target.checked)}
                              className="w-3.5 h-3.5 rounded accent-[#e31084] cursor-pointer"
                            />
                            <Calendar size={13} className="text-[#ff66b2]" />
                            <span>Schedule</span>
                          </label>
                          {isScheduling && (
                            <input
                              type="datetime-local"
                              value={scheduleDate}
                              onChange={(e) => setScheduleDate(e.target.value)}
                              className="bg-black/30 border border-white/[0.1] focus:border-[#e31084]/70 text-white text-xs py-1.5 px-2.5 rounded-lg outline-none"
                            />
                          )}
                        </div>

                        {/* Publish button */}
                        <button
                          type="button"
                          onClick={async () => {
                            const selected = Object.keys(publishPlatforms).filter(k => publishPlatforms[k]);
                            if (selected.length === 0) { setPublishResult({ ok: false, msg: 'Select at least one platform' }); return; }
                            if (isScheduling && !scheduleDate) { setPublishResult({ ok: false, msg: 'Select a date' }); return; }

                            setPublishing(true);
                            setPublishResult(null);
                            try {
                              const payload = {
                                job_id: jobId,
                                api_key: uploadPostKey,
                                user_id: uploadUserId,
                                platforms: selected,
                                title: genResult.script?.title,
                                description: genResult.script?.caption || genResult.script?.full_narration,
                              };
                              if (isScheduling && scheduleDate) {
                                payload.scheduled_date = new Date(scheduleDate).toISOString();
                                payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                              }
                              const res = await apiFetch('/api/saasshorts/post', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                              });
                              if (!res.ok) {
                                const err = await res.json().catch(() => ({ detail: 'Failed' }));
                                throw new Error(err.detail || 'Failed');
                              }
                              const resData = await res.json().catch(() => null);
                              setPublishResult({
                                ok: true,
                                msg: isScheduling
                                  ? 'Scheduled!'
                                  : resData?.url
                                  ? `Published! Watch at ${resData.url}`
                                  : 'Published!',
                                url: resData?.url,
                              });
                            } catch (e) {
                              setPublishResult({ ok: false, msg: e.message });
                            } finally {
                              setPublishing(false);
                            }
                          }}
                          disabled={publishing}
                          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-95 text-white font-medium text-sm shadow-[0_4px_16px_rgba(227,16,132,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                        >
                          {publishing ? (
                            <><Loader2 size={14} className="animate-spin text-white" /> {isScheduling ? 'Scheduling...' : 'Publishing...'}</>
                          ) : (
                            <><Share2 size={14} /> {isScheduling ? 'Schedule post' : 'Publish now'}</>
                          )}
                        </button>

                        {publishResult && (
                          <p className={`text-xs ${publishResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                            {publishResult.msg}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
