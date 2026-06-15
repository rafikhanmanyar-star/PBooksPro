/**
 * Personal tasks — PostgreSQL API.
 */

import { PersonalTasksApiRepository, type PersonalTaskApi } from '../../services/api/repositories/personalTasksApiRepository';

const api = () => new PersonalTasksApiRepository();

export type { PersonalTaskApi };

export async function fetchTasks(userId: string | undefined): Promise<PersonalTaskApi[]> {
  if (!userId) return [];
  return api().list();
}

export async function fetchCalendarMonth(userId: string | undefined, monthYm: string): Promise<Record<string, PersonalTaskApi[]>> {
  if (!userId) return {};
  return api().calendarMonth(monthYm);
}

export async function fetchTask(userId: string | undefined, id: string): Promise<PersonalTaskApi | null> {
  if (!userId) return null;
  try {
    return await api().get(id);
  } catch {
    return null;
  }
}

export async function createTask(
  userId: string | undefined,
  body: { title: string; description?: string; targetDate: string; priority?: string }
): Promise<PersonalTaskApi> {
  if (!userId) throw new Error('Not signed in.');
  return api().create(body);
}

export async function updateTask(
  userId: string | undefined,
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
  if (!userId) throw new Error('Not signed in.');
  return api().update(id, body);
}

export async function removeTask(userId: string | undefined, id: string): Promise<void> {
  if (!userId) throw new Error('Not signed in.');
  await api().delete(id);
}

export async function fetchUpcomingTasks(userId: string | undefined, days = 7): Promise<PersonalTaskApi[]> {
  if (!userId) return [];
  return api().upcoming(days);
}
