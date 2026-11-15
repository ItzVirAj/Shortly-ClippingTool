import React, { useState, useRef, useEffect } from 'react';
import { getClipTransform, clamp, hexToRgba } from './editorUtils';
import { FONT_OPTIONS } from './textPresets';
import { getClipAnimation } from './animationUtils';
import ShapeElement from './ShapeElement';

export default function TextOverlay({
  clip, isSelected, isLocked, scale = 1, dispatch, effectiveOpacity = 1, zIndex = 10, isActive = true, playhead = 0,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [livePos, setLivePos] = useState(null);
  const [snapLines, setSnapLines] = useState({ x: false, y: false });
  const textRef = useRef(null);
  const dragRef = useRef(null);

  const tf = getClipTransform(clip);
  const currentX = livePos ? livePos.x : tf.x;
  const currentY = livePos ? livePos.y : tf.y;
  const isShape = clip.type === 'shape';

  const anim = getClipAnimation(clip, playhead);
  const finalX = currentX + anim.tx;
  const finalY = currentY + anim.ty;
  const finalScale = (tf.scale / 100) * anim.scale;
  const finalOpacity = effectiveOpacity * anim.opacity;

  const style = clip.props?.style || {};
  const bg = clip.props?.bg || {};
  const stroke = clip.props?.stroke || {};
  const shadow = clip.props?.shadow || {};
  const fontOpt = FONT_OPTIONS.find((f) => f.value === style.fontFamily);

  useEffect(() => {
    if (isEditing && textRef.current) {
      textRef.current.focus();
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(textRef.current);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    }
  }, [isEditing]);

  const handlePointerDown = (e) => {
    if (isEditing || e.button !== 0) return;
    e.stopPropagation();
    if (!isSelected) dispatch({ type: 'SELECT_CLIP', payload: clip.id });
    if (isLocked) return;

    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = tf.x;
    const origY = tf.y;
    let hasMoved = false;

    const onMove = (mEvt) => {
      const dx = (mEvt.clientX - startX) / (scale || 1);
      const dy = (mEvt.clientY - startY) / (scale || 1);
      if (!hasMoved) {
        if (Math.hypot(dx, dy) <= 3) return;
        hasMoved = true;
      }

      let nx = clamp(origX + dx, -2000, 2000);
      let ny = clamp(origY + dy, -2000, 2000);
      let sx = false;
      let sy = false;

      if (!mEvt.altKey) {
        if (Math.abs(nx) <= 12) { nx = 0; sx = true; }
        if (Math.abs(ny) <= 12) { ny = 0; sy = true; }
      }

      setSnapLines({ x: sx, y: sy });
      setLivePos({ x: nx, y: ny });
      dragRef.current = { x: nx, y: ny, hasMoved: true };
    };

    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      setSnapLines({ x: false, y: false });

      const finalPos = dragRef.current;
      setLivePos(null);
      dragRef.current = null;

      if (finalPos?.hasMoved) {
        dispatch({
          type: 'UPDATE_CLIP',
          payload: { clipId: clip.id, patch: { props: { transform: { x: finalPos.x, y: finalPos.y } } } },
        });
      }
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const commitText = () => {
    setIsEditing(false);
    if (!textRef.current) return;
    const raw = textRef.current.innerText || textRef.current.textContent || '';
    const trimmed = raw.trim().slice(0, 500);
    if (trimmed && trimmed !== clip.props?.text) {
      dispatch({ type: 'UPDATE_CLIP', payload: { clipId: clip.id, patch: { props: { text: trimmed } } } });
    } else {
      textRef.current.innerText = clip.props?.text || 'Your text here';
    }
  };

  const flipH = clip.props?.flipH ? -1 : 1;
  const flipV = clip.props?.flipV ? -1 : 1;
  const transformStr = `translate(-50%, -50%) translate(${finalX}px, ${finalY}px) scale(${finalScale}) rotate(${tf.rotation}deg) scaleX(${flipH}) scaleY(${flipV})`;
  const filterStr = `grayscale(${clip.props?.look?.grayscale || 0}%) sepia(${clip.props?.look?.sepia || 0}%) hue-rotate(${clip.props?.look?.hueRotate || 0}deg) blur(${clip.props?.blur || 0}px) brightness(${clip.props?.brightness ?? 100}%) contrast(${clip.props?.contrast ?? 100}%) saturate(${clip.props?.saturation ?? 100}%)`;

  const bgRgba = bg.enabled ? hexToRgba(bg.color || '#000000', (bg.opacity ?? 100) / 100) : 'transparent';
  const strokeStyle = stroke.enabled && stroke.width ? `${stroke.width}px ${stroke.color || '#000000'}` : 'none';
  const shadowStyle = shadow.enabled ? `${shadow.offsetX || 0}px ${shadow.offsetY || 4}px ${shadow.blur || 8}px ${shadow.color || '#000000'}` : 'none';

  return (
    <>
      {snapLines.x && <div className="absolute top-0 bottom-0 left-[540px] w-0.5 bg-[#e31084] z-50 pointer-events-none shadow-sm" />}
      {snapLines.y && <div className="absolute left-0 right-0 top-[960px] h-0.5 bg-[#e31084] z-50 pointer-events-none shadow-sm" />}

      <div
        onPointerDown={handlePointerDown}
        onDoubleClick={(e) => {
          if (isShape || isLocked) return;
          e.stopPropagation();
          dispatch({ type: 'SET_PLAYING', payload: false });
          setIsEditing(true);
        }}
        style={{
          left: '540px', top: '960px',
          transform: transformStr, transformOrigin: 'center',
          zIndex: isSelected ? 50 : zIndex,
          opacity: isActive ? finalOpacity : 0,
          pointerEvents: isActive ? 'auto' : 'none',
        }}
        className={`absolute select-none group ${isLocked ? 'cursor-not-allowed' : isEditing ? 'cursor-text' : 'cursor-grab'}`}
      >
        {isSelected && !isEditing && (
          <div className="absolute -inset-1.5 ring-2 ring-[#e31084] pointer-events-none">
            <span className="absolute -top-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-[#e31084] rounded-xs" />
            <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-[#e31084] rounded-xs" />
            <span className="absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-[#e31084] rounded-xs" />
            <span className="absolute -bottom-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-[#e31084] rounded-xs" />
          </div>
        )}

        {isShape ? (
          <ShapeElement shape={clip.props?.shape} filterStr={filterStr} playhead={playhead} clip={clip} />
        ) : (
          <div
            ref={textRef}
            contentEditable={isEditing ? 'plaintext-only' : false}
            suppressContentEditableWarning
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setIsEditing(false); if (textRef.current) textRef.current.innerText = clip.props?.text || 'Your text here'; }
              else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitText();
            }}
            style={{
              width: `${style.boxWidth || 900}px`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              textAlign: style.align || 'center', fontFamily: fontOpt ? fontOpt.stack : style.fontFamily || 'Montserrat, sans-serif',
              fontSize: `${style.fontSize || 72}px`, fontWeight: style.fontWeight || 700,
              fontStyle: style.italic ? 'italic' : 'normal', color: style.color || '#FFFFFF',
              lineHeight: style.lineHeight || 1.2, letterSpacing: `${style.letterSpacing || 0}px`,
              textTransform: style.uppercase ? 'uppercase' : 'none', backgroundColor: bgRgba,
              padding: bg.enabled ? `${bg.padding ?? 24}px` : '0px', borderRadius: bg.enabled ? `${bg.radius ?? 24}px` : '0px',
              WebkitTextStroke: strokeStyle, paintOrder: 'stroke fill', textShadow: shadowStyle,
              filter: filterStr, outline: isEditing ? '2px dashed #10B981' : 'none',
            }}
            className="select-text"
          >
            {clip.props?.text || 'Your text here'}
          </div>
        )}
      </div>
    </>
  );
}
