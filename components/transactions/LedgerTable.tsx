import React, { useRef, useCallback } from 'react';
import { useLookupMaps } from '../../hooks/useLookupMaps';
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
    const lookups = useLookupMaps();
    const tableRef = useRef<HTMLDivElement>(null);

    const getAccountName = useCallback((id?: string) =>
        (id && lookups.accounts.get(id)?.name) || '-',
        [lookups.accounts]
    );

    const getCategoryName = useCallback((id?: string) =>
        (id && lookups.categories.get(id)?.name) || '-',
        [lookups.categories]
    );

    const getContactName = useCallback((id?: string) =>
        (id && lookups.contacts.get(id)?.name) || '-',
        [lookups.contacts]
    );

    const getContext = useCallback((tx: Transaction) => {
        if (tx.projectId) {
            return { type: 'Project', name: lookups.projects.get(tx.projectId)?.name || '' };
        }
        if (tx.buildingId) {
            return { type: 'Building', name: lookups.buildings.get(tx.buildingId)?.name || '' };
        }
        return null;
    }, [lookups.projects, lookups.buildings]);

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-app-muted opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-primary ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    const renderRow = (tx: Transaction & { balance?: number }, isChild: boolean = false) => {
        const hasChildren = tx.children && tx.children.length > 0;
        const isExpanded = expandedRowIds.has(tx.id);
        const context = getContext(tx);

        const typeStyles = {
            [TransactionType.INCOME]: 'ds-pill-type ds-pill-type-payment',
            [TransactionType.EXPENSE]: 'border border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] text-[color:var(--badge-unpaid-text)]',
            [TransactionType.TRANSFER]: 'ds-pill-type ds-pill-type-installment',
            [TransactionType.LOAN]: 'ds-pill-type ds-pill-type-security',
        };

        const amountColor = {
            [TransactionType.INCOME]: 'text-ds-success',
            [TransactionType.EXPENSE]: 'text-ds-danger',
            [TransactionType.TRANSFER]: 'text-primary',
            [TransactionType.LOAN]: 'text-ds-warning',
        };

        const rowClasses = isChild
            ? 'bg-app-toolbar/50 hover:bg-app-card'
            : hasChildren
                ? isExpanded
                    ? 'bg-nav-active/30 hover:bg-nav-active/40'
                    : 'bg-app-card hover:bg-app-toolbar/80'
                : 'bg-app-card hover:bg-app-toolbar/80';

        return (
            <React.Fragment key={tx.id}>
                <tr
                    className={`${rowClasses} cursor-pointer transition-all duration-150 group border-b border-app-border last:border-0 relative z-0`}
                    onClick={() => !isChild && onRowClick(tx)}
                >
                    {/* Date Column */}
                    <td className="bg-inherit px-3 py-2 border-r border-app-border">
                        <div className="text-[11px] text-app-muted font-mono font-medium leading-none whitespace-nowrap">
                            {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: '2-digit' }).toUpperCase()}
                        </div>
                    </td>

                    {/* Type Column */}
                    <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${typeStyles[tx.type as TransactionType]}`}>
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
                                    className={`flex-shrink-0 w-4 h-4 rounded-md flex items-center justify-center transition-all duration-ds ${isExpanded ? 'bg-nav-active text-primary' : 'bg-app-toolbar text-app-muted'}`}
                                >
                                    <span className="text-[10px] font-bold">{isExpanded ? '−' : '+'}</span>
                                </button>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-app-text truncate leading-tight" title={tx.description}>
                                    {tx.description || '—'}
                                    {hasChildren && <span className="text-primary ml-1.5 opacity-70">[{tx.children?.length}]</span>}
                                </div>
                            </div>
                        </div>
                    </td>

                    {/* Account Column */}
                    <td className="px-3 py-2">
                        <div className="text-[11px] text-app-muted font-medium truncate max-w-[150px]" title={tx.type === TransactionType.TRANSFER ? `${getAccountName(tx.fromAccountId)} → ${getAccountName(tx.toAccountId)}` : getAccountName(tx.accountId)}>
                            {tx.type === TransactionType.TRANSFER ? (
                                <span className="flex items-center gap-1">
                                    <span className="truncate">{getAccountName(tx.fromAccountId)}</span>
                                    <span className="text-app-border">→</span>
                                    <span className="truncate">{getAccountName(tx.toAccountId)}</span>
                                </span>
                            ) : (
                                getAccountName(tx.accountId)
                            )}
                        </div>
                    </td>

                    {/* Category Column */}
                    <td className="px-3 py-2">
                        <span className="inline-flex items-center text-[10px] font-medium text-app-muted bg-app-toolbar px-1.5 py-0.5 rounded border border-app-border truncate max-w-[120px]">
                            {getCategoryName(tx.categoryId)}
                        </span>
                    </td>

                    {/* Contact Column */}
                    <td className="px-3 py-2">
                        <div className="text-[11px] text-app-muted truncate max-w-[120px]" title={getContactName(tx.contactId)}>
                            {getContactName(tx.contactId)}
                        </div>
                    </td>

                    {/* Context Column */}
                    <td className="px-3 py-2">
                        {context ? (
                            <div className="text-[10px] font-bold text-app-muted uppercase tracking-tight truncate max-w-[100px]" title={`${context.type}: ${context.name}`}>
                                {context.name}
                            </div>
                        ) : (
                            <span className="text-app-border">—</span>
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
                    <td className="bg-inherit px-3 py-2 border-l border-app-border">
                        <div className={`text-xs font-bold tabular-nums text-app-text`}>
                            <span className="text-[10px] opacity-40 mr-0.5 font-sans font-medium">{CURRENCY}</span>
                            {(tx.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-center">
                        <button
                            onClick={(e) => { e.stopPropagation(); onRowClick(tx); }}
                            className="w-6 h-6 flex items-center justify-center text-app-muted hover:text-primary hover:bg-nav-active rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-ds"
                        >
                            <div className="w-4 h-4">{ICONS.chevronRight}</div>
                        </button>
                    </td>
                </tr>

                {/* Expanded Children */}
                {isExpanded && hasChildren && (
                    <tr>
                        <td colSpan={10} className="p-0 bg-app-toolbar/40 border-b border-app-border">
                            <div className="ml-10 mr-4 my-2 rounded-xl border border-app-border bg-app-card shadow-ds-card overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-app-table-header border-b border-app-border">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold text-app-muted uppercase tracking-widest">Date</th>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold text-app-muted uppercase tracking-widest">Description</th>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold text-app-muted uppercase tracking-widest">Category</th>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold text-app-muted uppercase tracking-widest">Contact</th>
                                            <th className="px-4 py-2 text-right text-[9px] font-bold text-app-muted uppercase tracking-widest">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-app-border">
                                        {tx.children?.map(child => (
                                            <tr
                                                key={child.id}
                                                className="hover:bg-app-table-hover cursor-pointer transition-colors duration-ds"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRowClick(child);
                                                }}
                                            >
                                                <td className="px-4 py-2 text-[10px] text-app-muted font-mono">
                                                    {formatDate(child.date)}
                                                </td>
                                                <td className="px-4 py-2 text-xs font-semibold text-app-text">
                                                    {child.description}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span className="text-[10px] text-app-muted bg-app-toolbar px-1.5 py-0.5 rounded border border-app-border">{getCategoryName(child.categoryId)}</span>
                                                </td>
                                                <td className="px-4 py-2 text-[10px] text-app-muted">
                                                    {getContactName(child.contactId)}
                                                </td>
                                                <td className="px-4 py-2 text-xs font-bold tabular-nums text-right text-app-text">
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
            <div className="flex flex-col items-center justify-center h-64 text-app-muted">
                <div className="w-12 h-12 mb-4 opacity-20">{ICONS.fileText}</div>
                <p className="text-sm font-bold text-app-text tracking-tight">No transactions matching your criteria</p>
                <p className="text-xs text-app-muted mt-1">Try resetting the filters or changing the period.</p>
            </div>
        );
    }

    return (
        <div ref={tableRef} className="w-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 overflow-x-auto scroll-container-x border-b border-app-border bg-app-card">
                <table className="w-full table-fixed min-w-[1200px] border-separate border-spacing-0">
                    <thead>
                        <tr className="bg-app-table-header">
                            <th className="bg-app-table-header w-[90px] px-3 py-2.5 text-left cursor-pointer hover:bg-app-toolbar transition-colors border-r border-app-border" onClick={() => onSort('date')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-app-muted uppercase tracking-widest">
                                    <span>Date</span>
                                    <SortIcon column="date" />
                                </div>
                            </th>
                            <th className="w-[85px] px-3 py-2.5 text-left cursor-pointer hover:bg-app-toolbar transition-colors" onClick={() => onSort('type')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-app-muted uppercase tracking-widest">
                                    <span>Type</span>
                                    <SortIcon column="type" />
                                </div>
                            </th>
                            <th className="px-3 py-2.5 text-left cursor-pointer hover:bg-app-toolbar transition-colors min-w-[300px]" onClick={() => onSort('description')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-app-muted uppercase tracking-widest">
                                    <span>Detailed Description</span>
                                    <SortIcon column="description" />
                                </div>
                            </th>
                            <th className="w-40 px-3 py-2.5 text-left cursor-pointer hover:bg-app-toolbar transition-colors" onClick={() => onSort('account')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-app-muted uppercase tracking-widest">
                                    <span>Account</span>
                                    <SortIcon column="account" />
                                </div>
                            </th>
                            <th className="w-32 px-3 py-2.5 text-left cursor-pointer hover:bg-app-toolbar transition-colors" onClick={() => onSort('category')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-app-muted uppercase tracking-widest">
                                    <span>Category</span>
                                    <SortIcon column="category" />
                                </div>
                            </th>
                            <th className="w-32 px-3 py-2.5 text-left cursor-pointer hover:bg-app-toolbar transition-colors" onClick={() => onSort('contact')}>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-app-muted uppercase tracking-widest">
                                    <span>Contact</span>
                                    <SortIcon column="contact" />
                                </div>
                            </th>
                            <th className="w-28 px-3 py-2.5 text-left text-[10px] font-bold text-app-muted uppercase tracking-widest">
                                <span>Context</span>
                            </th>
                            <th className="w-32 px-3 py-2.5 text-right cursor-pointer hover:bg-app-toolbar transition-colors" onClick={() => onSort('amount')}>
                                <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-app-muted uppercase tracking-widest">
                                    <span>Amount</span>
                                    <SortIcon column="amount" />
                                </div>
                            </th>
                            <th className="bg-app-table-header w-32 px-3 py-2.5 text-right cursor-pointer hover:bg-app-toolbar transition-colors border-l border-app-border" onClick={() => onSort('balance')}>
                                <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-app-muted uppercase tracking-widest">
                                    <span>Balance</span>
                                    <SortIcon column="balance" />
                                </div>
                            </th>
                            <th className="w-12 px-2 py-2.5 text-center text-[10px] font-bold text-app-muted uppercase tracking-widest">Act</th>
                        </tr>
                    </thead>
                </table>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-x-auto scroll-container-x min-w-[1200px]">
                <table className="w-full table-fixed border-separate border-spacing-0">
                    <tbody className="divide-y divide-app-border">
                        {groups.map((group) => (
                            <React.Fragment key={group.key}>
                                {showGrouping && (
                                    <tr className="bg-app-toolbar/50">
                                        <td colSpan={10} className="px-4 py-2 border-y border-app-border">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-primary bg-nav-active px-1.5 py-0.5 rounded uppercase tracking-widest">{group.title}</span>
                                                    <span className="text-[9px] font-bold text-app-muted">{group.transactions.length} RECORDS</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs font-bold tabular-nums">
                                                    {(() => {
                                                        const summary = calculateGroupSummary(group.transactions);
                                                        return (
                                                            <>
                                                                <span className="text-ds-success">IN: {CURRENCY} {summary.income.toLocaleString()}</span>
                                                                <span className="text-app-border">/</span>
                                                                <span className="text-ds-danger">OUT: {CURRENCY} {summary.expense.toLocaleString()}</span>
                                                                <span className="text-app-border">/</span>
                                                                <span className={`${summary.net >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>NET: {CURRENCY} {summary.net.toLocaleString()}</span>
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

export default React.memo(LedgerTable);

