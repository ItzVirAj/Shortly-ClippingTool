import React, { useState, useEffect } from 'react';
import { 
  History, 
  Trash2, 
  ExternalLink, 
  Scissors, 
  Clock, 
  Calendar, 
  AlertCircle, 
  Loader2, 
  Tv, 
  Sparkles 
} from 'lucide-react';
import { apiJson } from '../../lib/api';
import AfterStreamReviewModal from './AfterStreamReviewModal';

export default function SessionHistory({ onSelectSession, onClipCut }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [reviewingSession, setReviewingSession] = useState(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiJson('/api/liveclipper/sessions');
      setSessions(Array.isArray(data) ? data : data.sessions || []);
    } catch (err) {
      setError(err.detail || 'Could not load session history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (sessionId) => {
    if (!window.confirm('Delete this session and all its saved data from disk?')) return;
    setDeletingId(sessionId);
    try {
      await apiJson(`/api/liveclipper/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      alert(err.detail || 'Failed to delete session.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const formatSec = (sec) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}m ${secs}s`;
  };

  return (
    <div className="bg-paper2/90 border border-rule rounded-card p-5 space-y-4 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-rule pb-3">
        <div className="flex items-center gap-2">
          <History size={18} className="text-brass" />
          <h3 className="font-semibold text-sm text-ink font-mono uppercase tracking-wider">
            Past Live Sessions
          </h3>
        </div>
        <button
          type="button"
          onClick={fetchHistory}
          disabled={loading}
          className="text-micro font-mono text-muted hover:text-ink transition-colors"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-input bg-danger/10 border border-danger/30 text-danger text-xs font-mono flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center items-center text-muted">
          <Loader2 size={24} className="animate-spin text-brass" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center text-muted gap-2 font-mono text-xs">
          <History size={28} className="opacity-40" />
          <p>No recorded sessions found.</p>
          <p className="text-micro text-muted/70">
            Sessions you start will be preserved here along with their cut clips.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-rule/60">
          {sessions.map((sess) => {
            const isDeleting = deletingId === sess.id;
            const stats = sess.stats || {};
            const config = sess.config || {};

            return (
              <div
                key={sess.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-paper/40 px-2 rounded-input transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-ink font-mono">
                      {config.channel || 'Stream'}
                    </span>
                    <span className="text-micro font-mono px-1.5 py-0.2 rounded bg-paper3 border border-rule text-muted">
                      {config.platform || 'kick'}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.2 rounded border ${
                        sess.state === 'stopped'
                          ? 'bg-ok/10 text-ok border-ok/20'
                          : sess.state === 'failed'
                          ? 'bg-danger/10 text-danger border-danger/20'
                          : 'bg-brass/10 text-brass border-brass/20'
                      }`}
                    >
                      {sess.state}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-micro font-mono text-muted">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} /> {formatDate(sess.created_at)}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Scissors size={11} className="text-brass" /> {stats.clips_cut || 0} clips
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> Mode: {config.recording_mode || 'rolling'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setReviewingSession(sess)}
                    className="px-3 py-1.5 rounded border border-brass/40 bg-brass/10 text-xs font-mono text-brass hover:bg-brass/20 transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
                    title="Review chat events and cut clips from recording"
                  >
                    <Sparkles size={12} />
                    <span>Review</span>
                  </button>
                  {onSelectSession && (
                    <button
                      type="button"
                      onClick={() => onSelectSession(sess)}
                      className="px-3 py-1.5 rounded border border-rule text-xs font-mono text-ink hover:border-brass hover:text-brass transition-colors"
                    >
                      View Clips
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(sess.id)}
                    disabled={isDeleting || sess.state === 'recording'}
                    className="p-1.5 rounded border border-rule text-muted hover:text-danger hover:border-danger/30 transition-colors disabled:opacity-40"
                    title={sess.state === 'recording' ? 'Cannot delete active session' : 'Delete session files'}
                  >
                    {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* After-Stream Review Modal */}
      {reviewingSession && (
        <AfterStreamReviewModal
          session={reviewingSession}
          onClose={() => setReviewingSession(null)}
          onClipCut={(newClip) => {
            if (onClipCut) onClipCut(newClip);
            fetchHistory();
          }}
        />
      )}
    </div>
  );
}
