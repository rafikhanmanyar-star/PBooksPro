import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// ==========================================
// 1. Task Items
// ==========================================

// GET all tasks
router.get('/', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const tasks = await db.query(
            'SELECT t.*, u.full_name as owner_name, i.title as initiative_name FROM task_items t ' +
            'LEFT JOIN users u ON t.owner_id = u.id ' +
            'LEFT JOIN task_initiatives i ON t.initiative_id = i.id ' +
            'WHERE t.tenant_id = $1 AND t.deleted_at IS NULL ORDER BY t.due_date ASC',
            [req.tenantId]
        );
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
            'SELECT t.*, u.full_name as owner_name, i.title as initiative_name FROM task_items t ' +
            'LEFT JOIN users u ON t.owner_id = u.id ' +
            'LEFT JOIN task_initiatives i ON t.initiative_id = i.id ' +
            'WHERE t.id = $1 AND t.tenant_id = $2 AND t.deleted_at IS NULL',
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

// POST create task
router.post('/', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const task = req.body;
        const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const existing = await db.query(
            'SELECT id, version FROM task_items WHERE id = $1 AND tenant_id = $2',
            [taskId, req.tenantId]
        );
        const isUpdate = existing.length > 0;

        // Optimistic locking check
        const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
        const serverVersion = isUpdate ? existing[0].version : null;
        if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
            return res.status(409).json({
                error: 'Version conflict',
                message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
                serverVersion,
            });
        }

        const result = await db.query(
            `INSERT INTO task_items (
                id, tenant_id, title, description, initiative_id, owner_id, 
                status, priority, start_date, due_date, estimated_hours, created_by, version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                initiative_id = EXCLUDED.initiative_id,
                owner_id = EXCLUDED.owner_id,
                status = EXCLUDED.status,
                priority = EXCLUDED.priority,
                start_date = EXCLUDED.start_date,
                due_date = EXCLUDED.due_date,
                estimated_hours = EXCLUDED.estimated_hours,
                updated_at = NOW(),
                version = COALESCE(task_items.version, 1) + 1,
                deleted_at = NULL
            WHERE task_items.tenant_id = $2 AND (task_items.version = $13 OR task_items.version IS NULL)
            RETURNING *`,
            [
                taskId,
                req.tenantId,
                task.title,
                task.description || null,
                task.initiative_id || null,
                task.owner_id || null,
                task.status || 'Not Started',
                task.priority || 'Medium',
                task.start_date || null,
                task.due_date,
                task.estimated_hours || 0,
                req.user?.userId || null,
                serverVersion
            ]
        );

        emitToTenant(req.tenantId!, WS_EVENTS.TASK_CREATED, {
            task: result[0],
            userId: req.user?.userId
        });

        res.status(201).json(result[0]);
    } catch (error: any) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Failed to create task', message: error.message });
    }
});

// PUT update task
router.put('/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const task = req.body;
        const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

        let updateQuery = `
                UPDATE task_items SET 
                    title = $1, description = $2, initiative_id = $3, owner_id = $4,
                    status = $5, priority = $6, start_date = $7, due_date = $8,
                    estimated_hours = $9, actual_hours = $10, progress_percentage = $11,
                    updated_at = NOW(),
                    version = COALESCE(version, 1) + 1
                WHERE id = $12 AND tenant_id = $13
            `;
        const queryParams: any[] = [
            task.title,
            task.description || null,
            task.initiative_id || null,
            task.owner_id || null,
            task.status,
            task.priority,
            task.start_date || null,
            task.due_date,
            task.estimated_hours || 0,
            task.actual_hours || 0,
            task.progress_percentage || 0,
            req.params.id,
            req.tenantId
        ];

        if (clientVersion != null) {
            updateQuery += ` AND version = $14`;
            queryParams.push(clientVersion);
        }

        updateQuery += ` RETURNING *`;
        const result = await db.query(updateQuery, queryParams);

        if (result.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        emitToTenant(req.tenantId!, WS_EVENTS.TASK_UPDATED, {
            task: result[0],
            userId: req.user?.userId
        });

        res.json(result[0]);
    } catch (error: any) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task', message: error.message });
    }
});

