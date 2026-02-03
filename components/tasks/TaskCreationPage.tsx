import React from 'react';
import TaskAssignmentDashboard from './management/TaskAssignmentDashboard';

// NOTE: TaskCreationPage is temporarily serving as the entry point for both Task Layouts
// Ideally, the user route would differentiate. For module demo, we can just switch or replace.
// User request was Module 5 impl. Let's make this page render the new dashboard for this step.

const TaskCreationPage: React.FC = () => {
    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Task Assignments</h1>
                <p className="text-gray-500">Manage ownership, contributors, and bulk assignments.</p>
            </div>
            <TaskAssignmentDashboard onNavigate={() => { }} />
        </div>
    );
};

export default TaskCreationPage;
