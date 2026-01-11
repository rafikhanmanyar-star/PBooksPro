import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// Helper function to transform database row to API response format
// IMPORTANT: There are TWO different "tenant ID" concepts in the system:
// 1. Organization tenant_id (for multi-tenancy) - used for data isolation (NOT transformed here)
// 2. Contact tenant ID (tenant contact person in rental management) - stored as contact_id in DB, exposed as tenantId in API
// This function maps contact_id (database column) to tenantId (API response field)
function transformRentalAgreement(row: any): any {
  const transformed = { ...row };
  if (row.contact_id !== undefined) {
    transformed.tenantId = row.contact_id;
    // Keep contact_id for backward compatibility, but tenantId is the primary field for contact tenant ID
  }
  return transformed;
}

// GET all rental agreements
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, propertyId } = req.query;
    
    let query = 'SELECT * FROM rental_agreements WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (propertyId) {
      query += ` AND property_id = $${paramIndex++}`;
      params.push(propertyId);
    }

    query += ' ORDER BY start_date DESC';

    const agreements = await db.query(query, params);
    // Transform contact_id to tenantId for API response
    const transformedAgreements = agreements.map(transformRentalAgreement);
    res.json(transformedAgreements);
  } catch (error) {
    console.error('Error fetching rental agreements:', error);
    res.status(500).json({ error: 'Failed to fetch rental agreements' });
  }
});

// GET rental agreement by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const agreements = await db.query(
      'SELECT * FROM rental_agreements WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (agreements.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }
    
    // Transform contact_id to tenantId for API response
    const transformed = transformRentalAgreement(agreements[0]);
    res.json(transformed);
  } catch (error) {
    console.error('Error fetching rental agreement:', error);
    res.status(500).json({ error: 'Failed to fetch rental agreement' });
  }
});

// POST create/update rental agreement (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const agreement = req.body;
    
    // Validate required fields
    if (!agreement.agreementNumber) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Agreement number is required'
      });
    }
    
    // Generate ID if not provided
    const agreementId = agreement.id || `rental_agreement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if agreement with this ID already exists and belongs to a different tenant
    if (agreement.id) {
      const existingAgreement = await db.query(
        'SELECT tenant_id FROM rental_agreements WHERE id = $1',
        [agreementId]
      );
      
      if (existingAgreement.length > 0 && existingAgreement[0].tenant_id !== req.tenantId) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'A rental agreement with this ID already exists in another organization'
        });
      }
    }
    
    // Check if agreement exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id FROM rental_agreements WHERE id = $1 AND tenant_id = $2',
      [agreementId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO rental_agreements (
        id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date,
        monthly_rent, rent_due_date, status, description, security_deposit,
        broker_id, broker_fee, owner_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                COALESCE((SELECT created_at FROM rental_agreements WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        agreement_number = EXCLUDED.agreement_number,
        contact_id = EXCLUDED.contact_id,
        property_id = EXCLUDED.property_id,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        monthly_rent = EXCLUDED.monthly_rent,
        rent_due_date = EXCLUDED.rent_due_date,
        status = EXCLUDED.status,
        description = EXCLUDED.description,
        security_deposit = EXCLUDED.security_deposit,
        broker_id = EXCLUDED.broker_id,
        broker_fee = EXCLUDED.broker_fee,
        owner_id = EXCLUDED.owner_id,
        updated_at = NOW()
      RETURNING *`,
      [
        agreementId,
        req.tenantId, // Organization tenant_id (for multi-tenancy isolation)
        agreement.agreementNumber,
        agreement.tenantId || null, // Contact tenant ID (the tenant contact person, stored as contact_id in DB)
        agreement.propertyId,
        agreement.startDate,
        agreement.endDate,
        agreement.monthlyRent,
        agreement.rentDueDate,
        agreement.status,
        agreement.description || null,
        agreement.securityDeposit || null,
        agreement.brokerId || null,
        agreement.brokerFee || null,
        agreement.ownerId || null
      ]
    );
    const saved = result[0];
    
    // Transform contact_id to tenantId for API response
    const transformed = transformRentalAgreement(saved);
    
    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
        agreement: transformed,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_CREATED, {
        agreement: transformed,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }
    
    res.status(isUpdate ? 200 : 201).json(transformed);
  } catch (error: any) {
    console.error('Error creating/updating rental agreement:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Agreement number already exists' });
    }
    res.status(500).json({ error: 'Failed to save rental agreement' });
  }
});

// PUT update rental agreement
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const agreement = req.body;
    const result = await db.query(
      `UPDATE rental_agreements 
       SET agreement_number = $1, contact_id = $2, property_id = $3, start_date = $4, end_date = $5,
           monthly_rent = $6, rent_due_date = $7, status = $8, description = $9,
           security_deposit = $10, broker_id = $11, broker_fee = $12, owner_id = $13,
           updated_at = NOW()
       WHERE id = $14 AND tenant_id = $15
       RETURNING *`,
      [
        agreement.agreementNumber,
        agreement.tenantId || null, // Contact tenant ID (the tenant contact person, stored as contact_id in DB)
        agreement.propertyId,
        agreement.startDate,
        agreement.endDate,
        agreement.monthlyRent,
        agreement.rentDueDate,
        agreement.status,
        agreement.description || null,
        agreement.securityDeposit || null,
        agreement.brokerId || null,
        agreement.brokerFee || null,
        agreement.ownerId || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }
    
    // Transform contact_id to tenantId for API response
    const transformed = transformRentalAgreement(result[0]);
    
    emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
      agreement: transformed,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(transformed);
  } catch (error) {
    console.error('Error updating rental agreement:', error);
    res.status(500).json({ error: 'Failed to update rental agreement' });
  }
});

// DELETE rental agreement
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM rental_agreements WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_DELETED, {
      agreementId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting rental agreement:', error);
    res.status(500).json({ error: 'Failed to delete rental agreement' });
  }
});

export default router;