// DELETE task
router.delete('/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const result = await db.query(
            `UPDATE task_items SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 
             WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );

        if (result.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        emitToTenant(req.tenantId!, WS_EVENTS.TASK_UPDATED, {
            taskId: req.params.id,
            deleted: true,
            userId: req.user?.userId
        });

        res.json({ success: true, id: req.params.id });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ==========================================
// 2. Initiatives
// ==========================================

// GET all initiatives
router.get('/initiatives/list', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const initiatives = await db.query(
            'SELECT i.*, u.full_name as owner_name FROM task_initiatives i ' +
            'LEFT JOIN users u ON i.owner_id = u.id ' +
            'WHERE i.tenant_id = $1 AND i.deleted_at IS NULL ORDER BY i.created_at DESC',
            [req.tenantId]
        );
        res.json(initiatives);
    } catch (error) {
        console.error('Error fetching initiatives:', error);
        res.status(500).json({ error: 'Failed to fetch initiatives' });
    }
});

// DELETE initiative
router.delete('/initiatives/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const result = await db.query(
            `UPDATE task_initiatives SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 
             WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );

        if (result.length === 0) {
            return res.status(404).json({ error: 'Initiative not found' });
        }

        res.json({ success: true, id: req.params.id });
    } catch (error) {
        console.error('Error deleting initiative:', error);
        res.status(500).json({ error: 'Failed to delete initiative' });
    }
});

// ==========================================
// 3. OKRs / Objectives
// ==========================================

// GET objective by ID (includes Key Results)
router.get('/objectives/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const objectives = await db.query(
            'SELECT o.*, u.full_name as owner_name FROM task_objectives o ' +
            'LEFT JOIN users u ON o.owner_id = u.id ' +
            'WHERE o.id = $1 AND o.tenant_id = $2 AND o.deleted_at IS NULL',
            [req.params.id, req.tenantId]
        );

        if (objectives.length === 0) {
            return res.status(404).json({ error: 'Objective not found' });
        }

        const objective = objectives[0];

        // Fetch Key Results for this objective
        const keyResults = await db.query(
            'SELECT kr.*, u.full_name as owner_name FROM task_key_results kr ' +
            'LEFT JOIN users u ON kr.owner_id = u.id ' +
            'WHERE kr.objective_id = $1 AND kr.tenant_id = $2 AND kr.deleted_at IS NULL ORDER BY kr.created_at ASC',
            [objective.id, req.tenantId]
        );

        objective.key_results = keyResults;
        res.json(objective);
    } catch (error) {
        console.error('Error fetching objective:', error);
        res.status(500).json({ error: 'Failed to fetch objective' });
    }
});

// POST create objective
router.post('/objectives', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const obj = req.body;
        const result = await db.query(
            `INSERT INTO task_objectives (
                tenant_id, title, description, owner_id, parent_objective_id,
                type, level, status, visibility, confidence_score, created_by, version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                req.tenantId,
                obj.title,
                obj.description || null,
                obj.owner_id || null,
                obj.parent_objective_id || null,
                obj.type || 'Operational',
                obj.level || 'Company',
                obj.status || 'Not Started',
                obj.visibility || 'Public',
                obj.confidence_score || 70,
                req.user?.userId || null,
                1
            ]
        );

        emitToTenant(req.tenantId!, WS_EVENTS.OBJECTIVE_CREATED, {
            objective: result[0],
            userId: req.user?.userId
        });

        res.status(201).json(result[0]);
    } catch (error: any) {
        console.error('Error creating objective:', error);
        res.status(500).json({ error: 'Failed to create objective', message: error.message });
    }
});

// DELETE objective
router.delete('/objectives/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const result = await db.query(
            `UPDATE task_objectives SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 
             WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );

        if (result.length === 0) {
            return res.status(404).json({ error: 'Objective not found' });
        }

        emitToTenant(req.tenantId!, WS_EVENTS.OBJECTIVE_UPDATED, {
            objectiveId: req.params.id,
            deleted: true,
            userId: req.user?.userId
        });

        res.json({ success: true, id: req.params.id });
    } catch (error) {
        console.error('Error deleting objective:', error);
        res.status(500).json({ error: 'Failed to delete objective' });
    }
});

