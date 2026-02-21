import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';
import { clearCache } from '../../middleware/cacheMiddleware.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all projects
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { limit, offset } = req.query;
    const effectiveLimit = Math.min(parseInt(limit as string) || 10000, 10000);
    let projQuery = 'SELECT * FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name LIMIT $2';
    const projParams: any[] = [req.tenantId, effectiveLimit];
    if (offset) {
      projQuery += ' OFFSET $3';
      projParams.push(parseInt(offset as string) || 0);
    }
    const projects = await db.query(projQuery, projParams);
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET project by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const projects = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.tenantId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(projects[0]);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST create/update project (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    console.log('📥 POST /projects - Request received:', {
      tenantId: req.tenantId,
      userId: req.user?.userId,
      projectData: {
        id: req.body.id,
        name: req.body.name,
        hasDescription: !!req.body.description
      }
    });

    const db = getDb();
    const project = req.body;

    // Generate ID if not provided
    const projectId = project.id || `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /projects - Using project ID:', projectId);

    // Track if this is an update operation
    let isUpdate = false;

    // Use transaction for data integrity (upsert behavior)
    const result = await db.transaction(async (client) => {
      // Check if project with this ID already exists
      const existing = await client.query(
        'SELECT * FROM projects WHERE id = $1 AND tenant_id = $2',
        [projectId, req.tenantId]
      );

      if (existing.rows.length > 0) {
        // Update existing project
        console.log('🔄 POST /projects - Updating existing project:', projectId);
        isUpdate = true;
        // Optimistic locking check for POST update
        const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
        const serverVersion = existing.rows[0].version;
        if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
          throw {
            code: 'VERSION_CONFLICT',
            message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
            status: 409
          };
        }

        const updateResult = await client.query(
          `UPDATE projects 
           SET name = $1, description = $2, color = $3, status = $4, 
               pm_config = $5, installment_config = $6, user_id = $7, updated_at = NOW(),
               version = COALESCE(version, 1) + 1,
               deleted_at = NULL
           WHERE id = $8 AND tenant_id = $9 AND (version = $10 OR version IS NULL)
           RETURNING *`,
          [
            project.name,
            project.description || null,
            project.color || null,
            project.status || null,
            project.pmConfig ? JSON.stringify(project.pmConfig) : null,
            project.installmentConfig ? JSON.stringify(project.installmentConfig) : null,
            req.user?.userId || null,
            projectId,
            req.tenantId,
            serverVersion
          ]
        );
        return updateResult.rows[0];
      } else {
        // Create new project
        console.log('➕ POST /projects - Creating new project:', projectId);
        const insertResult = await client.query(
          `INSERT INTO projects (
            id, tenant_id, name, description, color, status, pm_config, installment_config, user_id, 
            created_at, updated_at, version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), 1)
          RETURNING *`,
          [
            projectId,
            req.tenantId,
            project.name,
            project.description || null,
            project.color || null,
            project.status || null,
            project.pmConfig ? JSON.stringify(project.pmConfig) : null,
            project.installmentConfig ? JSON.stringify(project.installmentConfig) : null,
            req.user?.userId || null
          ]
        );
        return insertResult.rows[0];
      }
    });

    if (!result) {
      console.error('❌ POST /projects - Transaction returned no result');
      return res.status(500).json({ error: 'Failed to create/update project' });
    }

    console.log('✅ POST /projects - Project saved successfully:', {
      id: result.id,
      name: result.name,
      tenantId: req.tenantId
    });

    clearCache(`__bulk__${req.tenantId}`);

    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.PROJECT_UPDATED : WS_EVENTS.PROJECT_CREATED, {
      project: result,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('❌ POST /projects - Error:', {
      error: error,
      errorMessage: error.message,
      errorCode: error.code,
      tenantId: req.tenantId,
      projectId: req.body?.id
    });

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        error: 'Duplicate project',
        message: 'A project with this ID already exists'
      });
    }

    res.status(500).json({
      error: 'Failed to create/update project',
      message: error.message || 'Internal server error'
    });
  }
});

// PUT update project
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const project = req.body;
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE projects 
      SET name = $1, description = $2, color = $3, status = $4, 
          pm_config = $5, installment_config = $6, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $7 AND tenant_id = $8
    `;
    const queryParams: any[] = [
      project.name,
      project.description || null,
      project.color || null,
      project.status || null,
      project.pmConfig ? JSON.stringify(project.pmConfig) : null,
      project.installmentConfig ? JSON.stringify(project.installmentConfig) : null,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      updateQuery += ` AND version = $9`;
      queryParams.push(clientVersion);
    }

    updateQuery += ` RETURNING *`;
    const result = await db.query(updateQuery, queryParams);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    clearCache(`__bulk__${req.tenantId}`);

    emitToTenant(req.tenantId!, WS_EVENTS.PROJECT_UPDATED, {
      project: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE project
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE projects SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    clearCache(`__bulk__${req.tenantId}`);

    emitToTenant(req.tenantId!, WS_EVENTS.PROJECT_DELETED, {
      projectId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;

