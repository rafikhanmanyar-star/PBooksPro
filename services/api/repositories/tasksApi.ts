/**
 * Tasks API Repository
 * 
 * Provides API-based access to tasks data.
 * Handles task CRUD operations, check-ins, calendar data, and performance endpoints.
 */

import { apiClient } from '../client';
import { Task, TaskUpdate, TaskPerformanceScore, TaskPerformanceConfig } from '../../../types';

export class TasksApiRepository {
  /**
   * Get all tasks (filtered by user role)
   */
  async findAll(): Promise<Task[]> {
    return apiClient.get<Task[]>('/tasks');
  }

  /**
   * Get task by ID with update history
   */
  async findById(id: string): Promise<Task & { updates?: TaskUpdate[] } | null> {
    try {
      return await apiClient.get<Task & { updates?: TaskUpdate[] }>(`/tasks/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new task
   */
  async create(task: Partial<Task>): Promise<Task> {
    return apiClient.post<Task>('/tasks', task);
  }

  /**
   * Update an existing task
   */
  async update(id: string, task: Partial<Task>): Promise<Task> {
    return apiClient.put<Task>(`/tasks/${id}`, task);
  }

  /**
   * Delete a task
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/tasks/${id}`);
  }

  /**
   * Check-in to a task (update progress)
   */
  async checkIn(id: string, data: {
    status?: string;
    kpi_current_value?: number;
    comment?: string;
  }): Promise<Task> {
    return apiClient.post<Task>(`/tasks/${id}/check-in`, data);
  }

  /**
   * Get tasks for calendar view
   */
  async getCalendarEvents(startDate: string, endDate: string): Promise<Task[]> {
    return apiClient.get<Task[]>(`/tasks/calendar/events?start_date=${startDate}&end_date=${endDate}`);
  }

  /**
   * Get team ranking/leaderboard (Admin only)
   */
  async getLeaderboard(periodStart: string, periodEnd: string): Promise<TaskPerformanceScore[]> {
    return apiClient.get<TaskPerformanceScore[]>(
      `/tasks/performance/leaderboard?period_start=${periodStart}&period_end=${periodEnd}`
    );
  }

  /**
   * Get performance configuration (Admin only)
   */
  async getPerformanceConfig(): Promise<TaskPerformanceConfig> {
    return apiClient.get<TaskPerformanceConfig>('/tasks/performance/config');
  }

  /**
   * Update performance configuration (Admin only)
   */
  async updatePerformanceConfig(config: {
    completion_rate_weight: number;
    deadline_adherence_weight: number;
    kpi_achievement_weight: number;
  }): Promise<{ success: boolean }> {
    return apiClient.put<{ success: boolean }>('/tasks/performance/config', config);
  }
}
