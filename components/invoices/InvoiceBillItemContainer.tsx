import React, { useMemo, useState } from 'react';
import type { Invoice, Bill } from '../../types';
import Modal from '../ui/Modal';
import InvoiceBillForm from './InvoiceBillForm';
import InvoiceBillItemView from './InvoiceBillItemView';
import { useInvoiceBillItemRuntime } from './useInvoiceBillItemRuntime';

export interface InvoiceBillItemProps {
  item: Invoice | Bill;
  type: 'invoice' | 'bill';
  onRecordPayment: (item: Invoice | Bill) => void;
  onItemClick?: (item: Invoice | Bill) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  selectionMode?: boolean;
}

/**
 * Single-row container: subscriptions live here (not in the view).
 * Used when InvoiceBillItem is mounted directly (e.g. legacy imports).
 * Prefer InvoiceBillList for multi-row lists — it batches subscriptions once per list.
 */
const InvoiceBillItemContainer: React.FC<InvoiceBillItemProps> = ({
  item,
  type,
  onRecordPayment,
  onItemClick,
  isSelected,
  onToggleSelect,
  selectionMode,
}) => {
  const { buildViewModel, handleDelete, handleSendWhatsApp } = useInvoiceBillItemRuntime();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const viewModel = useMemo(() => buildViewModel(item, type), [buildViewModel, item, type]);

  const onEdit = (editItem: Invoice | Bill) => setIsEditModalOpen(true);
  const onDelete = (deleteItem: Invoice | Bill) => void handleDelete(deleteItem, type);
  const onSendWhatsApp = (whatsAppItem: Invoice | Bill) => void handleSendWhatsApp(whatsAppItem, type);

  return (
    <>
      <InvoiceBillItemView
        viewModel={viewModel}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        selectionMode={selectionMode}
        onItemClick={onItemClick}
        onEdit={onEdit}
        onDelete={onDelete}
        onRecordPayment={onRecordPayment}
        onSendWhatsApp={onSendWhatsApp}
      />

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit ${type}`}
        size={type === 'bill' ? 'xl' : 'lg'}
        className={type === 'bill' ? 'sm:!max-w-7xl' : undefined}
      >
        <InvoiceBillForm key={item.id} onClose={() => setIsEditModalOpen(false)} type={type} itemToEdit={item} />
      </Modal>
    </>
  );
};

export default React.memo(InvoiceBillItemContainer);
