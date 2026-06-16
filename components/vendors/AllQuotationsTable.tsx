import React from 'react';
import { Quotation } from '../../types';
import { ICONS } from '../../constants';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../ui/Button';
import QuotationSmartTable from './QuotationSmartTable';

interface AllQuotationsTableProps {
    onEditQuotation?: (quotation: Quotation) => void;
    onNewQuotation?: () => void;
}

const AllQuotationsTable: React.FC<AllQuotationsTableProps> = ({ onEditQuotation, onNewQuotation }) => {
    const perms = usePermissions();

    return (
        <div className="h-full flex flex-col min-h-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-app-text">All Quotations</h2>
                    <p className="text-sm text-app-muted">View and manage vendor quotations across all suppliers</p>
                </div>
                {perms.canCreateQuotation && onNewQuotation && (
                    <Button onClick={onNewQuotation} className="!bg-primary hover:!bg-primary/90 shadow-ds-card">
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                        <span>New Quotation</span>
                    </Button>
                )}
            </div>
            <QuotationSmartTable
                showVendorColumn
                onEditQuotation={onEditQuotation}
                onNewQuotation={perms.canCreateQuotation ? onNewQuotation : undefined}
                tableHeight={520}
            />
        </div>
    );
};

export default AllQuotationsTable;
