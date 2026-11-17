import React, { useState, useEffect, useRef } from 'react';
import shortlyLogo from '../assets/ShortlyLogo.png';
import shortlyLogoExpanded from '../assets/ShortlyLogoExpanded.png';
import {
  LayoutDashboard,
  Sparkles,
  Film,
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Globe,
  Lock,
  X,
  Radio,
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  onSelectTab,
  tabLocked = () => false,
  billingEnabled = false,
  isSignedIn = false,
  onUploadClick,
  isMobile = false,
  onClose,
}) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (isMobile) return false;
    try {
      const saved = localStorage.getItem('os_sidebar_collapsed');
      return saved !== null ? saved === '1' : false;
    } catch {
      return false;
    }
  });

  const [openGroups, setOpenGroups] = useState({
    'ai-studio': true,
    library: true,
  });

  const [hoveredFlyout, setHoveredFlyout] = useState(null);
  const flyoutTimerRef = useRef(null);

  // Auto-expand group if current active tab belongs to it
  useEffect(() => {
    if (['saasshorts', 'ai-agent', 'autopilot', 'thumbnails', 'thumbnail-maker'].includes(activeTab)) {
      setOpenGroups((prev) => ({ ...prev, 'ai-studio': true }));
    } else if (['ugc-gallery', 'history', 'publishing'].includes(activeTab)) {
      setOpenGroups((prev) => ({ ...prev, library: true }));
    }
  }, [activeTab]);

  const toggleCollapse = () => {
    if (isMobile) return;
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('os_sidebar_collapsed', next ? '1' : '0');
      } catch { }
      return next;
    });
  };

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleFlyoutEnter = (id) => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
    setHoveredFlyout(id);
  };

  const handleFlyoutLeave = () => {
    flyoutTimerRef.current = setTimeout(() => {
      setHoveredFlyout(null);
    }, 160);
  };

  const navGroups = [
    {
      type: 'single',
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      type: 'single',
      id: 'liveclipper',
      label: 'Live Clipper',
      icon: Radio,
      badge: { text: 'LIVE', color: 'orange' },
    },
    {
      type: 'group',
      id: 'ai-studio',
      label: 'AI Studio',
      icon: Sparkles,
      badge: { text: '5', color: 'orange' },
      items: [
        { id: 'saasshorts', label: 'AI Shorts', badge: 'BYOK' },
        { id: 'ai-agent', label: 'AI Agent', badge: 'BYOK' },
        { id: 'autopilot', label: 'Autopilot', badge: 'NEW', badgeColor: 'mint' },
        { id: 'thumbnails', label: 'YouTube Studio' },
        { id: 'thumbnail-maker', label: 'Thumbnail Maker', badge: 'AI' },
      ],
    },
    {
      type: 'single',
      id: 'editor',
      label: 'Video Editor',
      icon: Film,
      badge: { text: '8', color: 'mint' },
    },
    {
      type: 'group',
      id: 'library',
      label: 'Library',
      icon: FolderOpen,
      badge: null,
      items: [
        { id: 'ugc-gallery', label: 'UGC Gallery' },
        { id: 'history', label: 'History' },
        ...(!billingEnabled ? [{ id: 'publishing', label: 'Publishing' }] : []),
      ],
    },
    {
      type: 'single',
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      badge: null,
    },
  ];

  const collapsed = isMobile ? false : isCollapsed;

  return (
    <aside
      className={`app-sidebar relative flex flex-col h-full shrink-0 select-none bg-black/40 backdrop-blur-2xl backdrop-saturate-[180%] border-r border-white/[0.08] shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.03),4px_0_24px_rgba(0,0,0,0.35)] transition-all duration-300 ease-out z-30 font-sans ${
        collapsed ? 'w-[72px]' : 'w-64'
      } ${isMobile ? 'w-full' : ''}`}
      style={{
        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      {/* 1. Header & Brand Logo Area */}
      <div
        className={`pt-3.5 pb-2 shrink-0 transition-all duration-200 ${
          collapsed
            ? 'px-2 flex flex-col items-center gap-2'
            : 'px-4 flex items-center justify-between'
        }`}
      >
        {collapsed ? (
          <>
            {/* Logo without box/bg container */}
            <button
              type="button"
              onClick={() => onSelectTab('dashboard')}
              className="w-11 h-11 flex items-center justify-center shrink-0 active:scale-95 transition-transform duration-150 cursor-pointer group p-0 bg-transparent border-0"
              title="Shortly Dashboard"
            >
              <img
                src={shortlyLogo}
                alt="Shortly"
                className="w-full h-full object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)] transition-transform duration-200 group-hover:scale-105"
              />
            </button>
            <button
              type="button"
              onClick={toggleCollapse}
              title="Expand sidebar"
              className="w-6 h-6 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.1] text-white/70 hover:text-white flex items-center justify-center transition-all duration-150 active:scale-90 shadow-sm cursor-pointer mt-0.5"
            >
              <ChevronRight size={12} strokeWidth={2.2} />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center min-w-0">
              <button
                type="button"
                onClick={() => onSelectTab('dashboard')}
                className="flex items-center shrink-0 hover:opacity-90 active:scale-[0.98] transition-all duration-150 cursor-pointer p-0 select-none group bg-transparent border-0"
                title="Shortly Dashboard"
              >
                <img
                  src={shortlyLogoExpanded}
                  alt="Shortly"
                  className="h-[54px] sm:h-[62px] w-auto max-w-[210px] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
                />
              </button>
            </div>

            {/* In expanded mode on desktop, glass collapse trigger */}
            {!isMobile && (
              <button
                type="button"
                onClick={toggleCollapse}
                title="Collapse sidebar"
                className="w-7 h-7 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.1] text-white/70 hover:text-white flex items-center justify-center transition-all duration-150 active:scale-90 shadow-sm cursor-pointer shrink-0 ml-1.5"
              >
                <ChevronLeft size={13} strokeWidth={2.2} />
              </button>
            )}

            {/* Mobile Close Button */}
            {isMobile && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.08] active:scale-90 transition-all duration-150 cursor-pointer shrink-0 ml-1.5"
              >
                <X size={18} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Subtle Specular Separator */}
      <div className="mx-3 h-[1px] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent shrink-0 mb-1" />

      {/* 2. Navigation Items List */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-1.5 space-y-1 custom-scrollbar">
        {navGroups.map((group) => {
          const GroupIcon = group.icon;

          // Single Item
          if (group.type === 'single') {
            const isActive = activeTab === group.id;
            const locked = tabLocked(group.id);

            return (
              <div
                key={group.id}
                className="relative"
                onMouseEnter={() => collapsed && handleFlyoutEnter(group.id)}
                onMouseLeave={() => collapsed && handleFlyoutLeave()}
              >
                <button
                  type="button"
                  onClick={() => !locked && onSelectTab(group.id)}
                  disabled={locked}
                  title={collapsed ? group.label : locked ? 'Locked' : undefined}
                  className={`w-full flex items-center rounded-xl transition-all duration-150 active:scale-[0.98] ${
                    collapsed
                      ? 'justify-center h-10 w-10 mx-auto relative'
                      : 'px-3 py-2.5 text-[14.5px] font-medium tracking-[0.01em]'
                  } ${
                    isActive
                      ? 'bg-gradient-to-r from-white/[0.14] via-white/[0.09] to-white/[0.04] text-white border border-white/[0.16] shadow-[0_2px_14px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.18)] font-semibold'
                      : 'text-white hover:text-white hover:bg-white/[0.07] border border-transparent'
                  } ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {/* Leading Active Bar (Expanded) */}
                  {!collapsed && isActive && (
                    <div className="w-1 h-4 rounded-full bg-gradient-to-b from-[#ff3d9a] via-[#e31084] to-[#c0096b] shadow-[0_0_10px_rgba(227,16,132,0.8)] mr-2.5 shrink-0" />
                  )}

                  <GroupIcon
                    size={18}
                    strokeWidth={isActive ? 2.2 : 2.0}
                    className={`shrink-0 transition-transform duration-150 ${
                      isActive
                        ? 'text-[#ff66b2] drop-shadow-[0_0_8px_rgba(227,16,132,0.5)]'
                        : 'text-white'
                    }`}
                  />

                  {/* Active Indicator dot in collapsed mode */}
                  {collapsed && isActive && (
                    <div className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-[#e31084] shadow-[0_0_6px_rgba(227,16,132,0.9)]" />
                  )}

                  {!collapsed && (
                    <>
                      <span className="flex-1 ml-2.5 text-left truncate text-white">{group.label}</span>
                      {locked ? (
                        <Lock size={12} className="text-white/50" />
                      ) : group.badge ? (
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full shadow-xs ${
                            group.badge.color === 'mint'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                              : group.badge.color === 'orange'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                              : 'bg-white/10 text-white border border-white/15'
                          }`}
                        >
                          {group.badge.text}
                        </span>
                      ) : null}
                    </>
                  )}
                </button>

                {/* Collapsed Tooltip Pill (macOS style) */}
                {collapsed && hoveredFlyout === group.id && (
                  <div className="absolute left-[72px] top-1/2 -translate-y-1/2 z-50 bg-[#12131a]/95 backdrop-blur-xl border border-white/[0.14] text-white text-[13px] font-medium px-3 py-1.5 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] whitespace-nowrap pointer-events-none animate-fade">
                    {group.label}
                  </div>
                )}
              </div>
            );
          }

          // Accordion Group
          const isOpen = !!openGroups[group.id];
          const hasActiveChild = group.items.some((sub) => sub.id === activeTab);

          return (
            <div
              key={group.id}
              className="relative"
              onMouseEnter={() => collapsed && handleFlyoutEnter(group.id)}
              onMouseLeave={() => collapsed && handleFlyoutLeave()}
            >
              {/* Group Header Button */}
              <button
                type="button"
                onClick={() => {
                  if (collapsed) {
                    if (group.items[0]) onSelectTab(group.items[0].id);
                  } else {
                    toggleGroup(group.id);
                  }
                }}
                className={`w-full flex items-center rounded-xl transition-all duration-150 active:scale-[0.98] ${
                  collapsed
                    ? 'justify-center h-10 w-10 mx-auto relative'
                    : 'px-3 py-2.5 text-[14.5px] font-medium tracking-[0.01em]'
                } ${
                  hasActiveChild && collapsed
                    ? 'bg-gradient-to-r from-white/[0.14] to-white/[0.04] text-white border border-white/[0.16] shadow-[0_2px_12px_rgba(0,0,0,0.25)] font-semibold'
                    : hasActiveChild && !isOpen
                    ? 'bg-white/[0.08] text-white border border-white/[0.12] font-semibold'
                    : 'text-white hover:text-white hover:bg-white/[0.07] border border-transparent'
                } cursor-pointer`}
              >
                {/* Collapsed active child marker */}
                {collapsed && hasActiveChild && (
                  <div className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-[#e31084] shadow-[0_0_6px_rgba(227,16,132,0.9)]" />
                )}

                <GroupIcon
                  size={18}
                  strokeWidth={hasActiveChild ? 2.2 : 2.0}
                  className={`shrink-0 transition-transform duration-150 ${
                    hasActiveChild
                      ? 'text-[#ff66b2] drop-shadow-[0_0_8px_rgba(227,16,132,0.5)]'
                      : 'text-white'
                  }`}
                />

                {!collapsed && (
                  <>
                    <span className="flex-1 ml-2.5 text-left truncate text-white">{group.label}</span>
                    {group.badge && (
                      <div className="flex items-center gap-1 mr-1">
                        <span className="text-[10px] text-white/50 font-bold">+</span>
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                            group.badge.color === 'orange'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                          }`}
                        >
                          {group.badge.text}
                        </span>
                      </div>
                    )}
                    <span className="text-white hover:text-white transition-colors">
                      {isOpen ? (
                        <ChevronUp size={14} strokeWidth={2.2} />
                      ) : (
                        <ChevronDown size={14} strokeWidth={2.2} />
                      )}
                    </span>
                  </>
                )}
              </button>

              {/* Expanded Tree Items with Apple Glass Guide Connectors */}
              {!collapsed && isOpen && (
                <div className="relative ml-5 pl-3 my-1 space-y-0.5">
                  {/* Vertical Guide Line */}
                  <div className="absolute left-0 top-1 bottom-3 w-[1.5px] bg-gradient-to-b from-white/20 via-white/10 to-transparent rounded-full" />

                  {group.items.map((sub) => {
                    const isSubActive = activeTab === sub.id;
                    const subLocked = tabLocked(sub.id);

                    return (
                      <div key={sub.id} className="relative flex items-center">
                        {/* Horizontal Tree Branch Connector */}
                        <div
                          className={`absolute -left-3 top-1/2 -translate-y-1/2 w-2.5 h-[1.5px] rounded-full transition-colors duration-150 ${
                            isSubActive ? 'bg-[#e31084]' : 'bg-white/20'
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() => !subLocked && onSelectTab(sub.id)}
                          disabled={subLocked}
                          className={`w-full flex items-center justify-between py-2 px-2.5 rounded-lg text-[13.5px] tracking-[0.01em] transition-all duration-150 active:scale-[0.98] ${
                            isSubActive
                              ? 'bg-white/[0.1] text-white font-semibold border border-white/[0.14] shadow-[0_1px_8px_rgba(0,0,0,0.2)]'
                              : 'text-white hover:text-white hover:bg-white/[0.06] border border-transparent font-normal'
                          } ${subLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <span className="truncate text-white">{sub.label}</span>
                          <div className="flex items-center gap-1.5">
                            {sub.badge && (
                              <span
                                className={`text-[9.5px] font-mono font-semibold px-1.5 py-0.5 rounded-full ${
                                  sub.badgeColor === 'mint'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                                    : 'bg-[#e31084]/20 text-[#f472b6] border border-[#e31084]/35'
                                }`}
                              >
                                {sub.badge}
                              </span>
                            )}
                            {isSubActive && (
                              <ChevronRight size={13} strokeWidth={2.2} className="text-[#ff66b2] shrink-0" />
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Collapsed Popout Flyout (macOS Liquid Glass Panel) */}
              {collapsed && hoveredFlyout === group.id && (
                <div
                  className="absolute left-[72px] top-0 z-50 flex flex-col gap-1 w-52 bg-[#0e1017]/95 backdrop-blur-2xl border border-white/[0.14] rounded-2xl p-2.5 shadow-[0_20px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] animate-fade"
                  onMouseEnter={() => handleFlyoutEnter(group.id)}
                  onMouseLeave={() => handleFlyoutLeave()}
                >
                  <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-white/[0.08] mb-1">
                    <span className="text-[13.5px] font-semibold text-white tracking-[0.01em]">
                      {group.label}
                    </span>
                    {group.badge && (
                      <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {group.badge.text}
                      </span>
                    )}
                  </div>
                  <div className="relative ml-2.5 pl-2.5 space-y-0.5">
                    {/* Vertical Connector in Flyout */}
                    <div className="absolute left-0 top-1 bottom-2 w-[1.5px] bg-white/20 rounded-full" />
                    {group.items.map((sub) => {
                      const isSubActive = activeTab === sub.id;
                      return (
                        <div key={sub.id} className="relative flex items-center">
                          <div
                            className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-2 h-[1.5px] rounded-full ${
                              isSubActive ? 'bg-[#e31084]' : 'bg-white/20'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              onSelectTab(sub.id);
                              setHoveredFlyout(null);
                            }}
                            className={`w-full flex items-center justify-between py-2 px-2.5 rounded-lg text-[13px] font-medium tracking-[0.01em] transition-all duration-150 ${
                              isSubActive
                                ? 'bg-white/[0.12] text-white font-semibold border border-white/[0.14]'
                                : 'text-white hover:text-white hover:bg-white/[0.07]'
                            }`}
                          >
                            <span className="truncate text-white">{sub.label}</span>
                            {isSubActive && <ChevronRight size={13} strokeWidth={2.2} className="text-[#ff66b2]" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 3. Frosted Glass Upload Action Card */}
      {!collapsed ? (
        <div className="mx-3 my-2 p-3.5 rounded-2xl border border-dashed border-white/[0.14] hover:border-[#e31084]/40 bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-md text-center flex flex-col items-center shrink-0 transition-all duration-200 group">
          <button
            type="button"
            onClick={onUploadClick}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#e31084] via-[#f03b9f] to-[#ff60ad] text-white flex items-center justify-center shadow-[0_4px_16px_rgba(227,16,132,0.45)] group-hover:shadow-[0_6px_22px_rgba(227,16,132,0.65)] group-hover:scale-105 active:scale-90 transition-all duration-200 cursor-pointer mb-2"
            title="Upload new video"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
          <span className="text-[13.5px] font-semibold text-white tracking-[0.01em]">
            Upload new video
          </span>
          <span className="text-[11.5px] text-white/70 font-normal tracking-[0.01em] mt-0.5">
            Drag & drop or browse
          </span>
        </div>
      ) : (
        <div className="flex justify-center my-2.5 shrink-0">
          <button
            type="button"
            onClick={onUploadClick}
            title="Upload new video"
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#e31084] to-[#f03b9f] text-white flex items-center justify-center shadow-[0_4px_16px_rgba(227,16,132,0.4)] hover:shadow-[0_6px_20px_rgba(227,16,132,0.6)] hover:scale-105 active:scale-90 transition-all duration-200 cursor-pointer"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* 4. Subtle Footer Links (Landing & GitHub) */}
      {!collapsed && (
        <div className="px-3 pb-3 flex items-center justify-center gap-2 text-white/70 text-[12px] tracking-[0.01em] shrink-0 border-t border-white/[0.08] pt-2.5 select-none">
          <a
            href="#landing"
            title="Landing Page"
            className="px-2 py-1 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all duration-150 flex items-center gap-1.5 no-underline hover:no-underline border-b-0 hover:border-b-0"
            style={{ textDecoration: 'none', borderBottom: 'none' }}
          >
            <Globe size={12} strokeWidth={2} />
            <span>Landing</span>
          </a>
          <span className="text-white/30">·</span>
          <a
            href="https://github.com/ItzVirAj"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub Open Source"
            className="px-2 py-1 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all duration-150 flex items-center gap-1.5 no-underline hover:no-underline border-b-0 hover:border-b-0"
            style={{ textDecoration: 'none', borderBottom: 'none' }}
          >
            <span>GitHub</span>
          </a>
        </div>
      )}
    </aside>
  );
}
