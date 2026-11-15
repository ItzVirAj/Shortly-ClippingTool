import React, { useState } from 'react';
import SectionHeader from './SectionHeader';
import SliderField from './SliderField';
import NumberField from './NumberField';

export default function AppearanceSection({ clip, isLocked, commit, preview }) {
  const [isOpen, setIsOpen] = useState(true);
  const isVideoOrImage = clip.type === 'video' || clip.type === 'image';
  const look = clip.props?.look || {};

  return (
    <div>
      <SectionHeader
        title="Appearance"
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        showReset={!isLocked}
        onReset={() =>
          commit({
            opacity: 1,
            props: {
              blur: 0, brightness: 100, contrast: 100, saturation: 100,
              fadeIn: 0, fadeOut: 0,
              look: { grayscale: 0, sepia: 0, hueRotate: 0 },
            },
          })
        }
      />

      {isOpen && (
        <div className="pt-2 space-y-2">
          <SliderField
            label="Opacity"
            value={Math.round((clip.opacity ?? 1) * 100)}
            min={0}
            max={100}
            unit="%"
            disabled={isLocked}
            onReset={() => commit({ opacity: 1 })}
            onChange={(v) => preview({ opacity: v / 100 })}
            onCommit={(v) => { preview(null); commit({ opacity: v / 100 }); }}
          />

          {isVideoOrImage && (
            <>
              <SliderField
                label="Grayscale"
                value={look.grayscale ?? 0}
                min={0}
                max={100}
                unit="%"
                disabled={isLocked}
                onReset={() => commit({ props: { look: { grayscale: 0 } } })}
                onChange={(v) => preview({ props: { look: { grayscale: v } } })}
                onCommit={(v) => { preview(null); commit({ props: { look: { grayscale: v } } }); }}
              />
              <SliderField
                label="Sepia"
                value={look.sepia ?? 0}
                min={0}
                max={100}
                unit="%"
                disabled={isLocked}
                onReset={() => commit({ props: { look: { sepia: 0 } } })}
                onChange={(v) => preview({ props: { look: { sepia: v } } })}
                onCommit={(v) => { preview(null); commit({ props: { look: { sepia: v } } }); }}
              />
              <SliderField
                label="Hue Rotate"
                value={look.hueRotate ?? 0}
                min={-180}
                max={180}
                unit="°"
                disabled={isLocked}
                onReset={() => commit({ props: { look: { hueRotate: 0 } } })}
                onChange={(v) => preview({ props: { look: { hueRotate: v } } })}
                onCommit={(v) => { preview(null); commit({ props: { look: { hueRotate: v } } }); }}
              />
            </>
          )}

          <SliderField
            label="Blur"
            value={clip.props?.blur || 0}
            min={0}
            max={40}
            unit="px"
            disabled={isLocked}
            onReset={() => commit({ props: { blur: 0 } })}
            onChange={(v) => preview({ props: { blur: v } })}
            onCommit={(v) => { preview(null); commit({ props: { blur: v } }); }}
          />
          <SliderField
            label="Brightness"
            value={clip.props?.brightness ?? 100}
            min={0}
            max={200}
            unit="%"
            disabled={isLocked}
            onReset={() => commit({ props: { brightness: 100 } })}
            onChange={(v) => preview({ props: { brightness: v } })}
            onCommit={(v) => { preview(null); commit({ props: { brightness: v } }); }}
          />
          <SliderField
            label="Contrast"
            value={clip.props?.contrast ?? 100}
            min={0}
            max={200}
            unit="%"
            disabled={isLocked}
            onReset={() => commit({ props: { contrast: 100 } })}
            onChange={(v) => preview({ props: { contrast: v } })}
            onCommit={(v) => { preview(null); commit({ props: { contrast: v } }); }}
          />
          <SliderField
            label="Saturation"
            value={clip.props?.saturation ?? 100}
            min={0}
            max={200}
            unit="%"
            disabled={isLocked}
            onReset={() => commit({ props: { saturation: 100 } })}
            onChange={(v) => preview({ props: { saturation: v } })}
            onCommit={(v) => { preview(null); commit({ props: { saturation: v } }); }}
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <NumberField
              label="Fade In"
              value={clip.props?.fadeIn || 0}
              min={0}
              step={0.1}
              unit="s"
              disabled={isLocked}
              onReset={() => commit({ props: { fadeIn: 0 } })}
              onChange={(v) => commit({ props: { fadeIn: v } })}
            />
            <NumberField
              label="Fade Out"
              value={clip.props?.fadeOut || 0}
              min={0}
              step={0.1}
              unit="s"
              disabled={isLocked}
              onReset={() => commit({ props: { fadeOut: 0 } })}
              onChange={(v) => commit({ props: { fadeOut: v } })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

