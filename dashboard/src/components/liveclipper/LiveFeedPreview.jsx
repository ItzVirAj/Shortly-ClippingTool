import React, { useState, useEffect, useRef } from 'react';
import { 
  Tv, 
  MessageSquare, 
  ExternalLink, 
  Maximize2, 
  Minimize2, 
  Eye, 
  EyeOff,
  Radio,
  ArrowDown,
  PictureInPicture
} from 'lucide-react';

export default function LiveFeedPreview({ 
  session, 
  messages = [], 
  transport,
  streamRate = 0,
  msgsPerMin = 0,
}) {
  const [showPlayer, setShowPlayer] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const chatScrollRef = useRef(null);

  const channel = session?.config?.channel || '';
  const platform = session?.config?.platform || 'kick';
  const isTwitch = platform === 'twitch';
  const isYouTube = platform === 'youtube';

  // Embed URLs
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const twitchEmbedUrl = `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(currentHost)}&muted=${isMuted}&autoplay=true`;
  const kickEmbedUrl = `https://player.kick.cx/${encodeURIComponent(channel)}?autoplay=true&muted=true`;
  
  const ytVideoId = channel.match(/(?:v=|youtu\.be\/|live\/)([a-zA-Z0-9_-]{11})/)?.[1];
  const youtubeEmbedUrl = ytVideoId 
    ? `https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=1&mute=1`
    : `https://www.youtube-nocookie.com/embed/live_stream?channel=${encodeURIComponent(channel.replace(/^@/, ''))}&autoplay=1&mute=1`;

  const liveUrl = isYouTube
    ? (channel.startsWith('http') ? channel : `https://youtube.com/${channel.startsWith('@') ? channel : '@' + channel}/live`)
    : isTwitch 
      ? `https://twitch.tv/${channel}` 
      : `https://kick.com/${channel}`;

  const handlePopoutPlayer = () => {
    const embedUrl = isYouTube ? youtubeEmbedUrl : isTwitch ? twitchEmbedUrl : kickEmbedUrl;
    const w = 680;
    const h = 420;
    const left = Math.round((window.screen.width - w) / 2);
    const top = Math.round((window.screen.height - h) / 2);
    window.open(
      embedUrl,
      'StreamPopout',
      `width=${w},height=${h},top=${top},left=${left},resizable=yes,scrollbars=no,status=no,menubar=no`
    );
  };

  // Auto-scroll chat box when new messages arrive if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Handle user manual scroll in chat container
  const handleScroll = () => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 30;
    if (atBottom !== autoScroll) {
      setAutoScroll(atBottom);
    }
  };

  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const formatMsgTime = (msg) => {
    if (!msg) return '';

    // 1. Direct created_at ISO timestamp
    if (msg.created_at) {
      try {
        const d = new Date(msg.created_at);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
      } catch (_) {}
    }

    // 2. Computed from session started_at + monotonic offset m.t
    if (typeof msg.t === 'number' && session?.started_at) {
      try {
        const startTime = new Date(session.started_at).getTime();
        const d = new Date(startTime + msg.t * 1000);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
      } catch (_) {}
    }

    // 3. Fallback: elapsed offset in mm:ss
    if (typeof msg.t === 'number') {
      const m = Math.floor(msg.t / 60);
      const s = Math.floor(msg.t % 60);
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    return '';
  };

  const currentHeightClass = isExpanded 
    ? 'h-[460px]' 
    : showPlayer 
      ? 'h-[230px]' 
      : 'h-[180px]';

  return (
    <div className="bg-paper2/50 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-3 shadow-xl transition-all duration-200">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute opacity-75" />
            <span className="w-2 h-2 rounded-full bg-emerald-400 relative" />
          </div>
          <span className="font-semibold text-xs font-mono uppercase tracking-wider text-ink flex items-center gap-1.5">
            <Radio size={13} className="text-emerald-400" />
            Live Feed
          </span>
          <span className="text-micro font-mono px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-muted">
            {platform.toUpperCase()}: @{channel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Expand / Compact Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`px-2.5 py-1 rounded-xl border text-micro font-mono transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
              isExpanded 
                ? 'bg-brass text-brassink border-brass font-bold' 
                : 'border-white/10 bg-white/[0.03] text-muted hover:text-ink'
            }`}
            title={isExpanded ? 'Switch to compact view' : 'Expand to large view'}
          >
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            <span>{isExpanded ? 'Compact' : 'Expand'}</span>
          </button>

          {/* Show / Hide Player Toggle */}
          <button
            type="button"
            onClick={() => setShowPlayer((prev) => !prev)}
            className="px-2.5 py-1 rounded-xl border border-white/10 bg-white/[0.03] text-micro font-mono text-muted hover:text-ink transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            title={showPlayer ? 'Hide video player' : 'Show video player'}
          >
            {showPlayer ? <EyeOff size={12} /> : <Eye size={12} />}
            <span>{showPlayer ? 'Hide Player' : 'Show Player'}</span>
          </button>

          {/* Pop-out Standalone Floating Player */}
          {showPlayer && (
            <button
              type="button"
              onClick={handlePopoutPlayer}
              className="px-2.5 py-1 rounded-xl border border-white/10 bg-white/[0.03] text-micro font-mono text-muted hover:text-brass transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Pop out floating stream window"
            >
              <PictureInPicture size={12} />
              <span className="hidden sm:inline">Pop-out</span>
            </button>
          )}

          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-xl border border-white/10 bg-white/[0.03] text-micro font-mono text-muted hover:text-brass transition-all flex items-center gap-1.5"
            title="Open channel in new browser tab"
          >
            <ExternalLink size={12} />
            <span className="hidden sm:inline">External</span>
          </a>
        </div>
      </div>

      {/* Main Grid: Stream Player (Left) + Live Chat Feed (Right) */}
      <div className={`grid grid-cols-1 ${showPlayer ? 'lg:grid-cols-12' : ''} gap-3`}>
        {/* Video Player */}
        {showPlayer && (
          <div className={`${isExpanded ? 'lg:col-span-8' : 'lg:col-span-7'} flex flex-col space-y-1.5`}>
            <div className={`relative w-full ${currentHeightClass} rounded-xl overflow-hidden bg-black border border-white/10 shadow-inner flex items-center justify-center transition-all duration-200`}>
              {isTwitch ? (
                <iframe
                  src={twitchEmbedUrl}
                  title={`Twitch Stream - ${channel}`}
                  className="w-full h-full border-0"
                  allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                  allowFullScreen
                />
              ) : isYouTube ? (
                <iframe
                  src={youtubeEmbedUrl}
                  title={`YouTube Stream - ${channel}`}
                  className="w-full h-full border-0"
                  allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                  allowFullScreen
                />
              ) : (
                <iframe
                  src={kickEmbedUrl}
                  title={`Kick Stream - ${channel}`}
                  className="w-full h-full border-0"
                  allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                  allowFullScreen
                />
              )}
            </div>

            <div className="flex items-center justify-between text-micro font-mono text-muted px-1">
              <span className="flex items-center gap-1">
                <Tv size={11} className="text-brass" /> Direct Embed • {platform}
              </span>
              <span>Low-latency preview</span>
            </div>
          </div>
        )}

        {/* Live Chat Feed - Strictly bounded height with min-h-0 flex scrolling */}
        <div className={`${showPlayer ? (isExpanded ? 'lg:col-span-4' : 'lg:col-span-5') : 'col-span-1'} flex flex-col ${currentHeightClass} transition-all duration-200`}>
          <div className="bg-black/35 border border-white/10 rounded-xl flex flex-col h-full overflow-hidden shadow-inner">
            {/* Chat header */}
            <div className="p-2 border-b border-white/10 bg-white/[0.03] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-ink">
                <MessageSquare size={13} className="text-red-500" />
                <span>Live Chat{transport && ` · ${transport}`}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="flex items-center gap-2 text-micro font-mono">
                <span className="px-2 py-0.5 rounded-full bg-brass/10 border border-brass/25 text-brass font-bold flex items-center gap-1">
                  <span>~{msgsPerMin} msgs/min</span>
                  {streamRate > 0 && <span className="text-muted/80 font-normal">({streamRate}/s)</span>}
                </span>
                <span className="text-muted">{messages.length} shown</span>
              </div>
            </div>

            {/* Chat message list with min-h-0 so flex-1 scrolls internally */}
            <div
              ref={chatScrollRef}
              onScroll={handleScroll}
              className="flex-1 min-h-0 p-2.5 overflow-y-auto space-y-1.5 font-mono text-xs select-text scrollbar-thin"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted p-3 space-y-1.5">
                  <div className="w-7 h-7 rounded-full bg-white/[0.05] flex items-center justify-center animate-pulse">
                    <MessageSquare size={13} className="text-muted/60" />
                  </div>
                  <div className="text-xs font-semibold text-ink">Listening for chat...</div>
                  <p className="text-micro text-muted/70 max-w-[200px]">
                    Messages will stream here in real time as viewers type.
                  </p>
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div
                    key={`${m.t}-${m.user}-${idx}`}
                    className="flex items-start gap-1.5 hover:bg-white/[0.04] px-1.5 py-0.5 rounded transition-colors group"
                  >
                    <span className="text-[10px] text-muted/60 shrink-0 font-mono mt-0.5">
                      {formatMsgTime(m)}
                    </span>
                    <div className="break-words min-w-0 flex-1 leading-snug">
                      {/* Red color for all users as requested */}
                      <span className="font-semibold mr-1.5 text-red-500">
                        {m.user}:
                      </span>
                      {/* White text for all chat content as requested */}
                      <span className="text-white text-[11px] select-text">
                        {m.text}
                      </span>
                      {m.emotes > 0 && (
                        <span className="ml-1 px-1 py-0.2 text-[9px] rounded bg-brass/10 text-brass border border-brass/20 inline-block font-mono">
                          +{m.emotes} emote{m.emotes > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat footer / auto-scroll resume notice */}
            {!autoScroll && messages.length > 0 && (
              <div className="p-1.5 border-t border-white/10 bg-brass/10 flex items-center justify-between text-micro font-mono text-brass shrink-0">
                <span>Auto-scroll paused</span>
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="flex items-center gap-1 font-bold underline cursor-pointer hover:text-ink"
                >
                  <ArrowDown size={11} />
                  <span>Latest</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
