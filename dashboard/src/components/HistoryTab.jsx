import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Download, Film, FolderOpen } from 'lucide-react';
import { apiJson } from '../lib/api';

// The signed-in user's saved video library (stored in R2). Private, signed links.
// Videos are grouped by project (job); re-openable projects get a "reopen"
// action that restores the whole job for further editing in the Clip Generator.
export default function HistoryTab({ onReopenProject }) {
  const [videos, setVideos] = useState(null);
  const [projects, setProjects] = useState({});
  const [reopening, setReopening] = useState(null);
  const [reopenError, setReopenError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiJson('/api/history')
      .then((d) => setVideos(d.videos || []))
      .catch(() => setError('Could not load your library.'));
    apiJson('/api/projects')
      .then((d) => {
        const map = {};
        for (const p of d.projects || []) map[p.job_id] = p;
        setProjects(map);
      })
      .catch(() => {});
  }, []);

  // Group videos by job, preserving the newest-first order of /api/history.
  const groups = useMemo(() => {
    const byJob = new Map();
    for (const v of videos || []) {
      const key = v.job_id || v.id;
      if (!byJob.has(key)) byJob.set(key, []);
      byJob.get(key).push(v);
    }
    return [...byJob.entries()];
  }, [videos]);

  const handleReopen = async (jobId) => {
    if (!onReopenProject || reopening) return;
    setReopening(jobId);
    setReopenError('');
    try {
      await onReopenProject(jobId);
    } catch (e) {
      setReopenError('Could not reopen this project. Please try again.');
      setReopening(null);
    }
  };

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

  if (videos === null && !error) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-[#ff66b2]" size={28} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-8 max-w-5xl mx-auto animate-fade">
      <div className="space-y-2 mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-mono font-medium text-white/80 uppercase tracking-wider mb-1 backdrop-blur-md">
          <FolderOpen size={12} className="text-[#ff66b2]" />
          <span>07 · Video History</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Your Library</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-2xl">
          All the shorts you've generated, saved while your plan is active. Kept for 7 days after your plan ends. Reopen a project to keep editing its clips.
        </p>
      </div>

      {error && (
        <div className="p-4 mb-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm">
          {error}
        </div>
      )}
      {reopenError && (
        <div className="p-4 mb-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm">
          {reopenError}
        </div>
      )}

      {videos && videos.length === 0 && (
        <div className="text-center py-20 p-8 rounded-3xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl">
          <Film size={40} className="mx-auto mb-3 text-white/30" />
          <p className="text-sm text-white/60">No videos yet. Generate your first short from the Clip Generator.</p>
        </div>
      )}

      <div className="space-y-10">
        {groups.map(([jobId, vids]) => {
          const project = projects[jobId];
          return (
            <section key={jobId} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate" title={project?.title || vids[0]?.title}>
                    {project?.title || vids[0]?.title || 'Project'}
                  </p>
                  <p className="font-mono text-xs text-white/50 mt-0.5">
                    {fmtDate(vids[0]?.created_at)} · {vids.length} clip{vids.length === 1 ? '' : 's'}
                  </p>
                </div>
                {project && onReopenProject && (
                  <button
                    type="button"
                    onClick={() => handleReopen(jobId)}
                    disabled={!!reopening}
                    className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-xs font-medium transition-all active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    title="Restore this project in the Clip Generator to keep editing subtitles, hooks, effects and dubbing"
                  >
                    {reopening === jobId ? (
                      <><Loader2 size={13} className="animate-spin text-white" /> reopening…</>
                    ) : (
                      <><FolderOpen size={13} className="text-[#ff66b2]" /> Reopen project</>
                    )}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {vids.map((v) => (
                  <div key={v.id} className="rounded-2xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.18] shadow-sm overflow-hidden group transition-all duration-200 active:scale-[0.98] flex flex-col justify-between">
                    <div className="aspect-[9/16] bg-black">
                      <video src={v.view_url} controls preload="metadata" className="w-full h-full object-contain" />
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-xs font-medium text-white line-clamp-2 leading-tight" title={v.title}>{v.title || 'Short'}</p>
                      <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
                        <span className="font-mono text-[10.5px] text-white/50">{fmtDate(v.created_at)}</span>
                        <a
                          href={v.download_url}
                          className="font-mono text-[11px] text-[#ff7dc2] hover:text-white flex items-center gap-1 transition-colors no-underline font-medium"
                          title="Download"
                        >
                          <Download size={13} /> Download
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
