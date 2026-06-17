import React from 'react';
import type { MobileApprovalItem } from '../../../types/executiveMobile.types';
import { CURRENCY, ICONS } from '../../../constants';
import { formatDate } from '../../../utils/dateUtils';
import {
  getApprovalTypeMeta,
  isWorkflowApprovalItem,
} from '../constants/mobileCategories';

const SWIPE_THRESHOLD = 80;

type Props = {
  item: MobileApprovalItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onViewPlan?: () => void;
};

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('approved')) return 'bg-green-500/15 text-green-400';
  if (s.includes('rejected')) return 'bg-ds-danger/15 text-ds-danger';
  if (s.includes('pending')) return 'bg-amber-500/15 text-amber-400';
  return 'bg-app-surface-2 text-app-muted';
}

function typeIcon(item: MobileApprovalItem): React.ReactNode {
  if (item.type === 'installment_plan') return ICONS.fileText;
  if (item.type === 'payment') return ICONS.wallet;
  if (item.type === 'contract' || item.type === 'variation_order') return ICONS.checkCircle;
  if (item.type === 'bill' || item.type === 'contractor_bill') return ICONS.fileText;
  if (item.type === 'purchase_order') return ICONS.briefcase;
  return ICONS.checkCircle;
}

export default function ApprovalSwipeCard({ item, busy, onApprove, onReject, onViewPlan }: Props) {
  const [offsetX, setOffsetX] = React.useState(0);
  const startX = React.useRef(0);
  const dragging = React.useRef(false);
  const meta = getApprovalTypeMeta(item.type);
  const isMarketing = item.type === 'installment_plan';
  const isWorkflow = isWorkflowApprovalItem(item);

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('button, a, input, textarea, select'));

  const onTouchStart = (e: React.TouchEvent) => {
    if (isInteractiveTarget(e.target)) return;
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    setOffsetX(Math.max(-120, Math.min(120, dx)));
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
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
          <span className={`w-10 h-10 rounded-xl shrink-0 inline-flex items-center justify-center ${meta.iconWrap}`}>
            <span className="w-5 h-5">{typeIcon(item)}</span>
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ds-primary">
                {meta.shortLabel}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusBadgeClass(item.status)}`}
              >
                {item.status}
              </span>
              {isWorkflow && item.currentLevel != null && item.maxLevel != null && (
                <span className="text-[10px] font-medium text-app-muted">
                  L{item.currentLevel}/{item.maxLevel}
                </span>
              )}
            </div>
            <p className="font-semibold text-app-text leading-snug">{item.title}</p>
            {item.subtitle && <p className="text-sm text-app-muted mt-0.5">{item.subtitle}</p>}
            {item.requestedByName && (
              <p className="text-xs text-app-muted mt-1">From {item.requestedByName}</p>
            )}
            {item.amount != null && (
              <p className="text-base font-bold mt-2 tabular-nums text-app-text">
                {item.currency ?? CURRENCY} {item.amount.toLocaleString()}
              </p>
            )}
            {item.requestedAt && (
              <p className="text-[10px] text-app-muted mt-1">{formatDate(item.requestedAt)}</p>
            )}
          </div>
        </div>
        {item.canApprove && !item.requiresFullErp && (
          <p className="text-[10px] text-app-muted mt-3 text-center">
            Swipe right to approve · left to reject
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {isMarketing && onViewPlan && (
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl border border-app-border text-sm font-semibold touch-manipulation min-h-[44px]"
              onClick={(e) => {
                e.stopPropagation();
                onViewPlan();
              }}
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
