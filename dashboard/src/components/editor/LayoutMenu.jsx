import React, { useState, useRef, useEffect } from 'react';
import { Layout, RotateCcw, Check, Sparkles } from 'lucide-react';
import { LAYOUT_PRESETS } from './useEditorLayout';

export default function LayoutMenu({ onApplyPreset, onResetLayout, currentPresetKey = 'default' }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onClickOutside);
    return () => window.removeEventListener('pointerdown', onClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative inline-block text-xs">
      <button
        type="button"
        aria-label="Editor Layouts"
        onClick={() => setOpen(!open)}
        title="Change window layout or reset"
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-700/80 bg-zinc-850/60 transition-colors"
      >
        <Layout size={13} className="text-[#e31084]" />
        <span className="text-[11px] font-medium">Layout</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-zinc-900 border border-zinc-750 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs">
          <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 border-b border-zinc-800/80 mb-1">
            Layout Presets
          </div>

          {Object.entries(LAYOUT_PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onApplyPreset(key);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors text-left"
            >
              <span>{p.name}</span>
              {currentPresetKey === key && <Check size={12} className="text-[#e31084]" />}
            </button>
          ))}

          <div className="border-t border-zinc-800/80 mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                onResetLayout();
                setOpen(false);
              }}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-left text-[11px]"
            >
              <RotateCcw size={11} />
              <span>Reset to Default</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

