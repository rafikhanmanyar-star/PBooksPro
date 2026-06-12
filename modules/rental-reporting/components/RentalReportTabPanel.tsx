import React, { useMemo } from 'react';
import { SmartTable, type SmartColumnDef } from '../../../components/erp/SmartTable';
import type { RentalReportTab } from '../../../types/rentalReporting.types';
import { CURRENCY } from '../../../constants';
import { formatDate } from '../../../utils/dateUtils';

const money = (v: unknown) =>
  `${CURRENCY} ${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function entityCell(name: string, id: string | undefined, onClick?: (id: string) => void) {
  if (!id || !onClick) return name;
  return (
    <button type="button" className="text-left text-primary hover:underline font-medium" onClick={() => onClick(id)}>
      {name}
    </button>
  );
}

export const RentalReportTabPanel: React.FC<{
  tab: RentalReportTab;
  rows: Record<string, unknown>[];
  loading?: boolean;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onRowClick?: (tenantId: string) => void;
}> = ({ tab, rows, loading, totalCount, page, pageSize, onPageChange, onRowClick }) => {
  const columns = useMemo(() => buildColumns(tab, onRowClick), [tab, onRowClick]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-3">
      <SmartTable
        columns={columns}
        data={rows}
        getRowId={(row, i) => String(row.id ?? i)}
        loading={loading}
        virtualize
        virtualizeThreshold={40}
        tableHeight={420}
        className="rounded-xl border border-app-border overflow-hidden"
      />
      {tab !== 'collection-performance' && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-app-muted no-print">
          <span>Page {page} of {totalPages} · {totalCount.toLocaleString()} rows</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="px-2 py-1 rounded border border-app-border disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="px-2 py-1 rounded border border-app-border disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

function buildColumns(tab: RentalReportTab, onRowClick?: (id: string) => void): SmartColumnDef<Record<string, unknown>>[] {
  const str = (r: Record<string, unknown>, k: string) => String(r[k] ?? '');
  const num = (r: Record<string, unknown>, k: string) => Number(r[k] ?? 0);

  switch (tab) {
    case 'ledger':
      return [
        { id: 'date', header: 'Date', accessor: (r) => r.date, format: (v) => formatDate(String(v)) },
        { id: 'tenant', header: 'Tenant', accessor: (r) => r.tenantName, render: (r) => entityCell(str(r, 'tenantName'), str(r, 'tenantId'), onRowClick) },
        { id: 'property', header: 'Property', accessor: (r) => r.propertyName },
        { id: 'building', header: 'Building', accessor: (r) => r.buildingName },
        { id: 'particulars', header: 'Particulars', accessor: (r) => r.particulars },
        { id: 'debit', header: 'Debit', accessor: (r) => r.debit, numeric: true, align: 'right', format: money },
        { id: 'credit', header: 'Credit', accessor: (r) => r.credit, numeric: true, align: 'right', format: money },
        { id: 'balance', header: 'Balance', accessor: (r) => r.balance, numeric: true, align: 'right', format: money },
      ];
    case 'receivable':
      return [
        { id: 'tenant', header: 'Tenant', accessor: (r) => r.tenantName, render: (r) => entityCell(str(r, 'tenantName'), str(r, 'tenantId'), onRowClick) },
        { id: 'property', header: 'Property', accessor: (r) => r.propertyName },
        { id: 'building', header: 'Building', accessor: (r) => r.buildingName },
        { id: 'agreement', header: 'Agreement', accessor: (r) => r.agreementNo },
        { id: 'outstanding', header: 'Outstanding', accessor: (r) => r.outstanding, numeric: true, align: 'right', format: money },
        { id: 'overdue', header: 'Overdue', accessor: (r) => r.overdueAmount, numeric: true, align: 'right', format: money },
        { id: 'status', header: 'Status', accessor: (r) => r.status },
      ];
    case 'defaulters':
      return [
        { id: 'tenant', header: 'Tenant', accessor: (r) => r.tenantName, render: (r) => entityCell(str(r, 'tenantName'), str(r, 'tenantId'), onRowClick) },
        { id: 'property', header: 'Property', accessor: (r) => r.propertyName },
        { id: 'overdueInst', header: 'Overdue invoices', accessor: (r) => r.overdueInvoices, align: 'right' },
        { id: 'overdueAmt', header: 'Overdue amount', accessor: (r) => r.overdueAmount, numeric: true, align: 'right', format: money },
        { id: 'oldest', header: 'Oldest due', accessor: (r) => r.oldestDueDate, format: (v) => formatDate(String(v)) },
        { id: 'days', header: 'Days past due', accessor: (r) => r.daysPastDue, align: 'right' },
      ];
    case 'schedule':
      return [
        { id: 'tenant', header: 'Tenant', accessor: (r) => r.tenantName, render: (r) => entityCell(str(r, 'tenantName'), str(r, 'tenantId'), onRowClick) },
        { id: 'property', header: 'Property', accessor: (r) => r.propertyName },
        { id: 'invoice', header: 'Invoice', accessor: (r) => r.invoiceNumber },
        { id: 'due', header: 'Due date', accessor: (r) => r.dueDate, format: (v) => formatDate(String(v)) },
        { id: 'amount', header: 'Amount', accessor: (r) => r.amount, numeric: true, align: 'right', format: money },
        { id: 'balance', header: 'Balance', accessor: (r) => r.balance, numeric: true, align: 'right', format: money },
        { id: 'status', header: 'Status', accessor: (r) => r.status },
      ];
    case 'collection-performance':
      return [
        { id: 'period', header: 'Period', accessor: (r) => r.label },
        { id: 'due', header: 'Due', accessor: (r) => r.due, numeric: true, align: 'right', format: money },
        { id: 'collected', header: 'Collected', accessor: (r) => r.collected, numeric: true, align: 'right', format: money },
        { id: 'outstanding', header: 'Outstanding', accessor: (r) => r.outstanding, numeric: true, align: 'right', format: money },
        { id: 'rate', header: 'Collection %', accessor: (r) => r.collectionRate, align: 'right', format: (v) => `${Number(v).toFixed(1)}%` },
      ];
    default:
      return [];
  }
}
