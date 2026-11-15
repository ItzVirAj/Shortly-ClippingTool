import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import {
  uid, clamp, getProjectDuration, cloneSnapshot, findClipAndTrack,
  findNextFreeGap, addClipHelper, moveClipHelper, trimClipHelper, splitClipHelper, updateClipHelper,
  addTextTrackWithClipsHelper,
} from './editorUtils';

export const initialState = {
  projectId: null,
  projectName: 'Untitled project',
  revision: 0,
  savedRevision: 0,
  saveStatus: 'idle', // 'idle' | 'saving' | 'saved' | 'error'
  missingMediaIds: [],
  project: { width: 1080, height: 1920, fps: 30, aspect: '9:16' },
  media: [],
  tracks: [
    { id: 't_video_1', name: 'Video 1', type: 'video', locked: false, muted: false, hidden: false, clips: [] },
    { id: 't_text_1', name: 'Text 1', type: 'text', locked: false, muted: false, hidden: false, clips: [] },
  ],
  ui: {
    playhead: 0, isPlaying: false, selectedClipId: null, pxPerSec: 50,
    loop: false, masterMuted: false, snapEnabled: true, exportJobId: null,
  },
  history: { past: [], future: [] },
};

function commitHistory(state, newMedia, newTracks, uiPatch = {}) {
  const snapshot = cloneSnapshot(state.media, state.tracks);
  return {
    ...state, media: newMedia, tracks: newTracks, ui: { ...state.ui, ...uiPatch },
    revision: (state.revision || 0) + 1,
    history: { past: [...state.history.past, snapshot].slice(-100), future: [] },
  };
}

