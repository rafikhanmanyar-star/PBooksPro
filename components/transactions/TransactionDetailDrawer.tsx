import React, { useMemo, useState } from 'react';
import { useDispatchOnly } from '../../hooks/useSelectiveState';
import { useLookupMaps, LookupMaps } from '../../hooks/useLookupMaps';
import { Transaction, TransactionType } from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import TransactionForm from './TransactionForm';
import Modal from '../ui/Modal';
import LinkedTransactionWarningModal from './LinkedTransactionWarningModal';
import { usePrintContext } from '../../context/PrintContext';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';

interface TransactionDetailDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: Transaction | null;
    onTransactionUpdated: () => void;
}

interface ResolvedContext {
    contactId?: string;
    vendorId?: string;
    ownerId?: string;
    projectId?: string;
    buildingId?: string;
    propertyId?: string;
    unitId?: string;
    categoryId?: string;
    contractId?: string;
}

function resolveTransactionContext(transaction: Transaction, lookups: LookupMaps): ResolvedContext {
    const invoice = transaction.invoiceId ? lookups.invoices.get(transaction.invoiceId) : undefined;
    const bill = transaction.billId ? lookups.bills.get(transaction.billId) : undefined;

    const propertyId = transaction.propertyId || invoice?.propertyId || bill?.propertyId;
    const property = propertyId ? lookups.properties.get(propertyId) : undefined;

    return {
        contactId: transaction.contactId || invoice?.contactId || bill?.contactId,
        vendorId: transaction.vendorId || invoice?.vendorId || bill?.vendorId,
        ownerId: transaction.ownerId,
        projectId: transaction.projectId || invoice?.projectId || bill?.projectId,
        buildingId: transaction.buildingId || invoice?.buildingId || bill?.buildingId || property?.buildingId,
        propertyId,
        unitId: transaction.unitId || invoice?.unitId,
        categoryId: transaction.categoryId || invoice?.categoryId || bill?.categoryId,
        contractId: transaction.contractId || bill?.contractId,
    };
}

