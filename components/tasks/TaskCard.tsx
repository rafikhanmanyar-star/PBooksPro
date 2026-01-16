import React from 'react';
import { Task, TaskStatus, TaskType } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { ICONS } from '../../constants';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onCheckIn?: () => void;
  canEdit?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, onCheckIn, canEdit = false }) => {
  const isOverdue = new Date(task.hard_deadline) < new Date() && task.status !== 'Completed';
  const isAssigned = task.type === 'Assigned';
  
  const statusColors: Record<TaskStatus, string> = {
    'Not Started': 'bg-gray-100 text-gray-800',
    'In Progress': 'bg-blue-100 text-blue-800',
    'Review': 'bg-yellow-100 text-yellow-800',
    'Completed': 'bg-green-100 text-green-800',
  };

  const typeColors: Record<TaskType, string> = {
    'Personal': 'border-l-blue-500',
    'Assigned': 'border-l-orange-500',
  };

  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${typeColors[task.type]} ${isOverdue ? 'border-red-300 bg-red-50' : ''}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-lg flex-1">{task.title}</h3>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[task.status]}`}>
          {task.status}
        </span>
      </div>

      {task.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{task.description}</p>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          {ICONS.calendar}
          {formatDate(task.start_date)} - {formatDate(task.hard_deadline)}
        </span>
        <span className="px-2 py-0.5 bg-gray-100 rounded">{task.category}</span>
        {isAssigned && (
          <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded">
            Assigned
          </span>
        )}
      </div>

      {task.kpi_goal && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{task.kpi_goal}</span>
            {task.kpi_target_value && (
              <span>
                {task.kpi_current_value || 0} / {task.kpi_target_value} {task.kpi_unit || ''}
              </span>
            )}
          </div>
          {task.kpi_target_value && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, task.kpi_progress_percentage || 0)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {isOverdue && (
        <div className="text-xs text-red-600 font-medium mb-2">
          ⚠️ Overdue
        </div>
      )}

      <div className="flex gap-2 mt-3">
        {onCheckIn && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCheckIn();
            }}
            className="flex-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
          >
            Check-in
          </button>
        )}
        {canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
          >
            {ICONS.edit}
          </button>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
