import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

/**
 * Transform database result (snake_case) to API response format (camelCase)
 */
function transformRentalAgreement(dbResult: any): any {
  if (!dbResult) return dbResult;
  
  return {
    id: dbResult.id,
    agreementNumber: dbResult.agreement_number || dbResult.agreementNumber,
    contactId: dbResult.contact_id || dbResult.contactId, // Contact ID (the tenant contact person)
    propertyId: dbResult.property_id || dbResult.propertyId,
    startDate: dbResult.start_date || dbResult.startDate,
    endDate: dbResult.end_date || dbResult.endDate,
    monthlyRent: dbResult.monthly_rent !== undefined ? dbResult.monthly_rent : dbResult.monthlyRent,
    rentDueDate: dbResult.rent_due_date !== undefined ? dbResult.rent_due_date : dbResult.rentDueDate,
    status: dbResult.status,
    description: dbResult.description,
    securityDeposit: dbResult.security_deposit !== undefined ? dbResult.security_deposit : dbResult.securityDeposit,
    brokerId: dbResult.broker_id || dbResult.brokerId,
    brokerFee: dbResult.broker_fee !== undefined ? dbResult.broker_fee : dbResult.brokerFee,
    ownerId: dbResult.owner_id || dbResult.ownerId,
    orgId: dbResult.org_id || dbResult.orgId,
    userId: dbResult.user_id || dbResult.userId,
    createdAt: dbResult.created_at || dbResult.createdAt,
    updatedAt: dbResult.updated_at || dbResult.updatedAt
  };
}

// GET all rental agreements
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, propertyId } = req.query;
    
    let query = 'SELECT * FROM rental_agreements WHERE org_id = $1';
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

    // Log query for debugging (remove in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Rental Agreements] Query:', query);
      console.log('[Rental Agreements] Params:', params);
    }

    const agreements = await db.query(query, params);
    // Transform database results to camelCase for API response
    const transformedAgreements = agreements.map(transformRentalAgreement);
    res.json(transformedAgreements);
  } catch (error: any) {
    console.error('Error fetching rental agreements:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      query: 'SELECT * FROM rental_agreements WHERE org_id = $1',
      tenantId: req.tenantId
    });
    res.status(500).json({ 
      error: 'Failed to fetch rental agreements',
      message: error?.message || 'Unknown error',
      code: error?.code
    });
  }
});

