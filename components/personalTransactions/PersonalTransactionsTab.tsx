import React, { useState, useMemo, useCallback } from 'react';
import Button from '../ui/Button';
import { CURRENCY, ICONS } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import {
  listPersonalTransactions,
} from './personalTransactionsService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import {
  getPersonalIncomeCategories,
  getPersonalExpenseCategories,
} from './personalCategoriesService';
import AddPersonalTransactionModal from './AddPersonalTransactionModal';
import ImportPersonalTransactionsPasteModal from './ImportPersonalTransactionsPasteModal';

export interface PersonalTransactionDisplayRow {
  id: string;
  paymentName: string;
  date: string;
  time: string;
  category: string;
  amount: number;
}

const PAGE_SIZES = [10, 25, 50];

type PersonalTxPeriodFilter = 'all' | 'thisMonth' | 'lastMonth';

function getDateRangeForPeriod(period: PersonalTxPeriodFilter): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  switch (period) {
    case 'all':
      return {};
    case 'thisMonth':
      return {
        dateFrom: `${y}-${m}-01`,
        dateTo: `${y}-${m}-${String(now.getDate()).padStart(2, '0')}`,
      };
    case 'lastMonth': {
      const last = new Date(y, now.getMonth() - 1, 1);
      const lastM = String(last.getMonth() + 1).padStart(2, '0');
      const lastLast = new Date(y, last.getMonth() + 1, 0);
      return {
        dateFrom: `${last.getFullYear()}-${lastM}-01`,
        dateTo: `${last.getFullYear()}-${lastM}-${String(lastLast.getDate()).padStart(2, '0')}`,
      };
    }
    default:
      return {};
  }
}

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  const sym = CURRENCY === 'PKR' ? 'Rs ' : '$';
  return `${sign}${sym}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateAndTime(transactionDate: string, createdAt?: string): { date: string; time: string } {
  const d = transactionDate ? new Date(transactionDate + 'T12:00:00') : (createdAt ? new Date(createdAt) : new Date());
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date, time };
}

function PaymentIcon({ name }: { name: string }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-sm flex-shrink-0">
      {initial}
    </div>
  );
}

const PersonalTransactionsTab: React.FC = () => {
  const { state } = useAppContext();
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PersonalTxPeriodFilter>('thisMonth');
  const [categoryFilterId, setCategoryFilterId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importPasteOpen, setImportPasteOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const dateRange = useMemo(() => getDateRangeForPeriod(periodFilter), [periodFilter]);

  const categoryIdToName = useMemo(() => {
    const map = new Map<string, string>();
    getPersonalIncomeCategories().forEach((c) => map.set(c.id, c.name));
    getPersonalExpenseCategories().forEach((c) => map.set(c.id, c.name));
    return map;
  }, [refreshKey, state.personalCategories]);

  const allTransactions = useMemo(
    () =>
      listPersonalTransactions(
        {
          ...dateRange,
          categoryId: categoryFilterId || undefined,
          limit: 5000,
        },
        !isLocalOnlyMode() ? state.personalTransactions : undefined
      ),
    [dateRange.dateFrom, dateRange.dateTo, categoryFilterId, refreshKey, state.personalTransactions]
  );

  const displayRows: PersonalTransactionDisplayRow[] = useMemo(() => {
    return allTransactions.map((tx) => {
      const { date, time } = formatDateAndTime(tx.transactionDate, tx.createdAt);
      return {
        id: tx.id,
        paymentName: tx.description || categoryIdToName.get(tx.personalCategoryId) || '—',
        date,
        time,
        category: categoryIdToName.get(tx.personalCategoryId) || '—',
        amount: tx.amount,
      };
    });
  }, [allTransactions, categoryIdToName]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return displayRows;
    const q = search.toLowerCase();
    return displayRows.filter(
      (r) =>
        r.paymentName.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [displayRows, search]);

  const summary = useMemo(() => {
    const income = allTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = allTransactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return {
      totalCount: allTransactions.length,
      income,
      expenses,
      net: income - expenses,
    };
  }, [allTransactions]);

  const totalItems = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize]
  );

  const handleSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const allCategoriesForFilter = useMemo(() => {
    const inc = getPersonalIncomeCategories();
    const exp = getPersonalExpenseCategories();
    return [...inc, ...exp];
  }, [refreshKey, state.personalCategories]);

  const handleExportReport = () => {
    // TODO: wire to CSV/export
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <AddPersonalTransactionModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSaved={handleSaved}
      />
      <ImportPersonalTransactionsPasteModal
        isOpen={importPasteOpen}
        onClose={() => setImportPasteOpen(false)}
        dataRevision={refreshKey}
        onImported={() => handleSaved()}
      />

      {/* Header */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            View and manage all your income and expenses.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportReport}
          className="flex items-center gap-2 self-start sm:self-center"
        >
          {React.cloneElement(ICONS.download as React.ReactElement, { width: 18, height: 18 })}
          Export Report
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Transactions</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{summary.totalCount}</p>
          <p className="text-xs text-green-600 mt-1">In selected period</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Income</p>
          <p className="text-xl font-bold text-green-600 mt-1">
            {CURRENCY === 'PKR' ? 'Rs ' : '$'}
            {summary.income.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Expenses</p>
          <p className="text-xl font-bold text-gray-900 mt-1">
            {CURRENCY === 'PKR' ? 'Rs ' : '$'}
            {summary.expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Net</p>
          <p className="text-xl font-bold text-green-600 mt-1">
            +{CURRENCY === 'PKR' ? 'Rs ' : '$'}
            {summary.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">in selected period</p>
        </div>
      </div>

      {/* Transaction list panel */}
      <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Transactions</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial min-w-[140px]">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                {React.cloneElement(ICONS.search as React.ReactElement, { width: 16, height: 16 })}
              </span>
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
              />
            </div>
            <div
              className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5 shadow-sm"
              role="group"
              aria-label="Period filter"
            >
              {(
                [
                  { id: 'all' as const, label: 'All time' },
                  { id: 'thisMonth' as const, label: 'This month' },
                  { id: 'lastMonth' as const, label: 'Last month' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPeriodFilter(id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                    periodFilter === id
                      ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={categoryFilterId}
              onChange={(e) => { setCategoryFilterId(e.target.value); setPage(1); }}
              className="py-2 px-3 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
              aria-label="Category filter"
            >
              <option value="">Categories</option>
              {allCategoriesForFilter.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportReport}
              className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
              title="Download"
              aria-label="Download report"
            >
              {React.cloneElement(ICONS.download as React.ReactElement, { width: 18, height: 18 })}
            </button>
            <Button
              variant="outline"
              onClick={() => setImportPasteOpen(true)}
              className="flex items-center gap-2"
              title="Paste rows from Excel"
            >
              {React.cloneElement(ICONS.upload as React.ReactElement, { width: 18, height: 18 })}
              Import from Excel
            </Button>
            <Button onClick={() => setAddModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-500">
              {React.cloneElement(ICONS.plus as React.ReactElement, { width: 18, height: 18 })}
              Add Transaction
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Payment Name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Time And Date</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Categories</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-500">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-100 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    } hover:bg-gray-50`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <PaymentIcon name={row.paymentName} />
                        <span className="font-medium text-gray-900">{row.paymentName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {row.date}, {row.time}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{row.category}</td>
                    <td
                      className={`py-3 px-4 text-right font-medium ${
                        row.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatAmount(row.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50/50 rounded-b-lg">
          <div className="text-sm text-gray-600">
            Show data{' '}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="mx-1 py-1 px-2 border border-gray-300 rounded bg-white text-gray-900"
              aria-label="Page size"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>{' '}
            of {totalItems}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="p-2 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              title="First"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              title="Previous"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const n = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              if (n > totalPages) return null;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`min-w-[2rem] py-2 px-2 rounded border text-sm font-medium ${
                    page === n
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              title="Next"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="p-2 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              title="Last"
            >
              »
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonalTransactionsTab;
