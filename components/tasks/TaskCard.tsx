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

  // Generate initials for assigned user (or use current user)
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const assignedUserName = (task as any).assigned_to_name || (task as any).assigned_by_name || 'User';
  const taskId = task.id.split('_').pop()?.substring(0, 6) || '000000';
  const categoryPath = task.category || 'General';

  return (
    <div
      className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      {/* Category/Path - Top line */}
      <div className="text-xs text-gray-500 mb-1.5">
        {categoryPath}
        {task.type === 'Assigned' && (
          <>
            <span className="mx-1">•</span>
            <span>Assigned</span>
          </>
        )}
      </div>

      {/* Task ID */}
      <div className="text-xs text-gray-400 mb-2">
        # {taskId}
      </div>

      {/* Task Title */}
      <h3 className="text-base font-bold text-gray-800 mb-3 line-clamp-2">
        {task.title}
      </h3>

      {/* Date and Description */}
      <div className="space-y-2 mb-3">
        {task.hard_deadline && (
          <div className="flex items-center gap-1.5 text-xs">
            <div className="text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
              {formatDate(task.hard_deadline)}
            </span>
          </div>
        )}

        {task.description && (
          <div className="flex items-start gap-1.5 text-xs text-gray-600">
            <div className="mt-0.5 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </div>
            <span className="line-clamp-2">{task.description}</span>
          </div>
        )}
      </div>

      {/* KPI Progress (if available) */}
      {task.kpi_goal && task.kpi_target_value && (
        <div className="mb-3 pt-2 border-t border-gray-100">
          <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
            <span className="truncate">{task.kpi_goal}</span>
            <span className="font-medium">
              {task.kpi_current_value || 0} / {task.kpi_target_value} {task.kpi_unit || ''}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min(100, task.kpi_progress_percentage || 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer: User Avatar and Action Icons */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        {/* Assigned User Avatar */}
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
          {getInitials(assignedUserName)}
        </div>

        {/* Action Icons */}
        <div className="flex items-center gap-2">
          {isOverdue && (
            <div className="text-red-600 cursor-pointer hover:text-red-700" title="Overdue">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </div>
          )}
          {task.status === 'Completed' && (
            <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center text-white cursor-pointer hover:bg-green-700" title="Completed">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          )}
          {!task.status || task.status !== 'Completed' && onCheckIn && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCheckIn();
              }}
              className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-600 hover:bg-green-50 flex items-center justify-center transition-colors"
              title="Check-in"
            >
              {task.status === 'In Progress' && (
                <div className="w-2 h-2 rounded-full bg-green-600"></div>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
