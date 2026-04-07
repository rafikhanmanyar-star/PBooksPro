
import React, { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, InvoiceType, InvoiceStatus } from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Select from '../ui/Select';
import Button from '../ui/Button';

interface ProjectUnitDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    unitId: string;
    unitName: string;
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

const ProjectUnitDetailModal: React.FC<ProjectUnitDetailModalProps> = ({ isOpen, onClose, unitId, unitName }) => {
    const { state } = useAppContext();
    const [filterType, setFilterType] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const unitSummary = useMemo(() => {
        if (!unitId) return null;
        const unit = state.units.find(u => u.id === unitId);
        if (!unit) return null;
        const project = state.projects.find(p => p.id === unit.projectId);
        const activeAgreement = state.projectAgreements.find(
            pa => pa.unitIds?.includes(unitId) && pa.status === 'Active'
        );
        const client = activeAgreement ? state.contacts.find(c => c.id === activeAgreement.clientId) : null;

        const unitInvoices = state.invoices.filter(inv => inv.unitId === unitId);
        const agreementInvoices = activeAgreement
            ? state.invoices.filter(inv => inv.agreementId === activeAgreement.id)
            : [];
        const invoices = unitInvoices.length > 0 ? unitInvoices : agreementInvoices;
        const invoiceIds = new Set(invoices.map(inv => inv.id));

        // Amount received: sum of actual INCOME transactions for this unit (matches history table)
        const incomePayments = state.transactions.filter(
            tx => tx.type === TransactionType.INCOME &&
                (tx.unitId === unitId || (tx.invoiceId != null && invoiceIds.has(tx.invoiceId)))
        );
        const amountReceived = incomePayments.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

        const amountDue = invoices
            .filter(inv => inv.status !== InvoiceStatus.PAID)
            .reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0);
        const totalBilled = invoices.reduce((sum, inv) => sum + inv.amount, 0);

        const listPrice = activeAgreement?.listPrice ?? 0;
        const sellingPrice = activeAgreement?.sellingPrice ?? 0;

        return {
            projectName: project?.name ?? '—',
            unitName: unit.name,
            clientName: client?.name ?? 'Available',
            listPrice,
            sellingPrice,
            totalBilled,
            amountReceived,
            amountDue,
        };
    }, [unitId, state.units, state.projects, state.contacts, state.projectAgreements, state.invoices, state.transactions]);

    const historyData = useMemo<HistoryItem[]>(() => {
        if (!unitId) return [];

        const items: HistoryItem[] = [];
        const unitInvoices = state.invoices.filter(inv => inv.unitId === unitId);
        const activeAgreement = state.projectAgreements.find(
            pa => pa.unitIds?.includes(unitId) && pa.status === 'Active'
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
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];

            if (sortConfig.key === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
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

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Unit details: ${unitName}`} size="xl">
            <div className="flex flex-col h-[70vh]">
                {unitSummary && (
                    <div className="mb-4 space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">Project</div>
                                <div className="font-medium text-slate-800">{unitSummary.projectName}</div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">Unit</div>
                                <div className="font-medium text-slate-800">{unitSummary.unitName}</div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">Client / Buyer</div>
                                <div className="font-medium text-slate-800">{unitSummary.clientName}</div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-t border-slate-200 pt-3">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">List price</div>
                                <div className="font-semibold text-slate-800 tabular-nums">{CURRENCY} {unitSummary.listPrice.toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">Selling price</div>
                                <div className="font-semibold text-slate-800 tabular-nums">{CURRENCY} {unitSummary.sellingPrice.toLocaleString()}</div>
                            </div>
                            <div />
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm border-t border-slate-200 pt-3">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">Current status — Amount received</div>
                                <div className="font-bold tabular-nums text-emerald-600">
                                    {CURRENCY} {unitSummary.amountReceived.toLocaleString()}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">Current status — Amount due</div>
                                <div className={`font-bold tabular-nums ${unitSummary.amountDue > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                                    {CURRENCY} {unitSummary.amountDue.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <h3 className="text-sm font-bold text-slate-700 mb-2">Historical payment transactions (sortable by date)</h3>
                <div className="flex justify-between items-center mb-2 p-1">
                    <div className="w-48">
                        <Select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="py-1.5 text-sm"
                        >
                            <option value="All">All</option>
                            <option value="Invoice">Invoices</option>
                            <option value="Payment">Payments</option>
                            <option value="Expense">Expenses</option>
                        </Select>
                    </div>
                    <div className="text-sm text-slate-500">
                        {filteredData.length} records
                    </div>
                </div>

                <div className="flex-grow overflow-auto border rounded-lg shadow-sm bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-sm relative">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Date <SortIcon column="date" /></th>
                                <th onClick={() => handleSort('type')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Type <SortIcon column="type" /></th>
                                <th onClick={() => handleSort('reference')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Ref <SortIcon column="reference" /></th>
                                <th onClick={() => handleSort('contactName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Contact <SortIcon column="contactName" /></th>
                                <th onClick={() => handleSort('description')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="description" /></th>
                                <th onClick={() => handleSort('amount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Amount <SortIcon column="amount" /></th>
                                <th onClick={() => handleSort('status')} className="px-3 py-2 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Status <SortIcon column="status" /></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {filteredData.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDate(item.date)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                                            ${item.type === 'Invoice' ? 'bg-sky-100 text-sky-700' :
                                                item.type === 'Payment' ? 'bg-emerald-100 text-emerald-700' :
                                                    'bg-slate-100 text-slate-700'}`}>
                                            {item.type}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-600 font-mono text-xs">{item.reference}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.contactName}</td>
                                    <td className="px-3 py-2 text-slate-600 truncate max-w-xs" title={item.description}>{item.description}</td>
                                    <td className={`px-3 py-2 text-right font-medium ${item.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {CURRENCY} {Math.abs(item.amount).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2 text-center text-xs text-slate-500">{item.status}</td>
                                </tr>
                            ))}
                            {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">No records found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end mt-4 pt-2 border-t">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};

export default ProjectUnitDetailModal;
