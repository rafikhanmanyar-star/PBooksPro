import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all project agreements
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, projectId, clientId } = req.query;
    
    let query = 'SELECT * FROM project_agreements WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (projectId) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }
    if (clientId) {
      query += ` AND client_id = $${paramIndex++}`;
      params.push(clientId);
    }

    query += ' ORDER BY issue_date DESC';

    const agreements = await db.query(query, params);
    res.json(agreements);
  } catch (error) {
    console.error('Error fetching project agreements:', error);
    res.status(500).json({ error: 'Failed to fetch project agreements' });
  }
});

// GET project agreement by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const agreements = await db.query(
      'SELECT * FROM project_agreements WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (agreements.length === 0) {
      return res.status(404).json({ error: 'Project agreement not found' });
    }
    
    res.json(agreements[0]);
  } catch (error) {
    console.error('Error fetching project agreement:', error);
    res.status(500).json({ error: 'Failed to fetch project agreement' });
  }
});

// POST create project agreement
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const agreement = req.body;
    const result = await db.query(
      `INSERT INTO project_agreements (
        id, tenant_id, agreement_number, client_id, project_id, unit_ids,
        list_price, customer_discount, floor_discount, lump_sum_discount,
        misc_discount, selling_price, rebate_amount, rebate_broker_id,
        issue_date, description, status, cancellation_details,
        list_price_category_id, customer_discount_category_id,
        floor_discount_category_id, lump_sum_discount_category_id,
        misc_discount_category_id, selling_price_category_id, rebate_category_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *`,
      [
        agreement.id,
        req.tenantId,
        agreement.agreementNumber,
        agreement.clientId,
        agreement.projectId,
        JSON.stringify(agreement.unitIds || []),
        agreement.listPrice,
        agreement.customerDiscount || 0,
        agreement.floorDiscount || 0,
        agreement.lumpSumDiscount || 0,
        agreement.miscDiscount || 0,
        agreement.sellingPrice,
        agreement.rebateAmount || null,
        agreement.rebateBrokerId || null,
        agreement.issueDate,
        agreement.description || null,
        agreement.status,
        agreement.cancellationDetails ? JSON.stringify(agreement.cancellationDetails) : null,
        agreement.listPriceCategoryId || null,
        agreement.customerDiscountCategoryId || null,
        agreement.floorDiscountCategoryId || null,
        agreement.lumpSumDiscountCategoryId || null,
        agreement.miscDiscountCategoryId || null,
        agreement.sellingPriceCategoryId || null,
        agreement.rebateCategoryId || null
      ]
    );
    const saved = result[0];
    emitToTenant(req.tenantId!, WS_EVENTS.PROJECT_AGREEMENT_CREATED, {
      agreement: saved,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    res.status(201).json(saved);
  } catch (error: any) {
    console.error('Error creating project agreement:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Agreement number already exists' });
    }
    res.status(500).json({ error: 'Failed to create project agreement' });
  }
});

// PUT update project agreement
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const agreement = req.body;
    const result = await db.query(
      `UPDATE project_agreements 
       SET agreement_number = $1, client_id = $2, project_id = $3, unit_ids = $4,
           list_price = $5, customer_discount = $6, floor_discount = $7,
           lump_sum_discount = $8, misc_discount = $9, selling_price = $10,
           rebate_amount = $11, rebate_broker_id = $12, issue_date = $13,
           description = $14, status = $15, cancellation_details = $16,
           list_price_category_id = $17, customer_discount_category_id = $18,
           floor_discount_category_id = $19, lump_sum_discount_category_id = $20,
           misc_discount_category_id = $21, selling_price_category_id = $22,
           rebate_category_id = $23, updated_at = NOW()
       WHERE id = $24 AND tenant_id = $25
       RETURNING *`,
      [
        agreement.agreementNumber,
        agreement.clientId,
        agreement.projectId,
        JSON.stringify(agreement.unitIds || []),
        agreement.listPrice,
        agreement.customerDiscount || 0,
        agreement.floorDiscount || 0,
        agreement.lumpSumDiscount || 0,
        agreement.miscDiscount || 0,
        agreement.sellingPrice,
        agreement.rebateAmount || null,
        agreement.rebateBrokerId || null,
        agreement.issueDate,
        agreement.description || null,
        agreement.status,
        agreement.cancellationDetails ? JSON.stringify(agreement.cancellationDetails) : null,
        agreement.listPriceCategoryId || null,
        agreement.customerDiscountCategoryId || null,
        agreement.floorDiscountCategoryId || null,
        agreement.lumpSumDiscountCategoryId || null,
        agreement.miscDiscountCategoryId || null,
        agreement.sellingPriceCategoryId || null,
        agreement.rebateCategoryId || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Project agreement not found' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.PROJECT_AGREEMENT_UPDATED, {
      agreement: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating project agreement:', error);
    res.status(500).json({ error: 'Failed to update project agreement' });
  }
});

// DELETE project agreement
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM project_agreements WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Project agreement not found' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.PROJECT_AGREEMENT_DELETED, {
      agreementId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project agreement:', error);
    res.status(500).json({ error: 'Failed to delete project agreement' });
  }
});

export default router;

