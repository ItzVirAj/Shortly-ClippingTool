import React, { useState, useEffect, useMemo } from 'react';
import { 
  Loader2, 
  Download, 
  Film, 
  FolderOpen, 
  Trash2, 
  Radio, 
  Flame, 
  Folder, 
  Search, 
  RotateCw, 
  Check, 
  Copy, 
  AlertTriangle, 
  Layers, 
  Scissors, 
  ExternalLink,
  Sparkles,
  X
} from 'lucide-react';
import { apiJson } from '../lib/api';
import { getApiUrl } from '../config';

export default function HistoryTab({ onReopenProject }) {
  const [videos, setVideos] = useState(null);
  const [projects, setProjects] = useState({});
  const [reopening, setReopening] = useState(null);
  const [reopenError, setReopenError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [filter, setFilter] = useState('all'); // 'all' | 'studio' | 'live'
  const [searchQuery, setSearchQuery] = useState('');

  // Micro-interaction states
  const [copiedId, setCopiedId] = useState(null);
  const [revealingId, setRevealingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteClip, setConfirmDeleteClip] = useState(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllType, setDeleteAllType] = useState('all');
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  const fetchLibrary = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiJson('/api/history');
      setVideos(data.videos || []);
    } catch (err) {
      setError('Could not load your video library.');
    } finally {
      setLoading(false);
    }

    try {
      const pData = await apiJson('/api/projects');
      const map = {};
      for (const p of pData.projects || []) map[p.job_id] = p;
      setProjects(map);
    } catch (_) {}
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  // Filtered list based on tab segregation and search
  const filteredVideos = useMemo(() => {
    if (!videos) return [];
    return videos.filter((v) => {
      // 1. Segregation filter
      if (filter === 'studio' && v.source_type !== 'studio') return false;
      if (filter === 'live' && v.source_type !== 'live') return false;

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = v.title?.toLowerCase().includes(q);
        const matchesFilename = v.filename?.toLowerCase().includes(q);
        const matchesJob = v.job_id?.toLowerCase().includes(q);
        return matchesTitle || matchesFilename || matchesJob;
      }
      return true;
    });
  }, [videos, filter, searchQuery]);

  // Counts for each segregation tab
  const studioCount = useMemo(() => videos?.filter((v) => v.source_type === 'studio').length || 0, [videos]);
  const liveCount = useMemo(() => videos?.filter((v) => v.source_type === 'live').length || 0, [videos]);

  // Open file or folder in OS file explorer
  const handleOpenFolder = async (clip = null) => {
    const cid = clip ? clip.id : 'global';
    setRevealingId(cid);
    try {
      const res = await apiJson('/api/history/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: clip?.file_path }),
      });
      if (clip?.file_path) {
        navigator.clipboard?.writeText(clip.file_path);
      }
      setActionSuccess(clip ? `Revealed in Folder: ${clip.filename || 'Clip'}` : 'Opened Library Folder in Explorer');
      setTimeout(() => setActionSuccess(''), 3500);
    } catch (err) {
      if (clip?.file_path) {
        navigator.clipboard?.writeText(clip.file_path);
        setActionSuccess('Copied local path to clipboard');
        setTimeout(() => setActionSuccess(''), 3000);
      }
    } finally {
      setRevealingId(null);
    }
  };

  // Copy file path to clipboard
  const handleCopyPath = (clip) => {
    if (!clip?.file_path) return;
    navigator.clipboard?.writeText(clip.file_path);
    setCopiedId(clip.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Delete single clip
  const handleDeleteClip = async (clip) => {
    setDeletingId(clip.id);
    try {
      await apiJson('/api/history/clips', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: clip.id,
          file_path: clip.file_path,
          source_type: clip.source_type,
        }),
      });
      setVideos((prev) => prev.filter((v) => v.id !== clip.id));
      setActionSuccess(`Deleted clip: ${clip.title || clip.filename}`);
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err) {
      setError('Failed to delete clip file from disk.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteClip(null);
    }
  };

  // Delete all clips (with segregation support)
  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      const res = await apiJson('/api/history/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: deleteAllType }),
      });
      if (deleteAllType === 'all') {
        setVideos([]);
      } else if (deleteAllType === 'studio') {
        setVideos((prev) => prev.filter((v) => v.source_type !== 'studio'));
      } else if (deleteAllType === 'live') {
        setVideos((prev) => prev.filter((v) => v.source_type !== 'live'));
      }
      setShowDeleteAllModal(false);
      setActionSuccess(`Successfully deleted ${res.deleted_count ?? 0} clip files from disk.`);
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setError('Failed to delete clips from disk.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Reopen Studio project
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

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const fmtSize = (bytes) => (bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : '');

  if (loading && !videos) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-white/50 space-y-3">
        <Loader2 className="animate-spin text-brass" size={32} />
        <span className="font-mono text-xs">Loading library clips...</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 animate-fade">
      {/* Top Banner & Library Header (Apple Design Glassmorphism) */}
      <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.16] rounded-3xl p-5 sm:p-7 shadow-[0_12px_40px_rgba(0,0,0,0.4)] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-mono font-medium text-white/80 uppercase tracking-wider backdrop-blur-md">
            <FolderOpen size={12} className="text-brass" />
            <span>Clips Library & Storage</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Your Generated Shorts
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-white/90 border border-white/10">
              {videos?.length || 0} Total
            </span>
          </h1>
          <p className="text-white/60 text-xs sm:text-sm max-w-2xl leading-relaxed">
            Manage all your shorts generated from Studio (offline stream download / file uploads) and Live Clipper (live stream chat spikes). Inspect files on disk, download, or clean up storage.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => handleOpenFolder(null)}
            disabled={revealingId === 'global'}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-medium text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 active:scale-95 transition-all cursor-pointer shadow-xs"
            title="Open the local 'output' folder in Windows Explorer"
          >
            {revealingId === 'global' ? <Loader2 size={13} className="animate-spin text-brass" /> : <Folder size={13} className="text-brass" />}
            <span>Show in Folder</span>
          </button>

          <button
            type="button"
            onClick={fetchLibrary}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 active:scale-95 transition-all cursor-pointer"
            title="Refresh Library"
          >
            <RotateCw size={13} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDeleteAllType(filter);
              setShowDeleteAllModal(true);
            }}
            disabled={!videos || videos.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-medium text-rose-300 hover:text-rose-100 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 active:scale-95 transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            title="Delete all clips from disk"
          >
            <Trash2 size={13} />
            <span>Delete All Clips</span>
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {actionSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-mono flex items-center justify-between gap-2 animate-fade backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Check size={15} className="text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button type="button" onClick={() => setActionSuccess('')} className="text-emerald-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-mono flex items-center gap-2 backdrop-blur-md">
          <AlertTriangle size={15} className="shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {reopenError && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-mono flex items-center gap-2 backdrop-blur-md">
          <AlertTriangle size={15} className="shrink-0 text-rose-400" />
          <span>{reopenError}</span>
        </div>
      )}

      {/* Segregation Controls & Search Bar (Apple Segmented Picker) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/[0.08] p-2 sm:p-2.5 rounded-2xl backdrop-blur-xl">
        {/* Apple Segmented Segregation Switcher */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-xs font-mono">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              filter === 'all'
                ? 'bg-white/15 text-white font-semibold shadow-xs border border-white/15'
                : 'text-white/60 hover:text-white border border-transparent'
            }`}
          >
            <Layers size={13} />
            <span>All Clips ({videos?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('studio')}
            className={`px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              filter === 'studio'
                ? 'bg-indigo-500/25 text-indigo-200 font-semibold shadow-xs border border-indigo-500/30'
                : 'text-white/60 hover:text-white border border-transparent'
            }`}
          >
            <Film size={13} className="text-indigo-400" />
            <span>Studio Clipper ({studioCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('live')}
            className={`px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              filter === 'live'
                ? 'bg-rose-500/25 text-rose-200 font-semibold shadow-xs border border-rose-500/30'
                : 'text-white/60 hover:text-white border border-transparent'
            }`}
          >
            <Flame size={13} className="text-rose-400" />
            <span>Live Clipper ({liveCount})</span>
          </button>
        </div>

        {/* Real-time Search Box */}
        <div className="relative min-w-[220px] sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="Search title, filename..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-white/30 text-xs font-mono focus:outline-none focus:border-brass/60 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {filteredVideos.length === 0 && (
        <div className="text-center py-20 p-8 rounded-3xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-xl space-y-3">
          <Film size={36} className="mx-auto text-white/30" />
          <h3 className="text-base font-semibold text-white">No clips found in this section</h3>
          <p className="text-xs font-mono text-white/50 max-w-md mx-auto">
            {filter === 'studio'
              ? 'No Studio Clipper shorts generated yet. Use the Studio workbench to upload or clip videos.'
              : filter === 'live'
              ? 'No Live Clipper clips detected yet. Start a Live Clipper session or run after-stream review.'
              : 'Your library is empty or no clips match your search query.'}
          </p>
        </div>
      )}

      {/* Clips Grid (Apple Glassmorphism Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredVideos.map((clip) => {
          const isStudio = clip.source_type === 'studio';
          const isLive = clip.source_type === 'live';
          const isDeleting = deletingId === clip.id;
          const isRevealing = revealingId === clip.id;
          const isCopied = copiedId === clip.id;
          const isConfirming = confirmDeleteClip === clip.id;

          return (
            <div
              key={clip.id}
              className="group rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.2] shadow-sm hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-300 flex flex-col justify-between overflow-hidden"
            >
              {/* Vertical Video Preview Container */}
              <div className="relative aspect-[9/16] bg-black/90 overflow-hidden">
                <video
                  src={getApiUrl(clip.view_url)}
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full h-full object-contain"
                />

                {/* Floating Source Tag Badge */}
                <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 pointer-events-none">
                  {isStudio ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-500/25 text-indigo-200 border border-indigo-500/40 backdrop-blur-md shadow-xs">
                      <Film size={10} className="text-indigo-300" /> Studio
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-500/25 text-rose-200 border border-rose-500/40 backdrop-blur-md shadow-xs">
                      <Flame size={10} className="text-rose-300" /> Live Stream
                    </span>
                  )}
                </div>

                {/* Duration & Score Badges */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1 pointer-events-none">
                  {clip.score && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/20 text-amber-200 border border-amber-500/30 backdrop-blur-md shadow-xs">
                      ★ {clip.score.toFixed(1)}
                    </span>
                  )}
                  {clip.duration && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-black/60 text-white/90 border border-white/10 backdrop-blur-md shadow-xs">
                      {clip.duration.toFixed(0)}s
                    </span>
                  )}
                </div>
              </div>

              {/* Card Meta & Actions */}
              <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white line-clamp-2 leading-tight" title={clip.title || clip.filename}>
                    {clip.title || clip.filename || 'Untitled Short'}
                  </h4>
                  <div className="flex items-center justify-between text-[10.5px] font-mono text-white/40 mt-1.5">
                    <span>{fmtDate(clip.created_at)}</span>
                    {fmtSize(clip.size_bytes) && <span>{fmtSize(clip.size_bytes)}</span>}
                  </div>
                </div>

                {/* Reopen Studio Project Link (If applicable) */}
                {isStudio && projects[clip.job_id] && onReopenProject && (
                  <button
                    type="button"
                    onClick={() => handleReopen(clip.job_id)}
                    disabled={!!reopening}
                    className="w-full py-1.5 px-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/80 hover:text-white text-[11px] font-mono flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {reopening === clip.job_id ? <Loader2 size={12} className="animate-spin text-brass" /> : <FolderOpen size={12} className="text-brass" />}
                    <span>Reopen in Studio</span>
                  </button>
                )}

                {/* Primary Card Actions Bar (Download, Show in Folder, Delete) */}
                <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-1.5">
                  {/* Left: Download & Folder */}
                  <div className="flex items-center gap-1.5">
                    <a
                      href={getApiUrl(clip.download_url)}
                      download={clip.filename || 'short.mp4'}
                      className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#ff7dc2] hover:text-white border border-white/10 text-xs font-mono font-medium flex items-center gap-1 transition-all cursor-pointer no-underline active:scale-95"
                      title="Download clip file"
                    >
                      <Download size={12} />
                      <span>Download</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleOpenFolder(clip)}
                      disabled={isRevealing}
                      className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-white/70 hover:text-white border border-white/10 text-xs transition-all cursor-pointer active:scale-95"
                      title={clip.file_path ? `Show in Windows Explorer: ${clip.file_path}` : 'Show in Folder'}
                    >
                      {isRevealing ? <Loader2 size={13} className="animate-spin text-brass" /> : <Folder size={13} />}
                    </button>

                    {clip.file_path && (
                      <button
                        type="button"
                        onClick={() => handleCopyPath(clip)}
                        className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-white/70 hover:text-white border border-white/10 text-xs transition-all cursor-pointer active:scale-95"
                        title="Copy file path"
                      >
                        {isCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      </button>
                    )}
                  </div>

                  {/* Right: Delete Action with inline confirm */}
                  <div>
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteClip(clip)}
                          disabled={isDeleting}
                          className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-mono font-bold transition-all cursor-pointer"
                        >
                          {isDeleting ? <Loader2 size={11} className="animate-spin" /> : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteClip(null)}
                          className="p-1 text-white/50 hover:text-white text-[11px]"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteClip(clip.id)}
                        className="p-1.5 rounded-lg text-white/40 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 text-xs transition-all cursor-pointer"
                        title="Delete this clip from disk"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete All Confirmation Dialog (Apple Glass Modal) */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-fade">
          <div className="relative w-full max-w-md bg-[#121319]/95 border border-white/[0.12] border-t-white/[0.22] rounded-3xl p-6 shadow-[0_25px_70px_rgba(0,0,0,0.7)] backdrop-blur-2xl text-white space-y-5 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-inner">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Delete Clips from Disk</h3>
                <p className="text-xs text-white/50">This action permanently deletes clip video files.</p>
              </div>
            </div>

            {/* Scope Selection */}
            <div className="space-y-2 text-xs font-mono">
              <label className="text-white/70 block">Select deletion scope:</label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="all"
                    checked={deleteAllType === 'all'}
                    onChange={() => setDeleteAllType('all')}
                    className="accent-rose-500"
                  />
                  <span>Delete ALL clips ({videos?.length || 0} total)</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="studio"
                    checked={deleteAllType === 'studio'}
                    onChange={() => setDeleteAllType('studio')}
                    className="accent-rose-500"
                  />
                  <span>Only Studio Clipper clips ({studioCount})</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="live"
                    checked={deleteAllType === 'live'}
                    onChange={() => setDeleteAllType('live')}
                    className="accent-rose-500"
                  />
                  <span>Only Live Clipper clips ({liveCount})</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isDeletingAll}
                className="px-4 py-2 rounded-xl text-xs font-mono text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
                className="px-4 py-2 rounded-xl text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all shadow-[0_4px_16px_rgba(225,29,72,0.4)] flex items-center gap-2 cursor-pointer"
              >
                {isDeletingAll ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
