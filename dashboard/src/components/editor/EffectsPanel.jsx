import React from 'react';
import { Ban, Maximize2, Minimize2, Target } from 'lucide-react';
import { useEditor } from './editorStore';
import { LOOK_PRESETS, MOTION_PRESETS } from './effectsPresets';

const MOTION_ICONS = {
  none: Ban,
  zoomIn: Maximize2,
  zoomOut: Minimize2,
  punch: Target,
};

export default function EffectsPanel() {
  const { state, dispatch } = useEditor();
  const { tracks, ui } = state;

  const selectedClip = ui.selectedClipId
    ? tracks.flatMap((t) => t.clips || []).find((c) => c.id === ui.selectedClipId)
    : null;
  const isCompatible = selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'image');

  const currentMotionType = selectedClip?.props?.motion?.type || 'none';

  const applyLook = (preset) => {
    if (!isCompatible) return;
    dispatch({
      type: 'UPDATE_CLIP',
      payload: {
        clipId: selectedClip.id,
        patch: {
          brightness: preset.props.brightness,
          contrast: preset.props.contrast,
          saturation: preset.props.saturation,
          props: {
            look: { ...preset.props.look },
          },
        },
      },
    });
  };

  const applyMotion = (preset) => {
    if (!isCompatible) return;
    dispatch({
      type: 'UPDATE_CLIP',
      payload: {
        clipId: selectedClip.id,
        patch: {
          props: {
            motion: { type: preset.type, amount: preset.amount },
          },
        },
      },
    });
  };

  return (
    <div className="flex-1 p-3 flex flex-col bg-zinc-900 text-zinc-100 overflow-hidden select-none">
      <h2 className="text-sm font-semibold text-zinc-100 mb-1">Effects</h2>
      {!isCompatible && (
        <p className="text-[11px] text-zinc-500 mb-2">Select a video or image clip</p>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-0.5">
        {/* Looks Section */}
        <div>
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
            Color Looks
          </span>
          <div className="grid grid-cols-2 gap-2">
            {LOOK_PRESETS.map((preset) => {
              const isSelected =
                isCompatible &&
                selectedClip.props?.look?.grayscale === preset.props.look.grayscale &&
                selectedClip.props?.look?.sepia === preset.props.look.sepia &&
                selectedClip.props?.look?.hueRotate === preset.props.look.hueRotate &&
                (preset.id === 'none' ? selectedClip.props?.brightness === 100 && selectedClip.props?.contrast === 100 && selectedClip.props?.saturation === 100 : true);

              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!isCompatible}
                  onClick={() => applyLook(preset)}
                  className={`p-2 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                    !isCompatible ? 'opacity-40 cursor-not-allowed bg-zinc-800/40 border-zinc-800' :
                    isSelected ? 'ring-2 ring-[#e31084] border-[#e31084] bg-[#e31084]/20' :
                    'border-zinc-800 bg-zinc-850 hover:border-zinc-700 hover:bg-zinc-800'
                  }`}
                >
                  <div
                    style={{ filter: preset.filter }}
                    className="w-full h-10 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 shadow-2xs"
                  />
                  <span className="text-xs font-medium text-zinc-300 truncate w-full">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Motion Section */}
        <div>
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
            Camera Motion
          </span>
          <div className="grid grid-cols-2 gap-2">
            {MOTION_PRESETS.map((preset) => {
              const Icon = MOTION_ICONS[preset.type] || Ban;
              const isSelected = isCompatible && currentMotionType === preset.type;

              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!isCompatible}
                  onClick={() => applyMotion(preset)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                    !isCompatible ? 'opacity-40 cursor-not-allowed bg-zinc-800/40 border-zinc-800' :
                    isSelected ? 'ring-2 ring-[#e31084] border-[#e31084] bg-[#e31084]/20' :
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
    </div>
  );
}

