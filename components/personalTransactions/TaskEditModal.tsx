import React, { useEffect, useState } from 'react';
import type { PersonalTaskApi } from '../../services/api/repositories/personalTasksApiRepository';

export type TaskModalMode = 'create' | 'edit';

interface TaskEditModalProps {
  open: boolean;
  mode: TaskModalMode;
  initialTargetDate?: string;
  task: PersonalTaskApi | null;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description?: string;
    targetDate: string;
    priority: string;
    status?: PersonalTaskApi['status'];
    progress?: number;
  }) => Promise<void>;
}

const PRIORITIES: PersonalTaskApi['priority'][] = ['low', 'medium', 'high'];
const STATUSES: PersonalTaskApi['status'][] = ['pending', 'in_progress', 'completed', 'cancelled'];

const TaskEditModal: React.FC<TaskEditModalProps> = ({
  open,
  mode,
  initialTargetDate,
  task,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [priority, setPriority] = useState<PersonalTaskApi['priority']>('medium');
  const [status, setStatus] = useState<PersonalTaskApi['status']>('pending');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setTargetDate(task.targetDate.slice(0, 10));
      setPriority(task.priority);
      setStatus(task.status);
      setProgress(task.progress);
    } else {
      setTitle('');
      setDescription('');
      setTargetDate((initialTargetDate || new Date().toISOString().slice(0, 10)).slice(0, 10));
      setPriority('medium');
      setStatus('pending');
      setProgress(0);
    }
  }, [open, mode, task, initialTargetDate]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const t = title.trim();
    if (!t) {
      setError('Title is required.');
      return;
    }
    if (progress < 0 || progress > 100) {
      setError('Progress must be between 0 and 100.');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        await onSave({ title: t, description: description.trim() || undefined, targetDate, priority });
      } else {
        await onSave({
          title: t,
          description: description.trim() || undefined,
          targetDate,
          priority,
          status,
          progress,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {mode === 'create' ? 'New task' : 'Edit task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 p-1 rounded-lg"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Target date *</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PersonalTaskApi['priority'])}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {mode === 'edit' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PersonalTaskApi['status'])}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Progress: {progress}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(parseInt(e.target.value, 10))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  className="mt-1 w-24 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
                />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskEditModal;
