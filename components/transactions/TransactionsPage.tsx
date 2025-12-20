import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Transaction, TransactionType, InvoiceType } from '../../types';
import TransactionForm from './TransactionForm';
import { ICONS, CURRENCY } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import MonthNavigator from './MonthNavigator';
import ExportModal from './ExportModal';
import { exportToExcel } from '../../services/exportService';
import { useProgress } from '../../context/ProgressContext';
import LinkedTransactionWarningModal from './LinkedTransactionWarningModal';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import { formatDate } from '../../utils/dateUtils';
import useLocalStorage from '../../hooks/useLocalStorage';
import { ImportType } from '../../services/importService';

interface FilterCriteria {
    startDate: string;
    endDate: string;
    type: string;
    accountId: string;
    categoryId: string;
    contactId: string;
    projectId: string;
    buildingId: string;
    minAmount: string;
    maxAmount: string;
}

const initialFilters: FilterCriteria = {
    startDate: '',
    endDate: '',
    type: '',
    accountId: '',
    categoryId: '',
    contactId: '',
    projectId: '',
    buildingId: '',
    minAmount: '',
    maxAmount: ''
};

type SortKey = 'date' | 'type' | 'description' | 'amount' | 'account' | 'category' | 'contact' | 'context' | 'reference';

const TransactionsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const progress = useProgress();
    
    // View State
    const [viewMode, setViewMode] = useLocalStorage<'month' | 'all'>('transactions_viewMode', 'month');
    const [currentDate, setCurrentDate] = useState(new Date());
    
    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [filters, setFilters] = useState<FilterCriteria>(initialFilters);
    const [tempFilters, setTempFilters] = useState<FilterCriteria>(initialFilters);

    // Transaction Interaction State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [initialType, setInitialType] = useState<TransactionType | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'edit' | 'delete' | null; }>({ isOpen: false, transaction: null, action: null });

    // Table State
    const [sortConfig, setSortConfig] = useLocalStorage<{ key: SortKey; direction: 'asc' | 'desc' }>('transactions_sort', { key: 'date', direction: 'desc' });
    const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    // Handle quick actions from dashboard
    useEffect(() => {
        if (state.initialTransactionType) {
            setInitialType(state.initialTransactionType);
            setIsAddModalOpen(true);
            dispatch({ type: 'CLEAR_INITIAL_TRANSACTION_TYPE' });
        }
        if (state.initialTransactionFilter) {
            setSearchQuery(state.initialTransactionFilter.name);
            dispatch({ type: 'SET_INITIAL_TRANSACTION_FILTER', payload: null });
        }
    }, [state.initialTransactionType, state.initialTransactionFilter, dispatch]);

    // --- Data Processing ---
    // ... (Consolidate Batches logic remains the same)
    const consolidatedTransactions = useMemo(() => {
        const raw = state.transactions;
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
                     const inv = state.invoices.find(i => i.id === t.invoiceId);
                     return inv?.invoiceType === InvoiceType.RENTAL;
                 }
                 const cat = state.categories.find(c => c.id === t.categoryId);
                 return cat?.isRental;
             });

             const isPayroll = batchTxs.some(t => t.payslipId);

             if (isRental || isPayroll) {
                 const totalAmount = batchTxs.reduce((sum, t) => sum + t.amount, 0);
                 const template = batchTxs[0];
                 const uniqueContacts = new Set(batchTxs.map(t => t.contactId).filter(Boolean));
                 const commonContactId = uniqueContacts.size === 1 ? Array.from(uniqueContacts)[0] : undefined;
                 const uniqueBuildings = new Set(batchTxs.map(t => t.buildingId).filter(Boolean));
                 const commonBuildingId = uniqueBuildings.size === 1 ? Array.from(uniqueBuildings)[0] : undefined;
                 
                 let desc = `Bulk Payment (${batchTxs.length} items)`;
                 if (isPayroll) desc = `Payroll Batch (${batchTxs.length} items)`;
                 else if (isRental) desc = `Rental Bulk Payment (${batchTxs.length} items)`;

                 const parent: Transaction = {
                     ...template,
                     id: `batch-${tx.batchId}`,
                     description: desc,
                     amount: totalAmount,
                     children: batchTxs,
                     contactId: commonContactId,
                     buildingId: commonBuildingId,
                     projectId: undefined, invoiceId: undefined, billId: undefined, payslipId: undefined 
                 };
                 result.push(parent);
                 processedBatchIds.add(tx.batchId);
             } else {
                 result.push(tx);
             }
        });
        return result;
    }, [state.transactions, state.invoices, state.categories]);

    // 2. Apply Filters
    const filteredTransactions = useMemo(() => {
        let filtered = consolidatedTransactions;

        if (!state.showSystemTransactions) filtered = filtered.filter(t => !t.isSystem);

        const matchCondition = (tx: Transaction, predicate: (t: Transaction) => boolean): boolean => {
            if (predicate(tx)) return true;
            if (tx.children) return tx.children.some(child => predicate(child));
            return false;
        };

        if (filters.type) filtered = filtered.filter(t => t.type === filters.type);
        if (filters.accountId) filtered = filtered.filter(t => matchCondition(t, tx => tx.accountId === filters.accountId || tx.fromAccountId === filters.accountId || tx.toAccountId === filters.accountId));
        if (filters.categoryId) filtered = filtered.filter(t => matchCondition(t, tx => tx.categoryId === filters.categoryId));
        if (filters.contactId) filtered = filtered.filter(t => matchCondition(t, tx => tx.contactId === filters.contactId));
        if (filters.projectId) filtered = filtered.filter(t => matchCondition(t, tx => tx.projectId === filters.projectId));
        if (filters.buildingId) filtered = filtered.filter(t => matchCondition(t, tx => tx.buildingId === filters.buildingId));
        if (filters.minAmount) { const min = parseFloat(filters.minAmount); if (!isNaN(min)) filtered = filtered.filter(t => t.amount >= min); }
        if (filters.maxAmount) { const max = parseFloat(filters.maxAmount); if (!isNaN(max)) filtered = filtered.filter(t => t.amount <= max); }

        if (filters.startDate && filters.endDate) {
            filtered = filtered.filter(t => t.date >= filters.startDate && t.date <= filters.endDate);
        } else if (!searchQuery && viewMode === 'month') {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            filtered = filtered.filter(t => t.date.startsWith(`${year}-${month}`));
        }

        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(t => matchCondition(t, tx => 
                (tx.description?.toLowerCase() || '').includes(lowerQuery) ||
                (state.accounts.find(a => a.id === tx.accountId)?.name.toLowerCase() || '').includes(lowerQuery) ||
                (tx.amount.toString().includes(lowerQuery)) ||
                (tx.contactId && (state.contacts.find(c => c.id === tx.contactId)?.name.toLowerCase() || '').includes(lowerQuery)) ||
                false
            ));
        }

        return filtered;
    }, [consolidatedTransactions, searchQuery, currentDate, state.accounts, state.contacts, state.showSystemTransactions, filters, viewMode]);

    // 3. Sort
    const sortedTransactions = useMemo(() => {
        setCurrentPage(1);
        return [...filteredTransactions].sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch(sortConfig.key) {
                case 'date': valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); break;
                case 'amount': valA = a.amount; valB = b.amount; break;
                case 'type': valA = a.type; valB = b.type; break;
                case 'description': valA = (a.description || '').toLowerCase(); valB = (b.description || '').toLowerCase(); break;
                case 'account': 
                    valA = (state.accounts.find(ac => ac.id === a.accountId)?.name || '').toLowerCase();
                    valB = (state.accounts.find(ac => ac.id === b.accountId)?.name || '').toLowerCase();
                    break;
                default: valA = a.date; valB = b.date;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredTransactions, sortConfig, state.accounts]);

    const paginatedTransactions = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sortedTransactions.slice(startIndex, startIndex + itemsPerPage);
    }, [sortedTransactions, currentPage]);
    
    const totalPages = Math.ceil(sortedTransactions.length / itemsPerPage);

    const groupedTransactions = useMemo(() => {
        if (sortConfig.key !== 'date') return [{ title: 'Transactions', transactions: paginatedTransactions, summary: calculateSummary(paginatedTransactions) }];
        
        const groups: { title: string; transactions: Transaction[]; summary: { income: number; expense: number; net: number } }[] = [];
        let currentGroup: typeof groups[0] | null = null;

        paginatedTransactions.forEach(tx => {
            const monthKey = tx.date.substring(0, 7);
            const monthName = new Date(monthKey + '-01').toLocaleString('default', { month: 'long', year: 'numeric' });

            if (!currentGroup || currentGroup.title !== monthName) {
                if (currentGroup) groups.push(currentGroup);
                currentGroup = { title: monthName, transactions: [], summary: { income: 0, expense: 0, net: 0 } };
            }
            
            currentGroup.transactions.push(tx);
            
            if (tx.type === TransactionType.INCOME) {
                currentGroup.summary.income += tx.amount;
                currentGroup.summary.net += tx.amount;
            } else if (tx.type === TransactionType.EXPENSE) {
                currentGroup.summary.expense += tx.amount;
                currentGroup.summary.net -= tx.amount;
            }
        });
        if (currentGroup) groups.push(currentGroup);
        
        return groups;
    }, [paginatedTransactions, sortConfig.key]);

    function calculateSummary(txs: Transaction[]) {
        return txs.reduce((acc, tx) => {
            if (tx.type === TransactionType.INCOME) { acc.income += tx.amount; acc.net += tx.amount; }
            else if (tx.type === TransactionType.EXPENSE) { acc.expense += tx.amount; acc.net -= tx.amount; }
            return acc;
        }, { income: 0, expense: 0, net: 0 });
    }

    // --- Handlers ---
    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const toggleExpandRow = (id: string) => {
        setExpandedRowIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleEdit = (tx: Transaction) => {
        setTransactionToEdit(tx);
        setIsAddModalOpen(true);
    };

    const handleExport = () => {
        const filename = `Ledger_${new Date().toISOString().split('T')[0]}.xlsx`;
        exportToExcel(state, filename, progress, dispatch);
        setIsExportModalOpen(false);
    };

    const getAccountName = (id?: string) => state.accounts.find(a => a.id === id)?.name || '';
    const getCategoryName = (id?: string) => state.categories.find(c => c.id === id)?.name || '';
    const getContactName = (id?: string) => state.contacts.find(c => c.id === id)?.name || '';
    const getContext = (tx: Transaction) => {
        if (tx.projectId) return { label: 'Project', name: state.projects.find(p => p.id === tx.projectId)?.name };
        if (tx.buildingId) return { label: 'Building', name: state.buildings.find(b => b.id === tx.buildingId)?.name };
        return null;
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className={`ml-1 text-[10px] ${sortConfig.key === column ? 'text-green-600' : 'text-gray-300'}`}>
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const availableCategories = useMemo(() => {
        if (tempFilters.type === 'Income') return state.categories.filter(c => c.type === TransactionType.INCOME);
        if (tempFilters.type === 'Expense') return state.categories.filter(c => c.type === TransactionType.EXPENSE);
        return state.categories;
    }, [state.categories, tempFilters.type]);
    
    const activeFiltersCount = Object.values(filters).filter(Boolean).length;
    const isDateRangeActive = !!(filters.startDate && filters.endDate);

    return (
        <div className="flex flex-col h-full space-y-3">
            {/* 1. Top Toolbar */}
            <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex-shrink-0 sticky top-0 z-30">
                
                {/* Left: Navigation & View */}
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    {!isDateRangeActive && (
                         <div className="flex bg-gray-100 p-0.5 rounded-lg shadow-inner">
                            <button onClick={() => setViewMode('month')} className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-all ${viewMode === 'month' ? 'bg-white text-green-600 shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'}`}>Monthly</button>
                            <button onClick={() => setViewMode('all')} className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-all ${viewMode === 'all' ? 'bg-white text-green-600 shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'}`}>All Time</button>
                        </div>
                    )}
                    
                    {!isDateRangeActive && viewMode === 'month' ? (
                        <MonthNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                    ) : isDateRangeActive ? (
                         <div className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-green-100 flex items-center gap-2">
                            <span>{formatDate(filters.startDate)} - {formatDate(filters.endDate)}</span>
                            <button onClick={() => setFilters(prev => ({ ...prev, startDate: '', endDate: '' }))} className="hover:text-green-900"><div className="w-4 h-4">{ICONS.x}</div></button>
                        </div>
                    ) : null}
                </div>

                {/* Center/Right: Actions */}
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
                     <div className="relative flex-grow max-w-xs">
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400"><span className="h-4 w-4">{ICONS.search}</span></div>
                        <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 py-1.5 text-xs sm:text-sm" />
                    </div>
                    
                    <Button 
                        variant={activeFiltersCount > 0 ? 'primary' : 'secondary'} 
                        size="sm" 
                        onClick={() => { setTempFilters(filters); setIsFilterModalOpen(true); }} 
                        className={`relative px-2 py-1.5 ${activeFiltersCount > 0 ? 'bg-green-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
                    >
                        <div className="w-4 h-4">{ICONS.filter}</div>
                        {activeFiltersCount > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white">{activeFiltersCount}</span>}
                    </Button>

                    <Button variant="secondary" size="sm" onClick={() => setIsExportModalOpen(true)} className="px-2 py-1.5 bg-white border border-slate-300 text-slate-600">
                        <div className="w-4 h-4">{ICONS.export}</div>
                    </Button>

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.PAYMENTS });
                            dispatch({ type: 'SET_PAGE', payload: 'import' });
                        }}
                        className="px-2 py-1.5 bg-white border border-slate-300 text-slate-600"
                    >
                        <div className="w-4 h-4">{ICONS.download}</div>
                    </Button>
                    
                    <Button size="sm" onClick={() => { setInitialType(null); setTransactionToEdit(null); setIsAddModalOpen(true); }} className="px-3 py-1.5 text-xs sm:text-sm">
                        <div className="w-4 h-4 mr-1">{ICONS.plus}</div> New
                    </Button>
                </div>
            </div>

            {/* 2. Data Table Container */}
            <div className="flex-grow bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-grow overflow-x-auto">
                    <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
                        <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                            <tr>
                                <th className="w-[10%] px-2 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('date')}>Date <SortIcon column="date"/></th>
                                <th className="w-[8%] px-2 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('type')}>Type <SortIcon column="type"/></th>
                                <th className="w-[24%] px-2 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('description')}>Description <SortIcon column="description"/></th>
                                <th className="w-[12%] px-2 py-3 text-right cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('amount')}>Amount <SortIcon column="amount"/></th>
                                <th className="w-[12%] px-2 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('account')}>Account <SortIcon column="account"/></th>
                                <th className="w-[12%] px-2 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('category')}>Category <SortIcon column="category"/></th>
                                <th className="w-[12%] px-2 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('contact')}>Contact <SortIcon column="contact"/></th>
                                <th className="w-[6%] px-2 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('context')}>Ctx <SortIcon column="context"/></th>
                                <th className="w-[4%] px-2 py-3 text-center">Act</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs sm:text-sm">
                            {groupedTransactions.length > 0 ? (
                                groupedTransactions.map((group, groupIdx) => (
                                    <React.Fragment key={groupIdx}>
                                        {sortConfig.key === 'date' && (
                                            <tr className="bg-gray-100/90 backdrop-blur-sm sticky top-[38px] z-10 border-y border-gray-200 shadow-sm">
                                                <td colSpan={9} className="px-4 py-1.5">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-semibold text-gray-700 text-xs">{group.title}</span>
                                                        <div className="flex gap-3 text-[10px] font-mono font-medium tabular-nums">
                                                            <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">+{CURRENCY} {group.summary.income.toLocaleString()}</span>
                                                            <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">-{CURRENCY} {group.summary.expense.toLocaleString()}</span>
                                                            <span className={`px-1.5 py-0.5 rounded border ${group.summary.net >= 0 ? 'text-gray-700 bg-gray-200 border-gray-300' : 'text-red-700 bg-red-200 border-red-300'}`}>
                                                                ={CURRENCY} {group.summary.net.toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        
                                        {group.transactions.map(tx => {
                                            const hasChildren = tx.children && tx.children.length > 0;
                                            const isExpanded = expandedRowIds.has(tx.id);
                                            const context = getContext(tx);
                                            const contactName = getContactName(tx.contactId);
                                            const accountName = getAccountName(tx.accountId);
                                            const categoryName = getCategoryName(tx.categoryId);
                                            
                                            const typeColor = tx.type === TransactionType.INCOME ? 'text-green-600' : 
                                                              tx.type === TransactionType.EXPENSE ? 'text-red-600' : 'text-gray-600';
                                            
                                            const isParentBundle = hasChildren;
                                            let rowClass = "group hover:bg-gray-50 transition-colors cursor-pointer";
                                            if (isParentBundle) {
                                                rowClass = isExpanded 
                                                    ? "bg-green-50 border-l-4 border-green-500 transition-all shadow-inner"
                                                    : "bg-gray-50 border-l-4 border-green-300 hover:bg-green-50/30 transition-all";
                                            } else {
                                                rowClass += " border-l-4 border-transparent";
                                            }

                                            return (
                                                <React.Fragment key={tx.id}>
                                                    <tr className={rowClass} onClick={() => handleEdit(tx)}>
                                                        <td className="px-2 py-2 truncate text-gray-600 font-medium">
                                                            <div className="flex flex-col">
                                                                <span>{new Date(tx.date).getDate()}</span>
                                                                <span className="text-[9px] text-gray-400 uppercase">{new Date(tx.date).toLocaleString('default', { weekday: 'short' })}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-2 truncate">
                                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                                                tx.type === 'Income' ? 'bg-green-100 text-green-700' :
                                                                tx.type === 'Expense' ? 'bg-red-100 text-red-700' :
                                                                'bg-gray-100 text-gray-600'
                                                            }`}>
                                                                {tx.type.substring(0, 3)}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <div className="flex items-center gap-1 overflow-hidden">
                                                                {isParentBundle && (
                                                                     <button 
                                                                        onClick={(e) => { e.stopPropagation(); toggleExpandRow(tx.id); }}
                                                                        className="text-green-600 hover:text-green-700 focus:outline-none"
                                                                    >
                                                                        <div className={`w-3 h-3 transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>{ICONS.chevronRight}</div>
                                                                    </button>
                                                                )}
                                                                <div className="flex-col truncate">
                                                                    <span className="font-medium text-gray-700 block truncate text-xs sm:text-sm" title={tx.description}>{tx.description || '-'}</span>
                                                                    {isParentBundle && <span className="text-[9px] text-green-600 font-semibold">Bundle ({tx.children?.length})</span>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className={`px-2 py-2 text-right font-bold font-mono tabular-nums ${typeColor}`}>{CURRENCY} {tx.amount.toLocaleString()}</td>
                                                        <td className="px-2 py-2 truncate text-gray-600 text-xs" title={accountName}>{accountName}</td>
                                                        <td className="px-2 py-2 truncate text-gray-600 text-xs" title={categoryName}>
                                                            {categoryName && <span className="bg-gray-100 px-1.5 py-0.5 rounded-full border border-gray-200">{categoryName}</span>}
                                                        </td>
                                                        <td className="px-2 py-2 truncate text-gray-600 text-xs" title={contactName}>{contactName}</td>
                                                        <td className="px-2 py-2 truncate text-gray-500 text-xs">
                                                            {context && <span className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 truncate max-w-full inline-block" title={context.name}>{context.name}</span>}
                                                        </td>
                                                        <td className="px-2 py-2 text-center">
                                                            <button onClick={(e) => { e.stopPropagation(); handleEdit(tx); }} className="p-1 text-gray-400 hover:text-green-600 rounded-full hover:bg-green-50 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <div className="w-3 h-3">{ICONS.edit}</div>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    
                                                    {isExpanded && hasChildren && (
                                                        <tr className="bg-slate-50/50">
                                                            <td colSpan={9} className="p-0 border-b border-slate-200">
                                                                <div className="border-l-4 border-indigo-200 ml-6 my-1 rounded-r-md overflow-hidden">
                                                                    <table className="w-full text-xs">
                                                                        <tbody className="divide-y divide-slate-100">
                                                                            {tx.children?.map(child => (
                                                                                <tr key={child.id} className="hover:bg-white cursor-pointer" onClick={() => handleEdit(child)}>
                                                                                    <td className="px-4 py-1.5 w-[10%] text-slate-500">{formatDate(child.date)}</td>
                                                                                    <td className="px-4 py-1.5 w-[35%] truncate font-medium text-slate-700">{child.description}</td>
                                                                                    <td className="px-4 py-1.5 w-[15%] text-right font-mono tabular-nums text-slate-800">{CURRENCY} {child.amount.toLocaleString()}</td>
                                                                                    <td className="px-4 py-1.5 w-[20%] text-slate-500 truncate">{getCategoryName(child.categoryId)}</td>
                                                                                    <td className="px-4 py-1.5 w-[20%] text-slate-500 truncate">{getContactName(child.contactId)}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={9} className="flex flex-col items-center justify-center h-48 text-slate-400">
                                        <div className="w-10 h-10 mb-2 opacity-20">{ICONS.fileText}</div>
                                        <p className="text-xs">No transactions found.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                     <div className="text-[10px] text-slate-500">
                        {paginatedTransactions.length} / {sortedTransactions.length}
                     </div>
                     <div className="flex items-center gap-1">
                         <button 
                             onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                             disabled={currentPage === 1}
                             className="p-1 rounded hover:bg-slate-200 disabled:opacity-50"
                         >
                             {ICONS.chevronLeft}
                         </button>
                         <span className="text-xs font-medium text-slate-700">
                             {currentPage}/{totalPages || 1}
                         </span>
                         <button 
                             onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                             disabled={currentPage === totalPages || totalPages === 0}
                             className="p-1 rounded hover:bg-slate-200 disabled:opacity-50"
                         >
                             {ICONS.chevronRight}
                         </button>
                     </div>
                </div>
            </div>

            <Modal isOpen={isFilterModalOpen} onClose={() => setIsFilterModalOpen(false)} title="Filter Transactions">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Start Date" type="date" value={tempFilters.startDate} onChange={e => setTempFilters(p => ({...p, startDate: e.target.value}))} />
                        <Input label="End Date" type="date" value={tempFilters.endDate} onChange={e => setTempFilters(p => ({...p, endDate: e.target.value}))} />
                    </div>
                    {/* ... (Rest of filter modal inputs) ... */}
                    <div className="grid grid-cols-2 gap-4">
                        <Select label="Type" value={tempFilters.type} onChange={e => setTempFilters(p => ({...p, type: e.target.value}))}>
                            <option value="">All Types</option>
                            <option value="Income">Income</option>
                            <option value="Expense">Expense</option>
                            <option value="Transfer">Transfer</option>
                            <option value="Loan">Loan</option>
                        </Select>
                         <ComboBox label="Account" items={state.accounts} selectedId={tempFilters.accountId} onSelect={(item) => setTempFilters(p => ({...p, accountId: item?.id || ''}))} placeholder="All Accounts" allowAddNew={false}/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <ComboBox label="Category" items={availableCategories} selectedId={tempFilters.categoryId} onSelect={(item) => setTempFilters(p => ({...p, categoryId: item?.id || ''}))} placeholder="All Categories" allowAddNew={false}/>
                        <ComboBox label="Contact" items={state.contacts} selectedId={tempFilters.contactId} onSelect={(item) => setTempFilters(p => ({...p, contactId: item?.id || ''}))} placeholder="All Contacts" allowAddNew={false}/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <ComboBox label="Project" items={state.projects} selectedId={tempFilters.projectId} onSelect={(item) => setTempFilters(p => ({...p, projectId: item?.id || ''}))} placeholder="All Projects" allowAddNew={false}/>
                         <ComboBox label="Building" items={state.buildings} selectedId={tempFilters.buildingId} onSelect={(item) => setTempFilters(p => ({...p, buildingId: item?.id || ''}))} placeholder="All Buildings" allowAddNew={false}/>
                    </div>
                    <div className="flex justify-between pt-4 border-t border-slate-100 mt-4">
                        <Button variant="ghost" onClick={() => { setTempFilters(initialFilters); setFilters(initialFilters); setIsFilterModalOpen(false); }} className="text-gray-500 hover:text-red-600">Clear</Button>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setIsFilterModalOpen(false)}>Cancel</Button>
                            <Button onClick={() => { setFilters(tempFilters); setIsFilterModalOpen(false); }}>Apply</Button>
                        </div>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={transactionToEdit ? 'Edit Transaction' : 'New Transaction'}>
                <TransactionForm 
                    onClose={() => setIsAddModalOpen(false)} 
                    transactionToEdit={transactionToEdit} 
                    transactionTypeForNew={initialType}
                    onShowDeleteWarning={(tx) => { setIsAddModalOpen(false); setWarningModalState({ isOpen: true, transaction: tx, action: 'delete' }); }}
                />
            </Modal>

            <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} onExport={handleExport} />

            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={() => setWarningModalState({ isOpen: false, transaction: null, action: null })}
                onConfirm={() => { if(warningModalState.transaction) dispatch({ type: 'DELETE_TRANSACTION', payload: warningModalState.transaction.id }); setWarningModalState({ isOpen: false, transaction: null, action: null }); }}
                action="delete"
                linkedItemName={transactionToEdit ? 'this item' : 'transaction'}
            />
        </div>
    );
};

export default memo(TransactionsPage);