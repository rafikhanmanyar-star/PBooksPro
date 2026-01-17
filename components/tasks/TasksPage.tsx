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

  // Group tasks by status for Kanban columns
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      'Not Started': [],
      'In Progress': [],
      'Review': [],
      'Completed': [],
    };
    filteredTasks.forEach(task => {
      grouped[task.status].push(task);
    });
    return grouped;
  }, [filteredTasks]);

  // Status configuration for columns
  const statusConfig: Array<{ status: TaskStatus; label: string; color: string; bgColor: string }> = [
    { status: 'Not Started', label: 'NOT STARTED', color: 'text-red-600', bgColor: 'bg-red-600' },
    { status: 'In Progress', label: 'IN PROGRESS', color: 'text-blue-600', bgColor: 'bg-blue-600' },
    { status: 'Review', label: 'REVIEW', color: 'text-orange-600', bgColor: 'bg-orange-600' },
    { status: 'Completed', label: 'COMPLETED', color: 'text-green-600', bgColor: 'bg-green-600' },
  ];

  // Get user initials for avatar
  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  // Handle creating task in specific status column
  const handleCreateTaskInColumn = (status: TaskStatus) => {
    setFormStatus(status);
    setIsFormExpanded(true);
  };

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
    <div className="h-full flex flex-col" style={{ backgroundColor: '#F4F6F9' }}>
      {/* Breadcrumb */}
      <div className="px-6 pt-4 pb-2">
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <span>Tasks</span>
          <span>{ICONS.chevronRight}</span>
          <span className="text-gray-700">My Tasks</span>
        </div>
      </div>

      {/* User Header Section */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4">
          {/* Profile Picture */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            {user?.name ? getUserInitials(user.name) : 'U'}
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800">{user?.name || 'User'}'s Tasks</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-600">{user?.username || ''}</span>
              {user?.role && (
                <>
                  <span className="text-gray-400">•</span>
                  <div className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                      <path d="M2 12h20"></path>
                    </svg>
                    <span className="text-sm text-gray-600">{user.role}</span>
                  </div>
                </>
              )}
              <span className="px-2.5 py-0.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                Total tasks {tasks.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons Row */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Filter Button */}
          <button className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <span>Filter</span>
            {ICONS.chevronDown}
          </button>

          {/* Sort By Button */}
          <button className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <span>Sort By</span>
            {ICONS.chevronDown}
          </button>

          {/* Group By Button */}
          <button className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 relative">
            <span>Group By: Status</span>
            {ICONS.chevronDown}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded"></div>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* View Selector */}
          <button className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-100 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
            <span>Kanban</span>
            {ICONS.chevronDown}
          </button>

          {/* Create Task Button */}
          <button 
            onClick={() => setIsFormExpanded(!isFormExpanded)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 shadow-sm"
          >
            {ICONS.plus}
            <span>Create Task</span>
          </button>
        </div>
      </div>

      {/* Compact Create Task Form */}
      {isFormExpanded && (
        <div className="px-6 py-4 bg-white border-b border-gray-200">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm max-w-4xl">
            <form onSubmit={handleCreateTask} className="space-y-3">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {formError}
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-4">
                  <Input
                    placeholder="Task title..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                    className="text-sm"
                  />
                </div>
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
                <div className="md:col-span-2">
                  <DatePicker
                    value={formStartDate}
                    onChange={(date) => setFormStartDate(formatDateForPicker(date))}
                    placeholder="Start date"
                    className="text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <DatePicker
                    value={formHardDeadline}
                    onChange={(date) => setFormHardDeadline(formatDateForPicker(date))}
                    placeholder="Deadline"
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
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
                <div className="md:col-span-3">
                  <Input
                    placeholder="KPI Goal (optional)"
                    value={formKpiGoal}
                    onChange={(e) => setFormKpiGoal(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    type="number"
                    placeholder="Target"
                    value={formKpiTargetValue}
                    onChange={(e) => setFormKpiTargetValue(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    placeholder="Unit"
                    value={formKpiUnit}
                    onChange={(e) => setFormKpiUnit(e.target.value)}
                    className="text-sm"
                  />
                </div>
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

              <div>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-sm"
                  rows={2}
                  placeholder="Description (optional)"
                />
              </div>

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
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto px-6 py-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-sm text-gray-600">Loading tasks...</p>
          </div>
        ) : (
          <div className="flex gap-4 h-full min-w-max">
            {statusConfig.map(({ status, label, color, bgColor }) => {
              const columnTasks = tasksByStatus[status];
              return (
                <div key={status} className="flex-shrink-0 w-72 flex flex-col">
                  {/* Column Header */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-sm font-bold uppercase ${color}`}>
                          {label}
                        </h3>
                        {status === 'Completed' && (
                          <span className="text-green-600">{ICONS.checkCircle}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                          = {columnTasks.length}
                        </span>
                        <button
                          onClick={() => handleCreateTaskInColumn(status)}
                          className="text-blue-600 hover:text-blue-700 p-1"
                          title="Create new task"
                        >
                          {ICONS.plus}
                        </button>
                      </div>
                    </div>
                    <div className={`h-0.5 ${bgColor} rounded`}></div>
                  </div>

                  {/* Task Cards */}
                  <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px] pr-1">
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => handleViewTask(task)}
                        onCheckIn={canCheckIn(task) ? () => handleCheckIn(task) : undefined}
                        canEdit={canEditTask(task)}
                      />
                    ))}
                  </div>

                  {/* Inline Create Task Link */}
                  {status !== 'Completed' && (
                    <button
                      onClick={() => handleCreateTaskInColumn(status)}
                      className="mt-3 text-left text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1.5 py-2"
                    >
                      {ICONS.plus}
                      <span>Create new task</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
