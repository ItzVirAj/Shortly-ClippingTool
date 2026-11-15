import { useEffect } from 'react';
import { saveProject } from './projectApi';

export function useAutosave({ projectId, projectName, project, tracks, revision, isDirty, dispatch, onSaveError }) {
  useEffect(() => {
    if (!projectId || !isDirty) return;
    const activeEl = document.activeElement;
    if (activeEl && (['INPUT', 'TEXTAREA'].includes(activeEl.tagName) || activeEl.isContentEditable)) return;
    const totalClips = (tracks || []).reduce((sum, t) => sum + (t.clips?.length || 0), 0);
    if ((tracks || []).length === 0 && totalClips === 0) return;

    const timer = setTimeout(() => {
      const curEl = document.activeElement;
      if (curEl && (['INPUT', 'TEXTAREA'].includes(curEl.tagName) || curEl.isContentEditable)) return;
      const capturedRev = revision;
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
      saveProject({ id: projectId, name: projectName, project, tracks })
        .then((res) => {
          dispatch({ type: 'MARK_SAVED', payload: { id: res.id, revision: capturedRev } });
          try { localStorage.setItem('editor.lastProjectId', res.id); } catch (_) {}
        })
        .catch((err) => {
          dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
          if (onSaveError) onSaveError(err.message || 'Autosave failed');
        });
    }, 3000);

    return () => clearTimeout(timer);
  }, [revision, projectId, projectName, project, tracks, isDirty, dispatch, onSaveError]);
}

