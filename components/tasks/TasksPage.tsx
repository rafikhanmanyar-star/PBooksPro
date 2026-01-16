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
import { useAppContext as usePageContext } from '../../context/AppContext';

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
  const isAdmin = user?.role === 'Admin';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<User[]>([]);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'All'>('All');
  const [typeFilter, setTypeFilter] = useState<TaskType | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
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
    if (!isAdmin) return;
    try {
      const data = await apiClient.get<User[]>('/users');
      setEmployees(data.filter(u => u.id !== user?.id)); // Exclude current user
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  useEffect(() => {
    loadTasks();
    loadEmployees();
  }, []);

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

  const handleCreateTask = () => {
    setSelectedTask(null);
    setIsCreateModalOpen(true);
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
      } else {
        await tasksApi.create(taskData);
        showToast('Task created successfully', 'success');
      }
      await loadTasks();
      setIsCreateModalOpen(false);
      setIsEditModalOpen(false);
      setSelectedTask(null);
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

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">My Tasks</h1>
        <Button onClick={handleCreateTask}>
          {ICONS.plus}
          <span>Create Task</span>
        </Button>
      </div>

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

      {/* Create Task Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setSelectedTask(null);
        }}
        title="Create Task"
        size="lg"
      >
        <TaskForm
          onSubmit={handleSubmitTask}
          onCancel={() => {
            setIsCreateModalOpen(false);
            setSelectedTask(null);
          }}
          employees={employees}
        />
      </Modal>

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
