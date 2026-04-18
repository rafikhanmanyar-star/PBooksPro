import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Invoice, InvoiceStatus, InvoiceType } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';

export interface PropertyInvoicePickModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    propertyName: string;
    invoiceType?: InvoiceType.RENTAL | InvoiceType.SECURITY_DEPOSIT | 'ALL';
    onSelectInvoice: (invoice: Invoice) => void;
}

const SECTION_CONFIG = {
    [InvoiceType.RENTAL]: {
        label: 'Rent',
        accentBorder: 'border-l-primary',
        badge: 'bg-primary/10 text-primary',
        icon: '🏠',
    },
    [InvoiceType.SECURITY_DEPOSIT]: {
        label: 'Security Deposit',
        accentBorder: 'border-l-amber-500',
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        icon: '🔒',
    },
} as const;

const PropertyInvoicePickModal: React.FC<PropertyInvoicePickModalProps> = ({
    isOpen,
    onClose,
    propertyId,
    propertyName,
    invoiceType = 'ALL',
    onSelectInvoice,
}) => {
    const { state } = useAppContext();

    const isUnpaid = (inv: Invoice) =>
        inv.status !== InvoiceStatus.PAID &&
        inv.status !== InvoiceStatus.DRAFT &&
        inv.amount - (inv.paidAmount || 0) > 0.01;

    const { rentalInvoices, securityInvoices } = useMemo(() => {
        if (!isOpen || !propertyId) return { rentalInvoices: [], securityInvoices: [] };
        const byDate = (a: Invoice, b: Invoice) =>
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();

        const propInvoices = state.invoices.filter(
            inv => inv.propertyId === propertyId && isUnpaid(inv)
        );

        const rental = (invoiceType === 'ALL' || invoiceType === InvoiceType.RENTAL)
            ? propInvoices.filter(inv => inv.invoiceType === InvoiceType.RENTAL).sort(byDate)
            : [];
        const security = (invoiceType === 'ALL' || invoiceType === InvoiceType.SECURITY_DEPOSIT)
            ? propInvoices.filter(inv => inv.invoiceType === InvoiceType.SECURITY_DEPOSIT).sort(byDate)
            : [];

        return { rentalInvoices: rental, securityInvoices: security };
    }, [isOpen, propertyId, invoiceType, state.invoices]);

    const totalCount = rentalInvoices.length + securityInvoices.length;

    const title = invoiceType === InvoiceType.RENTAL
        ? 'Receive rent — select invoice'
        : invoiceType === InvoiceType.SECURITY_DEPOSIT
            ? 'Receive security — select invoice'
            : 'Receive payment — select invoice';

    const renderInvoiceRow = (inv: Invoice, config: typeof SECTION_CONFIG[InvoiceType.RENTAL]) => {
        const due = inv.amount - (inv.paidAmount || 0);
        const isOverdue = new Date(inv.dueDate) < new Date();
        return (
            <li
                key={inv.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-app-border border-l-[3px] ${config.accentBorder} bg-app-toolbar/40 px-3 py-2.5 transition-colors hover:bg-app-toolbar/70`}
            >
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-app-text truncate">{inv.invoiceNumber}</span>
                        {isOverdue && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-ds-danger/10 text-ds-danger border border-ds-danger/20">
                                Overdue
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] text-app-muted mt-0.5">Due {formatDate(inv.dueDate)}</div>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className="text-sm font-bold text-ds-danger tabular-nums">
                        {CURRENCY} {due.toLocaleString()}
                    </span>
                    <Button size="sm" className="h-7 text-xs" onClick={() => onSelectInvoice(inv)}>
                        Pay
                    </Button>
                </div>
            </li>
        );
    };

    const renderSection = (invoices: Invoice[], type: InvoiceType.RENTAL | InvoiceType.SECURITY_DEPOSIT) => {
        if (invoices.length === 0) return null;
        const config = SECTION_CONFIG[type];
        const totalDue = invoices.reduce((sum, inv) => sum + inv.amount - (inv.paidAmount || 0), 0);
        return (
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${config.badge}`}>
                            {config.icon} {config.label}
                        </span>
                        <span className="text-[10px] text-app-muted">
                            {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
                        </span>
                    </div>
                    <span className="text-[10px] font-semibold text-app-muted tabular-nums">
                        Total: {CURRENCY} {totalDue.toLocaleString()}
                    </span>
                </div>
                <ul className="space-y-2">
                    {invoices.map(inv => renderInvoiceRow(inv, config))}
                </ul>
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <p className="text-sm text-app-muted mb-4">
                {propertyName} — {totalCount} unpaid invoice{totalCount === 1 ? '' : 's'}
            </p>
            {totalCount === 0 ? (
                <p className="text-sm text-app-muted py-4 text-center">No unpaid invoices for this property.</p>
            ) : (
                <div className="space-y-5 max-h-[min(60vh,400px)] overflow-y-auto pr-1">
                    {renderSection(rentalInvoices, InvoiceType.RENTAL)}
                    {renderSection(securityInvoices, InvoiceType.SECURITY_DEPOSIT)}
                </div>
            )}
            <div className="flex justify-end pt-4 border-t border-app-border mt-4">
                <Button variant="secondary" onClick={onClose}>
                    Close
                </Button>
            </div>
        </Modal>
    );
};

export default PropertyInvoicePickModal;
