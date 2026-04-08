import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Button from '../ui/Button';
import { CURRENCY, ICONS } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import {
  listPersonalTransactions,
  deletePersonalTransaction,
  type PersonalTransactionRow,
} from './personalTransactionsService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import {
  getPersonalIncomeCategories,
  getPersonalExpenseCategories,
} from './personalCategoriesService';
import AddPersonalTransactionModal from './AddPersonalTransactionModal';
import ImportPersonalTransactionsPasteModal from './ImportPersonalTransactionsPasteModal';

const PAGE_SIZES = [10, 25, 50, 100];

type PersonalTxPeriodFilter = 'all' | 'thisMonth' | 'lastMonth';

type SortableCol = 'date' | 'category' | 'notes' | 'income' | 'expense' | 'net';
type SortDir = 'asc' | 'desc';

interface TxTableRow {
  id: string;
  raw: PersonalTransactionRow;
  sortTimestamp: number;
  dateDisplay: string;
  category: string;
  notes: string;
  income: number;
  expense: number;
  runningBalance: number;
}

const COL_IDS = ['date', 'category', 'notes', 'income', 'expense', 'net', 'actions'] as const;
type ColId = (typeof COL_IDS)[number];

const DEFAULT_WIDTHS: Record<Exclude<ColId, 'actions'>, number> = {
  date: 160,
  category: 140,
  notes: 200,
  income: 108,
  expense: 108,
  net: 128,
};

/** First day of the month, 12 months ago through today (rolling window for header chart). */
function getRolling12MonthsDateFrom(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** YYYY-MM keys for the last 12 months, oldest first. */
function getLast12MonthKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    keys.push(`${y}-${m}`);
  }
  return keys;
}

function monthKeyToShortLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

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

function formatSignedMoney(amount: number): string {
  const sym = CURRENCY === 'PKR' ? 'Rs ' : '$';
  const abs = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (amount > 0) return `+${sym}${abs}`;
  if (amount < 0) return `−${sym}${abs}`;
  return `${sym}0.00`;
}

function formatColumnMoneyPositive(amount: number): string {
  if (amount <= 0) return '—';
  const sym = CURRENCY === 'PKR' ? 'Rs ' : '$';
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateAndTime(transactionDate: string, createdAt?: string): { date: string; time: string } {
  const d = transactionDate
    ? new Date(transactionDate + 'T12:00:00')
    : createdAt
      ? new Date(createdAt)
      : new Date();
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date, time };
}

function sortTimestamp(tx: PersonalTransactionRow): number {
  const base = tx.transactionDate ? new Date(tx.transactionDate + 'T12:00:00').getTime() : 0;
  const created = tx.createdAt ? new Date(tx.createdAt).getTime() : 0;
  return base * 1000 + created;
}

function compareTxTableRows(a: TxTableRow, b: TxTableRow, col: SortableCol, dir: SortDir): number {
  let cmp = 0;
  switch (col) {
    case 'date':
      cmp = a.sortTimestamp - b.sortTimestamp;
      break;
    case 'category':
      cmp = a.category.localeCompare(b.category, undefined, { sensitivity: 'base' });
      break;
    case 'notes':
      cmp = a.notes.localeCompare(b.notes, undefined, { sensitivity: 'base' });
      break;
    case 'income':
      cmp = a.income - b.income;
      break;
    case 'expense':
      cmp = a.expense - b.expense;
      break;
    case 'net':
      cmp = a.runningBalance - b.runningBalance;
      break;
    default:
      cmp = 0;
  }
  if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  const tie = a.raw.id.localeCompare(b.raw.id);
  return dir === 'asc' ? tie : -tie;
}

