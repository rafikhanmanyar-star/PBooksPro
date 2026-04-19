import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Invoice, InvoiceStatus, InvoiceType } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { isSecurityInvoice } from '../../utils/rentalInvoiceClassification';

export interface PropertyInvoicePickModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    propertyName: string;
    invoiceType?: InvoiceType.RENTAL | InvoiceType.SECURITY_DEPOSIT | 'ALL';
    onSelectInvoice: (invoice: Invoice) => void;
}

const TYPE_STYLES = {
    [InvoiceType.RENTAL]: {
        label: 'Monthly Rent',
        shortLabel: 'Rent',
        sectionBg: 'bg-primary/5',
        sectionBorder: 'border-primary/20',
        accentBorder: 'border-l-primary',
        rowBadge: 'bg-primary/10 text-primary border-primary/20',
        headerBadge: 'bg-primary/15 text-primary',
    },
    [InvoiceType.SECURITY_DEPOSIT]: {
        label: 'Security Deposit',
        shortLabel: 'Security',
        sectionBg: 'bg-amber-500/5',
        sectionBorder: 'border-amber-500/20',
        accentBorder: 'border-l-amber-500',
        rowBadge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        headerBadge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
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

        const securityRaw = propInvoices.filter(inv => isSecurityInvoice(inv)).sort(byDate);
        const rentalRaw = propInvoices.filter(inv => !isSecurityInvoice(inv)).sort(byDate);

        const rental =
            invoiceType === 'ALL' || invoiceType === InvoiceType.RENTAL ? rentalRaw : [];
        const security =
            invoiceType === 'ALL' || invoiceType === InvoiceType.SECURITY_DEPOSIT ? securityRaw : [];

        return { rentalInvoices: rental, securityInvoices: security };
    }, [isOpen, propertyId, invoiceType, state.invoices]);

    const totalCount = rentalInvoices.length + securityInvoices.length;
    const hasBothTypes = rentalInvoices.length > 0 && securityInvoices.length > 0;

    const title = invoiceType === InvoiceType.RENTAL
        ? 'Receive rent — select invoice'
        : invoiceType === InvoiceType.SECURITY_DEPOSIT
            ? 'Receive security — select invoice'
            : 'Receive payment — select invoice';

    const renderInvoiceRow = (inv: Invoice) => {
        const styles = isSecurityInvoice(inv)
            ? TYPE_STYLES[InvoiceType.SECURITY_DEPOSIT]
            : TYPE_STYLES[InvoiceType.RENTAL];
        const due = inv.amount - (inv.paidAmount || 0);
        const isOverdue = new Date(inv.dueDate) < new Date();
        return (
            <li
                key={inv.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-app-border border-l-[3px] ${styles.accentBorder} bg-app-card px-3 py-2.5 transition-colors hover:bg-app-toolbar/60`}
            >
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-app-text">{inv.invoiceNumber}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${styles.rowBadge}`}>
                            {styles.shortLabel}
                        </span>
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
        const styles = TYPE_STYLES[type];
        const totalDue = invoices.reduce((sum, inv) => sum + inv.amount - (inv.paidAmount || 0), 0);
        return (
            <div className={`rounded-xl border ${styles.sectionBorder} ${styles.sectionBg} p-3`}>
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${styles.headerBadge}`}>
                            {styles.label}
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
                    {invoices.map(inv => renderInvoiceRow(inv))}
                </ul>
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <p className="text-sm text-app-muted mb-1">
                {propertyName} — {totalCount} unpaid invoice{totalCount === 1 ? '' : 's'}
            </p>
            {hasBothTypes && (
                <p className="text-[10px] text-app-muted mb-3 italic">
                    Invoices are grouped by type. Look for the colored label on each row to identify rent vs security.
                </p>
            )}
            {!hasBothTypes && <div className="mb-3" />}
            {totalCount === 0 ? (
                <p className="text-sm text-app-muted py-4 text-center">No unpaid invoices for this property.</p>
            ) : (
                <div className="space-y-4 max-h-[min(60vh,400px)] overflow-y-auto pr-1">
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
