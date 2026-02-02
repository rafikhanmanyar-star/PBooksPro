import React, { Suspense } from 'react';
import { Page } from '../../types';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import Loading from '../ui/Loading';

// Lazy load all task modules
const TaskOverview = lazyWithRetry(() => import('./TaskOverview'));
const TasksCalendarView = lazyWithRetry(() => import('./TasksCalendarView'));
const TeamRankingPage = lazyWithRetry(() => import('./TeamRankingPage'));
const TaskCreationPage = lazyWithRetry(() => import('./TaskCreationPage'));
const TaskAssignmentDashboard = lazyWithRetry(() => import('./management/TaskAssignmentDashboard'));
const WorkflowDashboard = lazyWithRetry(() => import('./workflow/WorkflowDashboard'));
const TaskExecutionDashboard = lazyWithRetry(() => import('./execution/TaskExecutionDashboard'));
const TaskDashboardsPage = lazyWithRetry(() => import('./TaskDashboardsPage'));
const KPIDashboard = lazyWithRetry(() => import('./kpi/KPIDashboard'));
const NotificationCenter = lazyWithRetry(() => import('./notifications/NotificationCenter'));
const TaskAutomationPage = lazyWithRetry(() => import('./TaskAutomationPage'));
const TaskReportsPage = lazyWithRetry(() => import('./TaskReportsPage'));
const TaskConfigurationPage = lazyWithRetry(() => import('./TaskConfigurationPage'));
const TaskAuditPage = lazyWithRetry(() => import('./TaskAuditPage'));
const OKRManagementLayout = lazyWithRetry(() => import('./okr/OKRManagementLayout'));
const InitiativeManagementLayout = lazyWithRetry(() => import('./initiatives/InitiativeManagementLayout'));
const RolesDashboard = lazyWithRetry(() => import('./roles/RolesDashboard'));
const TaskManagementLayout = lazyWithRetry(() => import('./management/TaskManagementLayout'));

interface TaskModuleRouterProps {
    currentPage: Page;
}

const TaskModuleRouter: React.FC<TaskModuleRouterProps> = ({ currentPage }) => {
    let Component;

    switch (currentPage) {
        case 'tasks':
            Component = TaskOverview;
            break;
        case 'tasksCalendar':
            Component = TasksCalendarView;
            break;
        case 'teamRanking':
            Component = TeamRankingPage;
            break;
        case 'taskCreation':
            Component = TaskCreationPage;
            break;
        case 'taskAssignment':
            Component = TaskAssignmentDashboard;
            break;
        case 'taskWorkflow':
            Component = WorkflowDashboard;
            break;
        case 'taskExecution':
            Component = TaskExecutionDashboard;
            break;
        case 'taskDashboards':
            Component = TaskDashboardsPage;
            break;
        case 'taskKPIs':
            Component = KPIDashboard;
            break;
        case 'taskNotifications':
            Component = NotificationCenter;
            break;
        case 'taskAutomation':
            Component = TaskAutomationPage;
            break;
        case 'taskReports':
            Component = TaskReportsPage;
            break;
        case 'taskConfiguration':
            Component = TaskConfigurationPage;
            break;
        case 'taskAudit':
            Component = TaskAuditPage;
            break;
        case 'taskOKR':
            Component = OKRManagementLayout;
            break;
        case 'taskInitiatives':
            Component = InitiativeManagementLayout;
            break;
        case 'taskRoles':
            Component = RolesDashboard;
            break;
        case 'taskManagement':
            Component = TaskManagementLayout;
            break;
        default:
            Component = TaskOverview;
    }

    // props for components that need them
    const passedProps: any = {};
    if (currentPage === 'taskAssignment' || currentPage === 'taskWorkflow' || currentPage === 'taskExecution' || currentPage === 'taskManagement') {
        passedProps.onNavigate = () => { };
    }

    return (
        <Suspense fallback={<Loading message="Loading Task Module..." />}>
            <Component {...passedProps} />
        </Suspense>
    );
};

export default TaskModuleRouter;
