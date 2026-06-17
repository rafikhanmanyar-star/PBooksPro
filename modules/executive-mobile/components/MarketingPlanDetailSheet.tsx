import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CURRENCY, ICONS } from '../../../constants';
import { formatDateTime } from '../../../utils/dateUtils';
import type { MobileInstallmentPlanDetail } from '../../../types/executiveMobile.types';
import { buildMobileInstallmentSchedule } from '../utils/marketingPlanSchedule';

type Props = {
  open: boolean;
  loading: boolean;
  error?: boolean;
  errorMessage?: string;
  plan: MobileInstallmentPlanDetail | null | undefined;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
};

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-app-border/40 last:border-0">
      <span className="text-xs text-app-muted shrink-0">{label}</span>
      <span className="text-sm font-medium text-app-text text-right">{value}</span>
    </div>
  );
}

function money(n?: number) {
  if (n == null || Number.isNaN(n)) return undefined;
  return `${CURRENCY} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('approved')) return 'bg-green-500/15 text-green-400';
  if (s.includes('rejected')) return 'bg-ds-danger/15 text-ds-danger';
  if (s.includes('pending')) return 'bg-amber-500/15 text-amber-400';
  return 'bg-app-surface-2 text-app-muted';
}

export default function MarketingPlanDetailSheet({
  open,
  loading,
  error,
  errorMessage,
  plan,
  busy,
  onClose,
  onApprove,
  onReject,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const schedule = useMemo(
    () => (plan ? buildMobileInstallmentSchedule(plan) : []),
    [plan]
  );

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close plan details"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="marketing-plan-title"
        className="relative flex max-h-[min(92dvh,100%)] w-full flex-col rounded-t-2xl border-t border-app-border bg-app-card shadow-2xl"
      >
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-app-border" aria-hidden />
        </div>

        <div className="flex items-start justify-between gap-3 px-4 py-2 border-b border-app-border shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id="marketing-plan-title" className="text-base font-bold text-app-text truncate">
              {plan?.description?.trim() || 'Marketing plan'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {plan?.status && (
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusBadgeClass(plan.status)}`}
                >
                  {plan.status}
                </span>
              )}
              {(plan?.projectName || plan?.unitLabel) && (
                <span className="text-xs text-app-muted truncate">
                  {[plan?.projectName, plan?.unitLabel].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-app-muted touch-manipulation shrink-0"
            aria-label="Close"
          >
            <span className="w-5 h-5">{ICONS.x}</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
          {loading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-20 rounded-xl bg-app-surface-2" />
              <div className="h-32 rounded-xl bg-app-surface-2" />
              <div className="h-40 rounded-xl bg-app-surface-2" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-ds-danger/30 bg-ds-danger/10 p-4 text-center">
              <p className="font-semibold text-app-text">Could not load plan</p>
              <p className="text-sm text-app-muted mt-1">
                {errorMessage?.trim() || 'Check your connection and try again.'}
              </p>
            </div>
          )}

          {!loading && !error && plan && (
            <>
              <div className="rounded-xl border border-ds-primary/25 bg-gradient-to-br from-ds-primary/10 to-transparent p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">
                  Net value
                </p>
                <p className="text-2xl font-bold tabular-nums text-app-text mt-1">
                  {money(plan.netValue) ?? '—'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-app-muted">Down payment</p>
                    <p className="font-semibold tabular-nums mt-0.5">{money(plan.downPaymentAmount) ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-app-muted">Per installment</p>
                    <p className="font-semibold tabular-nums mt-0.5">{money(plan.installmentAmount) ?? '—'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-app-border/60 bg-app-surface-2/50 p-3 space-y-1">
                <DetailRow label="Project" value={plan.projectName ?? plan.projectId} />
                <DetailRow label="Unit" value={plan.unitLabel ?? plan.unitId} />
                <DetailRow label="Lead" value={plan.leadName ?? plan.leadId} />
                <DetailRow label="Requested by" value={plan.requestedByName} />
                {plan.approvalRequestedAt && (
                  <DetailRow label="Requested" value={formatDateTime(plan.approvalRequestedAt)} />
                )}
                {plan.reviewedByName && (
                  <DetailRow label="Reviewed by" value={plan.reviewedByName} />
                )}
                {plan.approvalReviewedAt && (
                  <DetailRow label="Reviewed" value={formatDateTime(plan.approvalReviewedAt)} />
                )}
              </div>

              {plan.introText && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-1">
                    Intro
                  </p>
                  <p className="text-sm text-app-text whitespace-pre-wrap leading-relaxed">
                    {plan.introText}
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-app-border/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">
                  Pricing
                </p>
                <DetailRow label="List price" value={money(plan.listPrice)} />
                <DetailRow label="Net value" value={money(plan.netValue)} />
                <DetailRow label="Down payment" value={money(plan.downPaymentAmount)} />
                <DetailRow
                  label="Down payment %"
                  value={
                    plan.downPaymentPercentage != null
                      ? `${plan.downPaymentPercentage}%`
                      : undefined
                  }
                />
                <DetailRow label="Installment" value={money(plan.installmentAmount)} />
                <DetailRow label="Installments" value={plan.totalInstallments} />
                <DetailRow
                  label="Duration"
                  value={plan.durationYears ? `${plan.durationYears} yrs` : undefined}
                />
                <DetailRow label="Frequency" value={plan.frequency} />
                <DetailRow label="Amenities total" value={money(plan.amenitiesTotal)} />
              </div>

              {(plan.customerDiscount ||
                plan.floorDiscount ||
                plan.lumpSumDiscount ||
                plan.miscDiscount) ? (
                <div className="rounded-xl border border-app-border/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">
                    Discounts
                  </p>
                  <DetailRow label="Customer" value={money(plan.customerDiscount)} />
                  <DetailRow label="Floor" value={money(plan.floorDiscount)} />
                  <DetailRow label="Lump sum" value={money(plan.lumpSumDiscount)} />
                  <DetailRow label="Misc" value={money(plan.miscDiscount)} />
                </div>
              ) : null}

              {(plan.selectedAmenities?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">
                    Amenities
                  </p>
                  <ul className="space-y-2">
                    {plan.selectedAmenities!.map((a, i) => (
                      <li
                        key={`${a.amenityName}-${i}`}
                        className="flex justify-between text-sm rounded-lg bg-app-surface-2/50 px-3 py-2"
                      >
                        <span className="text-app-text">{a.amenityName ?? 'Amenity'}</span>
                        <span className="font-medium tabular-nums">
                          {money(a.calculatedAmount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {schedule.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">
                    Payment schedule
                  </p>
                  <div className="rounded-xl border border-app-border/60 overflow-hidden">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-2 bg-app-surface-2/80 text-[10px] font-semibold uppercase tracking-wider text-app-muted">
                      <span>Due</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right w-20">Balance</span>
                    </div>
                    <ul className="divide-y divide-app-border/40 max-h-56 overflow-y-auto">
                      {schedule.map((row) => (
                        <li
                          key={`${row.label}-${row.due}`}
                          className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-app-text">{row.label}</p>
                            <p className="text-[10px] text-app-muted truncate">{row.due}</p>
                          </div>
                          <span className="text-right font-semibold tabular-nums text-app-text">
                            {money(row.amount)}
                          </span>
                          <span className="text-right tabular-nums text-app-muted w-20 text-xs self-center">
                            {money(row.balance)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {plan?.canApprove && (
          <div className="shrink-0 p-4 pb-safe border-t border-app-border flex gap-2 bg-app-card">
            <button
              type="button"
              disabled={busy}
              className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm touch-manipulation disabled:opacity-50"
              onClick={onApprove}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              className="flex-1 py-3 rounded-xl border border-ds-danger text-ds-danger font-semibold text-sm touch-manipulation disabled:opacity-50"
              onClick={onReject}
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
