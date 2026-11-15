import React, { useState, useMemo } from 'react';
import { Copy, Check, ExternalLink, Sparkles, AlertCircle, Film, Scissors, Loader2 } from 'lucide-react';
import Modal from './ui/Modal';
import { apiFetch } from '../lib/api';

/**
 * Parses raw text from ChatGPT / Claude / Gemini client-side for live preview.
 */
function parseClientClips(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.trim();

  // 1. Try markdown code block or JSON array
  let jsonString = null;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    jsonString = fenceMatch[1];
  } else {
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      jsonString = text.slice(firstBracket, lastBracket + 1);
    }
  }

  if (jsonString) {
    try {
      // Clean trailing commas
      const clean = jsonString.replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(clean);
      const items = Array.isArray(parsed) ? parsed : (parsed.shorts || parsed.clips || []);
      if (Array.isArray(items) && items.length > 0) {
        return items.map((c, i) => ({
          start: typeof c.start === 'number' ? c.start : (parseFloat(c.start) || 0),
          end: typeof c.end === 'number' ? c.end : (parseFloat(c.end) || 0),
          viral_hook_text: c.viral_hook_text || c.hook || `Moment #${i + 1}`,
          title: c.video_title_for_youtube_short || c.title || `Clip #${i + 1}`,
          why: c.why || '',
        })).filter(c => c.end > c.start);
      }
    } catch (_) {
      // Ignore JSON error and fall through to regex
    }
  }

  // 2. Fallback regex parser for plain text: [00:15 - 00:45] or 01:10 - 01:45
  const timestampRegex = /(?:\[|\()?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:\]|\))?/gi;
  const matches = [...text.matchAll(timestampRegex)];
  if (matches.length > 0) {
    return matches.map((m, i) => {
      const parseSec = (ts) => {
        const parts = ts.split(':').map(Number);
        return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
      };
      const st = parseSec(m[1]);
      const et = parseSec(m[2]);
      return {
        start: st,
        end: et,
        viral_hook_text: `Clip #${i + 1}`,
        title: `Clip #${i + 1} (${m[1]} - ${m[2]})`,
        why: 'Parsed from text timestamp',
      };
    }).filter(c => c.end > c.start);
  }

  return [];
}

function formatSec(s) {
  if (s == null) return '00:00';
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}

export default function ManualPromptModal({ isOpen, onClose, jobId, promptPackage, onSubmitted }) {
  const [copied, setCopied] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const promptText = promptPackage?.prompt_text || '';
  const wordCount = promptPackage?.word_count || 0;
  const estTokens = promptPackage?.estimated_tokens || 0;
  const durationFmt = promptPackage?.video_duration_formatted || '00:00';

  const detectedClips = useMemo(() => parseClientClips(userInput), [userInput]);

  const handleCopy = async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = promptText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userInput.trim()) {
      setError('Please paste your AI agent response.');
      return;
    }
    if (detectedClips.length === 0) {
      setError('Could not detect any valid clips with timestamps. Please check the format and try again.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await apiFetch(`/api/jobs/${jobId}/manual-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_input: userInput }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to submit clips');
      }

      const data = await res.json();
      if (onSubmitted) onSubmitted(data);
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || 'Error submitting clips. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="ZERO-COST · BYO AI AGENT"
      title="Generate Viral Moments"
      size="lg"
    >
      <div className="space-y-5 text-sm text-zinc-300">
        <p className="text-zinc-400 text-xs sm:text-[13px] leading-relaxed">
          Shortly has finished transcribing your video locally. Copy the engineered prompt below into{' '}
          <strong className="text-zinc-200">ChatGPT, Claude, or Gemini</strong> to pick viral moments for free, then paste the response back to cut your clips.
        </p>

        {/* Step 1: Copy Prompt & Quick Links */}
        <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Sparkles size={14} /> Step 1: Copy Prompt
            </span>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700/60 font-mono">
                {durationFmt}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700/60 font-mono">
                {wordCount} words
              </span>
              <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700/60 font-mono">
                ~{estTokens} tokens
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-xs sm:text-sm transition-all shadow-md cursor-pointer ${copied
                ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/25 hover:scale-[1.01]'
                }`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied Prompt to Clipboard!' : 'Copy Full Prompt & Transcript'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPromptPreview(!showPromptPreview)}
              className="text-xs text-zinc-400 hover:text-white px-3 py-2.5 rounded-xl border border-zinc-800 hover:bg-zinc-800 transition-colors"
            >
              {showPromptPreview ? 'Hide Prompt' : 'Preview Prompt'}
            </button>
          </div>

          {/* Quick jump external links */}
          <div className="flex items-center gap-2 pt-1 text-xs text-zinc-400">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500">Quick Launch:</span>
            <a
              href="https://chatgpt.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-300 hover:text-white px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/50 no-underline"
            >
              <span>ChatGPT</span>
              <ExternalLink size={11} />
            </a>
            <a
              href="https://claude.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-300 hover:text-white px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/50 no-underline"
            >
              <span>Claude</span>
              <ExternalLink size={11} />
            </a>
            <a
              href="https://gemini.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-300 hover:text-white px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/50 no-underline"
            >
              <span>Gemini Web</span>
              <ExternalLink size={11} />
            </a>
          </div>

          {showPromptPreview && (
            <div className="mt-2 p-3 rounded-lg bg-black/60 border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-48 overflow-y-auto whitespace-pre-wrap select-all custom-scrollbar">
              {promptText}
            </div>
          )}
        </div>

        {/* Step 2: Paste Response */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="ai-paste-area" className="text-xs font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <Scissors size={14} /> Step 2: Paste AI Response Here
              </label>
              {detectedClips.length > 0 && (
                <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check size={12} /> {detectedClips.length} {detectedClips.length === 1 ? 'Clip' : 'Clips'} Detected
                </span>
              )}
            </div>

            <textarea
              id="ai-paste-area"
              rows={5}
              value={userInput}
              onChange={(e) => {
                setUserInput(e.target.value);
                if (error) setError('');
              }}
              placeholder={`Paste the JSON or timestamps from ChatGPT/Claude here...\nExample:\n[\n  {"start": 15.0, "end": 45.0, "viral_hook_text": "Mind blown 🤯", "video_title_for_youtube_short": "Title"}\n]`}
              className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-hidden focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all custom-scrollbar resize-y"
            />
          </div>

          {/* Detected Clips Live Preview Cards */}
          {detectedClips.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Live Preview of Detected Cuts
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {detectedClips.map((clip, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-start gap-2.5 text-xs"
                  >
                    <div className="w-7 h-7 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-mono font-bold shrink-0 text-[11px]">
                      #{i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-zinc-400 text-[11px]">
                          {formatSec(clip.start)} – {formatSec(clip.end)}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {Math.round(clip.end - clip.start)}s
                        </span>
                      </div>
                      <div className="font-semibold text-zinc-200 truncate mt-0.5">
                        {clip.viral_hook_text}
                      </div>
                      {clip.title && clip.title !== clip.viral_hook_text && (
                        <div className="text-[11px] text-zinc-400 truncate">
                          {clip.title}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || detectedClips.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Processing Cuts...</span>
                </>
              ) : (
                <>
                  <Film size={16} />
                  <span>
                    Generate & Cut {detectedClips.length > 0 ? `${detectedClips.length} ` : ''}Clips
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