const TransactionDetailDrawer: React.FC<TransactionDetailDrawerProps> = ({
    isOpen,
    onClose,
    transaction,
    onTransactionUpdated
}) => {
    const dispatch = useDispatchOnly();
    const lookups = useLookupMaps();
    const { print: triggerPrint } = usePrintContext();
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [showDeleteWarning, setShowDeleteWarning] = useState(false);

    const context = useMemo(
        () => (transaction ? resolveTransactionContext(transaction, lookups) : null),
        [transaction, lookups]
    );

    if (!isOpen || !transaction || !context) return null;

    const nameOrDash = (id: string | undefined, map: Map<string, { name: string }>) =>
        (id && map.get(id)?.name) || '-';

    const getAccountName = (id?: string) => nameOrDash(id, lookups.accounts);
    const getCategoryName = (id?: string) => nameOrDash(id, lookups.categories);
    const getContactName = (id?: string) => nameOrDash(id, lookups.contacts);
    const getVendorName = (id?: string) => nameOrDash(id, lookups.vendors);
    const getProjectName = (id?: string) => nameOrDash(id, lookups.projects);
    const getBuildingName = (id?: string) => nameOrDash(id, lookups.buildings);
    const getPropertyName = (id?: string) => nameOrDash(id, lookups.properties);
    const getUnitName = (id?: string) => nameOrDash(id, lookups.units);
    const getUserName = (id?: string) => nameOrDash(id, lookups.users);

    const getInvoiceLabel = (id?: string) => {
        if (!id) return '-';
        const inv = lookups.invoices.get(id);
        if (!inv) return id;
        const parts = [
            inv.invoiceNumber ? `#${inv.invoiceNumber}` : undefined,
            inv.invoiceType,
            inv.status,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : id;
    };

    const getBillLabel = (id?: string) => {
        if (!id) return '-';
        const bill = lookups.bills.get(id);
        if (!bill) return id;
        const parts = [
            bill.billNumber ? `#${bill.billNumber}` : undefined,
            bill.status,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : id;
    };

    const getContractLabel = (id?: string) => {
        if (!id) return '-';
        const contract = lookups.contracts.get(id);
        if (!contract) return id;
        return contract.contractNumber
            ? `${contract.contractNumber} — ${contract.name}`
            : contract.name;
    };

    const getAgreementLabel = (id?: string) => {
        if (!id) return '-';
        const rental = lookups.rentalAgreements.get(id);
        if (rental) return `Rental · ${rental.agreementNumber}`;
        const project = lookups.projectAgreements.get(id);
        if (project) return `Sale · ${project.agreementNumber}`;
        return id;
    };

    const typeConfig = {
        [TransactionType.INCOME]: {
            color: 'text-ds-success',
            bgColor: 'bg-[color:var(--badge-paid-bg)]',
            borderColor: 'border-ds-success/30',
            icon: '↑'
        },
        [TransactionType.EXPENSE]: {
            color: 'text-ds-danger',
            bgColor: 'bg-[color:var(--badge-unpaid-bg)]',
            borderColor: 'border-ds-danger/30',
            icon: '↓'
        },
        [TransactionType.TRANSFER]: {
            color: 'text-primary',
            bgColor: 'bg-nav-active/40',
            borderColor: 'border-primary/30',
            icon: '⇄'
        },
        [TransactionType.LOAN]: {
            color: 'text-ds-warning',
            bgColor: 'bg-app-highlight',
            borderColor: 'border-ds-warning/30',
            icon: '⟲'
        },
    };

    const config = typeConfig[transaction.type as TransactionType] || typeConfig[TransactionType.EXPENSE];

    const handleEdit = () => {
        setIsEditModalOpen(true);
    };

    const handleDelete = () => {
        setShowDeleteWarning(true);
    };

    const confirmDelete = () => {
        if (transaction) {
            dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
            setShowDeleteWarning(false);
            onClose();
        }
    };

    const hasChildren = transaction.children && transaction.children.length > 0;

    const handlePrint = () => {
        triggerPrint('REPORT', { elementId: 'transaction-detail-printable-area' });
    };

    const amountPrefix =
        transaction.type === TransactionType.EXPENSE ? '-' :
        transaction.type === TransactionType.INCOME ? '+' : '';

    const detailFields: { section: string; label: string; value: string; mono?: boolean }[] = [
        { section: 'Transaction', label: 'Date', value: formatDate(transaction.date) },
        { section: 'Transaction', label: 'Description', value: transaction.description || '-' },
        { section: 'Transaction', label: 'Reference', value: transaction.reference || '-' },
        ...(transaction.userId ? [{ section: 'Transaction', label: 'Recorded By', value: getUserName(transaction.userId) }] : []),
        ...(transaction.type === TransactionType.TRANSFER
            ? [
                { section: 'Account', label: 'From Account', value: getAccountName(transaction.fromAccountId) },
                { section: 'Account', label: 'To Account', value: getAccountName(transaction.toAccountId) },
              ]
            : [{ section: 'Account', label: 'Account', value: getAccountName(transaction.accountId) }]),
        { section: 'Account', label: 'Category', value: getCategoryName(context.categoryId) },
        { section: 'Parties', label: 'Contact', value: getContactName(context.contactId) },
        { section: 'Parties', label: 'Vendor', value: getVendorName(context.vendorId) },
        { section: 'Parties', label: 'Owner', value: getContactName(context.ownerId) },
        { section: 'Location', label: 'Project', value: getProjectName(context.projectId) },
        { section: 'Location', label: 'Building', value: getBuildingName(context.buildingId) },
        { section: 'Location', label: 'Property', value: getPropertyName(context.propertyId) },
        { section: 'Location', label: 'Unit', value: getUnitName(context.unitId) },
        { section: 'Linked', label: 'Invoice', value: getInvoiceLabel(transaction.invoiceId) },
        { section: 'Linked', label: 'Bill', value: getBillLabel(transaction.billId) },
        { section: 'Linked', label: 'Contract', value: getContractLabel(context.contractId) },
        { section: 'Linked', label: 'Agreement', value: getAgreementLabel(transaction.agreementId) },
        { section: 'Linked', label: 'Payslip', value: transaction.payslipId || '-', mono: !!transaction.payslipId },
        { section: 'Linked', label: 'Batch', value: transaction.batchId || '-', mono: !!transaction.batchId },
        { section: 'ID', label: 'Transaction ID', value: transaction.id, mono: true },
    ];

    return (
        <>
            <div className="w-[440px] lg:w-[500px] flex-shrink-0 h-full min-h-0 bg-app-card border-l border-app-border flex flex-col overflow-hidden animate-fade-in shadow-ds-card">
                {/* Compact header: type + amount in one row */}
                <div className={`flex-shrink-0 ${config.bgColor} ${config.borderColor} border-b px-3 py-2`}>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xl leading-none ${config.color}`}>{config.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <h2 className="text-sm font-bold text-app-text">Transaction Details</h2>
                                <span className={`text-[10px] font-bold uppercase ${config.color}`}>{transaction.type}</span>
                                {transaction.subtype && (
                                    <span className="text-[9px] font-medium text-app-muted bg-app-toolbar px-1.5 py-0.5 rounded border border-app-border">
                                        {transaction.subtype}
                                    </span>
                                )}
                                {transaction.isSystem && (
                                    <span className="text-[9px] font-medium text-app-muted bg-app-toolbar px-1.5 py-0.5 rounded border border-app-border">
                                        System
                                    </span>
                                )}
                            </div>
                            <p className={`text-lg font-bold font-mono tabular-nums leading-tight ${config.color}`}>
                                {amountPrefix}{CURRENCY} {transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-app-muted hover:text-app-text hover:bg-app-toolbar rounded-lg transition-all shrink-0"
                            title="Close"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div
                    className={`flex-1 min-h-0 px-3 py-2 printable-area ${hasChildren ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}
                    id="transaction-detail-printable-area"
                >
                    <div className="hidden print:block">
                        <ReportHeader />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {([
                            ['Transaction', 'Account'],
                            ['Parties', 'Location'],
                        ] as const).map(([left, right]) => (
                            <React.Fragment key={`${left}-${right}`}>
                                {([left, right] as const).map(section => {
                                    const fields = detailFields.filter(f => f.section === section);
                                    if (fields.length === 0) return null;
                                    return (
                                        <DetailSection key={section} title={section}>
                                            <div className="grid grid-cols-1 gap-y-1.5">
                                                {fields.map(field => (
                                                    <CompactField
                                                        key={`${section}-${field.label}`}
                                                        label={field.label}
                                                        value={field.value}
                                                        mono={field.mono}
                                                    />
                                                ))}
                                            </div>
                                        </DetailSection>
                                    );
                                })}
                            </React.Fragment>
                        ))}

                        {(() => {
                            const fields = detailFields.filter(f => f.section === 'Linked');
                            if (fields.length === 0) return null;
                            return (
                                <div className="col-span-2">
                                    <DetailSection title="Linked">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
                                            {fields.map(field => (
                                                <CompactField
                                                    key={`Linked-${field.label}`}
                                                    label={field.label}
                                                    value={field.value}
                                                    mono={field.mono}
                                                />
                                            ))}
                                        </div>
                                    </DetailSection>
                                </div>
                            );
                        })()}

                        {(() => {
                            const fields = detailFields.filter(f => f.section === 'ID');
                            if (fields.length === 0) return null;
                            return (
                                <div className="col-span-2">
                                    <DetailSection title="Identification">
                                        {fields.map(field => (
                                            <CompactField
                                                key={`ID-${field.label}`}
                                                label={field.label}
                                                value={field.value}
                                                mono={field.mono}
                                            />
                                        ))}
                                    </DetailSection>
                                </div>
                            );
                        })()}
                    </div>

                    {hasChildren && (
                        <div className="mt-2 border-t border-app-border pt-2">
                            <h3 className="text-[9px] font-semibold text-app-muted uppercase tracking-wider mb-1.5">
                                Bundle Items ({transaction.children?.length})
                            </h3>
                            <div className="grid grid-cols-2 gap-1.5">
                                {transaction.children?.map((child) => {
                                    const childCtx = resolveTransactionContext(child, lookups);
                                    const meta = [
                                        childCtx.contactId && getContactName(childCtx.contactId),
                                        childCtx.projectId && getProjectName(childCtx.projectId),
                                        child.categoryId && getCategoryName(child.categoryId),
                                    ].filter(Boolean).join(' · ');
                                    return (
                                        <div
                                            key={child.id}
                                            className="col-span-2 bg-app-toolbar rounded-md px-2 py-1.5 border border-app-border"
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium text-app-text truncate" title={child.description}>{child.description || '—'}</p>
                                                    {meta && <p className="text-[10px] text-app-muted truncate">{meta}</p>}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-xs font-bold font-mono tabular-nums text-app-text">
                                                        {CURRENCY} {child.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <p className="text-[10px] text-app-muted">{formatDate(child.date)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="hidden print:block">
                        <ReportFooter />
                    </div>
                </div>

                <div className="flex-shrink-0 border-t border-app-border bg-app-surface-2 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleEdit}
                            className="flex-1 min-w-0 !py-1.5 !text-xs bg-green-600 hover:bg-green-700"
                        >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                        </Button>
                        <PrintButton
                            variant="secondary"
                            size="sm"
                            onPrint={handlePrint}
                            className="flex-1 min-w-0 !py-1.5 !text-xs"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onClose}
                            className="flex-1 min-w-0 !py-1.5 !text-xs"
                        >
                            Close
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDelete}
                            className="shrink-0 !py-1.5 !px-2 text-ds-danger hover:bg-[color:var(--badge-unpaid-bg)] hover:text-ds-danger"
                            title="Delete"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </Button>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title="Edit Transaction"
            >
                <TransactionForm
                    onClose={() => {
                        setIsEditModalOpen(false);
                        onTransactionUpdated();
                        onClose();
                    }}
                    transactionToEdit={transaction}
                    transactionTypeForNew={null}
                    onShowDeleteWarning={() => {
                        setIsEditModalOpen(false);
                        setShowDeleteWarning(true);
                    }}
                />
            </Modal>

            <LinkedTransactionWarningModal
                isOpen={showDeleteWarning}
                onClose={() => setShowDeleteWarning(false)}
                onConfirm={confirmDelete}
                action="delete"
                linkedItemName="transaction"
            />
        </>
    );
};

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <h3 className="text-[9px] font-semibold text-app-muted uppercase tracking-wider mb-1 px-0.5">{title}</h3>
        <div className="rounded-lg border border-app-border bg-app-toolbar/30 p-2">
            {children}
        </div>
    </div>
);

const CompactField: React.FC<{
    label: string;
    value: string;
    mono?: boolean;
}> = ({ label, value, mono = false }) => (
    <div className="min-w-0">
        <p className="text-[9px] text-app-muted uppercase tracking-wide font-semibold leading-none mb-0.5">{label}</p>
        <p
            className={`text-xs text-app-text leading-snug ${mono ? 'font-mono text-[10px] break-all' : 'font-medium truncate'}`}
            title={value}
        >
            {value}
        </p>
    </div>
);

export default React.memo(TransactionDetailDrawer);
