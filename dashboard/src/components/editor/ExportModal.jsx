import React, { useState, useEffect, useRef } from 'react';
import { X, Download, AlertTriangle, RefreshCw, CheckCircle, Loader2 } from 'lucide-react';
import { useEditor } from './editorStore';
import { buildExportPayload } from './buildExportPayload';
import { startExport, getExportStatus, cancelExport } from './exportApi';

export default function ExportModal({ isOpen, onClose }) {
  const { state, dispatch } = useEditor();
  const { ui } = state;
  const { exportJobId } = ui;

  const [res, setRes] = useState('1080x1920');
  const [fps, setFps] = useState('30');
  const [jobState, setJobState] = useState({ status: 'idle', progress: 0, url: null, error: null, warnings: [] });
  const [showWarnings, setShowWarnings] = useState(false);
  const pollTimerRef = useRef(null);

  // Stop polling helper
  const clearPoll = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // Poll status
  const pollStatus = async (id) => {
    try {
      const res = await getExportStatus(id);
      setJobState((prev) => ({
        ...prev,
        status: res.status,
        progress: res.progress || 0,
        url: res.url || null,
        error: res.error || null,
        warnings: res.warnings || [],
      }));

      if (['done', 'error', 'cancelled'].includes(res.status)) {
        clearPoll();
      }
    } catch (err) {
      setJobState((prev) => ({ ...prev, status: 'error', error: err.message || 'Status check failed' }));
      clearPoll();
    }
  };

  // Resume or start polling when modal opens or job changes
  useEffect(() => {
    if (!isOpen) return;
    if (exportJobId) {
      pollStatus(exportJobId);
      pollTimerRef.current = setInterval(() => pollStatus(exportJobId), 1000);
    }
    return () => clearPoll();
  }, [isOpen, exportJobId]);

  // Keyboard escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleStart = async () => {
    try {
      const [w, h] = res.split('x').map(Number);
      const payload = buildExportPayload(state, { width: w, height: h, fps: Number(fps) });
      setJobState({ status: 'queued', progress: 0, url: null, error: null, warnings: [] });
      const { jobId } = await startExport(payload);
      dispatch({ type: 'SET_EXPORT_JOB', payload: jobId });
      pollStatus(jobId);
      pollTimerRef.current = setInterval(() => pollStatus(jobId), 1000);
    } catch (err) {
      setJobState({ status: 'error', progress: 0, url: null, error: err.message || 'Failed to start export', warnings: [] });
    }
  };

  const handleCancel = async () => {
    if (!exportJobId) return;
    try {
      await cancelExport(exportJobId);
      setJobState((p) => ({ ...p, status: 'cancelled' }));
      clearPoll();
    } catch (_) {}
  };

  const isWorking = ['queued', 'running'].includes(jobState.status);
  const missingMediaIds = state.missingMediaIds || [];
  const missingClipsCount = (state.tracks || []).flatMap((t) => t.clips || []).filter((c) => c.mediaId && missingMediaIds.includes(c.mediaId)).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-100 text-sm">Export Video</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {jobState.status === 'idle' || jobState.status === 'cancelled' ? (
            <>
              {missingClipsCount > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-900/60 text-amber-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>{missingClipsCount} clip{missingClipsCount > 1 ? 's' : ''} use missing media and will be skipped</span>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Resolution</label>
                <select value={res} onChange={(e) => setRes(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                  <option value="1080x1920" className="bg-zinc-800 text-zinc-100">1080x1920 (9:16 Full HD)</option>
                  <option value="720x1280" className="bg-zinc-800 text-zinc-100">720x1280 (9:16 HD)</option>
                  <option value="540x960" className="bg-zinc-800 text-zinc-100">540x960 (9:16 SD)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Frame Rate</label>
                <select value={fps} onChange={(e) => setFps(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 focus:border-[#e31084] focus:ring-1 focus:ring-[#e31084]">
                  <option value="30" className="bg-zinc-800 text-zinc-100">30 fps (Standard)</option>
                  <option value="24" className="bg-zinc-800 text-zinc-100">24 fps (Cinema)</option>
                  <option value="25" className="bg-zinc-800 text-zinc-100">25 fps (PAL)</option>
                  <option value="60" className="bg-zinc-800 text-zinc-100">60 fps (Smooth)</option>
                </select>
              </div>

              <button onClick={handleStart}
                className="btn-brand-accent w-full mt-2 h-9 rounded-lg text-white font-medium text-xs shadow-md shadow-[#e31084]/25 transition-all cursor-pointer"
                style={{ backgroundColor: '#e31084' }}>
                Start Export
              </button>
            </>
          ) : isWorking ? (
            <div className="space-y-4 text-center py-3">
              <Loader2 className="w-8 h-8 text-[#e31084] animate-spin mx-auto" />
              <div>
                <p className="text-sm font-semibold text-zinc-100 capitalize">{jobState.status === 'queued' ? 'Queued...' : 'Rendering Video...'}</p>
                <p className="text-xs text-zinc-400 mt-1">{jobState.progress}% complete</p>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div className="bg-[#e31084] h-2 rounded-full transition-all duration-300" style={{ width: `${jobState.progress}%` }} />
              </div>
              <button onClick={handleCancel} className="px-4 py-1.5 text-xs text-red-400 hover:bg-red-950/40 rounded-md font-medium transition-colors">
                Cancel Export
              </button>
            </div>
          ) : jobState.status === 'done' ? (
            <div className="space-y-4 text-center py-2">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-zinc-100">Export Complete!</p>
                <p className="text-xs text-zinc-400 mt-0.5">Your MP4 is ready to download.</p>
              </div>
              {jobState.url && (
                <a href={jobState.url} download className="btn-brand-accent flex items-center justify-center gap-2 w-full h-9 rounded-lg text-white font-medium text-xs shadow-md shadow-[#e31084]/25 transition-all cursor-pointer"
                  style={{ backgroundColor: '#e31084' }}>
                  <Download className="w-4 h-4" />
                  Download Video
                </a>
              )}
              {jobState.warnings?.length > 0 && (
                <div className="text-left pt-2 border-t border-zinc-800">
                  <button onClick={() => setShowWarnings(!showWarnings)} className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Warnings ({jobState.warnings.length})
                  </button>
                  {showWarnings && (
                    <ul className="mt-2 text-[11px] text-zinc-400 space-y-1 bg-amber-950/40 p-2.5 rounded-md border border-amber-900/60">
                      {jobState.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                    </ul>
                  )}
                </div>
              )}
              <button onClick={() => { dispatch({ type: 'SET_EXPORT_JOB', payload: null }); setJobState({ status: 'idle', progress: 0, url: null, error: null, warnings: [] }); }}
                className="text-xs text-zinc-400 hover:text-zinc-200 underline block mx-auto">
                Start another export
              </button>
            </div>
          ) : (
            <div className="space-y-4 text-center py-2">
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-zinc-100">Export Failed</p>
                <p className="text-xs text-red-400 mt-1 max-h-24 overflow-y-auto px-2">{jobState.error || 'An unexpected error occurred'}</p>
              </div>
              <button onClick={() => setJobState({ status: 'idle', progress: 0, url: null, error: null, warnings: [] })}
                className="flex items-center justify-center gap-1.5 w-full h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs transition-colors border border-zinc-700">
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