// POST create key result
router.post('/key-results', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const kr = req.body;
        const result = await db.query(
            `INSERT INTO task_key_results (
                tenant_id, objective_id, title, owner_id, metric_type,
                start_value, target_value, current_value, weight, status, due_date, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                req.tenantId,
                kr.objective_id,
                kr.title,
                kr.owner_id || null,
                kr.metric_type || 'Number',
                kr.start_value || 0,
                kr.target_value,
                kr.current_value || 0,
                kr.weight || 1,
                kr.status || 'Not Started',
                kr.due_date || null,
                req.user?.userId || null
            ]
        );

        // Recalculate objective progress when KR is added
        // (In a real app, this could be a trigger or a separate service call)

        res.status(201).json(result[0]);
    } catch (error: any) {
        console.error('Error creating key result:', error);
        res.status(500).json({ error: 'Failed to create key result', message: error.message });
    }
});

// PUT update key result (Check-in)
router.put('/key-results/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const kr = req.body;
        const oldKrQuery = await db.query('SELECT * FROM task_key_results WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
        if (oldKrQuery.length === 0) return res.status(404).json({ error: 'Key result not found' });
        const oldKr = oldKrQuery[0];

        // Calculate progress percentage
        let progress = 0;
        const target = parseFloat(kr.target_value || oldKr.target_value);
        const start = parseFloat(kr.start_value || oldKr.start_value);
        const current = parseFloat(kr.current_value);

        if (target !== start) {
            progress = ((current - start) / (target - start)) * 100;
        }
        progress = Math.min(Math.max(progress, 0), 100);

        const result = await db.query(
            `UPDATE task_key_results SET 
                current_value = $1, progress_percentage = $2, status = $3, 
                confidence_score = $4, updated_at = NOW()
            WHERE id = $5 AND tenant_id = $6
            RETURNING *`,
            [
                current,
                progress,
                kr.status || oldKr.status,
                kr.confidence_score !== undefined ? kr.confidence_score : oldKr.confidence_score,
                req.params.id,
                req.tenantId
            ]
        );

        // Log the update
        await db.query(
            `INSERT INTO task_okr_updates (
                tenant_id, entity_type, entity_id, previous_value, new_value,
                previous_progress, new_progress, comment, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                req.tenantId,
                'KeyResult',
                req.params.id,
                oldKr.current_value,
                current,
                oldKr.progress_percentage,
                progress,
                kr.comment || 'Progress update',
                req.user?.userId || null
            ]
        );

        // Update parent objective progress
        const objective_id = oldKr.objective_id;
        const allKrs = await db.query('SELECT progress_percentage, weight FROM task_key_results WHERE objective_id = $1', [objective_id]);
        let totalWeight = 0;
        let weightedProgress = 0;
        allKrs.forEach((k: any) => {
            const w = k.weight || 1;
            totalWeight += w;
            weightedProgress += (k.progress_percentage || 0) * w;
        });
        const objProgress = totalWeight > 0 ? weightedProgress / totalWeight : 0;

        await db.query(
            'UPDATE task_objectives SET progress_percentage = $1, updated_at = NOW() WHERE id = $2',
            [objProgress, objective_id]
        );

        emitToTenant(req.tenantId!, WS_EVENTS.OBJECTIVE_UPDATED, {
            objectiveId: objective_id,
            userId: req.user?.userId
        });

        res.json(result[0]);
    } catch (error: any) {
        console.error('Error updating key result:', error);
        res.status(500).json({ error: 'Failed to update key result', message: error.message });
    }
});

