import React from 'react';
import { Lock } from 'lucide-react';

export default function SelectField({
  label,
  value,
  options = [],
  onChange,
  disabled = false,
  onReset,
}) {
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

      <select
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 px-2 font-mono text-xs rounded border border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-[#e31084] disabled:bg-zinc-900/60 disabled:text-zinc-500 disabled:cursor-not-allowed max-w-[130px] truncate"
      >
        {options.map((opt) => {
          const val = typeof opt === 'object' ? opt.value : opt;
          const lab = typeof opt === 'object' ? opt.label : opt;
          return (
            <option key={val} value={val} className="bg-zinc-800 text-zinc-100">
              {lab}
            </option>
          );
        })}
      </select>
    </div>
  );
}

