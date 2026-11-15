import React from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';

export default function SectionHeader({ title, isOpen, onToggle, onReset, showReset = false }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1 border-b border-zinc-800 select-none">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200 hover:text-[#e31084] transition-colors"
      >
        <ChevronRight
          size={13}
          className={`text-zinc-500 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
        />
        <span>{title}</span>
      </button>

      {showReset && onReset && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          title="Reset section"
          className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-300 px-1 py-0.5 rounded hover:bg-zinc-800 transition-colors"
        >
          <RotateCcw size={10} />
          <span>Reset</span>
        </button>
      )}
    </div>
  );
}

