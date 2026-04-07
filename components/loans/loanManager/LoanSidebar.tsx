import React, { useState, useMemo } from 'react';
import { ICONS } from '../../../constants';
import Input from '../../ui/Input';
import {
  formatPKR,
  getLoanStatusUI,
  getTreeGroup,
  type QuickFilterKey,
  type AdvancedFilterState,
  defaultAdvancedFilter,
  type LoanStatusUI,
  type TreeGroupKey,
} from './loanManagerUtils';

export interface LoanSummaryItem {
  contactId: string;
  contactName: string;
  contactNo?: string;
  received: number;
  repaid: number;
  given: number;
  collected: number;
  netBalance: number;
  lastActivityDate: Date;
  statusUI: LoanStatusUI;
  treeGroup: TreeGroupKey;
}

interface LoanSidebarProps {
  items: LoanSummaryItem[];
  selectedContactId: string | null;
  onSelect: (contactId: string) => void;
  quickFilter: QuickFilterKey;
  onQuickFilterChange: (key: QuickFilterKey) => void;
  advancedFilter: AdvancedFilterState;
  onAdvancedFilterChange: (f: AdvancedFilterState) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  appliedCount: number;
}

const QUICK_FILTERS: { key: QuickFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'to_receive', label: 'To Receive' },
  { key: 'to_return', label: 'To Return' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
];

