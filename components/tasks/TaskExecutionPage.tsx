import React from 'react';
import TaskExecutionDashboard from './execution/TaskExecutionDashboard';

const TaskExecutionPage: React.FC = () => {
    return (
        <TaskExecutionDashboard onNavigate={() => { }} />
    );
};

export default TaskExecutionPage;
