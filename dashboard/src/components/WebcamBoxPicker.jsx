import React, { useEffect, useRef, useState } from 'react';
import { Camera, Crosshair, Move, RefreshCw, Sparkles } from 'lucide-react';

export const WEBCAM_MODE_OPTIONS = [
  { id: 'auto', label: 'Auto (Check 4 Corners)' },
  { id: 'top_left', label: 'Top-Left Corner' },
  { id: 'top_right', label: 'Top-Right Corner' },
  { id: 'bottom_left', label: 'Bottom-Left Corner' },
  { id: 'bottom_right', label: 'Bottom-Right Corner' },
  { id: 'custom', label: 'Custom Tracing Box' },
  { id: 'none', label: 'No Webcam (Blur Center)' },
];

const CORNER_PRESETS = {
  top_left: { x: 0.01, y: 0.02, w: 0.28, h: 0.32 },
  top_right: { x: 0.71, y: 0.02, w: 0.28, h: 0.32 },
  bottom_left: { x: 0.01, y: 0.66, w: 0.28, h: 0.32 },
  bottom_right: { x: 0.71, y: 0.66, w: 0.28, h: 0.32 },
};

const DEFAULT_CUSTOM_BOX = CORNER_PRESETS.bottom_right;

function clampBox(b) {
  const x = Math.max(0, Math.min(0.92, Number(b.x) || 0));
  const y = Math.max(0, Math.min(0.92, Number(b.y) || 0));
  const w = Math.max(0.08, Math.min(1 - x, Number(b.w) || 0.28));
  const h = Math.max(0.08, Math.min(1 - y, Number(b.h) || 0.32));
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    w: Number(w.toFixed(4)),
    h: Number(h.toFixed(4)),
  };
}