// DELETE key result
router.delete('/key-results/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const result = await db.query(
            `UPDATE task_key_results SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 
             WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );

        if (result.length === 0) {
            return res.status(404).json({ error: 'Key result not found' });
        }

        res.json({ success: true, id: req.params.id });
    } catch (error) {
        console.error('Error deleting key result:', error);
        res.status(500).json({ error: 'Failed to delete key result' });
    }
});

// ==========================================
// 4. Reports
// ==========================================

router.get('/reports/team-summary', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const tenantId = req.tenantId;

        // 1. Overall Stats
        const stats = await db.query(
            `SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'Completed') as completed,
                COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress,
                COUNT(*) FILTER (WHERE status = 'Blocked') as blocked,
                COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'Completed') as overdue
            FROM task_items WHERE tenant_id = $1`,
            [tenantId]
        );

        // 2. Productivity by User
        const teamProductivity = await db.query(
            `SELECT 
                u.id as user_id,
                u.full_name as name,
                COUNT(t.id) as total_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'Completed') as completed_tasks
            FROM users u
            JOIN task_items t ON u.id = t.owner_id
            WHERE t.tenant_id = $1
            GROUP BY u.id, u.full_name
            ORDER BY completed_tasks DESC`,
            [tenantId]
        );

        // 3. Status Distribution
        const statusDistribution = await db.query(
            `SELECT status as name, COUNT(*) as value
            FROM task_items
            WHERE tenant_id = $1
            GROUP BY status`,
            [tenantId]
        );

        // 4. Completion Trend (Last 7 days)
        const trend = await db.query(
            `SELECT 
                TO_CHAR(updated_at, 'YYYY-MM-DD') as date,
                COUNT(*) as count
            FROM task_items
            WHERE tenant_id = $1 AND status = 'Completed' 
            AND updated_at >= NOW() - INTERVAL '7 days'
            GROUP BY TO_CHAR(updated_at, 'YYYY-MM-DD')
            ORDER BY date ASC`,
            [tenantId]
        );

        res.json({
            summary: stats[0],
            teamProductivity,
            statusDistribution,
            trend
        });
    } catch (error) {
        console.error('Error fetching team report:', error);
        res.status(500).json({ error: 'Failed to fetch team report' });
    }
});

// ==========================================
// 5. Task Roles & Permissions
// ==========================================

// GET all task roles
router.get('/roles/list', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const roles = await db.query(
            `SELECT r.*, COUNT(ur.user_id) as users_count 
             FROM task_roles r 
             LEFT JOIN task_user_roles ur ON r.id = ur.role_id 
             WHERE r.tenant_id = $1 
             GROUP BY r.id 
             ORDER BY r.name ASC`,
            [req.tenantId]
        );
        res.json(roles);
    } catch (error) {
        console.error('Error fetching task roles:', error);
        res.status(500).json({ error: 'Failed to fetch task roles' });
    }
});

// POST create task role
router.post('/roles', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const { name, description, is_system, parent_role_id, permission_ids } = req.body;

        const role = await db.transaction(async (client) => {
            const result = await client.query(
                `INSERT INTO task_roles (tenant_id, name, description, is_system, parent_role_id)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [req.tenantId, name, description, is_system || false, parent_role_id || null]
            );
            const newRole = result.rows[0];

            if (permission_ids && permission_ids.length > 0) {
                const values = permission_ids.map((pId: string) => `('${newRole.id}', '${pId}')`).join(',');
                await client.query(`INSERT INTO task_role_permissions (role_id, permission_id) VALUES ${values}`);
            }

            return newRole;
        });

        res.status(201).json(role);
    } catch (error: any) {
        console.error('Error creating task role:', error);
        res.status(500).json({ error: 'Failed to create task role', message: error.message });
    }
});

