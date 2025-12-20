
import React from 'react';
import { Invoice, Bill } from '../../types';
import InvoiceBillItem from './InvoiceBillItem';

interface InvoiceBillListProps {
    items: (Invoice | Bill)[];
    type: 'invoice' | 'bill';
    onRecordPayment: (item: Invoice | Bill) => void;
    onItemClick?: (item: Invoice | Bill) => void;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
}

const InvoiceBillList: React.FC<InvoiceBillListProps> = ({ items, type, onRecordPayment, onItemClick, selectedIds, onToggleSelect }) => {
    if (items.length === 0) {
        return (
            <div className="text-center py-10">
                <p className="text-gray-500">No {type === 'invoice' ? 'invoices' : 'bills'} yet.</p>
                <p className="text-sm text-gray-400 mt-2">Click 'Create New' to get started.</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-2">
            {items.map(item => (
                <InvoiceBillItem 
                    key={item.id} 
                    item={item} 
                    type={type} 
                    onRecordPayment={onRecordPayment}
                    onItemClick={onItemClick}
                    isSelected={selectedIds ? selectedIds.has(item.id) : false}
                    onToggleSelect={onToggleSelect}
                    selectionMode={selectedIds && selectedIds.size > 0}
                />
            ))}
        </div>
    );
};

export default InvoiceBillList;
