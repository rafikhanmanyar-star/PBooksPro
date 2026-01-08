import { apiClient } from '../client';
import { Task } from '../../../types';

export class TasksApiRepository {
  async findAll(completed?: boolean): Promise<Task[]> {
    const params = new URLSearchParams();
    if (completed !== undefined) params.append('completed', completed.toString());
    const query = params.toString();
    return apiClient.get<Task[]>(`/tasks${query ? `?${query}` : ''}`);
  }

  async findById(id: string): Promise<Task | null> {
    try {
      return await apiClient.get<Task>(`/tasks/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(task: Partial<Task>): Promise<Task> {
    return apiClient.post<Task>('/tasks', task);
  }

  async update(id: string, task: Partial<Task>): Promise<Task> {
    return apiClient.post<Task>('/tasks', { ...task, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/tasks/${id}`);
  }
}
