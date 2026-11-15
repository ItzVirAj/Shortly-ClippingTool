import React from 'react';
import { Type, Plus } from 'lucide-react';
import { useEditor } from './editorStore';
import { TEXT_PRESETS } from './textPresets';
import { addTextClip } from './editorUtils';

export default function TextPanel() {
  const { state, dispatch } = useEditor();

  const handleAddBlank = () => {
    const bodyPreset = TEXT_PRESETS.find((p) => p.id === 'preset_body') || TEXT_PRESETS[0];
    addTextClip(bodyPreset, state, dispatch, 'Type here');
  };

  return (
    <div className="flex-1 p-3 flex flex-col bg-zinc-900 text-zinc-100 overflow-hidden select-none">
      <h2 className="text-sm font-semibold text-zinc-100 mb-2">Text</h2>

      {/* Add Blank Text Button */}
      <button
        type="button"
        onClick={handleAddBlank}
        className="btn-brand-accent w-full py-2 px-3 mb-3 text-xs font-semibold text-white rounded-lg shadow-md shadow-[#e31084]/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        style={{ backgroundColor: '#e31084' }}
      >
        <Plus size={14} />
        <span>Add blank text</span>
      </button>

      {/* Preset Cards List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-0.5">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
          Presets
        </span>

        {TEXT_PRESETS.map((preset) => {
          const s = preset.props.style || {};
          const bg = preset.props.bg || {};
          const stroke = preset.props.stroke || {};
          const shadow = preset.props.shadow || {};

          return (
            <div
              key={preset.id}
              onClick={() => addTextClip(preset, state, dispatch)}
              className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-800/50 hover:border-[#e31084]/60 hover:bg-[#e31084]/10 cursor-pointer transition-all group relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-zinc-300 group-hover:text-[#e31084]">
                  {preset.label}
                </span>
                <button
                  type="button"
                  aria-label={`Add ${preset.label}`}
                  className="p-1 rounded bg-zinc-800 text-zinc-400 shadow-2xs group-hover:bg-[#e31084] group-hover:text-white transition-colors"
                >
                  <Plus size={12} />
                </button>
              </div>

              {/* Live Preview Sample Box */}
              <div className="h-14 bg-zinc-950 border border-zinc-800/80 rounded-lg flex items-center justify-center p-2 overflow-hidden">
                <div
                  style={{
                    fontFamily: s.fontFamily,
                    fontSize: Math.min(22, s.fontSize * 0.28),
                    fontWeight: s.fontWeight,
                    fontStyle: s.italic ? 'italic' : 'normal',
                    color: s.color,
                    textAlign: 'center',
                    textTransform: s.uppercase ? 'uppercase' : 'none',
                    letterSpacing: `${(s.letterSpacing || 0) * 0.28}px`,
                    backgroundColor: bg.enabled ? bg.color : 'transparent',
                    padding: bg.enabled ? `${(bg.padding || 0) * 0.2}px` : '0px',
                    borderRadius: bg.enabled ? `${(bg.radius || 0) * 0.2}px` : '0px',
                    WebkitTextStroke: stroke.enabled && stroke.width ? `${Math.max(1, stroke.width * 0.25)}px ${stroke.color}` : 'none',
                    textShadow: shadow.enabled ? `${shadow.offsetX * 0.25}px ${shadow.offsetY * 0.25}px ${shadow.blur * 0.25}px ${shadow.color}` : 'none',
                  }}
                  className="truncate max-w-full select-none"
                >
                  {preset.props.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

