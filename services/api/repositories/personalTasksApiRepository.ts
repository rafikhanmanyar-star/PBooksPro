/**
 * Personal tasks API (My Tasks module).
 */

import { apiClient } from '../client';

export type PersonalTaskApi = {
  id: string;
  userId?: string;
  title: string;
  description?: string;
  createdDate: string;
  targetDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  progress: number;
  priority: 'low' | 'medium' | 'high';
  createdAt?: string;
  updatedAt?: string;
};

function normalizeTask(raw: Record<string, unknown>): PersonalTaskApi {
  const status = String(raw.status ?? 'pending');
  const st =
    status === 'in_progress' || status === 'completed' || status === 'cancelled' || status === 'pending'
      ? status
      : 'pending';
  const pr = String(raw.priority ?? 'medium');
  const priority =
    pr === 'low' || pr === 'high' || pr === 'medium' ? pr : 'medium';
  return {
    id: String(raw.id ?? ''),
    userId: raw.userId != null ? String(raw.userId) : raw.user_id != null ? String(raw.user_id) : undefined,
    title: String(raw.title ?? ''),
    description: raw.description != null ? String(raw.description) : undefined,
    createdDate: String(raw.createdDate ?? raw.created_date ?? '').slice(0, 10),
    targetDate: String(raw.targetDate ?? raw.target_date ?? '').slice(0, 10),
    status: st as PersonalTaskApi['status'],
    progress:
      typeof raw.progress === 'number'
        ? raw.progress
        : parseInt(String(raw.progress ?? '0'), 10) || 0,
    priority,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : raw.created_at != null ? String(raw.created_at) : undefined,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : raw.updated_at != null ? String(raw.updated_at) : undefined,
  };
}

export class PersonalTasksApiRepository {
  async list(): Promise<PersonalTaskApi[]> {
    const rows = await apiClient.get<Record<string, unknown>[]>('/tasks');
    return Array.isArray(rows) ? rows.map((r) => normalizeTask(r)) : [];
  }

  async calendarMonth(monthYm: string): Promise<Record<string, PersonalTaskApi[]>> {
    const raw = await apiClient.get<Record<string, Record<string, unknown>[]>>(
      `/tasks/calendar?month=${encodeURIComponent(monthYm)}`
    );
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, PersonalTaskApi[]> = {};
    for (const [k, arr] of Object.entries(raw)) {
      out[k] = Array.isArray(arr) ? arr.map((r) => normalizeTask(r)) : [];
    }
    return out;
  }

  async get(id: string): Promise<PersonalTaskApi> {
    const raw = await apiClient.get<Record<string, unknown>>(`/tasks/${id}`);
    return normalizeTask(raw);
  }

  async create(body: {
    title: string;
    description?: string;
    targetDate: string;
    priority?: string;
  }): Promise<PersonalTaskApi> {
    const raw = await apiClient.post<Record<string, unknown>>('/tasks', {
      title: body.title,
      description: body.description,
      target_date: body.targetDate,
      targetDate: body.targetDate,
      priority: body.priority ?? 'medium',
    });
    return normalizeTask(raw);
  }

  async update(
    id: string,
    body: Partial<{
      title: string;
      description: string | null;
      targetDate: string;
      status: string;
      progress: number;
      priority: string;
    }>
  ): Promise<PersonalTaskApi> {
    const raw = await apiClient.put<Record<string, unknown>>(`/tasks/${id}`, {
      ...body,
      target_date: body.targetDate,
      targetDate: body.targetDate,
    });
    return normalizeTask(raw);
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/tasks/${id}`);
  }

  async upcoming(days = 7): Promise<PersonalTaskApi[]> {
    const rows = await apiClient.get<Record<string, unknown>[]>(`/tasks/upcoming?days=${days}`);
    return Array.isArray(rows) ? rows.map((r) => normalizeTask(r)) : [];
  }
}
