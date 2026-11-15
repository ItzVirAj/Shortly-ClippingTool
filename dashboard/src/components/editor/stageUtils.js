export function mergeLivePatch(rawClip, livePatch) {
  if (livePatch?.clipId !== rawClip.id) return rawClip;
  return {
    ...rawClip,
    ...livePatch.patch,
    props: {
      ...rawClip.props,
      ...livePatch.patch.props,
      style: { ...rawClip.props?.style, ...livePatch.patch.props?.style },
      bg: { ...rawClip.props?.bg, ...livePatch.patch.props?.bg },
      stroke: { ...rawClip.props?.stroke, ...livePatch.patch.props?.stroke },
      shadow: { ...rawClip.props?.shadow, ...livePatch.patch.props?.shadow },
      shape: { ...rawClip.props?.shape, ...livePatch.patch.props?.shape },
      look: { ...rawClip.props?.look, ...livePatch.patch.props?.look },
      transform: { ...rawClip.props?.transform, ...livePatch.patch.props?.transform },
    },
  };
}

export function computeFadeFactor(clip, playhead) {
  const fadeIn = clip.props?.fadeIn || 0;
  const fadeOut = clip.props?.fadeOut || 0;
  let factor = 1;
  const t = playhead;
  const start = clip.start;
  const end = clip.start + clip.duration;
  if (fadeIn > 0 && t >= start && t < start + fadeIn) factor = Math.min(factor, Math.max(0, (t - start) / fadeIn));
  if (fadeOut > 0 && t > end - fadeOut && t <= end) factor = Math.min(factor, Math.max(0, (end - t) / fadeOut));
  return factor;
}

