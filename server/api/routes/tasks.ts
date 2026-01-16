import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { adminOnlyMiddleware } from '../../middleware/adminOnlyMiddleware.js';
import { getWebSocketService } from '../../services/websocketService.js';
import { WS_EVENTS } from '../../services/websocketHelper.js';
import { getTaskNotificationService } from '../../services/taskNotificationService.js';
import { getTaskPerformanceService } from '../../services/taskPerformanceService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Helper function to generate unique ID
function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper function to check if user can edit task
async function canEditTask(
  taskId: string,
  userId: string,
  userRole: string,
  tenantId: string,
  db: any
): Promise<{ allowed: boolean; reason?: string }> {
  const tasks = await db.query(
    'SELECT type, assigned_to_id, created_by_id, assigned_by_id FROM tasks WHERE id = $1 AND tenant_id = $2',
    [taskId, tenantId]
  );

  if (tasks.length === 0) {
    return { allowed: false, reason: 'Task not found' };
  }

  const task = tasks[0];

  // Admin can always edit
  if (userRole === 'Admin') {
    return { allowed: true };
  }

  // For assigned tasks, employees can only update progress (not edit details)
  if (task.type === 'Assigned' && task.assigned_to_id === userId) {
    return { allowed: false, reason: 'Cannot edit assigned task details. Use check-in to update progress.' };
  }

  // For personal tasks, creator can edit
  if (task.type === 'Personal' && task.created_by_id === userId) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'You do not have permission to edit this task' };
}

// Helper function to check if user can delete task
async function canDeleteTask(
  taskId: string,
  userId: string,
  userRole: string,
  tenantId: string,
  db: any
): Promise<{ allowed: boolean; reason?: string }> {
  const tasks = await db.query(
    'SELECT type, created_by_id FROM tasks WHERE id = $1 AND tenant_id = $2',
    [taskId, tenantId]
  );

  if (tasks.length === 0) {
    return { allowed: false, reason: 'Task not found' };
  }

  const task = tasks[0];

  // Admin can always delete
  if (userRole === 'Admin') {
    return { allowed: true };
  }

  // Creator can delete personal tasks
  if (task.type === 'Personal' && task.created_by_id === userId) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'You do not have permission to delete this task' };
}