// PUT update task role
router.put('/roles/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const { name, description, permission_ids } = req.body;

        await db.transaction(async (client) => {
            // Update role info
            await client.query(
                `UPDATE task_roles SET name = $1, description = $2, updated_at = NOW()
                 WHERE id = $3 AND tenant_id = $4`,
                [name, description, req.params.id, req.tenantId]
            );

            // Update permissions if provided
            if (permission_ids) {
                await client.query(
                    'DELETE FROM task_role_permissions WHERE role_id = $1',
                    [req.params.id]
                );

                if (permission_ids.length > 0) {
                    const values = permission_ids.map((pId: string) => `('${req.params.id}', '${pId}')`).join(',');
                    await client.query(`INSERT INTO task_role_permissions (role_id, permission_id) VALUES ${values}`);
                }
            }
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Error updating task role:', error);
        res.status(500).json({ error: 'Failed to update task role', message: error.message });
    }
});

// DELETE task role
router.delete('/roles/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const result = await db.query(
            'DELETE FROM task_roles WHERE id = $1 AND tenant_id = $2 AND is_system = FALSE RETURNING *',
            [req.params.id, req.tenantId]
        );

        if (result.length === 0) {
            return res.status(404).json({ error: 'Role not found or is a system role' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting task role:', error);
        res.status(500).json({ error: 'Failed to delete task role' });
    }
});

// GET all permissions
router.get('/permissions/list', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const permissions = await db.query('SELECT * FROM task_permissions ORDER BY module, action');
        res.json(permissions);
    } catch (error) {
        console.error('Error fetching permissions:', error);
        res.status(500).json({ error: 'Failed to fetch permissions' });
    }
});

// GET roles for a user
router.get('/user-roles/:userId', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const roles = await db.query(
            `SELECT r.* FROM task_roles r
             JOIN task_user_roles ur ON r.id = ur.role_id
             WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
            [req.params.userId, req.tenantId]
        );
        res.json(roles);
    } catch (error) {
        console.error('Error fetching user roles:', error);
        res.status(500).json({ error: 'Failed to fetch user roles' });
    }
});

// POST update user roles
router.post('/user-roles/:userId', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const { role_ids } = req.body; // Array of role IDs

        await db.transaction(async (client) => {
            // Remove existing assignments
            await client.query(
                'DELETE FROM task_user_roles WHERE user_id = $1 AND tenant_id = $2',
                [req.params.userId, req.tenantId]
            );

            // Add new assignments
            if (role_ids && role_ids.length > 0) {
                const values = role_ids.map((rId: string) => `('${req.params.userId}', '${rId}', '${req.tenantId}')`).join(',');
                await client.query(`INSERT INTO task_user_roles (user_id, role_id, tenant_id) VALUES ${values}`);
            }
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Error updating user roles:', error);
        res.status(500).json({ error: 'Failed to update user roles', message: error.message });
    }
});

// GET permissions for a role
router.get('/roles/:id/permissions', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const permissions = await db.query(
            `SELECT p.* FROM task_permissions p
             JOIN task_role_permissions rp ON p.id = rp.permission_id
             JOIN task_roles r ON rp.role_id = r.id
             WHERE r.id = $1 AND r.tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        res.json(permissions);
    } catch (error) {
        console.error('Error fetching role permissions:', error);
        res.status(500).json({ error: 'Failed to fetch role permissions' });
    }
});

// POST update role permissions
router.post('/roles/:id/permissions', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const { permission_ids } = req.body; // Array of permission IDs

        await db.transaction(async (client) => {
            // Remove existing permissions
            await client.query(
                'DELETE FROM task_role_permissions WHERE role_id = $1',
                [req.params.id]
            );

            // Add new permissions
            if (permission_ids && permission_ids.length > 0) {
                const values = permission_ids.map((pId: string) => `('${req.params.id}', '${pId}')`).join(',');
                await client.query(`INSERT INTO task_role_permissions (role_id, permission_id) VALUES ${values}`);
            }
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Error updating role permissions:', error);
        res.status(500).json({ error: 'Failed to update role permissions', message: error.message });
    }
});

export default router;
