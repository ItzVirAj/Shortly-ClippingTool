import React from 'react';
import { hexToRgba, clamp } from './editorUtils';

export default function ShapeElement({ shape, filterStr, playhead, clip }) {
  const shapeStroke = shape?.stroke || {};
  const shapeFill = hexToRgba(shape?.fill || '#FFFFFF', (shape?.fillOpacity ?? 100) / 100);
  const shapeBorder = shapeStroke.enabled && shapeStroke.width
    ? `${shapeStroke.width}px solid ${shapeStroke.color || '#000000'}`
    : 'none';
  const progressRatio = clamp((playhead - clip.start) / (clip.duration || 1), 0, 1) * 100;

  return (
    <div
      style={{
        width: `${shape?.width ?? 400}px`,
        height: `${shape?.height ?? (shape?.kind === 'line' ? 8 : shape?.kind === 'progress' ? 12 : 400)}px`,
        backgroundColor: shape?.kind === 'progress' ? (shape?.trackColor || 'rgba(255, 255, 255, 0.3)') : shapeFill,
        borderRadius: shape?.kind === 'circle' ? '50%' : shape?.kind === 'rect' ? `${shape?.radius ?? 0}px` : '0px',
        border: shapeBorder,
        boxSizing: 'border-box',
        filter: filterStr,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {shape?.kind === 'progress' && (
        <div style={{ width: `${progressRatio}%`, height: '100%', backgroundColor: shapeFill }} />
      )}
    </div>
  );
}