// Get all tasks (filtered by user role)
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const userRole = (req as any).role || '';

    let query = '';
    let params: any[] = [tenantId];

    if (userRole === 'Admin') {
      // Admin sees all tasks in tenant
      query = `
        SELECT t.*, 
               u1.name as assigned_by_name,
               u2.name as assigned_to_name,
               u3.name as created_by_name
        FROM tasks t
        LEFT JOIN users u1 ON t.assigned_by_id = u1.id
        LEFT JOIN users u2 ON t.assigned_to_id = u2.id
        LEFT JOIN users u3 ON t.created_by_id = u3.id
        WHERE t.tenant_id = $1
        ORDER BY t.created_at DESC
      `;
    } else {
      // Employee sees personal tasks + assigned tasks
      query = `
        SELECT t.*, 
               u1.name as assigned_by_name,
               u2.name as assigned_to_name,
               u3.name as created_by_name
        FROM tasks t
        LEFT JOIN users u1 ON t.assigned_by_id = u1.id
        LEFT JOIN users u2 ON t.assigned_to_id = u2.id
        LEFT JOIN users u3 ON t.created_by_id = u3.id
        WHERE t.tenant_id = $1 
          AND (t.type = 'Personal' AND t.created_by_id = $2 OR t.type = 'Assigned' AND t.assigned_to_id = $2)
        ORDER BY t.created_at DESC
      `;
      params.push(userId);
    }

    const tasks = await db.query(query, params);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get task by ID with update history
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const userRole = (req as any).role || '';
    const taskId = req.params.id;

    // Get task
    const tasks = await db.query(
      `SELECT t.*, 
              u1.name as assigned_by_name,
              u2.name as assigned_to_name,
              u3.name as created_by_name
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_by_id = u1.id
       LEFT JOIN users u2 ON t.assigned_to_id = u2.id
       LEFT JOIN users u3 ON t.created_by_id = u3.id
       WHERE t.id = $1 AND t.tenant_id = $2`,
      [taskId, tenantId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = tasks[0];

    // Check access permission
    if (userRole !== 'Admin') {
      if (task.type === 'Personal' && task.created_by_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (task.type === 'Assigned' && task.assigned_to_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get update history
    const updates = await db.query(
      `SELECT tu.*, u.name as user_name
       FROM task_updates tu
       LEFT JOIN users u ON tu.user_id = u.id
       WHERE tu.task_id = $1 AND tu.tenant_id = $2
       ORDER BY tu.created_at DESC`,
      [taskId, tenantId]
    );

    res.json({ ...task, updates });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create new task
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const userRole = (req as any).role || '';
    const {
      title,
      description,
      type,
      category,
      status,
      start_date,
      hard_deadline,
      kpi_goal,
      kpi_target_value,
      kpi_unit,
      assigned_to_id,
    } = req.body;

    // Validation
    if (!title || !type || !category || !status || !start_date || !hard_deadline) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate deadline
    if (new Date(hard_deadline) < new Date(start_date)) {
      return res.status(400).json({ error: 'Deadline must be after start date' });
    }

    // Employees can only create personal tasks
    if (userRole !== 'Admin' && type === 'Assigned') {
      return res.status(403).json({ error: 'Only admins can create assigned tasks' });
    }

    // If assigned task, validate assigned_to_id
    if (type === 'Assigned') {
      if (!assigned_to_id) {
        return res.status(400).json({ error: 'assigned_to_id is required for assigned tasks' });
      }
      // Verify user exists in tenant
      const users = await db.query(
        'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
        [assigned_to_id, tenantId]
      );
      if (users.length === 0) {
        return res.status(400).json({ error: 'Invalid assigned_to_id' });
      }
    }

    const taskId = generateId();
    const now = new Date().toISOString();

    // Calculate initial KPI progress
    let kpi_progress_percentage = 0;
    if (kpi_target_value && kpi_target_value > 0) {
      kpi_progress_percentage = 0; // Start at 0%
    }

    await db.query(
      `INSERT INTO tasks (
        id, tenant_id, title, description, type, category, status,
        start_date, hard_deadline, kpi_goal, kpi_target_value, kpi_current_value,
        kpi_unit, kpi_progress_percentage, assigned_by_id, assigned_to_id,
        created_by_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        taskId,
        tenantId,
        title,
        description || null,
        type,
        category,
        status || 'Not Started',
        start_date,
        hard_deadline,
        kpi_goal || null,
        kpi_target_value || null,
        0, // kpi_current_value
        kpi_unit || null,
        kpi_progress_percentage,
        type === 'Assigned' ? userId : null, // assigned_by_id
        type === 'Assigned' ? assigned_to_id : null, // assigned_to_id
        userId, // created_by_id
        now,
        now,
      ]
    );

    // Create initial update record
    const updateId = generateId().replace('task_', 'update_');
    await db.query(
      `INSERT INTO task_updates (
        id, tenant_id, task_id, user_id, update_type, status_after, comment, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        updateId,
        tenantId,
        taskId,
        userId,
        'Check-in',
        status || 'Not Started',
        'Task created',
        now,
      ]
    );

    // If assigned task, send notification
    if (type === 'Assigned' && assigned_to_id) {
      const notificationService = getTaskNotificationService();
      await notificationService.notifyTaskAssigned(taskId, tenantId, assigned_to_id, userId);
    }

    // Fetch created task with user names
    const createdTasks = await db.query(
      `SELECT t.*, 
              u1.name as assigned_by_name,
              u2.name as assigned_to_name,
              u3.name as created_by_name
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_by_id = u1.id
       LEFT JOIN users u2 ON t.assigned_to_id = u2.id
       LEFT JOIN users u3 ON t.created_by_id = u3.id
       WHERE t.id = $1`,
      [taskId]
    );

    res.status(201).json(createdTasks[0]);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const userRole = (req as any).role || '';
    const taskId = req.params.id;

    // Check permissions
    const editCheck = await canEditTask(taskId, userId, userRole, tenantId, db);
    if (!editCheck.allowed) {
      return res.status(403).json({ error: editCheck.reason });
    }

    const {
      title,
      description,
      category,
      status,
      start_date,
      hard_deadline,
      kpi_goal,
      kpi_target_value,
      kpi_unit,
      assigned_to_id,
    } = req.body;

    // Get current task
    const currentTasks = await db.query(
      'SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2',
      [taskId, tenantId]
    );
    if (currentTasks.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const currentTask = currentTasks[0];

    // Employees can only update progress on assigned tasks (via check-in endpoint)
    if (userRole !== 'Admin' && currentTask.type === 'Assigned') {
      return res.status(403).json({ error: 'Use check-in endpoint to update assigned task progress' });
    }

    // Validate deadline if provided
    const finalStartDate = start_date || currentTask.start_date;
    const finalDeadline = hard_deadline || currentTask.hard_deadline;
    if (new Date(finalDeadline) < new Date(finalStartDate)) {
      return res.status(400).json({ error: 'Deadline must be after start date' });
    }

    // If updating assigned_to_id, verify user exists
    if (assigned_to_id && assigned_to_id !== currentTask.assigned_to_id) {
      const users = await db.query(
        'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
        [assigned_to_id, tenantId]
      );
      if (users.length === 0) {
        return res.status(400).json({ error: 'Invalid assigned_to_id' });
      }
    }

    // Calculate KPI progress if values changed
    let kpi_progress_percentage = currentTask.kpi_progress_percentage;
    if (kpi_target_value !== undefined && kpi_target_value > 0) {
      const currentValue = currentTask.kpi_current_value || 0;
      kpi_progress_percentage = Math.min(100, Math.max(0, (currentValue / kpi_target_value) * 100));
    }

    await db.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        category = COALESCE($3, category),
        status = COALESCE($4, status),
        start_date = COALESCE($5, start_date),
        hard_deadline = COALESCE($6, hard_deadline),
        kpi_goal = COALESCE($7, kpi_goal),
        kpi_target_value = COALESCE($8, kpi_target_value),
        kpi_unit = COALESCE($9, kpi_unit),
        kpi_progress_percentage = $10,
        assigned_to_id = CASE WHEN $11 IS NOT NULL THEN $11 ELSE assigned_to_id END,
        updated_at = NOW()
      WHERE id = $12 AND tenant_id = $13`,
      [
        title,
        description,
        category,
        status,
        start_date,
        hard_deadline,
        kpi_goal,
        kpi_target_value,
        kpi_unit,
        kpi_progress_percentage,
        assigned_to_id,
        taskId,
        tenantId,
      ]
    );

    // Create update record if status changed
    if (status && status !== currentTask.status) {
      const updateId = generateId().replace('task_', 'update_');
      await db.query(
        `INSERT INTO task_updates (
          id, tenant_id, task_id, user_id, update_type, status_before, status_after, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          updateId,
          tenantId,
          taskId,
          userId,
          'Status Change',
          currentTask.status,
          status,
        ]
      );

      // If task completed, recalculate performance score
      if (status === 'Completed' && currentTask.status !== 'Completed') {
        const performanceService = getTaskPerformanceService();
        await performanceService.onTaskCompleted(taskId, tenantId).catch((err) => {
          console.error('Error recalculating performance score:', err);
        });
      }
    }

    // If assigned_to_id changed, send notification
    if (assigned_to_id && assigned_to_id !== currentTask.assigned_to_id) {
      const notificationService = getTaskNotificationService();
      await notificationService.notifyTaskAssigned(taskId, tenantId, assigned_to_id, userId);
    }

    // Fetch updated task
    const updatedTasks = await db.query(
      `SELECT t.*, 
              u1.name as assigned_by_name,
              u2.name as assigned_to_name,
              u3.name as created_by_name
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_by_id = u1.id
       LEFT JOIN users u2 ON t.assigned_to_id = u2.id
       LEFT JOIN users u3 ON t.created_by_id = u3.id
       WHERE t.id = $1`,
      [taskId]
    );

    res.json(updatedTasks[0]);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Check-in to task (update progress)
router.post('/:id/check-in', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const userRole = (req as any).role || '';
    const taskId = req.params.id;
    const { status, kpi_current_value, comment } = req.body;

    // Get task
    const tasks = await db.query(
      'SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2',
      [taskId, tenantId]
    );
    if (tasks.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = tasks[0];

    // Check access
    if (userRole !== 'Admin') {
      if (task.type === 'Personal' && task.created_by_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (task.type === 'Assigned' && task.assigned_to_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const updateId = generateId().replace('task_', 'update_');
    const now = new Date().toISOString();

    // Update KPI progress if provided
    let kpi_progress_percentage = task.kpi_progress_percentage;
    let kpi_value_before = task.kpi_current_value;
    let kpi_value_after = task.kpi_current_value;

    if (kpi_current_value !== undefined) {
      kpi_value_after = kpi_current_value;
      if (task.kpi_target_value && task.kpi_target_value > 0) {
        kpi_progress_percentage = Math.min(100, Math.max(0, (kpi_current_value / task.kpi_target_value) * 100));
      }
    }

    // Update task
    await db.query(
      `UPDATE tasks SET
        status = COALESCE($1, status),
        kpi_current_value = COALESCE($2, kpi_current_value),
        kpi_progress_percentage = $3,
        updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5`,
      [status, kpi_current_value, kpi_progress_percentage, taskId, tenantId]
    );

    // Create update record
    await db.query(
      `INSERT INTO task_updates (
        id, tenant_id, task_id, user_id, update_type,
        status_before, status_after,
        kpi_value_before, kpi_value_after,
        comment, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        updateId,
        tenantId,
        taskId,
        userId,
        'Check-in',
        task.status,
        status || task.status,
        kpi_value_before,
        kpi_value_after,
        comment || null,
        now,
      ]
    );

    // If task completed, recalculate performance score
    if (status === 'Completed' && task.status !== 'Completed') {
      const performanceService = getTaskPerformanceService();
      await performanceService.onTaskCompleted(taskId, tenantId).catch((err) => {
        console.error('Error recalculating performance score:', err);
      });
    }

    // Fetch updated task
    const updatedTasks = await db.query(
      `SELECT t.*, 
              u1.name as assigned_by_name,
              u2.name as assigned_to_name,
              u3.name as created_by_name
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_by_id = u1.id
       LEFT JOIN users u2 ON t.assigned_to_id = u2.id
       LEFT JOIN users u3 ON t.created_by_id = u3.id
       WHERE t.id = $1`,
      [taskId]
    );

    res.json(updatedTasks[0]);
  } catch (error) {
    console.error('Error checking in to task:', error);
    res.status(500).json({ error: 'Failed to check in to task' });
  }
});

// Delete task
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const userRole = (req as any).role || '';
    const taskId = req.params.id;

    // Check permissions
    const deleteCheck = await canDeleteTask(taskId, userId, userRole, tenantId, db);
    if (!deleteCheck.allowed) {
      return res.status(403).json({ error: deleteCheck.reason });
    }

    await db.query('DELETE FROM tasks WHERE id = $1 AND tenant_id = $2', [taskId, tenantId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Get tasks for calendar view
router.get('/calendar/events', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const userRole = (req as any).role || '';
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date query parameters are required' });
    }

    let query = '';
    let params: any[] = [tenantId, start_date, end_date];

    if (userRole === 'Admin') {
      query = `
        SELECT id, title, type, status, start_date, hard_deadline, category
        FROM tasks
        WHERE tenant_id = $1
          AND (start_date <= $3 AND hard_deadline >= $2)
        ORDER BY start_date ASC
      `;
    } else {
      query = `
        SELECT id, title, type, status, start_date, hard_deadline, category
        FROM tasks
        WHERE tenant_id = $1
          AND (type = 'Personal' AND created_by_id = $4 OR type = 'Assigned' AND assigned_to_id = $4)
          AND (start_date <= $3 AND hard_deadline >= $2)
        ORDER BY start_date ASC
      `;
      params.push(userId);
    }

    const tasks = await db.query(query, params);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching calendar tasks:', error);
    res.status(500).json({ error: 'Failed to fetch calendar tasks' });
  }
});

// Get team ranking/leaderboard (Admin only)
router.get('/performance/leaderboard', adminOnlyMiddleware(), async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const { period_start, period_end } = req.query;

    if (!period_start || !period_end) {
      return res.status(400).json({ error: 'period_start and period_end query parameters are required' });
    }

    const scores = await db.query(
      `SELECT tps.*, u.name as user_name, u.username
       FROM task_performance_scores tps
       JOIN users u ON tps.user_id = u.id
       WHERE tps.tenant_id = $1
         AND tps.period_start = $2
         AND tps.period_end = $3
       ORDER BY tps.performance_score DESC`,
      [tenantId, period_start, period_end]
    );

    res.json(scores);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get performance config (Admin only)
router.get('/performance/config', adminOnlyMiddleware(), async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;

    const configs = await db.query(
      'SELECT * FROM task_performance_config WHERE tenant_id = $1',
      [tenantId]
    );

    if (configs.length === 0) {
      // Return default config
      return res.json({
        id: 'default',
        tenant_id: tenantId,
        completion_rate_weight: 0.33,
        deadline_adherence_weight: 0.33,
        kpi_achievement_weight: 0.34,
        updated_at: new Date().toISOString(),
      });
    }

    res.json(configs[0]);
  } catch (error) {
    console.error('Error fetching performance config:', error);
    res.status(500).json({ error: 'Failed to fetch performance config' });
  }
});

// Update performance config (Admin only)
router.put('/performance/config', adminOnlyMiddleware(), async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const { completion_rate_weight, deadline_adherence_weight, kpi_achievement_weight } = req.body;

    // Validate weights sum to 1.0
    const sum = (completion_rate_weight || 0) + (deadline_adherence_weight || 0) + (kpi_achievement_weight || 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      return res.status(400).json({ error: 'Weights must sum to 1.0' });
    }

    // Check if config exists
    const existing = await db.query(
      'SELECT id FROM task_performance_config WHERE tenant_id = $1',
      [tenantId]
    );

    if (existing.length === 0) {
      // Create new config
      const configId = generateId().replace('task_', 'config_');
      await db.query(
        `INSERT INTO task_performance_config (
          id, tenant_id, completion_rate_weight, deadline_adherence_weight,
          kpi_achievement_weight, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [configId, tenantId, completion_rate_weight, deadline_adherence_weight, kpi_achievement_weight]
      );
      res.json({ success: true, id: configId });
    } else {
      // Update existing config
      await db.query(
        `UPDATE task_performance_config SET
          completion_rate_weight = $1,
          deadline_adherence_weight = $2,
          kpi_achievement_weight = $3,
          updated_at = NOW()
        WHERE tenant_id = $4`,
        [completion_rate_weight, deadline_adherence_weight, kpi_achievement_weight, tenantId]
      );
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Error updating performance config:', error);
    res.status(500).json({ error: 'Failed to update performance config' });
  }
});

export default router;
