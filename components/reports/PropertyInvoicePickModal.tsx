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
    invoiceType: InvoiceType.RENTAL | InvoiceType.SECURITY_DEPOSIT;
    onSelectInvoice: (invoice: Invoice) => void;
}

const PropertyInvoicePickModal: React.FC<PropertyInvoicePickModalProps> = ({
    isOpen,
    onClose,
    propertyId,
    propertyName,
    invoiceType,
    onSelectInvoice,
}) => {
    const { state } = useAppContext();

    const unpaidInvoices = useMemo(() => {
        if (!isOpen || !propertyId) return [];
        return state.invoices
            .filter(
                inv =>
                    inv.propertyId === propertyId &&
                    inv.invoiceType === invoiceType &&
                    inv.status !== InvoiceStatus.PAID &&
                    inv.status !== InvoiceStatus.DRAFT &&
                    inv.amount - (inv.paidAmount || 0) > 0.01
            )
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }, [isOpen, propertyId, invoiceType, state.invoices]);

    const title =
        invoiceType === InvoiceType.RENTAL ? 'Receive rent — select invoice' : 'Receive security — select invoice';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <p className="text-sm text-app-muted mb-3">
                {propertyName} — {unpaidInvoices.length} unpaid {invoiceType === InvoiceType.RENTAL ? 'rental' : 'security'}{' '}
                invoice{unpaidInvoices.length === 1 ? '' : 's'}
            </p>
            {unpaidInvoices.length === 0 ? (
                <p className="text-sm text-app-muted py-4 text-center">No unpaid invoices for this property.</p>
            ) : (
                <ul className="space-y-2 max-h-[min(60vh,320px)] overflow-y-auto pr-1">
                    {unpaidInvoices.map(inv => {
                        const due = inv.amount - (inv.paidAmount || 0);
                        return (
                            <li
                                key={inv.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-app-border bg-app-toolbar/40 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold text-app-text truncate">{inv.invoiceNumber}</div>
                                    <div className="text-[10px] text-app-muted">Due {formatDate(inv.dueDate)}</div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-xs font-bold text-ds-danger tabular-nums">
                                        {CURRENCY} {due.toLocaleString()}
                                    </span>
                                    <Button size="sm" className="h-7 text-xs" onClick={() => onSelectInvoice(inv)}>
                                        Pay
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
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
