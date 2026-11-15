import React from 'react';
import { Shapes } from 'lucide-react';

export default function TimelineClip({
  clip,
  track,
  isSelected,
  pxPerSec,
  media,
  dragState,
  onPointerDown,
  missingMediaIds,
}) {
  const isDragged = dragState?.clipId === clip.id && dragState.isDragging;
  const isInvalid = isDragged && !dragState.isValid;
  const renderStart = isDragged ? dragState.liveStart : clip.start;
  const renderDuration = isDragged ? dragState.liveDuration : clip.duration;

  const isMissingMedia = Boolean(clip.mediaId && missingMediaIds?.includes(clip.mediaId));
  const clipMedia = clip.mediaId ? (media || []).find((m) => m.id === clip.mediaId) : null;
  const isLocked = track.locked;
  const isHidden = track.hidden;
  const isShape = clip.type === 'shape';
  const shapeFill = clip.props?.shape?.fill || '#4F46E5';

  return (
    <div
      data-timeline-clip={clip.id}
      data-timeline-clip-type={clip.type}
      style={{
        left: `${renderStart * pxPerSec}px`,
        width: `${renderDuration * pxPerSec}px`,
        zIndex: isDragged ? 40 : 10,
        backgroundColor: !isSelected && isShape ? `${shapeFill}20` : undefined,
      }}
      className={`absolute top-1 bottom-1 rounded-md flex items-center justify-between text-xs select-none transition-shadow overflow-hidden group ${
        isHidden ? 'opacity-40 pointer-events-none' : ''
      } ${
        isMissingMedia
          ? 'border-2 border-dashed border-red-500 bg-red-950/40 text-red-300'
          : isDragged
          ? `opacity-80 ${isInvalid ? 'ring-2 ring-red-500 bg-red-950/60 text-red-200 border border-red-500' : 'ring-2 ring-[#e31084] bg-[#e31084]/25 text-white border border-[#e31084]'}`
          : isSelected
          ? 'ring-2 ring-[#e31084] bg-[#e31084]/20 text-white border border-[#e31084] font-medium'
          : isShape
          ? 'border border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-zinc-500'
          : 'bg-zinc-800 border border-zinc-700 text-zinc-200 hover:border-zinc-500'
      }`}
    >
      {/* Left Trim Handle (8px) */}
      {!isLocked && !isHidden && (
        <div
          onPointerDown={(e) => onPointerDown(e, clip, track, 'trim-left')}
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-start group/left"
          title="Trim left edge"
        >
          <div className={`w-1 h-full rounded-l transition-colors ${isSelected ? 'bg-[#e31084]' : 'group-hover/left:bg-[#e31084] group-hover:bg-[#e31084]/60'}`} />
        </div>
      )}

      {/* Main Clip Body */}
      <div
        onPointerDown={(e) => onPointerDown(e, clip, track, 'move')}
        className={`w-full h-full flex items-center justify-between px-2.5 overflow-hidden ${
          isLocked ? 'cursor-not-allowed' : isDragged ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {clipMedia?.thumbUrl && (
          <div className="absolute inset-0 bg-cover bg-center opacity-25 pointer-events-none" style={{ backgroundImage: `url(${clipMedia.thumbUrl})` }} />
        )}
        <div className="flex items-center gap-1.5 min-w-0 z-10 truncate">
          {isShape && (
            <span
              style={{ backgroundColor: shapeFill }}
              className="w-3.5 h-3.5 rounded-xs flex items-center justify-center text-white shrink-0 shadow-2xs"
            >
              <Shapes size={9} />
            </span>
          )}
          <span className={`truncate font-medium select-none ${isMissingMedia ? 'text-red-400 font-semibold italic' : 'text-zinc-200'}`}>
            {isMissingMedia ? 'Missing media' : clip.name}
          </span>
        </div>
        <span className="text-[10px] text-zinc-400 ml-1 font-mono shrink-0 relative z-10 select-none">
          {renderDuration.toFixed(1)}s
        </span>
      </div>

      {/* Right Trim Handle (8px) */}
      {!isLocked && !isHidden && (
        <div
          onPointerDown={(e) => onPointerDown(e, clip, track, 'trim-right')}
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-end group/right"
          title="Trim right edge"
        >
          <div className={`w-1 h-full rounded-r transition-colors ${isSelected ? 'bg-[#e31084]' : 'group-hover/right:bg-[#e31084] group-hover:bg-[#e31084]/60'}`} />
        </div>
      )}
    </div>
  );
}
