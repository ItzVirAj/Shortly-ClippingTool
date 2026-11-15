import React, { useState, useEffect } from 'react';
import { Film, Plus, Search, Clock, Trash2, Loader2, AlertCircle, RefreshCw, FolderOpen, ArrowRight } from 'lucide-react';
import { listProjects, loadProject, deleteProject } from './projectApi';
import { sanitizeProject } from './editorUtils';

export default function ProjectsHub({ onOpenProject, onNewProject, onReturnToEditor }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
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
    fetchList();
  }, []);

  const handleOpen = async (id) => {
    try {
      const raw = await loadProject(id);
      const sanitized = sanitizeProject(raw);
      try {
        localStorage.setItem('editor.lastProjectId', id);
      } catch (_) {}
      onOpenProject(sanitized);
    } catch (err) {
      alert(`Could not load project: ${err.message || 'Project file is invalid'}`);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    setDeletingId(id);
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      try {
        if (localStorage.getItem('editor.lastProjectId') === id) {
          localStorage.removeItem('editor.lastProjectId');
        }
      } catch (_) {}
    } catch (err) {
      alert(`Failed to delete project: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = projects.filter((p) =>
    (p.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar select-none bg-[var(--uni-void)] text-[var(--uni-chalk)]">
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full animate-fade">
        {/* Heading Banner */}
        <div className="mb-6 space-y-1.5">
          <p className="eyebrow flex items-center gap-2">
            <Film size={12} className="text-[#e31084]" /> 02 · VIDEO EDITOR · PROJECTS HUB
          </p>
          <h1 className="font-display text-3xl sm:text-4xl text-white tracking-[0.02em]">
            Projects Hub
          </h1>
          <p className="text-muted text-xs sm:text-sm leading-relaxed max-w-2xl">
            Access, modify, export, and manage your saved editing timelines and video projects.
          </p>
        </div>

        {/* Toolbar: Search & Action Buttons positioned below banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-[var(--color-rule)]">
          <div className="relative flex-1 max-w-xs sm:max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-xs rounded-[3px] border border-[var(--color-rule)] bg-[var(--uni-card)] text-[var(--uni-chalk)] placeholder:text-muted focus:border-[#e31084] focus:outline-hidden transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchList}
              disabled={loading}
              className="p-2 rounded-[3px] border border-[var(--color-rule)] bg-[var(--uni-card)] hover:bg-[var(--uni-elevated)] text-[var(--uni-pearl)] transition-colors"
              title="Refresh list"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-[#e31084]' : ''} />
            </button>

            {onReturnToEditor && (
              <button
                type="button"
                onClick={onReturnToEditor}
                className="flex items-center gap-1.5 px-3 py-2 rounded-[3px] bg-[var(--uni-card)] hover:bg-[var(--uni-elevated)] text-[var(--uni-chalk)] border border-[var(--color-rule)] text-xs font-medium transition-colors"
                title="Return to the active project in Editor"
              >
                <span>Back to Editor</span>
                <ArrowRight size={13} className="text-[#e31084]" />
              </button>
            )}

            <button
              type="button"
              onClick={onNewProject}
              className="btn-brand-accent flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer shadow-md shadow-[#e31084]/25 transition-all hover:brightness-105 active:scale-[0.99]"
              style={{ backgroundColor: '#e31084' }}
            >
              <Plus size={15} />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Projects Content Area */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-muted">
            <Loader2 className="w-8 h-8 animate-spin text-[#e31084]" />
            <span className="text-xs font-medium">Loading your projects...</span>
          </div>
        ) : error ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="w-10 h-10 text-[var(--uni-danger)]" />
            <p className="text-xs text-[var(--uni-danger)] font-medium">{error}</p>
            <button
              onClick={fetchList}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--uni-card)] hover:bg-[var(--uni-elevated)] text-[var(--uni-chalk)] rounded-[3px] text-xs font-medium border border-[var(--color-rule)] transition-colors"
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-[10px] bg-[var(--uni-panel)] border border-[var(--color-rule)] flex items-center justify-center text-muted mb-4 shadow-inner">
              <FolderOpen size={28} />
            </div>
            <h3 className="text-sm font-semibold text-white">
              {searchQuery ? 'No matching projects' : 'No projects found'}
            </h3>
            <p className="text-xs text-muted mt-1 mb-5">
              {searchQuery ? `No project names match "${searchQuery}".` : 'Create your first project to start editing videos.'}
            </p>
            <button
              onClick={onNewProject}
              className="btn-brand-accent flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white cursor-pointer shadow-md shadow-[#e31084]/25 transition-all hover:brightness-105 active:scale-[0.99]"
              style={{ backgroundColor: '#e31084' }}
            >
              <Plus size={15} />
              <span>Create New Project</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted font-medium">
              <span>{filtered.length} {filtered.length === 1 ? 'Project' : 'Projects'}</span>
              <span>Sorted by recent</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleOpen(p.id)}
                  className="bg-[var(--uni-panel)] rounded-[10px] border border-[var(--color-rule)] hover:border-[#e31084]/70 hover:bg-[var(--uni-card)] transition-all group relative flex flex-col justify-between overflow-hidden cursor-pointer"
                >
                  {/* Card Thumbnail Box */}
                  <div className="h-32 bg-[var(--uni-void)] flex flex-col items-center justify-center border-b border-[var(--color-rule)] relative transition-colors">
                    <Film className="w-8 h-8 text-muted group-hover:text-[#e31084] group-hover:scale-110 transition-all duration-200" />
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded-[3px] bg-[var(--uni-card)] text-muted font-mono text-[10px] border border-[var(--color-rule)]">
                        9:16
                      </span>
                    </div>
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-[11px] text-muted font-mono">
                      <span>{p.duration || 0}s</span>
                      <span>{p.clipCount || 0} clips</span>
                    </div>
                  </div>

                  {/* Card Details */}
                  <div className="p-3.5 flex flex-col justify-between flex-1 gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-[#e31084] truncate transition-colors">
                        {p.name || 'Untitled project'}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted mt-1 font-mono">
                        <Clock size={11} />
                        <span>
                          {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--color-rule)]">
                      <button
                        type="button"
                        onClick={(e) => handleDelete(p.id, e)}
                        disabled={deletingId === p.id}
                        className="p-1.5 text-muted hover:text-[var(--uni-danger)] hover:bg-[var(--uni-elevated)] rounded-[3px] transition-colors"
                        title="Delete project"
                      >
                        {deletingId === p.id ? <Loader2 size={13} className="animate-spin text-[var(--uni-danger)]" /> : <Trash2 size={13} />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpen(p.id)}
                        className="btn-brand-accent flex items-center gap-1 px-3 py-1.5 rounded-[6px] text-xs font-semibold text-white group/btn cursor-pointer shadow-xs shadow-[#e31084]/20 transition-all hover:brightness-105"
                        style={{ backgroundColor: '#e31084' }}
                      >
                        <span>Open</span>
                        <ArrowRight size={12} className="group-hover/btn:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
