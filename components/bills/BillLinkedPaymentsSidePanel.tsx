import React from 'react';
import BillSummarySidePanel, { type BillSummarySidePanelProps } from './BillSummarySidePanel';

export interface BillLinkedPaymentsSidePanelProps {
    billId: string;
    className?: string;
    includeRentalOrphanPayments?: boolean;
}

/** @deprecated Prefer BillSummarySidePanel — kept for existing imports. */
const BillLinkedPaymentsSidePanel: React.FC<BillLinkedPaymentsSidePanelProps> = ({
    billId,
    className,
    includeRentalOrphanPayments,
}) => (
    <BillSummarySidePanel
        billId={billId}
        className={className}
        includeRentalOrphanPayments={includeRentalOrphanPayments}
    />
);

export type { BillSummarySidePanelProps };
export default BillLinkedPaymentsSidePanel;
