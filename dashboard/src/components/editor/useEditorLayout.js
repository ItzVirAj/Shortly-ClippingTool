import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'editor.custom_layout_v1';

export const LAYOUT_PRESETS = {
  default: {
    name: 'Default',
    slots: { top: ['media', 'player', 'properties'], bottom: ['timeline'] },
    widths: [24, 52, 24],
    topHeight: 54,
  },
  widePlayer: {
    name: 'Wide Player',
    slots: { top: ['media', 'player', 'properties'], bottom: ['timeline'] },
    widths: [18, 64, 18],
    topHeight: 58,
  },
  leftPlayer: {
    name: 'Left Player',
    slots: { top: ['player', 'media', 'properties'], bottom: ['timeline'] },
    widths: [52, 24, 24],
    topHeight: 54,
  },
  bigTimeline: {
    name: 'Big Timeline',
    slots: { top: ['media', 'player', 'properties'], bottom: ['timeline'] },
    widths: [24, 52, 24],
    topHeight: 38,
  },
};

export function useEditorLayout() {
  const [layout, setLayout] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.slots?.top && parsed.widths && parsed.topHeight) {
          return parsed;
        }
      }
    } catch (_) {}
    return {
      slots: { ...LAYOUT_PRESETS.default.slots },
      widths: [...LAYOUT_PRESETS.default.widths],
      topHeight: LAYOUT_PRESETS.default.topHeight,
    };
  });

  const [draggingTile, setDraggingTile] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [isResizing, setIsResizing] = useState(false);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch (_) {}
  }, [layout]);

  // Swap any two tiles (top or bottom)
  const swapTiles = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setLayout((prev) => {
      const nextSlots = {
        top: [...prev.slots.top],
        bottom: [...prev.slots.bottom],
      };

      const findPos = (id) => {
        const tIdx = nextSlots.top.indexOf(id);
        if (tIdx !== -1) return { section: 'top', index: tIdx };
        const bIdx = nextSlots.bottom.indexOf(id);
        if (bIdx !== -1) return { section: 'bottom', index: bIdx };
        return null;
      };

      const sPos = findPos(sourceId);
      const tPos = findPos(targetId);
      if (!sPos || !tPos) return prev;

      nextSlots[sPos.section][sPos.index] = targetId;
      nextSlots[tPos.section][tPos.index] = sourceId;

      return { ...prev, slots: nextSlots };
    });
  }, []);

  // HTML5 Drag & Drop handlers
  const handleDragStart = useCallback((e, tileId) => {
    e.dataTransfer.setData('application/x-editor-tile', tileId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTile(tileId);
  }, []);

  const handleDragOver = useCallback((e, tileId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(tileId);
  }, []);

  const handleDragLeave = useCallback((e, tileId) => {
    setDropTarget((curr) => (curr === tileId ? null : curr));
  }, []);

  const handleDrop = useCallback((e, targetTileId) => {
    e.preventDefault();
    const sourceTileId = e.dataTransfer.getData('application/x-editor-tile') || draggingTile;
    if (sourceTileId && targetTileId && sourceTileId !== targetTileId) {
      swapTiles(sourceTileId, targetTileId);
    }
    setDraggingTile(null);
    setDropTarget(null);
  }, [draggingTile, swapTiles]);

  const handleDragEnd = useCallback(() => {
    setDraggingTile(null);
    setDropTarget(null);
  }, []);

  // Column resizing between top row items
  const startColResize = useCallback((e, dividerIndex, containerRef) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const containerWidth = containerRef.current?.clientWidth || 1000;
    const initialWidths = [...layout.widths];

    const onMove = (moveEvt) => {
      const deltaPx = moveEvt.clientX - startX;
      const deltaPct = (deltaPx / containerWidth) * 100;

      const minPct = 14;
      let leftW = initialWidths[dividerIndex] + deltaPct;
      let rightW = initialWidths[dividerIndex + 1] - deltaPct;

      if (leftW < minPct) {
        rightW -= (minPct - leftW);
        leftW = minPct;
      }
      if (rightW < minPct) {
        leftW -= (minPct - rightW);
        rightW = minPct;
      }

      if (leftW >= minPct && rightW >= minPct) {
        const next = [...initialWidths];
        next[dividerIndex] = Math.round(leftW * 10) / 10;
        next[dividerIndex + 1] = Math.round(rightW * 10) / 10;
        setLayout((prev) => ({ ...prev, widths: next }));
      }
    };

    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [layout.widths]);

  // Row resizing between top section and bottom section
  const startRowResize = useCallback((e, containerRef) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const containerHeight = containerRef.current?.clientHeight || 800;
    const initialTopHeight = layout.topHeight;

    const onMove = (moveEvt) => {
      const deltaPx = moveEvt.clientY - startY;
      const deltaPct = (deltaPx / containerHeight) * 100;
      const nextTop = Math.min(78, Math.max(25, Math.round((initialTopHeight + deltaPct) * 10) / 10));
      setLayout((prev) => ({ ...prev, topHeight: nextTop }));
    };

    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [layout.topHeight]);

  const applyPreset = useCallback((key) => {
    const preset = LAYOUT_PRESETS[key];
    if (preset) {
      setLayout({
        slots: { top: [...preset.slots.top], bottom: [...preset.slots.bottom] },
        widths: [...preset.widths],
        topHeight: preset.topHeight,
      });
    }
  }, []);

  const resetLayout = useCallback(() => {
    applyPreset('default');
  }, [applyPreset]);

  return {
    layout,
    isResizing,
    draggingTile,
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    startColResize,
    startRowResize,
    applyPreset,
    resetLayout,
  };
}

