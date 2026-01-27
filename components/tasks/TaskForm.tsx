import React, { useState, useEffect } from 'react';
import { Task, TaskType, TaskStatus, TaskCategory } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';
import ComboBox from '../ui/ComboBox';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/dateUtils';

interface TaskFormProps {
  task?: Task;
  onSubmit: (task: Partial<Task>) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  employees?: Array<{ id: string; name: string }>; // For admin to assign tasks
}

const TASK_CATEGORIES: TaskCategory[] = ['Development', 'Admin', 'Sales', 'Personal Growth'];
const TASK_STATUSES: TaskStatus[] = ['Not Started', 'In Progress', 'Review', 'Completed'];

const TaskForm: React.FC<TaskFormProps> = ({ task, onSubmit, onCancel, onDelete, employees = [] }) => {
  const { user } = useAuth();
  const isAdmin = user?.role?.trim()?.toLowerCase() === 'admin';
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [type, setType] = useState<TaskType>(task?.type || 'Personal');
  const [category, setCategory] = useState<TaskCategory | string>(task?.category || 'Development');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'Not Started');
  const [startDate, setStartDate] = useState(task?.start_date || formatDate(new Date()));
  const [hardDeadline, setHardDeadline] = useState(task?.hard_deadline || '');
  const [kpiGoal, setKpiGoal] = useState(task?.kpi_goal || '');
  const [kpiTargetValue, setKpiTargetValue] = useState(task?.kpi_target_value?.toString() || '');
  const [kpiUnit, setKpiUnit] = useState(task?.kpi_unit || '');
  const [assignedToId, setAssignedToId] = useState(task?.assigned_to_id || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Employees can only create personal tasks
  useEffect(() => {
    if (!isAdmin && !isEdit) {
      setType('Personal');
    }
  }, [isAdmin, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!startDate) {
      setError('Start date is required');
      return;
    }
    if (!hardDeadline) {
      setError('Hard deadline is required');
      return;
    }
    if (new Date(hardDeadline) < new Date(startDate)) {
      setError('Deadline must be after start date');
      return;
    }
    if (type === 'Assigned' && !assignedToId) {
      setError('Please select an employee to assign this task to');
      return;
    }

    setIsSubmitting(true);
    try {
      const taskData: Partial<Task> = {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        category,
        status,
        start_date: startDate,
        hard_deadline: hardDeadline,
        kpi_goal: kpiGoal.trim() || undefined,
        kpi_target_value: kpiTargetValue ? parseFloat(kpiTargetValue) : undefined,
        kpi_unit: kpiUnit.trim() || undefined,
        assigned_to_id: type === 'Assigned' ? assignedToId : undefined,
      };

      await onSubmit(taskData);
    } catch (err: any) {
      setError(err.message || 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const employeeItems = employees.map(emp => ({ id: emp.id, name: emp.name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        placeholder="Enter task title"
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="block w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-base sm:text-sm"
          rows={3}
          placeholder="Enter task description (optional)"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as TaskType)}
          disabled={!isAdmin && isEdit && task?.type === 'Assigned'}
          required
        >
          <option value="Personal">Personal</option>
          {isAdmin && <option value="Assigned">Assigned</option>}
        </Select>

        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        >
          {TASK_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
      </div>

      {type === 'Assigned' && isAdmin && (
        <ComboBox
          label="Assign To"
          items={employeeItems}
          selectedId={assignedToId}
          onSelect={(item) => setAssignedToId(item?.id || '')}
          placeholder="Select employee"
          required
          allowAddNew={false}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DatePicker
          label="Start Date"
          value={startDate}
          onChange={(date) => setStartDate(formatDate(date))}
          required
        />

        <DatePicker
          label="Hard Deadline"
          value={hardDeadline}
          onChange={(date) => setHardDeadline(formatDate(date))}
          required
        />
      </div>

      <Select
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value as TaskStatus)}
        required
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>

      <div className="border-t pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">KPI / Goal Tracking</h3>
        <div className="space-y-4">
          <Input
            label="KPI Goal Description"
            value={kpiGoal}
            onChange={(e) => setKpiGoal(e.target.value)}
            placeholder="e.g., Complete 5 modules, Reach $10k in sales"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Target Value"
              type="number"
              value={kpiTargetValue}
              onChange={(e) => setKpiTargetValue(e.target.value)}
              placeholder="e.g., 5, 10000"
            />

            <Input
              label="Unit"
              value={kpiUnit}
              onChange={(e) => setKpiUnit(e.target.value)}
              placeholder="e.g., modules, $, hours"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        {onDelete && isEdit && (
          <Button
            type="button"
            onClick={onDelete}
            variant="danger"
            disabled={isSubmitting}
          >
            Delete
          </Button>
        )}
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEdit ? 'Update Task' : 'Create Task'}
        </Button>
      </div>
    </form>
  );
};

export default TaskForm;
