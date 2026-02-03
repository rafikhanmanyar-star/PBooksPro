import { apiClient } from '../client';

export interface TaskItem {
    id: string;
    title: string;
    description?: string;
    initiative_id?: string;
    initiative_name?: string;
    owner_id?: string;
    owner_name?: string;
    status: 'Not Started' | 'In Progress' | 'Blocked' | 'Completed' | 'On Hold';
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    start_date?: string;
    due_date: string;
    estimated_hours?: number;
    actual_hours?: number;
    progress_percentage: number;
    created_at: string;
    updated_at: string;
}

export interface TaskInitiative {
    id: string;
    title: string;
    description?: string;
    owner_id?: string;
    owner_name?: string;
    status: string;
    priority: string;
    health: string;
    start_date: string;
    end_date: string;
    progress_percentage: number;
}

export interface TaskKeyResult {
    id: string;
    objective_id: string;
    title: string;
    owner_id?: string;
    owner_name?: string;
    metric_type: 'Number' | 'Percentage' | 'Currency' | 'Boolean';
    start_value: number;
    target_value: number;
    current_value: number;
    progress_percentage: number;
    confidence_score: number;
    weight: number;
    status: string;
    due_date?: string;
}

export interface TaskObjective {
    id: string;
    title: string;
    description?: string;
    owner_id?: string;
    owner_name?: string;
    type: 'Strategic' | 'Operational';
    level: 'Company' | 'Department' | 'Team' | 'Individual';
    status: string;
    progress_percentage: number;
    confidence_score: number;
    visibility: string;
    parent_objective_id?: string;
    key_results?: TaskKeyResult[];
    created_at: string;
}

export const tasksApi = {
    // Tasks
    getTasks: async (): Promise<TaskItem[]> => {
        return apiClient.get<TaskItem[]>('/tasks');
    },

    getTask: async (id: string): Promise<TaskItem> => {
        return apiClient.get<TaskItem>(`/tasks/${id}`);
    },

    createTask: async (task: Partial<TaskItem>): Promise<TaskItem> => {
        return apiClient.post<TaskItem>('/tasks', task);
    },

    updateTask: async (id: string, task: Partial<TaskItem>): Promise<TaskItem> => {
        return apiClient.put<TaskItem>(`/tasks/${id}`, task);
    },

    // Initiatives
    getInitiatives: async (): Promise<TaskInitiative[]> => {
        return apiClient.get<TaskInitiative[]>('/tasks/initiatives/list');
    },

    // Objectives
    getObjectives: async (): Promise<TaskObjective[]> => {
        return apiClient.get<TaskObjective[]>('/tasks/objectives/list');
    },

    getObjective: async (id: string): Promise<TaskObjective> => {
        return apiClient.get<TaskObjective>(`/tasks/objectives/${id}`);
    },

    createObjective: async (obj: Partial<TaskObjective>): Promise<TaskObjective> => {
        return apiClient.post<TaskObjective>('/tasks/objectives', obj);
    },

    // Key Results
    createKeyResult: async (kr: Partial<TaskKeyResult>): Promise<TaskKeyResult> => {
        return apiClient.post<TaskKeyResult>('/tasks/key-results', kr);
    },

    updateKeyResult: async (id: string, data: any): Promise<TaskKeyResult> => {
        return apiClient.put<TaskKeyResult>(`/tasks/key-results/${id}`, data);
    },

    // Reports
    getTeamReport: async (): Promise<any> => {
        return apiClient.get<any>('/tasks/reports/team-summary');
    },

    // Roles & Permissions
    getRoles: async (): Promise<any[]> => {
        return apiClient.get<any[]>('/tasks/roles/list');
    },

    createRole: async (role: any): Promise<any> => {
        return apiClient.post<any>('/tasks/roles', role);
    },

    getPermissions: async (): Promise<any[]> => {
        return apiClient.get<any[]>('/tasks/permissions/list');
    },

    getRolePermissions: async (roleId: string): Promise<any[]> => {
        return apiClient.get<any[]>(`/tasks/roles/${roleId}/permissions`);
    },

    updateRolePermissions: async (roleId: string, permissionIds: string[]): Promise<any> => {
        return apiClient.post<any>(`/tasks/roles/${roleId}/permissions`, { permission_ids: permissionIds });
    },

    getUserRoles: async (userId: string): Promise<any[]> => {
        return apiClient.get<any[]>(`/tasks/user-roles/${userId}`);
    },

    updateUserRoles: async (userId: string, roleIds: string[]): Promise<any> => {
        return apiClient.post<any>(`/tasks/user-roles/${userId}`, { role_ids: roleIds });
    }
};
