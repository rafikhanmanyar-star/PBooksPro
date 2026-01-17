import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { Task, TaskStatus, TaskType, TaskCategory } from '../../types';
import { ICONS } from '../../constants';
import { TasksApiRepository } from '../../services/api/repositories/tasksApi';
import { apiClient } from '../../services/api/client';
import { getWebSocketClient } from '../../services/websocketClient';
import TaskCard from './TaskCard';
import TaskForm from './TaskForm';
import TaskDetailModal from './TaskDetailModal';
import TaskCheckInModal from './TaskCheckInModal';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';
import DatePicker from '../ui/DatePicker';
import ComboBox from '../ui/ComboBox';
import { useAppContext as usePageContext } from '../../context/AppContext';
import { formatDate } from '../../utils/dateUtils';

interface User {
  id: string;
  name: string;
  username: string;
}

const TasksPage: React.FC = () => {
  const { state } = useAppContext();
  const { dispatch } = usePageContext();
  const { user } = useAuth();
  const { showToast, showConfirm } = useNotification();
  // Check if user is Admin (case-insensitive, trimmed)
  const isAdmin = user?.role?.trim()?.toLowerCase() === 'admin';
  
  // Debug logging
  useEffect(() => {
    if (user) {
      console.log('TasksPage - User role:', user.role, 'isAdmin:', isAdmin);
    }
  }, [user, isAdmin]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<User[]>([]);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'All'>('All');
  const [typeFilter, setTypeFilter] = useState<TaskType | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Inline form state
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<TaskType>('Personal');
  const [formCategory, setFormCategory] = useState<TaskCategory | string>('Development');
  const [formStatus, setFormStatus] = useState<TaskStatus>('Not Started');
  const [formStartDate, setFormStartDate] = useState('');
  const [formHardDeadline, setFormHardDeadline] = useState('');
  const [formKpiGoal, setFormKpiGoal] = useState('');
  const [formKpiTargetValue, setFormKpiTargetValue] = useState('');
  const [formKpiUnit, setFormKpiUnit] = useState('');
  const [formAssignedToId, setFormAssignedToId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskWithUpdates, setTaskWithUpdates] = useState<(Task & { updates?: any[] }) | null>(null);

  const tasksApi = new TasksApiRepository();

  // Load tasks
  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await tasksApi.findAll();
      setTasks(data);
    } catch (error: any) {
      console.error('Error loading tasks:', error);
      showToast(error.message || 'Failed to load tasks', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load employees (for admin assignment)
  const loadEmployees = async () => {
    if (!isAdmin) {
      console.log('TasksPage - Not loading employees, user is not admin');
      return;
    }
    try {
      console.log('TasksPage - Loading employees for task assignment...');
      const data = await apiClient.get<User[]>('/users');
      const filtered = data.filter(u => u.id !== user?.id); // Exclude current user
      console.log('TasksPage - Loaded employees:', filtered.length);
      setEmployees(filtered);
    } catch (error) {
      console.error('Error loading employees:', error);
      showToast('Failed to load employees list', 'error');
    }
  };

  useEffect(() => {
    loadTasks();
    if (isAdmin) {
      loadEmployees();
    }
  }, [isAdmin]);

  // Employees can only create personal tasks
  useEffect(() => {
    if (!isAdmin) {
      setFormType('Personal');
    } else {
      // Admin can choose, but default to Personal
      // Don't force it, let them choose
    }
  }, [isAdmin]);

  // Helper function to convert Date to YYYY-MM-DD format (for DatePicker)
  const formatDateForPicker = (date: Date | string): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Initialize form start date when form is expanded and load employees if admin
  useEffect(() => {
    if (isFormExpanded) {
      if (!formStartDate) {
        setFormStartDate(formatDateForPicker(new Date()));
      }
      // Reload employees when form is expanded (in case new users were added)
      if (isAdmin && employees.length === 0) {
        loadEmployees();
      }
    }
  }, [isFormExpanded, formStartDate, isAdmin]);

  // Listen for WebSocket task notifications
  useEffect(() => {
    const wsClient = getWebSocketClient();
    const token = apiClient.getToken();
    const tenantId = apiClient.getTenantId();
    
    if (token && tenantId) {
      wsClient.connect(token, tenantId);
    }

    const handleTaskAssigned = (data: any) => {
      showToast(data.message || `New task assigned: ${data.title}`, 'info');
      loadTasks(); // Refresh task list
    };

    const handleDeadlineWarning = (data: any) => {
      showToast(data.message || `Task "${data.title}" deadline approaching (24 hours remaining)`, 'error');
      loadTasks(); // Refresh task list
    };

    wsClient.on('task:assigned', handleTaskAssigned);
    wsClient.on('task:deadline:warning', handleDeadlineWarning);

    return () => {
      wsClient.off('task:assigned', handleTaskAssigned);
      wsClient.off('task:deadline:warning', handleDeadlineWarning);
    };
  }, []);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== 'All' && task.status !== statusFilter) return false;
      if (typeFilter !== 'All' && task.type !== typeFilter) return false;
      if (categoryFilter !== 'All' && task.category !== categoryFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !task.title.toLowerCase().includes(query) &&
          !task.description?.toLowerCase().includes(query) &&
          !task.category.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, statusFilter, typeFilter, categoryFilter, searchQuery]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(tasks.map(t => t.category));
    return Array.from(cats);
  }, [tasks]);

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormType('Personal');
    setFormCategory('Development');
    setFormStatus('Not Started');
    setFormStartDate('');
    setFormHardDeadline('');
    setFormKpiGoal('');
    setFormKpiTargetValue('');
    setFormKpiUnit('');
    setFormAssignedToId('');
    setFormError(null);
    setIsFormExpanded(false);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formTitle.trim()) {
      setFormError('Title is required');
      return;
    }
    if (!formStartDate) {
      setFormError('Start date is required');
      return;
    }
    if (!formHardDeadline) {
      setFormError('Hard deadline is required');
      return;
    }
    if (new Date(formHardDeadline) < new Date(formStartDate)) {
      setFormError('Deadline must be after start date');
      return;
    }
    if (formType === 'Assigned') {
      if (!isAdmin) {
        setFormError('Only organization admins can create assigned tasks');
        return;
      }
      if (!formAssignedToId) {
        setFormError('Please select an employee to assign this task to');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const taskData: Partial<Task> = {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        type: formType,
        category: formCategory,
        status: formStatus,
        start_date: formStartDate,
        hard_deadline: formHardDeadline,
        kpi_goal: formKpiGoal.trim() || undefined,
        kpi_target_value: formKpiTargetValue ? parseFloat(formKpiTargetValue) : undefined,
        kpi_unit: formKpiUnit.trim() || undefined,
        assigned_to_id: formType === 'Assigned' ? formAssignedToId : undefined,
      };

      await tasksApi.create(taskData);
      showToast('Task created successfully', 'success');
      await loadTasks();
      resetForm();
    } catch (error: any) {
      setFormError(error.message || 'Failed to create task');
      showToast(error.message || 'Failed to create task', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditModalOpen(true);
  };

  const handleViewTask = async (task: Task) => {
    try {
      const taskData = await tasksApi.findById(task.id);
      if (taskData) {
        setTaskWithUpdates(taskData);
        setSelectedTask(task);
        setIsDetailModalOpen(true);
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to load task details', 'error');
    }
  };

  const handleCheckIn = (task: Task) => {
    setSelectedTask(task);
    setIsCheckInModalOpen(true);
  };

  const handleSubmitTask = async (taskData: Partial<Task>) => {
    try {
      if (selectedTask) {
        await tasksApi.update(selectedTask.id, taskData);
        showToast('Task updated successfully', 'success');
        await loadTasks();
        setIsEditModalOpen(false);
        setSelectedTask(null);
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to save task', 'error');
      throw error;
    }
  };

  const handleCheckInSubmit = async (data: {
    status?: TaskStatus;
    kpi_current_value?: number;
    comment?: string;
  }) => {
    if (!selectedTask) return;
    try {
      await tasksApi.checkIn(selectedTask.id, data);
      showToast('Progress updated successfully', 'success');
      await loadTasks();
      setIsCheckInModalOpen(false);
      setSelectedTask(null);
      // Refresh detail modal if open
      if (isDetailModalOpen && selectedTask) {
        const updated = await tasksApi.findById(selectedTask.id);
        if (updated) setTaskWithUpdates(updated);
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to update progress', 'error');
      throw error;
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    const confirmed = await showConfirm(
      `Are you sure you want to delete "${selectedTask.title}"?`,
      'Delete Task'
    );
    if (!confirmed) return;

    try {
      await tasksApi.delete(selectedTask.id);
      showToast('Task deleted successfully', 'success');
      await loadTasks();
      setIsDetailModalOpen(false);
      setSelectedTask(null);
    } catch (error: any) {
      showToast(error.message || 'Failed to delete task', 'error');
    }
  };

  const canEditTask = (task: Task) => {
    if (isAdmin) return true;
    // Employees cannot edit assigned tasks (only check-in)
    if (task.type === 'Assigned' && task.assigned_to_id === user?.id) return false;
    if (task.type === 'Personal' && task.created_by_id === user?.id) return true;
    return false;
  };

  const canDeleteTask = (task: Task) => {
    if (isAdmin) return true;
    // Employees cannot delete assigned tasks
    if (task.type === 'Assigned') return false;
    if (task.type === 'Personal' && task.created_by_id === user?.id) return true;
    return false;
  };

  const canCheckIn = (task: Task) => {
    // Anyone can check-in to their own tasks (personal or assigned)
    if (task.type === 'Personal' && task.created_by_id === user?.id) return true;
    if (task.type === 'Assigned' && task.assigned_to_id === user?.id) return true;
    if (isAdmin) return true; // Admin can check-in to any task
    return false;
  };

  const TASK_CATEGORIES: TaskCategory[] = ['Development', 'Admin', 'Sales', 'Personal Growth'];
  const employeeItems = employees.map(emp => ({ id: emp.id, name: emp.name }));

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Tasks</h1>
          {isAdmin && (
            <p className="text-sm text-gray-600 mt-1">
              Organization Admin - You can assign tasks to employees
            </p>
          )}
        </div>
        <Button onClick={() => setIsFormExpanded(!isFormExpanded)}>
          {isFormExpanded ? ICONS.x : ICONS.plus}
          <span>{isFormExpanded ? 'Cancel' : 'Create Task'}</span>
        </Button>
      </div>

      {/* Compact Create Task Form */}
      {isFormExpanded && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm">
          <form onSubmit={handleCreateTask} className="space-y-3">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {formError}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Title - Takes 4 columns */}
              <div className="md:col-span-4">
                <Input
                  placeholder="Task title..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="text-sm"
                />
              </div>

              {/* Type - Takes 2 columns */}
              <div className="md:col-span-2">
                <Select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as TaskType)}
                  disabled={!isAdmin}
                  className="text-sm"
                >
                  <option value="Personal">Personal</option>
                  {isAdmin && <option value="Assigned">Assigned</option>}
                </Select>
              </div>

              {/* Category - Takes 2 columns */}
              <div className="md:col-span-2">
                <Select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="text-sm"
                >
                  {TASK_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Start Date - Takes 2 columns */}
              <div className="md:col-span-2">
                <DatePicker
                  value={formStartDate}
                  onChange={(date) => setFormStartDate(formatDateForPicker(date))}
                  placeholder="Start date"
                  className="text-sm"
                />
              </div>

              {/* Deadline - Takes 2 columns */}
              <div className="md:col-span-2">
                <DatePicker
                  value={formHardDeadline}
                  onChange={(date) => setFormHardDeadline(formatDateForPicker(date))}
                  placeholder="Deadline"
                  className="text-sm"
                />
              </div>
            </div>

            {/* Second Row - Optional Fields */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Assign To (only for Assigned tasks) */}
              {formType === 'Assigned' && isAdmin && (
                <div className="md:col-span-3">
                  {employees.length === 0 ? (
                    <div className="text-sm text-gray-500 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                      Loading employees...
                    </div>
                  ) : (
                    <ComboBox
                      items={employeeItems}
                      selectedId={formAssignedToId}
                      onSelect={(item) => setFormAssignedToId(item?.id || '')}
                      placeholder="Assign to..."
                      allowAddNew={false}
                      className="text-sm"
                    />
                  )}
                </div>
              )}

              {/* KPI Goal */}
              <div className="md:col-span-3">
                <Input
                  placeholder="KPI Goal (optional)"
                  value={formKpiGoal}
                  onChange={(e) => setFormKpiGoal(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* KPI Target Value */}
              <div className="md:col-span-2">
                <Input
                  type="number"
                  placeholder="Target"
                  value={formKpiTargetValue}
                  onChange={(e) => setFormKpiTargetValue(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* KPI Unit */}
              <div className="md:col-span-2">
                <Input
                  placeholder="Unit"
                  value={formKpiUnit}
                  onChange={(e) => setFormKpiUnit(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Status */}
              <div className="md:col-span-2">
                <Select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as TaskStatus)}
                  className="text-sm"
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Review">Review</option>
                  <option value="Completed">Completed</option>
                </Select>
              </div>
            </div>

            {/* Description (optional, collapsible) */}
            <div>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-sm"
                rows={2}
                placeholder="Description (optional)"
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={resetForm}
                variant="secondary"
                disabled={isSubmitting}
                className="text-sm"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="text-sm">
                {isSubmitting ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Input
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          icon={ICONS.search}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'All')}
        >
          <option value="All">All Statuses</option>
          <option value="Not Started">Not Started</option>
          <option value="In Progress">In Progress</option>
          <option value="Review">Review</option>
          <option value="Completed">Completed</option>
        </Select>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TaskType | 'All')}
        >
          <option value="All">All Types</option>
          <option value="Personal">Personal</option>
          <option value="Assigned">Assigned</option>
        </Select>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="All">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="text-center py-8">Loading tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {tasks.length === 0
            ? 'No tasks found. Create your first task to get started!'
            : 'No tasks match your filters.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => handleViewTask(task)}
              onCheckIn={canCheckIn(task) ? () => handleCheckIn(task) : undefined}
              canEdit={canEditTask(task)}
            />
          ))}
        </div>
      )}

      {/* Edit Task Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedTask(null);
        }}
        title="Edit Task"
        size="lg"
      >
        {selectedTask && (
          <TaskForm
            task={selectedTask}
            onSubmit={handleSubmitTask}
            onCancel={() => {
              setIsEditModalOpen(false);
              setSelectedTask(null);
            }}
            onDelete={handleDeleteTask}
            employees={employees}
          />
        )}
      </Modal>

      {/* Task Detail Modal */}
      {taskWithUpdates && (
        <TaskDetailModal
          task={taskWithUpdates}
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedTask(null);
            setTaskWithUpdates(null);
          }}
          onEdit={() => {
            setIsDetailModalOpen(false);
            handleEditTask(selectedTask!);
          }}
          onCheckIn={() => {
            setIsDetailModalOpen(false);
            handleCheckIn(selectedTask!);
          }}
          onDelete={handleDeleteTask}
          canEdit={selectedTask ? canEditTask(selectedTask) : false}
          canDelete={selectedTask ? canDeleteTask(selectedTask) : false}
        />
      )}

      {/* Check-in Modal */}
      {selectedTask && (
        <TaskCheckInModal
          task={selectedTask}
          isOpen={isCheckInModalOpen}
          onClose={() => {
            setIsCheckInModalOpen(false);
            setSelectedTask(null);
          }}
          onSubmit={handleCheckInSubmit}
        />
      )}
    </div>
  );
};

export default TasksPage;
