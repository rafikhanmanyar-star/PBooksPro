
import React, { memo } from 'react';
import ProjectPMManager from '../projectManagement/ProjectPMManager';

const PMConfigPage: React.FC = () => {
    return (
        <div className="h-full">
            <ProjectPMManager />
        </div>
    );
};

export default memo(PMConfigPage);

