import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { clamp } from '../editorUtils';

export default function NumberField({
  label,
  value = 0,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit = '',
  disabled = false,
  onReset,
  error = null,
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const num = parseFloat(text);
    if (Number.isNaN(num)) {
      setText(String(value));
      return;
    }
    const clamped = clamp(num, min, max);
    setText(String(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setText(String(value));
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <div className="flex items-center justify-between">
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

      <div className="relative flex items-center">
        <input
          type="text"
          value={text}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className={`w-full h-7 px-2 font-mono text-xs rounded border transition-colors bg-zinc-800 ${
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
              : 'border-zinc-700 focus:border-[#e31084] focus:ring-1 focus:ring-[#e31084]'
          } ${disabled ? 'bg-zinc-900/60 text-zinc-500 cursor-not-allowed border-zinc-800' : 'text-zinc-100'}`}
        />
        {unit && (
          <span className="absolute right-2 text-[10px] text-zinc-400 font-mono pointer-events-none select-none">
            {unit}
          </span>
        )}
      </div>
      {error && <span className="text-[10px] text-red-400 font-medium">{error}</span>}
    </div>
  );
}

