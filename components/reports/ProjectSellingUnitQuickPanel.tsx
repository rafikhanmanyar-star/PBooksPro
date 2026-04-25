import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { X, HandCoins } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import {
    TransactionType,
    InvoiceType,
    InvoiceStatus,
    ProjectAgreementStatus,
    Invoice,
    Transaction,
    Contact,
} from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import AssetPaymentModal from '../invoices/AssetPaymentModal';
import BrokerPayoutModal from '../payouts/BrokerPayoutModal';
import { buildLedgerPaidByInvoiceMap, getEffectivePaidForInvoice } from '../../utils/ledgerInvoicePayments';

interface ProjectSellingUnitQuickPanelProps {
    isOpen: boolean;
    onClose: () => void;
    unitId: string;
}

type HistoryItemType = 'Invoice' | 'Payment' | 'Expense';

interface HistoryItem {
    id: string;
    date: string;
    type: HistoryItemType;
    reference: string;
    description: string;
    contactName: string;
    amount: number;
    status?: string;
}

type SortKey = 'date' | 'type' | 'reference' | 'description' | 'contactName' | 'amount' | 'status';

const ProjectSellingUnitQuickPanel: React.FC<ProjectSellingUnitQuickPanelProps> = ({
    isOpen,
    onClose,
    unitId,
}) => {
    const { state } = useAppContext();
    const [filterType, setFilterType] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'date',
        direction: 'desc',
    });
    const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentMode, setPaymentMode] = useState<'cash' | 'asset' | null>(null);
    const [brokerPayoutOpen, setBrokerPayoutOpen] = useState(false);
    const [brokerForPayout, setBrokerForPayout] = useState<Contact | null>(null);
    const [balanceDue, setBalanceDue] = useState(0);

    const ledgerPaidByInvoiceId = useMemo(
        () => buildLedgerPaidByInvoiceMap(state.transactions),
        [state.transactions]
    );

    const projectAgreementMap = useMemo(
        () => new Map(state.projectAgreements.map(pa => [pa.id, pa])),
        [state.projectAgreements]
    );
    const unitMap = useMemo(() => new Map(state.units.map(u => [u.id, u])), [state.units]);

    const unitSummary = useMemo(() => {
        if (!unitId) return null;
        const unit = state.units.find(u => u.id === unitId);
        if (!unit) return null;
        const project = state.projects.find(p => p.id === unit.projectId);
        const activeAgreement = state.projectAgreements.find(
            pa => pa.unitIds?.includes(unitId) && pa.status === ProjectAgreementStatus.ACTIVE
        );
        const client = activeAgreement ? state.contacts.find(c => c.id === activeAgreement.clientId) : null;
        const brokerContact =
            activeAgreement?.rebateBrokerId != null
                ? state.contacts.find(c => c.id === activeAgreement.rebateBrokerId) ?? null
                : null;

        const unitInvoices = state.invoices.filter(inv => inv.unitId === unitId);
        const agreementInvoices = activeAgreement
            ? state.invoices.filter(inv => inv.agreementId === activeAgreement.id)
            : [];
        const invoices = unitInvoices.length > 0 ? unitInvoices : agreementInvoices;
        const invoiceIds = new Set(invoices.map(inv => inv.id));

        const incomePayments = state.transactions.filter(
            tx =>
                tx.type === TransactionType.INCOME &&
                (tx.unitId === unitId || (tx.invoiceId != null && invoiceIds.has(tx.invoiceId)))
        );
        const amountReceived = incomePayments.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

        const amountDue = invoices
            .filter(inv => inv.status !== InvoiceStatus.PAID)
            .reduce((sum, inv) => {
                const paid = getEffectivePaidForInvoice(inv.id, inv.paidAmount, ledgerPaidByInvoiceId);
                return sum + Math.max(0, inv.amount - paid);
            }, 0);

        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
        const feeCatId = brokerFeeCategory?.id;
        const rebateCatId = rebateCategory?.id;
        let brokerRebateFullDue = 0;
        if (activeAgreement?.rebateBrokerId && (activeAgreement.rebateAmount || 0) > 0) {
            const bId = activeAgreement.rebateBrokerId;
            const paidAlready = state.transactions
                .filter(
                    tx =>
                        tx.type === TransactionType.EXPENSE &&
                        tx.contactId === bId &&
                        (tx.categoryId === feeCatId || tx.categoryId === rebateCatId) &&
                        tx.agreementId === activeAgreement.id
                )
                .reduce((sum, tx) => sum + tx.amount, 0);
            brokerRebateFullDue = Math.max(0, (activeAgreement.rebateAmount || 0) - paidAlready);
        }

        return {
            projectName: project?.name ?? '—',
            unitName: unit.name,
            clientName: client?.name ?? 'Available',
            listPrice: activeAgreement?.listPrice ?? 0,
            sellingPrice: activeAgreement?.sellingPrice ?? 0,
            agreementNumber: activeAgreement?.agreementNumber,
            amountReceived,
            amountDue,
            brokerRebateFullDue,
            activeAgreement,
            brokerContact,
        };
    }, [unitId, state, ledgerPaidByInvoiceId]);

    const panelInvoices = useMemo(() => {
        if (!unitId) return [];
        const unitInvoices = state.invoices.filter(inv => inv.unitId === unitId);
        const activeAgreement = state.projectAgreements.find(
            pa => pa.unitIds?.includes(unitId) && pa.status === ProjectAgreementStatus.ACTIVE
        );
        const agreementInvoices = activeAgreement
            ? state.invoices.filter(inv => inv.agreementId === activeAgreement.id)
            : [];
        return unitInvoices.length > 0 ? unitInvoices : agreementInvoices;
    }, [unitId, state.invoices, state.projectAgreements]);

    const outstandingInvoices = useMemo(() => {
        return panelInvoices.filter(inv => {
            if (inv.status === InvoiceStatus.PAID) return false;
            const paid = getEffectivePaidForInvoice(inv.id, inv.paidAmount, ledgerPaidByInvoiceId);
            return inv.amount - paid > 0.01;
        });
    }, [panelInvoices, ledgerPaidByInvoiceId]);

    const resolvedPaymentInvoice = useMemo(() => {
        if (!paymentInvoice) return null;
        let { projectId: pid, unitId: uid, categoryId: cid, buildingId: bid, propertyId: propId, contactId: ctId } =
            paymentInvoice;

        if (paymentInvoice.agreementId) {
            const pa = projectAgreementMap.get(paymentInvoice.agreementId);
            if (pa) {
                if (!pid) pid = pa.projectId;
                if (!uid && pa.unitIds?.length) uid = pa.unitIds[0];
                if (!ctId) ctId = pa.clientId;
            }
            if (!pid && uid) {
                const u = unitMap.get(uid);
                if (u?.projectId) pid = u.projectId;
            }
        }
        if (!cid) {
            const catName = paymentInvoice.invoiceType === InvoiceType.INSTALLMENT ? 'Unit Selling Income' : null;
            if (catName) {
                const cat = state.categories.find(c => c.name === catName && c.type === TransactionType.INCOME);
                if (cat) cid = cat.id;
            }
        }

        return { ...paymentInvoice, projectId: pid, unitId: uid, categoryId: cid, buildingId: bid, propertyId: propId, contactId: ctId };
    }, [paymentInvoice, projectAgreementMap, unitMap, state.categories]);

    const historyData = useMemo<HistoryItem[]>(() => {
        if (!unitId) return [];

        const items: HistoryItem[] = [];
        const unitInvoices = state.invoices.filter(inv => inv.unitId === unitId);
        const activeAgreement = state.projectAgreements.find(
            pa => pa.unitIds?.includes(unitId) && pa.status === ProjectAgreementStatus.ACTIVE
        );
        const agreementInvoices = activeAgreement
            ? state.invoices.filter(inv => inv.agreementId === activeAgreement.id)
            : [];
        const invoices = unitInvoices.length > 0 ? unitInvoices : agreementInvoices;
        const invoiceIds = new Set(invoices.map(inv => inv.id));

        invoices.forEach(inv => {
            const contact = state.contacts.find(c => c.id === inv.contactId);
            items.push({
                id: inv.id,
                date: inv.issueDate,
                type: 'Invoice',
                reference: inv.invoiceNumber,
                description: inv.description || '-',
                contactName: contact?.name || 'Unknown',
                amount: inv.amount,
                status: inv.status,
            });
        });

        const paymentTx = state.transactions.filter(
            tx => tx.unitId === unitId || (tx.invoiceId && invoiceIds.has(tx.invoiceId))
        );
        paymentTx.forEach(tx => {
            const contact = state.contacts.find(c => c.id === tx.contactId);
            let type: HistoryItemType = 'Expense';
            if (tx.type === TransactionType.INCOME) type = 'Payment';

            items.push({
                id: tx.id,
                date: tx.date,
                type,
                reference: tx.reference || '',
                description: tx.description || '-',
                contactName: contact?.name || 'Unknown',
                amount: tx.type === TransactionType.EXPENSE ? -tx.amount : tx.amount,
                status: 'Completed',
            });
        });

        return items;
    }, [unitId, state.invoices, state.transactions, state.contacts, state.projectAgreements]);

    const filteredData = useMemo(() => {
        let data = historyData;
        if (filterType !== 'All') {
            data = data.filter(item => item.type === filterType);
        }

        return data.sort((a, b) => {
            let valA: string | number = a[sortConfig.key];
            let valB: string | number = b[sortConfig.key];

            if (sortConfig.key === 'date') {
                valA = new Date(a.date).getTime();
                valB = new Date(b.date).getTime();
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = (typeof valB === 'string' ? valB : '').toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [historyData, filterType, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    useEffect(() => {
        if (!isOpen) {
            setPaymentInvoice(null);
            setIsPaymentModalOpen(false);
            setPaymentMode(null);
            setBrokerPayoutOpen(false);
            setBrokerForPayout(null);
            setFilterType('All');
        }
    }, [isOpen]);

    const handleRecordPayment = useCallback((inv: Invoice) => {
        setPaymentInvoice(inv);
        setIsPaymentModalOpen(true);
        setPaymentMode(null);
    }, []);

    const openPayBroker = useCallback(() => {
        if (!unitSummary?.brokerContact || (unitSummary.brokerRebateFullDue ?? 0) <= 0.01) return;
        setBrokerForPayout(unitSummary.brokerContact);
        setBalanceDue(unitSummary.brokerRebateFullDue);
        setBrokerPayoutOpen(true);
    }, [unitSummary]);

    if (!isOpen) return null;

    return (
        <>
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[1px] overflow-y-auto p-4"
                onClick={e => {
                    if (e.target === e.currentTarget) onClose();
                }}
            >
                <div
                    className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-app-border bg-app-card shadow-ds-card flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between border-b border-app-border px-4 py-3 shrink-0">
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-app-text truncate">
                                Project unit — {unitSummary?.unitName ?? unitId}
                            </h2>
                            {unitSummary && (
                                <p className="text-xs text-app-muted mt-0.5">
                                    {unitSummary.projectName}
                                    {unitSummary.agreementNumber
                                        ? ` · Agreement #${unitSummary.agreementNumber}`
                                        : ''}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-app-toolbar text-app-muted"
                            title="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-4 space-y-4 overflow-y-auto">
                        {unitSummary && (
                            <div className="space-y-3 p-4 bg-app-toolbar/50 rounded-xl border border-app-border/80">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-app-muted">Client / buyer</div>
                                        <div className="font-medium text-app-text">{unitSummary.clientName}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-app-muted">List price</div>
                                        <div className="font-semibold tabular-nums text-app-text">
                                            {CURRENCY} {unitSummary.listPrice.toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-app-muted">Selling price</div>
                                        <div className="font-semibold tabular-nums text-app-text">
                                            {CURRENCY} {unitSummary.sellingPrice.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm border-t border-app-border/60 pt-3">
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-app-muted">Amount received</div>
                                        <div className="font-bold tabular-nums text-ds-success">
                                            {CURRENCY} {unitSummary.amountReceived.toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-app-muted">Invoices due</div>
                                        <div
                                            className={`font-bold tabular-nums ${
                                                unitSummary.amountDue > 0.01 ? 'text-ds-danger' : 'text-app-text'
                                            }`}
                                        >
                                            {CURRENCY} {unitSummary.amountDue.toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-app-muted">Rebate / broker due</div>
                                        <div
                                            className={`font-bold tabular-nums ${
                                                unitSummary.brokerRebateFullDue > 0.01 ? 'text-ds-danger' : 'text-app-text'
                                            }`}
                                        >
                                            {CURRENCY} {unitSummary.brokerRebateFullDue.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                {unitSummary.brokerRebateFullDue > 0.01 && unitSummary.brokerContact && (
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={openPayBroker}
                                            className="inline-flex items-center gap-1.5"
                                        >
                                            <HandCoins className="w-4 h-4" />
                                            Pay broker / rebate
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <h3 className="text-sm font-bold text-app-text mb-2">Outstanding invoices</h3>
                            {outstandingInvoices.length === 0 ? (
                                <p className="text-sm text-app-muted">No outstanding invoices for this unit.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {outstandingInvoices.map(inv => {
                                        const paid = getEffectivePaidForInvoice(
                                            inv.id,
                                            inv.paidAmount,
                                            ledgerPaidByInvoiceId
                                        );
                                        const due = Math.max(0, inv.amount - paid);
                                        const isCancelled =
                                            inv.agreementId &&
                                            state.projectAgreements.find(a => a.id === inv.agreementId)?.status ===
                                                ProjectAgreementStatus.CANCELLED;
                                        return (
                                            <li
                                                key={inv.id}
                                                className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg border border-app-border bg-app-toolbar/30"
                                            >
                                                <div className="min-w-0 text-sm">
                                                    <div className="font-mono text-xs text-app-muted">
                                                        #{inv.invoiceNumber}
                                                    </div>
                                                    <div className="text-app-text truncate">
                                                        {inv.description || 'Installment'}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-sm tabular-nums text-ds-danger">
                                                        {CURRENCY} {due.toLocaleString()}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        variant="primary"
                                                        size="sm"
                                                        disabled={isCancelled}
                                                        onClick={() => handleRecordPayment(inv)}
                                                    >
                                                        Receive
                                                    </Button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <h3 className="text-sm font-bold text-app-text">History (invoices, payments, expenses)</h3>
                        <div className="flex flex-wrap justify-between items-center gap-2">
                            <div className="w-48">
                                <Select
                                    value={filterType}
                                    onChange={e => setFilterType(e.target.value)}
                                    className="py-1.5 text-sm"
                                >
                                    <option value="All">All</option>
                                    <option value="Invoice">Invoices</option>
                                    <option value="Payment">Payments</option>
                                    <option value="Expense">Expenses</option>
                                </Select>
                            </div>
                            <div className="text-sm text-app-muted">{filteredData.length} records</div>
                        </div>

                        <div className="max-h-64 overflow-auto border border-app-border rounded-lg bg-app-card">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-app-toolbar sticky top-0 z-10">
                                    <tr>
                                        <th
                                            onClick={() => handleSort('date')}
                                            className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer"
                                        >
                                            Date <SortIcon column="date" />
                                        </th>
                                        <th
                                            onClick={() => handleSort('type')}
                                            className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer"
                                        >
                                            Type <SortIcon column="type" />
                                        </th>
                                        <th className="px-3 py-2 text-left font-semibold text-app-muted">Ref</th>
                                        <th className="px-3 py-2 text-left font-semibold text-app-muted">Contact</th>
                                        <th className="px-3 py-2 text-right font-semibold text-app-muted">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {filteredData.map((item, idx) => (
                                        <tr key={`${item.id}-${idx}`} className="hover:bg-app-toolbar/40">
                                            <td className="px-3 py-2 whitespace-nowrap text-app-text">
                                                {formatDate(item.date)}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        item.type === 'Invoice'
                                                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                                                            : item.type === 'Payment'
                                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                                    }`}
                                                >
                                                    {item.type}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-app-muted font-mono text-xs">{item.reference}</td>
                                            <td className="px-3 py-2 text-app-text">{item.contactName}</td>
                                            <td
                                                className={`px-3 py-2 text-right font-medium ${
                                                    item.amount >= 0 ? 'text-ds-success' : 'text-ds-danger'
                                                }`}
                                            >
                                                {CURRENCY} {Math.abs(item.amount).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredData.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-3 py-6 text-center text-app-muted">
                                                No records
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-app-border">
                            <Button variant="secondary" onClick={onClose}>
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {isPaymentModalOpen && paymentInvoice && (
                paymentInvoice.invoiceType === InvoiceType.INSTALLMENT ? (
                    <Modal
                        isOpen
                        onClose={() => {
                            setIsPaymentModalOpen(false);
                            setPaymentInvoice(null);
                            setPaymentMode(null);
                        }}
                        title="Receive payment"
                    >
                        {paymentMode === null ? (
                            <div className="space-y-3">
                                <p className="text-sm text-app-muted">How is the client paying?</p>
                                <div className="flex gap-3">
                                    <Button variant="primary" onClick={() => setPaymentMode('cash')}>
                                        Cash / Bank
                                    </Button>
                                    <Button variant="secondary" onClick={() => setPaymentMode('asset')}>
                                        Asset
                                    </Button>
                                </div>
                            </div>
                        ) : paymentMode === 'cash' ? (
                            <div>
                                <button
                                    type="button"
                                    className="text-sm text-app-muted hover:text-app-text mb-2"
                                    onClick={() => setPaymentMode(null)}
                                >
                                    ← Back
                                </button>
                                <TransactionForm
                                    onClose={() => {
                                        setIsPaymentModalOpen(false);
                                        setPaymentInvoice(null);
                                        setPaymentMode(null);
                                    }}
                                    transactionTypeForNew={TransactionType.INCOME}
                                    transactionToEdit={{
                                        id: '',
                                        type: TransactionType.INCOME,
                                        amount: resolvedPaymentInvoice
                                            ? resolvedPaymentInvoice.amount -
                                              getEffectivePaidForInvoice(
                                                  resolvedPaymentInvoice.id,
                                                  resolvedPaymentInvoice.paidAmount,
                                                  ledgerPaidByInvoiceId
                                              )
                                            : 0,
                                        date: toLocalDateString(new Date()),
                                        accountId: '',
                                        invoiceId: resolvedPaymentInvoice?.id,
                                        contactId: resolvedPaymentInvoice?.contactId,
                                        projectId: resolvedPaymentInvoice?.projectId,
                                        unitId: resolvedPaymentInvoice?.unitId,
                                        buildingId: resolvedPaymentInvoice?.buildingId,
                                        propertyId: resolvedPaymentInvoice?.propertyId,
                                        categoryId: resolvedPaymentInvoice?.categoryId,
                                        agreementId: resolvedPaymentInvoice?.agreementId,
                                        description: resolvedPaymentInvoice
                                            ? `Payment for Invoice #${resolvedPaymentInvoice.invoiceNumber}`
                                            : '',
                                    } as Transaction}
                                    onShowDeleteWarning={() => {}}
                                />
                            </div>
                        ) : (
                            <AssetPaymentModal
                                renderInline
                                isOpen
                                invoice={resolvedPaymentInvoice!}
                                onClose={() => {
                                    setIsPaymentModalOpen(false);
                                    setPaymentInvoice(null);
                                    setPaymentMode(null);
                                }}
                                onSuccess={() => {
                                    setIsPaymentModalOpen(false);
                                    setPaymentInvoice(null);
                                    setPaymentMode(null);
                                }}
                            />
                        )}
                    </Modal>
                ) : (
                    <Modal
                        isOpen
                        onClose={() => {
                            setIsPaymentModalOpen(false);
                            setPaymentInvoice(null);
                        }}
                        title="Receive payment"
                    >
                        <TransactionForm
                            onClose={() => {
                                setIsPaymentModalOpen(false);
                                setPaymentInvoice(null);
                            }}
                            transactionTypeForNew={TransactionType.INCOME}
                            transactionToEdit={{
                                id: '',
                                type: TransactionType.INCOME,
                                amount: resolvedPaymentInvoice
                                    ? resolvedPaymentInvoice.amount -
                                      getEffectivePaidForInvoice(
                                          resolvedPaymentInvoice.id,
                                          resolvedPaymentInvoice.paidAmount,
                                          ledgerPaidByInvoiceId
                                      )
                                    : 0,
                                date: toLocalDateString(new Date()),
                                accountId: '',
                                invoiceId: resolvedPaymentInvoice?.id,
                                contactId: resolvedPaymentInvoice?.contactId,
                                projectId: resolvedPaymentInvoice?.projectId,
                                unitId: resolvedPaymentInvoice?.unitId,
                                buildingId: resolvedPaymentInvoice?.buildingId,
                                propertyId: resolvedPaymentInvoice?.propertyId,
                                categoryId: resolvedPaymentInvoice?.categoryId,
                                agreementId: resolvedPaymentInvoice?.agreementId,
                                description: resolvedPaymentInvoice
                                    ? `Payment for Invoice #${resolvedPaymentInvoice.invoiceNumber}`
                                    : '',
                            } as Transaction}
                            onShowDeleteWarning={() => {}}
                        />
                    </Modal>
                )
            )}

            {brokerForPayout && (
                <BrokerPayoutModal
                    isOpen={brokerPayoutOpen}
                    onClose={() => {
                        setBrokerPayoutOpen(false);
                        setBrokerForPayout(null);
                    }}
                    broker={brokerForPayout}
                    balanceDue={balanceDue}
                    context="Project"
                />
            )}
        </>
    );
};

export default ProjectSellingUnitQuickPanel;
