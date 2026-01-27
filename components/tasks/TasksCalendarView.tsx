import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { Task, TaskType } from '../../types';
import { TasksApiRepository } from '../../services/api/repositories/tasksApi';
import { formatDate } from '../../utils/dateUtils';
import { ICONS } from '../../constants';
import TaskDetailModal from './TaskDetailModal';
import Button from '../ui/Button';

const TasksCalendarView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useNotification();
  const tasksApi = new TasksApiRepository();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskWithUpdates, setTaskWithUpdates] = useState<(Task & { updates?: any[] }) | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Calculate date range for API call
  const dateRange = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    if (viewMode === 'month') {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return {
        start: formatDate(start),
        end: formatDate(end),
      };
    } else {
      // Week view: get start of week (Sunday)
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return {
        start: formatDate(start),
        end: formatDate(end),
      };
    }
  }, [currentDate, viewMode]);

  // Load tasks for date range
  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await tasksApi.getCalendarEvents(dateRange.start, dateRange.end);
      setTasks(data);
    } catch (error: any) {
      console.error('Error loading calendar tasks:', error);
      showToast(error.message || 'Failed to load calendar tasks', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [dateRange]);

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

  // Navigation
  const goToPrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const goToNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Get tasks for a specific date
  const getTasksForDate = (date: Date): Task[] => {
    const dateStr = formatDate(date);
    return tasks.filter((task) => {
      const start = new Date(task.start_date);
      const deadline = new Date(task.hard_deadline);
      const checkDate = new Date(dateStr);
      return checkDate >= start && checkDate <= deadline;
    });
  };

  // Month view
  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return (
      <div className="grid grid-cols-7 gap-1">
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="p-2 text-center text-sm font-semibold text-gray-600">
            {day}
          </div>
        ))}
        {/* Calendar days */}
        {days.map((date, idx) => {
          if (!date) {
            return <div key={idx} className="min-h-[100px] border border-gray-200 rounded" />;
          }
          const dayTasks = getTasksForDate(date);
          const isToday = formatDate(date) === formatDate(new Date());
          const isPast = date < new Date() && !isToday;

          return (
            <div
              key={idx}
              className={`min-h-[100px] border rounded p-1 ${
                isToday ? 'bg-blue-50 border-blue-300' : isPast ? 'bg-gray-50' : 'bg-white'
              }`}
            >
              <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-700' : ''}`}>
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleViewTask(task)}
                    className={`text-xs p-1 rounded cursor-pointer truncate ${
                      task.type === 'Personal'
                        ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                        : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                    }`}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-xs text-gray-500">+{dayTasks.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Week view
  const renderWeekView = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
    
    const weekDays: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      weekDays.push(day);
    }

    return (
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((date, idx) => {
          const dayTasks = getTasksForDate(date);
          const isToday = formatDate(date) === formatDate(new Date());
          const dateStr = formatDate(date);

          return (
            <div
              key={idx}
              className={`border rounded p-2 min-h-[400px] ${
                isToday ? 'bg-blue-50 border-blue-300' : 'bg-white'
              }`}
            >
              <div className={`font-semibold mb-2 ${isToday ? 'text-blue-700' : ''}`}>
                <div className="text-sm text-gray-600">
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="text-lg">{date.getDate()}</div>
              </div>
              <div className="space-y-2">
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleViewTask(task)}
                    className={`p-2 rounded cursor-pointer text-sm ${
                      task.type === 'Personal'
                        ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-l-4 border-blue-500'
                        : 'bg-orange-100 text-orange-800 hover:bg-orange-200 border-l-4 border-orange-500'
                    }`}
                  >
                    <div className="font-medium truncate">{task.title}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      {task.status} • {task.category}
                    </div>
                  </div>
                ))}
                {dayTasks.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-4">No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const monthYearLabel =
    viewMode === 'month'
      ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${formatDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - currentDate.getDay()))} - ${formatDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - currentDate.getDay() + 6))}`;

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Task Calendar</h1>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'month' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('month')}
            size="sm"
          >
            Month
          </Button>
          <Button
            variant={viewMode === 'week' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('week')}
            size="sm"
          >
            Week
          </Button>
        </div>
      </div>

      {/* Calendar Controls */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Button onClick={goToPrevious} variant="ghost" size="icon">
            {ICONS.chevronLeft}
          </Button>
          <Button onClick={goToToday} variant="secondary" size="sm">
            Today
          </Button>
          <Button onClick={goToNext} variant="ghost" size="icon">
            {ICONS.chevronRight}
          </Button>
        </div>
        <h2 className="text-xl font-semibold">{monthYearLabel}</h2>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-100 border border-blue-500 rounded"></div>
            <span>Personal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-100 border border-orange-500 rounded"></div>
            <span>Assigned</span>
          </div>
        </div>
      </div>

      {/* Calendar */}
      {loading ? (
        <div className="text-center py-8">Loading calendar...</div>
      ) : (
        <div className="border rounded-lg p-4 bg-white">
          {viewMode === 'month' ? renderMonthView() : renderWeekView()}
        </div>
      )}

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
          canEdit={false}
          canDelete={false}
        />
      )}
    </div>
  );
};

export default TasksCalendarView;
