import React, { useState, useEffect, useRef } from 'react';
import { Flame, Loader2, RefreshCw, Check } from 'lucide-react';
import { TEXT_PRESETS } from './textPresets';
import { addTextClip } from './editorUtils';
import { suggestHooks, isTranscribeDone, isTranscribeError, isTranscribeInProgress } from './editorApi';

export default function HookIdeasSection({ isValidSelection, selectedClip, runTranscribe, state, dispatch }) {
  const [hookStatus, setHookStatus] = useState('idle'); // idle | loading | done | error
  const [hooksList, setHooksList] = useState([]);
  const [hookError, setHookError] = useState('');
  const [addedHookIdx, setAddedHookIdx] = useState(null);
  const hookPollRef = useRef(null);

  const clearHookPoll = () => {
    if (hookPollRef.current) {
      clearInterval(hookPollRef.current);
      hookPollRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearHookPoll();
  }, []);

  const handleSuggestHooks = () => {
    if (!isValidSelection) return;
    setHookStatus('loading');
    setHookError('');
    clearHookPoll();

    const callHooks = () => {
      suggestHooks(selectedClip.mediaId)
        .then((res) => {
          setHooksList(res.hooks || []);
          setHookStatus('done');
        })
        .catch((e) => {
          setHookStatus('error');
          setHookError(e.message || 'Failed to generate hooks');
        });
    };

    suggestHooks(selectedClip.mediaId)
      .then((res) => {
        setHooksList(res.hooks || []);
        setHookStatus('done');
      })
      .catch(() => {
        hookPollRef.current = runTranscribe(
          selectedClip.mediaId,
          () => callHooks(),
          (err) => {
            setHookStatus('error');
            setHookError(err);
          }
        );
      });
  };

  const handleAddHook = (hookText, index) => {
    const pillPreset = TEXT_PRESETS.find((p) => p.id === 'preset_pill') || TEXT_PRESETS[0];
    addTextClip(pillPreset, state, dispatch, hookText);
    setAddedHookIdx(index);
    setTimeout(() => setAddedHookIdx(null), 1500);
  };

  return (
    <div className={`p-3 rounded-xl border border-zinc-800 bg-zinc-850/60 space-y-3 ${!isValidSelection ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>Hook Ideas</span>
        </div>
        {hookStatus === 'loading' && <Loader2 size={12} className="animate-spin text-emerald-400" />}
      </div>

      <button
        type="button"
        disabled={!isValidSelection || hookStatus === 'loading'}
        onClick={handleSuggestHooks}
        className="w-full py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg font-medium text-xs shadow-2xs transition-colors flex items-center justify-center gap-1.5"
      >
        {hookStatus === 'loading' ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            Thinking...
          </>
        ) : (
          'Suggest Hooks'
        )}
      </button>

      {hookStatus === 'error' && (
        <div className="p-2 rounded bg-red-950/40 border border-red-900/60 text-red-400 text-[11px] space-y-1">
          <p>{hookError}</p>
          <button type="button" onClick={handleSuggestHooks} className="flex items-center gap-1 text-[10px] text-red-400 font-medium underline">
            <RefreshCw size={10} /> Retry
          </button>
        </div>
      )}

      {hooksList.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Click to add to timeline</p>
          {hooksList.map((hk, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleAddHook(hk, i)}
              className="w-full text-left p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-[#e31084]/60 hover:bg-[#e31084]/10 transition-all text-[11px] text-zinc-200 flex items-center justify-between group cursor-pointer"
            >
              <span className="line-clamp-2 pr-1">{hk}</span>
              {addedHookIdx === i ? (
                <Check size={12} className="text-[#e31084] shrink-0" />
              ) : (
                <span className="text-[9px] text-[#e31084] opacity-0 group-hover:opacity-100 font-semibold shrink-0">+ Add</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

