import { useState, useRef, useEffect, useCallback } from 'react';
import { canPlaceClipOnTrack, isRangeFree } from './editorUtils';
import { getSnapPoints, snapTime, startAutoScroll } from './snapUtils';

export function useClipDrag({ tracks, media, ui, dispatch, scrollRef }) {
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);
  const stopScrollRef = useRef(null);

  const cleanup = useCallback(() => {
    if (stopScrollRef.current) {
      stopScrollRef.current();
      stopScrollRef.current = null;
    }
    dragRef.current = null;
    setDragState(null);
  }, []);

  const handleClipPointerDown = useCallback((e, clip, track, mode) => {
    if (e.button !== 0 || track.locked || track.hidden) return;
    e.stopPropagation();

    const targetEl = e.currentTarget;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch (_) {}

    dispatch({ type: 'SELECT_CLIP', payload: clip.id });

    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = clip.start;
    const origDuration = clip.duration;
    const origInPoint = clip.inPoint || 0;
    const clipSpeed = clip.speed || 1;

    const mediaItem = clip.mediaId ? (media || []).find((m) => m.id === clip.mediaId) : null;
    const isMediaConstrained = mediaItem && (clip.type === 'video' || clip.type === 'audio') && Number.isFinite(mediaItem.duration);
    const maxSourceDur = isMediaConstrained ? (mediaItem.duration - origInPoint) / clipSpeed : Infinity;

    let hasMoved = false;
    let latestX = startX;

    const onPointerMove = (moveEvt) => {
      latestX = moveEvt.clientX;
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;

      if (!hasMoved) {
        if (Math.hypot(dx, dy) <= 3) return;
        hasMoved = true;
        stopScrollRef.current = startAutoScroll(scrollRef.current, () => latestX);
      }

      const snapPoints = getSnapPoints(tracks, clip.id, ui.playhead);
      const shouldSnap = ui.snapEnabled && !moveEvt.altKey;

      if (mode === 'move') {
        const rawStart = Math.max(0, origStart + dx / ui.pxPerSec);
        let snappedStart = rawStart;
        let guideline = null;

        if (shouldSnap) {
          const snapL = snapTime(rawStart, snapPoints, ui.pxPerSec, 8);
          const snapR = snapTime(rawStart + origDuration, snapPoints, ui.pxPerSec, 8);
          if (snapL.snapped && snapR.snapped) {
            if (Math.abs(snapL.diff) <= Math.abs(snapR.diff)) {
              snappedStart = snapL.time;
              guideline = snapL.time;
            } else {
              snappedStart = Math.max(0, snapR.time - origDuration);
              guideline = snapR.time;
            }
          } else if (snapL.snapped) {
            snappedStart = snapL.time;
            guideline = snapL.time;
          } else if (snapR.snapped) {
            snappedStart = Math.max(0, snapR.time - origDuration);
            guideline = snapR.time;
          }
        }

        let targetTrack = track;
        if (scrollRef.current) {
          const laneEls = scrollRef.current.querySelectorAll('[data-lane-track-id]');
          for (const el of laneEls) {
            const r = el.getBoundingClientRect();
            if (moveEvt.clientY >= r.top && moveEvt.clientY <= r.bottom) {
              const tid = el.getAttribute('data-lane-track-id');
              const cand = tracks.find((t) => t.id === tid);
              if (cand && canPlaceClipOnTrack(clip.type, cand.type) && !cand.locked) {
                targetTrack = cand;
              }
              break;
            }
          }
        }

        const isTypeValid = canPlaceClipOnTrack(clip.type, targetTrack.type) && !targetTrack.locked;
        const isFree = isRangeFree(targetTrack, snappedStart, origDuration, clip.id);
        const stateData = {
          clipId: clip.id, mode: 'move', origTrackId: track.id, targetTrackId: targetTrack.id,
          liveStart: snappedStart, liveDuration: origDuration, isValid: isTypeValid && isFree,
          isDragging: true, guideline,
        };
        dragRef.current = stateData;
        setDragState(stateData);
      } else if (mode === 'trim-left') {
        const rawStart = Math.max(0, origStart + dx / ui.pxPerSec);
        let snappedStart = rawStart;
        let guideline = null;

        if (shouldSnap) {
          const res = snapTime(rawStart, snapPoints, ui.pxPerSec, 8);
          if (res.snapped) {
            snappedStart = res.time;
            guideline = res.time;
          }
        }

        const newDur = Number((origStart + origDuration - snappedStart).toFixed(3));
        const newInPoint = Number((origInPoint + (snappedStart - origStart) * clipSpeed).toFixed(3));
        let isValid = snappedStart >= 0 && newDur >= 0.1 && newInPoint >= 0 && isRangeFree(track, snappedStart, newDur, clip.id);
        if (isMediaConstrained && newInPoint + newDur * clipSpeed > mediaItem.duration + 1e-3) {
          isValid = false;
        }

        const stateData = {
          clipId: clip.id, mode: 'trim-left', origTrackId: track.id, targetTrackId: track.id,
          liveStart: snappedStart, liveDuration: Math.max(0.1, newDur), isValid,
          isDragging: true, guideline,
        };
        dragRef.current = stateData;
        setDragState(stateData);
      } else if (mode === 'trim-right') {
        const rawEnd = origStart + origDuration + dx / ui.pxPerSec;
        let snappedEnd = rawEnd;
        let guideline = null;

        if (shouldSnap) {
          const res = snapTime(rawEnd, snapPoints, ui.pxPerSec, 8);
          if (res.snapped) {
            snappedEnd = res.time;
            guideline = res.time;
          }
        }

        const newDur = Number((snappedEnd - origStart).toFixed(3));
        let isValid = newDur >= 0.1 && isRangeFree(track, origStart, newDur, clip.id);
        if (isMediaConstrained && newDur > maxSourceDur + 1e-3) {
          isValid = false;
        }

        const stateData = {
          clipId: clip.id, mode: 'trim-right', origTrackId: track.id, targetTrackId: track.id,
          liveStart: origStart, liveDuration: Math.max(0.1, newDur), isValid,
          isDragging: true, guideline,
        };
        dragRef.current = stateData;
        setDragState(stateData);
      }
    };

    const tearDownListeners = () => {
      targetEl.removeEventListener('pointermove', onPointerMove);
      targetEl.removeEventListener('pointerup', onPointerUp);
      targetEl.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      try {
        targetEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };

    const onPointerUp = () => {
      tearDownListeners();
      const current = dragRef.current;
      cleanup();
      if (!hasMoved || !current || !current.isValid) return;

      if (current.mode === 'move') {
        dispatch({
          type: 'MOVE_CLIP',
          payload: {
            clipId: clip.id,
            newStart: current.liveStart,
            newTrackId: current.targetTrackId !== track.id ? current.targetTrackId : undefined,
          },
        });
      } else if (current.mode === 'trim-left') {
        dispatch({
          type: 'TRIM_CLIP',
          payload: { clipId: clip.id, side: 'left', newTime: current.liveStart },
        });
      } else if (current.mode === 'trim-right') {
        dispatch({
          type: 'TRIM_CLIP',
          payload: { clipId: clip.id, side: 'right', newTime: current.liveStart + current.liveDuration },
        });
      }
    };

    const onKeyDown = (kEvt) => {
      if (kEvt.key === 'Escape') {
        tearDownListeners();
        cleanup();
      }
    };

    targetEl.addEventListener('pointermove', onPointerMove);
    targetEl.addEventListener('pointerup', onPointerUp);
    targetEl.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
  }, [tracks, media, ui.pxPerSec, ui.playhead, ui.snapEnabled, dispatch, scrollRef, cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return { dragState, handleClipPointerDown };
}

