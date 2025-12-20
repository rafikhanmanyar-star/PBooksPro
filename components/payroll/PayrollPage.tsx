
import React, { useState } from 'react';
import Tabs from '../ui/Tabs';
import StaffManagement from './StaffManagement';
import PayslipManagement from './PayslipManagement';
import useLocalStorage from '../../hooks/useLocalStorage';

interface PayrollPageProps {
    payrollType?: 'Rental' | 'Project';
}

const PayrollPage: React.FC<PayrollPageProps> = ({ payrollType }) => {
    const [activeTab, setActiveTab] = useLocalStorage<string>('payroll_activeTab', 'Staff Management');
    const TABS = ['Staff Management', 'Payslips'];

    return (
        <div className="flex flex-col h-full pb-4">
            <div className="flex-shrink-0 space-y-4 mb-4">
                <h2 className="text-2xl font-bold text-slate-800">{payrollType ? `${payrollType} Payroll Management` : 'Global Payroll Management'}</h2>
                <Tabs tabs={TABS} activeTab={activeTab} onTabClick={setActiveTab} />
            </div>
            
            <div className="flex-grow min-h-0 relative">
                <div className="absolute inset-0">
                    {activeTab === 'Staff Management' && <StaffManagement payrollType={payrollType} />}
                    {activeTab === 'Payslips' && <PayslipManagement payrollType={payrollType} />}
                </div>
            </div>
        </div>
    );
};

export default PayrollPage;
