/**
 * Snapping and auto-scroll utilities for the timeline editor.
 */

export function getSnapPoints(tracks = [], excludeClipId = null, playhead = 0) {
  const points = new Set([0]);
  if (Number.isFinite(playhead) && playhead >= 0) {
    points.add(Number(playhead.toFixed(3)));
  }
  for (const track of tracks) {
    for (const clip of track.clips || []) {
      if (clip.id === excludeClipId) continue;
      points.add(Number(clip.start.toFixed(3)));
      points.add(Number((clip.start + clip.duration).toFixed(3)));
    }
  }
  return Array.from(points).sort((a, b) => a - b);
}

export function snapTime(time, points = [], pxPerSec = 50, thresholdPx = 8) {
  const thresholdSec = thresholdPx / pxPerSec;
  let closest = null;
  let minDiff = Infinity;

  for (const pt of points) {
    const diff = Math.abs(pt - time);
    if (diff <= thresholdSec && diff < minDiff) {
      minDiff = diff;
      closest = pt;
    }
  }

  if (closest !== null) {
    return { time: closest, snapped: true, diff: closest - time, guideline: closest };
  }
  return { time, snapped: false, diff: 0, guideline: null };
}

export function startAutoScroll(scrollEl, getPointerX) {
  if (!scrollEl) return () => {};
  let animId = null;

  const loop = () => {
    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      const x = getPointerX();
      if (x < rect.left + 40 && scrollEl.scrollLeft > 0) {
        scrollEl.scrollLeft = Math.max(0, scrollEl.scrollLeft - 12);
      } else if (x > rect.right - 40) {
        scrollEl.scrollLeft += 12;
      }
    }
    animId = requestAnimationFrame(loop);
  };

  animId = requestAnimationFrame(loop);
  return () => {
    if (animId) cancelAnimationFrame(animId);
  };
}

