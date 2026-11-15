import React, { useState, useEffect, useRef } from 'react';
import { Film, ChevronDown, LayoutGrid, Plus, FolderOpen, Save, Download, Loader2 } from 'lucide-react';

export default function FileMenu({
  onOpenHub,
  onNew,
  onOpen,
  onSave,
  onExport,
  saveStatus,
  isExporting,
  totalDuration,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors font-medium text-[11px] border border-zinc-700/80 bg-zinc-850/80 shadow-2xs"
        title="File Menu"
      >
        <Film size={12} className="text-[#e31084]" />
        <span>File</span>
        <ChevronDown size={11} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-48 rounded-lg bg-zinc-900 border border-zinc-750 shadow-2xl py-1 z-50 text-xs">
          {onOpenHub && (
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenHub(); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-left"
            >
              <LayoutGrid size={13} className="text-[#e31084]" />
              <span>Projects Hub</span>
            </button>
          )}
          <div className="h-px bg-zinc-800 my-1" />
          <button
            type="button"
            onClick={() => { setOpen(false); onNew(); }}
            className="w-full flex items-center justify-between px-3 py-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-left"
          >
            <span className="flex items-center gap-2.5">
              <Plus size={13} className="text-zinc-400" />
              <span>New Project</span>
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Ctrl+N</span>
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onOpen(); }}
            className="w-full flex items-center justify-between px-3 py-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-left"
          >
            <span className="flex items-center gap-2.5">
              <FolderOpen size={13} className="text-zinc-400" />
              <span>Open Project...</span>
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Ctrl+O</span>
          </button>
          <div className="h-px bg-zinc-800 my-1" />
          <button
            type="button"
            onClick={() => { setOpen(false); onSave(); }}
            disabled={saveStatus === 'saving'}
            className="w-full flex items-center justify-between px-3 py-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-left disabled:opacity-50"
          >
            <span className="flex items-center gap-2.5">
              {saveStatus === 'saving' ? <Loader2 size={13} className="animate-spin text-emerald-400" /> : <Save size={13} className="text-zinc-400" />}
              <span>Save</span>
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Ctrl+S</span>
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onExport(); }}
            disabled={totalDuration <= 0}
            className="w-full flex items-center justify-between px-3 py-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-left disabled:opacity-50"
          >
            <span className="flex items-center gap-2.5">
              {isExporting ? <Loader2 size={13} className="animate-spin text-emerald-400" /> : <Download size={13} className="text-zinc-400" />}
              <span>Export...</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

