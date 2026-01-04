import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all projects
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const projects = await db.query(
      'SELECT * FROM projects WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
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
      'SELECT * FROM projects WHERE id = $1 AND tenant_id = $2',
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
        const updateResult = await client.query(
          `UPDATE projects 
           SET name = $1, description = $2, color = $3, status = $4, 
               pm_config = $5, installment_config = $6, updated_at = NOW()
           WHERE id = $7 AND tenant_id = $8
           RETURNING *`,
          [
            project.name,
            project.description || null,
            project.color || null,
            project.status || null,
            project.pmConfig ? JSON.stringify(project.pmConfig) : null,
            project.installmentConfig ? JSON.stringify(project.installmentConfig) : null,
            projectId,
            req.tenantId
          ]
        );
        return updateResult.rows[0];
      } else {
        // Create new project
        console.log('➕ POST /projects - Creating new project:', projectId);
        const insertResult = await client.query(
          `INSERT INTO projects (
            id, tenant_id, name, description, color, status, pm_config, installment_config, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          RETURNING *`,
          [
            projectId,
            req.tenantId,
            project.name,
            project.description || null,
            project.color || null,
            project.status || null,
            project.pmConfig ? JSON.stringify(project.pmConfig) : null,
            project.installmentConfig ? JSON.stringify(project.installmentConfig) : null
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
    const result = await db.query(
      `UPDATE projects 
       SET name = $1, description = $2, color = $3, status = $4, 
           pm_config = $5, installment_config = $6, updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8
       RETURNING *`,
      [
        project.name,
        project.description || null,
        project.color || null,
        project.status || null,
        project.pmConfig ? JSON.stringify(project.pmConfig) : null,
        project.installmentConfig ? JSON.stringify(project.installmentConfig) : null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
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
      'DELETE FROM projects WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;

