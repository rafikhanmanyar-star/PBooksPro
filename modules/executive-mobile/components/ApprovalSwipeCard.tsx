import React, { useRef, useState } from 'react';
import type { MobileApprovalItem } from '../../../types/executiveMobile.types';
import { CURRENCY, ICONS } from '../../../constants';
import { formatDate } from '../../../utils/dateUtils';
import { APPROVAL_TYPE_META } from '../constants/mobileCategories';

const SWIPE_THRESHOLD = 80;

type Props = {
  item: MobileApprovalItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onViewPlan?: () => void;
};

export default function ApprovalSwipeCard({ item, busy, onApprove, onReject, onViewPlan }: Props) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const dragging = useRef(false);
  const meta = APPROVAL_TYPE_META[item.type];
  const isMarketing = item.type === 'installment_plan';

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    setOffsetX(Math.max(-120, Math.min(120, dx)));
  };

  const onTouchEnd = () => {
    dragging.current = false;
    if (offsetX > SWIPE_THRESHOLD && item.canApprove && !item.requiresFullErp) {
      onApprove();
    } else if (offsetX < -SWIPE_THRESHOLD && item.canApprove && !item.requiresFullErp) {
      onReject();
    }
    setOffsetX(0);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 left-0 w-24 bg-emerald-600/90 flex items-center justify-center text-white text-xs font-bold">
        Approve
      </div>
      <div className="absolute inset-y-0 right-0 w-24 bg-ds-danger/90 flex items-center justify-center text-white text-xs font-bold">
        Reject
      </div>
      <div
        className="relative executive-summary-card border border-app-border/60 bg-app-card p-4 transition-transform"
        style={{ transform: `translateX(${offsetX}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-start gap-3">
          <span
            className={`w-10 h-10 rounded-xl shrink-0 inline-flex items-center justify-center ${
              isMarketing ? 'executive-metric-icon--violet' : 'executive-metric-icon--teal'
            }`}
          >
            <span className="w-5 h-5">{isMarketing ? ICONS.fileText : ICONS.checkCircle}</span>
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase text-ds-primary">{meta.shortLabel}</span>
            <p className="font-semibold text-app-text mt-1">{item.title}</p>
            {item.subtitle && <p className="text-sm text-app-muted">{item.subtitle}</p>}
            {item.amount != null && (
              <p className="text-base font-bold mt-2 tabular-nums">
                {item.currency ?? CURRENCY} {item.amount.toLocaleString()}
              </p>
            )}
            {item.requestedAt && (
              <p className="text-[10px] text-app-muted mt-1">{formatDate(item.requestedAt)}</p>
            )}
          </div>
        </div>
        <p className="text-[10px] text-app-muted mt-3 text-center">Swipe right to approve · left to reject</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {isMarketing && onViewPlan && (
            <button
              type="button"
              className="flex-1 py-2 rounded-xl border border-app-border text-sm font-semibold touch-manipulation"
              onClick={onViewPlan}
            >
              View plan
            </button>
          )}
          {item.canApprove && !item.requiresFullErp && (
            <>
              <button
                type="button"
                disabled={busy}
                className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold touch-manipulation disabled:opacity-50"
                onClick={onApprove}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                className="flex-1 py-2 rounded-xl border border-ds-danger text-ds-danger text-sm font-semibold touch-manipulation disabled:opacity-50"
                onClick={onReject}
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
