/**
 * Task Notification Service
 * 
 * Handles notifications for task assignments and deadline warnings.
 */

import { getDatabaseService } from './databaseService';
import { getWebSocketService } from './websocketService';
import { WS_EVENTS } from './websocketHelper';

export class TaskNotificationService {
  private db: any;

  constructor() {
    this.db = getDatabaseService();
  }

  /**
   * Send notification when task is assigned
   */
  async notifyTaskAssigned(
    taskId: string,
    tenantId: string,
    assignedToId: string,
    assignedById: string
  ): Promise<void> {
    try {
      // Get task details
      const tasks = await this.db.query(
        'SELECT title FROM tasks WHERE id = $1 AND tenant_id = $2',
        [taskId, tenantId]
      );
      if (tasks.length === 0) return;

      const task = tasks[0];

      // Get assigner name
      const assigners = await this.db.query(
        'SELECT name FROM users WHERE id = $1 AND tenant_id = $2',
        [assignedById, tenantId]
      );
      const assignerName = assigners.length > 0 ? assigners[0].name : 'Admin';

      // Send WebSocket notification
      const wsService = getWebSocketService();
      wsService.emitToUser(tenantId, assignedToId, WS_EVENTS.TASK_ASSIGNED, {
        taskId,
        title: task.title,
        assignedBy: assignerName,
        assignedAt: new Date().toISOString(),
        message: `You have been assigned a new task: "${task.title}"`,
      });
    } catch (error) {
      console.error('Error sending task assignment notification:', error);
      // Don't throw - notification failure shouldn't break task creation
    }
  }

  /**
   * Check for tasks with deadlines approaching (24 hours)
   */
  async checkDeadlineWarnings(tenantId: string): Promise<void> {
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      // Find tasks with deadlines in next 24 hours that aren't completed
      const tasks = await this.db.query(
        `SELECT t.*, u.id as user_id
         FROM tasks t
         LEFT JOIN users u ON (t.assigned_to_id = u.id OR t.created_by_id = u.id)
         WHERE t.tenant_id = $1
           AND t.status != 'Completed'
           AND t.hard_deadline >= $2
           AND t.hard_deadline <= $3
           AND (t.assigned_to_id IS NOT NULL OR t.created_by_id IS NOT NULL)`,
        [tenantId, now.toISOString().split('T')[0], tomorrow.toISOString().split('T')[0]]
      );

      // Send notifications
      const wsService = getWebSocketService();
      for (const task of tasks) {
        const userId = task.assigned_to_id || task.created_by_id;
        if (!userId) continue;

        // Check if we've already notified for this task today
        const today = now.toISOString().split('T')[0];
        const existingNotifications = await this.db.query(
          `SELECT id FROM task_updates 
           WHERE task_id = $1 
             AND update_type = 'Comment'
             AND comment LIKE '%Deadline warning%'
             AND created_at::date = $2`,
          [task.id, today]
        );

        if (existingNotifications.length === 0) {
          // Send notification
          wsService.emitToUser(tenantId, userId, WS_EVENTS.TASK_DEADLINE_WARNING, {
            taskId: task.id,
            title: task.title,
            deadline: task.hard_deadline,
            message: `Task "${task.title}" deadline is approaching (24 hours remaining)`,
          });

          // Create a notification record in task_updates
          const updateId = `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await this.db.query(
            `INSERT INTO task_updates (
              id, tenant_id, task_id, user_id, update_type, comment, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              updateId,
              tenantId,
              task.id,
              userId,
              'Comment',
              'Deadline warning: 24 hours remaining',
            ]
          );
        }
      }
    } catch (error) {
      console.error('Error checking deadline warnings:', error);
    }
  }

  /**
   * Start background job to check deadlines periodically
   */
  startDeadlineChecker(tenantId: string): NodeJS.Timeout {
    // Check every hour
    const interval = setInterval(() => {
      this.checkDeadlineWarnings(tenantId).catch((error) => {
        console.error('Error in deadline checker:', error);
      });
    }, 60 * 60 * 1000); // 1 hour

    // Run immediately
    this.checkDeadlineWarnings(tenantId).catch((error) => {
      console.error('Error in initial deadline check:', error);
    });

    return interval;
  }
}

export function getTaskNotificationService(): TaskNotificationService {
  return new TaskNotificationService();
}
