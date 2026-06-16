import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Bill, TenantGoodsReceipt, TenantPurchaseOrder, Transaction } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { fetchGoodsReceipts } from '../../services/goodsReceiptsApi';

export type PoActivityType = 'grn_created' | 'grn_posted' | 'grn_closed' | 'bill_created' | 'bill_payment';

export type PoActivityItem = {
  id: string;
  date: string;
  timestamp: number;
  type: PoActivityType;
  title: string;
  subtitle?: string;
  amount?: number;
  statusLabel?: string;
  statusTone?: 'success' | 'warning' | 'danger' | 'muted';
};

function grnLineTotal(grn: TenantGoodsReceipt): number {
  return (grn.lines ?? []).reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0);
}

export function buildPurchaseOrderActivity(
  purchaseOrderId: string,
  receipts: TenantGoodsReceipt[],
  bills: Bill[],
  transactions: Transaction[]
): PoActivityItem[] {
  const poBills = bills.filter((b) => b.purchaseOrderId === purchaseOrderId);
  const billIds = new Set(poBills.map((b) => b.id));
  const billById = new Map(poBills.map((b) => [b.id, b]));
  const events: PoActivityItem[] = [];

  for (const grn of receipts) {
    const amount = grnLineTotal(grn);
    const date = grn.receivedDate || grn.postedAt || grn.createdAt;
    const type: PoActivityType =
      grn.status === 'Closed' ? 'grn_closed' : grn.status === 'Posted' ? 'grn_posted' : 'grn_created';
    events.push({
      id: `grn-${grn.id}`,
      date,
      timestamp: new Date(date).getTime() || 0,
      type,
      title: `GRN ${grn.grnNumber}`,
      subtitle: grn.notes?.trim() || 'Goods receipt',
      amount,
      statusLabel: grn.status,
      statusTone: grn.status === 'Posted' || grn.status === 'Closed' ? 'success' : 'muted',
    });
  }

  for (const bill of poBills) {
    events.push({
      id: `bill-${bill.id}`,
      date: bill.issueDate,
      timestamp: new Date(bill.issueDate).getTime() || 0,
      type: 'bill_created',
      title: `Bill #${bill.billNumber}`,
      subtitle: bill.description?.trim() || 'Vendor bill',
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
    if (!tx.billId || !billIds.has(tx.billId)) continue;
    const bill = billById.get(tx.billId);
    if (!bill) continue;
    events.push({
      id: `tx-${tx.id}`,
      date: tx.date,
      timestamp: new Date(tx.date).getTime() || 0,
      type: 'bill_payment',
      title: `Payment — Bill #${bill.billNumber}`,
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

function activityIcon(type: PoActivityType) {
  switch (type) {
    case 'grn_created':
    case 'grn_posted':
    case 'grn_closed':
      return ICONS.package;
    case 'bill_created':
      return ICONS.fileText;
    case 'bill_payment':
      return ICONS.dollarSign;
    default:
      return ICONS.activity;
  }
}

function toneClass(tone?: PoActivityItem['statusTone']) {
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

type PurchaseOrderActivitySidebarProps = {
  purchaseOrder: TenantPurchaseOrder;
  bills: Bill[];
  transactions: Transaction[];
  maxActivityItems?: number;
};

const PurchaseOrderActivitySidebar: React.FC<PurchaseOrderActivitySidebarProps> = ({
  purchaseOrder,
  bills,
  transactions,
  maxActivityItems = 25,
}) => {
  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['goods-receipts', { purchaseOrderId: purchaseOrder.id }],
    queryFn: () => fetchGoodsReceipts({ purchaseOrderId: purchaseOrder.id }),
    enabled: !!purchaseOrder.id,
    staleTime: 30_000,
  });

  const linkedBills = useMemo(
    () => bills.filter((b) => b.purchaseOrderId === purchaseOrder.id),
    [bills, purchaseOrder.id]
  );

  const activity = useMemo(
    () =>
      buildPurchaseOrderActivity(purchaseOrder.id, receipts, bills, transactions).slice(
        0,
        maxActivityItems
      ),
    [purchaseOrder.id, receipts, bills, transactions, maxActivityItems]
  );

  const billedTotal = linkedBills.reduce((s, b) => s + (b.amount || 0), 0);
  const billPaidTotal = linkedBills.reduce((s, b) => s + (b.paidAmount || 0), 0);
  const receivedAmount = purchaseOrder.receivedAmount ?? 0;
  const billedAmount = purchaseOrder.billedAmount ?? 0;
  const totalAmount = purchaseOrder.totalAmount ?? 0;

  return (
    <div className="flex flex-col gap-4 h-full text-sm">
      <div className="rounded-xl border border-app-border bg-app-card overflow-hidden shrink-0">
        <div className="px-3 py-2.5 border-b border-app-border bg-app-toolbar">
          <h4 className="text-xs font-bold text-app-muted uppercase tracking-wider">PO Summary</h4>
        </div>
        <div className="p-3 space-y-2 text-xs">
          <div className="flex justify-between tabular-nums">
            <span className="text-app-muted">Order total</span>
            <span className="font-semibold text-app-text">
              {CURRENCY} {totalAmount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between tabular-nums">
            <span className="text-app-muted">Received</span>
            <span className="font-semibold text-app-text">
              {CURRENCY} {receivedAmount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between tabular-nums">
            <span className="text-app-muted">Billed</span>
            <span className="font-semibold text-app-text">
              {CURRENCY} {billedAmount.toLocaleString()}
            </span>
          </div>
          {totalAmount > receivedAmount && (
            <div className="flex justify-between tabular-nums pt-1 border-t border-app-border">
              <span className="text-app-muted">Pending receipt</span>
              <span className="font-semibold text-amber-600 dark:text-amber-300">
                {CURRENCY} {Math.max(0, totalAmount - receivedAmount).toLocaleString()}
              </span>
            </div>
          )}
          {billedTotal > billPaidTotal && (
            <div className="flex justify-between tabular-nums">
              <span className="text-app-muted">Outstanding bills</span>
              <span className="font-semibold text-ds-danger">
                {CURRENCY} {(billedTotal - billPaidTotal).toLocaleString()}
              </span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-app-border text-[10px] text-center">
            <div>
              <span className="block text-app-muted uppercase">GRNs</span>
              <span className="font-bold text-app-text">{receipts.length}</span>
            </div>
            <div>
              <span className="block text-app-muted uppercase">Bills</span>
              <span className="font-bold text-app-text">{linkedBills.length}</span>
            </div>
            <div>
              <span className="block text-app-muted uppercase">Payments</span>
              <span className="font-bold text-app-text">
                {activity.filter((a) => a.type === 'bill_payment').length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-app-border bg-app-card overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="px-3 py-2.5 border-b border-app-border bg-app-toolbar flex items-center justify-between shrink-0">
          <h4 className="text-xs font-bold text-app-muted uppercase tracking-wider">
            Recent Transactions
          </h4>
          {activity.length > 0 && (
            <span className="text-[10px] text-app-muted">{activity.length}</span>
          )}
        </div>

        <div className="p-2 overflow-y-auto flex-1 min-h-0">
          {isLoading ? (
            <p className="text-xs text-app-muted italic px-2 py-6 text-center">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="text-xs text-app-muted italic px-2 py-6 text-center">
              No GRNs, bills, or payments linked to this purchase order yet.
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
      </div>
    </div>
  );
};

export default PurchaseOrderActivitySidebar;
