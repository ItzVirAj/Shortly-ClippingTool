import React, { useState, useEffect } from 'react';
import { X, FolderOpen, Trash2, Clock, Film, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { listProjects, loadProject, deleteProject } from './projectApi';
import { sanitizeProject } from './editorUtils';

export default function OpenProjectModal({ isOpen, onClose, onSelectProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openError, setOpenError] = useState(null);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    setOpenError(null);
    try {
      const data = await listProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchList();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOpen = async (projId) => {
    setOpenError(null);
    try {
      const raw = await loadProject(projId);
      const sanitized = sanitizeProject(raw);
      onSelectProject(sanitized);
      try {
        localStorage.setItem('editor.lastProjectId', projId);
      } catch (_) {}
      onClose();
    } catch (err) {
      setOpenError('Project file is invalid');
    }
  };

  const handleDelete = async (projId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    try {
      await deleteProject(projId);
      setProjects((prev) => prev.filter((p) => p.id !== projId));
    } catch (err) {
      alert(`Failed to delete project: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-emerald-500" />
            <h3 className="font-semibold text-zinc-100 text-sm">Open Project</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md transition-colors" aria-label="Close modal">
            <X className="w-4 h-4" />
          </button>
        </div>

        {openError && (
          <div className="mx-5 mt-4 p-2.5 rounded-lg bg-red-950/40 border border-red-900/60 text-red-300 text-xs flex items-center gap-1.5 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{openError}</span>
          </div>
        )}

        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-xs">Loading projects...</span>
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-xs text-red-400">{error}</p>
              <button onClick={fetchList} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors border border-zinc-700">
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-zinc-300">No saved projects</p>
              <p className="text-xs text-zinc-500 mt-1">Save your current work to see it here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleOpen(p.id)}
                  className="p-3 rounded-lg border border-zinc-800 bg-zinc-850/60 hover:border-[#e31084]/60 hover:bg-[#e31084]/10 transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="min-w-0 pr-3">
                    <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white truncate">{p.name}</h4>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Film size={11} />
                        {p.duration || 0}s ({p.clipCount || 0} clips)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleDelete(p.id, e)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-950/40 rounded-md transition-colors"
                      title="Delete project"
                      aria-label="Delete project"
                    >
                      <Trash2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpen(p.id)}
                      className="btn-brand-accent px-3 py-1 text-white rounded-md text-xs font-medium transition-all shadow-md shadow-[#e31084]/20 cursor-pointer"
                      style={{ backgroundColor: '#e31084' }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

