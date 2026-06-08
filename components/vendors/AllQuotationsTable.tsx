import React from 'react';
import { Quotation } from '../../types';
import QuotationSmartTable from './QuotationSmartTable';

interface AllQuotationsTableProps {
    onEditQuotation?: (quotation: Quotation) => void;
}

const AllQuotationsTable: React.FC<AllQuotationsTableProps> = ({ onEditQuotation }) => (
    <QuotationSmartTable showVendorColumn onEditQuotation={onEditQuotation} tableHeight={520} />
);

export default AllQuotationsTable;
