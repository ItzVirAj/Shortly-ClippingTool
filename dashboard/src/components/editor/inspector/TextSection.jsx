import React, { useState, useEffect } from 'react';
import { AlignLeft, AlignCenter, AlignRight, Italic, Type, ChevronRight } from 'lucide-react';
import { FONT_OPTIONS } from '../textPresets';
import SectionHeader from './SectionHeader';
import NumberField from './NumberField';
import SliderField from './SliderField';
import ColorField from './ColorField';
import SelectField from './SelectField';
import ToggleField from './ToggleField';

export default function TextSection({ clip, isLocked, commit, preview }) {
  const [isOpen, setIsOpen] = useState(true);
  const [subOpen, setSubOpen] = useState({ bg: false, stroke: false, shadow: false });
  const [textVal, setTextVal] = useState(clip.props?.text || 'Your text here');

  useEffect(() => {
    setTextVal(clip.props?.text || 'Your text here');
  }, [clip.props?.text]);

  const style = clip.props?.style || {};
  const bg = clip.props?.bg || {};
  const stroke = clip.props?.stroke || {};
  const shadow = clip.props?.shadow || {};

  const toggleSub = (k) => setSubOpen((prev) => ({ ...prev, [k]: !prev[k] }));

  return (
    <div>
      <SectionHeader title="Text Style" isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div className="pt-2 space-y-2.5">
          {/* Textarea */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <label className="font-medium">Content</label>
              <span className="font-mono text-zinc-500">{textVal.length}/500</span>
            </div>
            <textarea
              rows={2}
              maxLength={500}
              value={textVal}
              disabled={isLocked}
              aria-label="Text content"
              onChange={(e) => setTextVal(e.target.value)}
              onBlur={() => commit({ props: { text: textVal.slice(0, 500) } })}
              className="w-full p-2 text-xs rounded border border-zinc-700 bg-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 resize-none custom-scrollbar"
            />
          </div>

          {/* Typography Controls */}
          <SelectField label="Font" value={style.fontFamily || 'Montserrat'} options={FONT_OPTIONS} disabled={isLocked}
            onReset={() => commit({ props: { style: { fontFamily: 'Montserrat' } } })}
            onChange={(v) => commit({ props: { style: { fontFamily: v } } })} />

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Font Size" value={style.fontSize || 72} min={16} max={300} unit="px" disabled={isLocked}
              onReset={() => commit({ props: { style: { fontSize: 72 } } })}
              onChange={(v) => commit({ props: { style: { fontSize: v } } })} />
            <SelectField label="Weight" value={style.fontWeight || 700}
              options={[{ value: 400, label: 'Regular' }, { value: 700, label: 'Bold' }, { value: 900, label: 'Black' }]} disabled={isLocked}
              onReset={() => commit({ props: { style: { fontWeight: 700 } } })}
              onChange={(v) => commit({ props: { style: { fontWeight: Number(v) } } })} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Line Height" value={style.lineHeight || 1.2} min={0.8} max={2.5} step={0.1} disabled={isLocked}
              onReset={() => commit({ props: { style: { lineHeight: 1.2 } } })}
              onChange={(v) => commit({ props: { style: { lineHeight: v } } })} />
            <NumberField label="Letter Spacing" value={style.letterSpacing || 0} min={-5} max={40} unit="px" disabled={isLocked}
              onReset={() => commit({ props: { style: { letterSpacing: 0 } } })}
              onChange={(v) => commit({ props: { style: { letterSpacing: v } } })} />
          </div>

          <NumberField label="Box Width" value={style.boxWidth || 900} min={200} max={1080} unit="px" disabled={isLocked}
            onReset={() => commit({ props: { style: { boxWidth: 900 } } })}
            onChange={(v) => commit({ props: { style: { boxWidth: v } } })} />

          <ColorField label="Color" value={style.color || '#FFFFFF'} disabled={isLocked}
            onReset={() => commit({ props: { style: { color: '#FFFFFF' } } })}
            onChange={(v) => preview({ props: { style: { color: v } } })}
            onCommit={(v) => { preview(null); commit({ props: { style: { color: v } } }); }} />

          {/* Alignment and Toggles */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex rounded border border-zinc-700 overflow-hidden bg-zinc-800">
              {['left', 'center', 'right'].map((al) => {
                const Icon = al === 'left' ? AlignLeft : al === 'center' ? AlignCenter : AlignRight;
                const active = (style.align || 'center') === al;
                return (
                  <button key={al} type="button" disabled={isLocked} aria-label={`Align ${al}`}
                    onClick={() => commit({ props: { style: { align: al } } })}
                    className={`p-1.5 transition-colors ${active ? 'bg-[#e31084]/20 text-[#e31084]' : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}>
                    <Icon size={13} />
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1">
              <button type="button" disabled={isLocked} title="Italic"
                onClick={() => commit({ props: { style: { italic: !style.italic } } })}
                className={`p-1.5 rounded border text-xs transition-colors ${style.italic ? 'bg-[#e31084]/20 text-[#e31084] border-[#e31084]/60 font-semibold' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}>
                <Italic size={13} />
              </button>
              <button type="button" disabled={isLocked} title="Uppercase"
                onClick={() => commit({ props: { style: { uppercase: !style.uppercase } } })}
                className={`p-1.5 rounded border text-xs transition-colors ${style.uppercase ? 'bg-[#e31084]/20 text-[#e31084] border-[#e31084]/60 font-semibold' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}>
                <Type size={13} />
              </button>
            </div>
          </div>

          {/* Subsections: Background, Outline, Shadow */}
          <div className="pt-1 space-y-1.5 border-t border-zinc-800">
            {/* Background */}
            <div className="rounded border border-zinc-800 p-2 bg-zinc-850/60">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSub('bg')}>
                <div className="flex items-center gap-1 font-medium text-zinc-300">
                  <ChevronRight size={12} className={`transition-transform ${subOpen.bg ? 'rotate-90' : ''}`} />
                  <span>Background</span>
                </div>
                <ToggleField label="" checked={Boolean(bg.enabled)} disabled={isLocked}
                  onChange={(v) => commit({ props: { bg: { enabled: v } } })} />
              </div>
              {subOpen.bg && (
                <div className={`pt-2 space-y-2 ${!bg.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                  <ColorField label="Bg Color" value={bg.color || '#000000'} disabled={isLocked || !bg.enabled}
                    onChange={(v) => preview({ props: { bg: { color: v } } })}
                    onCommit={(v) => { preview(null); commit({ props: { bg: { color: v } } }); }} />
                  <SliderField label="Bg Opacity" value={bg.opacity ?? 100} min={0} max={100} unit="%" disabled={isLocked || !bg.enabled}
                    onChange={(v) => preview({ props: { bg: { opacity: v } } })}
                    onCommit={(v) => { preview(null); commit({ props: { bg: { opacity: v } } }); }} />
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label="Padding" value={bg.padding ?? 24} min={0} max={120} unit="px" disabled={isLocked || !bg.enabled}
                      onChange={(v) => commit({ props: { bg: { padding: v } } })} />
                    <NumberField label="Radius" value={bg.radius ?? 24} min={0} max={120} unit="px" disabled={isLocked || !bg.enabled}
                      onChange={(v) => commit({ props: { bg: { radius: v } } })} />
                  </div>
                </div>
              )}
            </div>

            {/* Outline (Stroke) */}
            <div className="rounded border border-zinc-800 p-2 bg-zinc-850/60">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSub('stroke')}>
                <div className="flex items-center gap-1 font-medium text-zinc-300">
                  <ChevronRight size={12} className={`transition-transform ${subOpen.stroke ? 'rotate-90' : ''}`} />
                  <span>Outline</span>
                </div>
                <ToggleField label="" checked={Boolean(stroke.enabled)} disabled={isLocked}
                  onChange={(v) => commit({ props: { stroke: { enabled: v } } })} />
              </div>
              {subOpen.stroke && (
                <div className={`pt-2 space-y-2 ${!stroke.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                  <ColorField label="Stroke Color" value={stroke.color || '#000000'} disabled={isLocked || !stroke.enabled}
                    onChange={(v) => preview({ props: { stroke: { color: v } } })}
                    onCommit={(v) => { preview(null); commit({ props: { stroke: { color: v } } }); }} />
                  <NumberField label="Width" value={stroke.width ?? 4} min={0} max={20} unit="px" disabled={isLocked || !stroke.enabled}
                    onChange={(v) => commit({ props: { stroke: { width: v } } })} />
                </div>
              )}
            </div>

            {/* Shadow */}
            <div className="rounded border border-zinc-800 p-2 bg-zinc-850/60">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSub('shadow')}>
                <div className="flex items-center gap-1 font-medium text-zinc-300">
                  <ChevronRight size={12} className={`transition-transform ${subOpen.shadow ? 'rotate-90' : ''}`} />
                  <span>Shadow</span>
                </div>
                <ToggleField label="" checked={Boolean(shadow.enabled)} disabled={isLocked}
                  onChange={(v) => commit({ props: { shadow: { enabled: v } } })} />
              </div>
              {subOpen.shadow && (
                <div className={`pt-2 space-y-2 ${!shadow.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                  <ColorField label="Shadow Color" value={shadow.color || '#000000'} disabled={isLocked || !shadow.enabled}
                    onChange={(v) => preview({ props: { shadow: { color: v } } })}
                    onCommit={(v) => { preview(null); commit({ props: { shadow: { color: v } } }); }} />
                  <div className="grid grid-cols-3 gap-1">
                    <NumberField label="Blur" value={shadow.blur ?? 8} min={0} max={40} unit="px" disabled={isLocked || !shadow.enabled}
                      onChange={(v) => commit({ props: { shadow: { blur: v } } })} />
                    <NumberField label="Off X" value={shadow.offsetX ?? 0} min={-40} max={40} unit="px" disabled={isLocked || !shadow.enabled}
                      onChange={(v) => commit({ props: { shadow: { offsetX: v } } })} />
                    <NumberField label="Off Y" value={shadow.offsetY ?? 4} min={-40} max={40} unit="px" disabled={isLocked || !shadow.enabled}
                      onChange={(v) => commit({ props: { shadow: { offsetY: v } } })} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

