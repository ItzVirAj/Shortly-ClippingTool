import { useEffect, useRef, useCallback } from 'react';
import { getActiveClips, getClipSourceTime, clamp } from './editorUtils';

function clampSeek(target, elDuration) {
  if (Number.isFinite(elDuration) && elDuration > 0.05) {
    return Math.max(0, Math.min(elDuration - 0.05, target));
  }
  return Math.max(0, target);
}

function getEffectiveVolume(clip, playhead) {
  const fadeIn = clip.props?.fadeIn || 0;
  const fadeOut = clip.props?.fadeOut || 0;
  let fadeFactor = 1;
  const t = playhead;
  const start = clip.start;
  const end = clip.start + clip.duration;
  if (fadeIn > 0 && t >= start && t < start + fadeIn) {
    fadeFactor = Math.min(fadeFactor, Math.max(0, (t - start) / fadeIn));
  }
  if (fadeOut > 0 && t > end - fadeOut && t <= end) {
    fadeFactor = Math.min(fadeFactor, Math.max(0, (end - t) / fadeOut));
  }
  return clamp((clip.volume ?? 1) * fadeFactor, 0, 1);
}

export function useMediaSync({ tracks, playhead, isPlaying, masterMuted }) {
  const mediaMap = useRef(new Map());
  const prevPlayingRef = useRef(isPlaying);
  const livePatchRef = useRef(null);

  const registerMedia = useCallback((clipId, el) => {
    if (el) {
      mediaMap.current.set(clipId, el);
    } else {
      mediaMap.current.delete(clipId);
    }
  }, []);

  useEffect(() => {
    const onPatch = (e) => {
      livePatchRef.current = e.detail;
      if (e.detail?.clipId) {
        const el = mediaMap.current.get(e.detail.clipId);
        if (el) {
          const loc = tracks.flatMap((t) => t.clips || []).find((c) => c.id === e.detail.clipId);
          if (loc) {
            const p = { ...loc, ...e.detail.patch, props: { ...loc.props, ...e.detail.patch.props } };
            el.volume = getEffectiveVolume(p, playhead);
          }
        }
      }
    };
    window.addEventListener('editor:preview-clip-patch', onPatch);
    return () => window.removeEventListener('editor:preview-clip-patch', onPatch);
  }, [tracks, playhead]);

  // Play / Pause state transitions
  useEffect(() => {
    prevPlayingRef.current = isPlaying;
    const activeList = getActiveClips(tracks, playhead);
    const activeIds = new Set(activeList.map((a) => a.clip.id));

    if (isPlaying) {
      activeList.forEach(({ clip: rawClip, track }) => {
        const clip = livePatchRef.current?.clipId === rawClip.id
          ? { ...rawClip, ...livePatchRef.current.patch, props: { ...rawClip.props, ...livePatchRef.current.patch.props } }
          : rawClip;
        const el = mediaMap.current.get(clip.id);
        if (el) {
          el.muted = Boolean(track.muted || masterMuted);
          el.volume = getEffectiveVolume(clip, playhead);
          el.playbackRate = clamp(clip.speed || 1, 0.0625, 16);
          el.currentTime = clampSeek(getClipSourceTime(clip, playhead), el.duration);
          el.play().catch(() => {});
        }
      });
      mediaMap.current.forEach((el, id) => {
        if (!activeIds.has(id) && !el.paused) el.pause();
      });
    } else {
      mediaMap.current.forEach((el) => {
        if (!el.paused) el.pause();
      });
      activeList.forEach(({ clip }) => {
        const el = mediaMap.current.get(clip.id);
        if (el) el.currentTime = clampSeek(getClipSourceTime(clip, playhead), el.duration);
      });
    }
  }, [isPlaying]);

  // Playhead updates (playback sync + drift correction & scrubbing)
  useEffect(() => {
    const activeList = getActiveClips(tracks, playhead);
    const activeIds = new Set(activeList.map((a) => a.clip.id));

    if (isPlaying) {
      activeList.forEach(({ clip: rawClip, track }) => {
        const clip = livePatchRef.current?.clipId === rawClip.id
          ? { ...rawClip, ...livePatchRef.current.patch, props: { ...rawClip.props, ...livePatchRef.current.patch.props } }
          : rawClip;
        const el = mediaMap.current.get(clip.id);
        if (!el) return;

        el.muted = Boolean(track.muted || masterMuted);
        el.volume = getEffectiveVolume(clip, playhead);
        el.playbackRate = clamp(clip.speed || 1, 0.0625, 16);

        const expected = clampSeek(getClipSourceTime(clip, playhead), el.duration);
        const drift = Math.abs(el.currentTime - expected);

        if (el.paused) {
          el.currentTime = expected;
          el.play().catch(() => {});
        } else if (el.seeking) {
          if (drift > 1.0) el.currentTime = expected;
        } else if (drift > 0.25) {
          el.currentTime = expected;
        }
      });

      mediaMap.current.forEach((el, id) => {
        if (!activeIds.has(id) && !el.paused) el.pause();
      });
    } else {
      activeList.forEach(({ clip: rawClip, track }) => {
        const clip = livePatchRef.current?.clipId === rawClip.id
          ? { ...rawClip, ...livePatchRef.current.patch, props: { ...rawClip.props, ...livePatchRef.current.patch.props } }
          : rawClip;
        const el = mediaMap.current.get(clip.id);
        if (el) {
          el.muted = Boolean(track.muted || masterMuted);
          el.volume = getEffectiveVolume(clip, playhead);
          const target = clampSeek(getClipSourceTime(clip, playhead), el.duration);
          if (Math.abs(el.currentTime - target) > 0.02) el.currentTime = target;
        }
      });
    }
  }, [playhead, isPlaying, tracks, masterMuted]);

  useEffect(() => {
    return () => {
      mediaMap.current.forEach((el) => {
        try { if (!el.paused) el.pause(); } catch (_) {}
      });
      mediaMap.current.clear();
    };
  }, []);

  return { registerMedia };
}
