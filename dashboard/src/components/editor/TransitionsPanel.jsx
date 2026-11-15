import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Maximize2, Sparkles, Ban } from 'lucide-react';
import { useEditor } from './editorStore';
import { TRANSITION_PRESETS } from './effectsPresets';
import NumberField from './inspector/NumberField';

const TRANSITION_ICONS = {
  none: Ban,
  fade: Sparkles,
  slideLeft: ArrowLeft,
  slideRight: ArrowRight,
  slideUp: ArrowUp,
  zoom: Maximize2,
};

export default function TransitionsPanel() {
  const { state, dispatch } = useEditor();
  const { tracks, ui } = state;

  const [applySide, setApplySide] = useState('in'); // 'in' | 'out' | 'both'
  const [duration, setDuration] = useState(0.5);

  const selectedClip = ui.selectedClipId
    ? tracks.flatMap((t) => t.clips || []).find((c) => c.id === ui.selectedClipId)
    : null;
  const isCompatible = selectedClip && selectedClip.type !== 'audio';

  const inType = selectedClip?.props?.transitionIn?.type || 'none';
  const outType = selectedClip?.props?.transitionOut?.type || 'none';

  const applyTransition = (preset) => {
    if (!isCompatible) return;
    const patchProps = {};
    if (applySide === 'in' || applySide === 'both') {
      patchProps.transitionIn = { type: preset.id, duration };
    }
    if (applySide === 'out' || applySide === 'both') {
      patchProps.transitionOut = { type: preset.id, duration };
    }

    dispatch({
      type: 'UPDATE_CLIP',
      payload: {
        clipId: selectedClip.id,
        patch: { props: patchProps },
      },
    });
  };

  return (
    <div className="flex-1 p-3 flex flex-col bg-zinc-900 text-zinc-100 overflow-hidden select-none">
      <h2 className="text-sm font-semibold text-zinc-100 mb-1">Transitions</h2>
      {!isCompatible ? (
        <p className="text-[11px] text-zinc-500 mb-2">Select a video, image, text, or shape clip</p>
      ) : (
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 mb-2">
          <span>In: <strong className="text-[#e31084] capitalize">{inType}</strong></span>
          <span>•</span>
          <span>Out: <strong className="text-[#e31084] capitalize">{outType}</strong></span>
        </div>
      )}

      {/* Segmented Control */}
      <div className="flex p-0.5 mb-2.5 rounded-lg bg-zinc-800 border border-zinc-700/60">
        {[
          { id: 'in', label: 'In' },
          { id: 'out', label: 'Out' },
          { id: 'both', label: 'Both' },
        ].map((side) => (
          <button
            key={side.id}
            type="button"
            onClick={() => setApplySide(side.id)}
            className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
              applySide === side.id ? 'bg-zinc-700 text-zinc-100 shadow-2xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {side.label}
          </button>
        ))}
      </div>

      {/* Duration Control */}
      <div className="mb-3">
        <NumberField
          label="Transition Duration"
          value={duration}
          min={0.1}
          max={2}
          step={0.1}
          unit="s"
          disabled={!isCompatible}
          onChange={(v) => setDuration(v)}
        />
      </div>

      {/* Preset Cards Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
          Styles
        </span>
        <div className="grid grid-cols-2 gap-2">
          {TRANSITION_PRESETS.map((preset) => {
            const Icon = TRANSITION_ICONS[preset.id] || Ban;
            const isMatch =
              isCompatible &&
              (applySide === 'in' ? inType === preset.id :
               applySide === 'out' ? outType === preset.id :
               inType === preset.id && outType === preset.id);

            return (
              <button
                key={preset.id}
                type="button"
                disabled={!isCompatible}
                onClick={() => applyTransition(preset)}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                  !isCompatible ? 'opacity-40 cursor-not-allowed bg-zinc-800/40 border-zinc-800' :
                  isMatch ? 'ring-2 ring-[#e31084] border-[#e31084] bg-[#e31084]/20' :
                  'border-zinc-800 bg-zinc-850 hover:border-zinc-700 hover:bg-zinc-800'
                }`}
              >
                <div className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 shrink-0">
                  <Icon size={14} />
                </div>
                <span className="text-xs font-medium text-zinc-300 truncate">
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

