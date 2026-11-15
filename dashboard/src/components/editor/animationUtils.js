import { clamp } from './editorUtils';

function ease(p) {
  return 1 - Math.pow(1 - p, 3);
}

export function getClipAnimation(clip, playhead) {
  const result = {
    opacity: 1,
    tx: 0,
    ty: 0,
    scale: 1,
    motionScale: 1,
  };

  if (!clip || !Number.isFinite(clip.start) || !Number.isFinite(clip.duration) || clip.duration <= 0) {
    return result;
  }

  const tl = playhead - clip.start;
  const d = clip.duration;

  // Transitions In and Out
  const tIn = clip.props?.transitionIn;
  const tOut = clip.props?.transitionOut;

  let rawIn = tIn?.type && tIn.type !== 'none' ? Number(tIn.duration ?? 0.5) : 0;
  let rawOut = tOut?.type && tOut.type !== 'none' ? Number(tOut.duration ?? 0.5) : 0;

  const totalT = rawIn + rawOut;
  if (totalT > d && totalT > 0) {
    const factor = d / totalT;
    rawIn *= factor;
    rawOut *= factor;
  }

  // Transition In
  if (rawIn > 0 && tl < rawIn) {
    const p = ease(clamp(tl / rawIn, 0, 1));
    const type = tIn.type;
    if (type === 'fade') {
      result.opacity *= p;
    } else if (type === 'slideLeft') {
      result.tx += -1080 * (1 - p);
    } else if (type === 'slideRight') {
      result.tx += 1080 * (1 - p);
    } else if (type === 'slideUp') {
      result.ty += 1920 * (1 - p);
    } else if (type === 'zoom') {
      result.scale *= 0.5 + 0.5 * p;
      result.opacity *= p;
    }
  }

  // Transition Out
  if (rawOut > 0 && tl > d - rawOut) {
    const p = ease(clamp((d - tl) / rawOut, 0, 1));
    const type = tOut.type;
    if (type === 'fade') {
      result.opacity *= p;
    } else if (type === 'slideLeft') {
      result.tx += -1080 * (1 - p);
    } else if (type === 'slideRight') {
      result.tx += 1080 * (1 - p);
    } else if (type === 'slideUp') {
      result.ty += 1920 * (1 - p);
    } else if (type === 'zoom') {
      result.scale *= 0.5 + 0.5 * p;
      result.opacity *= p;
    }
  }

  // Motion effect (video and image only)
  const motion = clip.props?.motion;
  if (motion?.type && motion.type !== 'none' && (clip.type === 'video' || clip.type === 'image')) {
    const amount = Number(motion.amount ?? 20) / 100;
    const progress = clamp(tl / d, 0, 1);
    if (motion.type === 'zoomIn') {
      result.motionScale = 1 + amount * progress;
    } else if (motion.type === 'zoomOut') {
      result.motionScale = 1 + amount * (1 - progress);
    } else if (motion.type === 'punch') {
      result.motionScale = 1 + amount * ease(clamp(tl / 0.4, 0, 1));
    }
  }

  return result;
}

