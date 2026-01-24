import React, { useMemo, useRef, useCallback, CSSProperties } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Transaction, TransactionType, LedgerSortKey as SortKey, SortDirection } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';

interface LedgerTableProps {
    groups: {
        key: string;
        title: string;
        transactions: Array<Transaction & { balance?: number }>;
    }[];
    sortConfig: { key: SortKey; direction: SortDirection };
    onSort: (key: SortKey) => void;
    onRowClick: (transaction: Transaction) => void;
    expandedRowIds: Set<string>;
    onToggleExpand: (id: string) => void;
    showGrouping: boolean;
}

const LedgerTable: React.FC<LedgerTableProps> = ({
    groups,
    sortConfig,
    onSort,
    onRowClick,
    expandedRowIds,
    onToggleExpand,
    showGrouping
}) => {
    const { state } = useAppContext();
    const tableRef = useRef<HTMLDivElement>(null);

    const getAccountName = useCallback((id?: string) =>
        state.accounts.find(a => a.id === id)?.name || '-',
        [state.accounts]
    );

    const getCategoryName = useCallback((id?: string) =>
        state.categories.find(c => c.id === id)?.name || '-',
        [state.categories]
    );

    const getContactName = useCallback((id?: string) =>
        state.contacts.find(c => c.id === id)?.name || '-',
        [state.contacts]
    );

    const getContext = useCallback((tx: Transaction) => {
        if (tx.projectId) {
            return { type: 'Project', name: state.projects.find(p => p.id === tx.projectId)?.name || '' };
        }
        if (tx.buildingId) {
            return { type: 'Building', name: state.buildings.find(b => b.id === tx.buildingId)?.name || '' };
        }
        return null;
    }, [state.projects, state.buildings]);

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-indigo-600 ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    const renderRow = (tx: Transaction & { balance?: number }, isChild: boolean = false) => {
        const hasChildren = tx.children && tx.children.length > 0;
        const isExpanded = expandedRowIds.has(tx.id);
        const context = getContext(tx);

        const typeStyles = {
            [TransactionType.INCOME]: 'text-emerald-700 bg-emerald-50 border-emerald-200',
            [TransactionType.EXPENSE]: 'text-rose-700 bg-rose-50 border-rose-200',
            [TransactionType.TRANSFER]: 'text-indigo-700 bg-indigo-50 border-indigo-200',
            [TransactionType.LOAN]: 'text-amber-700 bg-amber-50 border-amber-200',
        };

        const amountColor = {
            [TransactionType.INCOME]: 'text-emerald-600',
            [TransactionType.EXPENSE]: 'text-rose-600',
            [TransactionType.TRANSFER]: 'text-indigo-600',
            [TransactionType.LOAN]: 'text-amber-600',
        };

        const rowClasses = isChild
            ? 'bg-slate-50/50 hover:bg-white'
            : hasChildren
                ? isExpanded
                    ? 'bg-indigo-50/20 hover:bg-indigo-50/30'
                    : 'bg-white hover:bg-slate-50'
                : 'bg-white hover:bg-slate-50';

        return (
            <React.Fragment key={tx.id}>
                <tr
                    className={`${rowClasses} cursor-pointer transition-all duration-150 group border-b border-slate-100 last:border-0 relative z-0`}
                    onClick={() => !isChild && onRowClick(tx)}
                >
                    {/* Date Column */}
                    <td className="bg-inherit px-3 py-2 border-r border-slate-100">
                        <div className="text-[11px] text-slate-600 font-mono font-medium leading-none whitespace-nowrap">
                            {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: '2-digit' }).toUpperCase()}
                        </div>
                    </td>

                    {/* Type Column */}
                    <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${typeStyles[tx.type as TransactionType]}`}>
                            {tx.type}
                        </span>
                    </td>

                    {/* Description Column */}
                    <td className="px-3 py-2 min-w-[300px]">
                        <div className="flex items-center gap-2">
                            {hasChildren && !isChild && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleExpand(tx.id);
                                    }}
                                    className={`flex-shrink-0 w-4 h-4 rounded-md flex items-center justify-center transition-all ${isExpanded ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}
                                >
                                    <span className="text-[10px] font-bold">{isExpanded ? '−' : '+'}</span>
                                </button>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-slate-800 truncate leading-tight" title={tx.description}>
                                    {tx.description || '—'}
                                    {hasChildren && <span className="text-indigo-600 ml-1.5 opacity-70">[{tx.children?.length}]</span>}
                                </div>
                            </div>
                        </div>
                    </td>

                    {/* Account Column */}
                    <td className="hidden lg:table-cell px-3 py-2">
                        <div className="text-[11px] text-slate-600 font-medium truncate max-w-[150px]" title={tx.type === TransactionType.TRANSFER ? `${getAccountName(tx.fromAccountId)} → ${getAccountName(tx.toAccountId)}` : getAccountName(tx.accountId)}>
                            {tx.type === TransactionType.TRANSFER ? (
                                <span className="flex items-center gap-1">
                                    <span className="truncate">{getAccountName(tx.fromAccountId)}</span>
                                    <span className="text-slate-300">→</span>
                                    <span className="truncate">{getAccountName(tx.toAccountId)}</span>
                                </span>
                            ) : (
                                getAccountName(tx.accountId)
                            )}
                        </div>
                    </td>

                    {/* Category Column */}
                    <td className="hidden sm:table-cell px-3 py-2">
                        <span className="inline-flex items-center text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[120px]">
                            {getCategoryName(tx.categoryId)}
                        </span>
                    </td>

                    {/* Contact Column */}
                    <td className="hidden md:table-cell px-3 py-2">
                        <div className="text-[11px] text-slate-600 truncate max-w-[120px]" title={getContactName(tx.contactId)}>
                            {getContactName(tx.contactId)}
                        </div>
                    </td>

                    {/* Context Column */}
                    <td className="hidden xl:table-cell px-3 py-2">
                        {context ? (
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate max-w-[100px]" title={`${context.type}: ${context.name}`}>
                                {context.name}
                            </div>
                        ) : (
                            <span className="text-slate-200">—</span>
                        )}
                    </td>

                    {/* Amount Column */}
                    <td className="px-3 py-2 text-right">
                        <div className={`text-xs font-bold tabular-nums ${amountColor[tx.type as TransactionType]}`}>
                            <span className="text-[10px] opacity-60 mr-0.5 font-sans font-medium">{tx.type === TransactionType.EXPENSE ? '-' : tx.type === TransactionType.INCOME ? '+' : ''}{CURRENCY}</span>
                            {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                    </td>

                    {/* Balance Column */}
                    <td className="bg-inherit px-3 py-2 border-l border-slate-100">
                        <div className={`text-xs font-bold tabular-nums text-slate-900`}>
                            <span className="text-[10px] opacity-40 mr-0.5 font-sans font-medium">{CURRENCY}</span>
                            {(tx.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-center">
                        <button
                            onClick={(e) => { e.stopPropagation(); onRowClick(tx); }}
                            className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        >
                            <div className="w-4 h-4">{ICONS.chevronRight}</div>
                        </button>
                    </td>
                </tr>

                {/* Expanded Children */}
                {isExpanded && hasChildren && (
                    <tr>
                        <td colSpan={12} className="p-0 bg-slate-50 border-b border-slate-100">
                            <div className="ml-10 mr-4 my-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-widest">Date</th>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-widest">Description</th>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-widest">Category</th>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-widest">Contact</th>
                                            <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-500 uppercase tracking-widest">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {tx.children?.map(child => (
                                            <tr
                                                key={child.id}
                                                className="hover:bg-indigo-50/30 cursor-pointer transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRowClick(child);
                                                }}
                                            >
                                                <td className="px-4 py-2 text-[10px] text-slate-500 font-mono">
                                                    {formatDate(child.date)}
                                                </td>
                                                <td className="px-4 py-2 text-xs font-semibold text-slate-800">
                                                    {child.description}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{getCategoryName(child.categoryId)}</span>
                                                </td>
                                                <td className="px-4 py-2 text-[10px] text-slate-500">
                                                    {getContactName(child.contactId)}
                                                </td>
                                                <td className="px-4 py-2 text-xs font-bold tabular-nums text-right text-slate-900">
                                                    <span className="text-[9px] opacity-40 mr-0.5">{CURRENCY}</span>
                                                    {child.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                </td>
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
    };

    const calculateGroupSummary = (transactions: Transaction[]) => {
        return transactions.reduce(
            (acc, tx) => {
                if (tx.type === TransactionType.INCOME) {
                    acc.income += tx.amount;
                    acc.net += tx.amount;
                } else if (tx.type === TransactionType.EXPENSE) {
                    acc.expense += tx.amount;
                    acc.net -= tx.amount;
                }
                acc.count++;
                return acc;
            },
            { income: 0, expense: 0, net: 0, count: 0 }
        );
    };

    if (groups.length === 0 || groups.every(g => g.transactions.length === 0)) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <div className="w-12 h-12 mb-4 opacity-20">{ICONS.fileText}</div>
                <p className="text-sm font-bold text-slate-500 tracking-tight">No transactions matching your criteria</p>
                <p className="text-xs text-slate-400 mt-1">Try resetting the filters or changing the period.</p>
            </div>
        );
    }

    return (
        <div ref={tableRef} className="w-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 overflow-x-auto scroll-container-x border-b border-slate-200 bg-white">
                <table className="w-full table-fixed min-w-[800px] md:min-w-[1200px] border-separate border-spacing-0">
                    <thead>
                        <tr className="bg-slate-50/50">
                            <th className="bg-slate-100 w-[80px] md:w-[90px] px-2 md:px-3 py-2.5 text-left cursor-pointer hover:bg-slate-200/50 transition-colors border-r border-slate-200" onClick={() => onSort('date')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Date</span>
                                    <SortIcon column="date" />
                                </div>
                            </th>
                            <th className="w-[70px] md:w-[85px] px-2 md:px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => onSort('type')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Type</span>
                                    <SortIcon column="type" />
                                </div>
                            </th>
                            <th className="px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50 transition-colors min-w-[200px] md:min-w-[300px]" onClick={() => onSort('description')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Detailed Description</span>
                                    <SortIcon column="description" />
                                </div>
                            </th>
                            <th className="hidden lg:table-cell w-40 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => onSort('account')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Account</span>
                                    <SortIcon column="account" />
                                </div>
                            </th>
                            <th className="hidden sm:table-cell w-32 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => onSort('category')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Category</span>
                                    <SortIcon column="category" />
                                </div>
                            </th>
                            <th className="hidden md:table-cell w-32 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => onSort('contact')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Contact</span>
                                    <SortIcon column="contact" />
                                </div>
                            </th>
                            <th className="hidden xl:table-cell w-28 px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                <span>Context</span>
                            </th>
                            <th className="w-28 md:w-32 px-2 md:px-3 py-2.5 text-right cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => onSort('amount')}>
                                <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Amount</span>
                                    <SortIcon column="amount" />
                                </div>
                            </th>
                            <th className="bg-slate-100 w-28 md:w-32 px-2 md:px-3 py-2.5 text-right cursor-pointer hover:bg-slate-200/50 transition-colors border-l border-slate-200" onClick={() => onSort('balance')}>
                                <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Balance</span>
                                    <SortIcon column="balance" />
                                </div>
                            </th>
                            <th className="w-10 md:w-12 px-1 md:px-2 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">Act</th>
                        </tr>
                    </thead>
                </table>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-x-auto scroll-container-x min-w-[800px] md:min-w-[1200px]">
                <table className="w-full table-fixed border-separate border-spacing-0">
                    <tbody className="divide-y divide-slate-100">
                        {groups.map((group) => (
                            <React.Fragment key={group.key}>
                                {showGrouping && (
                                    <tr className="bg-slate-50/30">
                                        <td colSpan={12} className="px-4 py-2 border-y border-slate-100">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-widest">{group.title}</span>
                                                    <span className="text-[9px] font-bold text-slate-400">{group.transactions.length} RECORDS</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] font-mono font-bold tabular-nums">
                                                    {(() => {
                                                        const summary = calculateGroupSummary(group.transactions);
                                                        return (
                                                            <>
                                                                <span className="text-emerald-600">IN: {CURRENCY} {summary.income.toLocaleString()}</span>
                                                                <span className="text-slate-300">/</span>
                                                                <span className="text-rose-500">OUT: {CURRENCY} {summary.expense.toLocaleString()}</span>
                                                                <span className="text-slate-300">/</span>
                                                                <span className={`${summary.net >= 0 ? 'text-slate-800' : 'text-rose-800'}`}>NET: {CURRENCY} {summary.net.toLocaleString()}</span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {group.transactions.map(tx => renderRow(tx))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LedgerTable;

