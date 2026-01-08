import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all tasks
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { completed } = req.query;
    
    let query = 'SELECT * FROM tasks WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    
    if (completed !== undefined) {
      query += ' AND completed = $2';
      params.push(completed === 'true');
    }
    
    query += ' ORDER BY created_at DESC';
    
    const tasks = await db.query(query, params);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET task by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tasks = await db.query(
      'SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (tasks.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(tasks[0]);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST create/update task (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const task = req.body;
    
    // Validate required fields
    if (!task.text) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Task text is required'
      });
    }
    
    // Generate ID if not provided
    const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if task exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2',
      [taskId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO tasks (
        id, tenant_id, user_id, text, completed, priority, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 
                COALESCE((SELECT created_at FROM tasks WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        text = EXCLUDED.text,
        completed = EXCLUDED.completed,
        priority = EXCLUDED.priority,
        user_id = EXCLUDED.user_id,
        updated_at = NOW()
      RETURNING *`,
      [
        taskId,
        req.tenantId,
        req.user?.userId || null,
        task.text,
        task.completed || false,
        task.priority || 'medium'
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.TASK_UPDATED : WS_EVENTS.TASK_CREATED, {
      task: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating task:', error);
    res.status(500).json({ 
      error: 'Failed to create/update task',
      message: error.message || 'Internal server error'
    });
  }
});

// DELETE task
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM tasks WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.TASK_DELETED, {
      taskId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
