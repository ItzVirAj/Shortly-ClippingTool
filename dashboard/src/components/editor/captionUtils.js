import { uid } from './editorUtils';

/**
 * Builds timed caption text clips from transcript word timestamps.
 * @param {Array<{word: string, start: number, end: number}>} words
 * @param {Object} clip - The source video/audio clip on the timeline
 * @param {Object} options - { wordsPerCaption, preset, position }
 * @returns {Array<Object>} List of text clips
 */
export function buildCaptionClips(words = [], clip, options = {}) {
  if (!words || !words.length || !clip) return [];

  const speed = Math.max(0.25, Math.min(4.0, Number(clip.speed || 1.0)));
  const clipStart = Math.max(0.0, Number(clip.start || 0.0));
  const clipDur = Math.max(0.1, Number(clip.duration || 0.0));
  const inPoint = Math.max(0.0, Number(clip.inPoint || 0.0));

  const srcStart = inPoint;
  const srcEnd = inPoint + clipDur * speed;
  const wordsLimit = Math.max(1, Math.min(6, Number(options.wordsPerCaption || 3)));
  const preset = options.preset || {};
  const isUppercase = Boolean(preset.props?.style?.uppercase);

  let posY = 600; // Bottom
  if (options.position === 'Center') posY = 0;
  else if (options.position === 'Top') posY = -600;

  // 1. Filter and clamp words within the clip source time
  const inRangeWords = [];
  for (const w of words) {
    const ws = Number(w.start);
    const we = Number(w.end);
    if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= srcStart || ws >= srcEnd) {
      continue;
    }
    const clampedStart = Math.max(ws, srcStart);
    const clampedEnd = Math.min(we, srcEnd);
    if (clampedEnd - clampedStart > 0.01 && (w.word || '').trim()) {
      inRangeWords.push({
        word: (w.word || '').trim(),
        start: clampedStart,
        end: clampedEnd,
      });
    }
  }

  if (!inRangeWords.length) return [];

  // 2. Group words in order
  const groups = [];
  let currentGroup = [];

  for (let i = 0; i < inRangeWords.length; i++) {
    const curr = inRangeWords[i];
    if (currentGroup.length > 0) {
      const prev = currentGroup[currentGroup.length - 1];
      const gap = curr.start - prev.end;
      const lastChar = prev.word.slice(-1);
      const isPunctuation = ['.', '?', '!'].includes(lastChar);

      if (currentGroup.length >= wordsLimit || gap > 0.6 || isPunctuation) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
    currentGroup.push(curr);
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // 3. Compute timeline bounds per group
  const rawGroupTimes = groups.map((grp) => {
    const gStart = grp[0].start;
    const gEnd = grp[grp.length - 1].end;
    const tlStart = clipStart + (gStart - srcStart) / speed;
    const rawTlEnd = clipStart + (gEnd - srcStart) / speed;
    return { grp, tlStart, rawTlEnd };
  });

  const clips = [];
  const clipEndLimit = clipStart + clipDur;

  for (let i = 0; i < rawGroupTimes.length; i++) {
    const { grp, tlStart, rawTlEnd } = rawGroupTimes[i];
    let tlEnd = Math.max(rawTlEnd, tlStart + 0.3);

    // Limit to next group's start so groups never overlap
    if (i < rawGroupTimes.length - 1) {
      const nextStart = rawGroupTimes[i + 1].tlStart;
      if (tlEnd > nextStart) {
        tlEnd = nextStart;
      }
    }

    // Limit to the end of the source clip
    if (tlEnd > clipEndLimit) {
      tlEnd = clipEndLimit;
    }

    const dur = Number((tlEnd - tlStart).toFixed(3));
    const start = Number(tlStart.toFixed(3));

    if (dur < 0.1) continue;

    let text = grp.map((w) => w.word).join(' ');
    if (isUppercase) {
      text = text.toUpperCase();
    }

    clips.push({
      id: uid(),
      type: 'text',
      mediaId: null,
      name: `Caption ${clips.length + 1}`,
      start,
      duration: dur,
      inPoint: 0,
      speed: 1,
      volume: 1,
      opacity: 1,
      props: {
        text,
        style: { ...(preset.props?.style || {}) },
        bg: { ...(preset.props?.bg || {}) },
        stroke: { ...(preset.props?.stroke || {}) },
        shadow: { ...(preset.props?.shadow || {}) },
        transform: {
          x: 0,
          y: posY,
          scale: 100,
          rotation: 0,
        },
      },
    });
  }

  return clips;
}

