import React from 'react';
import { ICONS } from '../../../constants';
import Button from '../../ui/Button';
import { formatPKR } from './loanManagerUtils';
import { formatDate } from '../../../utils/dateUtils';
import type { LoanStatusUI } from './loanManagerUtils';

export interface ProcessedTx {
  id: string;
  date: string;
  give: number;
  receive: number;
  balance: number;
  accountName: string;
  description?: string;
}

interface LoanDetailPanelProps {
  contactName: string;
  contactNo?: string;
  netBalance: number;
  statusUI: LoanStatusUI;
  dueLabel: string;
  totalGiven: number;
  totalCollectedOrRepaid: number;
  transactions: ProcessedTx[];
  onRecordPayment: () => void;
  onEditLoan: (txId: string) => void;
  onSendReminder: () => void;
  onExport: () => void;
  onPrint: () => void;
}

export const LoanDetailPanel: React.FC<LoanDetailPanelProps> = ({
  contactName,
  netBalance,
  statusUI,
  dueLabel,
  totalGiven,
  totalCollectedOrRepaid,
  transactions,
  onRecordPayment,
  onEditLoan,
  onSendReminder,
  onExport,
  onPrint,
}) => {
  const initial = contactName.charAt(0).toUpperCase();
  const progressTotal = totalGiven + totalCollectedOrRepaid;
  const progressPct = progressTotal > 0 ? Math.min(100, (totalCollectedOrRepaid / progressTotal) * 100) : 0;
  const statusBadgeClass =
    statusUI === 'Completed'
      ? 'bg-app-highlight text-ds-success'
      : statusUI === 'Overdue'
        ? 'bg-app-highlight text-ds-danger'
        : statusUI === 'Partial'
          ? 'bg-app-highlight text-ds-warning'
          : 'bg-app-surface-2 text-app-muted';

  return (
    <div className="h-full flex flex-col min-h-0 bg-app-card rounded-2xl shadow-ds-card border border-app-border overflow-hidden">
      {/* Header card */}
      <div className="p-6 md:p-8 bg-app-surface-2 border-b border-app-border shrink-0">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-app-highlight flex items-center justify-center text-ds-primary font-bold text-xl shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-app-text truncate">{contactName}</h2>
            <div className="mt-1 text-2xl md:text-3xl font-bold tabular-nums">
              <span className={netBalance > 0 ? 'text-ds-danger' : 'text-ds-success'}>
                {formatPKR(netBalance)}
              </span>
              <span className="text-app-muted font-normal text-lg ml-2">Remaining</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-sm text-app-muted">Due: {dueLabel}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass}`}>
                {statusUI}
              </span>
            </div>
            {progressTotal > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-app-muted mb-1">
                  <span>Repayment progress</span>
                  <span>{Math.round(progressPct)}%</span>
                </div>
                <div className="h-2 rounded-full bg-app-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-ds-success transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky actions */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-end gap-2 p-3 bg-app-card/95 backdrop-blur border-b border-app-border shrink-0">
        <Button
          size="sm"
          variant="secondary"
          onClick={onPrint}
          className="hidden sm:inline-flex"
          title="Print"
        >
          <span className="w-4 h-4">{ICONS.print}</span>
        </Button>
        <Button size="sm" variant="secondary" onClick={onExport} title="Export">
          <span className="w-4 h-4">{ICONS.export}</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onSendReminder}
          title="Send reminder"
          className="text-ds-success border-ds-success/30 hover:bg-app-highlight"
        >
          <span className="w-4 h-4">{ICONS.whatsapp}</span>
        </Button>
        <Button size="sm" variant="secondary" onClick={() => transactions[0] && onEditLoan(transactions[0].id)} title="Edit loan">
          <span className="w-4 h-4">{ICONS.edit}</span>
          <span className="hidden sm:inline ml-1">Edit loan</span>
        </Button>
        <Button onClick={onRecordPayment} size="sm">
          <span className="w-4 h-4">{ICONS.plus}</span>
          <span className="ml-1">Record payment</span>
        </Button>
      </div>

      {/* Transaction timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <h3 className="text-sm font-semibold text-app-muted uppercase tracking-wider mb-4">Transaction history</h3>
        {transactions.length === 0 ? (
          <p className="text-app-muted text-sm">No transactions yet.</p>
        ) : (
          <div className="relative space-y-0">
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-app-border" />
            {transactions.map((tx) => {
              const isInflow = tx.receive > 0;
              return (
                <div key={tx.id} className="relative flex gap-4 pb-6 last:pb-0">
                  <div
                    className={`relative z-10 w-6 h-6 rounded-full shrink-0 mt-0.5 ${
                      isInflow ? 'bg-ds-success' : 'bg-ds-danger'
                    }`}
                  />
                  <div className="flex-1 min-w-0 pt-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <div>
                        <span className={isInflow ? 'text-ds-success font-medium' : 'text-ds-danger font-medium'}>
                          {isInflow ? `+ ${formatPKR(tx.receive)}` : `− ${formatPKR(tx.give)}`}
                        </span>
                        <span className="text-app-muted ml-2">
                          {isInflow ? 'Received' : 'Given'}
                        </span>
                        {tx.description && (
                          <p className="text-app-muted text-sm mt-0.5 truncate max-w-md">{tx.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="text-sm text-app-muted tabular-nums">{formatDate(tx.date)}</div>
                        <div className={`text-sm font-semibold tabular-nums ${tx.balance > 0 ? 'text-ds-danger' : tx.balance < 0 ? 'text-ds-success' : 'text-app-muted'}`}>
                          Balance: {formatPKR(tx.balance)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditLoan(tx.id)}
                      className="mt-1 text-xs text-ds-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const LoanDetailEmpty: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center text-app-muted bg-app-card rounded-2xl border border-app-border p-8">
    <div className="w-16 h-16 rounded-full bg-app-surface-2 flex items-center justify-center mb-4">
      <span className="text-2xl text-app-muted">👤</span>
    </div>
    <p className="text-app-text font-medium">Select a contact to view loan details</p>
    <p className="text-sm mt-1 text-app-muted">Choose a lender or borrower from the list</p>
  </div>
);