export function editorReducer(state, action) {
  const { type, payload } = action;

  switch (type) {
    case 'SET_MEDIA':
      return { ...state, media: Array.isArray(payload) ? payload : [] };
    case 'ADD_MEDIA':
      return payload?.id ? commitHistory(state, [...state.media, payload], state.tracks) : state;
    case 'REMOVE_MEDIA': {
      const mediaId = payload?.mediaId || payload;
      const newMedia = state.media.filter((m) => m.id !== mediaId);
      const newTracks = state.tracks.map((t) => ({ ...t, clips: (t.clips || []).filter((c) => c.mediaId !== mediaId) }));
      const uiPatch = state.tracks.flatMap((t) => t.clips).some((c) => c.id === state.ui.selectedClipId && c.mediaId === mediaId)
        ? { selectedClipId: null } : {};
      return commitHistory(state, newMedia, newTracks, uiPatch);
    }
    case 'ADD_TRACK': {
      const trackType = payload?.type || (typeof payload === 'string' ? payload : 'video');
      const count = state.tracks.filter((t) => t.type === trackType).length + 1;
      const name = payload?.name || (trackType.charAt(0).toUpperCase() + trackType.slice(1) + ' ' + count);
      const newTrack = { id: payload?.id || uid(), name, type: trackType, locked: false, muted: false, hidden: false, clips: [] };
      return commitHistory(state, state.media, [...state.tracks, newTrack]);
    }
    case 'ADD_TEXT_TRACK_WITH_CLIPS': {
      const newTracks = addTextTrackWithClipsHelper(state.tracks, payload);
      return newTracks ? commitHistory(state, state.media, newTracks) : state;
    }
    case 'REMOVE_TRACK': {
      const trackId = payload?.trackId || payload;
      const target = state.tracks.find((t) => t.id === trackId);
      if (!target) return state;
      const uiPatch = target.clips.some((c) => c.id === state.ui.selectedClipId) ? { selectedClipId: null } : {};
      return commitHistory(state, state.media, state.tracks.filter((t) => t.id !== trackId), uiPatch);
    }
    case 'TOGGLE_TRACK_FLAG': {
      const { trackId, flag } = payload || {};
      if (!trackId || !['locked', 'muted', 'hidden'].includes(flag)) return state;
      return commitHistory(state, state.media, state.tracks.map((t) => (t.id === trackId ? { ...t, [flag]: !t[flag] } : t)));
    }
    case 'ADD_CLIP': {
      const res = addClipHelper(state.tracks, payload?.trackId, payload?.clip);
      return res ? commitHistory(state, state.media, res.newTracks, { selectedClipId: res.newClip.id }) : state;
    }
    case 'MOVE_CLIP': {
      const newTracks = moveClipHelper(state.tracks, payload?.clipId, payload?.newStart, payload?.newTrackId);
      return newTracks ? commitHistory(state, state.media, newTracks) : state;
    }
    case 'TRIM_CLIP': {
      const newTracks = trimClipHelper(state.tracks, payload?.clipId, payload?.side, payload?.newTime, state.media);
      return newTracks ? commitHistory(state, state.media, newTracks) : state;
    }
    case 'SPLIT_CLIP': {
      const res = splitClipHelper(state.tracks, payload?.clipId, payload?.atTime);
      return res ? commitHistory(state, state.media, res.newTracks, { selectedClipId: res.newClip.id }) : state;
    }
    case 'DELETE_CLIP': {
      const clipId = payload?.clipId || payload;
      const loc = findClipAndTrack(state.tracks, clipId);
      if (!loc || loc.track.locked) return state;
      const newTracks = state.tracks.map((t) => (t.id === loc.track.id ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t));
      return commitHistory(state, state.media, newTracks, state.ui.selectedClipId === clipId ? { selectedClipId: null } : {});
    }
    case 'DUPLICATE_CLIP': {
      const clipId = payload?.clipId || payload;
      const loc = findClipAndTrack(state.tracks, clipId);
      if (!loc || loc.track.locked) return state;
      const targetStart = findNextFreeGap(loc.track, loc.clip.start + loc.clip.duration, loc.clip.duration);
      const copy = { ...loc.clip, id: uid(), start: Number(targetStart.toFixed(3)) };
      const newTracks = state.tracks.map((t) => (t.id === loc.track.id ? { ...t, clips: [...t.clips, copy] } : t));
      return commitHistory(state, state.media, newTracks, { selectedClipId: copy.id });
    }
    case 'UPDATE_CLIP': {
      const { clipId, patch } = payload || {};
      const newTracks = updateClipHelper(state.tracks, clipId, patch, state.media);
      return newTracks ? commitHistory(state, state.media, newTracks) : state;
    }
    case 'SELECT_CLIP':
      return { ...state, ui: { ...state.ui, selectedClipId: payload || null } };
    case 'SET_PLAYHEAD': {
      const maxDur = getProjectDuration(state.tracks) + 5;
      return { ...state, ui: { ...state.ui, playhead: Number(clamp(payload || 0, 0, maxDur).toFixed(3)) } };
    }
    case 'SET_PLAYING':
      return { ...state, ui: { ...state.ui, isPlaying: Boolean(payload) } };
    case 'SET_ZOOM':
      return { ...state, ui: { ...state.ui, pxPerSec: clamp(payload || 50, 10, 200) } };
    case 'TOGGLE_LOOP':
      return { ...state, ui: { ...state.ui, loop: !state.ui.loop } };
    case 'TOGGLE_MASTER_MUTE':
      return { ...state, ui: { ...state.ui, masterMuted: !state.ui.masterMuted } };
    case 'TOGGLE_SNAP':
      return { ...state, ui: { ...state.ui, snapEnabled: !state.ui.snapEnabled } };
    case 'SET_EXPORT_JOB':
      return { ...state, ui: { ...state.ui, exportJobId: payload || null } };
    case 'SET_PROJECT_NAME': {
      const name = String(payload || '').trim();
      if (!name || name.length > 80) return state;
      return { ...state, projectName: name, revision: (state.revision || 0) + 1 };
    }
    case 'MARK_SAVED': {
      const { id, revision } = payload || {};
      return {
        ...state,
        projectId: id || state.projectId,
        savedRevision: revision !== undefined ? revision : state.revision,
        saveStatus: 'saved',
      };
    }
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: payload || 'idle' };
    case 'LOAD_PROJECT': {
      const { id, name, project, tracks, media, missingMediaIds } = payload || {};
      return {
        ...state,
        projectId: id || null, projectName: name || 'Untitled project',
        project: project || { width: 1080, height: 1920, fps: 30, aspect: '9:16' },
        tracks: Array.isArray(tracks) ? tracks : [], media: Array.isArray(media) ? media : [],
        missingMediaIds: Array.isArray(missingMediaIds) ? missingMediaIds : [],
        history: { past: [], future: [] }, revision: 0, savedRevision: 0, saveStatus: 'saved',
        ui: { ...state.ui, playhead: 0, selectedClipId: null, isPlaying: false },
      };
    }
    case 'NEW_PROJECT':
      return {
        ...state,
        projectId: null, projectName: 'Untitled project',
        project: { width: 1080, height: 1920, fps: 30, aspect: '9:16' },
        tracks: [
          { id: 't_video_1', name: 'Video 1', type: 'video', locked: false, muted: false, hidden: false, clips: [] },
          { id: 't_text_1', name: 'Text 1', type: 'text', locked: false, muted: false, hidden: false, clips: [] },
        ],
        missingMediaIds: [], history: { past: [], future: [] },
        revision: 0, savedRevision: 0, saveStatus: 'idle',
        ui: { ...state.ui, playhead: 0, selectedClipId: null, isPlaying: false },
      };
    case 'UNDO': {
      if (!state.history.past.length) return state;
      const prev = state.history.past[state.history.past.length - 1];
      const curSnapshot = cloneSnapshot(state.media, state.tracks);
      return {
        ...state, media: prev.media, tracks: prev.tracks,
        revision: (state.revision || 0) + 1,
        history: { past: state.history.past.slice(0, -1), future: [curSnapshot, ...state.history.future] },
      };
    }
    case 'REDO': {
      if (!state.history.future.length) return state;
      const next = state.history.future[0];
      const curSnapshot = cloneSnapshot(state.media, state.tracks);
      return {
        ...state, media: next.media, tracks: next.tracks,
        revision: (state.revision || 0) + 1,
        history: { past: [...state.history.past, curSnapshot].slice(-100), future: state.history.future.slice(1) },
      };
    }
    default:
      return state;
  }
}

const EditorContext = createContext(null);

export function EditorProvider({ children }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const playheadRef = useRef(state.ui.playhead);
  playheadRef.current = state.ui.playhead;
  const tracksRef = useRef(state.tracks);
  tracksRef.current = state.tracks;
  const loopRef = useRef(state.ui.loop);
  loopRef.current = state.ui.loop;

  useEffect(() => {
    if (!state.ui.isPlaying) return;
    let lastTime = performance.now();
    let animId;
    const tick = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const maxDur = getProjectDuration(tracksRef.current);
      const nextTime = playheadRef.current + dt;
      if (maxDur > 0 && nextTime >= maxDur) {
        if (loopRef.current) {
          dispatch({ type: 'SET_PLAYHEAD', payload: 0 });
          playheadRef.current = 0;
          animId = requestAnimationFrame(tick);
        } else {
          dispatch({ type: 'SET_PLAYHEAD', payload: maxDur });
          dispatch({ type: 'SET_PLAYING', payload: false });
        }
      } else {
        dispatch({ type: 'SET_PLAYHEAD', payload: nextTime });
        animId = requestAnimationFrame(tick);
      }
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [state.ui.isPlaying]);

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditor must be used within an EditorProvider');
  return context;
}