export const LoanSidebar: React.FC<LoanSidebarProps> = ({
  items,
  selectedContactId,
  onSelect,
  quickFilter,
  onQuickFilterChange,
  advancedFilter,
  onAdvancedFilterChange,
  searchQuery,
  onSearchChange,
  appliedCount,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [treeExpanded, setTreeExpanded] = useState<Record<TreeGroupKey, boolean>>({
    to_receive: true,
    to_return: true,
    completed: true,
  });

  const toggleGroup = (key: TreeGroupKey) => {
    setTreeExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredByQuickAndSearch = useMemo(() => {
    let list = items;

    // Apply advanced filters (UI only)
    if (advancedFilter.status) {
      list = list.filter(s => s.statusUI === advancedFilter.status);
    }
    if (advancedFilter.amountRange) {
      const abs = (s: LoanSummaryItem) => Math.abs(s.netBalance);
      if (advancedFilter.amountRange === 'under_5k') list = list.filter(s => abs(s) < 5000);
      else if (advancedFilter.amountRange === '5k_20k') list = list.filter(s => abs(s) >= 5000 && abs(s) <= 20000);
      else if (advancedFilter.amountRange === '20k_plus') list = list.filter(s => abs(s) > 20000);
    }
    if (advancedFilter.dueDate) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const weekEnd = today + 7 * 24 * 60 * 60 * 1000;
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime() + 24 * 60 * 60 * 1000;
      list = list.filter(s => {
        const t = s.lastActivityDate.getTime();
        if (advancedFilter.dueDate === 'today') return t >= today && t < today + 24 * 60 * 60 * 1000;
        if (advancedFilter.dueDate === 'week') return t >= today && t < weekEnd;
        if (advancedFilter.dueDate === 'month') return t >= today && t <= monthEnd;
        return true;
      });
    }
    if (advancedFilter.loanType) {
      if (advancedFilter.loanType === 'i_gave') list = list.filter(s => s.netBalance < 0);
      if (advancedFilter.loanType === 'i_borrowed') list = list.filter(s => s.netBalance > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        s =>
          s.contactName.toLowerCase().includes(q) ||
          (s.contactNo || '').includes(q) ||
          String(Math.abs(s.netBalance)).includes(q)
      );
    }
    switch (quickFilter) {
      case 'to_receive':
        return list.filter(s => s.treeGroup === 'to_receive');
      case 'to_return':
        return list.filter(s => s.treeGroup === 'to_return');
      case 'overdue':
        return list.filter(s => s.statusUI === 'Overdue');
      case 'completed':
        return list.filter(s => s.treeGroup === 'completed');
      default:
        return list;
    }
  }, [items, searchQuery, quickFilter, advancedFilter]);

  const grouped = useMemo(() => {
    const toReceive: LoanSummaryItem[] = [];
    const toReturn: LoanSummaryItem[] = [];
    const completed: LoanSummaryItem[] = [];
    filteredByQuickAndSearch.forEach(s => {
      if (s.treeGroup === 'to_receive') toReceive.push(s);
      else if (s.treeGroup === 'to_return') toReturn.push(s);
      else completed.push(s);
    });
    return { toReceive, toReturn, completed };
  }, [filteredByQuickAndSearch]);

  const hasActiveFilters =
    advancedFilter.status !== '' ||
    advancedFilter.amountRange !== '' ||
    advancedFilter.dueDate !== '' ||
    advancedFilter.loanType !== '';

  const handleClearAdvanced = () => {
    onAdvancedFilterChange(defaultAdvancedFilter);
    setAdvancedOpen(false);
  };

  const handleApplyAdvanced = () => {
    setAdvancedOpen(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="p-3 border-b border-slate-200 shrink-0">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <span className="w-5 h-5">{ICONS.search}</span>
          </div>
          <Input
            placeholder="Search lender or borrower…"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-10 pr-10 w-full min-w-0 rounded-xl border-slate-200"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <span className="w-5 h-5">{ICONS.x}</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick filters */}
      <div className="px-3 py-2 flex flex-wrap gap-2 shrink-0">
        {QUICK_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onQuickFilterChange(key)}
            className={`
              px-3 py-1.5 rounded-full text-sm font-medium transition-colors
              ${quickFilter === key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Advanced filter trigger */}
      <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
        <div className="relative">
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors
              ${hasActiveFilters ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}
            `}
          >
            <span className="w-4 h-4">{ICONS.filter}</span>
            Filters
            {appliedCount > 0 && (
              <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                {appliedCount}
              </span>
            )}
          </button>

          {advancedOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setAdvancedOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 w-[280px] bg-white rounded-2xl shadow-lg border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-800 mb-3">Advanced filters</div>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-slate-600 mb-1">Status</label>
                    <select
                      value={advancedFilter.status}
                      onChange={e => onAdvancedFilterChange({ ...advancedFilter, status: e.target.value as LoanStatusUI | '' })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      aria-label="Filter by status"
                    >
                      <option value="">Any</option>
                      <option value="Pending">Pending</option>
                      <option value="Partial">Partial</option>
                      <option value="Completed">Completed</option>
                      <option value="Overdue">Overdue</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Amount (PKR)</label>
                    <select
                      value={advancedFilter.amountRange}
                      onChange={e =>
                        onAdvancedFilterChange({
                          ...advancedFilter,
                          amountRange: e.target.value as AdvancedFilterState['amountRange'],
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      aria-label="Filter by amount range"
                    >
                      <option value="">Any</option>
                      <option value="under_5k">Under ₨ 5,000</option>
                      <option value="5k_20k">₨ 5,000 – ₨ 20,000</option>
                      <option value="20k_plus">₨ 20,000+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Due date</label>
                    <select
                      value={advancedFilter.dueDate}
                      onChange={e =>
                        onAdvancedFilterChange({ ...advancedFilter, dueDate: e.target.value as AdvancedFilterState['dueDate'] })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      aria-label="Filter by due date"
                    >
                      <option value="">Any</option>
                      <option value="today">Due today</option>
                      <option value="week">Due this week</option>
                      <option value="month">Due this month</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Loan type</label>
                    <select
                      value={advancedFilter.loanType}
                      onChange={e =>
                        onAdvancedFilterChange({
                          ...advancedFilter,
                          loanType: e.target.value as AdvancedFilterState['loanType'],
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      aria-label="Filter by loan type"
                    >
                      <option value="">Any</option>
                      <option value="i_gave">I gave</option>
                      <option value="i_borrowed">I borrowed</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={handleClearAdvanced}
                    className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyAdvanced}
                    className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 pb-4">
        {filteredByQuickAndSearch.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">
            {searchQuery.trim() ? 'No results found.' : 'No active loans found.'}
          </div>
        ) : (
          <div className="space-y-1">
            {/* To Receive */}
            {grouped.toReceive.length > 0 && (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => toggleGroup('to_receive')}
                  className="flex items-center gap-2 w-full py-2 px-2 rounded-xl text-left font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="w-5 h-5 flex items-center justify-center text-slate-500">
                    {treeExpanded.to_receive ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </span>
                  To Receive ({grouped.toReceive.length})
                </button>
                {treeExpanded.to_receive && (
                  <div className="pl-4 space-y-0.5">
                    {grouped.toReceive.map(s => (
                      <TreeItem
                        key={s.contactId}
                        item={s}
                        selected={selectedContactId === s.contactId}
                        onSelect={() => onSelect(s.contactId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* To Return */}
            {grouped.toReturn.length > 0 && (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => toggleGroup('to_return')}
                  className="flex items-center gap-2 w-full py-2 px-2 rounded-xl text-left font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="w-5 h-5 flex items-center justify-center text-slate-500">
                    {treeExpanded.to_return ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </span>
                  To Return ({grouped.toReturn.length})
                </button>
                {treeExpanded.to_return && (
                  <div className="pl-4 space-y-0.5">
                    {grouped.toReturn.map(s => (
                      <TreeItem
                        key={s.contactId}
                        item={s}
                        selected={selectedContactId === s.contactId}
                        onSelect={() => onSelect(s.contactId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Completed */}
            {grouped.completed.length > 0 && (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => toggleGroup('completed')}
                  className="flex items-center gap-2 w-full py-2 px-2 rounded-xl text-left font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="w-5 h-5 flex items-center justify-center text-slate-500">
                    {treeExpanded.completed ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </span>
                  Completed ({grouped.completed.length})
                </button>
                {treeExpanded.completed && (
                  <div className="pl-4 space-y-0.5">
                    {grouped.completed.map(s => (
                      <TreeItem
                        key={s.contactId}
                        item={s}
                        selected={selectedContactId === s.contactId}
                        onSelect={() => onSelect(s.contactId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function TreeItem({
  item,
  selected,
  onSelect,
}: {
  item: LoanSummaryItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const initial = item.contactName.charAt(0).toUpperCase();
  const statusColor =
    item.statusUI === 'Completed'
      ? 'bg-emerald-500'
      : item.statusUI === 'Overdue'
        ? 'bg-red-500'
        : item.statusUI === 'Partial'
          ? 'bg-amber-500'
          : 'bg-slate-300';
  const dueLabel = '—'; // No due date in schema; show placeholder

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-all duration-200
        ${selected ? 'bg-blue-50 border-l-4 border-blue-600 shadow-sm' : 'hover:bg-slate-50 border-l-4 border-transparent'}
      `}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${statusColor}`}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-800 truncate">{item.contactName}</div>
        <div className="text-xs text-slate-500">{dueLabel}</div>
      </div>
      <div className="shrink-0 text-right font-bold tabular-nums text-sm">
        {item.treeGroup === 'completed' ? (
          <span className="text-slate-500">—</span>
        ) : (
          <span className={item.netBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
            {formatPKR(item.netBalance)}
          </span>
        )}
      </div>
    </button>
  );
}