const PersonalTransactionsTab: React.FC = () => {
  const { state } = useAppContext();
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PersonalTxPeriodFilter>('thisMonth');
  const [categoryFilterId, setCategoryFilterId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [modalOpen, setModalOpen] = useState(false);
  const [txToEdit, setTxToEdit] = useState<PersonalTransactionRow | null>(null);
  const [importPasteOpen, setImportPasteOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sort, setSort] = useState<{ col: SortableCol; dir: SortDir }>({ col: 'date', dir: 'desc' });
  const [widths, setWidths] = useState<Record<Exclude<ColId, 'actions'>, number>>(() => ({ ...DEFAULT_WIDTHS }));
  const resizeRef = useRef<{ colId: keyof typeof DEFAULT_WIDTHS; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onCategoriesChanged = () => setRefreshKey((k) => k + 1);
    window.addEventListener('pbooks-personal-categories-changed', onCategoriesChanged);
    return () => window.removeEventListener('pbooks-personal-categories-changed', onCategoriesChanged);
  }, []);

  const dateRange = useMemo(() => getDateRangeForPeriod(periodFilter), [periodFilter]);

  const chartTransactions = useMemo(
    () =>
      listPersonalTransactions(
        {
          dateFrom: getRolling12MonthsDateFrom(),
          limit: 10000,
        },
        !isLocalOnlyMode() ? state.personalTransactions : undefined
      ),
    [refreshKey, state.personalTransactions]
  );

  const monthlyBarChartData = useMemo(() => {
    const keys = getLast12MonthKeys();
    const totals = new Map<string, { income: number; expense: number }>();
    for (const k of keys) totals.set(k, { income: 0, expense: 0 });
    for (const tx of chartTransactions) {
      const ym = tx.transactionDate?.slice(0, 7);
      if (!ym || !totals.has(ym)) continue;
      const amt = typeof tx.amount === 'number' ? tx.amount : 0;
      const cur = totals.get(ym)!;
      if (amt > 0) cur.income += amt;
      else if (amt < 0) cur.expense += Math.abs(amt);
    }
    return keys.map((k) => {
      const t = totals.get(k)!;
      return {
        label: monthKeyToShortLabel(k),
        income: t.income,
        expense: t.expense,
      };
    });
  }, [chartTransactions]);

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

  const baseRows: Omit<TxTableRow, 'runningBalance'>[] = useMemo(() => {
    return allTransactions.map((tx) => {
      const { date, time } = formatDateAndTime(tx.transactionDate, tx.createdAt);
      const amt = typeof tx.amount === 'number' ? tx.amount : 0;
      const desc = (tx.description || '').trim();
      return {
        id: tx.id,
        raw: tx,
        sortTimestamp: sortTimestamp(tx),
        dateDisplay: `${date}, ${time}`,
        category: categoryIdToName.get(tx.personalCategoryId) || '—',
        notes: desc || '—',
        income: amt > 0 ? amt : 0,
        expense: amt < 0 ? Math.abs(amt) : 0,
      };
    });
  }, [allTransactions, categoryIdToName]);

  const searchFiltered = useMemo(() => {
    if (!search.trim()) return baseRows;
    const q = search.toLowerCase();
    return baseRows.filter(
      (r) =>
        r.notes.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.dateDisplay.toLowerCase().includes(q)
    );
  }, [baseRows, search]);

  const balanceById = useMemo(() => {
    const chrono = [...searchFiltered].sort((a, b) => {
      const da = a.raw.transactionDate || '';
      const db = b.raw.transactionDate || '';
      if (da !== db) return da.localeCompare(db);
      const ca = a.raw.createdAt || '';
      const cb = b.raw.createdAt || '';
      if (ca !== cb) return ca.localeCompare(cb);
      return a.raw.id.localeCompare(b.raw.id);
    });
    let bal = 0;
    const m = new Map<string, number>();
    for (const r of chrono) {
      const amt = typeof r.raw.amount === 'number' ? r.raw.amount : 0;
      bal += amt;
      m.set(r.id, bal);
    }
    return m;
  }, [searchFiltered]);

  const tableRows: TxTableRow[] = useMemo(
    () =>
      searchFiltered.map((r) => ({
        ...r,
        runningBalance: balanceById.get(r.id) ?? 0,
      })),
    [searchFiltered, balanceById]
  );

  const sortedRows = useMemo(() => {
    const copy = [...tableRows];
    copy.sort((a, b) => compareTxTableRows(a, b, sort.col, sort.dir));
    return copy;
  }, [tableRows, sort]);

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

  const totalItems = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedRows = useMemo(
    () => sortedRows.slice((page - 1) * pageSize, page * pageSize),
    [sortedRows, page, pageSize]
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

  const toggleSort = (col: SortableCol) => {
    setSort((prev) => {
      if (prev.col !== col) return { col, dir: 'asc' };
      return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
    setPage(1);
  };

  const handleResizeStart = (colId: keyof typeof DEFAULT_WIDTHS, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { colId, startX: e.clientX, startW: widths[colId] ?? DEFAULT_WIDTHS[colId] };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const delta = ev.clientX - r.startX;
      const next = Math.max(64, r.startW + delta);
      setWidths((prev) => ({ ...prev, [r.colId]: next }));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const openAdd = () => {
    setTxToEdit(null);
    setModalOpen(true);
  };

  const openEdit = (row: PersonalTransactionRow) => {
    setTxToEdit(row);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setTxToEdit(null);
  };

  const handleDelete = async (row: PersonalTransactionRow) => {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    try {
      await deletePersonalTransaction(row.id, row.version);
      handleSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  const gridTemplate = useMemo(() => {
    const parts = COL_IDS.map((id) => {
      if (id === 'actions') return '88px';
      return `${widths[id]}px`;
    });
    return parts.join(' ');
  }, [widths]);

  const sym = CURRENCY === 'PKR' ? 'Rs ' : '$';

  return (
    <div className="flex flex-col h-full overflow-auto">
      <AddPersonalTransactionModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSaved={handleSaved}
        editTransaction={txToEdit}
      />
      <ImportPersonalTransactionsPasteModal
        isOpen={importPasteOpen}
        onClose={() => setImportPasteOpen(false)}
        dataRevision={refreshKey}
        onImported={() => handleSaved()}
      />

      <div className="flex-shrink-0 flex flex-col xl:flex-row xl:items-center gap-4 mb-6">
        <div className="shrink-0 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-0.5">View and manage all your income and expenses.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0 xl:justify-end">
          <div className="w-full sm:flex-1 min-w-0 max-w-full xl:max-w-[min(100%,28rem)] border border-gray-200 rounded-lg bg-white px-2 pt-1 pb-0.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 px-1 mb-0.5">
              Monthly income vs expenses (last 12 months)
            </p>
            <div className="h-[120px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyBarChartData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: '#6b7280' }}
                    interval={0}
                    height={36}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: '#6b7280' }}
                    width={44}
                    tickFormatter={(v) => {
                      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                      if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
                      return String(v);
                    }}
                  />
                  <Tooltip
                    formatter={(value: number | string) => {
                      const n = typeof value === 'number' ? value : Number(value);
                      return `${sym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 2 }} iconType="square" />
                  <Bar dataKey="income" name="Income" fill="#16a34a" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="expense" name="Expenses" fill="#dc2626" radius={[3, 3, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleExportReport}
            className="flex items-center gap-2 shrink-0 self-start sm:self-center w-full sm:w-auto justify-center"
          >
            {React.cloneElement(ICONS.download as React.ReactElement<any>, { width: 18, height: 18 })}
            Export Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Transactions</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{summary.totalCount}</p>
          <p className="text-xs text-green-600 mt-1">In selected period</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Income</p>
          <p className="text-xl font-bold text-green-600 mt-1">
            {sym}
            {summary.income.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Expenses</p>
          <p className="text-xl font-bold text-gray-900 mt-1">
            {sym}
            {summary.expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Net</p>
          <p
            className={`text-xl font-bold mt-1 ${
              summary.net >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {sym}
            {summary.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">in selected period</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Transactions</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial min-w-[140px]">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                {React.cloneElement(ICONS.search as React.ReactElement<any>, { width: 16, height: 16 })}
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
              onChange={(e) => {
                setCategoryFilterId(e.target.value);
                setPage(1);
              }}
              className="py-2 px-3 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
              aria-label="Category filter"
            >
              <option value="">Categories</option>
              {allCategoriesForFilter.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportReport}
              className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
              title="Download"
              aria-label="Download report"
            >
              {React.cloneElement(ICONS.download as React.ReactElement<any>, { width: 18, height: 18 })}
            </button>
            <Button variant="outline" onClick={() => setImportPasteOpen(true)} className="flex items-center gap-2" title="Paste rows from Excel">
              {React.cloneElement(ICONS.upload as React.ReactElement<any>, { width: 18, height: 18 })}
              Import from Excel
            </Button>
            <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-500">
              {React.cloneElement(ICONS.plus as React.ReactElement<any>, { width: 18, height: 18 })}
              Add Transaction
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto min-h-[200px]">
          <div
            className="grid sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {(
              [
                { id: 'date' as const, label: 'Date' },
                { id: 'category' as const, label: 'Type (category)' },
                { id: 'notes' as const, label: 'Notes' },
                { id: 'income' as const, label: 'Income' },
                { id: 'expense' as const, label: 'Expense' },
                { id: 'net' as const, label: 'Net (balance)' },
                { id: 'actions' as const, label: 'Actions' },
              ] as const
            ).map((col) => {
              const isSortable = col.id !== 'actions';
              const active = isSortable && sort.col === col.id;
              const alignRight = col.id === 'income' || col.id === 'expense' || col.id === 'net';
              if (!isSortable) {
                return (
                  <div
                    key={col.id}
                    className="relative flex items-center gap-1 px-2 py-1.5 border-r border-gray-100 last:border-r-0 select-none"
                  >
                    <span className="truncate">{col.label}</span>
                  </div>
                );
              }
              return (
                <div
                  key={col.id}
                  role="columnheader"
                  className={`relative flex items-center gap-1 px-2 py-1.5 border-r border-gray-100 select-none cursor-pointer hover:bg-gray-100 min-w-0 ${
                    alignRight ? 'justify-end text-right' : ''
                  }`}
                  onClick={() => toggleSort(col.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSort(col.id);
                    }
                  }}
                  tabIndex={0}
                >
                  <span className="truncate">{col.label}</span>
                  {active && <span className="text-gray-500 shrink-0">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${col.label}`}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-200/50 z-10"
                    onMouseDown={(e) => handleResizeStart(col.id, e)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })}
          </div>

          {paginatedRows.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">No transactions found.</div>
          ) : (
            paginatedRows.map((row, index) => (
              <div
                key={row.id}
                className={`grid text-xs border-b border-gray-100 items-center min-h-[32px] ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                } hover:bg-gray-50`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="px-2 py-1 text-gray-700 border-r border-gray-100 min-w-0 truncate" title={row.dateDisplay}>
                  {row.dateDisplay}
                </div>
                <div className="px-2 py-1 text-gray-800 border-r border-gray-100 min-w-0 truncate" title={row.category}>
                  {row.category}
                </div>
                <div className="px-2 py-1 text-gray-600 border-r border-gray-100 min-w-0 truncate" title={row.notes}>
                  {row.notes}
                </div>
                <div className="px-2 py-1 text-right text-green-700 tabular-nums border-r border-gray-100">
                  {formatColumnMoneyPositive(row.income)}
                </div>
                <div className="px-2 py-1 text-right text-red-600 tabular-nums border-r border-gray-100">
                  {formatColumnMoneyPositive(row.expense)}
                </div>
                <div
                  className={`px-2 py-1 text-right tabular-nums border-r border-gray-100 font-medium ${
                    row.runningBalance >= 0 ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {formatSignedMoney(row.runningBalance)}
                </div>
                <div className="px-1 py-0.5 flex items-center justify-end gap-1 border-r border-gray-100 last:border-r-0">
                  <button
                    type="button"
                    className="px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded"
                    onClick={() => openEdit(row.raw)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded"
                    onClick={() => void handleDelete(row.raw)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2 border-t border-gray-200 bg-gray-50/50 rounded-b-lg">
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
                <option key={n} value={n}>
                  {n}
                </option>
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
                  className={`min-w-[2rem] py-1.5 px-2 rounded border text-sm font-medium ${
                    page === n ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
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
