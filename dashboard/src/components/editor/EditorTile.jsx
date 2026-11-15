import React from 'react';
import { ArrowLeftRight, GripVertical } from 'lucide-react';
import LeftRail from './LeftRail';
import MediaPanel from './MediaPanel';
import TextPanel from './TextPanel';
import EffectsPanel from './EffectsPanel';
import TransitionsPanel from './TransitionsPanel';
import GraphicsPanel from './GraphicsPanel';
import AIPanel from './AIPanel';
import PlayerPanel from './PlayerPanel';
import PropertiesPanel from './PropertiesPanel';
import TimelinePanel from './TimelinePanel';

export default function EditorTile({
  tileId,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  activeRail,
  setActiveRail,
  onApplyPreset,
  onResetLayout,
  style,
  className = '',
}) {
  const handleDragOver = (e) => onDragOver(e, tileId);
  const handleDragLeave = (e) => onDragLeave(e, tileId);
  const handleDrop = (e) => onDrop(e, tileId);

  return (
    <div
      style={style}
      data-tile-id={tileId}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative min-w-0 min-h-0 flex flex-col transition-opacity duration-150 ${className} ${
        isDragging ? 'opacity-40' : 'opacity-100'
      }`}
    >
      {/* Drop Target Indicator Overlay */}
      {isDropTarget && (
        <div className="absolute inset-0 z-50 bg-[#e31084]/20 border-2 border-dashed border-[#e31084] rounded-xl flex items-center justify-center backdrop-blur-2xs pointer-events-none animate-in fade-in duration-100">
          <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-[#e31084]/80 text-[#e31084] text-xs font-semibold shadow-2xl flex items-center gap-1.5">
            <ArrowLeftRight size={13} />
            <span>Drop to swap position</span>
          </div>
        </div>
      )}

      {/* Tile Content */}
      {tileId === 'media' ? (
        <div className="w-full h-full flex-1 flex flex-col bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-sm">
          <div className="h-10 px-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900">
            <div
              draggable
              onDragStart={(e) => onDragStart(e, 'media')}
              title="Drag to reposition panel"
              className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none"
            >
              <GripVertical size={13} className="text-zinc-500 hover:text-zinc-300" />
              <span className="text-xs font-semibold text-zinc-100">Tools & Library</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono capitalize">{activeRail}</span>
          </div>
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <LeftRail activeItem={activeRail} onSelect={setActiveRail} />
            {activeRail === 'Text' ? (
              <TextPanel />
            ) : activeRail === 'Effects' ? (
              <EffectsPanel />
            ) : activeRail === 'Transitions' ? (
              <TransitionsPanel />
            ) : activeRail === 'Graphics' ? (
              <GraphicsPanel />
            ) : activeRail === 'AI Generate' ? (
              <AIPanel />
            ) : (
              <MediaPanel activeItem={activeRail} />
            )}
          </div>
        </div>
      ) : tileId === 'player' ? (
        <PlayerPanel onDragStart={onDragStart} />
      ) : tileId === 'properties' ? (
        <PropertiesPanel onDragStart={onDragStart} />
      ) : tileId === 'timeline' ? (
        <TimelinePanel onDragStart={onDragStart} />
      ) : null}
    </div>
  );
}

