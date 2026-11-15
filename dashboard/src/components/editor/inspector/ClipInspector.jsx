import React, { useState, useEffect } from 'react';
import { useEditor } from '../editorStore';
import { updateClipHelper } from '../editorUtils';
import SectionHeader from './SectionHeader';
import NumberField from './NumberField';
import SliderField from './SliderField';
import TextSection from './TextSection';
import ShapeSection from './ShapeSection';
import TransformSection from './TransformSection';
import AppearanceSection from './AppearanceSection';
import AnimationSection from './AnimationSection';

export default function ClipInspector({ clip }) {
  const { state, dispatch } = useEditor();
  const { tracks, media } = state;
  const track = tracks.find((t) => (t.clips || []).some((c) => c.id === clip.id));
  const isLocked = Boolean(track?.locked);

  const [open, setOpen] = useState({ info: true, timing: true, audio: true });
  const [timingError, setTimingError] = useState(null);
  const [nameText, setNameText] = useState(clip.name || '');

  useEffect(() => { setNameText(clip.name || ''); }, [clip.name]);
  const toggle = (sec) => setOpen((p) => ({ ...p, [sec]: !p[sec] }));

  const commit = (patch) => {
    if (isLocked) return;
    const test = updateClipHelper(tracks, clip.id, patch, media);
    if (!test) {
      setTimingError('Not enough room');
      setTimeout(() => setTimingError(null), 2000);
      return;
    }
    dispatch({ type: 'UPDATE_CLIP', payload: { clipId: clip.id, patch } });
  };

  const preview = (patch) => {
    window.dispatchEvent(new CustomEvent('editor:preview-clip-patch', { detail: patch ? { clipId: clip.id, patch } : null }));
  };

  const isText = clip.type === 'text';
  const isShape = clip.type === 'shape';
  const hasTransform = ['video', 'image', 'text', 'overlay', 'shape'].includes(clip.type);
  const hasAnimation = ['video', 'image', 'text', 'shape'].includes(clip.type);
  const hasAudio = ['video', 'audio'].includes(clip.type);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 text-xs select-none">
      {/* 1. Info */}
      <div>
        <SectionHeader title="Info" isOpen={open.info} onToggle={() => toggle('info')} />
        {open.info && (
          <div className="pt-2 space-y-2">
            <div>
              <label className="text-zinc-400 font-medium">Name</label>
              <input type="text" maxLength={60} value={nameText} disabled={isLocked}
                onChange={(e) => setNameText(e.target.value)}
                onBlur={() => commit({ name: nameText })}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="w-full h-7 px-2 mt-0.5 rounded border border-zinc-700 text-xs bg-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-[#e31084]" />
            </div>
            <div className="flex justify-between items-center py-0.5 text-zinc-400">
              <span className="font-medium">Type</span>
              <span className="capitalize font-mono text-zinc-300 bg-zinc-800 border border-zinc-700/60 px-1.5 py-0.5 rounded text-[11px]">{clip.type}</span>
            </div>
          </div>
        )}
      </div>

      {/* Text Section (if type === "text") */}
      {isText && <TextSection clip={clip} isLocked={isLocked} commit={commit} preview={preview} />}

      {/* Shape Section (if type === "shape") */}
      {isShape && <ShapeSection clip={clip} isLocked={isLocked} commit={commit} preview={preview} />}

      {/* 2. Timing */}
      <div>
        <SectionHeader title="Timing" isOpen={open.timing} onToggle={() => toggle('timing')} />
        {open.timing && (
          <div className="pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Start" value={clip.start} min={0} step={0.01} unit="s" disabled={isLocked}
                onReset={() => commit({ start: 0 })} onChange={(v) => commit({ start: v })} error={timingError} />
              <NumberField label="Duration" value={clip.duration} min={0.1} step={0.01} unit="s" disabled={isLocked}
                onReset={() => commit({ duration: 5 })} onChange={(v) => commit({ duration: v })} error={timingError} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="In Point" value={clip.inPoint || 0} min={0} step={0.01} unit="s" disabled={isLocked}
                onReset={() => commit({ inPoint: 0 })} onChange={(v) => commit({ inPoint: v })} />
              {hasAudio && (
                <NumberField label="Speed" value={clip.speed || 1} min={0.25} max={4} step={0.25} unit="x" disabled={isLocked}
                  onReset={() => commit({ speed: 1 })} onChange={(v) => commit({ speed: v })} error={timingError} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Transform */}
      {hasTransform && <TransformSection clip={clip} isLocked={isLocked} commit={commit} />}

      {/* 4. Appearance */}
      {hasTransform && !isShape && <AppearanceSection clip={clip} isLocked={isLocked} commit={commit} preview={preview} />}

      {/* 5. Animation (Transitions & Motion) */}
      {hasAnimation && <AnimationSection clip={clip} isLocked={isLocked} commit={commit} />}

      {/* 6. Audio */}
      {hasAudio && (
        <div>
          <SectionHeader title="Audio" isOpen={open.audio} onToggle={() => toggle('audio')} showReset={!isLocked}
            onReset={() => commit({ volume: 1, props: { fadeIn: 0, fadeOut: 0 } })} />
          {open.audio && (
            <div className="pt-2 space-y-2">
              <div>
                <SliderField label="Volume" value={Math.round((clip.volume ?? 1) * 100)} min={0} max={200} unit="%" disabled={isLocked}
                  onReset={() => commit({ volume: 1 })} onChange={(v) => preview({ volume: v / 100 })} onCommit={(v) => { preview(null); commit({ volume: v / 100 }); }} />
                <span className="text-[10px] text-zinc-500 mt-0.5 block">Above 100% applies on export only</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <NumberField label="Audio Fade In" value={clip.props?.fadeIn || 0} min={0} step={0.1} unit="s" disabled={isLocked}
                  onReset={() => commit({ props: { fadeIn: 0 } })} onChange={(v) => commit({ props: { fadeIn: v } })} />
                <NumberField label="Audio Fade Out" value={clip.props?.fadeOut || 0} min={0} step={0.1} unit="s" disabled={isLocked}
                  onReset={() => commit({ props: { fadeOut: 0 } })} onChange={(v) => commit({ props: { fadeOut: v } })} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
