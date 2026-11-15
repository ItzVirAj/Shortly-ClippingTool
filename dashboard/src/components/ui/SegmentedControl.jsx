/**
 * Option-toggle group — Apple design + glassmorphism.
 * Frosted translucent tiles, spring micro-interactions, brand pink accent aura.
 *
 * Props:
 *  - options: [{ value, label, icon?, hint?, disabled? }]
 *  - value: selected value (or array when multi)
 *  - onChange(value)
 *  - multi: allow multiple selections (value must be an array)
 *  - columns: grid column count (default: options.length, capped at 4)
 *  - size: 'sm' | 'md'
 */
export default function SegmentedControl({ options, value, onChange, multi = false, columns, size = 'md' }) {
  const cols = columns || Math.min(options.length, 4);
  const isActive = (v) => (multi ? Array.isArray(value) && value.includes(v) : value === v);

  const toggle = (v) => {
    if (!multi) return onChange(v);
    const arr = Array.isArray(value) ? value : [];
    onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const pad = size === 'sm' ? 'px-2.5 py-1.5' : 'px-3 py-2.5';

  const minCol = size === 'sm' ? 48 : 88;
  const gridTemplateColumns = `repeat(auto-fill, minmax(max(${minCol}px, calc((100% - ${(cols - 1) * 6}px) / ${cols})), 1fr))`;

  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns }} role={multi ? 'group' : 'radiogroup'}>
      {options.map((opt) => {
        const active = isActive(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => toggle(opt.value)}
            className={`${pad} rounded-xl border text-xs flex flex-col items-center justify-center gap-1 transition-all duration-150 active:scale-[0.98] ${
              active
                ? 'border-[#e31084]/60 bg-gradient-to-b from-[#e31084]/20 to-white/[0.04] text-white font-medium shadow-[0_2px_12px_rgba(227,16,132,0.2)] ring-1 ring-[#e31084]/30'
                : 'border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.14]'
            } disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
          >
            {opt.icon && <span className={active ? 'text-[#ff66b2]' : 'text-white/60'}>{opt.icon}</span>}
            <span className="font-medium text-center">{opt.label}</span>
            {opt.hint && <span className="text-[10px] text-white/40 normal-case">{opt.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
