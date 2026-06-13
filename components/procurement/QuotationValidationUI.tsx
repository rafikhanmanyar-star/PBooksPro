import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { QuotationValidationResult } from '../../shared/quotation-validation/types';
import { severityIndicator, severityLabel } from '../../shared/quotation-validation/QuotationValidationService';
import { CURRENCY } from '../../constants';

const severityClasses: Record<string, string> = {
  WITHIN: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
  LOW: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
  HIGH: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
};

interface QuotationPriceIndicatorProps {
  result: QuotationValidationResult | null;
  compact?: boolean;
}

export const QuotationPriceIndicator: React.FC<QuotationPriceIndicatorProps> = ({
  result,
  compact = false,
}) => {
  if (!result?.quotationFound || !result.validationEnabled) return null;
  if (result.severity === 'NONE') return null;

  const cls = severityClasses[result.severity] ?? severityClasses.WITHIN;
  const label = severityLabel(result.severity, result.variancePercentage);
  const icon = severityIndicator(result.severity);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}
        title={label}
      >
        {icon} {result.severity === 'WITHIN' ? 'OK' : `${Math.abs(result.variancePercentage ?? 0).toFixed(0)}%`}
      </span>
    );
  }

  return (
    <div className={`text-xs font-medium px-2 py-1 rounded border ${cls}`}>
      {icon} {label}
    </div>
  );
};

interface QuotationPriceAlertModalProps {
  isOpen: boolean;
  result: QuotationValidationResult;
  onContinue: () => void;
  onReview: () => void;
}

export const QuotationPriceAlertModal: React.FC<QuotationPriceAlertModalProps> = ({
  isOpen,
  result,
  onContinue,
  onReview,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  const fmt = (n?: number) =>
    n != null
      ? n.toLocaleString('en-US', { style: 'currency', currency: CURRENCY })
      : '—';

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div
        className="w-full max-w-md rounded-xl bg-app-card border border-app-border shadow-xl p-5 space-y-4"
        role="dialog"
        aria-labelledby="price-alert-title"
      >
        <h3 id="price-alert-title" className="text-lg font-bold text-app-text flex items-center gap-2">
          ⚠ Price Alert
        </h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-app-muted">Quoted Rate</dt>
            <dd className="font-semibold text-app-text">{fmt(result.quotedRate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-app-muted">Current Rate</dt>
            <dd className="font-semibold text-app-text">{fmt(result.transactionRate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-app-muted">Difference</dt>
            <dd className="font-semibold text-rose-600 dark:text-rose-400">
              {fmt(result.varianceAmount)} (+{result.variancePercentage?.toFixed(2)}%)
            </dd>
          </div>
          {result.quotationReference && (
            <div className="flex justify-between gap-4">
              <dt className="text-app-muted">Quotation Reference</dt>
              <dd className="font-medium text-app-text">{result.quotationReference}</dd>
            </div>
          )}
          {result.quotationDate && (
            <div className="flex justify-between gap-4">
              <dt className="text-app-muted">Quotation Date</dt>
              <dd className="text-app-text">{result.quotationDate}</dd>
            </div>
          )}
        </dl>
        <p className="text-sm text-app-muted">Would you like to continue?</p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onReview}
            className="px-4 py-2 rounded-lg border border-app-border text-app-text hover:bg-app-toolbar text-sm font-medium"
          >
            Review Rate
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

interface QuotationReferencePanelProps {
  reference: {
    quotationNumber?: string;
    vendorName?: string;
    categoryName?: string;
    itemLabel?: string;
    quotedRate: number;
    quotationDate: string;
    expiryDate?: string;
    enablePriceValidation: boolean;
    validationScope: string;
  } | null;
  onOpenQuotation?: () => void;
  onViewHistory?: () => void;
}

export const QuotationReferencePanel: React.FC<QuotationReferencePanelProps> = ({
  reference,
  onOpenQuotation,
  onViewHistory,
}) => {
  if (!reference) {
    return (
      <aside className="rounded-lg border border-app-border bg-app-toolbar p-4 text-sm text-app-muted">
        <h4 className="font-semibold text-app-text mb-2">Latest Vendor Quotation</h4>
        <p>No matching quotation found for this vendor and category.</p>
      </aside>
    );
  }

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: CURRENCY });

  return (
    <aside className="rounded-lg border border-app-border bg-app-card p-4 space-y-3 text-sm">
      <h4 className="font-semibold text-app-text">Latest Vendor Quotation</h4>
      <dl className="space-y-1.5">
        {reference.quotationNumber && (
          <div className="flex justify-between gap-2">
            <dt className="text-app-muted">Quotation No.</dt>
            <dd className="font-medium">{reference.quotationNumber}</dd>
          </div>
        )}
        {reference.vendorName && (
          <div className="flex justify-between gap-2">
            <dt className="text-app-muted">Vendor</dt>
            <dd>{reference.vendorName}</dd>
          </div>
        )}
        {reference.categoryName && (
          <div className="flex justify-between gap-2">
            <dt className="text-app-muted">Category</dt>
            <dd>{reference.categoryName}</dd>
          </div>
        )}
        {reference.itemLabel && (
          <div className="flex justify-between gap-2">
            <dt className="text-app-muted">Unit</dt>
            <dd>{reference.itemLabel}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-app-muted">Quoted Rate</dt>
          <dd className="font-semibold text-indigo-600 dark:text-indigo-400">{fmt(reference.quotedRate)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-app-muted">Quotation Date</dt>
          <dd>{reference.quotationDate}</dd>
        </div>
        {reference.expiryDate && (
          <div className="flex justify-between gap-2">
            <dt className="text-app-muted">Expiry Date</dt>
            <dd>{reference.expiryDate}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-app-muted">Validation</dt>
          <dd>{reference.enablePriceValidation ? 'Enabled' : 'Disabled'}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2 pt-1">
        {onOpenQuotation && (
          <button
            type="button"
            onClick={onOpenQuotation}
            className="text-xs px-3 py-1.5 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
          >
            Open Quotation
          </button>
        )}
        {onViewHistory && (
          <button
            type="button"
            onClick={onViewHistory}
            className="text-xs px-3 py-1.5 rounded border border-app-border text-app-text hover:bg-app-toolbar"
          >
            View History
          </button>
        )}
      </div>
    </aside>
  );
};
