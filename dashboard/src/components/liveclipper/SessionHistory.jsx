import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
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

  return (
    <section>
      <header className="lc-heading">
        <div>
          <h2>Session history</h2>
          <p>Review recordings and cut highlights from earlier streams.</p>
        </div>
        <button className="lc-secondary" disabled={loading} onClick={fetchHistory}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!error && !loading && !sessions.length && (
        <p className="lc-empty">Your recorded sessions will appear here.</p>
      )}
      {sessions.map((sess) => (
        <article className="lc-history-row" key={sess.id}>
          <div>
            <h3>{sess.config?.channel || 'Stream'}</h3>
            <p>
              {[
                sess.config?.platform,
                formatDate(sess.created_at),
                sess.state,
                sess.config?.recording_mode,
                (sess.stats?.clips_cut ?? 0) + ' clips',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="lc-tools">
            <button onClick={() => onSelectSession(sess)}>View clips</button>
            <button onClick={() => setReviewingSession(sess)}>Review timeline</button>
            <button
              aria-label={'Delete session ' + sess.config?.channel}
              disabled={
                deletingId === sess.id ||
                ['waiting_for_live', 'recording', 'connecting', 'stopping'].includes(sess.state)
              }
              onClick={() => handleDelete(sess.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </article>
      ))}
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
    </section>
  );
}