// GET rental agreement by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const agreements = await db.query(
      'SELECT * FROM rental_agreements WHERE id = $1 AND org_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (agreements.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }
    
    // Transform database result to camelCase for API response
    res.json(transformRentalAgreement(agreements[0]));
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
    
    console.log('📝 POST /rental-agreements - Received request:', {
      tenantId: req.tenantId,
      userId: req.user?.userId,
      agreementId: agreement.id,
      agreementNumber: agreement.agreementNumber,
      contactId: agreement.contactId,
      propertyId: agreement.propertyId,
      hasBody: !!agreement
    });
    
    // Validate required fields
    if (!agreement.agreementNumber) {
      console.log('❌ POST /rental-agreements - Validation failed: agreementNumber is required');
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
        'SELECT org_id FROM rental_agreements WHERE id = $1',
        [agreementId]
      );
      
      if (existingAgreement.length > 0 && existingAgreement[0].org_id !== req.tenantId) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'A rental agreement with this ID already exists in another organization'
        });
      }
    }
    
    // Check if agreement exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id, status FROM rental_agreements WHERE id = $1 AND org_id = $2',
      [agreementId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // If updating, check if invoices exist and if status is not Renewed
    if (isUpdate) {
      const existingAgreement = existing[0];
      const hasInvoices = await db.query(
        'SELECT COUNT(*) as count FROM invoices WHERE agreement_id = $1 AND tenant_id = $2',
        [agreementId, req.tenantId]
      );
      
      const invoiceCount = parseInt(hasInvoices[0]?.count || '0', 10);
      const isChangingStatusToRenewed = agreement.status === 'Renewed' && existingAgreement.status !== 'Renewed';
      
      if (invoiceCount > 0 && existingAgreement.status !== 'Renewed') {
        // Only allow changing status to Renewed, prevent other field changes
        if (isChangingStatusToRenewed) {
          // Allow only status update, preserve all other fields from existing agreement
          const result = await db.query(
            `UPDATE rental_agreements 
             SET status = $1, updated_at = NOW()
             WHERE id = $2 AND org_id = $3
             RETURNING *`,
            ['Renewed', agreementId, req.tenantId]
          );
          
          if (result.length === 0) {
            return res.status(404).json({ error: 'Rental agreement not found' });
          }
          
          const transformedResult = transformRentalAgreement(result[0]);
          emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
            agreement: transformedResult,
            userId: req.user?.userId,
            username: req.user?.username,
          });
          
          return res.status(200).json(transformedResult);
        } else {
          return res.status(400).json({
            error: 'Cannot edit agreement',
            message: 'This agreement has invoices associated with it. To modify the agreement, you must first change its status to "Renewed".'
          });
        }
      }
    }
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO rental_agreements (
        id, org_id, agreement_number, contact_id, property_id, start_date, end_date,
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
        req.tenantId, // Organization org_id (for multi-tenancy isolation)
        agreement.agreementNumber,
        agreement.contactId || null, // Contact ID (the tenant contact person)
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
    const transformedSaved = transformRentalAgreement(saved);
    
    console.log('✅ POST /rental-agreements - Agreement saved successfully:', {
      id: saved.id,
      agreementNumber: saved.agreement_number,
      tenantId: req.tenantId,
      isUpdate
    });
    
    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      console.log('📡 POST /rental-agreements - Emitting RENTAL_AGREEMENT_UPDATED event');
      emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
        agreement: transformedSaved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      console.log('📡 POST /rental-agreements - Emitting RENTAL_AGREEMENT_CREATED event');
      emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_CREATED, {
        agreement: transformedSaved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }
    
    res.status(isUpdate ? 200 : 201).json(transformedSaved);
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
    const agreementId = req.params.id;
    
    // Check if agreement exists and get its current status
    const existing = await db.query(
      'SELECT id, status FROM rental_agreements WHERE id = $1 AND org_id = $2',
      [agreementId, req.tenantId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }
    
    const existingAgreement = existing[0];
    
    // Check if invoices exist and if status is not Renewed
    const hasInvoices = await db.query(
      'SELECT COUNT(*) as count FROM invoices WHERE agreement_id = $1 AND tenant_id = $2',
      [agreementId, req.tenantId]
    );
    
    const invoiceCount = parseInt(hasInvoices[0]?.count || '0', 10);
    const isChangingStatusToRenewed = agreement.status === 'Renewed' && existingAgreement.status !== 'Renewed';
    
    if (invoiceCount > 0 && existingAgreement.status !== 'Renewed') {
      // Only allow changing status to Renewed, prevent other field changes
      if (isChangingStatusToRenewed) {
        // Allow only status update, preserve all other fields from existing agreement
        const result = await db.query(
          `UPDATE rental_agreements 
           SET status = $1, updated_at = NOW()
           WHERE id = $2 AND org_id = $3
           RETURNING *`,
          ['Renewed', agreementId, req.tenantId]
        );
        
        if (result.length === 0) {
          return res.status(404).json({ error: 'Rental agreement not found' });
        }
        
        const transformedResult = transformRentalAgreement(result[0]);
        emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
          agreement: transformedResult,
          userId: req.user?.userId,
          username: req.user?.username,
        });
        
        return res.json(transformedResult);
      } else {
        return res.status(400).json({
          error: 'Cannot edit agreement',
          message: 'This agreement has invoices associated with it. To modify the agreement, you must first change its status to "Renewed".'
        });
      }
    }
    
    const result = await db.query(
      `UPDATE rental_agreements 
       SET agreement_number = $1, contact_id = $2, property_id = $3, start_date = $4, end_date = $5,
           monthly_rent = $6, rent_due_date = $7, status = $8, description = $9,
           security_deposit = $10, broker_id = $11, broker_fee = $12, owner_id = $13,
           updated_at = NOW()
       WHERE id = $14 AND org_id = $15
       RETURNING *`,
      [
        agreement.agreementNumber,
        agreement.contactId || null, // Contact ID (the tenant contact person)
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
        agreementId,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Rental agreement not found' });
    }
    
    const transformedResult = transformRentalAgreement(result[0]);
    
    emitToTenant(req.tenantId!, WS_EVENTS.RENTAL_AGREEMENT_UPDATED, {
      agreement: transformedResult,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(transformedResult);
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
      'DELETE FROM rental_agreements WHERE id = $1 AND org_id = $2 RETURNING id',
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

