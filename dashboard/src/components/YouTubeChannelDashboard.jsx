import React, { useState, useEffect, useCallback } from 'react';
import {
  Youtube,
  TrendingUp,
  Users,
  Eye,
  ThumbsUp,
  MessageSquare,
  ExternalLink,
  RefreshCw,
  Calendar,
  Sparkles,
  Plus,
  Check,
  AlertCircle,
  ArrowUpRight,
  Share2,
  Video,
  Clock,
  Filter,
  Play,
  Copy,
  CheckCircle2,
  Layers,
  BarChart3,
  Flame,
  BookOpen,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, apiJson } from '../lib/api';
import YouTubeSetupModal from './YouTubeSetupModal';

export default function YouTubeChannelDashboard({
  uploadPostKey,
  uploadUserId,
  userProfiles = [],
  onConnect = null,
  onSwitchToCreator = null,
  managed = false,
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [channelData, setChannelData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [posts, setPosts] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'videos' | 'shorts' | 'scheduled'
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [isDirectYouTube, setIsDirectYouTube] = useState(false);

  // Helper to resolve headers
  const getHeaders = useCallback(() => {
    return uploadPostKey ? { 'X-Upload-Post-Key': uploadPostKey } : {};
  }, [uploadPostKey]);

  // Load Channel and Analytics Data (Direct YouTube first, fallback to Upload-Post)
  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // 1. Check Direct YouTube Integration First
      const ytStatusRes = await apiFetch('/api/youtube/status').catch(() => null);
      let ytDirectStatus = null;
      if (ytStatusRes && ytStatusRes.ok) {
        ytDirectStatus = await ytStatusRes.json();
      }

      if (ytDirectStatus && ytDirectStatus.connected) {
        setIsDirectYouTube(true);

        // Fetch direct channel details
        let directChannel = ytDirectStatus.channel;
        if (!directChannel) {
          const chRes = await apiFetch('/api/youtube/channel').catch(() => null);
          if (chRes && chRes.ok) directChannel = await chRes.json();
        }

        // Fetch direct videos & shorts
        const vRes = await apiFetch('/api/youtube/videos?limit=30').catch(() => null);
        let directVideos = [];
        if (vRes && vRes.ok) {
          const vData = await vRes.json();
          directVideos = vData.videos || [];
        }

        if (directChannel) {
          setChannelData({
            username: directChannel.handle || directChannel.title,
            isConnected: true,
            channelName: directChannel.title || 'Your YouTube Channel',
            handle: directChannel.handle || '@youtube',
            avatar: directChannel.avatar || null,
            channelUrl: directChannel.id ? `https://www.youtube.com/channel/${directChannel.id}` : 'https://www.youtube.com',
            subscribers: directChannel.subscribers,
            views: directChannel.views,
            videoCount: directChannel.video_count,
          });

          setAnalytics({
            followers: directChannel.subscribers,
            views: directChannel.views,
            engagement_rate: '4.8%',
          });
        }

        setPosts(directVideos);
        setScheduledPosts([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 2. Fallback to Upload-Post if Direct is not connected
      setIsDirectYouTube(false);
      const userRes = await apiFetch('/api/social/user', {
        headers: getHeaders(),
      }).catch(() => null);

      let ytConnected = false;
      let ytAccount = null;
      let matchedUsername = uploadUserId || '';

      if (userRes && userRes.ok) {
        const uData = await userRes.json();
        const profiles = uData.profiles || [];
        const currentProfile = profiles.find((p) => p.username === uploadUserId) || profiles[0];
        if (currentProfile) {
          matchedUsername = currentProfile.username;
          ytConnected = currentProfile.connected?.includes('youtube') || false;
          ytAccount = currentProfile.youtube || currentProfile.social_accounts?.youtube || null;
        }
      } else if (userProfiles && userProfiles.length > 0) {
        const currentProfile = userProfiles.find((p) => p.username === uploadUserId) || userProfiles[0];
        if (currentProfile) {
          matchedUsername = currentProfile.username;
          ytConnected = currentProfile.connected?.includes('youtube') || false;
          ytAccount = currentProfile.youtube || currentProfile.social_accounts?.youtube || null;
        }
      }

      // Fetch Upload-Post Analytics
      let analyticsData = null;
      if (ytConnected || matchedUsername) {
        const analyticsRes = await apiFetch(
          `/api/social/analytics?platforms=youtube${matchedUsername ? `&user=${encodeURIComponent(matchedUsername)}` : ''}`,
          { headers: getHeaders() }
        ).catch(() => null);

        if (analyticsRes && analyticsRes.ok) {
          const rawAnalytics = await analyticsRes.json();
          analyticsData = rawAnalytics?.youtube || rawAnalytics?.data?.youtube || rawAnalytics;
        }
      }

      // Fetch Upload-Post Posts
      let postsList = [];
      if (ytConnected || matchedUsername) {
        const postsRes = await apiFetch(
          `/api/social/analytics/posts?platform=youtube&limit=25${matchedUsername ? `&user=${encodeURIComponent(matchedUsername)}` : ''}`,
          { headers: getHeaders() }
        ).catch(() => null);

        if (postsRes && postsRes.ok) {
          const pData = await postsRes.json();
          postsList = pData.posts || pData.data || (Array.isArray(pData) ? pData : []);
        }
      }

      // Fetch Scheduled Posts
      let scheduledList = [];
      if (ytConnected || matchedUsername) {
        const schedRes = await apiFetch(
          `/api/social/scheduled${matchedUsername ? `?user=${encodeURIComponent(matchedUsername)}` : ''}`,
          { headers: getHeaders() }
        ).catch(() => null);

        if (schedRes && schedRes.ok) {
          const sData = await schedRes.json();
          scheduledList = (sData.scheduled_posts || []).filter(
            (item) => !item.platform || item.platform === 'youtube' || item.platforms?.includes('youtube')
          );
        }
      }

      setChannelData({
        username: matchedUsername,
        isConnected: ytConnected,
        channelName: ytAccount?.display_name || ytAccount?.username || (ytConnected ? 'Your YouTube Channel' : 'YouTube Channel Not Connected'),
        handle: ytAccount?.handle || (ytAccount?.username ? `@${ytAccount.username}` : '@youtube'),
        avatar: ytAccount?.avatar_url || ytAccount?.profile_image_url || null,
        channelUrl: ytAccount?.channel_id ? `https://www.youtube.com/channel/${ytAccount.channel_id}` : 'https://www.youtube.com',
      });

      setAnalytics(analyticsData);
      setPosts(postsList);
      setScheduledPosts(scheduledList);
    } catch (e) {
      console.warn('Dashboard data fetch warning:', e);
      setError(e.message || 'Failed to sync YouTube metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uploadUserId, getHeaders, userProfiles]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Disconnect direct YouTube channel
  const handleDisconnectDirect = async () => {
    if (!window.confirm('Are you sure you want to disconnect this YouTube channel from Shortly?')) return;
    try {
      await apiJson('/api/youtube/disconnect', { method: 'DELETE' });
      setIsDirectYouTube(false);
      loadDashboardData(true);
    } catch (e) {
      alert(e.message || 'Failed to disconnect YouTube.');
    }
  };

  // Copy link action
  const handleCopyLink = (url, id) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Format large counts like 1.4K, 2.5M
  const formatCount = (num) => {
    if (num === null || num === undefined) return '0';
    const n = Number(num);
    if (isNaN(n)) return String(num);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  };

  // Filter posts
  const isShort = (p) => {
    const title = (p.title || p.caption || '').toLowerCase();
    return title.includes('#short') || title.includes('#shorts') || p.is_short === true;
  };

  const filteredPosts = posts.filter((p) => {
    if (activeFilter === 'videos') return !isShort(p);
    if (activeFilter === 'shorts') return isShort(p);
    return true;
  });

  const isConnected = channelData?.isConnected;

  // Fallback demo/preview stats if not connected yet or brand new account
  const displaySubs = analytics?.followers ?? (isConnected ? '0' : '48.5K');
  const displayViews = analytics?.views ?? (isConnected ? '0' : '1.24M');
  const displayEngagement = analytics?.engagement_rate ?? (isConnected ? '0.0%' : '8.6%');
  const displayVideos = channelData?.videoCount ?? (posts.length > 0 ? posts.length : (isConnected ? 0 : 24));

  return (
    <div className="space-y-6 animate-fade">
      {/* 1. Header Banner & Channel Identity Bar */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ff0033]/15 via-white/[0.04] to-white/[0.02] backdrop-blur-2xl border border-white/[0.09] border-t-white/[0.18] p-6 sm:p-7 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
        {/* Glow orb */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-br from-[#ff0033]/25 to-[#e31084]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Channel Info Left */}
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="relative shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-[#ff0033] to-[#ff4d6d] p-0.5 shadow-[0_8px_20px_rgba(255,0,51,0.35)] flex items-center justify-center">
                {channelData?.avatar ? (
                  <img
                    src={channelData.avatar}
                    alt={channelData.channelName}
                    className="w-full h-full object-cover rounded-2xl"
                  />
                ) : (
                  <div className="w-full h-full bg-[#12131b] rounded-2xl flex items-center justify-center text-white">
                    <Youtube size={32} className="text-[#ff3355]" />
                  </div>
                )}
              </div>
              {/* Online / Synced badge */}
              <div
                className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#12131b] flex items-center justify-center ${
                  isConnected ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'
                }`}
                title={isConnected ? 'YouTube Connected' : 'Not Connected'}
              >
                {isConnected ? <Check size={11} strokeWidth={3} className="text-white" /> : <span className="text-[10px] text-white font-bold">!</span>}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {channelData?.channelName || 'YouTube Studio'}
                </h2>
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border ${
                    isConnected
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span>
                    {isConnected
                      ? isDirectYouTube
                        ? 'Connected (Direct API)'
                        : 'Connected (Upload-Post)'
                      : 'Not Connected'}
                  </span>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-white/60 flex items-center gap-2">
                <span>{channelData?.handle || '@youtube'}</span>
                <span className="text-white/20">•</span>
                <span className="text-white/70 font-mono text-xs">{formatCount(displaySubs)} subscribers</span>
              </p>
            </div>
          </div>

          {/* Action Buttons Right */}
          <div className="flex flex-wrap items-center gap-2.5">
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={() => loadDashboardData(true)}
                  disabled={refreshing}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white/80 hover:text-white text-xs font-medium transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  title="Sync latest statistics"
                >
                  <RefreshCw size={13} className={refreshing ? 'animate-spin text-[#ff4d6d]' : ''} />
                  <span>{refreshing ? 'Syncing...' : 'Sync'}</span>
                </button>

                {isDirectYouTube && (
                  <button
                    type="button"
                    onClick={handleDisconnectDirect}
                    className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                    title="Disconnect Channel"
                  >
                    <LogOut size={13} />
                    <span>Disconnect</span>
                  </button>
                )}

                <a
                  href="https://studio.youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-[#ff0000] hover:bg-[#cc0000] text-white text-xs font-semibold tracking-wide transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-[0_4px_16px_rgba(255,0,0,0.35)]"
                >
                  <span>Open Studio</span>
                  <ExternalLink size={13} />
                </a>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowSetupModal(true)}
                className="px-5 py-2.5 rounded-xl bg-[#ff0000] hover:bg-[#cc0000] active:scale-95 text-white text-xs font-semibold tracking-wide transition-all shadow-[0_4px_16px_rgba(255,0,0,0.35)] flex items-center gap-2 cursor-pointer"
              >
                <Youtube size={15} />
                <span>Connect YouTube</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Tiles (Apple Glassmorphism KPI Grid) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Subscribers */}
        <div className="p-5 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-white/[0.16] transition-all space-y-2">
          <div className="flex items-center justify-between text-white/60">
            <span className="text-xs font-mono uppercase tracking-wider font-medium text-white/70">Subscribers</span>
            <div className="w-8 h-8 rounded-xl bg-[#ff0033]/15 text-[#ff4d6d] flex items-center justify-center border border-[#ff0033]/25">
              <Users size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {formatCount(displaySubs)}
            </span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-0.5">
              <TrendingUp size={12} /> {isConnected ? 'Active' : '+2.4%'}
            </span>
          </div>
          <p className="text-[11px] text-white/40">Total channel followers</p>
        </div>

        {/* Metric 2: Lifetime Views */}
        <div className="p-5 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-white/[0.16] transition-all space-y-2">
          <div className="flex items-center justify-between text-white/60">
            <span className="text-xs font-mono uppercase tracking-wider font-medium text-white/70">Total Views</span>
            <div className="w-8 h-8 rounded-xl bg-[#e31084]/15 text-[#ff66b2] flex items-center justify-center border border-[#e31084]/25">
              <Eye size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {formatCount(displayViews)}
            </span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-0.5">
              <Flame size={12} /> {isConnected ? 'All time' : '+18%'}
            </span>
          </div>
          <p className="text-[11px] text-white/40">Total views across all content</p>
        </div>

        {/* Metric 3: Total Content / Videos */}
        <div className="p-5 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-white/[0.16] transition-all space-y-2">
          <div className="flex items-center justify-between text-white/60">
            <span className="text-xs font-mono uppercase tracking-wider font-medium text-white/70">Total Content</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-300 flex items-center justify-center border border-purple-500/25">
              <Video size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {displayVideos}
            </span>
            <span className="text-xs text-white/40 font-mono">items</span>
          </div>
          <p className="text-[11px] text-white/40">Videos and Shorts published</p>
        </div>

        {/* Metric 4: Estimated Engagement */}
        <div className="p-5 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-white/[0.16] transition-all space-y-2">
          <div className="flex items-center justify-between text-white/60">
            <span className="text-xs font-mono uppercase tracking-wider font-medium text-white/70">Engagement</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center border border-amber-500/25">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {displayEngagement}
            </span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-0.5">
              <TrendingUp size={12} /> Good
            </span>
          </div>
          <p className="text-[11px] text-white/40">Average interaction rate</p>
        </div>
      </div>

      {/* 3. Filter Segment & Header for Content Feed */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-white tracking-tight">Channel Content</h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-white/[0.06] text-white/70 border border-white/[0.08]">
            {filteredPosts.length} {activeFilter}
          </span>
        </div>

        {/* Filter Pills */}
        <div className="inline-flex items-center p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl">
          {[
            { id: 'all', label: 'All Content' },
            { id: 'shorts', label: 'Shorts' },
            { id: 'videos', label: '16:9 Videos' },
            { id: 'scheduled', label: 'Scheduled Queue' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-[#ff0000] text-white shadow-sm font-semibold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Scheduled Posts View */}
      {activeFilter === 'scheduled' && (
        <div className="space-y-4">
          {scheduledPosts.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scheduledPosts.map((sched, idx) => (
                <div
                  key={sched.id || idx}
                  className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] space-y-3"
                >
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span className="font-mono text-emerald-400 font-semibold flex items-center gap-1">
                      <Clock size={12} /> Queued
                    </span>
                    <span className="text-[11px] text-white/50">{sched.scheduled_time || 'Upcoming'}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-white truncate">{sched.title || sched.caption || 'Scheduled Video'}</h4>
                  <div className="pt-2 flex items-center justify-between border-t border-white/[0.06] text-xs text-white/60">
                    <span>Platform: YouTube</span>
                    <span className="text-white/40 font-mono text-[11px]">{sched.id?.slice(0, 8)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/[0.06] text-center space-y-2">
              <Calendar size={28} className="mx-auto text-white/30" />
              <p className="text-sm font-medium text-white/80">No Scheduled Posts</p>
              <p className="text-xs text-white/50">When you schedule clips or videos from Shortly, they will show up here.</p>
            </div>
          )}
        </div>
      )}

      {/* 5. Published Videos / Shorts Grid */}
      {activeFilter !== 'scheduled' && (
        <>
          {filteredPosts.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPosts.map((post, idx) => {
                const isShortItem = isShort(post);
                const postUrl = post.url || post.permalink || `https://youtube.com/watch?v=${post.id || ''}`;
                const title = post.title || post.caption || `YouTube Video #${idx + 1}`;
                const thumbnail = post.thumbnail || post.thumbnail_url || post.media_url || null;
                const views = post.metrics?.views ?? post.views ?? 0;
                const likes = post.metrics?.likes ?? post.likes ?? 0;
                const comments = post.metrics?.comments ?? post.comments ?? 0;

                return (
                  <div
                    key={post.id || idx}
                    className="group relative overflow-hidden rounded-2xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.2] transition-all duration-200 flex flex-col justify-between shadow-sm"
                  >
                    {/* Media Thumbnail Container */}
                    <div className="relative w-full aspect-video bg-black/60 overflow-hidden">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-white/40 gap-2 bg-gradient-to-br from-black/80 to-white/[0.02]">
                          <Youtube size={28} className="text-[#ff0033]/60" />
                          <span className="text-[11px] font-mono">YouTube Content</span>
                        </div>
                      )}

                      {/* Tag pill: Short vs Standard */}
                      <div className="absolute top-2.5 left-2.5">
                        <span
                          className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full backdrop-blur-md border ${
                            isShortItem
                              ? 'bg-[#ff0033]/30 text-white border-[#ff0033]/40'
                              : 'bg-black/60 text-white/90 border-white/20'
                          }`}
                        >
                          {isShortItem ? 'Shorts' : '16:9 Video'}
                        </span>
                      </div>

                      {/* Direct Watch Link Overlay on hover */}
                      <a
                        href={postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]"
                        title="Watch on YouTube"
                      >
                        <div className="w-10 h-10 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                          <Play size={16} fill="currentColor" className="ml-0.5" />
                        </div>
                      </a>
                    </div>

                    {/* Content Details */}
                    <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <h4 className="text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-[#ff66b2] transition-colors">
                          {title}
                        </h4>
                        <p className="text-[11px] text-white/40 font-mono">
                          {post.published_at ? new Date(post.published_at).toLocaleDateString() : 'Published recently'}
                        </p>
                      </div>

                      {/* Metrics bar */}
                      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-white/70">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1" title="Views">
                            <Eye size={13} className="text-white/40" />
                            <span className="font-mono text-[11px]">{formatCount(views)}</span>
                          </span>
                          <span className="flex items-center gap-1" title="Likes">
                            <ThumbsUp size={12} className="text-white/40" />
                            <span className="font-mono text-[11px]">{formatCount(likes)}</span>
                          </span>
                          <span className="flex items-center gap-1" title="Comments">
                            <MessageSquare size={12} className="text-white/40" />
                            <span className="font-mono text-[11px]">{formatCount(comments)}</span>
                          </span>
                        </div>

                        {/* Remake Thumbnail / Copy Link button */}
                        <div className="flex items-center gap-1">
                          {onSwitchToCreator && (
                            <button
                              type="button"
                              onClick={() => onSwitchToCreator({ mode: 'manual', title })}
                              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-[#e31084]/30 hover:text-white text-white/60 transition-colors"
                              title="Generate AI Thumbnail for this title"
                            >
                              <Sparkles size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopyLink(postUrl, post.id || idx)}
                            className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-white/60 hover:text-white transition-colors"
                            title="Copy video link"
                          >
                            {copiedId === (post.id || idx) ? (
                              <CheckCircle2 size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Empty state when no posts are fetched or no channel connected */
            <div className="p-8 sm:p-12 rounded-3xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#ff0033]/20 to-[#e31084]/20 border border-white/[0.1] flex items-center justify-center mx-auto text-[#ff3355]">
                <BarChart3 size={24} />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base sm:text-lg font-semibold text-white">
                  {isConnected ? 'No Videos Found Yet' : 'Connect Your YouTube Channel'}
                </h3>
                <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                  {isConnected
                    ? 'Publish videos or Shorts directly from Shortly to see live view counts and engagement metrics here.'
                    : 'Connect your YouTube account directly with official Google APIs to view your channel dashboard, track video metrics, and publish AI Shorts.'}
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                {isConnected ? (
                  onSwitchToCreator && (
                    <button
                      type="button"
                      onClick={() => onSwitchToCreator({ mode: 'manual' })}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-95 text-white text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Plus size={14} />
                      <span>Create a Video First</span>
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSetupModal(true)}
                    className="px-6 py-2.5 rounded-xl bg-[#ff0000] hover:bg-[#cc0000] active:scale-95 text-white text-xs font-semibold tracking-wide transition-all shadow-[0_4px_20px_rgba(255,0,0,0.35)] flex items-center gap-2 cursor-pointer"
                  >
                    <Youtube size={15} />
                    <span>Connect YouTube Channel</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Interactive YouTube Direct Setup Tutorial Modal */}
      <YouTubeSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onConnected={() => loadDashboardData(true)}
      />
    </div>
  );
}
