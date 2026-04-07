import React, { useMemo } from 'react';
import type { JournalLineInput } from '../../services/financialEngine/types';
import { sumDebits, sumCredits, isBalanced, validateBalanced } from '../../services/financialEngine/validation';

export interface JournalEntryPreviewProps {
  lines: JournalLineInput[];
  accountNames?: Record<string, string>;
  reference?: string;
  description?: string;
  entryDate?: string;
  /** Called when user confirms (only if balanced) */
  onConfirm?: () => void;
  confirmLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Preview double-entry lines with debit/credit totals and block save when unbalanced.
 */
export const JournalEntryPreview: React.FC<JournalEntryPreviewProps> = ({
  lines,
  accountNames = {},
  reference,
  description,
  entryDate,
  onConfirm,
  confirmLabel = 'Post journal',
  disabled = false,
  className = '',
}) => {
  const validationError = useMemo(() => validateBalanced(lines), [lines]);
  const balanced = useMemo(() => !validationError && isBalanced(lines), [lines, validationError]);
  const td = sumDebits(lines);
  const tc = sumCredits(lines);

  return (
    <div className={`rounded-ds-md border border-app-border bg-app-card overflow-hidden ${className}`}>
      <div className="px-ds-md py-ds-sm border-b border-app-border bg-app-table-header/80">
        <h3 className="text-ds-body font-semibold text-app-text">Journal preview</h3>
        {(entryDate || reference || description) && (
          <div className="mt-ds-xs text-ds-small text-app-muted space-y-0.5">
            {entryDate && <div>Date: {entryDate}</div>}
            {reference && <div>Reference: {reference}</div>}
            {description && <div>{description}</div>}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-ds-small">
          <thead>
            <tr className="border-b border-app-border text-left text-app-muted">
              <th className="px-ds-md py-2">Account</th>
              <th className="px-ds-md py-2 text-right tabular-nums">Debit</th>
              <th className="px-ds-md py-2 text-right tabular-nums">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={`${l.accountId}-${i}`} className="border-b border-app-border/60 hover:bg-app-table-hover/40">
                <td className="px-ds-md py-2 text-app-text">{accountNames[l.accountId] || l.accountId}</td>
                <td className="px-ds-md py-2 text-right tabular-nums">
                  {l.debitAmount > 0 ? l.debitAmount.toFixed(2) : '—'}
                </td>
                <td className="px-ds-md py-2 text-right tabular-nums">
                  {l.creditAmount > 0 ? l.creditAmount.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold bg-app-muted/10 border-t-2 border-app-border">
              <td className="px-ds-md py-2">Totals</td>
              <td className="px-ds-md py-2 text-right tabular-nums">{td.toFixed(2)}</td>
              <td className="px-ds-md py-2 text-right tabular-nums">{tc.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-ds-md py-ds-sm flex flex-wrap items-center gap-ds-md justify-between">
        <div>
          {validationError ? (
            <p className="text-ds-small text-app-error" role="alert">
              {validationError}
            </p>
          ) : balanced ? (
            <p className="text-ds-small text-emerald-700 dark:text-emerald-400">Balanced — debits equal credits.</p>
          ) : (
            <p className="text-ds-small text-app-muted">Enter at least two lines.</p>
          )}
        </div>
        {onConfirm && (
          <button
            type="button"
            disabled={disabled || !balanced}
            onClick={onConfirm}
            className="px-ds-md py-2 rounded-ds-md bg-ds-primary text-white text-ds-small font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default JournalEntryPreview;
