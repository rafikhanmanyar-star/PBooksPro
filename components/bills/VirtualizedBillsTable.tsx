import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { Account, Bill, Document, Transaction, Vendor } from '../../types';
import type { VendorBillSettlementRow } from '../../services/api/contractorApi';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { openDocumentById } from '../../services/documentUploadService';
import type { BillsSortKey, BillsTableRow } from './billsTableTypes';

const ROW_HEIGHT = 52;
const OVERSCAN_COUNT = 6;
const MIN_TABLE_WIDTH = 1040;

function billStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Paid':
      return 'ds-badge-paid';
    case 'Unpaid':
      return 'ds-badge-unpaid';
    case 'Partially Paid':
      return 'ds-badge-partial';
    case 'Overdue':
      return 'ds-badge-overdue';
    default:
      return 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-app-surface-2 text-app-muted border border-app-border';
  }
}

export interface VirtualizedBillsTableProps {
  rows: BillsTableRow[];
  sortConfig: { key: BillsSortKey; direction: 'asc' | 'desc' };
  onSort: (key: BillsSortKey) => void;
  selectedBillIds: Set<string>;
  onToggleBillSelection: (billId: string) => void;
  accountMap: Map<string, Account>;
  vendorMap: Map<string, Vendor>;
  documents: Document[];
  showAlert: (message: string) => void;
  onEditBill: (bill: Bill) => void;
  onRecordPayment: (bill: Bill) => void;
  onSendWhatsApp: (e: React.MouseEvent, bill: Bill) => void;
  onEditPayment: (payment: Transaction) => void;
  onEditSettlement: (settlement: VendorBillSettlementRow, vendor: Vendor) => void;
}

type BillsRowExtra = {
  rows: BillsTableRow[];
  selectedBillIds: Set<string>;
  onToggleBillSelection: (billId: string) => void;
  accountMap: Map<string, Account>;
  vendorMap: Map<string, Vendor>;
  documents: Document[];
  showAlert: (message: string) => void;
  onEditBill: (bill: Bill) => void;
  onRecordPayment: (bill: Bill) => void;
  onSendWhatsApp: (e: React.MouseEvent, bill: Bill) => void;
  onEditPayment: (payment: Transaction) => void;
  onEditSettlement: (settlement: VendorBillSettlementRow, vendor: Vendor) => void;
};

const SortIcon: React.FC<{
  column: BillsSortKey;
  sortConfig: VirtualizedBillsTableProps['sortConfig'];
}> = ({ column, sortConfig }) => {
  if (sortConfig.key !== column) return <span className="text-app-muted/50 ml-1 text-[10px]">↕</span>;
  return <span className="text-ds-primary ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
};

