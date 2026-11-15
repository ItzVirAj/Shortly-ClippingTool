import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Space'], desc: 'Play / Pause playback' },
  { keys: ['S'], desc: 'Split clip at playhead' },
  { keys: ['Delete', 'Backspace'], desc: 'Delete selected clip' },
  { keys: ['Ctrl', 'Z'], desc: 'Undo last action' },
  { keys: ['Ctrl', 'Shift', 'Z'], desc: 'Redo last action' },
  { keys: ['Ctrl', 'S'], desc: 'Save project' },
  { keys: ['←', '→'], desc: 'Move playhead by 1 frame' },
  { keys: ['Shift', '← / →'], desc: 'Move playhead by 1 second' },
  { keys: ['Home'], desc: 'Go to beginning of timeline' },
  { keys: ['End'], desc: 'Go to end of timeline' },
  { keys: ['Esc'], desc: 'Cancel drag / deselect / close modal' },
  { keys: ['?'], desc: 'Open keyboard shortcuts dialog' },
];

export default function ShortcutsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-emerald-500" />
            <h3 className="font-semibold text-zinc-100 text-sm">Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md transition-colors"
            aria-label="Close shortcuts modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto custom-scrollbar divide-y divide-zinc-800/80 text-xs">
          {SHORTCUTS.map((item, idx) => (
            <div key={idx} className="py-2 flex items-center justify-between gap-4">
              <span className="text-zinc-300 font-medium">{item.desc}</span>
              <div className="flex items-center gap-1 shrink-0">
                {item.keys.map((k, ki) => (
                  <kbd
                    key={ki}
                    className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono text-[10px] shadow-2xs font-semibold"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-zinc-850 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="btn-brand-accent px-4 py-1.5 text-white rounded-lg text-xs font-semibold shadow-md shadow-[#e31084]/20 transition-all cursor-pointer"
            style={{ backgroundColor: '#e31084' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

