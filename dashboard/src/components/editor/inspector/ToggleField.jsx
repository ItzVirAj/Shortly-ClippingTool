import React from 'react';
import { Lock } from 'lucide-react';

export default function ToggleField({
  label,
  checked = false,
  onChange,
  disabled = false,
  onReset,
}) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
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

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors relative focus:outline-hidden disabled:opacity-40 disabled:cursor-not-allowed ${
          checked ? 'bg-[#e31084]' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-xs ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

