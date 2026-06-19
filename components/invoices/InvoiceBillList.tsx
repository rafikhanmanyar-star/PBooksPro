
import React, { useCallback, useMemo, useState } from 'react';
import { Invoice, Bill } from '../../types';
import Modal from '../ui/Modal';
import InvoiceBillForm from './InvoiceBillForm';
import InvoiceBillItemView from './InvoiceBillItemView';
import { useInvoiceBillItemRuntime } from './useInvoiceBillItemRuntime';

interface InvoiceBillListProps {
    items: (Invoice | Bill)[];
    type: 'invoice' | 'bill';
    onRecordPayment: (item: Invoice | Bill) => void;
    onItemClick?: (item: Invoice | Bill) => void;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
}

const InvoiceBillList: React.FC<InvoiceBillListProps> = ({
    items,
    type,
    onRecordPayment,
    onItemClick,
    selectedIds,
    onToggleSelect,
}) => {
    const { buildViewModels, handleDelete, handleSendWhatsApp } = useInvoiceBillItemRuntime();
    const [editingItem, setEditingItem] = useState<Invoice | Bill | null>(null);

    const viewModels = useMemo(() => buildViewModels(items, type), [buildViewModels, items, type]);

    const onEdit = useCallback((item: Invoice | Bill) => setEditingItem(item), []);
    const onDelete = useCallback(
        (item: Invoice | Bill) => void handleDelete(item, type),
        [handleDelete, type]
    );
    const onSendWhatsApp = useCallback(
        (item: Invoice | Bill) => void handleSendWhatsApp(item, type),
        [handleSendWhatsApp, type]
    );

    if (items.length === 0) {
        return (
            <div className="text-center py-10">
                <p className="text-gray-500">No {type === 'invoice' ? 'invoices' : 'bills'} yet.</p>
                <p className="text-sm text-gray-400 mt-2">Click 'Create New' to get started.</p>
            </div>
        );
    }

    const selectionMode = Boolean(selectedIds && selectedIds.size > 0);

    return (
        <>
            <div className="space-y-2">
                {viewModels.map((viewModel) => (
                    <InvoiceBillItemView
                        key={viewModel.id}
                        viewModel={viewModel}
                        isSelected={selectedIds ? selectedIds.has(viewModel.id) : false}
                        onToggleSelect={onToggleSelect}
                        selectionMode={selectionMode}
                        onItemClick={onItemClick}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onRecordPayment={onRecordPayment}
                        onSendWhatsApp={onSendWhatsApp}
                    />
                ))}
            </div>

            {editingItem ? (
                <Modal
                    isOpen
                    onClose={() => setEditingItem(null)}
                    title={`Edit ${type}`}
                    size={type === 'bill' ? 'xl' : 'lg'}
                    className={type === 'bill' ? 'sm:!max-w-7xl' : undefined}
                >
                    <InvoiceBillForm
                        key={editingItem.id}
                        onClose={() => setEditingItem(null)}
                        type={type}
                        itemToEdit={editingItem}
                    />
                </Modal>
            ) : null}
        </>
    );
};

export default InvoiceBillList;
