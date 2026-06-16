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

    const accountIcon = (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
    );

    return (
        <>
            <div
                className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            <div
                className={`fixed right-0 top-0 h-full w-full sm:w-[600px] lg:w-[700px] bg-app-card shadow-2xl z-50 transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col border-l border-app-border`}
            >
                <div className={`flex-shrink-0 ${config.bgColor} ${config.borderColor} border-b px-6 py-4`}>
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                                <span className={`text-3xl ${config.color}`}>{config.icon}</span>
                                <div>
                                    <h2 className="text-xl font-bold text-app-text">Transaction Details</h2>
                                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                        <p className={`text-sm font-semibold ${config.color}`}>{transaction.type}</p>
                                        {transaction.subtype && (
                                            <span className="text-xs font-medium text-app-muted bg-app-toolbar px-2 py-0.5 rounded-full border border-app-border">
                                                {transaction.subtype}
                                            </span>
                                        )}
                                        {transaction.isSystem && (
                                            <span className="text-xs font-medium text-app-muted bg-app-toolbar px-2 py-0.5 rounded-full border border-app-border">
                                                System
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-app-muted hover:text-app-text hover:bg-app-toolbar rounded-lg transition-all"
                            title="Close"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 printable-area" id="transaction-detail-printable-area">
                    <ReportHeader />

                    <div className={`${config.bgColor} ${config.borderColor} border-2 rounded-xl p-6 mb-6 shadow-ds-card`}>
                        <div className="text-center">
                            <p className="text-sm text-app-muted mb-1">Amount</p>
                            <p className={`text-4xl font-bold font-mono ${config.color} tracking-tight`}>
                                {transaction.type === TransactionType.EXPENSE && '-'}
                                {transaction.type === TransactionType.INCOME && '+'}
                                {CURRENCY} {transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>

                    <DetailSection title="Transaction">
                        <DetailRow
                            label="Date"
                            value={formatDate(transaction.date)}
                            icon={<CalendarIcon />}
                        />
                        <DetailRow
                            label="Description"
                            value={transaction.description || '-'}
                            icon={<DocumentIcon />}
                        />
                        <DetailRow
                            label="Reference"
                            value={transaction.reference || '-'}
                            icon={<HashIcon />}
                        />
                        {transaction.userId && (
                            <DetailRow
                                label="Recorded By"
                                value={getUserName(transaction.userId)}
                                icon={<UserIcon />}
                            />
                        )}
                    </DetailSection>

                    <DetailSection title="Account & Category">
                        {transaction.type === TransactionType.TRANSFER ? (
                            <>
                                <DetailRow label="From Account" value={getAccountName(transaction.fromAccountId)} icon={accountIcon} />
                                <DetailRow label="To Account" value={getAccountName(transaction.toAccountId)} icon={accountIcon} />
                            </>
                        ) : (
                            <DetailRow label="Account" value={getAccountName(transaction.accountId)} icon={accountIcon} />
                        )}
                        <DetailRow
                            label="Category"
                            value={getCategoryName(context.categoryId)}
                            icon={<TagIcon />}
                        />
                    </DetailSection>

                    <DetailSection title="Parties & Location">
                        <DetailRow label="Contact" value={getContactName(context.contactId)} icon={<UserIcon />} />
                        <DetailRow label="Vendor" value={getVendorName(context.vendorId)} icon={<VendorIcon />} />
                        <DetailRow label="Owner" value={getContactName(context.ownerId)} icon={<UserIcon />} />
                        <DetailRow label="Project" value={getProjectName(context.projectId)} icon={<BuildingIcon />} />
                        <DetailRow label="Building" value={getBuildingName(context.buildingId)} icon={<BuildingIcon />} />
                        <DetailRow label="Property" value={getPropertyName(context.propertyId)} icon={<HomeIcon />} />
                        <DetailRow label="Unit" value={getUnitName(context.unitId)} icon={<UnitIcon />} />
                    </DetailSection>

                    <DetailSection title="Linked Records">
                        <DetailRow label="Invoice" value={getInvoiceLabel(transaction.invoiceId)} icon={<LinkIcon />} />
                        <DetailRow label="Bill" value={getBillLabel(transaction.billId)} icon={<LinkIcon />} />
                        <DetailRow label="Contract" value={getContractLabel(context.contractId)} icon={<LinkIcon />} />
                        <DetailRow label="Agreement" value={getAgreementLabel(transaction.agreementId)} icon={<LinkIcon />} />
                        <DetailRow
                            label="Payslip"
                            value={transaction.payslipId || '-'}
                            icon={<DocumentIcon />}
                            mono={!!transaction.payslipId}
                        />
                        <DetailRow
                            label="Batch"
                            value={transaction.batchId || '-'}
                            icon={<HashIcon />}
                            mono={!!transaction.batchId}
                        />
                    </DetailSection>

                    <DetailSection title="Identification">
                        <DetailRow
                            label="Transaction ID"
                            value={transaction.id}
                            icon={<CodeIcon />}
                            mono
                        />
                    </DetailSection>

                    {hasChildren && (
                        <div className="mt-6 border-t border-app-border pt-6">
                            <h3 className="text-sm font-semibold text-app-muted uppercase tracking-wider mb-4">
                                Bundle Items ({transaction.children?.length})
                            </h3>
                            <div className="space-y-2">
                                {transaction.children?.map((child) => {
                                    const childCtx = resolveTransactionContext(child, lookups);
                                    return (
                                        <div
                                            key={child.id}
                                            className="bg-app-toolbar rounded-lg p-3 border border-app-border hover:bg-app-table-hover transition-colors"
                                        >
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-app-text">{child.description || '—'}</p>
                                                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-app-muted">
                                                        {childCtx.contactId && (
                                                            <span>Contact: {getContactName(childCtx.contactId)}</span>
                                                        )}
                                                        {childCtx.vendorId && (
                                                            <span>Vendor: {getVendorName(childCtx.vendorId)}</span>
                                                        )}
                                                        {childCtx.projectId && (
                                                            <span>Project: {getProjectName(childCtx.projectId)}</span>
                                                        )}
                                                        {childCtx.buildingId && (
                                                            <span>Building: {getBuildingName(childCtx.buildingId)}</span>
                                                        )}
                                                        {childCtx.unitId && (
                                                            <span>Unit: {getUnitName(childCtx.unitId)}</span>
                                                        )}
                                                        {child.categoryId && (
                                                            <span>{getCategoryName(child.categoryId)}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-bold font-mono text-app-text">
                                                        {CURRENCY} {child.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <p className="text-xs text-app-muted">{formatDate(child.date)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <ReportFooter />
                </div>

                <div className="flex-shrink-0 border-t border-app-border bg-app-surface-2 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleEdit}
                            className="flex-1 min-w-0 bg-green-600 hover:bg-green-700"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                        </Button>
                        <PrintButton
                            variant="secondary"
                            size="sm"
                            onPrint={handlePrint}
                            className="flex-1 min-w-0"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onClose}
                            className="flex-1 min-w-0"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Close
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDelete}
                            className="flex-1 min-w-0 text-ds-danger hover:bg-[color:var(--badge-unpaid-bg)] hover:text-ds-danger"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <div className="mb-6">
        <h3 className="text-xs font-semibold text-app-muted uppercase tracking-wider mb-2 px-1">{title}</h3>
        <div className="rounded-xl border border-app-border bg-app-toolbar/30 overflow-hidden divide-y divide-app-border">
            {children}
        </div>
    </div>
);

const DetailRow: React.FC<{
    label: string;
    value: string;
    icon: React.ReactNode;
    mono?: boolean;
}> = ({ label, value, icon, mono = false }) => (
    <div className="flex items-start gap-4 px-4 py-3">
        <div className="flex-shrink-0 w-9 h-9 bg-app-toolbar rounded-lg flex items-center justify-center text-app-muted">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-[10px] text-app-muted uppercase tracking-wide font-semibold mb-0.5">{label}</p>
            <p className={`text-sm text-app-text ${mono ? 'font-mono text-xs break-all' : 'font-medium'} break-words`}>
                {value}
            </p>
        </div>
    </div>
);

const CalendarIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);

const DocumentIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const HashIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
    </svg>
);

const UserIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const VendorIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
);

const BuildingIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
);

const HomeIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
);

const UnitIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
);

const TagIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
);

const LinkIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
);

const CodeIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);

export default React.memo(TransactionDetailDrawer);