const BillsTableRowView = memo(function BillsTableRowView(props: RowComponentProps<BillsRowExtra>) {
  const {
    index,
    style,
    ariaAttributes,
    rows,
    selectedBillIds,
    onToggleBillSelection,
    accountMap,
    vendorMap,
    documents,
    showAlert,
    onEditBill,
    onRecordPayment,
    onSendWhatsApp,
    onEditPayment,
    onEditSettlement,
  } = props;

  const row = rows[index];
  if (!row) {
    return <div style={style} aria-hidden />;
  }

  const stripe = index % 2 === 1 ? 'ds-fin-row-stripe' : '';
  const rowBase = `ds-fin-row group flex items-center text-xs border-b border-app-border overflow-hidden ${stripe}`;
  const cell = 'px-3 py-2 shrink-0 overflow-hidden';
  const rowStyle: React.CSSProperties = { ...style, minWidth: MIN_TABLE_WIDTH, width: '100%' };

  if (row.type === 'bill' && row.bill) {
    const bill = row.bill;
    return (
      <div
        {...ariaAttributes}
        className={`${rowBase} cursor-pointer`}
        style={rowStyle}
        onClick={() => onEditBill(bill)}
      >
        <div className={`${cell} w-10 text-center`} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select bill ${bill.billNumber}`}
            className="rounded text-ds-primary focus:ring-ds-primary border-app-border w-3.5 h-3.5 cursor-pointer transition-all"
            checked={selectedBillIds.has(bill.id)}
            onChange={(e) => {
              e.stopPropagation();
              onToggleBillSelection(bill.id);
            }}
          />
        </div>
        <div className={`${cell} w-[72px]`}>
          <span className="ds-pill-type">Bill</span>
        </div>
        <div className={`${cell} w-[88px] text-app-muted whitespace-nowrap`}>{formatDate(row.date)}</div>
        <div className={`${cell} w-[100px]`}>
          <div className="font-mono text-[10px] font-medium text-app-muted bg-app-surface-2 px-1.5 py-0.5 rounded-md border border-app-border inline-block truncate max-w-full">
            {row.billNumber}
          </div>
        </div>
        <div className={`${cell} flex-1 min-w-[120px]`}>
          <div className="font-semibold text-app-text leading-tight group-hover:text-ds-primary transition-colors truncate">
            {row.projectName}
          </div>
          <div className="text-[10px] text-app-muted font-medium uppercase tracking-tight mt-0.5 truncate">
            {row.contractNumber || 'No Contract'}
          </div>
        </div>
        <div className={`${cell} w-[140px]`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-app-surface-2 flex items-center justify-center text-[10px] font-bold text-app-muted border border-app-border shrink-0">
              {(row.vendorName || 'U')[0]}
            </div>
            <span className="text-app-text font-medium truncate">{row.vendorName}</span>
          </div>
        </div>
        <div className={`${cell} w-[100px] text-right font-semibold text-app-text tabular-nums`}>
          {CURRENCY} {(row.amount || 0).toLocaleString()}
        </div>
        <div className={`${cell} w-[120px] text-center`}>
          <div className="flex items-center justify-center gap-2">
            {row.status && <span className={billStatusBadgeClass(row.status)}>{row.status}</span>}
            {bill.paidAmount > 0 && (
              <button
                type="button"
                onClick={(e) => onSendWhatsApp(e, bill)}
                className="text-ds-success hover:text-ds-success p-1 rounded-full hover:bg-app-table-hover transition-all opacity-0 group-hover:opacity-100"
              >
                <div className="w-3.5 h-3.5">{ICONS.whatsapp}</div>
              </button>
            )}
          </div>
        </div>
        <div className={`${cell} w-[130px] text-right`}>
          <div className="flex items-center justify-end gap-2">
            <span
              className={`font-bold tabular-nums ${(row.balance || 0) > 0.01 ? 'text-ds-danger' : 'text-app-muted font-normal'}`}
            >
              {CURRENCY} {Math.abs(row.balance || 0).toLocaleString()}
            </span>
            {(row.balance || 0) > 0.01 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRecordPayment(bill);
                }}
                className="text-ds-on-primary bg-ds-primary hover:bg-ds-primary-hover px-2 py-0.5 rounded text-[10px] font-bold transition-all shadow-sm shrink-0"
              >
                Pay
              </button>
            )}
          </div>
        </div>
        <div className={`${cell} w-10 text-center`}>
          {(bill.documentId || bill.documentPath) && (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                if (bill.documentId) {
                  await openDocumentById(bill.documentId, documents, (url) => window.open(url, '_blank'), showAlert);
                } else if (bill.documentPath) {
                  const electronAPI = (window as { electronAPI?: { openDocumentFile?: (opts: { filePath: string }) => Promise<void> } })
                    .electronAPI;
                  if (electronAPI?.openDocumentFile) {
                    electronAPI.openDocumentFile({ filePath: bill.documentPath }).catch((err: unknown) =>
                      console.error('Error opening document:', err)
                    );
                  }
                }
              }}
              className="text-app-muted hover:text-ds-primary transition-colors"
              title="View Document"
            >
              <div className="w-4 h-4">{ICONS.fileText}</div>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (row.type === 'payment' && row.payment && row.bill) {
    const payment = row.payment;
    const account = payment.accountId ? accountMap.get(payment.accountId) : undefined;
    return (
      <div
        {...ariaAttributes}
        className={`${rowBase} cursor-pointer`}
        style={rowStyle}
        onClick={() => onEditPayment(payment)}
      >
        <div className={`${cell} w-10`} />
        <div className={`${cell} w-[72px]`}>
          <span className="ds-pill-type-payment">Payment</span>
        </div>
        <div className={`${cell} w-[88px] text-app-muted whitespace-nowrap italic`}>{formatDate(row.date)}</div>
        <div className={`${cell} w-[100px]`}>
          <div className="text-[10px] text-app-muted font-medium px-1.5 py-0.5 inline-block truncate">
            linked to {row.billNumber}
          </div>
        </div>
        <div className={`${cell} flex-1 min-w-[120px] text-app-muted truncate`}>{row.projectName}</div>
        <div className={`${cell} w-[140px] text-app-muted italic truncate`}>{row.vendorName}</div>
        <div className={`${cell} w-[100px] text-right font-medium text-ds-success tabular-nums`}>
          {CURRENCY} {(row.amount || 0).toLocaleString()}
        </div>
        <div className={`${cell} w-[120px] text-center`}>
          <span className="text-[10px] font-medium text-app-muted uppercase tracking-tighter truncate block">
            {account?.name || 'Cash/Bank'}
          </span>
        </div>
        <div className={`${cell} w-[130px] text-right italic text-app-muted tabular-nums`}>
          {CURRENCY} {(row.amount || 0).toLocaleString()}
        </div>
        <div className={`${cell} w-10`} />
      </div>
    );
  }

  if (row.type === 'vendor_settlement' && row.vendorSettlement && row.bill) {
    const vs = row.vendorSettlement;
    const bill = row.bill;
    const advPart = vs.adjustments?.reduce((s, x) => s + x.amount, 0) ?? Math.max(0, vs.totalAmount - vs.cashAmount);
    return (
      <div
        {...ariaAttributes}
        className={`${rowBase} cursor-pointer`}
        style={rowStyle}
        title="Open to view or edit prepaid and bank amounts"
        onClick={() => {
          const v = bill.vendorId ? vendorMap.get(bill.vendorId) : undefined;
          if (!v || !bill.vendorId) {
            showAlert('Could not find vendor for this settlement.');
            return;
          }
          onEditSettlement(vs, v);
        }}
      >
        <div className={`${cell} w-10`} />
        <div className={`${cell} w-[72px]`}>
          <span className="inline-flex px-1.5 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-tight bg-app-highlight text-ds-primary border border-app-border">
            Settlement
          </span>
        </div>
        <div className={`${cell} w-[88px] text-app-text whitespace-nowrap`}>{formatDate(row.date)}</div>
        <div className={`${cell} w-[100px]`}>
          <div className="text-[10px] text-app-muted font-medium px-1.5 py-0.5 inline-block truncate">
            Bill #{row.billNumber}
          </div>
        </div>
        <div className={`${cell} flex-1 min-w-[120px] text-app-text truncate`}>{row.projectName}</div>
        <div className={`${cell} w-[140px] text-app-text truncate`}>{row.vendorName}</div>
        <div className={`${cell} w-[100px] text-right font-semibold text-ds-primary tabular-nums`}>
          {CURRENCY} {(row.amount || 0).toLocaleString()}
          <span className="block text-[9px] font-normal text-app-muted normal-case tracking-normal truncate">
            prepaid {CURRENCY} {advPart.toLocaleString()} · bank {CURRENCY} {vs.cashAmount.toLocaleString()}
          </span>
        </div>
        <div className={`${cell} w-[120px] text-center`}>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-app-highlight text-ds-primary border border-app-border">
            {row.status}
          </span>
        </div>
        <div className={`${cell} w-[130px] text-right italic text-app-muted tabular-nums`}>
          {CURRENCY} {(row.amount || 0).toLocaleString()}
        </div>
        <div className={`${cell} w-10`} />
      </div>
    );
  }

  if (row.type === 'advance' && row.advance) {
    const adv = row.advance;
    const rem = adv.remainingAmount ?? 0;
    const fullyApplied = rem <= 0.015 || row.status === 'Fully applied';
    const desc = (adv.description || '').trim();
    return (
      <div
        {...ariaAttributes}
        className={`${rowBase} ${fullyApplied ? '' : 'bg-app-highlight/30'}`}
        style={rowStyle}
      >
        <div className={`${cell} w-10 text-center`} />
        <div className={`${cell} w-[72px]`}>
          <span
            className={`inline-flex px-1.5 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-tight border ${
              fullyApplied
                ? 'bg-app-surface-2 text-app-muted border-app-border'
                : 'bg-app-highlight text-ds-warning border-app-border'
            }`}
          >
            Advance
          </span>
        </div>
        <div className={`${cell} w-[88px] text-app-text whitespace-nowrap`}>{formatDate(row.date)}</div>
        <div className={`${cell} w-[100px]`}>
          <div
            className={`font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-md border inline-block truncate max-w-full ${
              fullyApplied
                ? 'text-app-muted bg-app-surface-2 border-app-border'
                : 'text-ds-warning bg-app-highlight border-app-border'
            }`}
          >
            {row.billNumber}
          </div>
        </div>
        <div className={`${cell} flex-1 min-w-[120px] text-app-text truncate`}>{row.projectName}</div>
        <div className={`${cell} w-[140px] text-app-text truncate`}>{row.vendorName}</div>
        <div className={`${cell} w-[100px] text-right font-semibold text-app-text tabular-nums`}>
          {CURRENCY} {(row.amount || 0).toLocaleString()}
        </div>
        <div className={`${cell} w-[120px] text-center`}>
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              fullyApplied
                ? 'bg-app-surface-2 text-app-muted border-app-border'
                : 'bg-app-highlight text-ds-warning border-app-border'
            }`}
          >
            {fullyApplied ? 'Fully applied' : 'Prepaid'}
          </span>
        </div>
        <div className={`${cell} w-[130px] text-right`}>
          <div className={`font-bold tabular-nums ${fullyApplied ? 'text-app-muted' : 'text-ds-warning'}`}>
            {CURRENCY} {rem.toLocaleString()}
            <span className="block text-[9px] font-normal text-app-muted normal-case tracking-normal">
              {fullyApplied ? 'remaining prepaid' : 'remaining'}
            </span>
          </div>
          {desc ? (
            <p className="text-[10px] text-app-muted truncate text-right leading-snug" title={desc}>
              {desc}
            </p>
          ) : null}
        </div>
        <div className={`${cell} w-10`} />
      </div>
    );
  }

  return <div style={style} aria-hidden />;
});

