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
  contactNo,
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
      ? 'bg-emerald-100 text-emerald-800'
      : statusUI === 'Overdue'
        ? 'bg-red-100 text-red-800'
        : statusUI === 'Partial'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-slate-100 text-slate-700';

  return (
    <div className="h-full flex flex-col min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header card */}
      <div className="p-6 md:p-8 bg-gradient-to-br from-slate-50 to-white border-b border-slate-200 shrink-0">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-800 truncate">{contactName}</h2>
            <div className="mt-1 text-2xl md:text-3xl font-bold tabular-nums">
              <span className={netBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                {formatPKR(netBalance)}
              </span>
              <span className="text-slate-500 font-normal text-lg ml-2">Remaining</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-sm text-slate-500">Due: {dueLabel}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass}`}>
                {statusUI}
              </span>
            </div>
            {progressTotal > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Repayment progress</span>
                  <span>{Math.round(progressPct)}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky actions */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-end gap-2 p-3 bg-white/95 backdrop-blur border-b border-slate-200 shrink-0">
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
          className="text-green-600 bg-green-50 hover:bg-green-100 border-green-200"
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
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Transaction history</h3>
        {transactions.length === 0 ? (
          <p className="text-slate-500 text-sm">No transactions yet.</p>
        ) : (
          <div className="relative space-y-0">
            {/* vertical line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />
            {transactions.map((tx, i) => {
              const isInflow = tx.receive > 0;
              return (
                <div key={tx.id} className="relative flex gap-4 pb-6 last:pb-0">
                  <div
                    className={`relative z-10 w-6 h-6 rounded-full shrink-0 mt-0.5 ${
                      isInflow ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0 pt-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <div>
                        <span className={isInflow ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
                          {isInflow ? `+ ${formatPKR(tx.receive)}` : `− ${formatPKR(tx.give)}`}
                        </span>
                        <span className="text-slate-600 ml-2">
                          {isInflow ? 'Received' : 'Given'}
                        </span>
                        {tx.description && (
                          <p className="text-slate-500 text-sm mt-0.5 truncate max-w-md">{tx.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="text-sm text-slate-500 tabular-nums">{formatDate(tx.date)}</div>
                        <div className={`text-sm font-semibold tabular-nums ${tx.balance > 0 ? 'text-rose-600' : tx.balance < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                          Balance: {formatPKR(tx.balance)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditLoan(tx.id)}
                      className="mt-1 text-xs text-blue-600 hover:underline"
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
}

export const LoanDetailEmpty: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl border border-slate-200 p-8">
    <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4">
      <span className="text-2xl text-slate-400">👤</span>
    </div>
    <p className="text-slate-600 font-medium">Select a contact to view loan details</p>
    <p className="text-sm mt-1">Choose a lender or borrower from the list</p>
  </div>
);
