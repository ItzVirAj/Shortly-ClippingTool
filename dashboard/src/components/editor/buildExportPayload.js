/**
 * Builds a clean project payload for the backend export endpoint.
 * Strips UI state, history, and media URLs.
 * @param {Object} state - The editor store state
 * @param {Object} [options] - Optional overrides { width, height, fps }
 * @returns {Object} { project, tracks }
 */
export function buildExportPayload(state, options = {}) {
  const { project, tracks } = state;
  const width = options.width || project.width || 1080;
  const height = options.height || project.height || 1920;
  const fps = options.fps || project.fps || 30;

  const missingIds = state.missingMediaIds || [];

  const cleanTracks = (tracks || []).map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    locked: Boolean(t.locked),
    muted: Boolean(t.muted),
    hidden: Boolean(t.hidden),
    clips: (t.clips || [])
      .filter((c) => !c.mediaId || !missingIds.includes(c.mediaId))
      .map((c) => ({
      id: c.id,
      type: c.type,
      mediaId: c.mediaId || null,
      name: c.name || '',
      start: Number(c.start || 0),
      duration: Number(c.duration || 0),
      inPoint: Number(c.inPoint || 0),
      speed: Number(c.speed || 1),
      volume: Number(c.volume ?? 1),
      opacity: Number(c.opacity ?? 1),
      props: c.props || {},
    })),
  }));

  return {
    project: {
      width,
      height,
      fps,
      aspect: project.aspect || '9:16',
    },
    tracks: cleanTracks,
  };
}

