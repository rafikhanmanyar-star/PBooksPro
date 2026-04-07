
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, InvoiceType, TransactionType, ProjectAgreementStatus, Transaction } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { useNotification } from '../../context/NotificationContext';
import ReportToolbar from './ReportToolbar';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { OWNER_LEDGER_PRINT_CSS } from './ownerLedgerPrint.css';

interface LedgerItem {
    id: string;
    date: string;
    ownerName: string;
    unitName: string;
    projectName: string;
    particulars: string;
    debit: number; // Invoice amount, Refund Given, or Penalty
    credit: number; // Payment Received
    balance: number;
}

interface AgreementSummary {
    id: string;
    ownerName: string;
    projectName: string;
    unitNames: string;
    listPrice: number;
    discounts: { label: string; amount: number }[];
    sellingPrice: number;
    totalReceived: number;
    remainingAmount: number;
}

/** Tree + filters: all owners, one owner, or one unit (under an owner). */
export type LedgerTreeSelection =
    | { kind: 'all' }
    | { kind: 'owner'; ownerId: string }
    | { kind: 'unit'; unitId: string };

function invoiceMatchesUnit(
    inv: { id: string; unitId?: string | null; agreementId?: string | null },
    unitId: string,
    agreementUnitMap: Map<string, Set<string>>
): boolean {
    if (inv.unitId === unitId) return true;
    if (inv.agreementId) {
        const set = agreementUnitMap.get(inv.agreementId);
        return set?.has(unitId) ?? false;
    }
    return false;
}

function transactionMatchesUnit(
    tx: Transaction,
    unitId: string,
    agreementUnitMap: Map<string, Set<string>>,
    invoices: { id: string; unitId?: string | null; agreementId?: string | null }[]
): boolean {
    if (tx.unitId === unitId) return true;
    if (tx.invoiceId) {
        const inv = invoices.find(i => i.id === tx.invoiceId);
        if (inv) return invoiceMatchesUnit(inv, unitId, agreementUnitMap);
    }
    if (tx.agreementId) {
        return agreementUnitMap.get(tx.agreementId)?.has(unitId) ?? false;
    }
    return false;
}

