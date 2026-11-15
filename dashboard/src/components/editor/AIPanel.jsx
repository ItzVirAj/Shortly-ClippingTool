import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, MessageSquare, Loader2, AlertCircle } from 'lucide-react';
import { useEditor } from './editorStore';
import { TEXT_PRESETS } from './textPresets';
import { buildCaptionClips } from './captionUtils';
import { startTranscribe, getTranscribeStatus, isTranscribeDone, isTranscribeError, isTranscribeInProgress } from './editorApi';
import NumberField from './inspector/NumberField';
import HookIdeasSection from './HookIdeasSection';

export default function AIPanel() {
  const { state, dispatch } = useEditor();
  const { tracks, ui } = state;
  const { selectedClipId } = ui;

  // Selected clip
  const selectedClip = (tracks || []).flatMap((t) => t.clips || []).find((c) => c.id === selectedClipId);
  const isValidSelection = selectedClip && ['video', 'audio'].includes(selectedClip.type) && Boolean(selectedClip.mediaId);

  // Auto captions state
  const [wordsPerCap, setWordsPerCap] = useState(3);
  const [capStyle, setCapStyle] = useState('preset_caption');
  const [capPos, setCapPos] = useState('Bottom');
  const [capStatus, setCapStatus] = useState('idle'); // idle | transcribing | building | done | error
  const [capMessage, setCapMessage] = useState('');
  const capPollRef = useRef(null);

  const clearCapPoll = () => {
    if (capPollRef.current) {
      clearInterval(capPollRef.current);
      capPollRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearCapPoll();
  }, []);

  // Run transcribe flow
  const runTranscribe = (mediaId, onWordsReady, onError) => {
    startTranscribe(mediaId)
      .then((res) => {
        if (res.cached && res.words) {
          onWordsReady(res.words);
          return;
        }
        const jobId = res.jobId;
        const timer = setInterval(() => {
          getTranscribeStatus(jobId)
            .then((statusRes) => {
              const st = statusRes.status;
              if (isTranscribeDone(st)) {
                clearInterval(timer);
                onWordsReady(statusRes.words || []);
              } else if (isTranscribeError(st)) {
                clearInterval(timer);
                onError(statusRes.error || 'Transcription failed');
              } else if (isTranscribeInProgress(st)) {
                // In progress ('queued' | 'running' | 'processing')
              }
            })
            .catch((e) => {
              clearInterval(timer);
              onError(e.message || 'Status check failed');
            });
        }, 1000);
        return timer;
      })
      .catch((e) => {
        onError(e.message || 'Failed to start transcription');
      });
  };

  // Generate captions handler
  const handleGenerateCaptions = () => {
    if (!isValidSelection) return;
    setCapStatus('transcribing');
    setCapMessage('Transcribing audio...');
    clearCapPoll();

    const onDone = (words) => {
      setCapStatus('building');
      setCapMessage('Building captions...');
      const chosenPreset = TEXT_PRESETS.find((p) => p.id === capStyle) || TEXT_PRESETS[4];
      const clips = buildCaptionClips(words, selectedClip, {
        wordsPerCaption: wordsPerCap,
        preset: chosenPreset,
        position: capPos,
      });

      if (!clips.length) {
        setCapStatus('done');
        setCapMessage('No speech found in this range');
        return;
      }

      dispatch({
        type: 'ADD_TEXT_TRACK_WITH_CLIPS',
        payload: { name: 'Captions', clips },
      });

      setCapStatus('done');
      setCapMessage(`Added ${clips.length} captions`);
    };

    const onError = (err) => {
      setCapStatus('error');
      setCapMessage(err);
      clearCapPoll();
    };

    capPollRef.current = runTranscribe(selectedClip.mediaId, onDone, onError);
  };

  // Cancel captions
  const handleCancelCaptions = () => {
    clearCapPoll();
    setCapStatus('idle');
    setCapMessage('');
  };

  return (
    <div className="flex-1 p-3 flex flex-col bg-zinc-900 text-zinc-100 overflow-y-auto custom-scrollbar text-xs select-none space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#e31084]" />
          AI Generate
        </h2>
        {!isValidSelection && (
          <p className="text-[11px] text-zinc-500 mt-1 italic">Select a video or audio clip on the timeline to use AI features</p>
        )}
      </div>

      {/* Section A: Auto Captions */}
      <div className={`p-3 rounded-xl border border-zinc-800 bg-zinc-850/60 space-y-3 ${!isValidSelection ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
          <MessageSquare className="w-3.5 h-3.5 text-[#e31084]" />
          <span>Auto Captions</span>
        </div>

        <div className="space-y-2">
          <NumberField
            label="Words per caption"
            value={wordsPerCap}
            min={1}
            max={6}
            step={1}
            onChange={(v) => setWordsPerCap(v)}
          />

          <div>
            <label className="text-[11px] font-medium text-zinc-400 block mb-0.5">Style</label>
            <select
              value={capStyle}
              onChange={(e) => setCapStyle(e.target.value)}
              className="w-full text-xs h-7 px-2 rounded border border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-emerald-500"
            >
              <option value="preset_caption">Caption (Yellow/Bold)</option>
              <option value="preset_subtitle">Subtitle (Clean/Shadow)</option>
              <option value="preset_body">Body (Dark Background)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-400 block mb-0.5">Position</label>
            <select
              value={capPos}
              onChange={(e) => setCapPos(e.target.value)}
              className="w-full text-xs h-7 px-2 rounded border border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-emerald-500"
            >
              <option value="Bottom">Bottom</option>
              <option value="Center">Center</option>
              <option value="Top">Top</option>
            </select>
          </div>

          {['transcribing', 'building'].includes(capStatus) ? (
            <div className="pt-1 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] text-[#e31084] font-medium">
                <Loader2 size={12} className="animate-spin text-[#e31084]" />
                {capMessage}
              </span>
              <button type="button" onClick={handleCancelCaptions} className="text-[11px] text-red-400 hover:underline">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!isValidSelection}
              onClick={handleGenerateCaptions}
              className="btn-brand-accent w-full py-1.5 px-3 text-white rounded-lg font-medium text-xs shadow-md shadow-[#e31084]/20 transition-all cursor-pointer disabled:opacity-40"
              style={{ backgroundColor: '#e31084' }}
            >
              Generate Captions
            </button>
          )}

          {capStatus === 'done' && (
            <p className="text-[11px] text-[#e31084] font-medium pt-0.5">{capMessage}</p>
          )}
          {capStatus === 'error' && (
            <p className="text-[11px] text-red-400 pt-0.5 flex items-center gap-1">
              <AlertCircle size={11} /> {capMessage}
            </p>
          )}
        </div>
      </div>

      {/* Section B: Hook Ideas */}
      <HookIdeasSection
        isValidSelection={isValidSelection}
        selectedClip={selectedClip}
        runTranscribe={runTranscribe}
        state={state}
        dispatch={dispatch}
      />
    </div>
  );
}
