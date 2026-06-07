import React from 'react';
import { Quotation } from '../../types';
import QuotationSmartTable from './QuotationSmartTable';

interface VendorQuotationsTableProps {
    vendorId: string;
    onEditQuotation?: (quotation: Quotation) => void;
}

const VendorQuotationsTable: React.FC<VendorQuotationsTableProps> = ({ vendorId, onEditQuotation }) => (
    <QuotationSmartTable
        vendorId={vendorId}
        showVendorColumn={false}
        onEditQuotation={onEditQuotation}
        tableHeight={480}
    />
);

export default VendorQuotationsTable;
