import React, { useState } from 'react';
import { Task, TaskStatus } from '../../types';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface TaskCheckInModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    status?: TaskStatus;
    kpi_current_value?: number;
    comment?: string;
  }) => Promise<void>;
}

const TASK_STATUSES: TaskStatus[] = ['Not Started', 'In Progress', 'Review', 'Completed'];

const TaskCheckInModal: React.FC<TaskCheckInModalProps> = ({
  task,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [kpiCurrentValue, setKpiCurrentValue] = useState(
    task.kpi_current_value?.toString() || ''
  );
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate KPI value if target exists
    if (task.kpi_target_value && kpiCurrentValue) {
      const value = parseFloat(kpiCurrentValue);
      if (isNaN(value) || value < 0) {
        setError('KPI value must be a valid positive number');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        status: status !== task.status ? status : undefined,
        kpi_current_value: kpiCurrentValue ? parseFloat(kpiCurrentValue) : undefined,
        comment: comment.trim() || undefined,
      });
      setComment(''); // Reset comment on success
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to check in');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Check-in: ${task.title}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TaskStatus)}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        {task.kpi_goal && task.kpi_target_value && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Update KPI Progress
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={kpiCurrentValue}
                onChange={(e) => setKpiCurrentValue(e.target.value)}
                placeholder={`Current: ${task.kpi_current_value || 0}`}
                className="flex-1"
              />
              <span className="text-sm text-gray-500">
                / {task.kpi_target_value} {task.kpi_unit || ''}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Goal: {task.kpi_goal}
            </p>
            {task.kpi_target_value && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Progress</span>
                  <span>
                    {Math.round(
                      (parseFloat(kpiCurrentValue || '0') / task.kpi_target_value) * 100
                    )}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (parseFloat(kpiCurrentValue || '0') / task.kpi_target_value) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Comment / Notes
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="block w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-base sm:text-sm"
            rows={3}
            placeholder="Add progress notes or comments..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" onClick={onClose} variant="secondary" disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Update Progress'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default TaskCheckInModal;
