import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import type { PersonalTaskApi } from '../../services/api/repositories/personalTasksApiRepository';
import {
  createTask,
  fetchCalendarMonth,
  fetchTask,
  fetchTasks,
  removeTask,
  updateTask,
} from './personalTasksService';
import TaskEditModal from './TaskEditModal';

function statusChipClass(status: PersonalTaskApi['status']): string {
  switch (status) {
    case 'pending':
      return 'bg-slate-400 text-white';
    case 'in_progress':
      return 'bg-blue-600 text-white';
    case 'completed':
      return 'bg-emerald-600 text-white';
    case 'cancelled':
      return 'bg-red-600 text-white';
    default:
      return 'bg-slate-400 text-white';
  }
}

function todayYmd(): string {
  return dayjs().format('YYYY-MM-DD');
}

const MyTasksTab: React.FC = () => {
  const { user } = useAuth();
  const { state } = useAppContext();
  const currentUserId =
    user?.id ||
    state.currentUser?.id ||
    (state as { currentUser?: { id?: string } }).currentUser?.id;

  const [tasks, setTasks] = useState<PersonalTaskApi[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [calendarData, setCalendarData] = useState<Record<string, PersonalTaskApi[]>>({});
  const [calLoading, setCalLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingTask, setEditingTask] = useState<PersonalTaskApi | null>(null);
  const [defaultTargetDate, setDefaultTargetDate] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const loadList = useCallback(async () => {
    setListError(null);
    try {
      const rows = await fetchTasks(currentUserId);
      setTasks(rows);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Failed to load tasks.');
      setTasks([]);
    }
  }, [currentUserId]);

  const loadCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const data = await fetchCalendarMonth(currentUserId, calendarMonth);
      setCalendarData(data);
    } catch {
      setCalendarData({});
    } finally {
      setCalLoading(false);
    }
  }, [currentUserId, calendarMonth]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const tid = (e as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (!tid || !currentUserId) return;
      void fetchTask(currentUserId, tid).then((t) => {
        if (t) {
          setModalMode('edit');
          setEditingTask(t);
          setModalOpen(true);
        }
      });
    };
    window.addEventListener('pb:open-personal-task', onOpen);
    return () => window.removeEventListener('pb:open-personal-task', onOpen);
  }, [currentUserId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadCalendar();
    }, 200);
    return () => window.clearTimeout(t);
  }, [loadCalendar]);

  const overdue = useMemo(() => {
    const t = todayYmd();
    return tasks.filter(
      (x) => x.targetDate < t && x.status !== 'completed' && x.status !== 'cancelled'
    );
  }, [tasks]);

  const filteredList = useMemo(() => {
    let r = tasks;
    if (statusFilter !== 'all') r = r.filter((x) => x.status === statusFilter);
    if (priorityFilter !== 'all') r = r.filter((x) => x.priority === priorityFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((x) => x.title.toLowerCase().includes(q) || (x.description || '').toLowerCase().includes(q));
    }
    return r;
  }, [tasks, statusFilter, priorityFilter, search]);

  const monthStart = dayjs(`${calendarMonth}-01`);
  const daysInMonth = monthStart.daysInMonth();
  const startWeekday = monthStart.day();
  const cells = useMemo(() => {
    const pad = startWeekday;
    const total = pad + daysInMonth;
    const rows = Math.ceil(total / 7) * 7;
    const out: { day: number | null; ymd: string | null }[] = [];
    for (let i = 0; i < rows; i++) {
      const d = i - pad + 1;
      if (d < 1 || d > daysInMonth) out.push({ day: null, ymd: null });
      else {
        const ymd = monthStart.date(d).format('YYYY-MM-DD');
        out.push({ day: d, ymd });
      }
    }
    return out;
  }, [calendarMonth, daysInMonth, startWeekday, monthStart]);

  const openCreate = (date?: string) => {
    setModalMode('create');
    setEditingTask(null);
    setDefaultTargetDate(date || dayjs().format('YYYY-MM-DD'));
    setModalOpen(true);
  };

  const openEdit = (task: PersonalTaskApi) => {
    setModalMode('edit');
    setEditingTask(task);
    setDefaultTargetDate(undefined);
    setModalOpen(true);
  };

  const handleSave = async (payload: Parameters<typeof createTask>[1] & Partial<{ status: string; progress: number }>) => {
    if (modalMode === 'create') {
      await createTask(currentUserId, {
        title: payload.title,
        description: payload.description,
        targetDate: payload.targetDate,
        priority: payload.priority,
      });
    } else if (editingTask) {
      await updateTask(currentUserId, editingTask.id, {
        title: payload.title,
        description: payload.description ?? null,
        targetDate: payload.targetDate,
        status: payload.status,
        progress: payload.progress,
        priority: payload.priority,
      });
    }
    await loadList();
    await loadCalendar();
    window.dispatchEvent(new CustomEvent('pb:tasks-changed'));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await removeTask(currentUserId, id);
      await loadList();
      await loadCalendar();
      window.dispatchEvent(new CustomEvent('pb:tasks-changed'));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  const goPrevMonth = () => setCalendarMonth((m) => dayjs(`${m}-01`).subtract(1, 'month').format('YYYY-MM'));
  const goNextMonth = () => setCalendarMonth((m) => dayjs(`${m}-01`).add(1, 'month').format('YYYY-MM'));

  const tday = todayYmd();

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">My Tasks</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track deadlines, progress, and your monthly calendar.</p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + New task
        </button>
      </div>

      {listError && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{listError}</div>
      )}

      {overdue.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">Overdue</p>
          <ul className="text-sm space-y-1 text-amber-900 dark:text-amber-100">
            {overdue.map((x) => (
              <li key={x.id}>
                <button type="button" className="underline hover:no-underline text-left" onClick={() => openEdit(x)}>
                  {x.title}
                </button>
                <span className="text-amber-700 dark:text-amber-300"> — due {x.targetDate}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Calendar</h2>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={goPrevMonth} className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-sm">
              ←
            </button>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {monthStart.format('MMMM YYYY')}
            </span>
            <button type="button" onClick={goNextMonth} className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-sm">
              →
            </button>
          </div>
          {calLoading && <p className="text-xs text-slate-500 mb-2">Loading month…</p>}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500 mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              if (!cell.ymd) {
                return <div key={`e-${idx}`} className="min-h-[72px] rounded-lg bg-slate-50/50 dark:bg-slate-800/20" />;
              }
              const isToday = cell.ymd === tday;
              const dayTasks = calendarData[cell.ymd] || [];
              return (
                <div
                  key={cell.ymd}
                  className={`min-h-[72px] rounded-lg border p-1 text-left cursor-pointer transition-colors ${
                    isToday
                      ? 'border-indigo-500 ring-1 ring-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                  onClick={() => openCreate(cell.ymd)}
                  title="Click to add task for this date"
                >
                  <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-0.5">{cell.day}</div>
                  <div className="space-y-0.5 overflow-hidden max-h-[52px]">
                    {dayTasks.map((tsk) => (
                      <button
                        key={tsk.id}
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(tsk);
                        }}
                        className={`block w-full truncate text-left text-[9px] px-0.5 py-0.5 rounded ${statusChipClass(tsk.status)}`}
                      >
                        {tsk.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Task list</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="search"
            placeholder="Search title or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
          >
            <option value="all">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredList.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100 max-w-[220px] truncate">{row.title}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.targetDate}
                    {row.targetDate < tday && row.status !== 'completed' && row.status !== 'cancelled' && (
                      <span className="ml-1 text-amber-600 text-xs">(overdue)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded ${statusChipClass(row.status)}`}>{row.status.replace('_', ' ')}</span>
                  </td>
                  <td className="px-3 py-2">{row.progress}%</td>
                  <td className="px-3 py-2 capitalize">{row.priority}</td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button type="button" className="text-indigo-600 hover:underline text-xs" onClick={() => openEdit(row)}>
                      Edit
                    </button>
                    <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => void handleDelete(row.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredList.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No tasks match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <TaskEditModal
        open={modalOpen}
        mode={modalMode}
        task={editingTask}
        initialTargetDate={defaultTargetDate}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
};

export default MyTasksTab;
