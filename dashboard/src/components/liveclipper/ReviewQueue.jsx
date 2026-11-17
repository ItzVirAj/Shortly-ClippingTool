import React, { useState, useEffect } from 'react';
import { 
  Check, 
  X, 
  Play, 
  RotateCcw, 
  Film, 
  Clock, 
  Zap, 
  Tag, 
  Loader2, 
  AlertCircle,
  Scissors,
  Bookmark,
  Sparkles,
  Wand2
} from 'lucide-react';
import { getApiUrl } from '../../config';
import { apiJson } from '../../lib/api';
import AutoShortsPipelineModal from './AutoShortsPipelineModal';

export default function ReviewQueue({
  items = [],
  onApprove,
  onReject,
  onOpenInEditor,
  loading = false,
}) {
  const [filter, setFilter] = useState('pending'); // 'pending' | 'approved' | 'all'
  const [actingIds, setActingIds] = useState(new Set());
  const [videoErrors, setVideoErrors] = useState(new Set());
  const [protectState, setProtectState] = useState({});
  const [pipelineModalClip, setPipelineModalClip] = useState(null);

  const handleToggleProtect = async (item) => {
    try {
      const nextVal = item.keep_forever ? false : true;
      const res = await apiJson(`/api/liveclipper/queue/${item.id}/protect`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_forever: nextVal }),
      });
      item.keep_forever = res.keep_forever;
      setProtectState((prev) => ({ ...prev, [item.id]: res.keep_forever }));
    } catch (err) {
      console.error('Failed to toggle protection:', err);
    }
  };

  const handleAction = async (actionFn, itemId) => {
    setActingIds((prev) => new Set(prev).add(itemId));
    try {
      await actionFn(itemId);
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'pending') return item.status === 'pending_review';
    if (filter === 'approved') return ['approved', 'processing', 'completed'].includes(item.status);
    return true;
  });

  const pendingCount = items.filter((it) => it.status === 'pending_review').length;
  const approvedCount = items.filter((it) => ['approved', 'processing', 'completed'].includes(it.status)).length;

  useEffect(() => {
    // If clips exist in this session but none are pending (e.g. past approved clips), default to 'all' so clips are visible
    if (items.length > 0 && pendingCount === 0 && filter === 'pending') {
      setFilter('all');
    }
  }, [items.length, pendingCount]);

  const formatSec = (sec) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-ok border-ok/30 bg-ok/10';
    if (score >= 50) return 'text-brass border-brass/30 bg-brass/10';
    return 'text-muted border-rule bg-paper';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending_review':
        return <span className="px-2 py-0.5 rounded text-micro font-mono bg-warn/10 text-warn border border-warn/20">Pending Review</span>;
      case 'approved':
        return <span className="px-2 py-0.5 rounded text-micro font-mono bg-brass/10 text-brass border border-brass/20">Approved (Queued)</span>;
      case 'processing':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1 animate-pulse">
            <Loader2 size={10} className="animate-spin" /> Rendering
          </span>
        );
      case 'completed':
        return <span className="px-2 py-0.5 rounded text-micro font-mono bg-ok/10 text-ok border border-ok/20">Render Complete</span>;
      case 'failed':
        return <span className="px-2 py-0.5 rounded text-micro font-mono bg-danger/10 text-danger border border-danger/20">Render Failed</span>;
      case 'rejected':
        return <span className="px-2 py-0.5 rounded text-micro font-mono bg-paper3 text-muted border border-rule">Rejected</span>;
      default:
        return null;
    }
  };

  return (
    <div className="bg-paper2/50 border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-xl shadow-xl">
      {/* Header and Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Scissors size={18} className="text-brass" />
          <h3 className="font-semibold text-sm text-ink font-mono uppercase tracking-wider">
            Clip Review Queue
          </h3>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-micro font-mono font-bold bg-brass text-brassink">
              {pendingCount} new
            </span>
          )}
        </div>

        {/* Filters (Apple Segmented Picker) */}
        <div className="flex items-center gap-1 bg-black/25 backdrop-blur-md p-1 rounded-xl border border-white/10 text-micro font-mono">
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer active:scale-95 ${
              filter === 'pending' ? 'bg-white/10 text-white border border-white/15 font-semibold shadow-xs' : 'text-muted hover:text-ink border border-transparent'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('approved')}
            className={`px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer active:scale-95 ${
              filter === 'approved' ? 'bg-white/10 text-white border border-white/15 font-semibold shadow-xs' : 'text-muted hover:text-ink border border-transparent'
            }`}
          >
            In Pipeline ({approvedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer active:scale-95 ${
              filter === 'all' ? 'bg-white/10 text-white border border-white/15 font-semibold shadow-xs' : 'text-muted hover:text-ink border border-transparent'
            }`}
          >
            All ({items.length})
          </button>
        </div>
      </div>

      {/* Cards List */}
      {filteredItems.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center text-muted gap-2 font-mono text-xs">
          <Scissors size={28} className="opacity-40" />
          <p>
            {filter === 'pending'
              ? 'No clips currently awaiting review.'
              : 'No clips match this filter.'}
          </p>
          <p className="text-micro text-muted/70">
            Detected chat reaction moments will automatically populate here as raw video cuts.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const isActing = actingIds.has(item.id);
            const previewUrl = getApiUrl(`/api/liveclipper/queue/${item.id}/preview`);

            return (
              <div
                key={item.id}
                className="bg-paper border border-rule rounded-input overflow-hidden flex flex-col justify-between hover:border-brass/40 transition-colors shadow-sm"
              >
                {/* Video Player */}
                <div className="relative aspect-video bg-black/80 w-full overflow-hidden flex items-center justify-center">
                  {videoErrors.has(item.id) ? (
                    <div className="p-4 text-center text-muted font-mono text-xs flex flex-col items-center justify-center gap-1.5">
                      <AlertCircle size={20} className="text-muted/60" />
                      <span>Video file not found on disk</span>
                    </div>
                  ) : (
                    <video
                      src={previewUrl}
                      controls
                      preload="metadata"
                      playsInline
                      onError={() => setVideoErrors((prev) => new Set(prev).add(item.id))}
                      className="w-full h-full object-contain"
                    />
                  )}
                  {/* Floating score badge */}
                  <div className="absolute top-2 right-2">
                    <span
                      className={`px-2 py-0.5 rounded text-micro font-mono font-bold border backdrop-blur-md ${getScoreColor(
                        item.score
                      )}`}
                    >
                      Score: {Math.round(item.score)}
                    </span>
                  </div>
                </div>

                {/* Card Info & Meta */}
                <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-mono text-ink font-semibold flex items-center gap-1.5">
                        <Clock size={12} className="text-brass" />
                        <span>{formatSec(item.start_t)} - {formatSec(item.end_t)}</span>
                        <span className="text-muted text-micro font-normal">({item.duration?.toFixed(1)}s)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleProtect(item)}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            item.keep_forever
                              ? 'text-brass bg-brass/10 border border-brass/30'
                              : 'text-muted hover:text-ink'
                          }`}
                          title={item.keep_forever ? 'Protected: will not be deleted by 7-day retention cleanup' : 'Pin to protect from retention cleanup'}
                        >
                          <Bookmark size={13} fill={item.keep_forever ? 'currentColor' : 'none'} />
                        </button>
                        {getStatusBadge(item.status)}
                      </div>
                    </div>

                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((tg, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-paper3 border border-rule text-muted"
                          >
                            #{tg}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Error description if failed */}
                    {item.error && (
                      <div className="text-[11px] font-mono text-danger bg-danger/10 border border-danger/20 p-1.5 rounded flex items-start gap-1">
                        <AlertCircle size={12} className="shrink-0 mt-0.5" />
                        <span>{item.error}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-rule/60 flex flex-wrap items-center justify-between gap-2">
                    {/* Dedicated Auto Shorts Button on every clip */}
                    <button
                      type="button"
                      onClick={() => setPipelineModalClip(item)}
                      className="btn-brand-accent px-3.5 py-1.5 rounded-xl !text-white font-bold text-xs flex items-center gap-1.5 shadow-[0_3px_14px_rgba(227,16,132,0.35)] hover:brightness-110 active:scale-95 transition-all cursor-pointer border-t border-white/20"
                      style={{ color: '#ffffff', backgroundColor: '#e31084' }}
                      title="Convert this clip to vertical Auto Shorts (Screen ratio, Whisper, AI hooks, Subtitles)"
                    >
                      <Sparkles size={12} className="!text-white fill-white shrink-0" style={{ color: '#ffffff', fill: '#ffffff' }} />
                      <span className="!text-white font-bold tracking-tight" style={{ color: '#ffffff' }}>Auto Shorts</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {item.status === 'pending_review' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleAction(onReject, item.id)}
                            disabled={isActing}
                            className="px-2 py-1.5 rounded-lg border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
                            title="Reject and delete clip file"
                          >
                            <X size={12} />
                            <span>Reject</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction(onApprove, item.id)}
                            disabled={isActing}
                            className="px-2.5 py-1.5 rounded-lg border border-ok/30 bg-ok/10 hover:bg-ok/20 text-ok text-xs font-mono font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Approve clip and send to Shortly rendering pipeline"
                          >
                            {isActing ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Check size={12} />
                            )}
                            <span>Approve</span>
                          </button>
                        </>
                      )}

                      {item.status === 'failed' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleAction(onReject, item.id)}
                            disabled={isActing}
                            className="px-2.5 py-1.5 rounded-lg border border-rule text-muted hover:text-ink text-xs font-mono"
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction(onApprove, item.id)}
                            disabled={isActing}
                            className="px-3 py-1.5 rounded-lg border border-brass/30 bg-brass/10 hover:bg-brass/20 text-brass text-xs font-mono flex items-center gap-1 font-semibold"
                          >
                            <RotateCcw size={12} />
                            <span>Retry</span>
                          </button>
                        </>
                      )}

                      {item.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => onOpenInEditor && onOpenInEditor(item)}
                          className="py-1.5 px-3 rounded-lg border border-brass bg-brass text-brassink hover:brightness-110 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Film size={12} />
                          <span>Open in Editor</span>
                        </button>
                      )}

                      {item.status === 'approved' && (
                        <span className="text-micro font-mono text-muted flex items-center gap-1">
                          <Clock size={11} /> Queued
                        </span>
                      )}

                      {item.status === 'processing' && (
                        <span className="text-micro font-mono text-purple-400 flex items-center gap-1">
                          <Loader2 size={11} className="animate-spin" /> Rendering...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pop-up Modal: Auto Shorts Pipeline */}
      {pipelineModalClip && (
        <AutoShortsPipelineModal
          clip={pipelineModalClip}
          onClose={() => setPipelineModalClip(null)}
          onApprove={onApprove}
          onOpenInEditor={onOpenInEditor}
        />
      )}
    </div>
  );
}
