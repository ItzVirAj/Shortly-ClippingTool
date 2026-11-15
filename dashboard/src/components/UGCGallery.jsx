import React, { useState, useEffect } from 'react';
import { Film, Download, Copy, Check, Loader2, Play, User } from 'lucide-react';
import { getApiUrl } from '../config';
import SegmentedControl from './ui/SegmentedControl';
import Modal from './ui/Modal';

export default function UGCGallery() {
  const [tab, setTab] = useState('videos');
  const [videos, setVideos] = useState([]);
  const [avatars, setAvatars] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [avatarsLoaded, setAvatarsLoaded] = useState(false);
  const [copied, setCopied] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoadingVideos(true);
    fetch(getApiUrl('/api/saasshorts/gallery?limit=100'))
      .then((r) => (r.ok ? r.json() : { videos: [] }))
      .then((d) => setVideos(d.videos || []))
      .catch(() => {})
      .finally(() => setLoadingVideos(false));
  }, []);

  useEffect(() => {
    if (tab !== 'avatars' || avatarsLoaded) return;
    setLoadingAvatars(true);
    fetch(getApiUrl('/api/saasshorts/actor-gallery'))
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((d) => setAvatars(d.images || []))
      .catch(() => {})
      .finally(() => {
        setLoadingAvatars(false);
        setAvatarsLoaded(true);
      });
  }, [tab, avatarsLoaded]);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const loading = (tab === 'videos' && loadingVideos) || (tab === 'avatars' && loadingAvatars);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-mono font-medium text-white/80 uppercase tracking-wider mb-1 backdrop-blur-md">
          <Film size={12} className="text-[#ff66b2]" />
          <span>05 · UGC Community Gallery</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">UGC Gallery</h2>
        <p className="font-mono text-xs text-white/50">
          {loadingVideos ? '…' : videos.length} videos
          {avatarsLoaded ? ` · ${avatars.length} avatars` : ''}
        </p>
      </div>

      <div className="max-w-xs w-full">
        <SegmentedControl
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'videos', label: `Videos (${loadingVideos ? '…' : videos.length})`, icon: <Film size={14} /> },
            { value: 'avatars', label: `Avatars (${avatarsLoaded ? avatars.length : '…'})`, icon: <User size={14} /> },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 p-8 rounded-3xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl">
          <Loader2 size={24} className="animate-spin text-[#ff66b2]" />
          <span className="ml-2.5 text-white/60 text-sm">Loading gallery...</span>
        </div>
      ) : tab === 'videos' ? (
        videos.length === 0 ? (
          <div className="text-center py-20 p-8 rounded-3xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl">
            <Film size={40} className="mx-auto text-white/30 mb-3" />
            <p className="text-sm text-white/60">No videos yet. Generate one from AI Shorts.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
            {videos.map((video) => (
              <VideoCard
                key={video.video_id}
                video={video}
                copied={copied}
                onCopy={handleCopy}
                onOpen={() => setSelected(video)}
              />
            ))}
          </div>
        )
      ) : avatars.length === 0 ? (
        <div className="text-center py-20 p-8 rounded-3xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl">
          <User size={40} className="mx-auto text-white/30 mb-3" />
          <p className="text-sm text-white/60">No avatars yet. Generate actors from AI Shorts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3.5">
          {avatars.map((avatar, i) => (
            <AvatarCard key={avatar.key || i} avatar={avatar} copied={copied} onCopy={handleCopy} />
          ))}
        </div>
      )}

      {selected && (
        <Modal
          isOpen
          onClose={() => setSelected(null)}
          size="sm"
          eyebrow={selected.video_mode === 'lowcost' ? 'LOW COST' : 'PREMIUM'}
          title={selected.title || 'Untitled'}
        >
          <video
            src={selected.video_url}
            poster={selected.actor_url}
            controls
            autoPlay
            playsInline
            className="w-full rounded-2xl bg-black border border-white/10 aspect-[9/16] object-contain max-h-[60vh] shadow-2xl"
          />
          <p className="font-mono text-xs text-white/60 mt-3">
            {selected.duration?.toFixed(0)}s
            {selected.cost_estimate?.total != null ? ` · $${selected.cost_estimate.total.toFixed(2)}` : ''}
          </p>
          {selected.caption && (
            <p className="text-xs sm:text-sm text-white/80 mt-2 leading-relaxed bg-white/[0.03] p-3 rounded-xl border border-white/[0.08]">{selected.caption}</p>
          )}
          <a
            href={selected.video_url}
            download
            className="w-full mt-4 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-95 text-white font-medium text-xs shadow-[0_4px_16px_rgba(227,16,132,0.35)] transition-all flex items-center justify-center gap-1.5 no-underline cursor-pointer"
          >
            <Download size={14} /> Download
          </a>
        </Modal>
      )}
    </div>
  );
}

