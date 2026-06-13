import React from 'react';
import { CURRENCY, ICONS } from '../../../constants';
import { formatDate, formatDateTime } from '../../../utils/dateUtils';
import type { MobileInstallmentPlanDetail } from '../../../types/executiveMobile.types';

type Props = {
  open: boolean;
  loading: boolean;
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

export default function MarketingPlanDetailSheet({
  open,
  loading,
  plan,
  busy,
  onClose,
  onApprove,
  onReject,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close plan details"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[88vh] w-full rounded-t-2xl border-t border-app-border bg-app-card shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-app-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-app-text">Marketing Plan</h2>
            {plan?.status && (
              <p className="text-xs text-app-muted mt-0.5">{plan.status}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-app-muted touch-manipulation"
            aria-label="Close"
          >
            <span className="w-5 h-5">{ICONS.x}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading && <p className="text-sm text-app-muted">Loading plan…</p>}

          {!loading && plan && (
            <>
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

              {plan.description && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-1">
                    Description
                  </p>
                  <p className="text-sm text-app-text">{plan.description}</p>
                </div>
              )}

              {plan.introText && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-1">
                    Intro
                  </p>
                  <p className="text-sm text-app-text whitespace-pre-wrap">{plan.introText}</p>
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
                <DetailRow label="Duration" value={plan.durationYears ? `${plan.durationYears} yrs` : undefined} />
                <DetailRow label="Frequency" value={plan.frequency} />
                <DetailRow label="Amenities total" value={money(plan.amenitiesTotal)} />
              </div>

              {(plan.customerDiscount || plan.floorDiscount || plan.lumpSumDiscount || plan.miscDiscount) ? (
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
            </>
          )}
        </div>

        {plan?.canApprove && (
          <div className="shrink-0 p-4 border-t border-app-border flex gap-2 bg-app-card">
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
    </div>
  );
}
