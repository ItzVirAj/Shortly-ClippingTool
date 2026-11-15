import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';

function normalizeHex(val) {
  if (typeof val !== 'string') return null;
  let clean = val.trim();
  if (!clean.startsWith('#')) clean = '#' + clean;
  if (/^#[0-9A-Fa-f]{3}$/.test(clean)) {
    return '#' + clean.slice(1).split('').map((c) => c + c).join('').toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(clean)) {
    return clean.toUpperCase();
  }
  return null;
}

export default function ColorField({
  label,
  value = '#FFFFFF',
  onChange,
  onCommit,
  disabled = false,
  onReset,
}) {
  const normVal = normalizeHex(value) || '#FFFFFF';
  const [text, setText] = useState(normVal);

  useEffect(() => {
    setText(normVal);
  }, [normVal]);

  const commitText = () => {
    const valid = normalizeHex(text);
    if (!valid) {
      setText(normVal);
      return;
    }
    setText(valid);
    if (valid !== normVal && onCommit) onCommit(valid);
  };

  const handleNativeChange = (e) => {
    const v = e.target.value.toUpperCase();
    setText(v);
    if (onChange) onChange(v);
  };

  const handleNativeBlur = () => {
    const valid = normalizeHex(text) || normVal;
    if (onCommit) onCommit(valid);
  };

  return (
    <div className="flex items-center justify-between text-xs gap-2">
      <div className="flex items-center gap-1 min-w-0">
        <label
          onDoubleClick={!disabled && onReset ? onReset : undefined}
          title="Double-click to reset"
          className={`font-medium select-none truncate ${
            disabled ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-zinc-200 cursor-pointer'
          }`}
        >
          {label}
        </label>
        {disabled && <Lock size={10} className="text-zinc-500 shrink-0" />}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="relative w-6 h-6 rounded border border-zinc-700 overflow-hidden shrink-0 cursor-pointer shadow-2xs">
          <input
            type="color"
            value={normVal}
            disabled={disabled}
            aria-label={`${label} color picker`}
            onChange={handleNativeChange}
            onBlur={handleNativeBlur}
            className="absolute -inset-2 w-10 h-10 cursor-pointer disabled:cursor-not-allowed border-0 p-0 bg-transparent"
          />
        </div>
        <input
          type="text"
          value={text}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-16 h-7 px-1.5 font-mono text-[11px] rounded border border-zinc-700 uppercase bg-zinc-800 text-zinc-100 focus:border-[#e31084] disabled:bg-zinc-900/60 disabled:text-zinc-500"
        />
      </div>
    </div>
  );
}

