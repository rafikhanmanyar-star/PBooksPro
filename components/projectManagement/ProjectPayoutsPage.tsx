
import React, { useState } from 'react';
import Tabs from '../ui/Tabs';
import BrokerPayouts from '../payouts/BrokerPayouts';
import ProjectPMPayouts from './ProjectPMPayouts';

const ProjectPayoutsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('Brokers');

    return (
        <div className="space-y-6">
            <Tabs tabs={['Brokers', 'Project Management']} activeTab={activeTab} onTabClick={setActiveTab} />
            <div className="mt-4">
                {activeTab === 'Brokers' && <BrokerPayouts context="Project" />}
                {activeTab === 'Project Management' && <ProjectPMPayouts />}
            </div>
        </div>
    );
};

export default ProjectPayoutsPage;
