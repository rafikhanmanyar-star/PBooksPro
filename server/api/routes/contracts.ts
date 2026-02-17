import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all contracts
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, projectId, vendorId } = req.query;

    let query = 'SELECT * FROM contracts WHERE tenant_id = $1 AND deleted_at IS NULL';
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
    if (vendorId) {
      query += ` AND vendor_id = $${paramIndex++}`;
      params.push(vendorId);
    }

    query += ' ORDER BY start_date DESC';

    const contracts = await db.query(query, params);
    res.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// GET contract by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const contracts = await db.query(
      'SELECT * FROM contracts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.tenantId]
    );

    if (contracts.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    res.json(contracts[0]);
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

// POST create/update contract (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const contract = req.body;

    // Validate required fields
    if (!contract.contractNumber || !contract.name) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Contract number and name are required'
      });
    }

    // Generate ID if not provided
    const contractId = contract.id || `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if contract with this ID already exists and belongs to a different tenant
    if (contract.id) {
      const existingContract = await db.query(
        'SELECT tenant_id FROM contracts WHERE id = $1',
        [contractId]
      );

      if (existingContract.length > 0 && existingContract[0].tenant_id !== req.tenantId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'A contract with this ID already exists in another organization'
        });
      }
    }

    // Check if contract exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id, version FROM contracts WHERE id = $1 AND tenant_id = $2',
      [contractId, req.tenantId]
    );
    const isUpdate = existing.length > 0;

    // Optimistic locking check for POST update
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    const serverVersion = isUpdate ? existing[0].version : null;
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO contracts (
        id, tenant_id, contract_number, name, project_id, vendor_id, total_amount,
        area, rate, start_date, end_date, status, category_ids,
        expense_category_items, terms_and_conditions, payment_terms,
        description, document_path, document_id, user_id, created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                COALESCE((SELECT created_at FROM contracts WHERE id = $1), NOW()), NOW(), 1)
      ON CONFLICT (id) 
      DO UPDATE SET
        contract_number = EXCLUDED.contract_number,
        name = EXCLUDED.name,
        project_id = EXCLUDED.project_id,
        vendor_id = EXCLUDED.vendor_id,
        total_amount = EXCLUDED.total_amount,
        area = EXCLUDED.area,
        rate = EXCLUDED.rate,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        status = EXCLUDED.status,
        category_ids = EXCLUDED.category_ids,
        expense_category_items = EXCLUDED.expense_category_items,
        terms_and_conditions = EXCLUDED.terms_and_conditions,
        payment_terms = EXCLUDED.payment_terms,
        description = EXCLUDED.description,
        document_path = EXCLUDED.document_path,
        document_id = EXCLUDED.document_id,
        user_id = EXCLUDED.user_id,
        updated_at = NOW(),
        version = COALESCE(contracts.version, 1) + 1,
        deleted_at = NULL
      WHERE contracts.tenant_id = $2 AND (contracts.version = $21 OR contracts.version IS NULL)
      RETURNING *`,
      [
        contractId,
        req.tenantId,
        contract.contractNumber,
        contract.name,
        contract.projectId,
        contract.vendorId,
        contract.totalAmount,
        contract.area || null,
        contract.rate || null,
        contract.startDate,
        contract.endDate,
        contract.status,
        JSON.stringify(contract.categoryIds || []),
        contract.expenseCategoryItems ? JSON.stringify(contract.expenseCategoryItems) : null,
        contract.termsAndConditions || null,
        contract.paymentTerms || null,
        contract.description || null,
        contract.documentPath || null,
        contract.documentId || null,
        req.user?.userId || null,
        serverVersion
      ]
    );
    const saved = result[0];

    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      emitToTenant(req.tenantId!, WS_EVENTS.CONTRACT_UPDATED, {
        contract: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      emitToTenant(req.tenantId!, WS_EVENTS.CONTRACT_CREATED, {
        contract: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }

    res.status(isUpdate ? 200 : 201).json(saved);
  } catch (error: any) {
    console.error('Error creating/updating contract:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Contract number already exists' });
    }
    res.status(500).json({ error: 'Failed to save contract' });
  }
});

// PUT update contract
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const contract = req.body;
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE contracts 
      SET contract_number = $1, name = $2, project_id = $3, vendor_id = $4,
          total_amount = $5, area = $6, rate = $7, start_date = $8, end_date = $9,
          status = $10, category_ids = $11, expense_category_items = $12,
          terms_and_conditions = $13, payment_terms = $14, description = $15,
          document_path = $16, document_id = $17, user_id = $18, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $19 AND tenant_id = $20
    `;
    const queryParams: any[] = [
      contract.contractNumber,
      contract.name,
      contract.projectId,
      contract.vendorId,
      contract.totalAmount,
      contract.area || null,
      contract.rate || null,
      contract.startDate,
      contract.endDate,
      contract.status,
      JSON.stringify(contract.categoryIds || []),
      contract.expenseCategoryItems ? JSON.stringify(contract.expenseCategoryItems) : null,
      contract.termsAndConditions || null,
      contract.paymentTerms || null,
      contract.description || null,
      contract.documentPath || null,
      contract.documentId || null,
      req.user?.userId || null,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      updateQuery += ` AND version = $21`;
      queryParams.push(clientVersion);
    }

    updateQuery += ` RETURNING *`;
    const result = await db.query(updateQuery, queryParams);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.CONTRACT_UPDATED, {
      contract: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating contract:', error);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

// DELETE contract
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE contracts SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.CONTRACT_DELETED, {
      contractId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting contract:', error);
    res.status(500).json({ error: 'Failed to delete contract' });
  }
});

export default router;

