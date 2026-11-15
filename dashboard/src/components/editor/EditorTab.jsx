import React, { useState, useEffect, useRef } from 'react';
import { EditorProvider, useEditor } from './editorStore';
import EditorErrorBoundary from './EditorErrorBoundary';
import EditorHeader from './EditorHeader';
import EditorKeyboardListener from './EditorKeyboardListener';
import EditorTile from './EditorTile';
import { useEditorLayout } from './useEditorLayout';
import ShortcutsModal from './ShortcutsModal';
import ProjectsHub from './ProjectsHub';

function EditorContent({ onOpenHub }) {
  const { state } = useEditor();
  const [activeRail, setActiveRail] = useState('Media');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const saveTriggerRef = useRef(null);
  const topContainerRef = useRef(null);
  const contentContainerRef = useRef(null);

  const {
    layout,
    isResizing,
    draggingTile,
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    startColResize,
    startRowResize,
    applyPreset,
    resetLayout,
  } = useEditorLayout();

  // Unsaved changes beforeunload protection
  const isDirty = state.revision !== state.savedRevision;
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const topSlots = layout.slots?.top || ['media', 'player', 'properties'];
  const bottomSlots = layout.slots?.bottom || ['timeline'];

  return (
    <div className={`h-full w-full flex flex-col overflow-hidden bg-zinc-950 text-zinc-100 ${isResizing ? 'select-none' : ''}`}>
      <EditorKeyboardListener
        onSaveRef={saveTriggerRef}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <EditorHeader
        onTriggerSave={saveTriggerRef}
        onApplyPreset={applyPreset}
        onResetLayout={resetLayout}
        onOpenHub={onOpenHub}
      />

      <div ref={contentContainerRef} className="flex-1 min-h-0 flex flex-col p-2.5 gap-1.5 overflow-hidden">
        {/* Top Section */}
        <div
          ref={topContainerRef}
          style={{ height: `${layout.topHeight}%` }}
          className="min-h-0 flex gap-1.5 overflow-hidden"
        >
          {topSlots.map((tileId, idx) => (
            <React.Fragment key={tileId}>
              <EditorTile
                tileId={tileId}
                isDragging={draggingTile === tileId}
                isDropTarget={dropTarget === tileId}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                activeRail={activeRail}
                setActiveRail={setActiveRail}
                onApplyPreset={applyPreset}
                onResetLayout={resetLayout}
                style={{ width: `${layout.widths[idx] ?? Math.round(100 / topSlots.length)}%` }}
                className="shrink-0 h-full"
              />
              {idx < topSlots.length - 1 && (
                <div
                  onPointerDown={(e) => startColResize(e, idx, topContainerRef)}
                  title="Drag to resize column width"
                  className="w-1.5 -mx-1 hover:w-2 hover:bg-[#e31084]/80 bg-transparent transition-all cursor-col-resize z-30 flex items-center justify-center group shrink-0 select-none"
                >
                  <div className="w-0.5 h-8 bg-zinc-700/80 group-hover:bg-[#e31084] group-active:bg-[#e31084] rounded-full transition-colors" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Horizontal Resize Splitter */}
        <div
          onPointerDown={(e) => startRowResize(e, contentContainerRef)}
          title="Drag to resize timeline height"
          className="h-1.5 -my-1 hover:h-2 hover:bg-[#e31084]/80 bg-transparent transition-all cursor-row-resize z-30 flex items-center justify-center group shrink-0 select-none"
        >
          <div className="h-0.5 w-12 bg-zinc-700/80 group-hover:bg-[#e31084] group-active:bg-[#e31084] rounded-full transition-colors" />
        </div>

        {/* Bottom Section */}
        <div
          style={{ height: `${100 - layout.topHeight}%` }}
          className="min-h-0 flex gap-1.5 overflow-hidden"
        >
          {bottomSlots.map((tileId) => (
            <EditorTile
              key={tileId}
              tileId={tileId}
              isDragging={draggingTile === tileId}
              isDropTarget={dropTarget === tileId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              activeRail={activeRail}
              setActiveRail={setActiveRail}
              onApplyPreset={applyPreset}
              onResetLayout={resetLayout}
              className="flex-1 h-full"
            />
          ))}
        </div>
      </div>

      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}

function EditorApp() {
  const [viewMode, setViewMode] = useState('hub');
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const { dispatch } = useEditor();

  const handleOpenProject = (sanitizedProj) => {
    dispatch({ type: 'LOAD_PROJECT', payload: sanitizedProj });
    setHasActiveSession(true);
    setViewMode('editor');
  };

  const handleNewProject = () => {
    dispatch({ type: 'NEW_PROJECT' });
    setHasActiveSession(true);
    setViewMode('editor');
  };

  if (viewMode === 'hub') {
    return (
      <ProjectsHub
        onOpenProject={handleOpenProject}
        onNewProject={handleNewProject}
        onReturnToEditor={hasActiveSession ? () => setViewMode('editor') : null}
      />
    );
  }

  return <EditorContent onOpenHub={() => setViewMode('hub')} />;
}

export default function EditorTab() {
  return (
    <EditorErrorBoundary>
      <EditorProvider>
        <EditorApp />
      </EditorProvider>
    </EditorErrorBoundary>
  );
}