BillsTableRowView.displayName = 'BillsTableRowView';

const VirtualizedBillsTable: React.FC<VirtualizedBillsTableProps> = ({
  rows,
  sortConfig,
  onSort,
  selectedBillIds,
  onToggleBillSelection,
  accountMap,
  vendorMap,
  documents,
  showAlert,
  onEditBill,
  onRecordPayment,
  onSendWhatsApp,
  onEditPayment,
  onEditSettlement,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const next = Math.max(ROW_HEIGHT, Math.floor(entry.contentRect.height));
        setHeight(next);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowProps = useMemo(
    () =>
      ({
        rows,
        selectedBillIds,
        onToggleBillSelection,
        accountMap,
        vendorMap,
        documents,
        showAlert,
        onEditBill,
        onRecordPayment,
        onSendWhatsApp,
        onEditPayment,
        onEditSettlement,
      }) satisfies BillsRowExtra,
    [
      rows,
      selectedBillIds,
      onToggleBillSelection,
      accountMap,
      vendorMap,
      documents,
      showAlert,
      onEditBill,
      onRecordPayment,
      onSendWhatsApp,
      onEditPayment,
      onEditSettlement,
    ]
  );

  const thClass =
    'px-3 py-2.5 text-[10px] font-bold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-table-hover border-b border-app-border transition-colors shrink-0';
  const thClassRight = `${thClass} text-right`;
  const thClassCenter = `${thClass} text-center`;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center flex-grow">
        <div className="flex flex-col items-center justify-center text-app-muted opacity-60">
          <div className="w-12 h-12 bg-app-surface-2 rounded-full flex items-center justify-center mb-3">
            <div className="w-6 h-6">{ICONS.fileText}</div>
          </div>
          <p className="text-sm font-medium">No records matching your filters</p>
          <p className="text-xs mt-1">Try adjusting the period, project, or search query</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-grow min-h-0 h-full overflow-hidden">
      <div className="overflow-x-auto flex-shrink-0 bg-app-table-header sticky top-0 z-20 border-b border-app-border">
        <div className="flex min-w-[1040px]" style={{ minWidth: MIN_TABLE_WIDTH }}>
          <div className={`${thClass} w-10 text-center cursor-default hover:bg-app-table-header`} />
          <button type="button" onClick={() => onSort('type')} className={`${thClass} w-[72px] text-left`}>
            Type <SortIcon column="type" sortConfig={sortConfig} />
          </button>
          <button type="button" onClick={() => onSort('issueDate')} className={`${thClass} w-[88px] text-left`}>
            Date <SortIcon column="issueDate" sortConfig={sortConfig} />
          </button>
          <button type="button" onClick={() => onSort('billNumber')} className={`${thClass} w-[100px] text-left`}>
            Ref # <SortIcon column="billNumber" sortConfig={sortConfig} />
          </button>
          <button type="button" onClick={() => onSort('entityName')} className={`${thClass} flex-1 min-w-[120px] text-left`}>
            Project <SortIcon column="entityName" sortConfig={sortConfig} />
          </button>
          <button type="button" onClick={() => onSort('vendorName')} className={`${thClass} w-[140px] text-left`}>
            Vendor <SortIcon column="vendorName" sortConfig={sortConfig} />
          </button>
          <button type="button" onClick={() => onSort('amount')} className={`${thClassRight} w-[100px]`}>
            Amount <SortIcon column="amount" sortConfig={sortConfig} />
          </button>
          <button type="button" onClick={() => onSort('status')} className={`${thClassCenter} w-[120px]`}>
            Status <SortIcon column="status" sortConfig={sortConfig} />
          </button>
          <button type="button" onClick={() => onSort('balance')} className={`${thClassRight} w-[130px]`}>
            Due / Pay <SortIcon column="balance" sortConfig={sortConfig} />
          </button>
          <div className={`${thClass} w-10 cursor-default hover:bg-app-table-header`} />
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 overflow-x-auto">
        <List<BillsRowExtra>
          rowCount={rows.length}
          rowHeight={ROW_HEIGHT}
          overscanCount={OVERSCAN_COUNT}
          rowComponent={BillsTableRowView}
          rowProps={rowProps}
          style={{ height, width: '100%', minWidth: MIN_TABLE_WIDTH }}
        />
      </div>
    </div>
  );
};

export default memo(VirtualizedBillsTable);
