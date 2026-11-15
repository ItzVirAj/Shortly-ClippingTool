import React, { useState } from 'react';
import SectionHeader from './SectionHeader';
import NumberField from './NumberField';
import SliderField from './SliderField';
import ColorField from './ColorField';
import ToggleField from './ToggleField';

export default function ShapeSection({ clip, isLocked, commit, preview }) {
  const [isOpen, setIsOpen] = useState(true);

  const shape = clip.props?.shape || {};
  const stroke = shape.stroke || {};
  const isCircle = shape.kind === 'circle';
  const isRect = shape.kind === 'rect';
  const isProgress = shape.kind === 'progress';

  const handleWidthChange = (val) => {
    const patch = { width: val };
    if (isCircle) patch.height = val;
    commit({ props: { shape: patch } });
  };

  const handleHeightChange = (val) => {
    const patch = { height: val };
    if (isCircle) patch.width = val;
    commit({ props: { shape: patch } });
  };

  return (
    <div>
      <SectionHeader title="Shape Properties" isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div className="pt-2 space-y-2.5">
          {/* Kind (Read-only) */}
          <div className="flex justify-between items-center text-xs text-zinc-400">
            <span className="font-medium">Kind</span>
            <span className="capitalize font-mono text-zinc-300 bg-zinc-800 border border-zinc-700/60 px-1.5 py-0.5 rounded text-[11px]">
              {shape.kind || 'rect'}
            </span>
          </div>

          {/* Width & Height */}
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Width"
              value={shape.width ?? 400}
              min={1}
              max={2000}
              unit="px"
              disabled={isLocked}
              onReset={() => handleWidthChange(400)}
              onChange={handleWidthChange}
            />
            <NumberField
              label="Height"
              value={shape.height ?? 400}
              min={1}
              max={2000}
              unit="px"
              disabled={isLocked}
              onReset={() => handleHeightChange(400)}
              onChange={handleHeightChange}
            />
          </div>

          {/* Radius (Rect only) */}
          {isRect && (
            <NumberField
              label="Corner Radius"
              value={shape.radius ?? 0}
              min={0}
              max={500}
              unit="px"
              disabled={isLocked}
              onReset={() => commit({ props: { shape: { radius: 0 } } })}
              onChange={(v) => commit({ props: { shape: { radius: v } } })}
            />
          )}

          {/* Fill & Fill Opacity */}
          <ColorField
            label="Fill Color"
            value={shape.fill || '#FFFFFF'}
            disabled={isLocked}
            onReset={() => commit({ props: { shape: { fill: '#FFFFFF' } } })}
            onChange={(v) => preview({ props: { shape: { fill: v } } })}
            onCommit={(v) => { preview(null); commit({ props: { shape: { fill: v } } }); }}
          />

          <SliderField
            label="Fill Opacity"
            value={shape.fillOpacity ?? 100}
            min={0}
            max={100}
            unit="%"
            disabled={isLocked}
            onReset={() => commit({ props: { shape: { fillOpacity: 100 } } })}
            onChange={(v) => preview({ props: { shape: { fillOpacity: v } } })}
            onCommit={(v) => { preview(null); commit({ props: { shape: { fillOpacity: v } } }); }}
          />

          {/* Progress Bar Track Color */}
          {isProgress && (
            <ColorField
              label="Track Color"
              value={shape.trackColor || '#FFFFFF'}
              disabled={isLocked}
              onReset={() => commit({ props: { shape: { trackColor: '#FFFFFF4D' } } })}
              onChange={(v) => preview({ props: { shape: { trackColor: v } } })}
              onCommit={(v) => { preview(null); commit({ props: { shape: { trackColor: v } } }); }}
            />
          )}

          {/* Stroke Subsection */}
          <div className="rounded border border-zinc-800 p-2 bg-zinc-850/60 space-y-2">
            <ToggleField
              label="Stroke / Border"
              checked={Boolean(stroke.enabled)}
              disabled={isLocked}
              onReset={() => commit({ props: { shape: { stroke: { enabled: false } } } })}
              onChange={(v) => commit({ props: { shape: { stroke: { enabled: v } } } })}
            />
            {stroke.enabled && (
              <>
                <ColorField
                  label="Stroke Color"
                  value={stroke.color || '#000000'}
                  disabled={isLocked}
                  onReset={() => commit({ props: { shape: { stroke: { color: '#000000' } } } })}
                  onChange={(v) => preview({ props: { shape: { stroke: { color: v } } } })}
                  onCommit={(v) => { preview(null); commit({ props: { shape: { stroke: { color: v } } } }); }}
                />
                <NumberField
                  label="Stroke Width"
                  value={stroke.width ?? 4}
                  min={0}
                  max={30}
                  unit="px"
                  disabled={isLocked}
                  onReset={() => commit({ props: { shape: { stroke: { width: 4 } } } })}
                  onChange={(v) => commit({ props: { shape: { stroke: { width: v } } } })}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

