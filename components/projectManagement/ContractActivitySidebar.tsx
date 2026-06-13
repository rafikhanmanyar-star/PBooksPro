import React, { useMemo } from 'react';
import type { Bill, Contract, Transaction } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import {
  buildContractRetentionSummary,
  getContractPaidFromTransactions,
} from '../../utils/contractRetention';
import { retentionStatusBadge } from './ContractRetentionUI';
import { ContractDocumentAttachmentPanel } from './ContractDocumentUI';

export type ContractActivityType =
  | 'bill_created'
  | 'bill_updated'
  | 'bill_payment'
  | 'direct_payment';

export type ContractActivityItem = {
  id: string;
  date: string;
  timestamp: number;
  type: ContractActivityType;
  title: string;
  subtitle?: string;
  amount?: number;
  statusLabel?: string;
  statusTone?: 'success' | 'warning' | 'danger' | 'muted';
};

export function buildContractActivity(
  contractId: string,
  bills: Bill[],
  transactions: Transaction[]
): ContractActivityItem[] {
  const contractBills = bills.filter((b) => b.contractId === contractId);
  const billIds = new Set(contractBills.map((b) => b.id));
  const billById = new Map(contractBills.map((b) => [b.id, b]));
  const events: ContractActivityItem[] = [];

  for (const bill of contractBills) {
    events.push({
      id: `bill-${bill.id}`,
      date: bill.issueDate,
      timestamp: new Date(bill.issueDate).getTime() || 0,
      type: 'bill_created',
      title: `Bill #${bill.billNumber}`,
      subtitle: bill.description?.trim() || 'Vendor bill created',
      amount: bill.amount,
      statusLabel: bill.status,
      statusTone:
        bill.status === 'Paid'
          ? 'success'
          : bill.status === 'Partial'
            ? 'warning'
            : bill.status === 'Overdue'
              ? 'danger'
              : 'muted',
    });
  }

  for (const tx of transactions) {
    const linkedToContract =
      tx.contractId === contractId || (tx.billId && billIds.has(tx.billId));
    if (!linkedToContract) continue;

    const bill = tx.billId ? billById.get(tx.billId) : undefined;
    events.push({
      id: `tx-${tx.id}`,
      date: tx.date,
      timestamp: new Date(tx.date).getTime() || 0,
      type: bill ? 'bill_payment' : 'direct_payment',
      title: bill ? `Payment — Bill #${bill.billNumber}` : 'Contract payment',
      subtitle: tx.description?.trim() || tx.reference?.trim() || undefined,
      amount: tx.amount,
      statusLabel: 'Paid',
      statusTone: 'success',
    });
  }

  return events
    .filter((e) => Number.isFinite(e.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function activityIcon(type: ContractActivityType) {
  switch (type) {
    case 'bill_created':
    case 'bill_updated':
      return ICONS.fileText;
    case 'bill_payment':
    case 'direct_payment':
      return ICONS.dollarSign;
    default:
      return ICONS.activity;
  }
}

function toneClass(tone?: ContractActivityItem['statusTone']) {
  switch (tone) {
    case 'success':
      return 'text-ds-success bg-ds-success/10 border-ds-success/20';
    case 'warning':
      return 'text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20';
    case 'danger':
      return 'text-ds-danger bg-ds-danger/10 border-ds-danger/20';
    default:
      return 'text-app-muted bg-app-toolbar border-app-border';
  }
}

type ContractActivitySidebarProps = {
  contract: Contract | null;
  bills: Bill[];
  transactions: Transaction[];
  projectName?: string;
  vendorName?: string;
  mode?: 'view' | 'edit' | 'create';
  compact?: boolean;
  maxActivityItems?: number;
};

export const ContractActivitySidebar: React.FC<ContractActivitySidebarProps> = ({
  contract,
  bills,
  transactions,
  projectName,
  vendorName,
  mode = 'view',
  compact = false,
  maxActivityItems = 20,
}) => {
  const contractId = contract?.id;
  const isPreview = !contractId || contractId === 'preview' || mode === 'create';

  const linkedBills = useMemo(
    () => (contractId && !isPreview ? bills.filter((b) => b.contractId === contractId) : []),
    [bills, contractId, isPreview]
  );

  const activity = useMemo(
    () =>
      contractId && !isPreview
        ? buildContractActivity(contractId, bills, transactions).slice(0, maxActivityItems)
        : [],
    [contractId, bills, transactions, isPreview, maxActivityItems]
  );

  const paidAmount = useMemo(
    () =>
      contractId && !isPreview
        ? getContractPaidFromTransactions(transactions, contractId)
        : 0,
    [contractId, transactions, isPreview]
  );

  const retentionSummary = useMemo(
    () => (contract ? buildContractRetentionSummary(contract, paidAmount) : null),
    [contract, paidAmount]
  );

  const retentionBadge = contract && !isPreview ? retentionStatusBadge(contract, paidAmount) : null;

  const billedTotal = linkedBills.reduce((s, b) => s + (b.amount || 0), 0);
  const billPaidTotal = linkedBills.reduce((s, b) => s + (b.paidAmount || 0), 0);

  if (!contract) {
    return (
      <div className="rounded-xl border border-app-border bg-app-card p-4 text-sm text-app-muted italic">
        Select project and vendor to preview contract summary.
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${compact ? 'text-sm' : ''}`}>
      {/* Contract information */}
      <div className="rounded-xl border border-app-border bg-app-card overflow-hidden">
        <div className="px-3 py-2.5 border-b border-app-border bg-app-toolbar">
          <h4 className="text-xs font-bold text-app-muted uppercase tracking-wider">
            Contract Information
          </h4>
        </div>
        <div className="p-3 space-y-3">
          <div>
            <p className="font-mono text-[10px] text-app-muted">{contract.contractNumber}</p>
            <p className="font-semibold text-app-text leading-tight">{contract.name || '—'}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-app-muted block uppercase tracking-wide text-[10px]">Project</span>
              <span className="text-app-text font-medium">{projectName || '—'}</span>
            </div>
            <div>
              <span className="text-app-muted block uppercase tracking-wide text-[10px]">Vendor</span>
              <span className="text-app-text font-medium truncate block">{vendorName || '—'}</span>
            </div>
            <div>
              <span className="text-app-muted block uppercase tracking-wide text-[10px]">Value</span>
              <span className="text-app-text font-bold tabular-nums">
                {CURRENCY} {(contract.totalAmount ?? 0).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-app-muted block uppercase tracking-wide text-[10px]">Status</span>
              <span
                className={`font-semibold ${
                  contract.status === 'Active' ? 'text-ds-success' : 'text-app-muted'
                }`}
              >
                {contract.status}
              </span>
            </div>
          </div>

          {!isPreview && (
            <ContractDocumentAttachmentPanel contract={contract} compact className="no-print" />
          )}

          {!isPreview && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-app-border text-xs">
              <div>
                <span className="text-app-muted block text-[10px] uppercase">Bills</span>
                <span className="font-medium text-app-text">{linkedBills.length}</span>
              </div>
              <div>
                <span className="text-app-muted block text-[10px] uppercase">Billed</span>
                <span className="font-medium tabular-nums text-app-text">
                  {CURRENCY} {billedTotal.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {retentionSummary && (contract.retentionType ?? 'NONE') !== 'NONE' ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-app-muted uppercase text-[10px] font-bold tracking-wide">
                  Retention & Payable
                </span>
                {retentionBadge && !isPreview && (
                  <span
                    className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${retentionBadge.className}`}
                  >
                    {retentionBadge.label}
                  </span>
                )}
              </div>

              {contract.retentionType === 'PERCENTAGE' && contract.retentionPercentage != null && (
                <div className="flex justify-between tabular-nums">
                  <span className="text-app-muted">Retention %</span>
                  <span className="font-medium text-app-text">{contract.retentionPercentage}%</span>
                </div>
              )}

              <div className="flex justify-between tabular-nums">
                <span className="text-app-muted">Retention amount</span>
                <span className="font-semibold text-app-text">
                  {CURRENCY} {retentionSummary.retentionAmount.toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between tabular-nums">
                <span className="text-app-muted">Retention held</span>
                <span className="font-semibold text-app-text">
                  {CURRENCY} {retentionSummary.retentionHeld.toLocaleString()}
                </span>
              </div>

              <div className="border-t border-app-border/60 pt-2 space-y-1.5">
                <div className="flex justify-between tabular-nums">
                  <span className="text-app-muted">Paid</span>
                  <span className="font-bold text-ds-success">
                    {CURRENCY} {retentionSummary.paidAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between tabular-nums">
                  <span className="text-app-muted">Max payable</span>
                  <span className="font-semibold text-app-text">
                    {CURRENCY} {retentionSummary.maximumPayable.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between tabular-nums">
                  <span className="text-app-muted">Remaining payable</span>
                  <span
                    className={`font-bold ${
                      retentionSummary.remainingPayable <= 0
                        ? 'text-ds-danger'
                        : retentionSummary.alertLevel === 'warning'
                          ? 'text-amber-600 dark:text-amber-300'
                          : 'text-ds-success'
                    }`}
                  >
                    {CURRENCY} {retentionSummary.remainingPayable.toLocaleString()}
                  </span>
                </div>
              </div>

              {!isPreview && retentionSummary.maximumPayable > 0 && (
                <div className="pt-1">
                  <div className="flex justify-between text-[10px] text-app-muted mb-1">
                    <span>Payable used</span>
                    <span className="tabular-nums">
                      {Math.min(
                        100,
                        Math.round((retentionSummary.paidAmount / retentionSummary.maximumPayable) * 100)
                      )}
                      %
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-app-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        retentionSummary.alertLevel === 'critical'
                          ? 'bg-ds-danger'
                          : retentionSummary.alertLevel === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-ds-success'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (retentionSummary.paidAmount / retentionSummary.maximumPayable) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            !isPreview && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-app-border text-xs">
                <div>
                  <span className="text-app-muted block text-[10px] uppercase">Paid</span>
                  <span className="font-semibold text-ds-success tabular-nums">
                    {CURRENCY} {paidAmount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-app-muted block text-[10px] uppercase">Remaining</span>
                  <span className="font-semibold tabular-nums text-app-text">
                    {CURRENCY}{' '}
                    {Math.max(0, (contract.totalAmount ?? 0) - paidAmount).toLocaleString()}
                  </span>
                </div>
              </div>
            )
          )}

          {isPreview && retentionSummary && (contract.retentionType ?? 'NONE') === 'NONE' && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-app-border text-xs">
              <div>
                <span className="text-app-muted block text-[10px] uppercase">Est. value</span>
                <span className="font-semibold tabular-nums text-app-text">
                  {CURRENCY} {(contract.totalAmount ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {isPreview && (
            <p className="text-[11px] text-app-muted italic border-t border-app-border pt-2">
              Save the contract to link bills and track payments here.
            </p>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-app-border bg-app-card overflow-hidden flex flex-col min-h-0">
        <div className="px-3 py-2.5 border-b border-app-border bg-app-toolbar flex items-center justify-between">
          <h4 className="text-xs font-bold text-app-muted uppercase tracking-wider">
            Recent Activity
          </h4>
          {!isPreview && activity.length > 0 && (
            <span className="text-[10px] text-app-muted">{activity.length}</span>
          )}
        </div>

        <div className="p-2 max-h-[320px] overflow-y-auto">
          {isPreview ? (
            <p className="text-xs text-app-muted italic px-2 py-6 text-center">
              Bill creation and payment history will appear after the contract is saved.
            </p>
          ) : activity.length === 0 ? (
            <p className="text-xs text-app-muted italic px-2 py-6 text-center">
              No bills or payments linked to this contract yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {activity.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-2.5 p-2 rounded-lg hover:bg-app-table-hover transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-app-toolbar border border-app-border flex items-center justify-center shrink-0 text-app-muted">
                    <div className="w-3.5 h-3.5">{activityIcon(item.type)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-app-text leading-tight truncate">
                        {item.title}
                      </p>
                      {item.amount != null && (
                        <span className="text-xs font-bold tabular-nums text-app-text shrink-0">
                          {CURRENCY} {item.amount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="text-[10px] text-app-muted truncate mt-0.5">{item.subtitle}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] text-app-muted">{formatDate(item.date)}</span>
                      {item.statusLabel && (
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${toneClass(item.statusTone)}`}
                        >
                          {item.statusLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!isPreview && linkedBills.length > 0 && billPaidTotal < billedTotal && (
          <div className="px-3 py-2 border-t border-app-border bg-app-toolbar text-[10px] text-app-muted">
            Outstanding on bills:{' '}
            <span className="font-semibold text-app-text tabular-nums">
              {CURRENCY} {(billedTotal - billPaidTotal).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContractActivitySidebar;
