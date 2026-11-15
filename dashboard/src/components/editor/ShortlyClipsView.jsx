import React, { useState, useEffect } from 'react';
import { Film, RefreshCw, Check, Loader2, Video } from 'lucide-react';
import { listShortlyClips, importClip } from './editorApi';
import { useEditor } from './editorStore';

function fmtDur(s = 0) {
  if (!s || !Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function ShortlyClipsView() {
  const { state, dispatch } = useEditor();
  const { media } = state;

  const [clips, setClips] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importingId, setImportingId] = useState(null);

  const fetchClips = () => {
    setLoading(true);
    setError('');
    listShortlyClips()
      .then((items) => {
        setClips(items || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load clips');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchClips();
  }, []);

  const handleImport = async (clip) => {
    if (importingId) return;
    setImportingId(clip.id);
    try {
      const res = await importClip(clip.id);
      if (res && res.id) {
        const alreadyInMedia = media.some((m) => m.id === res.id || m.sourceClipId === clip.id);
        if (!alreadyInMedia) {
          dispatch({ type: 'ADD_MEDIA', payload: res });
        }
      }
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImportingId(null);
    }
  };

  const isImported = (clipId) => media.some((m) => m.sourceClipId === clipId || m.id === clipId);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin mb-2" />
        <p className="text-xs text-zinc-400">Loading generated clips...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
        <p className="text-xs text-red-400">{error}</p>
        <button
          type="button"
          onClick={fetchClips}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md transition-colors"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  if (!clips || clips.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 mb-2">
          <Film size={18} />
        </div>
        <p className="text-xs font-medium text-zinc-300">No generated clips yet</p>
        <p className="text-[11px] text-zinc-500 mt-1 max-w-[180px]">Generate clips in Shortly to import them directly here</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {clips.map((clip) => {
          const imported = isImported(clip.id);
          const busy = importingId === clip.id;

          return (
            <div
              key={clip.id}
              className="group border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900 flex flex-col"
            >
              <div className="aspect-video w-full bg-zinc-950 relative overflow-hidden flex items-center justify-center">
                {clip.thumbUrl ? (
                  <img src={clip.thumbUrl} alt={clip.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-600">
                    <Video size={20} />
                  </div>
                )}
                {clip.duration != null && clip.duration > 0 && (
                  <span className="absolute bottom-1 left-1 bg-black/80 text-white text-[9px] font-mono px-1 rounded">
                    {fmtDur(clip.duration)}
                  </span>
                )}
              </div>

              <div className="p-1.5 bg-zinc-900 border-t border-zinc-800/80 flex flex-col justify-between flex-1 gap-1">
                <p className="text-[11px] text-zinc-300 font-medium truncate" title={clip.name}>
                  {clip.name}
                </p>
                <button
                  type="button"
                  disabled={imported || busy}
                  onClick={() => handleImport(clip)}
                  className={`w-full py-1 px-2 text-[10px] font-semibold rounded transition-all flex items-center justify-center gap-1 ${
                    imported
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      : busy
                      ? 'bg-[#e31084]/20 text-[#e31084] cursor-wait'
                      : 'btn-brand-accent text-white shadow-xs cursor-pointer'
                  }`}
                  style={!imported && !busy ? { backgroundColor: '#e31084' } : undefined}
                >
                  {imported ? (
                    <>
                      <Check size={10} />
                      Imported
                    </>
                  ) : busy ? (
                    <>
                      <Loader2 size={10} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    'Import'
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

