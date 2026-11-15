import { useEffect } from 'react';
import { useEditor } from './editorStore';
import { getProjectDuration } from './editorUtils';

export default function EditorKeyboardListener({ onSaveRef, onOpenShortcuts }) {
  const { state, dispatch } = useEditor();
  const { ui, project, tracks } = state;
  const fps = project?.fps || 30;

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if modal is open (z-50 backdrop exists in document)
      const hasModalOpen = Boolean(document.querySelector('.z-50'));

      if (e.key === 'Escape') {
        if (!hasModalOpen && ui.selectedClipId) {
          e.preventDefault();
          dispatch({ type: 'SELECT_CLIP', payload: null });
        }
        return;
      }

      if (hasModalOpen) return;

      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        onOpenShortcuts?.();
        return;
      }

      if (cmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSaveRef?.current?.();
        return;
      }

      if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
        return;
      }

      if (cmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        dispatch({ type: 'SET_PLAYING', payload: !ui.isPlaying });
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ui.selectedClipId) {
          e.preventDefault();
          dispatch({ type: 'DELETE_CLIP', payload: ui.selectedClipId });
        }
        return;
      }

      if (e.key.toLowerCase() === 's' && !cmdOrCtrl) {
        if (ui.selectedClipId) {
          e.preventDefault();
          dispatch({
            type: 'SPLIT_CLIP',
            payload: { clipId: ui.selectedClipId, atTime: ui.playhead },
          });
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : (1.0 / fps);
        dispatch({ type: 'SET_PLAYHEAD', payload: Math.max(0, ui.playhead - step) });
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : (1.0 / fps);
        const maxDur = getProjectDuration(tracks) + 5;
        dispatch({ type: 'SET_PLAYHEAD', payload: Math.min(maxDur, ui.playhead + step) });
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        dispatch({ type: 'SET_PLAYHEAD', payload: 0 });
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        const maxDur = getProjectDuration(tracks);
        dispatch({ type: 'SET_PLAYHEAD', payload: maxDur });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ui.isPlaying, ui.selectedClipId, ui.playhead, tracks, fps, dispatch, onSaveRef, onOpenShortcuts]);

  return null;
}

