import React, { useMemo } from 'react';
import { SmartTable, type SmartColumnDef } from '../../../components/erp/SmartTable';
import type {
  CollectionPerformanceRow,
  CustomerLedgerRow,
  CustomerReportTab,
  DefaulterReportRow,
  InstallmentScheduleRow,
  ReceivableReportRow,
} from '../../../types/customerReporting.types';
import { CURRENCY } from '../../../constants';
import { formatDate } from '../../../utils/dateUtils';

const money = (v: unknown) =>
  `${CURRENCY} ${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

type RowUnion =
  | CustomerLedgerRow
  | ReceivableReportRow
  | DefaulterReportRow
  | InstallmentScheduleRow
  | CollectionPerformanceRow;

export const CustomerReportTabPanel: React.FC<{
  tab: CustomerReportTab;
  rows: RowUnion[];
  loading?: boolean;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onRowClick?: (customerId: string) => void;
}> = ({ tab, rows, loading, totalCount, page, pageSize, onPageChange, onRowClick }) => {
  const columns = useMemo(() => buildColumns(tab, onRowClick), [tab, onRowClick]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-3">
      <SmartTable
        columns={columns}
        data={rows}
        getRowId={(row, i) => ('id' in row && row.id ? String(row.id) : String(i))}
        loading={loading}
        virtualize
        virtualizeThreshold={40}
        tableHeight={420}
        className="rounded-xl border border-app-border overflow-hidden"
      />
      {tab !== 'collection-performance' && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-app-muted no-print">
          <span>
            Page {page} of {totalPages} · {totalCount.toLocaleString()} rows
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2 py-1 rounded border border-app-border disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2 py-1 rounded border border-app-border disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function customerCell(
  name: string,
  customerId: string | undefined,
  onRowClick?: (id: string) => void
): React.ReactNode {
  if (!customerId || !onRowClick) return name;
  return (
    <button
      type="button"
      className="text-left text-primary hover:underline font-medium"
      onClick={() => onRowClick(customerId)}
    >
      {name}
    </button>
  );
}

function buildColumns(tab: CustomerReportTab, onRowClick?: (id: string) => void): SmartColumnDef<RowUnion>[] {
  switch (tab) {
    case 'ledger':
      return [
        { id: 'date', header: 'Date', accessor: (r) => (r as CustomerLedgerRow).date, format: (v) => formatDate(String(v)) },
        {
          id: 'customer',
          header: 'Customer',
          accessor: (r) => (r as CustomerLedgerRow).customerName,
          render: (r) => customerCell((r as CustomerLedgerRow).customerName, (r as CustomerLedgerRow).customerId, onRowClick),
        },
        { id: 'unit', header: 'Unit', accessor: (r) => (r as CustomerLedgerRow).unitName },
        { id: 'project', header: 'Project', accessor: (r) => (r as CustomerLedgerRow).projectName },
        { id: 'particulars', header: 'Particulars', accessor: (r) => (r as CustomerLedgerRow).particulars },
        { id: 'debit', header: 'Debit', accessor: (r) => (r as CustomerLedgerRow).debit, numeric: true, align: 'right', format: money },
        { id: 'credit', header: 'Credit', accessor: (r) => (r as CustomerLedgerRow).credit, numeric: true, align: 'right', format: money },
        { id: 'balance', header: 'Balance', accessor: (r) => (r as CustomerLedgerRow).balance, numeric: true, align: 'right', format: money },
      ];
    case 'receivable':
      return [
        {
          id: 'customer',
          header: 'Customer',
          accessor: (r) => (r as ReceivableReportRow).customerName,
          render: (r) => customerCell((r as ReceivableReportRow).customerName, (r as ReceivableReportRow).customerId, onRowClick),
        },
        { id: 'project', header: 'Project', accessor: (r) => (r as ReceivableReportRow).projectName },
        { id: 'units', header: 'Units', accessor: (r) => (r as ReceivableReportRow).unitNames },
        { id: 'agreement', header: 'Agreement', accessor: (r) => (r as ReceivableReportRow).agreementNo },
        { id: 'outstanding', header: 'Outstanding', accessor: (r) => (r as ReceivableReportRow).outstanding, numeric: true, align: 'right', format: money },
        { id: 'overdue', header: 'Overdue', accessor: (r) => (r as ReceivableReportRow).overdueAmount, numeric: true, align: 'right', format: money },
        { id: 'status', header: 'Status', accessor: (r) => (r as ReceivableReportRow).status },
      ];
    case 'defaulters':
      return [
        {
          id: 'customer',
          header: 'Customer',
          accessor: (r) => (r as DefaulterReportRow).customerName,
          render: (r) => customerCell((r as DefaulterReportRow).customerName, (r as DefaulterReportRow).customerId, onRowClick),
        },
        { id: 'project', header: 'Project', accessor: (r) => (r as DefaulterReportRow).projectName },
        { id: 'units', header: 'Units', accessor: (r) => (r as DefaulterReportRow).unitNames },
        { id: 'overdueInst', header: 'Overdue installments', accessor: (r) => (r as DefaulterReportRow).overdueInstallments, align: 'right' },
        { id: 'overdueAmt', header: 'Overdue amount', accessor: (r) => (r as DefaulterReportRow).overdueAmount, numeric: true, align: 'right', format: money },
        { id: 'oldest', header: 'Oldest due', accessor: (r) => (r as DefaulterReportRow).oldestDueDate, format: (v) => formatDate(String(v)) },
        { id: 'days', header: 'Days past due', accessor: (r) => (r as DefaulterReportRow).daysPastDue, align: 'right' },
      ];
    case 'installments':
      return [
        {
          id: 'customer',
          header: 'Customer',
          accessor: (r) => (r as InstallmentScheduleRow).customerName,
          render: (r) => customerCell((r as InstallmentScheduleRow).customerName, (r as InstallmentScheduleRow).customerId, onRowClick),
        },
        { id: 'project', header: 'Project', accessor: (r) => (r as InstallmentScheduleRow).projectName },
        { id: 'unit', header: 'Unit', accessor: (r) => (r as InstallmentScheduleRow).unitName },
        { id: 'invoice', header: 'Invoice', accessor: (r) => (r as InstallmentScheduleRow).invoiceNumber },
        { id: 'due', header: 'Due date', accessor: (r) => (r as InstallmentScheduleRow).dueDate, format: (v) => formatDate(String(v)) },
        { id: 'amount', header: 'Amount', accessor: (r) => (r as InstallmentScheduleRow).amount, numeric: true, align: 'right', format: money },
        { id: 'balance', header: 'Balance', accessor: (r) => (r as InstallmentScheduleRow).balance, numeric: true, align: 'right', format: money },
        { id: 'status', header: 'Status', accessor: (r) => (r as InstallmentScheduleRow).status },
      ];
    case 'collection-performance':
      return [
        { id: 'period', header: 'Period', accessor: (r) => (r as CollectionPerformanceRow).label },
        { id: 'due', header: 'Due', accessor: (r) => (r as CollectionPerformanceRow).due, numeric: true, align: 'right', format: money },
        { id: 'collected', header: 'Collected', accessor: (r) => (r as CollectionPerformanceRow).collected, numeric: true, align: 'right', format: money },
        { id: 'outstanding', header: 'Outstanding', accessor: (r) => (r as CollectionPerformanceRow).outstanding, numeric: true, align: 'right', format: money },
        { id: 'rate', header: 'Collection %', accessor: (r) => (r as CollectionPerformanceRow).collectionRate, align: 'right', format: (v) => `${Number(v).toFixed(1)}%` },
      ];
    default:
      return [];
  }
}
