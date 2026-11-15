import React, { useRef, useState, useEffect } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Volume2, VolumeX,
  Magnet, Move, Layout, Monitor, Maximize, Minimize, GripVertical
} from 'lucide-react';
import { useEditor } from './editorStore';
import { formatTimecode, getProjectDuration } from './editorUtils';
import PreviewStage from './PreviewStage';

export default function PlayerPanel({ onDragStart }) {
  const { state, dispatch } = useEditor();
  const { project, tracks, ui } = state;
  const totalDuration = getProjectDuration(tracks);
  const panelRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleTogglePlay = () => {
    if (!ui.isPlaying) {
      if (totalDuration > 0 && ui.playhead >= totalDuration) {
        dispatch({ type: 'SET_PLAYHEAD', payload: 0 });
      }
      dispatch({ type: 'SET_PLAYING', payload: true });
    } else {
      dispatch({ type: 'SET_PLAYING', payload: false });
    }
  };

  const handleToggleFullscreen = () => {
    if (!panelRef.current) return;
    if (!document.fullscreenElement) {
      panelRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div ref={panelRef} className="w-full h-full flex-1 flex flex-col bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="h-10 px-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900">
        <div
          draggable={Boolean(onDragStart)}
          onDragStart={(e) => onDragStart?.(e, 'player')}
          title="Drag to reposition panel"
          className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none"
        >
          <GripVertical size={13} className="text-zinc-500 hover:text-zinc-300" />
          <span className="text-xs font-semibold text-zinc-100">Player</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" title="Player ready" />
        </div>
      </div>

      {/* Body: Preview Stage Area */}
      <div className="flex-1 min-h-0 bg-zinc-950 flex items-center justify-center p-3 overflow-hidden relative">
        <PreviewStage zoom={zoom} onZoomChange={setZoom} />
      </div>

      {/* Bottom Control Bar */}
      <div className="h-12 px-3 border-t border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900 gap-2">
        {/* Left: Timecode */}
        <div className="flex items-center text-xs font-mono select-none shrink-0">
          <span className="text-zinc-200 font-medium">
            {formatTimecode(ui.playhead, project.fps)}
          </span>
          <span className="text-zinc-500 ml-1">
            / {formatTimecode(totalDuration, project.fps)}
          </span>
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center gap-1.5 justify-center">
          <button
            type="button"
            aria-label="Previous frame"
            onClick={() => dispatch({ type: 'SET_PLAYHEAD', payload: 0 })}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
          >
            <SkipBack size={15} />
          </button>
          <button
            type="button"
            aria-label={ui.isPlaying ? 'Pause' : 'Play'}
            onClick={handleTogglePlay}
            className="btn-brand-accent w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md shadow-[#e31084]/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            style={{ backgroundColor: '#e31084' }}
          >
            {ui.isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
          <button
            type="button"
            aria-label="Next frame"
            onClick={() => dispatch({ type: 'SET_PLAYHEAD', payload: totalDuration })}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
          >
            <SkipForward size={15} />
          </button>
        </div>

        {/* Right: View & Tool Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Loop playback"
            onClick={() => dispatch({ type: 'TOGGLE_LOOP' })}
            className={`p-1.5 rounded-md transition-colors ${
              ui.loop
                ? 'text-[#e31084] bg-[#e31084]/20 border border-[#e31084]/60'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}
            title={ui.loop ? 'Looping enabled' : 'Loop playback'}
          >
            <Repeat size={14} />
          </button>
          <button
            type="button"
            aria-label={ui.masterMuted ? 'Unmute' : 'Mute'}
            onClick={() => dispatch({ type: 'TOGGLE_MASTER_MUTE' })}
            className={`p-1.5 rounded-md transition-colors ${
              ui.masterMuted
                ? 'text-amber-400 bg-amber-950/60 border border-amber-500/60'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}
            title={ui.masterMuted ? 'Muted' : 'Volume'}
          >
            {ui.masterMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>

          <button
            type="button"
            className="px-1.5 py-0.5 text-[11px] font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 transition-colors"
          >
            {project.aspect || '9:16'}
          </button>

          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Scroll over stage to zoom in/out. Click to reset."
            className={`px-1.5 py-0.5 text-[11px] font-medium rounded border transition-colors ${
              zoom !== 1
                ? 'text-[#e31084] bg-[#e31084]/20 border-[#e31084]/60 font-semibold'
                : 'text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border-zinc-700'
            }`}
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            aria-label="Toggle snap"
            onClick={() => dispatch({ type: 'TOGGLE_SNAP' })}
            className={`p-1.5 rounded-md transition-colors ${
              ui.snapEnabled
                ? 'text-[#e31084] bg-[#e31084]/20 border border-[#e31084]/60'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}
            title={ui.snapEnabled ? 'Snapping enabled' : 'Snapping disabled'}
          >
            <Magnet size={14} />
          </button>

          <button type="button" aria-label="Move" className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors">
            <Move size={14} />
          </button>
          <button type="button" aria-label="Layout" className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors">
            <Layout size={14} />
          </button>
          <button type="button" aria-label="Display" className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors">
            <Monitor size={14} />
          </button>
          <button
            type="button"
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            onClick={handleToggleFullscreen}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
