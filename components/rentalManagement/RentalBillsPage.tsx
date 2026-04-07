import React from 'react';
import RentalBillsDashboard from './RentalBillsDashboard';

/** Rental bills: accounts-payable summary (tree + unified bills/payments table). List-only UI was removed. */
const RentalBillsPage: React.FC = () => (
  <div className="flex flex-col h-full min-h-0 overflow-hidden">
    <RentalBillsDashboard />
  </div>
);

export default RentalBillsPage;
