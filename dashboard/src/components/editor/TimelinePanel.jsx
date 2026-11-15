import React, { useState, useRef } from 'react';
import {
  Undo2, Redo2, Scissors, ArrowLeftToLine, ArrowRightToLine,
  Trash2, Copy, Waves, Plus, ChevronDown, Layers,
  ZoomOut, ZoomIn, Grid, SlidersHorizontal, Maximize2, X,
  Lock, Unlock, Volume2, VolumeX, Eye, EyeOff, GripVertical
} from 'lucide-react';
import { useEditor } from './editorStore';
import { getProjectDuration, canPlaceClipOnTrack, isRangeFree } from './editorUtils';
import { startAutoScroll } from './snapUtils';
import { useClipDrag } from './useClipDrag';
import TimelineClip from './TimelineClip';

export default function TimelinePanel({ onDragStart }) {
  const { state, dispatch } = useEditor();
  const { tracks, ui, history, media } = state;
  const { playhead, pxPerSec, selectedClipId } = ui;
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragOverTrackId, setDragOverTrackId] = useState(null);
  const [errorTrackId, setErrorTrackId] = useState(null);
  const scrollRef = useRef(null);

  const { dragState, handleClipPointerDown } = useClipDrag({
    tracks, media, ui, dispatch, scrollRef,
  });

  const totalDuration = getProjectDuration(tracks);
  const rulerSeconds = Math.max(30, Math.ceil(totalDuration + 5));
  const seconds = Array.from({ length: rulerSeconds + 1 }, (_, i) => i);

  const selectedClip = selectedClipId
    ? tracks.flatMap((t) => t.clips || []).find((c) => c.id === selectedClipId)
    : null;

  const canSplit = Boolean(
    selectedClip &&
    playhead > selectedClip.start + 0.05 &&
    playhead < selectedClip.start + selectedClip.duration - 0.05
  );

  const flashError = (trackId) => {
    setErrorTrackId(trackId);
    setTimeout(() => setErrorTrackId(null), 600);
  };

  const handleScrubDown = (e, deselect = false) => {
    if (e.button !== 0 || e.target.closest('[data-timeline-clip]')) return;
    const targetEl = e.currentTarget;
    try { targetEl.setPointerCapture(e.pointerId); } catch (_) {}
    if (ui.isPlaying) dispatch({ type: 'SET_PLAYING', payload: false });
    if (deselect) dispatch({ type: 'SELECT_CLIP', payload: null });

    let latestX = e.clientX;
    const update = (clientX) => {
      if (!scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const xInContent = clientX - rect.left + scrollRef.current.scrollLeft;
      dispatch({ type: 'SET_PLAYHEAD', payload: Math.max(0, xInContent / pxPerSec) });
    };

    update(e.clientX);
    const stopScroll = startAutoScroll(scrollRef.current, () => latestX);

    const onMove = (mEvt) => { latestX = mEvt.clientX; update(mEvt.clientX); };
    const onUp = () => {
      stopScroll();
      ['pointermove', 'pointerup', 'pointercancel'].forEach((ev, i) => targetEl.removeEventListener(ev, [onMove, onUp, onUp][i]));
      try { targetEl.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    targetEl.addEventListener('pointermove', onMove);
    targetEl.addEventListener('pointerup', onUp);
    targetEl.addEventListener('pointercancel', onUp);
  };

  const handleLaneDrop = (e, track) => {
    e.preventDefault();
    setDragOverTrackId(null);
    const mediaId = e.dataTransfer.getData('application/x-editor-media');
    const item = mediaId ? (media || []).find((m) => m.id === mediaId) : null;
    if (!item || !canPlaceClipOnTrack(item.type, track.type) || track.locked) {
      flashError(track.id);
      return;
    }
    const dropX = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const calcStart = Math.max(0, (dropX + (scrollRef.current?.scrollLeft || 0)) / pxPerSec);
    if (!isRangeFree(track, calcStart, item.duration)) {
      flashError(track.id);
      return;
    }
    dispatch({
      type: 'ADD_CLIP',
      payload: { trackId: track.id, clip: { type: item.type, mediaId: item.id, start: calcStart, duration: item.duration, name: item.name } },
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-100 overflow-hidden shadow-sm min-h-0">
      {/* Toolbar */}
      <div className="h-10 px-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900">
        <div className="flex items-center gap-1">
          <div
            draggable={Boolean(onDragStart)}
            onDragStart={(e) => onDragStart?.(e, 'timeline')}
            title="Drag to reposition panel"
            className="flex items-center gap-1 cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-200 pr-1.5 select-none"
          >
            <GripVertical size={13} className="text-zinc-500 hover:text-zinc-300" />
            <span className="text-[11px] font-semibold text-zinc-300">Timeline</span>
          </div>
          <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />
          <button type="button" aria-label="Undo" disabled={!history.past.length} onClick={() => dispatch({ type: 'UNDO' })} className={`p-1 text-zinc-400 rounded ${!history.past.length ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800 hover:text-zinc-100'}`}><Undo2 size={14} /></button>
          <button type="button" aria-label="Redo" disabled={!history.future.length} onClick={() => dispatch({ type: 'REDO' })} className={`p-1 text-zinc-400 rounded ${!history.future.length ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800 hover:text-zinc-100'}`}><Redo2 size={14} /></button>
          <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />
          <button type="button" aria-label="Split" disabled={!canSplit} onClick={() => selectedClipId && dispatch({ type: 'SPLIT_CLIP', payload: { clipId: selectedClipId, atTime: playhead } })} className={`p-1 text-zinc-400 rounded ${!canSplit ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800 hover:text-zinc-100'}`}><Scissors size={14} /></button>
          <button type="button" aria-label="Trim left" disabled className="p-1 text-zinc-600 opacity-40 cursor-not-allowed"><ArrowLeftToLine size={14} /></button>
          <button type="button" aria-label="Trim right" disabled className="p-1 text-zinc-600 opacity-40 cursor-not-allowed"><ArrowRightToLine size={14} /></button>
          <button type="button" aria-label="Delete" disabled={!selectedClipId} onClick={() => selectedClipId && dispatch({ type: 'DELETE_CLIP', payload: selectedClipId })} className={`p-1 text-zinc-400 rounded ${!selectedClipId ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800 hover:text-red-400'}`}><Trash2 size={14} /></button>
          <button type="button" aria-label="Duplicate" disabled={!selectedClipId} onClick={() => selectedClipId && dispatch({ type: 'DUPLICATE_CLIP', payload: selectedClipId })} className={`p-1 text-zinc-400 rounded ${!selectedClipId ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800 hover:text-zinc-100'}`}><Copy size={14} /></button>
          <button type="button" aria-label="Ripple edit" disabled className="p-1 text-zinc-600 opacity-40 cursor-not-allowed"><Waves size={14} /></button>
          <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />
          <div className="relative">
            <button type="button" onClick={() => setShowAddMenu(!showAddMenu)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700">
              <Plus size={12} /><span>Add track</span><ChevronDown size={11} className="text-zinc-400" />
            </button>
            {showAddMenu && (
              <div className="absolute left-0 top-full mt-1 w-32 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 text-xs">
                {['video', 'audio', 'text', 'overlay'].map((t) => (
                  <button key={t} type="button" onClick={() => { dispatch({ type: 'ADD_TRACK', payload: t }); setShowAddMenu(false); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-700 text-zinc-200 capitalize">{t} Track</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" aria-label="Layers" className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded ml-0.5"><Layers size={14} /></button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Zoom out" onClick={() => dispatch({ type: 'SET_ZOOM', payload: pxPerSec - 10 })} className="p-1 text-zinc-400 hover:text-zinc-100"><ZoomOut size={13} /></button>
          <input type="range" min="10" max="200" value={pxPerSec} onChange={(e) => dispatch({ type: 'SET_ZOOM', payload: Number(e.target.value) })}
            aria-label="Timeline zoom" className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#e31084]" />
          <button type="button" aria-label="Zoom in" onClick={() => dispatch({ type: 'SET_ZOOM', payload: pxPerSec + 10 })} className="p-1 text-zinc-400 hover:text-zinc-100"><ZoomIn size={13} /></button>
          <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />
          <button type="button" aria-label="Grid view" className="p-1 text-zinc-400 hover:text-zinc-100"><Grid size={13} /></button>
          <button type="button" aria-label="Timeline settings" className="p-1 text-zinc-400 hover:text-zinc-100"><SlidersHorizontal size={13} /></button>
          <button type="button" aria-label="Fit to screen" className="p-1 text-zinc-400 hover:text-zinc-100"><Maximize2 size={13} /></button>
        </div>
      </div>

      {/* Grid: Track Headers + Lanes */}
      <div className="flex-1 flex min-h-0 overflow-hidden bg-zinc-950/60">
        <div className="w-[170px] shrink-0 border-r border-zinc-800 bg-zinc-900 flex flex-col p-2 gap-2 select-none overflow-y-auto custom-scrollbar">
          <div className="h-6 border-b border-zinc-800/80 text-[10px] text-zinc-500 font-mono flex items-center">TRACKS</div>
          {tracks.map((track) => (
            <div key={track.id} className="h-10 px-2 flex items-center justify-between rounded-lg bg-zinc-850 border border-zinc-700/60 text-xs">
              <span className="font-medium text-[11px] text-zinc-200 truncate max-w-[70px]" title={track.name}>{track.name}</span>
              <div className="flex items-center gap-0.5 text-zinc-400">
                <button type="button" aria-label="Toggle lock" onClick={() => dispatch({ type: 'TOGGLE_TRACK_FLAG', payload: { trackId: track.id, flag: 'locked' } })} className={`p-0.5 hover:text-zinc-200 ${track.locked ? 'text-amber-500' : ''}`}>{track.locked ? <Lock size={11} /> : <Unlock size={11} />}</button>
                <button type="button" aria-label="Toggle mute" onClick={() => dispatch({ type: 'TOGGLE_TRACK_FLAG', payload: { trackId: track.id, flag: 'muted' } })} className={`p-0.5 hover:text-zinc-200 ${track.muted ? 'text-red-400' : ''}`}>{track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}</button>
                <button type="button" aria-label="Toggle visibility" onClick={() => dispatch({ type: 'TOGGLE_TRACK_FLAG', payload: { trackId: track.id, flag: 'hidden' } })} className={`p-0.5 hover:text-zinc-200 ${track.hidden ? 'text-zinc-600' : ''}`}>{track.hidden ? <EyeOff size={11} /> : <Eye size={11} />}</button>
                <button type="button" aria-label="Delete track" onClick={() => dispatch({ type: 'REMOVE_TRACK', payload: track.id })} className="p-0.5 hover:text-red-400 ml-0.5"><X size={11} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable Tracks & Ruler */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative bg-zinc-950/80">
          <div className="h-full relative" style={{ width: `${rulerSeconds * pxPerSec}px`, minWidth: '100%' }}>
            {/* Time Ruler (Scrubbable) */}
            <div onPointerDown={(e) => handleScrubDown(e, false)} className="h-6 border-b border-zinc-800 bg-zinc-900/90 relative flex select-none cursor-pointer">
              {seconds.map((s) => (
                <div key={s} className="absolute top-0 bottom-0 flex flex-col pointer-events-none" style={{ left: `${s * pxPerSec}px` }}>
                  <div className={`w-px bg-zinc-700 ${s % 5 === 0 ? 'h-3' : 'h-1.5'}`} />
                  {s % 5 === 0 && <span className="text-[9px] font-mono text-zinc-500 ml-1 -mt-0.5">00:{s.toString().padStart(2, '0')}</span>}
                </div>
              ))}
            </div>

            {/* Tracks Lanes */}
            <div className="flex-1 flex flex-col p-2 gap-2 relative">
              {tracks.reduce((sum, t) => sum + (t.clips?.length || 0), 0) === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  <span className="text-xs text-zinc-500 font-medium select-none">Add media or text to start</span>
                </div>
              )}
              {tracks.map((track) => {
                const isDragOver = dragOverTrackId === track.id;
                const isError = errorTrackId === track.id;
                const laneClips = (track.clips || []).filter(
                  (c) => !(dragState?.isDragging && c.id === dragState.clipId && dragState.targetTrackId !== track.id)
                );
                if (dragState?.isDragging && dragState.targetTrackId === track.id && dragState.origTrackId !== track.id) {
                  const moved = tracks.flatMap((t) => t.clips || []).find((c) => c.id === dragState.clipId);
                  if (moved) laneClips.push(moved);
                }

                return (
                  <div
                    key={track.id}
                    data-lane-track-id={track.id}
                    onPointerDown={(e) => handleScrubDown(e, true)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverTrackId(track.id); }}
                    onDragLeave={() => setDragOverTrackId(null)}
                    onDrop={(e) => handleLaneDrop(e, track)}
                    className={`h-10 rounded-lg border border-dashed relative overflow-hidden transition-colors ${
                      isError ? 'border-red-500 bg-red-950/40' :
                      isDragOver ? 'border-[#e31084] bg-[#e31084]/20' : 'border-zinc-800/80 bg-zinc-900/40'
                    }`}
                  >
                    {laneClips.map((clip) => (
                      <TimelineClip
                        key={clip.id}
                        clip={clip}
                        track={track}
                        isSelected={selectedClipId === clip.id}
                        pxPerSec={pxPerSec}
                        media={media}
                        dragState={dragState}
                        onPointerDown={handleClipPointerDown}
                        missingMediaIds={state.missingMediaIds}
                      />
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Snapping Guideline */}
            {dragState?.guideline !== null && dragState?.guideline !== undefined && (
              <div className="absolute top-0 bottom-0 w-px bg-[#e31084] z-50 pointer-events-none shadow-sm" style={{ left: `${dragState.guideline * pxPerSec}px` }}>
                <div className="w-1.5 h-1.5 bg-[#e31084] rounded-full -ml-[2.5px] -mt-1" />
              </div>
            )}

            {/* Playhead */}
            <div className="absolute top-0 bottom-0 flex flex-col items-center z-30 pointer-events-none" style={{ left: `${playhead * pxPerSec}px` }}>
              <div onPointerDown={(e) => handleScrubDown(e, false)} className="w-3 h-3 bg-[#e31084] rounded-full shadow-md shadow-[#e31084]/30 -mt-1 cursor-ew-resize pointer-events-auto" />
              <div className="w-0.5 bg-[#e31084] flex-1 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
