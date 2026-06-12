import React, { useMemo } from 'react';
import { SmartTable, type SmartColumnDef } from '../../../components/erp/SmartTable';
import type { ConstructionReportTab } from '../../../types/constructionReporting.types';
import { CURRENCY } from '../../../constants';
import { formatDate } from '../../../utils/dateUtils';

const money = (v: unknown) => `${CURRENCY} ${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function vendorCell(name: string, id: string | undefined, onClick?: (id: string) => void) {
  if (!id || !onClick) return name;
  return <button type="button" className="text-left text-primary hover:underline font-medium" onClick={() => onClick(id)}>{name}</button>;
}

export const ConstructionReportTabPanel: React.FC<{
  tab: ConstructionReportTab;
  rows: Record<string, unknown>[];
  loading?: boolean;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onRowClick?: (vendorId: string) => void;
}> = ({ tab, rows, loading, totalCount, page, pageSize, onPageChange, onRowClick }) => {
  const columns = useMemo(() => buildColumns(tab, onRowClick), [tab, onRowClick]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-3">
      <SmartTable columns={columns} data={rows} getRowId={(r, i) => String(r.id ?? i)} loading={loading} virtualize virtualizeThreshold={40} tableHeight={420} className="rounded-xl border border-app-border overflow-hidden" />
      {tab !== 'payment-performance' && totalPages > 1 && (
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

function buildColumns(tab: ConstructionReportTab, onRowClick?: (id: string) => void): SmartColumnDef<Record<string, unknown>>[] {
  const s = (r: Record<string, unknown>, k: string) => String(r[k] ?? '');
  switch (tab) {
    case 'ledger':
      return [
        { id: 'date', header: 'Date', accessor: (r) => r.date, format: (v) => formatDate(String(v)) },
        { id: 'vendor', header: 'Vendor', accessor: (r) => r.vendorName, render: (r) => vendorCell(s(r, 'vendorName'), s(r, 'vendorId'), onRowClick) },
        { id: 'project', header: 'Project', accessor: (r) => r.projectName },
        { id: 'particulars', header: 'Particulars', accessor: (r) => r.particulars },
        { id: 'bill', header: 'Bill', accessor: (r) => r.bill, numeric: true, align: 'right', format: money },
        { id: 'paid', header: 'Paid', accessor: (r) => r.paid, numeric: true, align: 'right', format: money },
        { id: 'balance', header: 'Balance', accessor: (r) => r.balance, numeric: true, align: 'right', format: money },
      ];
    case 'payable':
      return [
        { id: 'vendor', header: 'Vendor', accessor: (r) => r.vendorName, render: (r) => vendorCell(s(r, 'vendorName'), s(r, 'vendorId'), onRowClick) },
        { id: 'project', header: 'Project', accessor: (r) => r.projectName },
        { id: 'contract', header: 'Contract', accessor: (r) => r.contractName },
        { id: 'outstanding', header: 'Outstanding', accessor: (r) => r.outstanding, numeric: true, align: 'right', format: money },
        { id: 'overdue', header: 'Overdue', accessor: (r) => r.overdueAmount, numeric: true, align: 'right', format: money },
        { id: 'status', header: 'Status', accessor: (r) => r.status },
      ];
    case 'overdue':
      return [
        { id: 'vendor', header: 'Vendor', accessor: (r) => r.vendorName, render: (r) => vendorCell(s(r, 'vendorName'), s(r, 'vendorId'), onRowClick) },
        { id: 'project', header: 'Project', accessor: (r) => r.projectName },
        { id: 'overdueBills', header: 'Overdue bills', accessor: (r) => r.overdueBills, align: 'right' },
        { id: 'overdueAmt', header: 'Overdue amount', accessor: (r) => r.overdueAmount, numeric: true, align: 'right', format: money },
        { id: 'oldest', header: 'Oldest due', accessor: (r) => r.oldestDueDate, format: (v) => formatDate(String(v)) },
        { id: 'days', header: 'Days past due', accessor: (r) => r.daysPastDue, align: 'right' },
      ];
    case 'schedule':
      return [
        { id: 'vendor', header: 'Vendor', accessor: (r) => r.vendorName, render: (r) => vendorCell(s(r, 'vendorName'), s(r, 'vendorId'), onRowClick) },
        { id: 'project', header: 'Project', accessor: (r) => r.projectName },
        { id: 'bill', header: 'Bill', accessor: (r) => r.billNumber },
        { id: 'due', header: 'Due date', accessor: (r) => r.dueDate, format: (v) => formatDate(String(v)) },
        { id: 'amount', header: 'Amount', accessor: (r) => r.amount, numeric: true, align: 'right', format: money },
        { id: 'balance', header: 'Balance', accessor: (r) => r.balance, numeric: true, align: 'right', format: money },
        { id: 'status', header: 'Status', accessor: (r) => r.status },
      ];
    case 'payment-performance':
      return [
        { id: 'period', header: 'Period', accessor: (r) => r.label },
        { id: 'billed', header: 'Billed', accessor: (r) => r.billed, numeric: true, align: 'right', format: money },
        { id: 'paid', header: 'Paid', accessor: (r) => r.paid, numeric: true, align: 'right', format: money },
        { id: 'outstanding', header: 'Outstanding', accessor: (r) => r.outstanding, numeric: true, align: 'right', format: money },
        { id: 'rate', header: 'Payment %', accessor: (r) => r.paymentRate, align: 'right', format: (v) => `${Number(v).toFixed(1)}%` },
      ];
    default:
      return [];
  }
}
