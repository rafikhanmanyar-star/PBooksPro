
import React from 'react';
import { Invoice, Bill } from '../../types';
import { CURRENCY } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import { formatDate } from '../../utils/dateUtils';

interface SimpleInvoiceBillItemProps {
  item: Invoice | Bill;
  type: 'invoice' | 'bill';
}

const SimpleInvoiceBillItem: React.FC<SimpleInvoiceBillItemProps> = ({ item, type }) => {
  const { state } = useAppContext();
  const { contactId, amount, paidAmount, issueDate } = item;
  const number = type === 'invoice' ? (item as Invoice).invoiceNumber : (item as Bill).billNumber;
  const contactName = state.contacts.find(c => c.id === contactId)?.name || 'N/A';
  const balance = amount - paidAmount;
  const contactLabel = type === 'invoice' ? 'Owner' : 'Supplier';

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="font-bold text-gray-800">#{number}</p>
          <p className="text-sm text-gray-600 font-medium">{contactLabel}: {contactName}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-danger">{CURRENCY} {(balance || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-500">Balance Due</p>
        </div>
      </div>
       <div className="mt-2 text-xs text-gray-500">
          Issued: {formatDate(issueDate)}
      </div>
    </div>
  );
};

export default SimpleInvoiceBillItem;
