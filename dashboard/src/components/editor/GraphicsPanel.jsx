import React from 'react';
import { Square, Circle, Minus, Activity, Plus } from 'lucide-react';
import { useEditor } from './editorStore';
import { SHAPE_PRESETS } from './effectsPresets';
import { addShapeClip } from './editorUtils';

const SHAPE_ICONS = {
  rect: Square,
  circle: Circle,
  line: Minus,
  progress: Activity,
};

export default function GraphicsPanel() {
  const { state, dispatch } = useEditor();

  return (
    <div className="flex-1 p-3 flex flex-col bg-zinc-900 text-zinc-100 overflow-hidden select-none">
      <h2 className="text-sm font-semibold text-zinc-100 mb-2">Graphics</h2>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-0.5">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
          Shapes & Overlays
        </span>

        {SHAPE_PRESETS.map((preset) => {
          const Icon = SHAPE_ICONS[preset.id] || Square;

          return (
            <div
              key={preset.id}
              onClick={() => addShapeClip(preset, state, dispatch)}
              className="p-3 rounded-xl border border-zinc-800 bg-zinc-800/50 hover:border-[#e31084]/60 hover:bg-[#e31084]/10 cursor-pointer transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800/80 flex items-center justify-center text-zinc-200 shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                  <Icon size={18} />
                </div>
                <div>
                  <span className="text-xs font-medium text-zinc-200 group-hover:text-[#e31084] block">
                    {preset.label}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Overlay • 4.0s
                  </span>
                </div>
              </div>

              <button
                type="button"
                aria-label={`Add ${preset.label}`}
                className="p-1 rounded bg-zinc-800 text-zinc-400 shadow-2xs group-hover:bg-[#e31084] group-hover:text-white transition-colors"
              >
                <Plus size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

