import React, { useState, useEffect, useRef } from 'react';
import { Upload, ArrowUpDown, Disc, Plus, Trash2, Music, AlertCircle, RefreshCw } from 'lucide-react';
import { useEditor } from './editorStore';
import { uploadMedia, listMedia, deleteMedia } from './editorApi';
import { addMediaToTimeline, uid } from './editorUtils';
import ShortlyClipsView from './ShortlyClipsView';

const ACCEPTED_EXTS = '.mp4,.mov,.webm,.mkv,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.aac';

function fmtDur(s = 0) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function MediaPanel({ activeItem = 'Media' }) {
  const { state, dispatch } = useEditor();
  const { media } = state;
  const [activeTab, setActiveTab] = useState('uploads');
  const [loadError, setLoadError] = useState('');
  const [pendingUploads, setPendingUploads] = useState([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    listMedia()
      .then((items) => {
        if (mounted) dispatch({ type: 'SET_MEDIA', payload: items });
      })
      .catch((err) => {
        if (mounted) setLoadError(err.message || 'Failed to load media');
      });
    return () => { mounted = false; };
  }, [dispatch]);

  const processUploadItem = async (item) => {
    setPendingUploads((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading', error: null } : p)));
    try {
      const res = await uploadMedia(item.file, (pct) => {
        setPendingUploads((prev) => prev.map((p) => (p.id === item.id ? { ...p, progress: pct } : p)));
      });
      dispatch({ type: 'ADD_MEDIA', payload: res });
      setPendingUploads((prev) => prev.filter((p) => p.id !== item.id));
    } catch (err) {
      setPendingUploads((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'error', error: err.message } : p)));
    }
  };

  const handleFiles = (fileList) => {
    if (!fileList || !fileList.length) return;
    const newItems = Array.from(fileList).map((f) => ({
      id: uid(), file: f, progress: 0, status: 'pending', error: null,
    }));
    setPendingUploads((prev) => [...prev, ...newItems]);
    newItems.forEach((item) => processUploadItem(item));
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this media?')) return;
    try {
      await deleteMedia(id);
      dispatch({ type: 'REMOVE_MEDIA', payload: id });
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  if (activeItem !== 'Media') {
    return (
      <div className="flex-1 p-4 flex flex-col bg-white">
        <h2 className="text-sm font-semibold text-gray-800">{activeItem}</h2>
        <div className="flex-1 flex items-center justify-center"><p className="text-xs text-gray-400">Coming soon</p></div>
      </div>
    );
  }

  const hasContent = media.length > 0 || pendingUploads.length > 0;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); handleFiles(e.dataTransfer.files); }}
      className={`flex-1 p-3 flex flex-col bg-zinc-900 text-zinc-100 overflow-hidden transition-colors ${isDraggingOver ? 'border-2 border-dashed border-emerald-500 bg-emerald-950/20' : ''}`}
    >
      <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXTS} className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />

      <h2 className="text-sm font-semibold text-zinc-100 mb-2">Media</h2>
      {loadError && <div className="text-[11px] text-red-400 mb-2 flex items-center gap-1"><AlertCircle size={12} />{loadError}</div>}

      {/* Segmented Control */}
      <div className="flex bg-zinc-800 p-0.5 rounded-lg mb-2 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('uploads')}
          className={`flex-1 py-1 rounded-md font-medium text-[11px] transition-colors ${
            activeTab === 'uploads' ? 'bg-zinc-700 text-zinc-100 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          My uploads
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('shortly')}
          className={`flex-1 py-1 rounded-md font-medium text-[11px] transition-colors ${
            activeTab === 'shortly' ? 'bg-zinc-700 text-zinc-100 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Shortly clips
        </button>
      </div>

      {activeTab === 'shortly' ? (
        <ShortlyClipsView />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="btn-brand-accent flex-1 py-1.5 px-3 text-xs font-semibold text-white rounded-lg shadow-md shadow-[#e31084]/20 transition-all cursor-pointer"
              style={{ backgroundColor: '#e31084' }}>
              Upload
            </button>
            <button type="button" disabled title="Coming soon"
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium bg-zinc-800 text-zinc-500 rounded-lg cursor-not-allowed">
              <Disc size={13} className="text-zinc-500" />Record
            </button>
            <button type="button" disabled title="Coming soon" aria-label="Swap view"
              className="p-1.5 text-zinc-600 rounded-lg border border-zinc-800 cursor-not-allowed">
              <ArrowUpDown size={14} />
            </button>
          </div>

      {!hasContent ? (
        <div className="flex-1 border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center p-4 text-center bg-zinc-900/40">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 mb-3"><Upload size={20} /></div>
          <p className="text-xs font-semibold text-zinc-200">No media imported</p>
          <p className="text-[11px] text-zinc-400 mt-1 mb-3">Drag files here or click to import</p>
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="py-1.5 px-3 text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg hover:border-[#e31084] hover:text-white transition-colors shadow-xs cursor-pointer">
            Import Media
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5 space-y-2">
          {pendingUploads.map((item) => (
            <div key={item.id} className="p-2 border border-zinc-800 rounded-lg bg-zinc-800/60 text-xs">
              <div className="flex items-center justify-between truncate mb-1">
                <span className="truncate font-medium text-zinc-300">{item.file.name}</span>
                {item.status === 'error' && (
                  <button type="button" onClick={() => processUploadItem(item)} className="text-[#e31084] hover:underline flex items-center gap-0.5 text-[10px]">
                    <RefreshCw size={10} />Retry
                  </button>
                )}
              </div>
              {item.status === 'error' ? (
                <p className="text-[10px] text-red-400 truncate">{item.error || 'Upload failed'}</p>
              ) : (
                <div className="w-full bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#e31084] h-full transition-all duration-150" style={{ width: `${item.progress}%` }} />
                </div>
              )}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            {media.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('application/x-editor-media', item.id); }}
                onClick={() => dispatch({ type: 'SELECT_CLIP', payload: null })}
                onDoubleClick={() => addMediaToTimeline(item, dispatch, state)}
                className="group relative border border-zinc-800 rounded-lg overflow-hidden bg-zinc-850 hover:border-zinc-700 cursor-grab select-none flex flex-col"
              >
                <div className="aspect-video w-full bg-zinc-950 relative overflow-hidden flex items-center justify-center">
                  {item.thumbUrl ? (
                    <img src={item.thumbUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : item.type === 'audio' ? (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-500"><Music size={20} /></div>
                  ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-500 capitalize text-[10px]">{item.type}</div>
                  )}

                  <span className="absolute bottom-1 left-1 bg-black/80 text-white text-[9px] font-mono px-1 rounded">
                    {fmtDur(item.duration)}
                  </span>

                  {/* Hover Buttons */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      aria-label="Add to timeline"
                      onClick={(e) => { e.stopPropagation(); addMediaToTimeline(item, dispatch, state); }}
                      className="p-1.5 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 rounded-full shadow-sm hover:scale-105 transition-transform"
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => handleDelete(e, item.id)}
                      className="p-1.5 bg-zinc-800/90 hover:bg-zinc-700 text-red-400 rounded-full shadow-sm hover:scale-105 transition-transform"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="p-1.5 bg-zinc-900 border-t border-zinc-800/80">
                  <p className="text-[11px] text-zinc-300 truncate" title={item.name}>{item.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
