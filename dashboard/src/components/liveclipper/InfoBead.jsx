import React, { useState, useRef, useEffect } from 'react';
import { Info, X, Sparkles, TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';

/**
 * InfoBead - Interactive informational badge / tooltip.
 *
 * Explains complex algorithmic toggles in simple human terms so everyday
 * users immediately understand what a toggle does and what happens if they
 * turn it up or down.
 */
export default function InfoBead({
  title,
  desc,
  lowResult,
  highResult,
  example,
  recommendation,
  align = 'center', // 'left' | 'center' | 'right'
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const beadRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e) => {
      if (beadRef.current && !beadRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const alignmentClasses = {
    left: 'left-0 origin-top-left',
    center: 'left-1/2 -translate-x-1/2 origin-top',
    right: 'right-0 origin-top-right',
  };

  return (
    <div className={`relative inline-flex items-center align-middle ${className}`} ref={beadRef}>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }
        }}
        onMouseEnter={() => setIsOpen(true)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/[0.06] hover:bg-brass/20 text-muted hover:text-brass border border-white/[0.12] hover:border-brass/40 transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-brass select-none"
        aria-label={title ? `Info about ${title}` : 'More information'}
        title="Click or hover for explanation"
      >
        <HelpCircle size={10} className="stroke-[2.2]" />
      </span>

      {isOpen && (
        <div
          className={`absolute top-full mt-2 z-50 w-72 sm:w-80 p-3.5 rounded-xl bg-[#14151f]/95 backdrop-blur-xl border border-white/[0.14] text-ink shadow-[0_12px_32px_rgba(0,0,0,0.6)] animate-fade text-left text-xs space-y-2.5 pointer-events-auto ${alignmentClasses[align] || alignmentClasses.center}`}
          onMouseLeave={() => setIsOpen(false)}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <Sparkles size={13} className="text-brass shrink-0" />
              <span>{title}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-muted hover:text-white p-0.5 rounded transition-colors"
            >
              <X size={12} />
            </button>
          </div>

          {/* Core Explanation */}
          {desc && (
            <p className="text-[11.5px] text-muted leading-relaxed">
              {desc}
            </p>
          )}

          {/* What setting it Low vs High results in */}
          {(lowResult || highResult) && (
            <div className="space-y-1.5 pt-0.5">
              {lowResult && (
                <div className="p-2 rounded-lg bg-ok/10 border border-ok/20 text-[11px] text-ok/90 flex items-start gap-1.5 leading-snug">
                  <TrendingDown size={13} className="shrink-0 mt-0.5 text-ok" />
                  <div>
                    <strong className="text-ok font-semibold">Lower value:</strong> {lowResult}
                  </div>
                </div>
              )}
              {highResult && (
                <div className="p-2 rounded-lg bg-coral/10 border border-coral/20 text-[11px] text-coral/90 flex items-start gap-1.5 leading-snug">
                  <TrendingUp size={13} className="shrink-0 mt-0.5 text-coral" />
                  <div>
                    <strong className="text-coral font-semibold">Higher value:</strong> {highResult}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Real-world Example */}
          {example && (
            <div className="p-2 rounded-lg bg-brass/10 border border-brass/25 text-[11px] text-brass/95 leading-snug font-mono">
              {example}
            </div>
          )}

          {/* Recommendation */}
          {recommendation && (
            <div className="text-[10.5px] text-muted/80 italic pt-0.5 border-t border-white/[0.06]">
              💡 {recommendation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
