import React from 'react';
import { Task, TaskUpdate } from '../../types';
import Modal from '../ui/Modal';
import { formatDate } from '../../utils/dateUtils';
import { ICONS } from '../../constants';
import Button from '../ui/Button';

interface TaskDetailModalProps {
  task: Task & { updates?: TaskUpdate[] };
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onCheckIn?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isOpen,
  onClose,
  onEdit,
  onCheckIn,
  onDelete,
  canEdit = false,
  canDelete = false,
}) => {
  const isOverdue = new Date(task.hard_deadline) < new Date() && task.status !== 'Completed';

  const statusColors: Record<string, string> = {
    'Not Started': 'bg-gray-100 text-gray-800',
    'In Progress': 'bg-blue-100 text-blue-800',
    'Review': 'bg-yellow-100 text-yellow-800',
    'Completed': 'bg-green-100 text-green-800',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={task.title} size="lg">
      <div className="space-y-4">
        {/* Task Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Type</label>
            <p className="mt-1">
              <span className={`px-2 py-1 rounded text-sm ${task.type === 'Personal' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                {task.type}
              </span>
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Status</label>
            <p className="mt-1">
              <span className={`px-2 py-1 rounded text-sm ${statusColors[task.status]}`}>
                {task.status}
              </span>
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Category</label>
            <p className="mt-1">{task.category}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Start Date</label>
            <p className="mt-1">{formatDate(task.start_date)}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Hard Deadline</label>
            <p className={`mt-1 ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
              {formatDate(task.hard_deadline)}
              {isOverdue && ' ⚠️ Overdue'}
            </p>
          </div>
          {task.assigned_to_id && (
            <div>
              <label className="text-sm font-medium text-gray-500">Assigned To</label>
              <p className="mt-1">{(task as any).assigned_to_name || 'Unknown'}</p>
            </div>
          )}
        </div>

        {task.description && (
          <div>
            <label className="text-sm font-medium text-gray-500">Description</label>
            <p className="mt-1 text-gray-700 whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* KPI Progress */}
        {task.kpi_goal && (
          <div className="border-t pt-4">
            <label className="text-sm font-medium text-gray-500">KPI / Goal</label>
            <div className="mt-2 space-y-2">
              <p className="text-gray-700">{task.kpi_goal}</p>
              {task.kpi_target_value && (
                <>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Progress</span>
                    <span>
                      {task.kpi_current_value || 0} / {task.kpi_target_value} {task.kpi_unit || ''}
                      ({Math.round(task.kpi_progress_percentage || 0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-green-600 h-3 rounded-full transition-all"
                      style={{ width: `${Math.min(100, task.kpi_progress_percentage || 0)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Update History */}
        {task.updates && task.updates.length > 0 && (
          <div className="border-t pt-4">
            <label className="text-sm font-medium text-gray-500 mb-3 block">Update History</label>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {task.updates.map((update) => (
                <div key={update.id} className="border-l-2 border-gray-200 pl-3 py-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">
                        {(update as any).user_name || 'Unknown User'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {update.update_type} • {formatDate(update.created_at || '')}
                      </p>
                      {update.status_before && update.status_after && (
                        <p className="text-xs text-gray-600 mt-1">
                          Status: {update.status_before} → {update.status_after}
                        </p>
                      )}
                      {update.kpi_value_before !== undefined && update.kpi_value_after !== undefined && (
                        <p className="text-xs text-gray-600 mt-1">
                          KPI: {update.kpi_value_before} → {update.kpi_value_after}
                        </p>
                      )}
                      {update.comment && (
                        <p className="text-sm text-gray-700 mt-2">{update.comment}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          {onCheckIn && (
            <Button onClick={onCheckIn} variant="primary">
              Check-in
            </Button>
          )}
          {canEdit && onEdit && (
            <Button onClick={onEdit} variant="secondary">
              Edit
            </Button>
          )}
          {canDelete && onDelete && (
            <Button onClick={onDelete} variant="danger">
              Delete
            </Button>
          )}
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default TaskDetailModal;
