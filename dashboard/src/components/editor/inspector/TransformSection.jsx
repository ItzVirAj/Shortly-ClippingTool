import React, { useState } from 'react';
import { FlipHorizontal, FlipVertical } from 'lucide-react';
import { DEFAULT_TRANSFORM, getClipTransform } from '../editorUtils';
import SectionHeader from './SectionHeader';
import NumberField from './NumberField';

export default function TransformSection({ clip, isLocked, commit }) {
  const [isOpen, setIsOpen] = useState(true);
  const tf = getClipTransform(clip);

  return (
    <div>
      <SectionHeader
        title="Transform"
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        showReset={!isLocked}
        onReset={() => commit({ props: { transform: DEFAULT_TRANSFORM, fit: 'contain', flipH: false, flipV: false } })}
      />
      {isOpen && (
        <div className="pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={tf.x} min={-2000} max={2000} unit="px" disabled={isLocked}
              onReset={() => commit({ props: { transform: { x: 0 } } })}
              onChange={(v) => commit({ props: { transform: { x: v } } })} />
            <NumberField label="Y" value={tf.y} min={-2000} max={2000} unit="px" disabled={isLocked}
              onReset={() => commit({ props: { transform: { y: 0 } } })}
              onChange={(v) => commit({ props: { transform: { y: v } } })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Scale" value={tf.scale} min={10} max={400} unit="%" disabled={isLocked}
              onReset={() => commit({ props: { transform: { scale: 100 } } })}
              onChange={(v) => commit({ props: { transform: { scale: v } } })} />
            <NumberField label="Rotation" value={tf.rotation} min={-360} max={360} unit="°" disabled={isLocked}
              onReset={() => commit({ props: { transform: { rotation: 0 } } })}
              onChange={(v) => commit({ props: { transform: { rotation: v } } })} />
          </div>
          {(clip.type === 'video' || clip.type === 'image') && (
            <div className="flex items-center justify-between pt-1 text-xs">
              <label className="text-zinc-400 font-medium">Fit</label>
              <select value={clip.props?.fit || 'contain'} disabled={isLocked}
                onChange={(e) => commit({ props: { fit: e.target.value } })}
                className="h-7 px-2 rounded border border-zinc-700 text-xs bg-zinc-800 text-zinc-200 capitalize focus:border-emerald-500">
                <option value="contain" className="bg-zinc-800 text-zinc-100">Contain</option>
                <option value="cover" className="bg-zinc-800 text-zinc-100">Cover</option>
                <option value="fill" className="bg-zinc-800 text-zinc-100">Fill</option>
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={isLocked} onClick={() => commit({ props: { flipH: !clip.props?.flipH } })}
              className={`flex-1 h-7 flex items-center justify-center gap-1 rounded border text-xs transition-colors ${
                clip.props?.flipH ? 'bg-[#e31084]/20 text-[#e31084] border-[#e31084]/60 font-medium' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              }`}>
              <FlipHorizontal size={12} /><span>Flip H</span>
            </button>
            <button type="button" disabled={isLocked} onClick={() => commit({ props: { flipV: !clip.props?.flipV } })}
              className={`flex-1 h-7 flex items-center justify-center gap-1 rounded border text-xs transition-colors ${
                clip.props?.flipV ? 'bg-[#e31084]/20 text-[#e31084] border-[#e31084]/60 font-medium' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              }`}>
              <FlipVertical size={12} /><span>Flip V</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

