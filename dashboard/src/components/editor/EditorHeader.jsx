import React, { useState, useEffect, useRef } from 'react';
import { Save, Keyboard, Edit2, Check, Download, Loader2 } from 'lucide-react';
import { useEditor } from './editorStore';
import { saveProject } from './projectApi';
import { getProjectDuration } from './editorUtils';
import { useAutosave } from './useAutosave';
import FileMenu from './FileMenu';
import OpenProjectModal from './OpenProjectModal';
import ShortcutsModal from './ShortcutsModal';
import ExportModal from './ExportModal';
import LayoutMenu from './LayoutMenu';
import UnsavedChangesModal from './UnsavedChangesModal';

export default function EditorHeader({ onTriggerSave, onApplyPreset, onResetLayout, onOpenHub }) {
  const { state, dispatch } = useEditor();
  const { projectId, projectName, revision, savedRevision, saveStatus, project, tracks, ui } = state;
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(projectName);
  const [saveErrorMsg, setSaveErrorMsg] = useState('');
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { setTempName(projectName); }, [projectName]);
  useEffect(() => {
    if (isEditingName && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [isEditingName]);

  const isDirty = revision !== savedRevision;
  const isExporting = Boolean(ui?.exportJobId);
  const totalDuration = getProjectDuration(tracks);

  const handleSave = async () => {
    if (saveStatus === 'saving') return;
    const capturedRevision = revision;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    setSaveErrorMsg('');
    try {
      const res = await saveProject({ id: projectId, name: projectName, project, tracks });
      dispatch({ type: 'MARK_SAVED', payload: { id: res.id, revision: capturedRevision } });
      try { localStorage.setItem('editor.lastProjectId', res.id); } catch (_) {}
    } catch (err) {
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
      setSaveErrorMsg(err.message || 'Failed to save project');
    }
  };

  useEffect(() => {
    if (onTriggerSave) onTriggerSave.current = handleSave;
  }, [handleSave, onTriggerSave]);

  useAutosave({
    projectId, projectName, project, tracks, revision, isDirty, dispatch,
    onSaveError: (msg) => setSaveErrorMsg(msg),
  });

  const executeAction = (action) => {
    if (action === 'new') {
      dispatch({ type: 'NEW_PROJECT' });
      try { localStorage.removeItem('editor.lastProjectId'); } catch (_) {}
    } else if (action === 'open') {
      setOpenModalOpen(true);
    } else if (action === 'hub') {
      onOpenHub?.();
    }
    setPendingAction(null);
  };

  const handleCommitName = () => {
    const trimmed = tempName.trim();
    if (trimmed && trimmed.length <= 80 && trimmed !== projectName) {
      dispatch({ type: 'SET_PROJECT_NAME', payload: trimmed });
    } else {
      setTempName(projectName);
    }
    setIsEditingName(false);
  };

  const statusText = saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Save failed' : isDirty ? 'Unsaved changes' : 'Saved';
  const statusClass = saveStatus === 'saving' ? 'text-[#e31084] animate-pulse' : saveStatus === 'error' ? 'text-red-500 cursor-help' : isDirty ? 'text-amber-500 font-medium' : 'text-zinc-500';

  return (
    <>
      <div className="h-10 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between shrink-0 select-none text-xs">
        {/* Left: File Dropdown Menu, Project Name and Status */}
        <div className="flex items-center gap-3 min-w-0">
          <FileMenu
            onOpenHub={onOpenHub ? () => (isDirty ? setPendingAction({ type: 'hub', label: 'go to projects hub' }) : executeAction('hub')) : null}
            onNew={() => (isDirty ? setPendingAction({ type: 'new', label: 'create a new project' }) : executeAction('new'))}
            onOpen={() => (isDirty ? setPendingAction({ type: 'open', label: 'open another project' }) : executeAction('open'))}
            onSave={handleSave}
            onExport={() => { dispatch({ type: 'SET_PLAYING', payload: false }); setIsExportOpen(true); }}
            saveStatus={saveStatus}
            isExporting={isExporting}
            totalDuration={totalDuration}
          />

          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                type="text"
                value={tempName}
                maxLength={80}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleCommitName}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCommitName(); else if (e.key === 'Escape') { setTempName(projectName); setIsEditingName(false); } }}
                className="text-xs font-semibold px-2 py-0.5 border border-[#e31084] rounded bg-zinc-800 text-zinc-100 focus:outline-none w-52"
              />
              <button onClick={handleCommitName} className="p-0.5 text-[#e31084] hover:brightness-110">
                <Check size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="flex items-center gap-1.5 font-semibold text-zinc-200 hover:text-[#e31084] transition-colors group max-w-xs truncate"
              title="Click to rename project"
            >
              <span className="truncate">{projectName}</span>
              <Edit2 size={11} className="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          )}

          <div className="h-3 w-px bg-zinc-800" />
          <span className={`text-[11px] ${statusClass}`} title={saveStatus === 'error' ? saveErrorMsg : ''}>
            {statusText}
          </span>
        </div>

        {/* Right: Quick Save & Export Actions, Layout and Shortcuts */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Save Button with Circle Loader */}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-medium text-[11px] transition-colors shadow-2xs disabled:opacity-50"
            title="Save project (Ctrl+S)"
          >
            {saveStatus === 'saving' ? <Loader2 size={12} className="animate-spin text-[#e31084]" /> : <Save size={12} />}
            <span>{saveStatus === 'saving' ? 'Saving...' : 'Save'}</span>
          </button>

          {/* Quick Export Button with Circle Loader */}
          <button
            onClick={() => { dispatch({ type: 'SET_PLAYING', payload: false }); setIsExportOpen(true); }}
            disabled={totalDuration <= 0}
            className="btn-brand-accent flex items-center gap-1.5 px-3 py-1 rounded-md text-white font-medium text-[11px] transition-all shadow-md shadow-[#e31084]/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            style={{ backgroundColor: '#e31084' }}
            title="Export video project"
          >
            {isExporting ? <Loader2 size={12} className="animate-spin text-white" /> : <Download size={12} />}
            <span>{isExporting ? 'Exporting...' : 'Export'}</span>
          </button>

          {/* Layout Presets */}
          {onApplyPreset && <LayoutMenu onApplyPreset={onApplyPreset} onResetLayout={onResetLayout} />}

          <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />

          <button
            onClick={() => setShortcutsOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard size={14} />
          </button>
        </div>
      </div>

      <OpenProjectModal
        isOpen={openModalOpen}
        onClose={() => setOpenModalOpen(false)}
        onSelectProject={(proj) => dispatch({ type: 'LOAD_PROJECT', payload: proj })}
      />
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Unsaved Changes Confirmation Dialog */}
      <UnsavedChangesModal
        isOpen={Boolean(pendingAction)}
        projectName={projectName}
        targetActionName={pendingAction?.label || 'continue'}
        onSaveAndProceed={async () => {
          await handleSave();
          if (pendingAction) executeAction(pendingAction.type);
        }}
        onAbandon={() => executeAction(pendingAction?.type)}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
