import React, { useState } from 'react';
import SectionHeader from './SectionHeader';
import NumberField from './NumberField';
import SelectField from './SelectField';

const TRANSITION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slideLeft', label: 'Slide left' },
  { value: 'slideRight', label: 'Slide right' },
  { value: 'slideUp', label: 'Slide up' },
  { value: 'zoom', label: 'Zoom' },
];

const MOTION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'zoomIn', label: 'Zoom in' },
  { value: 'zoomOut', label: 'Zoom out' },
  { value: 'punch', label: 'Punch-in' },
];

export default function AnimationSection({ clip, isLocked, commit }) {
  const [isOpen, setIsOpen] = useState(true);

  const tIn = clip.props?.transitionIn || {};
  const tOut = clip.props?.transitionOut || {};
  const motion = clip.props?.motion || {};
  const hasMotion = clip.type === 'video' || clip.type === 'image';

  return (
    <div>
      <SectionHeader
        title="Animation"
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        showReset={!isLocked}
        onReset={() =>
          commit({
            props: {
              transitionIn: { type: 'none', duration: 0.5 },
              transitionOut: { type: 'none', duration: 0.5 },
              motion: { type: 'none', amount: 20 },
            },
          })
        }
      />

      {isOpen && (
        <div className="pt-2 space-y-3">
          {/* Transition In */}
          <div className="space-y-1.5 p-2 rounded-lg bg-zinc-850/60 border border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-300 block">Transition In</span>
            <SelectField
              label="Type"
              value={tIn.type || 'none'}
              options={TRANSITION_OPTIONS}
              disabled={isLocked}
              onReset={() => commit({ props: { transitionIn: { type: 'none' } } })}
              onChange={(v) => commit({ props: { transitionIn: { type: v } } })}
            />
            {tIn.type && tIn.type !== 'none' && (
              <NumberField
                label="Duration"
                value={tIn.duration ?? 0.5}
                min={0.1}
                max={2}
                step={0.1}
                unit="s"
                disabled={isLocked}
                onReset={() => commit({ props: { transitionIn: { duration: 0.5 } } })}
                onChange={(v) => commit({ props: { transitionIn: { duration: v } } })}
              />
            )}
          </div>

          {/* Transition Out */}
          <div className="space-y-1.5 p-2 rounded-lg bg-zinc-850/60 border border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-300 block">Transition Out</span>
            <SelectField
              label="Type"
              value={tOut.type || 'none'}
              options={TRANSITION_OPTIONS}
              disabled={isLocked}
              onReset={() => commit({ props: { transitionOut: { type: 'none' } } })}
              onChange={(v) => commit({ props: { transitionOut: { type: v } } })}
            />
            {tOut.type && tOut.type !== 'none' && (
              <NumberField
                label="Duration"
                value={tOut.duration ?? 0.5}
                min={0.1}
                max={2}
                step={0.1}
                unit="s"
                disabled={isLocked}
                onReset={() => commit({ props: { transitionOut: { duration: 0.5 } } })}
                onChange={(v) => commit({ props: { transitionOut: { duration: v } } })}
              />
            )}
          </div>

          {/* Motion (Video and Image only) */}
          {hasMotion && (
            <div className="space-y-1.5 p-2 rounded-lg bg-zinc-850/60 border border-zinc-800">
              <span className="text-[11px] font-semibold text-zinc-300 block">Camera Motion</span>
              <SelectField
                label="Type"
                value={motion.type || 'none'}
                options={MOTION_OPTIONS}
                disabled={isLocked}
                onReset={() => commit({ props: { motion: { type: 'none' } } })}
                onChange={(v) => commit({ props: { motion: { type: v } } })}
              />
              {motion.type && motion.type !== 'none' && (
                <NumberField
                  label="Amount"
                  value={motion.amount ?? 20}
                  min={5}
                  max={60}
                  step={1}
                  unit="%"
                  disabled={isLocked}
                  onReset={() => commit({ props: { motion: { amount: 20 } } })}
                  onChange={(v) => commit({ props: { motion: { amount: v } } })}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

