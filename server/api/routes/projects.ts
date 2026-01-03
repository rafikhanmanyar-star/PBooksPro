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

// POST create project
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const project = req.body;
    const result = await db.query(
      `INSERT INTO projects (
        id, tenant_id, name, description, color, status, pm_config, installment_config
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        project.id,
        req.tenantId,
        project.name,
        project.description || null,
        project.color || null,
        project.status || null,
        project.pmConfig ? JSON.stringify(project.pmConfig) : null,
        project.installmentConfig ? JSON.stringify(project.installmentConfig) : null
      ]
    );
    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
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

