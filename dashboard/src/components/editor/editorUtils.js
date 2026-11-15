/**
 * Editor pure utility functions and reducer logic helpers.
 */

export const DEFAULT_TRANSFORM = { x: 0, y: 0, scale: 100, rotation: 0 };

export function uid() { return 'id_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36); }
export function clamp(val, min, max) { return Number.isNaN(val) ? min : Math.max(min, Math.min(max, val)); }
export function rangesOverlap(sA, dA, sB, dB) { return Math.max(sA, sB) < Math.min(sA + dA, sB + dB) - 1e-4; }
export function canPlaceClipOnTrack(cT, tT) { if (cT === 'shape') return tT === 'overlay'; return cT === 'image' ? (tT === 'video' || tT === 'overlay') : cT === tT; }
export function cloneSnapshot(media, tracks) { return { media: JSON.parse(JSON.stringify(media)), tracks: JSON.parse(JSON.stringify(tracks)) }; }

export function hexToRgba(hex = '#000000', opacity = 1) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16);
  if (Number.isNaN(num)) return `rgba(0, 0, 0, ${opacity})`;
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${opacity})`;
}

export function formatTimecode(seconds = 0, fps = 30) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const fRate = Math.max(1, fps || 30);
  const totalF = Math.floor(seconds * fRate);
  const s = Math.floor(seconds);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, totalF % fRate].map((n) => String(n).padStart(2, '0')).join(':');
}

export function getProjectDuration(tracks = []) {
  let maxD = 0;
  for (const t of tracks) for (const c of t.clips || []) if ((c.start || 0) + (c.duration || 0) > maxD) maxD = c.start + c.duration;
  return Number(maxD.toFixed(3));
}

export function getActiveClips(tracks = [], time = 0) {
  const active = [];
  (tracks || []).forEach((track, trackIndex) => {
    if (track.hidden) return;
    (track.clips || []).forEach((clip) => {
      if (time >= clip.start && time < clip.start + clip.duration) active.push({ clip, track, trackIndex });
    });
  });
  return active;
}

export function getClipSourceTime(clip, time = 0) {
  return (clip?.inPoint || 0) + (time - (clip?.start || 0)) * (clip?.speed || 1);
}

export function getClipTransform(clip) {
  const t = clip?.props?.transform;
  return { x: t?.x ?? DEFAULT_TRANSFORM.x, y: t?.y ?? DEFAULT_TRANSFORM.y, scale: t?.scale ?? DEFAULT_TRANSFORM.scale, rotation: t?.rotation ?? DEFAULT_TRANSFORM.rotation };
}

export function isRangeFree(track, start, duration, excludeClipId = null) {
  if (start < 0 || duration < 0.1) return false;
  return !(track.clips || []).some((c) => c.id !== excludeClipId && rangesOverlap(start, duration, c.start, c.duration));
}

export function findNextFreeGap(track, preferredStart, duration, excludeClipId = null) {
  const clips = (track.clips || []).filter((c) => c.id !== excludeClipId).sort((a, b) => a.start - b.start);
  if (!clips.length || isRangeFree(track, preferredStart, duration, excludeClipId)) return Math.max(0, preferredStart);
  for (const c of clips) {
    const cand = Math.max(preferredStart, c.start + c.duration);
    if (isRangeFree(track, cand, duration, excludeClipId)) return cand;
  }
  return Math.max(preferredStart, clips[clips.length - 1].start + clips[clips.length - 1].duration);
}

export function findClipAndTrack(tracks, clipId) {
  for (const track of tracks) {
    const clip = (track.clips || []).find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export function addClipHelper(tracks, trackId, clip) {
  let currentTracks = tracks;
  let targetTrack = currentTracks.find((t) => t.id === trackId);
  if (!targetTrack) {
    targetTrack = { id: trackId || uid(), name: clip.type === 'shape' ? 'Overlay 1' : clip.type === 'text' ? 'Text 1' : 'Video 1', type: clip.type === 'shape' ? 'overlay' : clip.type === 'text' ? 'text' : 'video', locked: false, muted: false, hidden: false, clips: [] };
    currentTracks = [...currentTracks, targetTrack];
  }
  if (targetTrack.locked || !canPlaceClipOnTrack(clip.type, targetTrack.type)) return null;
  if (clip.start < 0 || clip.duration < 0.1 || !isRangeFree(targetTrack, clip.start, clip.duration)) return null;
  const fullClip = {
    id: clip.id || uid(), mediaId: clip.mediaId || null, type: clip.type,
    start: Number(clip.start.toFixed(3)), duration: Number(clip.duration.toFixed(3)),
    inPoint: Number((clip.inPoint || 0).toFixed(3)), speed: clip.speed || 1,
    volume: clip.volume ?? 1, opacity: clip.opacity ?? 1, props: clip.props || {},
    name: clip.name || `${clip.type.charAt(0).toUpperCase() + clip.type.slice(1)} Clip`,
  };
  return { newTracks: currentTracks.map((t) => (t.id === targetTrack.id ? { ...t, clips: [...t.clips, fullClip] } : t)), newClip: fullClip };
}

export function moveClipHelper(tracks, clipId, newStart, newTrackId) {
  const loc = findClipAndTrack(tracks, clipId);
  if (!loc || loc.track.locked) return null;
  const target = newTrackId ? tracks.find((t) => t.id === newTrackId) : loc.track;
  if (!target || target.locked || !canPlaceClipOnTrack(loc.clip.type, target.type) || newStart < 0 || !isRangeFree(target, newStart, loc.clip.duration, clipId)) return null;
  const moved = { ...loc.clip, start: Number(newStart.toFixed(3)) };
  return tracks.map((t) => {
    if (t.id === loc.track.id && t.id === target.id) return { ...t, clips: t.clips.map((c) => (c.id === clipId ? moved : c)) };
    if (t.id === loc.track.id) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
    if (t.id === target.id) return { ...t, clips: [...t.clips, moved] };
    return t;
  });
}

export function trimClipHelper(tracks, clipId, side, newTime, media = []) {
  const loc = findClipAndTrack(tracks, clipId);
  if (!loc || loc.track.locked) return null;
  const { clip, track } = loc;
  const item = clip.mediaId ? (media || []).find((m) => m.id === clip.mediaId) : null;
  const isC = item && (clip.type === 'video' || clip.type === 'audio') && Number.isFinite(item.duration);

  if (side === 'left') {
    const s = Number(newTime.toFixed(3));
    const d = Number((clip.start + clip.duration - s).toFixed(3));
    const inP = Number((clip.inPoint + (s - clip.start) * (clip.speed || 1)).toFixed(3));
    if (inP < 0 || d < 0.1 || s < 0 || !isRangeFree(track, s, d, clipId) || (isC && inP + d * (clip.speed || 1) > item.duration + 1e-3)) return null;
    return tracks.map((t) => (t.id === track.id ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...clip, start: s, duration: d, inPoint: inP } : c)) } : t));
  } else if (side === 'right') {
    const d = Number((newTime - clip.start).toFixed(3));
    if (d < 0.1 || !isRangeFree(track, clip.start, d, clipId) || (isC && d > (item.duration - (clip.inPoint || 0)) / (clip.speed || 1) + 1e-3)) return null;
    return tracks.map((t) => (t.id === track.id ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...clip, duration: d } : c)) } : t));
  }
  return null;
}

export function updateClipHelper(tracks, clipId, patch, media = []) {
  const loc = findClipAndTrack(tracks, clipId);
  if (!loc || loc.track.locked || !patch) return null;
  const { clip, track } = loc;
  const res = { ...clip };

  if (typeof patch.name === 'string') res.name = patch.name.trim().slice(0, 60);
  if (patch.volume !== undefined) res.volume = clamp(Number(patch.volume), 0, 2);
  if (patch.opacity !== undefined) res.opacity = clamp(Number(patch.opacity), 0, 1);
  if (patch.inPoint !== undefined) res.inPoint = Number(clamp(Number(patch.inPoint), 0, 99999).toFixed(3));

  let tStart = patch.start !== undefined ? Number(clamp(Number(patch.start), 0, 99999).toFixed(3)) : clip.start;
  let tDur = patch.duration !== undefined ? Number(clamp(Number(patch.duration), 0.1, 99999).toFixed(3)) : clip.duration;
  let tSpeed = clip.speed || 1;

  if (patch.speed !== undefined && (clip.type === 'video' || clip.type === 'audio')) {
    tSpeed = clamp(Number(patch.speed), 0.25, 4);
    if (patch.duration === undefined && tSpeed !== (clip.speed || 1)) tDur = Number(((clip.duration * (clip.speed || 1)) / tSpeed).toFixed(3));
  }
  res.speed = tSpeed; res.start = tStart; res.duration = tDur;
  if (res.duration < 0.1 || !isRangeFree(track, res.start, res.duration, clip.id)) return null;

  const item = clip.mediaId ? (media || []).find((m) => m.id === clip.mediaId) : null;
  if (item && (clip.type === 'video' || clip.type === 'audio') && Number.isFinite(item.duration)) {
    if (res.duration > (item.duration - (res.inPoint || 0)) / res.speed + 1e-3 || res.inPoint < 0) return null;
  }

  const oP = clip.props || {}; const pP = patch.props || {};
  const oT = oP.transform || DEFAULT_TRANSFORM; const pT = pP.transform || {};
  const oS = oP.style || {}; const pS = pP.style || {};
  const oBg = oP.bg || {}; const pBg = pP.bg || {};
  const oSt = oP.stroke || {}; const pSt = pP.stroke || {};
  const oSh = oP.shadow || {}; const pSh = pP.shadow || {};
  const oLk = oP.look || {}; const pLk = pP.look || {};
  const oMo = oP.motion || {}; const pMo = pP.motion || {};
  const oIn = oP.transitionIn || {}; const pIn = pP.transitionIn || {};
  const oOut = oP.transitionOut || {}; const pOut = pP.transitionOut || {};
  const oSp = oP.shape || {}; const pSp = pP.shape || {};
  const oSpSt = oSp.stroke || {}; const pSpSt = pSp.stroke || {};

  const cleanHex = (v, fb) => (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v) ? v.toUpperCase() : fb);

  res.props = {
    ...oP, ...pP,
    text: typeof pP.text === 'string' ? pP.text.slice(0, 500) : (oP.text ?? 'Your text here'),
    style: {
      ...oS, ...pS,
      fontFamily: typeof pS.fontFamily === 'string' ? pS.fontFamily : (oS.fontFamily || 'Montserrat'),
      fontSize: pS.fontSize !== undefined ? clamp(Number(pS.fontSize), 16, 300) : (oS.fontSize ?? 72),
      fontWeight: [400, 700, 900].includes(Number(pS.fontWeight)) ? Number(pS.fontWeight) : (oS.fontWeight ?? 700),
      italic: pS.italic !== undefined ? Boolean(pS.italic) : (oS.italic ?? false),
      color: pS.color !== undefined ? cleanHex(pS.color, oS.color || '#FFFFFF') : (oS.color || '#FFFFFF'),
      align: ['left', 'center', 'right'].includes(pS.align) ? pS.align : (oS.align || 'center'),
      lineHeight: pS.lineHeight !== undefined ? clamp(Number(pS.lineHeight), 0.8, 2.5) : (oS.lineHeight ?? 1.2),
      letterSpacing: pS.letterSpacing !== undefined ? clamp(Number(pS.letterSpacing), -5, 40) : (oS.letterSpacing ?? 0),
      uppercase: pS.uppercase !== undefined ? Boolean(pS.uppercase) : (oS.uppercase ?? false),
      boxWidth: pS.boxWidth !== undefined ? clamp(Number(pS.boxWidth), 200, 1080) : (oS.boxWidth ?? 900),
    },
    bg: {
      ...oBg, ...pBg,
      enabled: pBg.enabled !== undefined ? Boolean(pBg.enabled) : (oBg.enabled ?? false),
      color: pBg.color !== undefined ? cleanHex(pBg.color, oBg.color || '#000000') : (oBg.color || '#000000'),
      opacity: pBg.opacity !== undefined ? clamp(Number(pBg.opacity), 0, 100) : (oBg.opacity ?? 100),
      padding: pBg.padding !== undefined ? clamp(Number(pBg.padding), 0, 120) : (oBg.padding ?? 24),
      radius: pBg.radius !== undefined ? clamp(Number(pBg.radius), 0, 120) : (oBg.radius ?? 24),
    },
    stroke: {
      ...oSt, ...pSt,
      enabled: pSt.enabled !== undefined ? Boolean(pSt.enabled) : (oSt.enabled ?? false),
      color: pSt.color !== undefined ? cleanHex(pSt.color, oSt.color || '#000000') : (oSt.color || '#000000'),
      width: pSt.width !== undefined ? clamp(Number(pSt.width), 0, 20) : (oSt.width ?? 4),
    },
    shadow: {
      ...oSh, ...pSh,
      enabled: pSh.enabled !== undefined ? Boolean(pSh.enabled) : (oSh.enabled ?? false),
      color: pSh.color !== undefined ? cleanHex(pSh.color, oSh.color || '#000000') : (oSh.color || '#000000'),
      blur: pSh.blur !== undefined ? clamp(Number(pSh.blur), 0, 40) : (oSh.blur ?? 8),
      offsetX: pSh.offsetX !== undefined ? clamp(Number(pSh.offsetX), -40, 40) : (oSh.offsetX ?? 0),
      offsetY: pSh.offsetY !== undefined ? clamp(Number(pSh.offsetY), -40, 40) : (oSh.offsetY ?? 4),
    },
    look: {
      ...oLk, ...pLk,
      grayscale: pLk.grayscale !== undefined ? clamp(Number(pLk.grayscale), 0, 100) : (oLk.grayscale ?? 0),
      sepia: pLk.sepia !== undefined ? clamp(Number(pLk.sepia), 0, 100) : (oLk.sepia ?? 0),
      hueRotate: pLk.hueRotate !== undefined ? clamp(Number(pLk.hueRotate), -180, 180) : (oLk.hueRotate ?? 0),
    },
    motion: {
      ...oMo, ...pMo,
      type: ['none', 'zoomIn', 'zoomOut', 'punch'].includes(pMo.type) ? pMo.type : (oMo.type || 'none'),
      amount: pMo.amount !== undefined ? clamp(Number(pMo.amount), 5, 60) : (oMo.amount ?? 20),
    },
    transitionIn: {
      ...oIn, ...pIn,
      type: ['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'zoom'].includes(pIn.type) ? pIn.type : (oIn.type || 'none'),
      duration: pIn.duration !== undefined ? clamp(Number(pIn.duration), 0.1, 2) : (oIn.duration ?? 0.5),
    },
    transitionOut: {
      ...oOut, ...pOut,
      type: ['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'zoom'].includes(pOut.type) ? pOut.type : (oOut.type || 'none'),
      duration: pOut.duration !== undefined ? clamp(Number(pOut.duration), 0.1, 2) : (oOut.duration ?? 0.5),
    },
    shape: {
      ...oSp, ...pSp,
      kind: ['rect', 'circle', 'line', 'progress'].includes(pSp.kind) ? pSp.kind : (oSp.kind || 'rect'),
      width: pSp.width !== undefined ? clamp(Number(pSp.width), 1, 2000) : (oSp.width ?? 400),
      height: pSp.height !== undefined ? clamp(Number(pSp.height), 1, 2000) : (oSp.height ?? 400),
      fill: pSp.fill !== undefined ? cleanHex(pSp.fill, oSp.fill || '#FFFFFF') : (oSp.fill || '#FFFFFF'),
      fillOpacity: pSp.fillOpacity !== undefined ? clamp(Number(pSp.fillOpacity), 0, 100) : (oSp.fillOpacity ?? 100),
      radius: pSp.radius !== undefined ? clamp(Number(pSp.radius), 0, 500) : (oSp.radius ?? 0),
      trackColor: typeof pSp.trackColor === 'string' ? pSp.trackColor : (oSp.trackColor || '#FFFFFF4D'),
      stroke: {
        ...oSpSt, ...pSpSt,
        enabled: pSpSt.enabled !== undefined ? Boolean(pSpSt.enabled) : (oSpSt.enabled ?? false),
        color: pSpSt.color !== undefined ? cleanHex(pSpSt.color, oSpSt.color || '#000000') : (oSpSt.color || '#000000'),
        width: pSpSt.width !== undefined ? clamp(Number(pSpSt.width), 0, 30) : (oSpSt.width ?? 4),
      },
    },
    transform: {
      x: pT.x !== undefined ? clamp(Number(pT.x), -2000, 2000) : (oT.x ?? 0),
      y: pT.y !== undefined ? clamp(Number(pT.y), -2000, 2000) : (oT.y ?? 0),
      scale: pT.scale !== undefined ? clamp(Number(pT.scale), 10, 400) : (oT.scale ?? 100),
      rotation: pT.rotation !== undefined ? clamp(Number(pT.rotation), -360, 360) : (oT.rotation ?? 0),
    },
    fit: ['contain', 'cover', 'fill'].includes(pP.fit) ? pP.fit : (oP.fit || 'contain'),
    flipH: pP.flipH !== undefined ? Boolean(pP.flipH) : (oP.flipH || false),
    flipV: pP.flipV !== undefined ? Boolean(pP.flipV) : (oP.flipV || false),
    blur: pP.blur !== undefined ? clamp(Number(pP.blur), 0, 40) : (oP.blur ?? 0),
    brightness: pP.brightness !== undefined ? clamp(Number(pP.brightness), 0, 200) : (oP.brightness ?? 100),
    contrast: pP.contrast !== undefined ? clamp(Number(pP.contrast), 0, 200) : (oP.contrast ?? 100),
    saturation: pP.saturation !== undefined ? clamp(Number(pP.saturation), 0, 200) : (oP.saturation ?? 100),
    fadeIn: pP.fadeIn !== undefined ? Math.max(0, Number(pP.fadeIn)) : (oP.fadeIn ?? 0),
    fadeOut: pP.fadeOut !== undefined ? Math.max(0, Number(pP.fadeOut)) : (oP.fadeOut ?? 0),
  };

  return tracks.map((t) => (t.id === track.id ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? res : c)) } : t));
}

export function addTextClip(preset, state, dispatch, customText = null) {
  const targetTrack = (state.tracks || []).find((t) => t.type === 'text' && !t.locked);
  let trackId = targetTrack?.id;
  const playhead = state.ui?.playhead || 0;
  const duration = preset.duration || 3;
  if (!targetTrack) { trackId = uid(); dispatch({ type: 'ADD_TRACK', payload: { id: trackId, type: 'text', name: 'Text 1' } }); }
  let start = playhead;
  if (targetTrack && !isRangeFree(targetTrack, playhead, duration)) {
    start = (targetTrack.clips || []).reduce((max, c) => Math.max(max, c.start + c.duration), 0);
  }
  const clipId = uid();
  const fullProps = {
    text: customText || preset.props?.text || 'Your text here',
    style: { ...preset.props?.style }, bg: { ...preset.props?.bg },
    stroke: { ...preset.props?.stroke }, shadow: { ...preset.props?.shadow },
    transform: { x: 0, y: 0, scale: 100, rotation: 0 }, fadeIn: 0, fadeOut: 0,
  };
  dispatch({
    type: 'ADD_CLIP',
    payload: { trackId, clip: { id: clipId, type: 'text', mediaId: null, start, duration, inPoint: 0, speed: 1, volume: 1, opacity: 1, name: preset.label || 'Text', props: fullProps } },
  });
  dispatch({ type: 'SELECT_CLIP', payload: clipId });
}

export function addShapeClip(preset, state, dispatch) {
  const targetTrack = (state.tracks || []).find((t) => t.type === 'overlay' && !t.locked);
  let trackId = targetTrack?.id;
  const playhead = state.ui?.playhead || 0;
  const duration = 4;
  if (!targetTrack) { trackId = uid(); dispatch({ type: 'ADD_TRACK', payload: { id: trackId, type: 'overlay', name: 'Overlay 1' } }); }
  let start = playhead;
  if (targetTrack && !isRangeFree(targetTrack, playhead, duration)) {
    start = (targetTrack.clips || []).reduce((max, c) => Math.max(max, c.start + c.duration), 0);
  }
  const clipId = uid();
  const fullProps = {
    shape: { ...preset.props.shape, stroke: { ...preset.props.shape.stroke } },
    transform: { x: 0, y: 0, scale: 100, rotation: 0 },
    fadeIn: 0, fadeOut: 0,
  };
  dispatch({
    type: 'ADD_CLIP',
    payload: { trackId, clip: { id: clipId, type: 'shape', mediaId: null, start, duration, inPoint: 0, speed: 1, volume: 1, opacity: 1, name: preset.label || 'Shape', props: fullProps } },
  });
  dispatch({ type: 'SELECT_CLIP', payload: clipId });
}

export function splitClipHelper(tracks, clipId, atTime) {
  const loc = findClipAndTrack(tracks, clipId);
  if (!loc || loc.track.locked) return null;
  const { clip, track } = loc;
  if (atTime <= clip.start + 0.05 || atTime >= clip.start + clip.duration - 0.05) return null;
  const d1 = Number((atTime - clip.start).toFixed(3));
  const d2 = Number((clip.start + clip.duration - atTime).toFixed(3));
  if (d1 < 0.1 || d2 < 0.1) return null;
  const p1 = { ...clip, duration: d1 };
  const p2 = { ...clip, id: uid(), start: Number(atTime.toFixed(3)), duration: d2, inPoint: Number(((clip.inPoint || 0) + d1 * (clip.speed || 1)).toFixed(3)) };
  return { newTracks: tracks.map((t) => (t.id === track.id ? { ...t, clips: track.clips.flatMap((c) => (c.id === clipId ? [p1, p2] : [c])) } : t)), newClip: p2 };
}

export function addTextTrackWithClipsHelper(tracks, payload) {
  const { name = 'Captions', clips = [] } = payload || {};
  if (!Array.isArray(clips) || clips.length === 0) return null;
  let trackName = name;
  let counter = 2;
  while (tracks.some((t) => t.name.toLowerCase() === trackName.toLowerCase())) {
    trackName = `${name} ${counter++}`;
  }
  const validClips = [];
  let lastEnd = 0;
  for (const c of clips) {
    const s = Number(c.start || 0);
    const d = Number(c.duration || 0);
    if (s >= 0 && d >= 0.1 && s >= lastEnd - 1e-3) {
      validClips.push({ ...c, start: s, duration: d });
      lastEnd = s + d;
    }
  }
  if (validClips.length === 0) return null;
  return [...tracks, { id: `t_text_${uid()}`, name: trackName, type: 'text', locked: false, muted: false, hidden: false, clips: validClips }];
}

export function addMediaToTimeline(media, dispatch, state) {
  if (!media) return;
  const targetType = (media.type === 'video' || media.type === 'image') ? 'video' : (media.type === 'audio' ? 'audio' : 'video');
  const targetTrack = (state.tracks || []).find((t) => t.type === targetType && !t.locked);
  let trackId = targetTrack?.id;
  let start = 0;
  if (!targetTrack) {
    trackId = uid();
    dispatch({ type: 'ADD_TRACK', payload: { id: trackId, type: targetType } });
    start = state.ui?.playhead || 0;
  } else {
    const playhead = state.ui?.playhead || 0;
    start = isRangeFree(targetTrack, playhead, media.duration) ? playhead : (targetTrack.clips || []).reduce((max, c) => Math.max(max, c.start + c.duration), 0);
  }
  dispatch({
    type: 'ADD_CLIP',
    payload: {
      trackId,
      clip: { type: media.type, mediaId: media.id, start, duration: media.duration, inPoint: 0, speed: 1, volume: 1, opacity: 1, props: {}, name: media.name },
    },
  });
}

export function sanitizeProject(doc) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('Project file is invalid');
  }

  const project = {
    width: clamp(Number(doc.project?.width || 1080), 100, 4096),
    height: clamp(Number(doc.project?.height || 1920), 100, 4096),
    fps: clamp(Number(doc.project?.fps || 30), 15, 60),
    aspect: String(doc.project?.aspect || '9:16'),
  };

  const allowedTypesByTrack = {
    video: ['video', 'image'],
    audio: ['audio'],
    text: ['text'],
    overlay: ['shape', 'text'],
  };

  const rawTracks = Array.isArray(doc.tracks) ? doc.tracks : [];
  const tracks = rawTracks.slice(0, 50).map((t, tIdx) => {
    const trackType = ['video', 'audio', 'text', 'overlay'].includes(t.type) ? t.type : 'video';
    const allowed = allowedTypesByTrack[trackType] || ['video', 'image'];
    const rawClips = Array.isArray(t.clips) ? t.clips : [];

    const clips = [];
    for (const c of rawClips) {
      if (!c || typeof c !== 'object') continue;
      const cType = String(c.type || 'video');
      if (!allowed.includes(cType)) continue;

      clips.push({
        id: String(c.id || uid()),
        name: String(c.name || 'Clip'),
        type: cType,
        mediaId: c.mediaId ? String(c.mediaId) : null,
        start: Math.max(0, Number(c.start || 0)),
        duration: Math.max(0.1, Number(c.duration || 1)),
        inPoint: Math.max(0, Number(c.inPoint || 0)),
        speed: clamp(Number(c.speed || 1), 0.25, 4),
        volume: clamp(Number(c.volume ?? 1), 0, 2),
        opacity: clamp(Number(c.opacity ?? 1), 0, 1),
        props: (c.props && typeof c.props === 'object') ? c.props : {},
      });
    }

    return {
      id: String(t.id || `t_${trackType}_${tIdx + 1}`),
      name: String(t.name || `${trackType.charAt(0).toUpperCase() + trackType.slice(1)} ${tIdx + 1}`),
      type: trackType,
      locked: Boolean(t.locked),
      muted: Boolean(t.muted),
      hidden: Boolean(t.hidden),
      clips,
    };
  });

  return {
    id: doc.id ? String(doc.id) : null,
    name: String(doc.name || 'Untitled project').trim().slice(0, 80) || 'Untitled project',
    project,
    tracks,
    media: Array.isArray(doc.mediaResolved) ? doc.mediaResolved : (Array.isArray(doc.media) ? doc.media : []),
    missingMediaIds: Array.isArray(doc.missingMediaIds) ? doc.missingMediaIds : [],
  };
}
