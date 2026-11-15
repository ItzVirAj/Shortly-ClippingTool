import React, { useRef, useState, useEffect } from 'react';
import { useEditor } from './editorStore';
import { useMediaSync } from './useMediaSync';
import { getClipTransform } from './editorUtils';
import { getClipAnimation } from './animationUtils';
import { mergeLivePatch, computeFadeFactor } from './stageUtils';
import TextOverlay from './TextOverlay';

export default function PreviewStage({ zoom: externalZoom, onZoomChange }) {
  const { state, dispatch } = useEditor();
  const { project, tracks, media, ui } = state;
  const { playhead, isPlaying, masterMuted, selectedClipId } = ui;

  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [internalZoom, setInternalZoom] = useState(1);
  const zoom = externalZoom !== undefined ? externalZoom : internalZoom;
  const setZoom = onZoomChange || setInternalZoom;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [erroredClips, setErroredClips] = useState(new Set());
  const [livePatch, setLivePatch] = useState(null);
  const loggedErrorsRef = useRef(new Set());

  const { registerMedia } = useMediaSync({ tracks, playhead, isPlaying, masterMuted });

  // Zoom on wheel only when hovering over preview stage
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      setZoom((prev) => {
        const next = Math.min(5, Math.max(0.2, prev * factor));
        const rounded = Math.round(next * 100) / 100;
        return Math.abs(rounded - 1) < 0.05 && factor < 1 && prev > 1 ? 1 : rounded;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  // Pan on drag when zoomed in
  const handlePointerDown = (e) => {
    if (e.target.closest('[data-text-overlay]') || (e.button !== 1 && (e.button !== 0 || zoom <= 1))) return;
    const startX = e.clientX - pan.x;
    const startY = e.clientY - pan.y;
    const onMove = (me) => setPan({ x: me.clientX - startX, y: me.clientY - startY });
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleDoubleClick = (e) => {
    if (!e.target.closest('[data-text-overlay]')) { setZoom(1); setPan({ x: 0, y: 0 }); }
  };

  useEffect(() => {
    if (zoom === 1 && (pan.x !== 0 || pan.y !== 0)) setPan({ x: 0, y: 0 });
  }, [zoom, pan.x, pan.y]);

  useEffect(() => {
    const onPatch = (e) => setLivePatch(e.detail);
    window.addEventListener('editor:preview-clip-patch', onPatch);
    return () => window.removeEventListener('editor:preview-clip-patch', onPatch);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setScale(Math.min(width / (project.width || 1080), height / (project.height || 1920)));
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  const handleMediaError = (clipId) => {
    if (!loggedErrorsRef.current.has(clipId)) {
      loggedErrorsRef.current.add(clipId);
      console.warn(`[Player] Failed to load media for clip: ${clipId}`);
    }
    setErroredClips((prev) => new Set(prev).add(clipId));
  };

  const mediaMap = new Map((media || []).map((m) => [m.id, m]));
  const totalClips = (tracks || []).reduce((sum, t) => sum + (t.clips?.length || 0), 0);

  const mountedClips = [];
  (tracks || []).forEach((track, trackIndex) => {
    if (track.hidden) return;
    (track.clips || []).forEach((clip) => {
      if (playhead >= clip.start - 1.0 && playhead <= clip.start + clip.duration + 1.0) {
        mountedClips.push({ clip, track, trackIndex });
      }
    });
  });

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      onClick={() => dispatch({ type: 'SELECT_CLIP', payload: null })}
      className={`w-full h-full flex items-center justify-center overflow-hidden relative select-none ${
        zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      {zoom !== 1 && (
        <div className="absolute top-2 right-2 z-40 bg-zinc-900/90 border border-zinc-750 px-2 py-0.5 rounded-md text-[10px] text-zinc-300 font-mono shadow-md flex items-center gap-1.5 pointer-events-auto">
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="text-zinc-400 hover:text-[#e31084] underline"
            title="Reset zoom to 100%"
          >
            Reset
          </button>
        </div>
      )}
      <div
        style={{
          width: `${(project.width || 1080) * scale * zoom}px`,
          height: `${(project.height || 1920) * scale * zoom}px`,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          position: 'relative',
        }}
        className="shrink-0 shadow-lg rounded-md overflow-hidden bg-black"
      >
        <div
          style={{
            width: `${project.width || 1080}px`,
            height: `${project.height || 1920}px`,
            transform: `scale(${scale * zoom})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
          className="bg-black overflow-hidden"
        >
          {totalClips === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
              <span className="text-zinc-500 font-mono text-sm mb-2">{project.aspect || '9:16'} Stage</span>
              <p className="text-zinc-400 text-sm font-medium">Add media to the timeline to preview</p>
            </div>
          ) : (
            mountedClips.map(({ clip: rawClip, track, trackIndex }) => {
              if (rawClip.mediaId && state.missingMediaIds?.includes(rawClip.mediaId)) {
                return null;
              }
              const clip = mergeLivePatch(rawClip, livePatch);
              const isActive = playhead >= clip.start && playhead < clip.start + clip.duration;
              const zIndex = (tracks.length - trackIndex) * 10;
              const isSelected = selectedClipId === clip.id;
              const effectiveOpacity = (clip.opacity ?? 1) * computeFadeFactor(clip, playhead);

              if (clip.type === 'text' || clip.type === 'shape') {
                return (
                  <TextOverlay
                    key={clip.id}
                    clip={clip}
                    isSelected={isSelected}
                    isLocked={track.locked}
                    scale={scale * zoom}
                    dispatch={dispatch}
                    effectiveOpacity={effectiveOpacity}
                    zIndex={zIndex}
                    isActive={isActive}
                    playhead={playhead}
                  />
                );
              }

              const mediaItem = mediaMap.get(clip.mediaId);
              const mediaUrl = mediaItem?.url || clip.props?.url || '';
              const tf = getClipTransform(clip);
              const anim = getClipAnimation(clip, playhead);
              const flipH = clip.props?.flipH ? -1 : 1;
              const flipV = clip.props?.flipV ? -1 : 1;

              const finalTx = tf.x + anim.tx;
              const finalTy = tf.y + anim.ty;
              const finalScale = (tf.scale / 100) * anim.scale * anim.motionScale;
              const finalOpacity = isActive ? effectiveOpacity * anim.opacity : 0;

              const visualStyle = {
                transform: `translate(${finalTx}px, ${finalTy}px) scale(${finalScale}) rotate(${tf.rotation}deg) scaleX(${flipH}) scaleY(${flipV})`,
                transformOrigin: 'center',
                filter: `grayscale(${clip.props?.look?.grayscale || 0}%) sepia(${clip.props?.look?.sepia || 0}%) hue-rotate(${clip.props?.look?.hueRotate || 0}deg) blur(${clip.props?.blur || 0}px) brightness(${clip.props?.brightness ?? 100}%) contrast(${clip.props?.contrast ?? 100}%) saturate(${clip.props?.saturation ?? 100}%)`,
                objectFit: clip.props?.fit || 'contain',
                opacity: finalOpacity,
                zIndex,
              };

              if (clip.type === 'video') {
                return (
                  <video key={clip.id} ref={(el) => registerMedia(clip.id, el)} src={mediaUrl || undefined}
                    preload="auto" playsInline controls={false} muted={!isActive || track.muted || masterMuted}
                    onError={() => handleMediaError(clip.id)} className="absolute inset-0 w-full h-full pointer-events-none" style={visualStyle} />
                );
              }
              if (clip.type === 'image') {
                return (
                  <img key={clip.id} src={mediaUrl || undefined} alt={clip.name || ''}
                    onError={() => handleMediaError(clip.id)} className="absolute inset-0 w-full h-full pointer-events-none" style={visualStyle} />
                );
              }
              if (clip.type === 'audio') {
                return (
                  <audio key={clip.id} ref={(el) => registerMedia(clip.id, el)} src={mediaUrl || undefined}
                    preload="auto" muted={!isActive || track.muted || masterMuted} onError={() => handleMediaError(clip.id)} className="hidden" />
                );
              }

              return null;
            })
          )}

          {erroredClips.size > 0 && (
            <div className="absolute top-3 left-3 z-50 px-2 py-1 rounded bg-red-600/90 text-white text-xs font-mono backdrop-blur-xs pointer-events-none">
              Media error ({erroredClips.size})
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
