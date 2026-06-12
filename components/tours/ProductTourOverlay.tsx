import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const VIEWPORT_PADDING = 16;
const SPOTLIGHT_GAP = 12;
const CARD_MAX_WIDTH = 340;

function getTargetRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function computeCardPosition(
  spotlight: DOMRect | null,
  cardWidth: number,
  cardHeight: number
): Pick<React.CSSProperties, 'top' | 'left' | 'bottom' | 'transform'> {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxCardHeight = vh - VIEWPORT_PADDING * 2;
  const effectiveHeight = Math.min(cardHeight, maxCardHeight);
  const width = Math.min(CARD_MAX_WIDTH, vw - VIEWPORT_PADDING * 2);

  if (!spotlight) {
    return {
      top: undefined,
      left: '50%',
      bottom: VIEWPORT_PADDING,
      transform: 'translateX(-50%)',
    };
  }

  let top = spotlight.bottom + SPOTLIGHT_GAP;
  if (top + effectiveHeight > vh - VIEWPORT_PADDING) {
    const aboveTop = spotlight.top - SPOTLIGHT_GAP - effectiveHeight;
    if (aboveTop >= VIEWPORT_PADDING) {
      top = aboveTop;
    } else {
      top = Math.max(VIEWPORT_PADDING, vh - VIEWPORT_PADDING - effectiveHeight);
    }
  }

  const left = Math.max(
    VIEWPORT_PADDING,
    Math.min(spotlight.left, vw - width - VIEWPORT_PADDING)
  );

  return {
    top,
    left,
    bottom: undefined,
    transform: undefined,
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
  const [cardPosition, setCardPosition] = useState<
    Pick<React.CSSProperties, 'top' | 'left' | 'bottom' | 'transform'>
  >({ bottom: VIEWPORT_PADDING, left: '50%', transform: 'translateX(-50%)' });
  const cardRef = useRef<HTMLDivElement>(null);
  const isLast = stepIndex >= tour.steps.length - 1;
  const showStepOutline = tour.id === 'demo_overview' && tour.steps.length > 4;

  const refreshSpotlight = useCallback(() => {
    if (!step) return;
    setSpotlight(getTargetRect(step.selector));
  }, [step]);

  const updateCardPosition = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    setCardPosition(computeCardPosition(spotlight, rect.width, rect.height));
  }, [spotlight]);

  useEffect(() => {
    if (!step) return;
    refreshSpotlight();
    const t = window.setTimeout(refreshSpotlight, 350);
    const onViewportChange = () => {
      refreshSpotlight();
      updateCardPosition();
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [step, refreshSpotlight, updateCardPosition]);

  useLayoutEffect(() => {
    updateCardPosition();
  }, [updateCardPosition, stepIndex, step?.id, showStepOutline]);

  if (!step) return null;

  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 10050,
    width: `min(${CARD_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
    maxHeight: `calc(100vh - ${VIEWPORT_PADDING * 2}px)`,
    ...cardPosition,
  };

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
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        className="flex flex-col rounded-xl border border-indigo-200 bg-white shadow-2xl p-4 sm:p-5 text-slate-800 overflow-hidden"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-2 mb-2 shrink-0">
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{tour.title}</p>
          <h3 id="product-tour-title" className="font-bold text-base sm:text-lg mb-1.5">
            {step.title}
          </h3>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">{step.body}</p>
          {showStepOutline && (
            <ol
              className="text-[11px] text-slate-500 mb-3 max-h-24 sm:max-h-32 overflow-y-auto space-y-0.5 list-decimal list-inside border border-slate-100 rounded-lg px-3 py-2 bg-slate-50"
              aria-label="Full demo tour outline"
            >
              {tour.steps.map((s, i) => (
                <li
                  key={s.id}
                  className={i === stepIndex ? 'font-semibold text-indigo-700' : i < stepIndex ? 'text-slate-400' : ''}
                >
                  {s.title}
                </li>
              ))}
            </ol>
          )}
          {!spotlight && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
              Target not visible — navigate to the highlighted module or resize the window, then tap Next.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 shrink-0 border-t border-slate-100">
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
        {footerNote && <p className="mt-2 text-[11px] text-slate-400 shrink-0">{footerNote}</p>}
      </div>
    </>
  );
};

export default ProductTourOverlay;
