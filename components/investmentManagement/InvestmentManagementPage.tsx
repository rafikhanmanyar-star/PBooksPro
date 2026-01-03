
import React, { memo } from 'react';
import ProjectEquityManagement from '../projectManagement/ProjectEquityManagement';

const InvestmentManagementPage: React.FC = () => {
    return (
        <div className="h-full">
            <ProjectEquityManagement />
        </div>
    );
};

export default memo(InvestmentManagementPage);