export default function WebcamBoxPicker({
  mode = 'auto',
  box = null,
  onChange,
  previewSrc = null,
  onRefreshPreview = null,
  disabled = false,
  compact = false,
}) {
  const canvasRef = useRef(null);
  const [draftBox, setDraftBox] = useState(() => clampBox(box || DEFAULT_CUSTOM_BOX));
  const [dragState, setDragState] = useState(null); // { kind: 'draw'|'move'|'resize', startX, startY, origBox }
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (box && !dragState) {
      setDraftBox(clampBox(box));
    }
  }, [box, dragState]);

  useEffect(() => {
    setImgError(false);
  }, [previewSrc]);

  const emit = (nextMode, nextBox) => {
    if (onChange) {
      onChange({
        webcam_mode: nextMode,
        webcam_box: nextBox ? clampBox(nextBox) : null,
      });
    }
  };

  const handleModeSelect = (nextMode) => {
    if (nextMode === 'custom') {
      const initial = clampBox(
        box || CORNER_PRESETS[mode] || DEFAULT_CUSTOM_BOX,
      );
      setDraftBox(initial);
      emit('custom', initial);
    } else {
      emit(nextMode, box);
    }
  };

  const handleCornerSnap = (cornerKey) => {
    const snapped = clampBox(CORNER_PRESETS[cornerKey]);
    setDraftBox(snapped);
    emit('custom', snapped);
  };

  const getRelCoords = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { rx: 0, ry: 0 };
    return {
      rx: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      ry: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e, kind = 'draw') => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { rx, ry } = getRelCoords(e);
    setDragState({
      kind,
      startX: rx,
      startY: ry,
      origBox: { ...draftBox },
    });
  };

  const handlePointerMove = (e) => {
    if (!dragState) return;
    const { rx, ry } = getRelCoords(e);
    if (dragState.kind === 'draw') {
      const x1 = Math.min(dragState.startX, rx);
      const y1 = Math.min(dragState.startY, ry);
      const w = Math.max(0.08, Math.abs(rx - dragState.startX));
      const h = Math.max(0.08, Math.abs(ry - dragState.startY));
      setDraftBox(clampBox({ x: x1, y: y1, w, h }));
    } else if (dragState.kind === 'move') {
      const dx = rx - dragState.startX;
      const dy = ry - dragState.startY;
      const nx = Math.max(0, Math.min(1 - dragState.origBox.w, dragState.origBox.x + dx));
      const ny = Math.max(0, Math.min(1 - dragState.origBox.h, dragState.origBox.y + dy));
      setDraftBox(clampBox({ ...dragState.origBox, x: nx, y: ny }));
    } else if (dragState.kind === 'resize') {
      const nw = Math.max(0.08, Math.min(1 - dragState.origBox.x, rx - dragState.origBox.x));
      const nh = Math.max(0.08, Math.min(1 - dragState.origBox.y, ry - dragState.origBox.y));
      setDraftBox(clampBox({ ...dragState.origBox, w: nw, h: nh }));
    }
  };

  const handlePointerUp = () => {
    if (!dragState) return;
    const finalBox = clampBox(draftBox);
    setDragState(null);
    emit('custom', finalBox);
  };

  const showCanvas = mode === 'custom';
  const activeCornerPreview = CORNER_PRESETS[mode] || null;

  return (
    <div className={`space-y-2.5 ${compact ? '' : 'p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]'}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-medium text-white/75 flex items-center gap-1.5">
          <Camera size={12} className="text-[#ff66b2]" />
          <span>Streamer Webcam Box</span>
        </label>
        {mode !== 'custom' && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleModeSelect('custom')}
            className="text-[11px] font-medium text-[#ff66b2] hover:text-pink-300 transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1"
          >
            <Crosshair size={11} />
            <span>Draw Tracing Box</span>
          </button>
        )}
      </div>

      <select
        value={mode}
        disabled={disabled}
        onChange={(e) => handleModeSelect(e.target.value)}
        className="w-full h-9 px-3 text-xs rounded-xl border border-white/[0.1] bg-[#161720] text-white focus:border-[#e31084] focus:outline-none cursor-pointer disabled:opacity-50"
      >
        {WEBCAM_MODE_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>

      <p className="text-[10.5px] text-white/50 leading-snug">
        {mode === 'auto' && 'Checks only the 4 outer corners — ignores center game characters.'}
        {mode === 'custom' && '100% locked to your tracing box below (skips YOLO completely).'}
        {mode === 'none' && 'Skips webcam split and uses clean centered blurred framing.'}
        {activeCornerPreview && `Locks strictly to the ${mode.replace('_', '-')} corner — center gameplay is ignored.`}
      </p>

      {showCanvas && (
        <div className="space-y-2 pt-1 animate-fade">
          {/* Interactive 16:9 Stream Tracing Canvas */}
          <div
            ref={canvasRef}
            onPointerDown={(e) => handlePointerDown(e, 'draw')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#0c0d14] border border-white/15 select-none touch-none cursor-crosshair shadow-inner"
          >
            {previewSrc && !imgError ? (
              <img
                src={previewSrc}
                alt="Stream frame preview"
                draggable={false}
                onError={() => setImgError(true)}
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/35 text-[11px] font-mono pointer-events-none gap-1">
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)',
                    backgroundSize: '25% 25%',
                  }}
                />
                <Sparkles size={16} className="text-[#ff66b2]/60" />
                <span>16:9 Stream Canvas · Drag to draw webcam box</span>
              </div>
            )}

            {/* Dim overlay outside the tracing box via box-shadow */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'move')}
              style={{
                left: `${draftBox.x * 100}%`,
                top: `${draftBox.y * 100}%`,
                width: `${draftBox.w * 100}%`,
                height: `${draftBox.h * 100}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
              }}
              className="absolute border-2 border-[#e31084] bg-[#e31084]/15 rounded-md cursor-move transition-colors"
            >
              {/* Top label */}
              <div className="absolute -top-5 left-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#e31084] text-white text-[9.5px] font-mono font-semibold whitespace-nowrap shadow-sm pointer-events-none">
                <Move size={9} />
                <span>WEBCAM</span>
              </div>

              {/* Bottom-right resize handle */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'resize')}
                title="Drag to resize"
                className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#e31084] shadow cursor-nwse-resize"
              />
            </div>
          </div>

          {/* Quick corner snaps + Refresh snapshot + coords readout */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono">
            <div className="flex items-center gap-1">
              {[
                ['top_left', 'TL'],
                ['top_right', 'TR'],
                ['bottom_left', 'BL'],
                ['bottom_right', 'BR'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleCornerSnap(key)}
                  className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
                  title={`Snap box to ${key.replace('_', ' ')}`}
                >
                  {label}
                </button>
              ))}
              {onRefreshPreview && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onRefreshPreview}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
                  title="Grab fresh frame from live stream"
                >
                  <RefreshCw size={10} />
                  <span>Live Frame</span>
                </button>
              )}
            </div>
            <span className="text-white/45 tabular-nums">
              {Math.round(draftBox.x * 100)}%,{Math.round(draftBox.y * 100)}% · {Math.round(draftBox.w * 100)}×{Math.round(draftBox.h * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
