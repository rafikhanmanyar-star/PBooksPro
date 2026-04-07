
import React from 'react';
import { Invoice, Bill } from '../../types';
import { CURRENCY } from '../../constants';
import { useLookupMaps } from '../../hooks/useLookupMaps';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/numberUtils';

interface SimpleInvoiceBillItemProps {
  item: Invoice | Bill;
  type: 'invoice' | 'bill';
}

const SimpleInvoiceBillItem: React.FC<SimpleInvoiceBillItemProps> = ({ item, type }) => {
  const lookups = useLookupMaps();
  const { contactId, amount, paidAmount, issueDate } = item;
  const number = type === 'invoice' ? (item as Invoice).invoiceNumber : (item as Bill).billNumber;
  const contactName = (contactId && lookups.contacts.get(contactId)?.name) || 'N/A';
  const balance = amount - paidAmount;
  const contactLabel = type === 'invoice' ? 'Owner' : 'Supplier';

  return (
    <div className="p-3 bg-app-toolbar rounded-lg border border-app-border">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="font-bold text-app-text">#{number}</p>
          <p className="text-sm text-app-muted font-medium">{contactLabel}: {contactName}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-ds-danger">{CURRENCY} {formatCurrency(balance || 0)}</p>
          <p className="text-xs text-app-muted">Balance Due</p>
        </div>
      </div>
       <div className="mt-2 text-xs text-app-muted">
          Issued: {formatDate(issueDate)}
      </div>
    </div>
  );
};

export default React.memo(SimpleInvoiceBillItem);