function AvatarCard({ avatar, copied, onCopy }) {
  return (
    <div className="group rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] hover:border-white/[0.18] overflow-hidden transition-all duration-200 active:scale-[0.98] shadow-sm flex flex-col justify-between">
      <div className="aspect-[3/4] bg-black overflow-hidden relative">
        <img src={avatar.url} alt="Avatar" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      </div>
      <div className="p-2.5 space-y-2">
        {avatar.description ? (
          <div className="relative pr-5">
            <p className="text-[11px] text-white/70 line-clamp-2 leading-tight">{avatar.description}</p>
            <button
              type="button"
              onClick={() => onCopy(avatar.description, `avatar-${avatar.key}`)}
              className="absolute top-0 right-0 p-0.5 text-white/50 hover:text-[#ff66b2] transition-colors cursor-pointer"
              title="Copy prompt"
            >
              {copied === `avatar-${avatar.key}` ? <Check size={11} className="text-emerald-400" strokeWidth={2.5} /> : <Copy size={11} />}
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-white/40 italic">No description</p>
        )}
        <a
          href={avatar.url}
          download
          className="block text-center text-[11px] bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white py-1 px-2 rounded-lg transition-all no-underline border border-white/[0.08]"
        >
          <Download size={11} className="inline mr-1" />Download
        </a>
      </div>
    </div>
  );
}

function VideoCard({ video, copied, onCopy, onOpen }) {
  const mode = video.video_mode;
  const caption = video.caption || '';
  const hashtags = (video.hashtags || []).join(' ');

  return (
    <div className="group rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] hover:border-white/[0.18] overflow-hidden transition-all duration-200 active:scale-[0.98] shadow-sm flex flex-col justify-between">
      <button
        type="button"
        onClick={onOpen}
        className="relative aspect-[9/16] w-full p-0 border-0 bg-black overflow-hidden cursor-pointer group"
      >
        {video.actor_url ? (
          <img
            src={video.actor_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-black/60" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors">
          <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
            <Play size={18} className="translate-x-0.5 text-white" />
          </div>
        </div>
        <div className="absolute top-2 right-2">
          <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-mono font-semibold border backdrop-blur-md ${
            mode === 'lowcost' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35' : 'bg-[#e31084]/20 text-[#ff7dc2] border-[#e31084]/35'
          }`}>
            {mode === 'lowcost' ? 'LOW COST' : 'PREMIUM'}
          </span>
        </div>
      </button>

      <div className="p-2.5 space-y-1.5">
        <h3 className="text-xs font-semibold text-white truncate">{video.title || 'Untitled'}</h3>
        <p className="font-mono text-[10.5px] text-white/50">
          {video.duration?.toFixed(0)}s · ${video.cost_estimate?.total?.toFixed(2) || '?'}
        </p>
        {caption && (
          <div className="relative pr-5">
            <p className="text-[11px] text-white/70 line-clamp-2 leading-tight">{caption}</p>
            <button
              type="button"
              onClick={() => onCopy(`${caption}\n${hashtags}`, `caption-${video.video_id}`)}
              className="absolute top-0 right-0 p-0.5 text-white/50 hover:text-[#ff66b2] transition-colors cursor-pointer"
              title="Copy caption"
            >
              {copied === `caption-${video.video_id}` ? <Check size={11} className="text-emerald-400" strokeWidth={2.5} /> : <Copy size={11} />}
            </button>
          </div>
        )}
        <a
          href={video.video_url}
          download
          className="block text-center text-[11px] bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white py-1 px-2 rounded-lg transition-all no-underline border border-white/[0.08]"
        >
          <Download size={11} className="inline mr-1" />Download
        </a>
      </div>
    </div>
  );
}