const ClientLedgerReport: React.FC = () => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const { openChat } = useWhatsApp();

    const handlePrint = () => {
        window.print();
    };
    
    // Date Filter State (default: Total = full history range)
    const [dateRangeType, setDateRangeType] = useState<'total' | 'thisMonth' | 'lastMonth' | 'custom'>('total');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    
    const [ledgerSelection, setLedgerSelection] = useState<LedgerTreeSelection>({ kind: 'all' });
    const [treeSearch, setTreeSearch] = useState('');

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: keyof LedgerItem; direction: 'asc' | 'desc' } | null>(null);

    const handleRangeChange = (type: 'total' | 'thisMonth' | 'lastMonth' | 'custom') => {
        setDateRangeType(type);
        const now = new Date();
        if (type === 'total') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (type === 'thisMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
        } else if (type === 'lastMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 0)));
        }
    };

    const handleDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        if (dateRangeType !== 'custom') {
            setDateRangeType('custom');
        }
    };

    // Include both CLIENT and OWNER types
    const owners = useMemo(() => state.contacts.filter(c => c.type === ContactType.CLIENT || c.type === ContactType.OWNER), [state.contacts]);

    const agreementUnitMap = useMemo(() => {
        const m = new Map<string, Set<string>>();
        state.projectAgreements.forEach(pa => {
            m.set(pa.id, new Set(pa.unitIds || []));
        });
        return m;
    }, [state.projectAgreements]);

    /** Owners with units for sidebar tree (agreements + installment invoices). */
    const ledgerTreeOwners = useMemo(() => {
        const ownerUnits = new Map<string, Map<string, { name: string; projectName: string }>>();
        const put = (ownerId: string, unitId: string, unitName: string, projectName: string) => {
            if (!ownerUnits.has(ownerId)) ownerUnits.set(ownerId, new Map());
            ownerUnits.get(ownerId)!.set(unitId, { name: unitName, projectName });
        };
        state.projectAgreements.forEach(pa => {
            const project = state.projects.find(p => p.id === pa.projectId);
            const pn = project?.name || 'Unknown';
            (pa.unitIds || []).forEach(uid => {
                const u = state.units.find(x => x.id === uid);
                if (u) put(pa.clientId, uid, u.name, pn);
            });
        });
        state.invoices
            .filter(inv => inv.invoiceType === InvoiceType.INSTALLMENT && inv.contactId && inv.unitId)
            .forEach(inv => {
                const u = state.units.find(x => x.id === inv.unitId);
                if (!u) return;
                const project = inv.projectId ? state.projects.find(p => p.id === inv.projectId) : undefined;
                put(inv.contactId!, inv.unitId!, u.name, project?.name || 'Unknown');
            });
        return [...ownerUnits.entries()]
            .map(([ownerId, umap]) => {
                const owner = state.contacts.find(c => c.id === ownerId);
                const units = [...umap.entries()]
                    .map(([id, meta]) => ({ id, name: meta.name, projectName: meta.projectName }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                return { id: ownerId, name: owner?.name || 'Unknown', units };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [state.projectAgreements, state.projects, state.units, state.invoices, state.contacts]);

    const filteredLedgerTree = useMemo(() => {
        const q = treeSearch.trim().toLowerCase();
        if (!q) return ledgerTreeOwners;
        return ledgerTreeOwners
            .map(o => {
                const ownerHit = o.name.toLowerCase().includes(q);
                const units = ownerHit
                    ? o.units
                    : o.units.filter(
                          u =>
                              u.name.toLowerCase().includes(q) ||
                              u.projectName.toLowerCase().includes(q)
                      );
                if (!ownerHit && units.length === 0) return null;
                return { ...o, units };
            })
            .filter(Boolean) as typeof ledgerTreeOwners;
    }, [ledgerTreeOwners, treeSearch]);

    const resolvedWhatsappOwnerId = useMemo(() => {
        if (ledgerSelection.kind === 'owner') return ledgerSelection.ownerId;
        if (ledgerSelection.kind === 'unit') {
            const pa = state.projectAgreements.find(p => p.unitIds?.includes(ledgerSelection.unitId));
            if (pa) return pa.clientId;
            const inv = state.invoices.find(
                i => i.invoiceType === InvoiceType.INSTALLMENT && i.unitId === ledgerSelection.unitId
            );
            return inv?.contactId ?? null;
        }
        return null;
    }, [ledgerSelection, state.projectAgreements, state.invoices]);

    const selectionSubtitle = useMemo(() => {
        if (ledgerSelection.kind === 'all') return 'All Owners';
        if (ledgerSelection.kind === 'owner') {
            return state.contacts.find(c => c.id === ledgerSelection.ownerId)?.name || 'Owner';
        }
        const u = state.units.find(x => x.id === ledgerSelection.unitId);
        const oid = resolvedWhatsappOwnerId;
        const on = oid ? state.contacts.find(c => c.id === oid)?.name : '';
        return u ? `Unit: ${u.name}${on ? ` (${on})` : ''}` : 'Unit';
    }, [ledgerSelection, state.contacts, state.units, resolvedWhatsappOwnerId]);

    // --- Summary Data Calculation ---
    const agreementSummaries = useMemo<AgreementSummary[]>(() => {
        const agreements = state.projectAgreements.filter(pa => {
            if (ledgerSelection.kind === 'all') return true;
            if (ledgerSelection.kind === 'owner') return pa.clientId === ledgerSelection.ownerId;
            return pa.unitIds?.includes(ledgerSelection.unitId) ?? false;
        });

        return agreements.map(pa => {
            const owner = state.contacts.find(c => c.id === pa.clientId);
            const project = state.projects.find(p => p.id === pa.projectId);
            const units = state.units.filter(u => pa.unitIds?.includes(u.id) ?? false);
            const unitLabel =
                ledgerSelection.kind === 'unit'
                    ? units.find(u => u.id === ledgerSelection.unitId)?.name ||
                      state.units.find(u => u.id === ledgerSelection.unitId)?.name ||
                      units.map(u => u.name).join(', ')
                    : units.map(u => u.name).join(', ');

            let agreementInvoices = state.invoices.filter(
                inv =>
                    inv.agreementId === pa.id &&
                    inv.invoiceType === InvoiceType.INSTALLMENT &&
                    (ledgerSelection.kind === 'all' || inv.contactId === pa.clientId)
            );
            if (ledgerSelection.kind === 'owner') {
                agreementInvoices = agreementInvoices.filter(inv => inv.contactId === ledgerSelection.ownerId);
            } else if (ledgerSelection.kind === 'unit') {
                agreementInvoices = agreementInvoices.filter(inv =>
                    invoiceMatchesUnit(inv, ledgerSelection.unitId, agreementUnitMap)
                );
            }

            const agreementInvoiceIds = new Set(agreementInvoices.map(inv => inv.id));

            const totalReceived = state.transactions
                .filter(tx => {
                    if (tx.type !== TransactionType.INCOME) return false;
                    if (!tx.invoiceId) return false;
                    if (!agreementInvoiceIds.has(tx.invoiceId)) return false;
                    const inv = state.invoices.find(i => i.id === tx.invoiceId);
                    if (!inv || inv.invoiceType !== InvoiceType.INSTALLMENT) return false;
                    if (ledgerSelection.kind === 'owner' && tx.contactId !== ledgerSelection.ownerId) return false;
                    if (ledgerSelection.kind === 'unit' && tx.invoiceId) {
                        const inv2 = state.invoices.find(i => i.id === tx.invoiceId);
                        if (inv2 && !invoiceMatchesUnit(inv2, ledgerSelection.unitId, agreementUnitMap)) return false;
                    }
                    return true;
                })
                .reduce((sum, tx) => sum + tx.amount, 0);

            const discounts = [
                { label: 'Customer Discount', amount: pa.customerDiscount },
                { label: 'Floor Discount', amount: pa.floorDiscount },
                { label: 'Lump Sum Discount', amount: pa.lumpSumDiscount },
                { label: 'Misc Discount', amount: pa.miscDiscount },
            ].filter(d => d.amount > 0);

            return {
                id: pa.id,
                ownerName: owner?.name || 'Unknown',
                projectName: project?.name || 'Unknown',
                unitNames: unitLabel,
                listPrice: pa.listPrice,
                discounts,
                sellingPrice: pa.sellingPrice,
                totalReceived,
                remainingAmount: pa.sellingPrice - totalReceived
            };
        });
    }, [
        state.projectAgreements,
        state.contacts,
        state.projects,
        state.units,
        state.invoices,
        state.transactions,
        ledgerSelection,
        agreementUnitMap
    ]);


    const reportData = useMemo<LedgerItem[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Rental Category Set for exclusion
        const rentalCategoryIds = new Set(state.categories.filter(c => c.isRental).map(c => c.id));

        // 1. Invoices (Debit - They owe us) - Only Project Installments
        let ownerInvoices = state.invoices.filter(inv => inv.invoiceType === InvoiceType.INSTALLMENT);

        if (ledgerSelection.kind === 'owner') {
            ownerInvoices = ownerInvoices.filter(inv => inv.contactId === ledgerSelection.ownerId);
        } else if (ledgerSelection.kind === 'unit') {
            ownerInvoices = ownerInvoices.filter(inv =>
                invoiceMatchesUnit(inv, ledgerSelection.unitId, agreementUnitMap)
            );
        }

        // 2. Payments Received (Credit - They paid us) - INCOME
        let ownerPayments = state.transactions.filter(tx => 
            tx.type === TransactionType.INCOME &&
            tx.invoiceId // Must be linked to an invoice
        );
        
        // STRICTER FILTER: Ensure linked invoice is INSTALLMENT type (not Rental)
        ownerPayments = ownerPayments.filter(tx => {
             const inv = state.invoices.find(i => i.id === tx.invoiceId);
             return inv && inv.invoiceType === InvoiceType.INSTALLMENT;
        });

        // 3. Refunds/Payouts Given (Debit - We paid them back) - EXPENSE
        let ownerRefunds = state.transactions.filter(tx => 
            tx.type === TransactionType.EXPENSE &&
            tx.contactId 
        );
        
        // STRICTER FILTER: Exclude Rental Categories and ensure it's likely project related
        ownerRefunds = ownerRefunds.filter(tx => !tx.categoryId || !rentalCategoryIds.has(tx.categoryId));

        if (ledgerSelection.kind === 'all') {
            const ownerIds = new Set(owners.map(c => c.id));
            ownerPayments = ownerPayments.filter(tx => tx.contactId && ownerIds.has(tx.contactId));
            ownerRefunds = ownerRefunds.filter(tx => tx.contactId && ownerIds.has(tx.contactId));
        } else if (ledgerSelection.kind === 'owner') {
            ownerPayments = ownerPayments.filter(tx => tx.contactId === ledgerSelection.ownerId);
            ownerRefunds = ownerRefunds.filter(tx => tx.contactId === ledgerSelection.ownerId);
        } else {
            ownerPayments = ownerPayments.filter(tx =>
                transactionMatchesUnit(tx, ledgerSelection.unitId, agreementUnitMap, state.invoices)
            );
            ownerRefunds = ownerRefunds.filter(tx =>
                transactionMatchesUnit(tx, ledgerSelection.unitId, agreementUnitMap, state.invoices)
            );
        }

        const rawItems: { date: string, ownerName: string, unitName: string, projectName: string, particulars: string, debit: number, credit: number }[] = [];
        
        // Helper to get Unit/Project Name
        const getContext = (invoiceId?: string, projectId?: string, agreementId?: string) => {
            let unitName = '-';
            let projectName = '-';
            
            if (projectId) {
                projectName = state.projects.find(p => p.id === projectId)?.name || '-';
            }

            if (invoiceId) {
                const inv = state.invoices.find(i => i.id === invoiceId);
                if (inv) {
                    if (inv.unitId) unitName = state.units.find(u => u.id === inv.unitId)?.name || '-';
                    if (!projectName && inv.projectId) projectName = state.projects.find(p => p.id === inv.projectId)?.name || '-';
                }
            }
            
            return { unitName, projectName };
        };

        // Add Invoices
        ownerInvoices.forEach(inv => {
            const invDate = new Date(inv.issueDate);
            if(invDate >= start && invDate <= end) {
                const owner = state.contacts.find(c => c.id === inv.contactId);
                const { unitName, projectName } = getContext(inv.id, inv.projectId);
                rawItems.push({ 
                    date: inv.issueDate, 
                    ownerName: owner?.name || 'Unknown',
                    unitName,
                    projectName,
                    particulars: `Invoice #${inv.invoiceNumber}`, 
                    debit: inv.amount, 
                    credit: 0 
                });
            }
        });

        // Add Payments (Income)
        ownerPayments.forEach(tx => {
            const txDate = new Date(tx.date);
            if(txDate >= start && txDate <= end) {
                const owner = state.contacts.find(c => c.id === tx.contactId);
                const { unitName, projectName } = getContext(tx.invoiceId, tx.projectId);
                rawItems.push({ 
                    date: tx.date, 
                    ownerName: owner?.name || 'Unknown',
                    unitName,
                    projectName,
                    particulars: tx.description || 'Payment Received', 
                    debit: 0, 
                    credit: tx.amount 
                });
            }
        });

        // Add Refunds (Expense)
        ownerRefunds.forEach(tx => {
            const txDate = new Date(tx.date);
            if(txDate >= start && txDate <= end) {
                const owner = state.contacts.find(c => c.id === tx.contactId);
                const { unitName, projectName } = getContext(tx.invoiceId, tx.projectId);
                rawItems.push({ 
                    date: tx.date, 
                    ownerName: owner?.name || 'Unknown',
                    unitName,
                    projectName,
                    particulars: tx.description || 'Refund/Payout Given', 
                    debit: tx.amount, 
                    credit: 0 
                });
            }
        });

        // 4. Synthetic Penalties (Debit)
        state.projectAgreements.forEach(pa => {
            if (pa.status === ProjectAgreementStatus.CANCELLED && pa.cancellationDetails && pa.cancellationDetails.penaltyAmount > 0) {
                const paMatches =
                    ledgerSelection.kind === 'all' ||
                    (ledgerSelection.kind === 'owner' && pa.clientId === ledgerSelection.ownerId) ||
                    (ledgerSelection.kind === 'unit' && (pa.unitIds?.includes(ledgerSelection.unitId) ?? false));
                if (paMatches) {
                    const cancelDate = new Date(pa.cancellationDetails.date);
                    if (cancelDate >= start && cancelDate <= end) {
                        const owner = state.contacts.find(c => c.id === pa.clientId);
                        const project = state.projects.find(p => p.id === pa.projectId);
                        const unitNamesStr =
                            ledgerSelection.kind === 'unit'
                                ? state.units.find(u => u.id === ledgerSelection.unitId)?.name || '-'
                                : state.units.filter(u => pa.unitIds?.includes(u.id) ?? false).map(u => u.name).join(', ');
                        
                        rawItems.push({
                            date: pa.cancellationDetails.date,
                            ownerName: owner?.name || 'Unknown',
                            unitName: unitNamesStr || '-',
                            projectName: project?.name || '-',
                            particulars: `Cancellation Penalty - Agreement #${pa.agreementNumber}`,
                            debit: pa.cancellationDetails.penaltyAmount,
                            credit: 0
                        });
                    }
                }
            }
        });
        
        // Sort Chronologically
        rawItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (sortConfig) {
            rawItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
                if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        let runningBalance = 0;
        const finalItems: LedgerItem[] = rawItems.map((item, index) => {
            runningBalance += item.debit - item.credit;
            return { ...item, id: `${item.date}-${index}`, balance: runningBalance };
        });

        return finalItems;

    }, [state, startDate, endDate, ledgerSelection, agreementUnitMap, owners, sortConfig]);
    
    const requestSort = (key: keyof LedgerItem) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const totals = useMemo(() => {
        return reportData.reduce((acc, item) => {
            acc.debit += item.debit;
            acc.credit += item.credit;
            return acc;
        }, { debit: 0, credit: 0 });
    }, [reportData]);


    const handleExport = () => {
        const data = reportData.map(item => ({
            'Date': formatDate(item.date),
            'Owner': item.ownerName,
            'Unit': item.unitName,
            'Project': item.projectName,
            'Particulars': item.particulars,
            'Debit (Due)': item.debit,
            'Credit (Paid)': item.credit,
            'Balance': item.balance,
        }));
        exportJsonToExcel(data, `project-owner-ledger.xlsx`, 'Owner Ledger');
    };

    const handleWhatsApp = async () => {
        const waOwnerId = resolvedWhatsappOwnerId;
        const selectedOwner = waOwnerId ? owners.find(c => c.id === waOwnerId) : undefined;
        if (!waOwnerId || !selectedOwner?.contactNo) {
            await showAlert("Please select a single owner (or a unit) with a contact number to send a report.");
            return;
        }

        try {
            const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;
            
            let message = `*Statement for ${selectedOwner.name}*\n`;
            message += `Period: ${formatDate(startDate)} to ${formatDate(endDate)}\n\n`;
            message += `Final Balance Due: *${CURRENCY} ${finalBalance.toLocaleString()}*\n\n`;
            message += `This is an automated summary from PBooksPro.`;

            sendOrOpenWhatsApp(
                { contact: selectedOwner, message, phoneNumber: selectedOwner.contactNo },
                () => state.whatsAppMode,
                openChat
            );
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };
    
    const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;

    const SortHeader: React.FC<{ label: string; sortKey: keyof LedgerItem; align?: 'left' | 'right' }> = ({
        label,
        sortKey,
        align = 'left'
    }) => (
        <th 
            className={`px-3 py-2 font-semibold text-app-muted bg-app-table-header cursor-pointer hover:bg-app-toolbar/60 select-none ${align === 'right' ? 'text-right num' : 'text-left'}`}
            onClick={() => requestSort(sortKey)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {label}
                {sortConfig?.key === sortKey && (
                    <span className="text-xs text-app-muted">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
            </div>
        </th>
    );

    const renderLedgerRows = () => (
        <tbody className="divide-y divide-app-border">
            {reportData.map(item => (
                <tr key={item.id} className="hover:bg-app-toolbar/60 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap text-app-text">{formatDate(item.date)}</td>
                    <td className="px-3 py-2 whitespace-normal break-words text-app-text">{item.ownerName}</td>
                    <td className="px-3 py-2 whitespace-normal break-words text-app-text">{item.unitName}</td>
                    <td className="px-3 py-2 max-w-xs whitespace-normal break-words text-app-text">{item.particulars}</td>
                    <td className="px-3 py-2 text-right text-ds-danger tabular-nums whitespace-nowrap num">{item.debit > 0 ? `${CURRENCY} ${item.debit.toLocaleString()}` : '-'}</td>
                    <td className="px-3 py-2 text-right text-ds-success tabular-nums whitespace-nowrap num">{item.credit > 0 ? `${CURRENCY} ${item.credit.toLocaleString()}` : '-'}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap num ${item.balance > 0 ? 'text-ds-danger' : 'text-app-text'}`}>{CURRENCY} {item.balance.toLocaleString()}</td>
                </tr>
            ))}
        </tbody>
    );

    return (
        <>
            <style>{OWNER_LEDGER_PRINT_CSS}</style>
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0 no-print">
                    <ReportToolbar
                        startDate={startDate}
                        endDate={endDate}
                        onDateChange={handleDateChange}
                        onExport={handleExport}
                        onPrint={handlePrint}
                        onWhatsApp={handleWhatsApp}
                        disableWhatsApp={!resolvedWhatsappOwnerId}
                        hideSearch
                        hideGroup
                        hideDate={dateRangeType !== 'custom'}
                    >
                        <div className="flex flex-col gap-1 min-w-[240px] no-print">
                            <label className="block text-sm font-medium text-slate-600">Date Filter</label>
                            <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200 gap-1">
                                {(['total', 'thisMonth', 'lastMonth', 'custom'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => handleRangeChange(type)}
                                        className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                                            dateRangeType === type 
                                            ? 'bg-white shadow-sm text-accent border border-slate-200' 
                                            : 'text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {type === 'total' ? 'Total' : type === 'thisMonth' ? 'This' : type === 'lastMonth' ? 'Last' : 'Custom'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </ReportToolbar>
                </div>

                <div className="flex-grow flex flex-row min-h-0 gap-3 overflow-hidden bg-background">
                    <aside className="no-print print:hidden flex flex-col w-64 min-w-[200px] max-w-[300px] flex-shrink-0 border border-app-border rounded-lg bg-app-card shadow-ds-card p-3">
                        <span className="text-xs font-medium text-app-muted uppercase tracking-wide mb-2">Owners & units</span>
                        <input
                            type="search"
                            value={treeSearch}
                            onChange={e => setTreeSearch(e.target.value)}
                            placeholder="Search owners / units..."
                            className="w-full px-2 py-1.5 text-sm border border-app-border rounded-md bg-background text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                            aria-label="Filter owner and unit list"
                        />
                        <div className="flex-1 overflow-y-auto mt-3 space-y-1 min-h-0">
                            <button
                                type="button"
                                onClick={() => setLedgerSelection({ kind: 'all' })}
                                className={`w-full text-left px-2 py-2 rounded-md text-sm transition-colors ${
                                    ledgerSelection.kind === 'all'
                                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                                        : 'text-app-text hover:bg-app-toolbar'
                                }`}
                            >
                                All owners
                            </button>
                            {filteredLedgerTree.map(owner => (
                                <div key={owner.id} className="border-t border-app-border/60 pt-2 first:border-t-0 first:pt-0">
                                    <button
                                        type="button"
                                        onClick={() => setLedgerSelection({ kind: 'owner', ownerId: owner.id })}
                                        className={`w-full text-left px-2 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                            ledgerSelection.kind === 'owner' && ledgerSelection.ownerId === owner.id
                                                ? 'bg-indigo-600 text-white'
                                                : 'text-app-text hover:bg-app-toolbar'
                                        }`}
                                    >
                                        {owner.name}
                                    </button>
                                    <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-app-border/80 ml-1.5">
                                        {owner.units.map(u => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                onClick={() => setLedgerSelection({ kind: 'unit', unitId: u.id })}
                                                className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                                                    ledgerSelection.kind === 'unit' && ledgerSelection.unitId === u.id
                                                        ? 'bg-indigo-600 text-white font-semibold'
                                                        : 'text-app-muted hover:bg-app-toolbar hover:text-app-text'
                                                }`}
                                                title={u.projectName}
                                            >
                                                <span className="block truncate">{u.name}</span>
                                                <span className="block truncate text-[10px] opacity-80">{u.projectName}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {filteredLedgerTree.length === 0 && (
                                <p className="text-xs text-app-muted px-1 py-2">No owners/units match the tree filter.</p>
                            )}
                        </div>
                    </aside>

                    <div className="flex-grow overflow-y-auto min-h-0 flex flex-col">
                        <div id="print-area" className="print-container flex-grow min-h-0 flex flex-col">
                            <Card className="min-h-full flex flex-col p-4 md:p-6 print-container-inner">
                                <div className="owner-ledger-company-header">
                                    <ReportHeader />
                                </div>
                                <div className="owner-ledger-title-block text-center mb-6 flex-shrink-0">
                                    <h2 className="text-2xl font-bold text-app-text">Owner Ledger (Project)</h2>
                                    <p className="text-sm text-app-muted">
                                        From {formatDate(startDate)} to {formatDate(endDate)}
                                    </p>
                                    <p className="text-sm text-app-muted font-semibold">Selection: {selectionSubtitle}</p>
                                </div>

                        {/* Summaries Section */}
                        {agreementSummaries.length > 0 && (
                            <div className="mb-4 grid grid-cols-1 gap-4 print:break-inside-avoid overflow-y-auto max-h-[25vh] pr-1 border border-app-border rounded-lg p-2 bg-app-toolbar/40 flex-shrink-0">
                                {agreementSummaries.map(summary => (
                                    <div key={summary.id} className="p-4 bg-app-card rounded-lg border border-app-border text-sm shadow-ds-card">
                                        <div className="summary-grid grid grid-cols-3 gap-4 divide-x divide-app-border">
                                            {/* Section 1: Owner information, unit name and project name */}
                                            <div className="summary-col flex flex-col gap-2 pr-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-app-muted font-medium text-xs uppercase tracking-wide">Owner Information</span>
                                                    <span className="font-bold text-app-text text-base">{summary.ownerName}</span>
                                                </div>
                                                <div className="flex flex-col gap-1 mt-2">
                                                    <span className="text-app-muted text-xs">Unit:</span>
                                                    <span className="font-bold text-app-text">{summary.unitNames}</span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-app-muted text-xs">Project name:</span>
                                                    <span className="font-semibold text-app-text">{summary.projectName}</span>
                                                </div>
                                            </div>

                                            {/* Section 2: List price and discounts */}
                                            <div className="summary-col flex flex-col gap-2 px-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-app-muted font-medium text-xs uppercase tracking-wide">Pricing</span>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-app-muted">List price:</span>
                                                        <span className="font-medium text-app-text tabular-nums">{CURRENCY} {summary.listPrice.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                {summary.discounts.length > 0 && (
                                                    <div className="flex flex-col gap-1 mt-2">
                                                        <span className="text-app-muted text-xs mb-1">Discounts:</span>
                                                        {summary.discounts.map((d, i) => (
                                                            <div key={i} className="flex justify-between text-app-muted text-xs">
                                                                <span>{d.label}:</span>
                                                                <span className="text-ds-danger tabular-nums">-{CURRENCY} {d.amount.toLocaleString()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="flex justify-between border-t border-app-border pt-2 mt-auto">
                                                    <span className="font-semibold text-app-text">Selling price:</span>
                                                    <span className="font-bold text-primary tabular-nums">{CURRENCY} {summary.sellingPrice.toLocaleString()}</span>
                                                </div>
                                            </div>

                                            {/* Section 3: Payment received and remaining payment */}
                                            <div className="summary-col flex flex-col gap-2 pl-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-app-muted font-medium text-xs uppercase tracking-wide">Payments</span>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-app-muted">Payment received:</span>
                                                        <span className="font-semibold text-ds-success tabular-nums">{CURRENCY} {summary.totalReceived.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between border-t border-app-border pt-2 mt-auto">
                                                    <span className="font-semibold text-app-text">Remaining:</span>
                                                    <span className="font-bold text-ds-danger text-base tabular-nums">{CURRENCY} {summary.remainingAmount.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {reportData.length > 0 ? (
                            <div className="owner-ledger-table-wrap overflow-auto flex-grow border border-app-border rounded-lg shadow-ds-card relative min-h-[300px]">
                                <table className="owner-ledger-print-table min-w-full divide-y divide-app-border text-sm relative">
                                    <thead className="bg-app-table-header border-b border-app-border sticky top-0 z-10">
                                        <tr>
                                            <SortHeader label="Date" sortKey="date" align="left" />
                                            <SortHeader label="Owner" sortKey="ownerName" align="left" />
                                            <SortHeader label="Unit" sortKey="unitName" align="left" />
                                            <SortHeader label="Particulars" sortKey="particulars" align="left" />
                                            <SortHeader label="Debit (Due)" sortKey="debit" align="right" />
                                            <SortHeader label="Credit (Paid)" sortKey="credit" align="right" />
                                            <SortHeader label="Balance" sortKey="balance" align="right" />
                                        </tr>
                                    </thead>
                                    {renderLedgerRows()}
                                    <tfoot className="bg-app-toolbar border-t border-app-border font-bold sticky bottom-0 z-10 shadow-ds-card">
                                        <tr className="totals">
                                            <td colSpan={4} className="px-3 py-2 text-right text-sm text-app-text">Totals (Period)</td>
                                            <td className="px-3 py-2 text-right text-sm text-ds-danger tabular-nums whitespace-nowrap num">{CURRENCY} {totals.debit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm text-ds-success tabular-nums whitespace-nowrap num">{CURRENCY} {totals.credit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm text-app-text tabular-nums whitespace-nowrap num">
                                                {ledgerSelection.kind !== 'all' ? `${CURRENCY} ${finalBalance.toLocaleString()}` : '-'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (<div className="text-center py-16"><p className="text-app-muted">No ledger transactions found for the selected criteria.</p></div>)}
                                <div className="owner-ledger-report-footer flex-shrink-0 mt-auto pt-4">
                                    <ReportFooter />
                                </div>
                                <div className="hidden print:block owner-ledger-print-footer">
                                    Printed on: {new Date().toLocaleString()}
                                </div>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ClientLedgerReport;
