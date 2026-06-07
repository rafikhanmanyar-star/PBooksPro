import React, { useCallback, useEffect, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, Pause } from 'lucide-react';
import type { ProductTourDefinition, ProductTourStep } from '../../shared/tours/productTourDefinitions';

type Props = {
  tour: ProductTourDefinition;
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onResumeLater: () => void;
  onComplete: () => void;
  badgeLabel?: string;
  footerNote?: string;
};

function getTargetRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function positionCard(spotlight: DOMRect | null): React.CSSProperties {
  if (spotlight) {
    const top = Math.min(spotlight.bottom + 12, window.innerHeight - 240);
    const left = Math.max(16, Math.min(spotlight.left, window.innerWidth - 360));
    return {
      position: 'fixed',
      top,
      left,
      zIndex: 10050,
      width: 'min(340px, calc(100vw - 32px))',
    };
  }
  return {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10050,
    width: 'min(340px, calc(100vw - 32px))',
  };
}

const ProductTourOverlay: React.FC<Props> = ({
  tour,
  stepIndex,
  onNext,
  onBack,
  onSkip,
  onResumeLater,
  onComplete,
  badgeLabel = 'Product tour',
  footerNote,
}) => {
  const step: ProductTourStep | undefined = tour.steps[stepIndex];
  const [spotlight, setSpotlight] = useState<DOMRect | null>(null);
  const isLast = stepIndex >= tour.steps.length - 1;

  const refreshSpotlight = useCallback(() => {
    if (!step) return;
    setSpotlight(getTargetRect(step.selector));
  }, [step]);

  useEffect(() => {
    if (!step) return;
    refreshSpotlight();
    const t = window.setTimeout(refreshSpotlight, 350);
    const onResize = () => refreshSpotlight();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [step, refreshSpotlight]);

  if (!step) return null;

  const cardStyle = positionCard(spotlight);

  return (
    <>
      <div className="fixed inset-0 z-[10040] bg-black/50 pointer-events-auto" aria-hidden="true" />
      {spotlight && (
        <div
          className="fixed z-[10045] rounded-lg ring-4 ring-indigo-400/90 ring-offset-2 ring-offset-transparent pointer-events-none transition-all duration-300 shadow-[0_0_24px_rgba(99,102,241,0.35)]"
          style={{
            top: spotlight.top - 4,
            left: spotlight.left - 4,
            width: spotlight.width + 8,
            height: spotlight.height + 8,
          }}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        className="rounded-xl border border-indigo-200 bg-white shadow-2xl p-4 sm:p-5 text-slate-800"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
            <Sparkles size={16} aria-hidden />
            <span>{badgeLabel}</span>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="Skip tour"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{tour.title}</p>
        <h3 id="product-tour-title" className="font-bold text-base sm:text-lg mb-1.5">
          {step.title}
        </h3>
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">{step.body}</p>
        {!spotlight && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
            Target not visible — navigate to the highlighted module or resize the window, then tap Next.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {stepIndex + 1} / {tour.steps.length}
          </span>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md text-slate-600 hover:bg-slate-100"
              onClick={onResumeLater}
            >
              <Pause size={12} /> Later
            </button>
            {stepIndex > 0 && (
              <button
                type="button"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50"
                onClick={onBack}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={onNext}
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={onComplete}
              >
                Finish
              </button>
            )}
          </div>
        </div>
        {footerNote && <p className="mt-3 text-[11px] text-slate-400">{footerNote}</p>}
      </div>
    </>
  );
};

export default ProductTourOverlay;
