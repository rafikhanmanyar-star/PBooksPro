

import React, { useState } from 'react';
import EmployeePaymentReport from './EmployeePaymentReport';
import Tabs from '../ui/Tabs';

const REPORT_TYPES = ['Project Payroll', 'Rental Payroll'];

const ReportsPage: React.FC = () => {
    const [activeReport, setActiveReport] = useState(REPORT_TYPES[0]);

    const renderReport = () => {
        switch (activeReport) {
            case 'Project Payroll':
                return <EmployeePaymentReport payrollType="Project" />;
            case 'Rental Payroll':
                return <EmployeePaymentReport payrollType="Rental" />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-slate-800">Employee Payment Reports</h2>
            
            <div className="no-print">
                <Tabs tabs={REPORT_TYPES} activeTab={activeReport} onTabClick={setActiveReport} />
            </div>
            
            <div>
                {renderReport()}
            </div>
        </div>
    );
};

export default ReportsPage;
