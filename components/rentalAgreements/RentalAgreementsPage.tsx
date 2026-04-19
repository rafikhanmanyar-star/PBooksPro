import React from 'react';
import RentalAgreementsDashboard from './RentalAgreementsDashboard';

/** Rental agreements: summary (tree + table) only; list-only layout was removed. */
const RentalAgreementsPage: React.FC = () => (
    <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 min-h-0 overflow-hidden">
            <RentalAgreementsDashboard />
        </div>
    </div>
);

export default RentalAgreementsPage;
