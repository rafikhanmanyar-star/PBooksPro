
import React, { useState } from 'react';
import Tabs from '../ui/Tabs';
import BrokerPayouts from '../payouts/BrokerPayouts';
import ProjectOwnerPayouts from './ProjectOwnerPayouts';
import ProjectPMPayouts from './ProjectPMPayouts';

const ProjectPayoutsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('Owners/Clients');

    return (
        <div className="space-y-6">
            <Tabs tabs={['Owners/Clients', 'Brokers', 'Project Management']} activeTab={activeTab} onTabClick={setActiveTab} />
            <div className="mt-4">
                {activeTab === 'Owners/Clients' && <ProjectOwnerPayouts />}
                {activeTab === 'Brokers' && <BrokerPayouts context="Project" />}
                {activeTab === 'Project Management' && <ProjectPMPayouts />}
            </div>
        </div>
    );
};

export default ProjectPayoutsPage;
