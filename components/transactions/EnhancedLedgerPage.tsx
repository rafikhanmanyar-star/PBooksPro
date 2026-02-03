import React, { useState, useMemo, useEffect, useCallback, memo, useRef, useTransition } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useDebounce } from '../../hooks/useDebounce';
import { Transaction, TransactionType, InvoiceType, Account, Category, Contact, LedgerSortKey as SortKey, SortDirection, FilterCriteria, ImportType } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import { formatDate } from '../../utils/dateUtils';
import { useProgress } from '../../context/ProgressContext';
import { exportToExcel } from '../../services/exportService';
// ImportType moved to types.ts
import TransactionDetailDrawer from './TransactionDetailDrawer';
import LedgerTable from './LedgerTable';
import VirtualizedLedgerTable from './VirtualizedLedgerTable';
import LedgerSummary from './LedgerSummary';
import LedgerFilters from './LedgerFilters';
import MonthNavigator from './MonthNavigator';
import TransactionForm from './TransactionForm';
import Modal from '../ui/Modal';
import { usePaginatedTransactions } from '../../hooks/usePaginatedTransactions';
import { useLookupMaps } from '../../hooks/useLookupMaps';
import { usePrintContext } from '../../context/PrintContext';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';


const initialFilters: FilterCriteria = {
    searchQuery: '',
    startDate: '',
    endDate: '',
    type: '',
    accountId: '',
    categoryId: '',
    contactId: '',
    projectId: '',
    buildingId: '',
    minAmount: '',
    maxAmount: '',
    groupBy: 'date'
};


const EnhancedLedgerPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const progress = useProgress();
    const { print: triggerPrint } = usePrintContext();

    // State Management
    const [filters, setFilters] = useState<FilterCriteria>(initialFilters);
    const [searchInput, setSearchInput] = useState<string>('');
    const [isPendingFilter, startFilterTransition] = useTransition();

    // Debounce search query to avoid expensive operations on every keystroke
    const debouncedSearchQuery = useDebounce(searchInput, 300);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
        key: 'date',
        direction: 'desc'
    });
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'all'>('month');
    const [useVirtualization, setUseVirtualization] = useState(() => {
        // Enable virtualization by default for large lists, can be disabled via localStorage
        if (typeof window !== 'undefined') {
            const flag = localStorage.getItem('useTableVirtualization');
            return flag !== 'false'; // Default to true unless explicitly disabled
        }
        return true;
    });

    // Use paginated transactions hook (with smart fallback)
    const {
        transactions: paginatedTransactions,
        isLoading: isLoadingTransactions,
        hasMore,
        loadMore,
        refresh: refreshTransactions,
        totalCount,
        isUsingNative,
        isNativeEnabled
    } = usePaginatedTransactions({
        projectId: filters.projectId || null,
        pageSize: 200,
        enabled: true
    });

    // Fast lookup maps for O(1) access instead of O(n) .find() calls
    const lookupMaps = useLookupMaps();

    // Determine if we should use all transactions (for search in "all" mode)
    const hasSearchQuery = useMemo(() =>
        debouncedSearchQuery && debouncedSearchQuery.trim().length > 0,
        [debouncedSearchQuery]
    );
    const shouldUseAllTransactions = useMemo(() =>
        viewMode === 'all' && hasSearchQuery,
        [viewMode, hasSearchQuery]
    );

    // Refresh transactions when filters change significantly (only for native backend)
    useEffect(() => {
        if (isUsingNative && (filters.projectId || filters.type || filters.accountId)) {
            // Debounce refresh to avoid too many requests
            const timeoutId = setTimeout(() => {
                refreshTransactions();
            }, 300);
            return () => clearTimeout(timeoutId);
        }
    }, [filters.projectId, filters.type, filters.accountId, isUsingNative, refreshTransactions]);

    // Consolidate batch transactions
    const consolidatedTransactions = useMemo(() => {
        // When in "all" mode with search, use all transactions to enable searching across everything
        // Otherwise use paginated transactions for performance (or fallback to state.transactions)

        const raw = (isUsingNative && paginatedTransactions.length > 0 && !shouldUseAllTransactions)
            ? paginatedTransactions
            : (state?.transactions || []);
        const batchMap = new Map<string, Transaction[]>();
        const processedBatchIds = new Set<string>();
        const result: Transaction[] = [];

        raw.forEach(tx => {
            if (tx.batchId) {
                if (!batchMap.has(tx.batchId)) batchMap.set(tx.batchId, []);
                batchMap.get(tx.batchId)!.push(tx);
            }
        });

        raw.forEach(tx => {
            if (!tx.batchId) {
                result.push(tx);
                return;
            }
            if (processedBatchIds.has(tx.batchId)) return;

            const batchTxs = batchMap.get(tx.batchId)!;

            const isRental = batchTxs.some(t => {
                if (t.invoiceId) {
                    const inv = lookupMaps.invoices.get(t.invoiceId);
                    return inv?.invoiceType === InvoiceType.RENTAL;
                }
                const cat = lookupMaps.categories.get(t.categoryId);
                return cat?.isRental;
            });

            if (isRental) {
                const totalAmount = batchTxs.reduce((sum, t) => sum + t.amount, 0);
                const template = batchTxs[0];
                const uniqueContacts = new Set(batchTxs.map(t => t.contactId).filter(Boolean));
                const commonContactId = uniqueContacts.size === 1 ? Array.from(uniqueContacts)[0] : undefined;
                const uniqueBuildings = new Set(batchTxs.map(t => t.buildingId).filter(Boolean));
                const commonBuildingId = uniqueBuildings.size === 1 ? Array.from(uniqueBuildings)[0] : undefined;

                const desc = `Rental Bulk Payment (${batchTxs.length} items)`;

                const parent: Transaction = {
                    ...template,
                    id: `batch-${tx.batchId}`,
                    description: desc,
                    amount: totalAmount,
                    children: batchTxs,
                    contactId: commonContactId,
                    buildingId: commonBuildingId,
                    projectId: undefined,
                    invoiceId: undefined,
                    billId: undefined
                };
                result.push(parent);
                processedBatchIds.add(tx.batchId);
            } else {
                result.push(tx);
            }
        });
        return result;
    }, [isUsingNative, paginatedTransactions, state?.transactions, lookupMaps, shouldUseAllTransactions]);

    // Update filters with debounced search query
    useEffect(() => {
        startFilterTransition(() => {
            setFilters(prev => ({ ...prev, searchQuery: debouncedSearchQuery }));
        });
    }, [debouncedSearchQuery, startFilterTransition]);

    // Apply filters and search (non-blocking with startTransition)
    const filteredTransactions = useMemo(() => {
        let filtered = consolidatedTransactions;

        // Hide system transactions if needed
        if (state && !state.showSystemTransactions) {
            filtered = filtered.filter(t => !t.isSystem);
        }

        const matchCondition = (tx: Transaction, predicate: (t: Transaction) => boolean): boolean => {
            if (predicate(tx)) return true;
            if (tx.children) return tx.children.some(child => predicate(child));
            return false;
        };

        // Apply type filter
        if (filters.type) {
            filtered = filtered.filter(t => t.type === filters.type);
        }

        // Apply account filter
        if (filters.accountId) {
            filtered = filtered.filter(t => matchCondition(t, tx =>
                tx.accountId === filters.accountId ||
                tx.fromAccountId === filters.accountId ||
                tx.toAccountId === filters.accountId
            ));
        }

        // Apply category filter
        if (filters.categoryId) {
            filtered = filtered.filter(t => matchCondition(t, tx => tx.categoryId === filters.categoryId));
        }

        // Apply contact filter
        if (filters.contactId) {
            filtered = filtered.filter(t => matchCondition(t, tx => tx.contactId === filters.contactId));
        }

        // Apply project filter
        if (filters.projectId) {
            filtered = filtered.filter(t => matchCondition(t, tx => tx.projectId === filters.projectId));
        }

        // Apply building filter
        if (filters.buildingId) {
            filtered = filtered.filter(t => matchCondition(t, tx => tx.buildingId === filters.buildingId));
        }

        // Apply amount filters
        if (filters.minAmount) {
            const min = parseFloat(filters.minAmount);
            if (!isNaN(min)) filtered = filtered.filter(t => t.amount >= min);
        }
        if (filters.maxAmount) {
            const max = parseFloat(filters.maxAmount);
            if (!isNaN(max)) filtered = filtered.filter(t => t.amount <= max);
        }

        // Apply date range filter
        if (filters.startDate && filters.endDate) {
            filtered = filtered.filter(t => t.date >= filters.startDate && t.date <= filters.endDate);
        } else if (filters.startDate) {
            filtered = filtered.filter(t => t.date >= filters.startDate);
        } else if (filters.endDate) {
            filtered = filtered.filter(t => t.date <= filters.endDate);
        } else if (viewMode === 'month') {
            // Apply monthly filter when no custom date range
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const monthPrefix = `${year}-${month}`;
            filtered = filtered.filter(t => t.date.startsWith(monthPrefix));
        }

        // Apply search query (optimized with lookup maps, using debounced value)
        const searchQuery = filters.searchQuery || debouncedSearchQuery;
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(t => matchCondition(t, tx => {
                // Use lookup maps for O(1) access instead of O(n) .find()
                const accountName = lookupMaps.accounts.get(tx.accountId)?.name.toLowerCase() || '';
                const categoryName = lookupMaps.categories.get(tx.categoryId)?.name.toLowerCase() || '';
                const contactName = lookupMaps.contacts.get(tx.contactId)?.name.toLowerCase() || '';
                const description = tx.description?.toLowerCase() || '';
                const amount = tx.amount.toString();

                return description.includes(lowerQuery) ||
                    accountName.includes(lowerQuery) ||
                    categoryName.includes(lowerQuery) ||
                    contactName.includes(lowerQuery) ||
                    amount.includes(lowerQuery);
            }));
        }

        return filtered;
    }, [consolidatedTransactions, filters, lookupMaps, state?.showSystemTransactions, currentDate, viewMode, debouncedSearchQuery]);

    // Sort transactions
    const sortedTransactions = useMemo(() => {
        return [...filteredTransactions].sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (sortConfig.key) {
                case 'date':
                    valA = new Date(a.date).getTime();
                    valB = new Date(b.date).getTime();
                    break;
                case 'amount':
                    valA = a.amount;
                    valB = b.amount;
                    break;
                case 'type':
                    valA = a.type;
                    valB = b.type;
                    break;
                case 'description':
                    valA = (a.description || '').toLowerCase();
                    valB = (b.description || '').toLowerCase();
                    break;
                case 'account':
                    valA = (lookupMaps.accounts.get(a.accountId)?.name || '').toLowerCase();
                    valB = (lookupMaps.accounts.get(b.accountId)?.name || '').toLowerCase();
                    break;
                case 'category':
                    valA = (lookupMaps.categories.get(a.categoryId)?.name || '').toLowerCase();
                    valB = (lookupMaps.categories.get(b.categoryId)?.name || '').toLowerCase();
                    break;
                case 'contact':
                    valA = (lookupMaps.contacts.get(a.contactId)?.name || '').toLowerCase();
                    valB = (lookupMaps.contacts.get(b.contactId)?.name || '').toLowerCase();
                    break;
                default:
                    valA = a.date;
                    valB = b.date;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredTransactions, sortConfig, lookupMaps]);

    // Calculate running balance in chronological order, then map to the current sort order
    const balanceMap = useMemo(() => {
        const ordered = [...filteredTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        let balance = 0;
        const map = new Map<string, number>();

        ordered.forEach(tx => {
            if (tx.type === TransactionType.INCOME) {
                balance += tx.amount;
            } else if (tx.type === TransactionType.EXPENSE) {
                balance -= tx.amount;
            }
            map.set(tx.id, balance);
        });

        return map;
    }, [filteredTransactions]);

    const transactionsWithBalance = useMemo(() => {
        return sortedTransactions.map(tx => ({
            ...tx,
            balance: balanceMap.get(tx.id) ?? 0
        }));
    }, [sortedTransactions, balanceMap]);

    // Group transactions if needed
    const groupedTransactions = useMemo(() => {
        if (filters.groupBy === 'none') {
            return [{ key: 'all', title: 'All Transactions', transactions: transactionsWithBalance }];
        }

        const groups = new Map<string, Transaction[]>();

        transactionsWithBalance.forEach(tx => {
            let key = '';
            let title = '';

            switch (filters.groupBy) {
                case 'date':
                    key = tx.date.substring(0, 7); // YYYY-MM
                    title = new Date(key + '-01').toLocaleString('default', { month: 'long', year: 'numeric' });
                    break;
                case 'type':
                    key = tx.type;
                    title = tx.type;
                    break;
                case 'account':
                    key = tx.accountId || 'no-account';
                    title = lookupMaps.accounts.get(tx.accountId)?.name || 'No Account';
                    break;
                case 'category':
                    key = tx.categoryId || 'no-category';
                    title = lookupMaps.categories.get(tx.categoryId)?.name || 'No Category';
                    break;
                case 'contact':
                    key = tx.contactId || 'no-contact';
                    title = lookupMaps.contacts.get(tx.contactId)?.name || 'No Contact';
                    break;
            }

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(tx);
        });

        return Array.from(groups.entries()).map(([key, transactions]) => {
            if (!transactions || transactions.length === 0) {
                return { key, title: 'Unknown', transactions: [] };
            }

            let title = 'Unknown';
            const firstTx = transactions[0];

            if (firstTx) {
                switch (filters.groupBy) {
                    case 'date':
                        title = new Date(firstTx.date.substring(0, 7) + '-01').toLocaleString('default', { month: 'long', year: 'numeric' });
                        break;
                    case 'type':
                        title = firstTx.type;
                        break;
                    case 'account':
                        title = lookupMaps.accounts.get(firstTx.accountId)?.name || 'No Account';
                        break;
                    case 'category':
                        title = lookupMaps.categories.get(firstTx.categoryId)?.name || 'No Category';
                        break;
                    case 'contact':
                        title = lookupMaps.contacts.get(firstTx.contactId)?.name || 'No Contact';
                        break;
                }
            }

            return { key, title, transactions };
        });
    }, [transactionsWithBalance, filters.groupBy, lookupMaps]);

    // Handlers - use startTransition for non-urgent updates
    const handleSort = useCallback((key: SortKey) => {
        startFilterTransition(() => {
            setSortConfig(current => ({
                key,
                direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
            }));
        });
    }, [startFilterTransition]);

    const handleRowClick = useCallback((transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setIsDrawerOpen(true);
    }, []);

    const handleExport = useCallback(() => {
        const filename = `Ledger_${new Date().toISOString().split('T')[0]}.xlsx`;
        exportToExcel(state, filename, progress, dispatch);
    }, [state, progress, dispatch]);

    const handleClearFilters = useCallback(() => {
        startFilterTransition(() => {
            setFilters(initialFilters);
            setSearchInput('');
        });
    }, [startFilterTransition]);

    const handlePrint = useCallback(() => {
        triggerPrint('REPORT', { elementId: 'printable-area' });
    }, [triggerPrint]);

    const toggleExpandRow = useCallback((id: string) => {
        setExpandedRowIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const activeFiltersCount = useMemo(() => {
        if (!filters || typeof filters !== 'object') return 0;
        try {
            return Object.entries(filters).filter(([key, value]) =>
                key !== 'groupBy' && key !== 'searchQuery' && value
            ).length;
        } catch (error) {
            console.error('Error calculating active filters count:', error);
            return 0;
        }
    }, [filters]);

    return (
        <div className="flex flex-col min-h-full bg-slate-50/50 gap-2 sm:gap-4">
            {/* Control Bar - All options in one row: period, type, search, filters, actions */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3 flex-shrink-0">
                {/* Period: Monthly / All Time + Month picker */}
                {!filters.startDate && !filters.endDate && (
                    <>
                        <div className="flex bg-slate-100/80 p-1 rounded-xl flex-shrink-0">
                            <button
                                onClick={() => setViewMode('month')}
                                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${viewMode === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Monthly
                            </button>
                            <button
                                onClick={() => setViewMode('all')}
                                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${viewMode === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                All Time
                            </button>
                        </div>
                        {viewMode === 'month' && (
                            <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden flex items-center h-8 flex-shrink-0">
                                <MonthNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                            </div>
                        )}
                        <div className="w-px h-6 bg-slate-200 flex-shrink-0 hidden sm:block"></div>
                    </>
                )}

                {/* Type filter buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Type:</span>
                    <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100/80 rounded-xl">
                        {[
                            { value: '', label: 'All' },
                            { value: 'Income', label: 'Income' },
                            { value: 'Expense', label: 'Expense' },
                            { value: 'Transfer', label: 'Transfer' },
                            { value: 'Loan', label: 'Loan' },
                        ].map(({ value, label }) => (
                            <button
                                key={value || 'all'}
                                onClick={() => startFilterTransition(() => setFilters(prev => ({ ...prev, type: value, categoryId: '' })))}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    (filters.type || '') === value
                                        ? value === 'Income'
                                            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                                            : value === 'Expense'
                                            ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30'
                                            : value === 'Transfer'
                                            ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-500/30'
                                            : value === 'Loan'
                                            ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                                            : 'bg-slate-700 text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-white hover:text-slate-800 hover:shadow-sm'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="w-px h-6 bg-slate-200 flex-shrink-0 hidden sm:block"></div>

                {/* Search */}
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <div className="w-4 h-4">{ICONS.search}</div>
                    </div>
                    <input
                        type="text"
                        placeholder="Filter by reference or name..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="pl-9 pr-8 py-1.5 w-full text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                    />
                    {searchInput && (
                        <button onClick={() => setSearchInput('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-rose-500">
                            <div className="w-4 h-4">{ICONS.x}</div>
                        </button>
                    )}
                </div>

                {/* Filter Button */}
                <button
                    onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                    className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border flex-shrink-0 ${activeFiltersCount > 0
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                >
                    <div className="w-4 h-4 opacity-70">{ICONS.filter}</div>
                    <span>Filters</span>
                    {activeFiltersCount > 0 && (
                        <span className="bg-indigo-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                            {activeFiltersCount}
                        </span>
                    )}
                </button>

                <div className="w-px h-6 bg-slate-200 flex-shrink-0 hidden sm:block"></div>

                {/* Action icons: Print, Export, Import + New Transaction - right-aligned on wide screens */}
                <div className="flex gap-2 items-center ml-auto flex-shrink-0">
                <div className="flex gap-1 items-center bg-slate-100/50 p-1 rounded-lg">
                    <button onClick={handlePrint} className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-white rounded-md transition-all" title="Print Ledger">
                        <div className="w-4 h-4">{ICONS.fileText}</div>
                    </button>
                    <button onClick={handleExport} className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-white rounded-md transition-all" title="Export to Excel">
                        <div className="w-4 h-4">{ICONS.download}</div>
                    </button>
                    <button
                        onClick={() => {
                            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.PAYMENTS });
                            dispatch({ type: 'SET_PAGE', payload: 'import' });
                        }}
                        className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-white rounded-md transition-all" title="Import Data"
                    >
                        <div className="w-4 h-4">{ICONS.upload}</div>
                    </button>
                </div>

                {/* New Transaction */}
                <Button
                    onClick={() => { setSelectedTransaction(null); setIsAddModalOpen(true); }}
                    className="!px-4 !py-2 !rounded-xl !text-sm !bg-indigo-600 hover:!bg-indigo-700 !text-white transition-all shadow-md shadow-indigo-500/20"
                >
                    <div className="w-4 h-4 mr-2">{ICONS.plus}</div> New Transaction
                </Button>
                </div>
            </div>

            {/* Collapsible Filter Panel */}
            {isFilterPanelOpen && (
                <div className="flex-shrink-0 animate-in slide-in-from-top duration-300">
                    <LedgerFilters
                        filters={filters}
                        onFiltersChange={(newFilters) => {
                            startFilterTransition(() => {
                                setFilters(newFilters);
                            });
                        }}
                        onClear={handleClearFilters}
                        onClose={() => setIsFilterPanelOpen(false)}
                    />
                </div>
            )}

            {/* Printable content - Summary + Table (unified print service) */}
            <div className="flex flex-col gap-2 sm:gap-4 flex-grow min-h-0 printable-area" id="printable-area">
                <ReportHeader />
                {/* Summary Area */}
                <div className="flex-shrink-0 p-4 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/60 shadow-lg relative overflow-hidden printable-area">
                    <div className="absolute top-0 right-0 p-3 opacity-[0.06] pointer-events-none text-white">
                        <div className="w-24 h-24">{ICONS.barChart}</div>
                    </div>
                    <LedgerSummary transactions={transactionsWithBalance} />
                </div>

                {/* Main Table Area */}
                <div className="min-h-[400px] md:min-h-[500px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative printable-area">
                {isLoadingTransactions && paginatedTransactions.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/10">
                        <div className="relative w-12 h-12 mb-4">
                            <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                        </div>
                        <p className="text-sm font-medium text-slate-500">Retrieving ledger data...</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto p-1 custom-scrollbar">
                        {useVirtualization && sortedTransactions.length > 200 ? (
                            <VirtualizedLedgerTable
                                groups={groupedTransactions}
                                sortConfig={sortConfig}
                                onSort={handleSort}
                                onRowClick={handleRowClick}
                                expandedRowIds={expandedRowIds}
                                onToggleExpand={toggleExpandRow}
                                showGrouping={filters.groupBy !== 'none'}
                                onLoadMore={loadMore}
                                hasMore={hasMore && !shouldUseAllTransactions}
                                isLoading={isLoadingTransactions}
                            />
                        ) : (
                            <LedgerTable
                                groups={groupedTransactions}
                                sortConfig={sortConfig}
                                onSort={handleSort}
                                onRowClick={handleRowClick}
                                expandedRowIds={expandedRowIds}
                                onToggleExpand={toggleExpandRow}
                                showGrouping={filters.groupBy !== 'none'}
                            />
                        )}

                    </div>
                )}

                {/* Status Bar */}
                <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${isUsingNative ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`}></div>
                            <span>Backend: {isUsingNative ? 'High Perf (Native)' : 'Standard (SQL.js)'}</span>
                        </div>
                        <div className="w-px h-3 bg-slate-200"></div>
                        <span>
                            Records: {paginatedTransactions.length}
                            {totalCount !== null && ` of ${totalCount}`}
                            {totalCount === null && ` of ${state.transactions.length}`}
                        </span>
                        {isUsingNative && totalCount !== null && totalCount > paginatedTransactions.length && (
                            <span className="text-indigo-500 normal-case font-medium ml-2">
                                (Scroll for more)
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {isNativeEnabled && !isUsingNative && (
                            <span className="text-amber-500 animate-pulse">Switching to native recommended for large data</span>
                        )}
                        <span className="text-slate-300">|</span>
                        <span>V1.1.2</span>
                    </div>
                </div>
            </div>
                <ReportFooter />
            </div>

            {/* Transaction Detail Drawer */}
            <TransactionDetailDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                transaction={selectedTransaction}
                onTransactionUpdated={() => setIsDrawerOpen(false)}
            />

            {/* Add Transaction Modal */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="New Ledger Transaction"
                size="lg"
            >
                <TransactionForm
                    onClose={() => setIsAddModalOpen(false)}
                    transactionToEdit={null}
                    transactionTypeForNew={null}
                    onShowDeleteWarning={() => { }}
                />
            </Modal>
        </div>
    );
};

export default memo(EnhancedLedgerPage);
