import { Check } from 'lucide-react';

/**
 * The wizard stepper — Apple design + glassmorphism.
 * Frosted step nodes, glowing active pill, smooth hairline connectors.
 *
 * Props:
 *  - steps: string[] (labels)
 *  - current: index of the active step
 *  - onStepClick(index)? — optional, only past steps are clickable
 */
export default function StepIndicator({ steps, current, onStepClick }) {
  return (
    <ol className="flex items-center w-full" aria-label="progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = done && typeof onStepClick === 'function';
        return (
          <li key={label} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(i)}
              className={`flex items-center gap-2.5 shrink-0 ${
                clickable ? 'cursor-pointer hover:opacity-90 active:scale-95' : 'cursor-default'
              } transition-all duration-150`}
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={`w-7 h-7 rounded-full border flex items-center justify-center font-mono text-[11px] font-semibold transition-all duration-200 ${
                  active
                    ? 'border-[#e31084] bg-[#e31084]/20 text-white shadow-[0_0_14px_rgba(227,16,132,0.5)] ring-2 ring-[#e31084]/30'
                    : done
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'border-white/10 bg-white/[0.03] text-white/40'
                }`}
              >
                {done ? <Check size={12} strokeWidth={2.5} /> : String(i + 1).padStart(2, '0')}
              </span>
              <span
                className={`hidden sm:block text-[11.5px] font-mono uppercase tracking-wider transition-colors ${
                  active
                    ? 'text-white font-semibold'
                    : done
                    ? 'text-white/80'
                    : 'text-white/40'
                }`}
              >
                {label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                className={`h-px flex-1 mx-2 sm:mx-3 transition-colors ${
                  done
                    ? 'bg-gradient-to-r from-emerald-500/40 to-[#e31084]/40'
                    : active
                    ? 'bg-gradient-to-r from-[#e31084]/40 to-white/10'
                    : 'bg-white/10'
                }`}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
