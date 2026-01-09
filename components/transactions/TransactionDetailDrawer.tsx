import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Transaction, TransactionType } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import TransactionForm from './TransactionForm';
import Modal from '../ui/Modal';
import LinkedTransactionWarningModal from './LinkedTransactionWarningModal';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface TransactionDetailDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: Transaction | null;
    onTransactionUpdated: () => void;
}

const TransactionDetailDrawer: React.FC<TransactionDetailDrawerProps> = ({
    isOpen,
    onClose,
    transaction,
    onTransactionUpdated
}) => {
    const { state, dispatch } = useAppContext();
    const { handlePrint } = usePrint({ elementId: 'transaction-detail-printable-area' });
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [showDeleteWarning, setShowDeleteWarning] = useState(false);

    if (!isOpen || !transaction) return null;

    const getAccountName = (id?: string) => state.accounts.find(a => a.id === id)?.name || '-';
    const getCategoryName = (id?: string) => state.categories.find(c => c.id === id)?.name || '-';
    const getContactName = (id?: string) => state.contacts.find(c => c.id === id)?.name || '-';
    const getProjectName = (id?: string) => state.projects.find(p => p.id === id)?.name || '-';
    const getBuildingName = (id?: string) => state.buildings.find(b => b.id === id)?.name || '-';

    const typeConfig = {
        [TransactionType.INCOME]: {
            color: 'text-green-700',
            bgColor: 'bg-green-50',
            borderColor: 'border-green-200',
            icon: '↑'
        },
        [TransactionType.EXPENSE]: {
            color: 'text-red-700',
            bgColor: 'bg-red-50',
            borderColor: 'border-red-200',
            icon: '↓'
        },
        [TransactionType.TRANSFER]: {
            color: 'text-blue-700',
            bgColor: 'bg-blue-50',
            borderColor: 'border-blue-200',
            icon: '⇄'
        },
        [TransactionType.LOAN]: {
            color: 'text-purple-700',
            bgColor: 'bg-purple-50',
            borderColor: 'border-purple-200',
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

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            {/* Overlay */}
            <div
                className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${
                    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />

            {/* Drawer */}
            <div
                className={`fixed right-0 top-0 h-full w-full sm:w-[600px] lg:w-[700px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                } flex flex-col`}
            >
                {/* Header */}
                <div className={`flex-shrink-0 ${config.bgColor} ${config.borderColor} border-b px-6 py-4`}>
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className={`text-3xl ${config.color}`}>{config.icon}</span>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Transaction Details</h2>
                                    <p className={`text-sm font-semibold ${config.color}`}>{transaction.type}</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-all"
                            title="Close"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-6 printable-area" id="transaction-detail-printable-area">
                    {/* Amount Card */}
                    <div className={`${config.bgColor} ${config.borderColor} border-2 rounded-xl p-6 mb-6 shadow-sm`}>
                        <div className="text-center">
                            <p className="text-sm text-gray-600 mb-1">Amount</p>
                            <p className={`text-4xl font-bold font-mono ${config.color} tracking-tight`}>
                                {transaction.type === TransactionType.EXPENSE && '-'}
                                {transaction.type === TransactionType.INCOME && '+'}
                                {CURRENCY} {transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="space-y-5">
                        {/* Date */}
                        <DetailRow
                            label="Date"
                            value={formatDate(transaction.date)}
                            icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            }
                        />

                        {/* Description */}
                        <DetailRow
                            label="Description"
                            value={transaction.description || '-'}
                            icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            }
                        />

                        {/* Account */}
                        {transaction.type === TransactionType.TRANSFER ? (
                            <>
                                <DetailRow
                                    label="From Account"
                                    value={getAccountName(transaction.fromAccountId)}
                                    icon={
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                        </svg>
                                    }
                                />
                                <DetailRow
                                    label="To Account"
                                    value={getAccountName(transaction.toAccountId)}
                                    icon={
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                        </svg>
                                    }
                                />
                            </>
                        ) : (
                            <DetailRow
                                label="Account"
                                value={getAccountName(transaction.accountId)}
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                }
                            />
                        )}

                        {/* Category */}
                        {transaction.categoryId && (
                            <DetailRow
                                label="Category"
                                value={getCategoryName(transaction.categoryId)}
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                }
                            />
                        )}

                        {/* Contact */}
                        {transaction.contactId && (
                            <DetailRow
                                label="Contact"
                                value={getContactName(transaction.contactId)}
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                }
                            />
                        )}

                        {/* Project */}
                        {transaction.projectId && (
                            <DetailRow
                                label="Project"
                                value={getProjectName(transaction.projectId)}
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                }
                            />
                        )}

                        {/* Building */}
                        {transaction.buildingId && (
                            <DetailRow
                                label="Building"
                                value={getBuildingName(transaction.buildingId)}
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                }
                            />
                        )}

                        {/* Reference */}
                        {transaction.reference && (
                            <DetailRow
                                label="Reference"
                                value={transaction.reference}
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                    </svg>
                                }
                            />
                        )}

                        {/* Transaction ID */}
                        <DetailRow
                            label="Transaction ID"
                            value={transaction.id}
                            icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                            }
                            mono
                        />
                    </div>

                    {/* Children Transactions */}
                    {hasChildren && (
                        <div className="mt-6 border-t pt-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                Bundle Items ({transaction.children?.length})
                            </h3>
                            <div className="space-y-2">
                                {transaction.children?.map((child, idx) => (
                                    <div
                                        key={child.id}
                                        className="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:bg-gray-100 transition-colors"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-gray-900">{child.description}</p>
                                                <p className="text-xs text-gray-500 mt-1">{getContactName(child.contactId)}</p>
                                            </div>
                                            <div className="text-right ml-3">
                                                <p className="text-sm font-bold font-mono text-gray-900">
                                                    {CURRENCY} {child.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-xs text-gray-500">{formatDate(child.date)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-4">
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
                            className="flex-1 min-w-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
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
                    onShowDeleteWarning={(tx) => {
                        setIsEditModalOpen(false);
                        setShowDeleteWarning(true);
                    }}
                />
            </Modal>

            {/* Delete Warning */}
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

// Helper component for detail rows
const DetailRow: React.FC<{
    label: string;
    value: string;
    icon: React.ReactNode;
    mono?: boolean;
}> = ({ label, value, icon, mono = false }) => (
    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-b-0">
        <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{label}</p>
            <p className={`text-sm text-gray-900 ${mono ? 'font-mono text-xs' : 'font-medium'} break-words`}>
                {value}
            </p>
        </div>
    </div>
);

export default TransactionDetailDrawer;

