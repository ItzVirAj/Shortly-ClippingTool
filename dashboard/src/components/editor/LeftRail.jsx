import React from 'react';
import { FolderOpen, Type, Shapes, Wand2, ArrowLeftRight, Sparkles } from 'lucide-react';

const RAIL_ITEMS = [
  { id: 'Media', label: 'Media', icon: FolderOpen },
  { id: 'Text', label: 'Text', icon: Type },
  { id: 'Graphics', label: 'Graphics', icon: Shapes },
  { id: 'Effects', label: 'Effects', icon: Wand2 },
  { id: 'Transitions', label: 'Transitions', icon: ArrowLeftRight },
  { id: 'AI Generate', label: 'AI Generate', icon: Sparkles },
];

export default function LeftRail({ activeItem = 'Media', onSelect }) {
  return (
    <div className="w-[92px] shrink-0 border-r border-zinc-800 flex flex-col items-center py-3 gap-1.5 bg-zinc-900 select-none">
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeItem === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect && onSelect(item.id)}
            aria-label={item.label}
            className={`w-[76px] py-2 px-1 flex flex-col items-center justify-center rounded-xl transition-colors cursor-pointer ${
              isActive
                ? 'bg-[#e31084]/15 text-[#e31084] font-medium border border-[#e31084]/30'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
            }`}
          >
            <Icon size={20} className={isActive ? 'text-[#e31084]' : 'text-zinc-400'} />
            <span className="text-[11px] mt-1 text-center tracking-tight leading-tight truncate w-full">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

