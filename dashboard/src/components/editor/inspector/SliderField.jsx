import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';

export default function SliderField({
  label,
  value = 0,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  unit = '%',
  disabled = false,
  onReset,
}) {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleChange = (e) => {
    const val = Number(e.target.value);
    setLocalVal(val);
    if (onChange) onChange(val);
  };

  const handlePointerUp = () => {
    if (onCommit) onCommit(localVal);
  };

  return (
    <div className="flex flex-col gap-1 text-xs">
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
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
          <span>{Math.round(localVal)}{unit}</span>
          {disabled && <Lock size={10} className="text-zinc-500" />}
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localVal}
        disabled={disabled}
        aria-label={label}
        onChange={handleChange}
        onPointerUp={handlePointerUp}
        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#e31084] disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </div>
  );
}

