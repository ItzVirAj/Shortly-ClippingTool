import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Image, Loader2, Send, Check, Download, ArrowRight, ArrowLeft, Sparkles, Video, Type, X, Plus, MessageSquare, FileText, Youtube, AlertCircle, Settings, LayoutDashboard, Share2, RefreshCw } from 'lucide-react';
import { getApiUrl } from '../config';
import { apiFetch, QuotaError, openQuotaWall } from '../lib/api';
import StepIndicator from './ui/StepIndicator';
import SegmentedControl from './ui/SegmentedControl';
import YouTubeChannelDashboard from './YouTubeChannelDashboard';

const STEPS = ['Input', 'Titles', 'Generate', 'Description', 'Publish'];

// The server's reason ("This video is 240 minutes long...") instead of raw JSON.
function errorDetail(text) {
  try {
    const d = JSON.parse(text).detail;
    if (typeof d === 'string') return d;
  } catch { /* not JSON */ }
  return text;
}

function DragDropZone({ label, accept, onFile, file, onClear, icon }) {
  const Icon = icon;
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  if (file) {
    return (
      <div className="relative border border-white/[0.12] rounded-2xl p-3 bg-white/[0.04] backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-3">
          {file.type?.startsWith('image/') ? (
            <img src={URL.createObjectURL(file)} className="w-12 h-12 rounded-xl object-cover border border-white/10" alt="" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
              <Icon size={18} className="text-[#ff66b2]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{file.name}</p>
            <p className="font-mono text-xs text-white/50 mt-0.5">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
        isDragging
          ? 'border-[#e31084]/60 bg-gradient-to-br from-[#e31084]/15 via-white/[0.04] to-transparent ring-1 ring-[#e31084]/40 shadow-[0_0_20px_rgba(227,16,132,0.15)]'
          : 'border-white/15 hover:border-[#e31084]/50 bg-white/[0.02] hover:bg-white/[0.05]'
      }`}
    >
      <Icon size={20} className="mx-auto text-white/50 mb-2 group-hover:text-[#ff66b2] transition-colors" />
      <p className="text-sm font-medium text-white">{label}</p>
      <p className="text-xs text-white/45 mt-1">Drop or click to upload</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
    </div>
  );
}

export default function ThumbnailStudio({
  geminiApiKey,
  uploadPostKey,
  uploadUserId,
  userProfiles = [],
  onConnectSocials = null,
  managed = false,
  onCreateClips = null,
  isThumbnailMakerOnly = false,
}) {
  // View toggle: 'creator' (Creation Suite) vs 'dashboard' (YouTube Channel Dashboard)
  const [activeView, setActiveView] = useState('creator');

  // Managed (hosted plan): Gemini runs server-side via the bearer token, no BYOK key.
  // Only send X-Gemini-Key for self-host BYOK. apiFetch attaches the bearer token.
  const keyHeader = geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {};
  const needsKey = !geminiApiKey && !managed;

  // Connected YouTube profile detection
  const currentProfile = userProfiles.find((p) => p.username === uploadUserId) || userProfiles[0];
  const isYouTubeConnected = currentProfile?.connected?.includes('youtube') || false;
  const ytAccountName = currentProfile?.youtube?.display_name || currentProfile?.youtube?.username || (isYouTubeConnected ? 'Connected Channel' : null);

  // Step management
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState(null); // 'video' or 'manual'

  // Step 1 state
  const [videoFile, setVideoFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Step 2 state
  const [sessionId, setSessionId] = useState(null);
  const [titles, setTitles] = useState([]);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isRefining, setIsRefining] = useState(false);
  const [recommended, setRecommended] = useState([]); // [{index, reason}]
  const [thumbnailTexts, setThumbnailTexts] = useState([]); // hook text paired with each title

  // Step 3 state
  const [faceImage, setFaceImage] = useState(null);
  const [bgImage, setBgImage] = useState(null);
  const [extraPrompt, setExtraPrompt] = useState('');
  const [thumbnailCount, setThumbnailCount] = useState(3);
  const [burnText, setBurnText] = useState(true); // crisp PIL text vs model-rendered text
  const [frames, setFrames] = useState(null); // null = not fetched yet
  const [framesLoading, setFramesLoading] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedThumbnails, setGeneratedThumbnails] = useState([]);

  // Description state
  const [description, setDescription] = useState('');
  const [isDescribing, setIsDescribing] = useState(false);

  // Step 4 (Publish) state
  const [selectedThumbnail, setSelectedThumbnail] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [ytDirectConnected, setYtDirectConnected] = useState(false);

  useEffect(() => {
    apiFetch('/api/youtube/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.connected) setYtDirectConnected(true);
      })
      .catch(() => {});
  }, []);

  // Background preprocessing state
  const [preprocessSessionId, setPreprocessSessionId] = useState(null);
  const [isPreprocessing, setIsPreprocessing] = useState(false);

  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- Background Pre-upload (starts Whisper immediately) ---
  const handlePreUpload = async (file) => {
    setPreprocessSessionId(null);
    setIsPreprocessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch('/api/thumbnail/upload', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setPreprocessSessionId(data.session_id);
        console.log(`🎙️ Background Whisper started: ${data.session_id}`);
      }
    } catch (e) {
      console.error('Pre-upload failed:', e);
    } finally {
      setIsPreprocessing(false);
    }
  };

  // --- Step 1: Analyze Video ---
  const handleAnalyze = async () => {
    if (needsKey) return alert('Please set your Gemini API key in Settings first.');
    setIsAnalyzing(true);

    try {
      const formData = new FormData();

      if (preprocessSessionId) {
        // Use pre-uploaded session (Whisper already running/done in background)
        formData.append('session_id', preprocessSessionId);
      } else if (videoFile) {
        formData.append('file', videoFile);
      } else {
        return alert('Please upload a video file.');
      }

      const res = await apiFetch('/api/thumbnail/analyze', {
        method: 'POST',
        headers: keyHeader,
        body: formData
      });

      if (!res.ok) throw new Error(errorDetail(await res.text()));

      const data = await res.json();
      setSessionId(data.session_id);
      setTitles(data.titles || []);
      setThumbnailTexts(data.thumbnail_texts || []);
      setRecommended(data.recommended || []);
      setChatHistory([{
        role: 'assistant',
        content: `Here are 10 viral title suggestions based on your video. Titles marked TOP PICK are my top picks. Click one to select it, or tell me how to refine them.`
      }]);
      setStep(1);
    } catch (e) {
      if (e instanceof QuotaError) { openQuotaWall(e, 'thumbnails'); return; }
      alert(`Analysis failed: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualMode = () => {
    setMode('manual');
    setStep(1);
  };

  // --- Step 2: Title Selection / Refinement ---
  const handleSelectTitle = (title) => {
    setSelectedTitle(title);
  };

  const handleConfirmTitle = () => {
    if (mode === 'manual' && manualTitle) {
      setSelectedTitle(manualTitle);
      // Create session for manual mode
      const newSessionId = sessionId || crypto.randomUUID();
      setSessionId(newSessionId);
      apiFetch('/api/thumbnail/titles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...keyHeader
        },
        body: JSON.stringify({ title: manualTitle, session_id: newSessionId })
      }).catch(() => { });
    }
    if (selectedTitle || (mode === 'manual' && manualTitle)) {
      setStep(2);
    }
  };

  const handleRefine = async () => {
    if (!chatInput.trim() || !sessionId) return;
    setIsRefining(true);

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);

    try {
      const res = await apiFetch('/api/thumbnail/titles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...keyHeader
        },
        body: JSON.stringify({ session_id: sessionId, message: userMsg })
      });

      if (!res.ok) throw new Error(errorDetail(await res.text()));
      const data = await res.json();
      setTitles(data.titles || []);
      setThumbnailTexts(data.thumbnail_texts || []);
      setRecommended([]);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `Here are refined titles based on your feedback. Click one to select it.`
      }]);
      setTimeout(scrollToBottom, 100);
    } catch (e) {
      if (e instanceof QuotaError) openQuotaWall(e, 'thumbnails');
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `Failed to refine: ${e instanceof QuotaError ? 'no minutes left' : e.message}`
      }]);
    } finally {
      setIsRefining(false);
    }
  };

  // --- Step 3: Generate Thumbnails ---
  const handleGenerate = async () => {
    if (needsKey) return alert('Please set your Gemini API key in Settings first.');
    const finalTitle = selectedTitle || manualTitle;
    if (!finalTitle) return alert('Please select or enter a title first.');

    setIsGenerating(true);
    setGeneratedThumbnails([]);

    try {
      const formData = new FormData();
      formData.append('session_id', sessionId || 'manual');
      formData.append('title', finalTitle);
      formData.append('extra_prompt', extraPrompt);
      formData.append('count', thumbnailCount);
      formData.append('burn_text', burnText ? 'true' : 'false');
      if (selectedFrame && !faceImage) formData.append('frame', selectedFrame);
      if (faceImage) formData.append('face', faceImage);
      if (bgImage) formData.append('background', bgImage);

      const res = await apiFetch('/api/thumbnail/generate', {
        method: 'POST',
        headers: keyHeader,
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (!data.thumbnails || data.thumbnails.length === 0) {
        throw new Error('No thumbnails were generated. Your Gemini API key may not have access to image generation.');
      }
      setGeneratedThumbnails(data.thumbnails);
    } catch (e) {
      if (e instanceof QuotaError) { openQuotaWall(e, 'thumbnails'); return; }
      alert(`Generation failed: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Frames with a big, sharp face from the uploaded video: one click replaces
  // the face upload nobody makes. Fetched once when the generate step opens.
  // `frames` is deliberately not a dependency: setting it inside the effect
  // would re-run it and the cleanup would discard the response in flight.
  const framesRequestedFor = useRef(null);
  useEffect(() => {
    if (step !== 2 || mode !== 'video' || !sessionId) return;
    if (framesRequestedFor.current === sessionId) return;
    framesRequestedFor.current = sessionId;
    setFrames([]);
    setFramesLoading(true);
    apiFetch(`/api/thumbnail/frames/${sessionId}`)
      .then(res => (res.ok ? res.json() : { frames: [] }))
      .then(data => setFrames(data.frames || []))
      .catch(() => setFrames([]))
      .finally(() => setFramesLoading(false));
  }, [step, mode, sessionId]);

  const handleDownload = async (url) => {
    try {
      const response = await fetch(getApiUrl(url));
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = url.split('/').pop() || 'thumbnail.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: open in new tab if fetch fails
      window.open(getApiUrl(url), '_blank');
    }
  };

  // --- Description Generation ---
  const handleGenerateDescription = async () => {
    if (needsKey) return alert('Please set your Gemini API key in Settings first.');
    const finalTitle = selectedTitle || manualTitle;
    if (!finalTitle) return alert('Please select a title first.');
    if (!sessionId) return alert('No session available.');

    setIsDescribing(true);
    try {
      const res = await apiFetch('/api/thumbnail/describe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...keyHeader
        },
        body: JSON.stringify({ session_id: sessionId, title: finalTitle })
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const data = await res.json();
      setDescription(data.description || '');
    } catch (e) {
      alert(`Description generation failed: ${e.message}`);
    } finally {
      setIsDescribing(false);
    }
  };

  // --- Publish to YouTube ---
  const handlePublish = async () => {
    if (!managed && !uploadPostKey && !ytDirectConnected) {
      return alert('Please connect your YouTube channel directly or configure your Upload-Post key in Settings first.');
    }
    const finalTitle = selectedTitle || manualTitle;
    if (!finalTitle) return alert('No title selected.');
    if (!selectedThumbnail) return alert('Please select a thumbnail first.');
    if (!description) return alert('Please generate or write a description first.');

    setIsPublishing(true);
    setPublishResult(null);
    try {
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('title', finalTitle);
      formData.append('description', description);
      formData.append('thumbnail_url', selectedThumbnail);
      formData.append('api_key', uploadPostKey);
      formData.append('user_id', uploadUserId);

      // Submit the publish job — returns immediately with a publish_id
      const res = await apiFetch('/api/thumbnail/publish', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const { publish_id } = await res.json();

      // Poll for status every 2 seconds (upload can take minutes for large videos)
      await new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const statusRes = await apiFetch(`/api/thumbnail/publish/status/${publish_id}`);
            if (!statusRes.ok) { clearInterval(interval); reject(new Error('Status check failed')); return; }
            const statusData = await statusRes.json();

            if (statusData.status === 'done') {
              clearInterval(interval);
              setPublishResult({ success: true, data: statusData.result });
              resolve();
            } else if (statusData.status === 'failed') {
              clearInterval(interval);
              reject(new Error(statusData.error || 'Upload failed'));
            }
            // 'uploading' → keep polling
          } catch (e) {
            clearInterval(interval);
            reject(e);
          }
        }, 2000);
      });

    } catch (e) {
      setPublishResult({ success: false, error: e.message });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setMode(null);
    setVideoFile(null);
    setSessionId(null);
    setTitles([]);
    setSelectedTitle('');
    setManualTitle('');
    setChatInput('');
    setChatHistory([]);
    setFaceImage(null);
    setFrames(null);
    framesRequestedFor.current = null;
    setSelectedFrame(null);
    setThumbnailTexts([]);
    setBgImage(null);
    setExtraPrompt('');
    setGeneratedThumbnails([]);
    setDescription('');
    setIsDescribing(false);
    setSelectedThumbnail(null);
    setIsPublishing(false);
    setPublishResult(null);
    setPreprocessSessionId(null);
    setIsPreprocessing(false);
    setRecommended([]);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8 animate-fade">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top View Switcher (Apple Floating Segmented Control) */}
        {!isThumbnailMakerOnly && (
          <div className="flex items-center justify-center mb-2">
            <div className="inline-flex items-center p-1 rounded-2xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
              <button
                type="button"
                onClick={() => setActiveView('creator')}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  activeView === 'creator'
                    ? 'bg-gradient-to-r from-[#e31084] to-[#f03b9f] text-white shadow-[0_2px_12px_rgba(227,16,132,0.45)]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Video size={14} />
                <span>Creator Suite</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('dashboard')}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  activeView === 'dashboard'
                    ? 'bg-[#ff0000] hover:bg-[#e60000] text-white shadow-[0_2px_12px_rgba(255,0,0,0.35)]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <LayoutDashboard size={14} />
                <span>Channel Dashboard</span>
              </button>
            </div>
          </div>
        )}

        {/* View Switch Dispatch */}
        {!isThumbnailMakerOnly && activeView === 'dashboard' ? (
          <YouTubeChannelDashboard
            uploadPostKey={uploadPostKey}
            uploadUserId={uploadUserId}
            userProfiles={userProfiles}
            onConnect={onConnectSocials}
            managed={managed}
            onSwitchToCreator={({ mode: newMode, title: newTitle }) => {
              setActiveView('creator');
              if (newTitle) {
                setManualTitle(newTitle);
                setMode('manual');
                setStep(1);
              } else if (newMode) {
                setMode(newMode);
                setStep(0);
              }
            }}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.1] border-t-white/[0.18] text-[11px] font-mono font-medium text-white/80 uppercase tracking-wider mb-2.5 backdrop-blur-xl shadow-xs">
                  {isThumbnailMakerOnly ? (
                    <Sparkles size={12} className="text-[#ff66b2]" />
                  ) : (
                    <Youtube size={12} className="text-[#ff3355]" />
                  )}
                  <span>{isThumbnailMakerOnly ? '06b · AI Thumbnail Maker' : '06 · YouTube Creator Suite'}</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                  {isThumbnailMakerOnly ? 'AI Thumbnail Maker' : 'YouTube Studio'}
                </h1>
                <p className="text-sm text-white/60 mt-1.5 leading-relaxed max-w-2xl">
                  {isThumbnailMakerOnly
                    ? 'Create high-CTR YouTube thumbnails with AI face blending, custom background rendering, and bold viral text hooks'
                    : 'Generate viral titles, AI thumbnails, video descriptions, and publish directly to YouTube'}
                </p>
              </div>
              {step > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white/90 hover:text-white text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus size={13} /> New Project
                </button>
              )}
            </div>

            {/* Progress Stepper Dock */}
            <div className="mb-8 p-3 sm:p-3.5 rounded-2xl bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
              <StepIndicator steps={STEPS} current={step} />
            </div>

            {/* Gemini API Key Warning */}
            {needsKey && (
              <div className="mb-6 p-4 sm:p-5 rounded-3xl bg-amber-500/10 backdrop-blur-xl border border-amber-500/25 flex items-start gap-3.5 shadow-sm">
                <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-200">Gemini API Key Required</p>
                  <p className="text-xs text-amber-100/75 mt-1 leading-relaxed">{isThumbnailMakerOnly ? 'AI Thumbnail Maker' : 'YouTube Studio'} requires a Google Gemini API key to function. Please configure it in the <strong>Settings</strong> tab before using this feature. Gemini's free tier includes 1,500 requests per day.</p>
                </div>
              </div>
            )}

            {/* ===== STEP 0: Input Mode Selection ===== */}
            {step === 0 && (
              <div className={`grid md:grid-cols-2 gap-6 ${needsKey ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                {/* Mode A: Video Analysis */}
                <div className="p-7 rounded-3xl bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.16] shadow-[0_12px_40px_rgba(0,0,0,0.4)] hover:border-white/[0.18] transition-all space-y-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3.5 mb-1">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#e31084]/20 to-white/[0.06] border border-[#e31084]/30 flex items-center justify-center text-[#ff66b2] shadow-sm">
                        <Video size={20} />
                      </div>
                      <div>
                        <p className="text-xs font-mono uppercase tracking-wider text-white font-semibold">Option A · Analyze Video</p>
                        <p className="text-xs text-white/50 mt-0.5">AI suggests viral titles and hooks from your video file</p>
                      </div>
                    </div>

                    <DragDropZone
                      label="Upload video file"
                      accept="video/*"
                      onFile={(f) => { setVideoFile(f); setMode('video'); handlePreUpload(f); }}
                      file={videoFile}
                      onClear={() => { setVideoFile(null); setPreprocessSessionId(null); }}
                      icon={Video}
                    />

                    {isPreprocessing && (
                      <div className="flex items-center gap-2.5 text-xs text-white/80 bg-white/[0.04] rounded-2xl px-3.5 py-2.5 border border-white/[0.08]">
                        <Loader2 size={14} className="animate-spin text-[#ff66b2]" />
                        <span>Pre-processing video (Whisper transcription starting)...</span>
                      </div>
                    )}
                    {preprocessSessionId && !isPreprocessing && (
                      <div className="flex items-center gap-2.5 text-xs text-emerald-300 bg-emerald-500/15 rounded-2xl px-3.5 py-2.5 border border-emerald-500/30">
                        <Check size={14} strokeWidth={2.5} />
                        <span>Video uploaded — transcription running in background</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !videoFile}
                    className="w-full py-3.5 px-6 rounded-2xl font-semibold text-sm text-white bg-gradient-to-r from-[#e31084] via-[#f03b9f] to-[#ff47a3] hover:brightness-110 active:scale-[0.98] shadow-[0_4px_20px_rgba(227,16,132,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-white" />
                        <span>Analyzing video...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} className="text-white" />
                        <span>Analyze &amp; Get Titles</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Mode B: Manual Title */}
                <div className="p-7 rounded-3xl bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.16] shadow-[0_12px_40px_rgba(0,0,0,0.4)] hover:border-white/[0.18] transition-all space-y-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3.5 mb-1">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#e31084]/20 to-white/[0.06] border border-[#e31084]/30 flex items-center justify-center text-[#ff66b2] shadow-sm">
                        <Type size={20} />
                      </div>
                      <div>
                        <p className="text-xs font-mono uppercase tracking-wider text-white font-semibold">{isThumbnailMakerOnly ? 'Quick Mode · Direct' : 'Option B · Write Your Own'}</p>
                        <p className="text-xs text-white/50 mt-0.5">{isThumbnailMakerOnly ? 'Enter topic or title to generate thumbnails directly' : 'Skip video upload, enter your title directly'}</p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <input
                        type="text"
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        placeholder="Enter your YouTube title or video topic..."
                        className="w-full bg-black/40 hover:bg-black/50 focus:bg-black/60 border border-white/[0.1] focus:border-[#e31084] text-white placeholder:text-white/30 rounded-2xl px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-[#e31084]/25 shadow-inner"
                        maxLength={70}
                      />
                      <p className="font-mono text-xs text-white/40 text-right">{manualTitle.length} / 70</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleManualMode}
                    disabled={!manualTitle.trim()}
                    className="w-full py-3.5 px-6 rounded-2xl font-semibold text-sm text-white bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-[0.98] shadow-[0_4px_20px_rgba(227,16,132,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>{isThumbnailMakerOnly ? 'Create Thumbnails' : 'Use This Title'}</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

        {/* ===== STEP 1: Title Selection ===== */}
        {step === 1 && (
          <div className="grid md:grid-cols-5 gap-6">
            {/* Left: Chat / Controls */}
            <div className="md:col-span-2 flex flex-col gap-4">
              {mode === 'manual' ? (
                <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4">
                  <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Your Title</p>
                  <input
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="w-full bg-black/35 hover:bg-black/45 focus:bg-black/55 border border-white/[0.1] focus:border-[#e31084]/70 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#e31084]/30 shadow-inner"
                    maxLength={70}
                  />
                  <p className="font-mono text-xs text-white/40 text-right">{manualTitle.length} / 70</p>
                  <button
                    type="button"
                    onClick={handleConfirmTitle}
                    disabled={!manualTitle.trim()}
                    className="w-full py-3 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-[0.98] shadow-[0_4px_20px_rgba(227,16,132,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Continue to Thumbnails</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="p-5 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] flex flex-col h-[500px]">
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.08]">
                    <MessageSquare size={14} className="text-[#ff66b2]" />
                    <span className="text-xs font-mono uppercase tracking-wider text-white font-medium">Title Refinement Chat</span>
                  </div>

                  {/* Chat messages */}
                  <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar mb-3 pr-1">
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-r from-[#e31084]/25 to-white/[0.06] border border-[#e31084]/35 text-white'
                            : 'bg-black/35 border border-white/[0.08] text-white/80'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat input */}
                  <div className="flex gap-2 pt-1 border-t border-white/[0.08]">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleRefine()}
                      placeholder="Make them more clickbait..."
                      className="w-full bg-black/35 border border-white/[0.1] focus:border-[#e31084]/70 text-white placeholder:text-white/35 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#e31084]/30"
                      disabled={isRefining}
                    />
                    <button
                      type="button"
                      onClick={handleRefine}
                      disabled={isRefining || !chatInput.trim()}
                      className="px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.1] text-white transition-all active:scale-95 disabled:opacity-40 cursor-pointer flex items-center justify-center"
                    >
                      {isRefining ? <Loader2 size={14} className="animate-spin text-[#ff66b2]" /> : <Send size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {mode !== 'manual' && selectedTitle && (
                <button
                  type="button"
                  onClick={handleConfirmTitle}
                  className="w-full py-3 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-[0.98] shadow-[0_4px_20px_rgba(227,16,132,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Use Selected Title</span>
                  <ArrowRight size={16} />
                </button>
              )}
            </div>

            {/* Right: Title Cards */}
            <div className="md:col-span-3 space-y-3">
              {selectedTitle && (
                <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center gap-2.5 text-sm text-emerald-300">
                  <Check size={16} className="text-emerald-400 shrink-0" strokeWidth={2.5} />
                  <span className="font-semibold truncate">Selected: {selectedTitle}</span>
                </div>
              )}

              {titles.length > 0 && (
                <div className="space-y-2.5">
                  {titles.map((title, i) => {
                    const rec = recommended.find(r => r.index === i);
                    const recRank = recommended.findIndex(r => r.index === i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectTitle(title)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 text-sm cursor-pointer active:scale-[0.99] ${
                          selectedTitle === title
                            ? 'bg-gradient-to-r from-[#e31084]/15 via-white/[0.05] to-transparent border-[#e31084]/60 shadow-[0_2px_14px_rgba(227,16,132,0.2)] ring-1 ring-[#e31084]/40 text-white'
                            : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.16] text-white/85 hover:text-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`w-6 h-6 rounded-full border flex items-center justify-center font-mono text-[10px] font-semibold shrink-0 mt-0.5 ${
                            selectedTitle === title
                              ? 'bg-[#e31084] border-[#e31084] text-white shadow-[0_0_8px_rgba(227,16,132,0.8)]'
                              : rec
                              ? 'border-[#ff7dc2]/50 text-[#ff7dc2] bg-[#e31084]/10'
                              : 'border-white/15 text-white/50'
                          }`}>
                            {selectedTitle === title ? <Check size={11} strokeWidth={2.5} /> : rec ? '★' : i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="leading-relaxed font-medium">{title}</span>
                              {rec && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#e31084]/20 text-[#ff7dc2] border border-[#e31084]/35 shrink-0">
                                  {recRank === 0 ? 'TOP PICK' : '2ND PICK'}
                                </span>
                              )}
                            </div>
                            {rec && (
                              <p className="text-xs text-white/60 mt-1.5 leading-relaxed">{rec.reason}</p>
                            )}
                            {thumbnailTexts[i] && (
                              <p className="font-mono text-xs text-white/40 mt-1">thumbnail: {thumbnailTexts[i]}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {isRefining && (
                <div className="flex items-center justify-center py-8 text-white/60">
                  <Loader2 size={18} className="animate-spin mr-2 text-[#ff66b2]" />
                  <span className="text-sm">Refining titles...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== STEP 2: Thumbnail Generation ===== */}
        {step === 2 && (
          <div className="grid md:grid-cols-5 gap-6">
            {/* Left: Controls */}
            <div className="md:col-span-2 space-y-4">
              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4">
                <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Title</p>
                <div className="p-3 bg-black/35 border border-white/[0.08] rounded-xl text-sm text-white font-medium">
                  {selectedTitle || manualTitle}
                </div>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-white/60 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={12} /> Change title
                </button>
              </div>

              {mode === 'video' && frames !== null && (
                <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-3">
                  <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Your Face From The Video</p>
                  {frames.length === 0 ? (
                    <p className="text-xs text-white/50">{framesLoading ? 'Looking for sharp frames with a face...' : 'No usable face found in the video.'}</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        {frames.map((f) => (
                          <button
                            key={f.url}
                            type="button"
                            onClick={() => setSelectedFrame(selectedFrame === f.url ? null : f.url)}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                              selectedFrame === f.url ? 'border-[#e31084] shadow-[0_0_12px_rgba(227,16,132,0.5)]' : 'border-transparent hover:border-white/20'
                            }`}
                          >
                            <img src={getApiUrl(f.url)} alt="" className="w-full aspect-video object-cover" />
                            <span className="absolute bottom-1 right-1 font-mono text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                              {Math.floor(f.time / 60)}:{String(Math.floor(f.time % 60)).padStart(2, '0')}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-white/50">
                        {selectedFrame ? 'This frame is the person reference.' : 'Pick a frame so the thumbnail shows you.'}
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4">
                <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Face Image · Optional</p>
                <DragDropZone
                  label="Upload face / person photo"
                  accept="image/*"
                  onFile={setFaceImage}
                  file={faceImage}
                  onClear={() => setFaceImage(null)}
                  icon={Upload}
                />
              </div>

              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4">
                <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Background · Optional</p>
                <DragDropZone
                  label="Upload background image"
                  accept="image/*"
                  onFile={setBgImage}
                  file={bgImage}
                  onClear={() => setBgImage(null)}
                  icon={Image}
                />
              </div>

              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4">
                <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Instructions · Optional</p>
                <textarea
                  value={extraPrompt}
                  onChange={(e) => setExtraPrompt(e.target.value)}
                  placeholder="e.g. Use red and black colors, dramatic lighting, include money emojis..."
                  className="w-full bg-black/35 hover:bg-black/45 focus:bg-black/55 border border-white/[0.1] focus:border-[#e31084]/70 text-white placeholder:text-white/35 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#e31084]/30 shadow-inner resize-none h-20"
                />
              </div>

              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4">
                <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Text on Thumbnail</p>
                <SegmentedControl
                  options={[{ value: true, label: 'Crisp' }, { value: false, label: 'AI painted' }]}
                  value={burnText}
                  onChange={setBurnText}
                  size="sm"
                />
              </div>

              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4">
                <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Count</p>
                <SegmentedControl
                  options={[1, 2, 3, 4].map(n => ({ value: n, label: String(n) }))}
                  value={thumbnailCount}
                  onChange={setThumbnailCount}
                  size="sm"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-3.5 px-6 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-[#e31084] via-[#f03b9f] to-[#ff47a3] hover:brightness-110 active:scale-[0.98] shadow-[0_4px_20px_rgba(227,16,132,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-white" />
                    <span>Generating thumbnails...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Generate Thumbnails</span>
                  </>
                )}
              </button>

            </div>

            {/* Right: Generated Thumbnails */}
            <div className="md:col-span-3">
              {generatedThumbnails.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-white/70">Generated Thumbnails — click to select for publishing</p>
                  <div className="grid gap-4">
                    {generatedThumbnails.map((thumb, i) => {
                      const url = thumb.url;
                      return (
                        <div
                          key={url}
                          onClick={() => setSelectedThumbnail(url)}
                          className={`rounded-3xl overflow-hidden group relative cursor-pointer transition-all duration-200 border bg-white/[0.04] backdrop-blur-xl ${
                            selectedThumbnail === url
                              ? 'border-[#e31084] ring-2 ring-[#e31084]/40 shadow-[0_4px_24px_rgba(227,16,132,0.3)]'
                              : 'border-white/[0.08] hover:border-white/[0.18]'
                          }`}
                        >
                          <img
                            src={getApiUrl(url)}
                            alt={`Thumbnail ${i + 1}`}
                            className="w-full aspect-video object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-all flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDownload(url); }}
                              className="px-4 py-2 rounded-xl bg-white/[0.15] hover:bg-white/[0.25] backdrop-blur-md border border-white/20 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg active:scale-95 cursor-pointer"
                            >
                              <Download size={14} /> Download
                            </button>
                          </div>
                          <div className="p-3.5 flex items-center justify-between gap-3 bg-white/[0.02]">
                            <div className="min-w-0">
                              <span className="text-xs font-medium text-white flex items-center gap-2">
                                Thumbnail {i + 1}{thumb.text ? ` · "${thumb.text}"` : ''}
                                {selectedThumbnail === url && (
                                  <span className="text-[#ff66b2] flex items-center gap-1 font-semibold"><Check size={12} strokeWidth={2.5} /> Selected</span>
                                )}
                              </span>
                              {thumb.why && <p className="text-xs text-white/60 mt-0.5 truncate">{thumb.why}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDownload(url); }}
                              className="text-xs text-white/70 hover:text-white transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Download size={12} /> Save
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Phone preview */}
                  <div className="p-5 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] space-y-3">
                    <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Phone Preview</p>
                    <div className="space-y-3">
                      {generatedThumbnails.map((thumb) => (
                        <div key={thumb.url} className="flex gap-3 items-start">
                          <img src={getApiUrl(thumb.url)} alt="" className="w-[168px] h-[94px] object-cover rounded-xl border border-white/10 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white leading-snug line-clamp-2">{selectedTitle || manualTitle}</p>
                            <p className="text-xs text-white/45 mt-1">Your channel · 1.2K views · 2 hours ago</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="flex-1 py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-[#ff66b2]" />
                          <span>Regenerating...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          <span>Regenerate</span>
                        </>
                      )}
                    </button>

                    {selectedThumbnail && (
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-95 text-white font-medium text-sm shadow-[0_4px_16px_rgba(227,16,132,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Next: Description</span>
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ) : isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center text-white/60 space-y-4 min-h-[400px] p-8 rounded-3xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl">
                  <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-[#e31084] animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">Generating thumbnails...</p>
                    <p className="text-xs text-white/50 mt-1">This may take a minute per thumbnail</p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-white/60 space-y-4 min-h-[400px] p-8 rounded-3xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl">
                  <div className="w-20 h-20 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
                    <Image size={28} className="text-white/40" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">Your thumbnails will appear here</p>
                    <p className="text-xs text-white/50 mt-1">Configure options and click Generate</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== STEP 3: YouTube Description ===== */}
        {step === 3 && (
          <div className="grid md:grid-cols-5 gap-6">
            {/* Left: Context & Controls */}
            <div className="md:col-span-2 space-y-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs text-white/60 hover:text-white transition-colors flex items-center gap-1 mb-2 cursor-pointer"
              >
                <ArrowLeft size={12} /> Back to Generate
              </button>

              {/* Selected Thumbnail Preview */}
              {selectedThumbnail && (
                <div className="rounded-2xl border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl overflow-hidden shadow-sm">
                  <img
                    src={getApiUrl(selectedThumbnail)}
                    alt="Selected thumbnail"
                    className="w-full aspect-video object-cover"
                  />
                  <div className="p-3">
                    <span className="text-xs text-[#ff66b2] font-medium flex items-center gap-1.5"><Check size={12} strokeWidth={2.5} /> Selected Thumbnail</span>
                  </div>
                </div>
              )}

              {/* Title */}
              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-3">
                <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Title</p>
                <div className="p-3 bg-black/35 border border-white/[0.08] rounded-xl text-sm text-white font-medium">
                  {selectedTitle || manualTitle}
                </div>
              </div>

              {/* Generate Description Button */}
              {mode === 'video' && (
                <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono uppercase tracking-wider text-white font-medium flex items-center gap-2">
                      <Sparkles size={14} className="text-[#ff66b2]" />
                      AI Description
                    </p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-white/10 text-white/70 border border-white/10">WITH CHAPTERS</span>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Generate a YouTube description with chapter timestamps from your video transcript.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateDescription}
                    disabled={isDescribing}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-xs font-medium transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isDescribing ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-[#ff66b2]" />
                        <span>Generating description...</span>
                      </>
                    ) : (
                      <>
                        <FileText size={14} />
                        <span>{description ? 'Regenerate Description' : 'Generate Description'}</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Next: Publish */}
              {description && (
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="w-full py-3.5 px-6 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-[0.98] shadow-[0_4px_20px_rgba(227,16,132,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Next: Publish</span>
                  <ArrowRight size={16} />
                </button>
              )}
            </div>

            {/* Right: Editable Description */}
            <div className="md:col-span-3 space-y-4">
              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium flex items-center gap-2">
                    <FileText size={14} className="text-[#ff66b2]" />
                    YouTube Description
                  </p>
                  <span className="font-mono text-xs text-white/50">{description.length} / 5000</span>
                </div>

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={mode === 'video'
                    ? "Click 'Generate Description' to auto-generate with chapters, or write your own..."
                    : "Write your YouTube video description here..."
                  }
                  className="w-full bg-black/35 hover:bg-black/45 focus:bg-black/55 border border-white/[0.1] focus:border-[#e31084]/70 text-white placeholder:text-white/35 rounded-xl p-4 text-sm resize-none flex-1 min-h-[500px] font-mono custom-scrollbar outline-none focus:ring-2 focus:ring-[#e31084]/30 leading-relaxed"
                  maxLength={5000}
                />
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 4: Publish to YouTube ===== */}
        {step === 4 && (
          <div className="grid md:grid-cols-5 gap-6">
            {/* Left: Summary & Publish */}
            <div className="md:col-span-2 space-y-4">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-xs text-white/60 hover:text-white transition-colors flex items-center gap-1 mb-2 cursor-pointer"
              >
                <ArrowLeft size={12} /> Back to Description
              </button>

              {/* Selected Thumbnail Preview */}
              {selectedThumbnail && (
                <div className="rounded-2xl border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl overflow-hidden shadow-sm">
                  <img
                    src={getApiUrl(selectedThumbnail)}
                    alt="Selected thumbnail"
                    className="w-full aspect-video object-cover"
                  />
                  <div className="p-3">
                    <span className="text-xs text-[#ff66b2] font-medium flex items-center gap-1.5"><Check size={12} strokeWidth={2.5} /> Selected Thumbnail</span>
                  </div>
                </div>
              )}

              {/* Editable Title */}
              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-3">
                <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium">Title</p>
                <input
                  type="text"
                  value={selectedTitle || manualTitle}
                  onChange={(e) => selectedTitle ? setSelectedTitle(e.target.value) : setManualTitle(e.target.value)}
                  className="w-full bg-black/35 hover:bg-black/45 focus:bg-black/55 border border-white/[0.1] focus:border-[#e31084]/70 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#e31084]/30"
                  maxLength={100}
                />
              </div>

              {/* Publish Button */}
              {(!managed && (!uploadPostKey || !uploadUserId)) ? (
                <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-3">
                  <div className="flex items-center gap-2 text-amber-300">
                    <AlertCircle size={16} />
                    <span className="text-sm font-semibold">Upload-Post Not Configured</span>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    To publish directly to YouTube, configure your Upload-Post API key and connect a profile in Settings.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="w-full py-3.5 px-6 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-[#e31084] via-[#f03b9f] to-[#ff47a3] hover:brightness-110 active:scale-[0.98] shadow-[0_4px_20px_rgba(227,16,132,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 size={16} className="animate-spin text-white" />
                      <span>Publishing to YouTube...</span>
                    </>
                  ) : (
                    <>
                      <Youtube size={16} />
                      <span>Publish to YouTube</span>
                    </>
                  )}
                </button>
              )}

              {/* Polling status */}
              {isPublishing && (
                <div className="font-mono text-xs text-white/60 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-[#ff66b2]" />
                  <span>UPLOADING — POLLING STATUS EVERY 2S</span>
                </div>
              )}

              {/* Publish Result */}
              {publishResult && (
                <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
                  {publishResult.success ? (
                    <div className="space-y-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">PUBLISHED</span>
                      <p className="text-sm font-semibold text-white">Published successfully!</p>
                      <p className="text-xs text-white/60">Your video is being uploaded to YouTube asynchronously.</p>
                      {onCreateClips && sessionId && (
                        <button
                          type="button"
                          onClick={() => onCreateClips(sessionId)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] text-white text-xs font-medium shadow-md transition-all active:scale-95 flex items-center gap-1.5 mt-1 cursor-pointer"
                          title="Send this video and its transcript to the clip generator"
                        >
                          <Video size={14} />
                          <span>Create clips from this video</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red-500/20 text-red-300 border border-red-500/35">FAILED</span>
                      <p className="text-sm font-semibold text-red-300">Publish failed</p>
                      <p className="text-xs text-white/60">{publishResult.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Description Preview */}
            <div className="md:col-span-3 space-y-4">
              <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] space-y-4 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono uppercase tracking-wider text-white/70 font-medium flex items-center gap-2">
                    <FileText size={14} className="text-[#ff66b2]" />
                    YouTube Description
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-xs text-white/60 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <ArrowLeft size={10} /> Edit
                  </button>
                </div>

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-black/35 hover:bg-black/45 focus:bg-black/55 border border-white/[0.1] focus:border-[#e31084]/70 text-white placeholder:text-white/35 rounded-xl p-4 text-sm resize-none flex-1 min-h-[500px] font-mono custom-scrollbar outline-none focus:ring-2 focus:ring-[#e31084]/30 leading-relaxed"
                  maxLength={5000}
                />
              </div>
            </div>
          </div>
        )}
      </>
    )}
  </div>
</div>
  );
}
