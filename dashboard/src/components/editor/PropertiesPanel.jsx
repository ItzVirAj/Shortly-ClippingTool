import React from 'react';
import { GripVertical } from 'lucide-react';
import { useEditor } from './editorStore';
import ClipInspector from './inspector/ClipInspector';

export default function PropertiesPanel({ onDragStart }) {
  const { state } = useEditor();
  const { tracks, ui } = state;
  const selectedClip = ui.selectedClipId
    ? tracks.flatMap((t) => t.clips || []).find((c) => c.id === ui.selectedClipId)
    : null;

  return (
    <div className="w-full h-full flex-1 flex flex-col bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-sm">
      <div className="h-10 px-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900">
        <div
          draggable={Boolean(onDragStart)}
          onDragStart={(e) => onDragStart?.(e, 'properties')}
          title="Drag to reposition panel"
          className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none"
        >
          <GripVertical size={13} className="text-zinc-500 hover:text-zinc-300" />
          <span className="text-xs font-semibold text-zinc-100">Properties</span>
        </div>
        {selectedClip && (
          <span className="capitalize font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">
            {selectedClip.type}
          </span>
        )}
      </div>

      {!selectedClip ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <p className="text-xs font-bold text-zinc-300">No selection</p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Select a clip to view its properties
          </p>
        </div>
      ) : (
        <ClipInspector key={selectedClip.id} clip={selectedClip} />
      )}
    </div>
  );
}
